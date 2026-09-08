import Stripe from 'stripe';
import { User } from '../models/user_model';
import { Subscription } from '../models/subscription_model';
import { SubscriptionPlan } from '../models/subscription_plan_model';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export class StripeService {
  /**
   * Share of every booking payment that stays with the platform. The rest is
   * transferred to the provider's connected Stripe account.
   */
  static readonly PLATFORM_FEE_PERCENT = 0.015;

  /**
   * Amount (in the payment's smallest currency unit, e.g. cents) the platform
   * keeps as its application fee for a given charge amount (in the same unit).
   */
  static calculateApplicationFeeAmount(amountInSmallestUnit: number): number {
    return Math.round(amountInSmallestUnit * this.PLATFORM_FEE_PERCENT);
  }

  /**
   * Return a Stripe customer ID that's actually valid in the currently
   * configured Stripe account, creating a fresh one if needed. Guards
   * against stale `stripeCustomerId` values left over from a prior Stripe
   * account (e.g. a test-to-live or account migration) — see
   * STRIPE_ACCOUNT_MIGRATION_GUIDE.md — which would otherwise fail with a
   * "No such customer" error on every charge attempt.
   */
  static async getOrCreateValidCustomer(user: User): Promise<string> {
    if (user.stripeCustomerId) {
      try {
        const customer = await stripe.customers.retrieve(user.stripeCustomerId);
        if (!customer.deleted) {
          return user.stripeCustomerId;
        }
      } catch (error: any) {
        if (error?.code !== 'resource_missing') {
          throw error;
        }
        // Stale ID from a different Stripe account — fall through and
        // create a fresh customer below.
      }
    }

    return this.createCustomer(user);
  }

  /**
   * Create (or return the existing) Stripe Express account for a provider so
   * they can receive their share of booking payments directly.
   */
  static async createConnectAccount(user: User): Promise<string> {
    if (user.stripeConnectAccountId) {
      return user.stripeConnectAccountId;
    }

    try {
      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
        business_type: 'individual',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          userId: user.id,
        },
      });

      await user.update({ stripeConnectAccountId: account.id });

      return account.id;
    } catch (error) {
      console.error('Error creating Stripe Connect account:', error);
      throw new Error('Failed to create Stripe Connect account');
    }
  }

  /**
   * Generate a Stripe-hosted onboarding link for a provider's connected account.
   */
  static async createConnectOnboardingLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string
  ): Promise<string> {
    try {
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      return accountLink.url;
    } catch (error) {
      console.error('Error creating Stripe Connect onboarding link:', error);
      throw new Error('Failed to create Stripe Connect onboarding link');
    }
  }

  /**
   * Generate a login link into the provider's Stripe Express dashboard.
   */
  static async createConnectDashboardLink(accountId: string): Promise<string> {
    try {
      const loginLink = await stripe.accounts.createLoginLink(accountId);
      return loginLink.url;
    } catch (error) {
      console.error('Error creating Stripe Connect dashboard link:', error);
      throw new Error('Failed to create Stripe Connect dashboard link');
    }
  }

  /**
   * Fetch the live status of a provider's connected account from Stripe.
   */
  static async getConnectAccountStatus(accountId: string): Promise<{
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirementsDue: string[];
  }> {
    try {
      const account = await stripe.accounts.retrieve(accountId);

      return {
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        requirementsDue: account.requirements?.currently_due || [],
      };
    } catch (error) {
      console.error('Error fetching Stripe Connect account status:', error);
      throw new Error('Failed to fetch Stripe Connect account status');
    }
  }

  /**
   * Fetch the live status of a provider's connected account and persist it
   * onto their user row, so DB flags never drift from what Stripe reports.
   */
  static async syncConnectAccountStatus(user: User): Promise<void> {
    if (!user.stripeConnectAccountId) {
      return;
    }

    const status = await this.getConnectAccountStatus(user.stripeConnectAccountId);

    await user.update({
      stripeConnectChargesEnabled: status.chargesEnabled,
      stripeConnectPayoutsEnabled: status.payoutsEnabled,
      stripeConnectDetailsSubmitted: status.detailsSubmitted,
    });
  }


  /**
   * Create a Stripe customer for a user
   */
  static async createCustomer(user: User): Promise<string> {
    try {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        phone: user.phone || undefined,
        metadata: {
          userId: user.id,
          role: user.role,
        },
      });

      // Update user with Stripe customer ID
      await user.update({ stripeCustomerId: customer.id });
      
      return customer.id;
    } catch (error) {
      console.error('Error creating Stripe customer:', error);
      throw new Error('Failed to create customer');
    }
  }

  /**
   * Resolve a valid Stripe customer ID for a user.
   * Clears and recreates the customer when the stored ID is from a different Stripe account.
   */
  private static async resolveStripeCustomerId(user: User): Promise<string> {
    let customerId = user.stripeCustomerId;

    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
        return customerId;
      } catch (error: any) {
        const code = error?.code || error?.raw?.code;
        if (code !== 'resource_missing') {
          throw error;
        }

        console.warn(
          `Stale Stripe customer ${customerId} for user ${user.id}, creating a new customer`
        );
        await user.update({ stripeCustomerId: null });
        customerId = null;
      }
    }

    return this.createCustomer(user);
  }

  /**
   * Create a subscription for a user
   */
  static async createSubscription(
    userId: string,
    priceId: string,
    trialDays?: number
  ): Promise<Stripe.Subscription> {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const customerId = await this.resolveStripeCustomerId(user);

      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          userId: user.id,
        },
      };

      if (trialDays) {
        subscriptionParams.trial_period_days = trialDays;
      }

      const subscription = await stripe.subscriptions.create(subscriptionParams);

      return subscription;
    } catch (error: any) {
      console.error('Error creating subscription:', {
        userId,
        priceId,
        message: error?.message,
        code: error?.code || error?.raw?.code,
      });

      const stripeError = new Error(
        error?.raw?.message || error?.message || 'Failed to create subscription'
      ) as Error & { code?: string };
      stripeError.code = error?.code || error?.raw?.code;
      throw stripeError;
    }
  }

  /**
   * Cancel a subscription
   */
  static async cancelSubscription(subscriptionId: string, immediately = false): Promise<Stripe.Subscription> {
    try {
      const existing = await stripe.subscriptions.retrieve(subscriptionId);

      if (existing.status === 'canceled') {
        return existing;
      }

      if (!immediately && existing.cancel_at_period_end) {
        return existing;
      }

      if (immediately) {
        return await stripe.subscriptions.cancel(subscriptionId);
      }

      return await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (error: any) {
      console.error('Error canceling subscription:', {
        subscriptionId,
        immediately,
        message: error?.message,
        code: error?.code || error?.raw?.code,
      });

      const stripeError = new Error(
        error?.raw?.message || error?.message || 'Failed to cancel subscription'
      ) as Error & { code?: string };
      stripeError.code = error?.code || error?.raw?.code;
      throw stripeError;
    }
  }

  /**
   * Update subscription
   */
  static async updateSubscription(
    subscriptionId: string,
    newPriceId: string
  ): Promise<Stripe.Subscription> {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const currentItem = subscription.items.data[0];

      if (!currentItem) {
        throw new Error('Subscription has no billable items');
      }

      const currentPriceId = currentItem.price?.id;
      if (currentPriceId === newPriceId) {
        return subscription;
      }

      return await stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: currentItem.id,
            price: newPriceId,
          },
        ],
        proration_behavior: 'create_prorations',
      });
    } catch (error: any) {
      console.error('Error updating subscription:', {
        subscriptionId,
        newPriceId,
        message: error?.message,
        code: error?.code || error?.raw?.code,
      });

      const stripeError = new Error(
        error?.raw?.message || error?.message || 'Failed to update subscription'
      ) as Error & { code?: string };
      stripeError.code = error?.code || error?.raw?.code;
      throw stripeError;
    }
  }

  /**
   * Create a payment intent for one-time payments (appointments)
   */
  static async createPaymentIntent(
    amount: number,
    currency: string = 'usd',
    customerId?: string,
    metadata?: Record<string, string>,
    connect?: { accountId: string; applicationFeeAmount: number }
  ): Promise<Stripe.PaymentIntent> {
    try {
      const params: Stripe.PaymentIntentCreateParams = {
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        automatic_payment_methods: { enabled: true },
        metadata: metadata || {},
      };

      if (customerId) {
        params.customer = customerId;
      }

      if (connect) {
        // Destination charge: platform stays merchant of record, Stripe
        // automatically transfers (amount - applicationFeeAmount) to the
        // provider's connected account.
        params.transfer_data = { destination: connect.accountId };
        params.application_fee_amount = connect.applicationFeeAmount;
      }

      return await stripe.paymentIntents.create(params);
    } catch (error) {
      console.error('Error creating payment intent:', error);
      throw new Error('Failed to create payment intent');
    }
  }

  /**
   * Get subscription plans by role
   */
  static async getSubscriptionPlans(role: 'client' | 'solo' | 'suite'): Promise<SubscriptionPlan[]> {
    try {
      return await SubscriptionPlan.findAll({
        where: { userRole: role, isActive: true },
        order: [['price', 'ASC']],
      });
    } catch (error) {
      console.error('Error fetching subscription plans:', error);
      throw new Error('Failed to fetch subscription plans');
    }
  }

  /**
   * Handle webhook events
   */
  static async handleWebhook(event: Stripe.Event): Promise<void> {
    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
          break;
        
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;
        
        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;
        
        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        case 'account.updated':
          await this.handleConnectAccountUpdated(event.data.object as Stripe.Account);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      console.error('Error handling webhook:', error);
      throw error;
    }
  }

  /**
   * Pull the latest subscription state from Stripe and persist it locally.
   */
  static async syncSubscriptionFromStripe(stripeSubscriptionId: string): Promise<void> {
    const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    await this.handleSubscriptionUpdate(stripeSubscription);
  }

  /**
   * Read the billing interval (month/year) from a Stripe subscription.
   */
  static async getSubscriptionBillingInterval(
    stripeSubscriptionId: string
  ): Promise<'month' | 'year'> {
    try {
      const stripeSubscription = await stripe.subscriptions.retrieve(
        stripeSubscriptionId
      );
      const interval =
        stripeSubscription.items.data[0]?.price?.recurring?.interval;
      return interval === 'year' ? 'year' : 'month';
    } catch (error) {
      console.error('Failed to read billing interval from Stripe:', error);
      return 'month';
    }
  }

  private static safeTimestampToDate(timestamp: number | null | undefined): Date | null {
    if (!timestamp || timestamp <= 0) return null;
    const date = new Date(timestamp * 1000);
    return isNaN(date.getTime()) ? null : date;
  }

  private static extractSubscriptionPeriod(stripeSubscription: Stripe.Subscription) {
    // As of newer Stripe API versions, current_period_start/end may live on the
    // subscription item rather than the top-level subscription object.
    const primaryItem = stripeSubscription.items.data[0] as Stripe.SubscriptionItem & {
      current_period_start?: number;
      current_period_end?: number;
    };

    return {
      currentPeriodStart:
        stripeSubscription.current_period_start ?? primaryItem?.current_period_start,
      currentPeriodEnd:
        stripeSubscription.current_period_end ?? primaryItem?.current_period_end,
    };
  }

  /**
   * Handle subscription updates
   */
  private static async handleSubscriptionUpdate(stripeSubscription: Stripe.Subscription): Promise<void> {
    try {
      console.log('Processing subscription webhook:', {
        subscriptionId: stripeSubscription.id,
        status: stripeSubscription.status,
        metadata: stripeSubscription.metadata
      });

      let userId = stripeSubscription.metadata.userId;

      // Find or create subscription record
      let subscription = await Subscription.findOne({
        where: { stripeSubscriptionId: stripeSubscription.id }
      });

      if (!userId && subscription) {
        userId = subscription.userId;
      }

      if (!userId) {
        console.log('No userId in subscription metadata, skipping');
        return;
      }

      const user = await User.findByPk(userId);
      if (!user) {
        console.log(`User not found for ID: ${userId}`);
        return;
      }

      const { currentPeriodStart, currentPeriodEnd } =
        this.extractSubscriptionPeriod(stripeSubscription);

      const existingMetadata =
        subscription?.metadata &&
        typeof subscription.metadata === 'object' &&
        !Array.isArray(subscription.metadata)
          ? (subscription.metadata as Record<string, unknown>)
          : {};

      const stripeCanceledAt = stripeSubscription.canceled_at
        ? this.safeTimestampToDate(stripeSubscription.canceled_at)?.toISOString()
        : undefined;

      const subscriptionData = {
        userId,
        stripeSubscriptionId: stripeSubscription.id,
        status: stripeSubscription.status as any,
        currentPeriodStart: this.safeTimestampToDate(currentPeriodStart),
        currentPeriodEnd: this.safeTimestampToDate(currentPeriodEnd),
        trialEnd: this.safeTimestampToDate(stripeSubscription.trial_end),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        metadata: {
          ...existingMetadata,
          ...(stripeSubscription.metadata ?? {}),
          ...(stripeCanceledAt ? { stripeCanceledAt } : {}),
          ...(stripeSubscription.cancel_at_period_end &&
          !existingMetadata.cancelRequestedAt &&
          stripeCanceledAt
            ? { cancelRequestedAt: stripeCanceledAt }
            : {}),
        },
      };

      if (subscription) {
        console.log(`Updating existing subscription: ${subscription.id}`);
        await subscription.update(subscriptionData);
      } else {
        // Determine plan type based on price ID
        const priceId = stripeSubscription.items.data[0]?.price.id;
        console.log(`Creating new subscription for price ID: ${priceId}`);
        
        const planType = this.getPlanTypeFromPrice(priceId, user.role);
        console.log(`Determined plan type: ${planType}`);
        
        subscription = await Subscription.create({
          ...subscriptionData,
          planType,
        });
        console.log(`Created subscription: ${subscription.id}`);
      }

      // Update user's current subscription
      await user.update({ currentSubscriptionId: subscription.id });
      console.log(`Updated user ${userId} with subscription ${subscription.id}`);
    } catch (error) {
      console.error('Error in handleSubscriptionUpdate:', error);
      console.error('Subscription data:', stripeSubscription);
      throw error;
    }
  }

  /**
   * Handle subscription deletion
   */
  private static async handleSubscriptionDeleted(stripeSubscription: Stripe.Subscription): Promise<void> {
    const subscription = await Subscription.findOne({
      where: { stripeSubscriptionId: stripeSubscription.id }
    });

    if (subscription) {
      await subscription.update({ status: 'canceled' });
      
      // Update user to remove current subscription
      await User.update(
        { currentSubscriptionId: null },
        { where: { id: subscription.userId } }
      );
    }
  }

  /**
   * Handle successful payments
   */
  private static async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    // Renewals emit invoice.payment_succeeded — refresh period dates from Stripe
    // so "Renews on" stays accurate even if subscription.updated was missed.
    if (invoice.subscription) {
      await this.syncSubscriptionFromStripe(invoice.subscription as string);
    }
  }

  /**
   * Handle failed payments
   */
  private static async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    // Update subscription status
    if (invoice.subscription) {
      const subscription = await Subscription.findOne({
        where: { stripeSubscriptionId: invoice.subscription as string }
      });
      
      if (subscription) {
        await subscription.update({ status: 'past_due' });
      }
    }
  }

  /**
   * Handle connected account updates (Connect onboarding progress/status changes)
   */
  private static async handleConnectAccountUpdated(account: Stripe.Account): Promise<void> {
    const user = await User.findOne({ where: { stripeConnectAccountId: account.id } });

    if (!user) {
      console.log(`No user found for Connect account: ${account.id}`);
      return;
    }

    await user.update({
      stripeConnectChargesEnabled: account.charges_enabled,
      stripeConnectPayoutsEnabled: account.payouts_enabled,
      stripeConnectDetailsSubmitted: account.details_submitted,
    });

    console.log(`Synced Connect account status for user ${user.id}: charges_enabled=${account.charges_enabled}`);
  }

  /**
   * Map Stripe price ID to plan type
   */
  private static getPlanTypeFromPrice(priceId: string, userRole: string): any {
    const priceMap: Record<string, any> = {
      // Client plans
      [process.env.STRIPE_CLIENT_PREMIUM_PRICE_ID!]: 'client_premium',
      [process.env.STRIPE_CLIENT_PREMIUM_YEARLY_PRICE_ID!]: 'client_premium',
      // Solo plans
      [process.env.STRIPE_SOLO_BASIC_PRICE_ID!]: 'solo_basic',
      [process.env.STRIPE_SOLO_BASIC_YEARLY_PRICE_ID!]: 'solo_basic',
      [process.env.STRIPE_SOLO_PRO_PRICE_ID!]: 'solo_pro',
      [process.env.STRIPE_SOLO_PRO_YEARLY_PRICE_ID!]: 'solo_pro',
      [process.env.STRIPE_SOLO_PREMIUM_PRICE_ID!]: 'solo_premium',
      [process.env.STRIPE_SOLO_PREMIUM_YEARLY_PRICE_ID!]: 'solo_premium',
      // Suite plans
      [process.env.STRIPE_SUITE_STARTER_PRICE_ID!]: 'suite_starter',
      [process.env.STRIPE_SUITE_STARTER_YEARLY_PRICE_ID!]: 'suite_starter',
      [process.env.STRIPE_SUITE_GROWING_PRICE_ID!]: 'suite_growing',
      [process.env.STRIPE_SUITE_GROWING_YEARLY_PRICE_ID!]: 'suite_growing',
      [process.env.STRIPE_SUITE_PRO_PRICE_ID!]: 'suite_pro',
      [process.env.STRIPE_SUITE_PRO_YEARLY_PRICE_ID!]: 'suite_pro',
      [process.env.STRIPE_SUITE_ELITE_PRICE_ID!]: 'suite_elite',
      [process.env.STRIPE_SUITE_ELITE_YEARLY_PRICE_ID!]: 'suite_elite',
    };

    return priceMap[priceId] || `${userRole}_basic`;
  }
}
