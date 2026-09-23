import { Op } from 'sequelize';
import { User } from '../models/user_model';
import { Subscription } from '../models/subscription_model';
import { SubscriptionPlan } from '../models/subscription_plan_model';
import { Conversation } from '../models/conversation_model';
import { StripeService } from './stripe.service';
import { IapService, IapPlatform } from './iap.service';
import { resolveIapProduct } from './iap_product_map';

export class SubscriptionService {
  
  /**
   * Check if user has access to a feature based on their subscription
   */
  static async hasFeatureAccess(userId: string, feature: string): Promise<boolean> {
    try {
      const user = await User.findByPk(userId);
      if (!user) return false;

      const billedUserId =
        user.isTeamMember && user.teamOwnerId ? user.teamOwnerId : userId;

      const billedUser = await User.findByPk(billedUserId, {
        include: [{
          model: Subscription,
          as: 'subscriptions',
          where: { status: { [Op.in]: ['active', 'trialing'] } },
          required: false,
        }],
      });

      if (!billedUser) return false;

      const activeSubscription = billedUser.subscriptions?.[0];
      if (!activeSubscription) {
        return this.checkFreeAccess(billedUser, feature);
      }

      return this.checkPlanFeatures(activeSubscription.planType, feature);
    } catch (error) {
      console.error('Error checking feature access:', error);
      return false;
    }
  }

  /**
   * Get user's current subscription status and features
   */
  static async getUserSubscriptionInfo(userId: string) {
    try {
      const requestingUser = await User.findByPk(userId);
      if (!requestingUser) {
        throw new Error('User not found');
      }

      const isCoveredBySuiteOwner = !!(
        requestingUser.isTeamMember && requestingUser.teamOwnerId
      );
      const billedUserId = isCoveredBySuiteOwner
        ? requestingUser.teamOwnerId!
        : userId;

      const user = await User.findByPk(billedUserId, {
        include: [{
          model: Subscription,
          as: 'subscriptions',
          where: { status: { [Op.in]: ['active', 'trialing'] } },
          required: false,
        }],
      });

      if (!user) {
        throw new Error('User not found');
      }

      let activeSubscription = user.subscriptions?.[0];
      
      if (!activeSubscription) {
        return {
          ...this.getDefaultSubscriptionInfo(user),
          isCoveredBySuiteOwner,
        };
      }

      if (activeSubscription.stripeSubscriptionId) {
        const periodEnd = activeSubscription.currentPeriodEnd;
        const isPeriodStale =
          !periodEnd || periodEnd.getTime() < Date.now();
        const shouldSyncFromStripe =
          isPeriodStale &&
          activeSubscription.status === 'active' &&
          !activeSubscription.cancelAtPeriodEnd;

        if (shouldSyncFromStripe) {
          try {
            await StripeService.syncSubscriptionFromStripe(
              activeSubscription.stripeSubscriptionId
            );
            await activeSubscription.reload();
          } catch (syncError) {
            console.error('Failed to sync subscription from Stripe:', syncError);
          }
        }
      }

      // Expire local IAP subscriptions past period end (store is source of truth on renew)
      const meta = (activeSubscription.metadata || {}) as Record<string, unknown>;
      const isStoreSub = meta.store === 'ios' || meta.store === 'android';
      if (
        isStoreSub &&
        activeSubscription.currentPeriodEnd &&
        activeSubscription.currentPeriodEnd.getTime() < Date.now() &&
        !activeSubscription.cancelAtPeriodEnd
      ) {
        // Soft-expire; client should restore/repurchase. Keep row for history.
        // Do not auto-cancel aggressively — renewals extend period via verify-iap.
      }

      const features = this.getPlanFeatures(activeSubscription.planType);

      let billingInterval: 'month' | 'year' = 'month';
      if (typeof meta.billingInterval === 'string') {
        billingInterval = meta.billingInterval === 'year' ? 'year' : 'month';
      } else if (typeof meta.storeProductId === 'string') {
        const mapped = resolveIapProduct(meta.storeProductId);
        if (mapped) billingInterval = mapped.billingInterval;
      } else if (activeSubscription.stripeSubscriptionId) {
        billingInterval = await StripeService.getSubscriptionBillingInterval(
          activeSubscription.stripeSubscriptionId
        );
      }

      return {
        hasActiveSubscription: true,
        planType: activeSubscription.planType,
        status: activeSubscription.status,
        currentPeriodStart: activeSubscription.currentPeriodStart,
        currentPeriodEnd: activeSubscription.currentPeriodEnd,
        trialEnd: activeSubscription.trialEnd,
        cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd,
        canceledAt: this.resolveCanceledAt(activeSubscription),
        billingInterval,
        store: typeof meta.store === 'string' ? meta.store : null,
        isCoveredBySuiteOwner,
        features,
      };
    } catch (error) {
      console.error('Error getting subscription info:', error);
      throw error;
    }
  }

  /**
   * Activate / refresh subscription from an App Store or Play Store purchase.
   */
  static async verifyIapPurchase(input: {
    userId: string;
    platform: IapPlatform;
    productId: string;
    purchaseId: string;
    verificationData: string;
    transactionDate?: string;
    startedWithTrial?: boolean;
  }) {
    return IapService.verifyAndActivatePurchase(input);
  }

  /**
   * @deprecated Stripe subscription create is disabled. Use verifyIapPurchase.
   */
  static async createSubscription(userId: string, planType: string, trialDays?: number) {
    throw new Error(
      'Stripe subscriptions are disabled. Purchase via App Store / Google Play and call /subscriptions/verify-iap.'
    );
  }

  /**
   * @deprecated Plan changes happen by buying a new store product, then verify-iap.
   */
  static async updateSubscription(
    userId: string,
    newPlanType: string,
    billingInterval: 'month' | 'year' = 'month'
  ) {
    throw new Error(
      'Plan changes must be completed through the App Store / Google Play purchase sheet.'
    );
  }

  /**
   * Cancel user subscription
   */
  static async cancelSubscription(userId: string, immediately = false) {
    try {
      const requestingUser = await User.findByPk(userId);
      if (requestingUser?.isTeamMember) {
        throw new Error('Only the suite owner can cancel this subscription');
      }

      let subscription = await Subscription.findOne({
        where: {
          userId,
          status: { [Op.in]: ['active', 'trialing', 'past_due'] },
        },
        order: [['createdAt', 'DESC']],
      });

      if (!subscription) {
        const user = await User.findByPk(userId);
        if (user?.currentSubscriptionId) {
          subscription = await Subscription.findByPk(user.currentSubscriptionId);
        }
      }

      if (!subscription) {
        throw new Error('No active subscription found');
      }

      if (!subscription.stripeSubscriptionId) {
        await subscription.update({
          status: immediately ? 'canceled' : subscription.status,
          cancelAtPeriodEnd: !immediately,
          metadata: this.withCancelRequestedAt(subscription.metadata, !immediately),
        });

        if (immediately) {
          await User.update(
            { currentSubscriptionId: null },
            { where: { id: userId } }
          );
        }

        return { success: true };
      }

      try {
        await StripeService.cancelSubscription(
          subscription.stripeSubscriptionId,
          immediately
        );

        await StripeService.syncSubscriptionFromStripe(subscription.stripeSubscriptionId);

        if (!immediately) {
          await subscription.reload();
          await subscription.update({
            metadata: this.withCancelRequestedAt(subscription.metadata, true),
          });
        }

        if (immediately) {
          await User.update(
            { currentSubscriptionId: null },
            { where: { id: userId } }
          );
        }

        await subscription.reload();

        return {
          success: true,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        };
      } catch (stripeError: any) {
        const stripeCode = stripeError?.code || stripeError?.raw?.code;
        const stripeMessage = stripeError?.message || stripeError?.raw?.message;

        if (
          stripeCode === 'resource_missing' ||
          (typeof stripeMessage === 'string' &&
            stripeMessage.toLowerCase().includes('no such subscription'))
        ) {
          await subscription.update({
            status: 'canceled',
            cancelAtPeriodEnd: false,
          });
          await User.update(
            { currentSubscriptionId: null },
            { where: { id: userId } }
          );

          return { success: true, recovered: true };
        }

        throw stripeError;
      }
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw error;
    }
  }

  /**
   * Check client booking limits
   */
  static async canClientBook(userId: string, providerId?: string): Promise<{ canBook: boolean; reason?: string }> {
    try {
      const { ReferralService } = require('./referral.service');
      
      const user = await User.findByPk(userId, {
        include: [{
          model: Subscription,
          as: 'subscriptions',
          where: { status: { [Op.in]: ['active', 'trialing'] } },
          required: false,
        }],
      });

      if (!user) {
        return { canBook: false, reason: 'User not found' };
      }

      // For providers (solo/suite), they need active subscriptions
      if (user.role !== 'client') {
        const activeSubscription = user.subscriptions?.[0];
        if (!activeSubscription) {
          return { canBook: false, reason: 'Active subscription required for providers.' };
        }
        return { canBook: true };
      }

      // Client booking logic
      const activeSubscription = user.subscriptions?.[0];
      
      // Premium clients ($4.99/month) can book with any provider
      if (activeSubscription) {
        return { canBook: true };
      }

      const referredProviders = await ReferralService.getClientReferredProviders(userId);
      const hasReferrals = Array.isArray(referredProviders) && referredProviders.length > 0;

      // Referral access is limited to referred providers only — not a free
      // booking with anyone, and not broader discovery.
      if (hasReferrals) {
        if (providerId) {
          const isReferred = await ReferralService.isClientReferredToProvider(userId, providerId);
          if (isReferred) {
            return { canBook: true };
          }
          return {
            canBook: false,
            reason: 'Referral access is limited to your referred providers. Subscribe to premium ($4.99/month) to book others.',
          };
        }
        return { canBook: true };
      }

      // Free trial clients
      if (!user.freeBookingUsed) {
        return { canBook: true }; // Can use their one free booking
      }

      // If providerId is provided, check if client is referred to this provider
      if (providerId) {
        const isReferred = await ReferralService.isClientReferredToProvider(userId, providerId);
        if (isReferred) {
          return { canBook: true }; // Can book with referred providers for free
        }
      }

      // Free trial exhausted and no referral - need to upgrade
      return { 
        canBook: false, 
        reason: 'Free trial used. Subscribe to premium ($4.99/month) or get a referral code from this provider for free access.' 
      };
    } catch (error) {
      console.error('Error checking booking eligibility:', error);
      return { canBook: false, reason: 'Error checking eligibility' };
    }
  }

  /**
   * Check if client can message a provider
   */
  static async canClientMessage(
    clientId: string,
    providerId: string
  ): Promise<{ canMessage: boolean; reason?: string; requiresSubscription?: boolean }> {
    try {
      const { ReferralService } = require('./referral.service');
      
      const client = await User.findByPk(clientId, {
        include: [{
          model: Subscription,
          as: 'subscriptions',
          where: { status: { [Op.in]: ['active', 'trialing', 'past_due'] } },
          required: false,
        }],
      });

      if (!client) {
        return { canMessage: false, reason: 'Client not found' };
      }

      if (client.role !== 'client') {
        return { canMessage: false, reason: 'Only clients can send messages to providers' };
      }

      const activeSubscription = client.subscriptions?.[0];
      
      if (activeSubscription) {
        return { canMessage: true };
      }

      // No active subscription - check if provider is referred
      const isReferred = await ReferralService.isClientReferredToProvider(clientId, providerId);
      
      if (isReferred) {
        // Client can message referred providers for free (3-message rule still applies in chat)
        return { canMessage: true };
      }

      const referredProviders = await ReferralService.getClientReferredProviders(clientId);
      const hasReferrals = Array.isArray(referredProviders) && referredProviders.length > 0;
      if (hasReferrals) {
        return {
          canMessage: false,
          requiresSubscription: true,
          reason: 'Referral access is limited to your referred providers. Subscribe to premium ($4.99/month) to message others.',
        };
      }

      // Free trial clients can message up to 3 different providers
      // Count unique providers this client has conversations with
      const existingConversations = await Conversation.count({
        where: {
          clientId: clientId,
        },
        distinct: true,
        col: 'providerId'
      });

      // Check if this provider is already in conversations
      const existingConversation = await Conversation.findOne({
        where: {
          clientId: clientId,
          providerId: providerId,
        }
      });

      if (existingConversation) {
        // Already has conversation with this provider - can continue messaging
        return { canMessage: true };
      }

      // Check if client has reached the 3 provider limit
      if (existingConversations >= 3) {
        return { 
          canMessage: false,
          requiresSubscription: true,
          reason: 'You can only message 3 different providers with a free account. Subscribe to message unlimited providers or get a referral code from this provider.' 
        };
      }

      // Can start conversation with this provider (within 3 provider limit)
      return { canMessage: true };
    } catch (error) {
      console.error('Error checking messaging eligibility:', error);
      return { canMessage: false, reason: 'Error checking eligibility' };
    }
  }

  /**
   * Get client subscription tier
   */
  static async getClientSubscriptionTier(clientId: string): Promise<{
    tier: 'free_trial' | 'referral_plan' | 'paid_plan';
    hasActiveSubscription: boolean;
    hasReferrals: boolean;
  }> {
    try {
      const { ReferralService } = require('./referral.service');
      
      const client = await User.findByPk(clientId, {
        include: [{
          model: Subscription,
          as: 'subscriptions',
          where: { status: { [Op.in]: ['active', 'trialing'] } },
          required: false,
        }],
      });

      if (!client) {
        throw new Error('Client not found');
      }

      const hasActiveSubscription = client.subscriptions && client.subscriptions.length > 0;
      
      if (hasActiveSubscription) {
        return {
          tier: 'paid_plan',
          hasActiveSubscription: true,
          hasReferrals: false, // Not relevant for paid plan
        };
      }

      // Check if client has any active referrals
      const referredProviders = await ReferralService.getClientReferredProviders(clientId);
      const hasReferrals = referredProviders && referredProviders.length > 0;

      if (hasReferrals) {
        return {
          tier: 'referral_plan',
          hasActiveSubscription: false,
          hasReferrals: true,
        };
      }

      return {
        tier: 'free_trial',
        hasActiveSubscription: false,
        hasReferrals: false,
      };
    } catch (error) {
      console.error('Error getting client subscription tier:', error);
      return {
        tier: 'free_trial',
        hasActiveSubscription: false,
        hasReferrals: false,
      };
    }
  }

  /**
   * Check if client can access marketplace discovery
   */
  static async canClientDiscoverProviders(clientId: string): Promise<{ canDiscover: boolean; reason?: string }> {
    try {
      const client = await User.findByPk(clientId, {
        include: [{
          model: Subscription,
          as: 'subscriptions',
          where: { status: { [Op.in]: ['active', 'trialing'] } },
          required: false,
        }],
      });

      if (!client) {
        return { canDiscover: false, reason: 'Client not found' };
      }

      if (client.role !== 'client') {
        return { canDiscover: true }; // Providers can always discover
      }

      // Premium clients can discover any provider
      const activeSubscription = client.subscriptions?.[0];
      if (activeSubscription) {
        return { canDiscover: true };
      }

      const { ReferralService } = require('./referral.service');
      const referredProviders = await ReferralService.getClientReferredProviders(clientId);
      const hasReferrals = Array.isArray(referredProviders) && referredProviders.length > 0;
      if (hasReferrals) {
        return {
          canDiscover: false,
          reason: 'Referral access is limited to your referred providers. Subscribe to premium ($4.99/month) for full discovery.',
        };
      }

      // Free trial clients can discover until they use their free booking
      if (!client.freeBookingUsed) {
        return { canDiscover: true };
      }

      // After free booking is used, discovery is locked unless they have referrals or upgrade
      return { 
        canDiscover: false, 
        reason: 'Discovery locked after free trial. Subscribe to premium ($4.99/month) for full access or use referral codes for specific providers.' 
      };
    } catch (error) {
      console.error('Error checking discovery access:', error);
      return { canDiscover: false, reason: 'Error checking access' };
    }
  }

  /**
   * Check if client can access favorites feature
   */
  static async canClientUseFavorites(clientId: string): Promise<{ canUseFavorites: boolean; reason?: string }> {
    try {
      const client = await User.findByPk(clientId, {
        include: [{
          model: Subscription,
          as: 'subscriptions',
          where: { status: { [Op.in]: ['active', 'trialing'] } },
          required: false,
        }],
      });

      if (!client) {
        return { canUseFavorites: false, reason: 'Client not found' };
      }

      if (client.role !== 'client') {
        return { canUseFavorites: true }; // Providers can use favorites
      }

      // Only premium clients can use favorites
      const activeSubscription = client.subscriptions?.[0];
      if (activeSubscription) {
        return { canUseFavorites: true };
      }

      return { 
        canUseFavorites: false, 
        reason: 'Favorites feature requires premium subscription ($4.99/month).' 
      };
    } catch (error) {
      console.error('Error checking favorites access:', error);
      return { canUseFavorites: false, reason: 'Error checking access' };
    }
  }

  /**
   * Check if client can access portfolio feature
   */
  static async canClientUsePortfolio(clientId: string): Promise<{ canUsePortfolio: boolean; reason?: string }> {
    try {
      const client = await User.findByPk(clientId, {
        include: [{
          model: Subscription,
          as: 'subscriptions',
          where: { status: { [Op.in]: ['active', 'trialing'] } },
          required: false,
        }],
      });

      if (!client) {
        return { canUsePortfolio: false, reason: 'Client not found' };
      }

      if (client.role !== 'client') {
        return { canUsePortfolio: true }; // Providers can use portfolio
      }

      // Only premium clients can use portfolio
      const activeSubscription = client.subscriptions?.[0];
      if (activeSubscription) {
        return { canUsePortfolio: true };
      }

      return { 
        canUsePortfolio: false, 
        reason: 'Portfolio feature requires premium subscription ($4.99/month).' 
      };
    } catch (error) {
      console.error('Error checking portfolio access:', error);
      return { canUsePortfolio: false, reason: 'Error checking access' };
    }
  }

  /**
   * Check free access for users without subscriptions
   */
  private static checkFreeAccess(user: User, feature: string): boolean {
    if (user.role === 'client') {
      // Free trial clients have limited access
      const freeFeatures = ['browse_providers', 'view_reviews', 'limited_chat'];
      return freeFeatures.includes(feature);
    }
    
    return false; // Solo and suite users need subscriptions
  }

  /**
   * Check if plan has specific feature
   */
  private static checkPlanFeatures(planType: string, feature: string): boolean {
    const planFeatures = this.getPlanFeatures(planType);
    return planFeatures[feature] === true;
  }

  /**
   * Get features for a plan type
   */
  private static getPlanFeatures(planType: string): Record<string, any> {
    // Each tier is built by spreading the tier below it, so a feature listed
    // once on a lower tier is actually inherited by every tier above it
    // (previously these used marker keys like `everything_in_pro` /
    // `all_premium_features` that nothing ever resolved, so higher tiers -
    // including every Suite plan - silently failed feature checks for
    // anything only literally listed on a lower tier, e.g. custom_referral_codes).
    const soloBasic = {
      verified_business_profile: true,
      booking_calendar: true,
      internal_client_chat: true,
      limited_promotions_deals: true,
      save_up_to_20_percent_yearly: true,
    };

    const soloPro = {
      ...soloBasic,
      reply_to_client_reviews: true,
      promotions_deals: true,
      limited_google_review_boost: true,
      basic_booking_analytics: true,
      custom_referral_codes: true,
      enhanced_branding: true,
      most_popular: true,
    };

    const soloPremium = {
      ...soloPro,
      unlimited_promotions_deals: true,
      unlimited_google_review_boost: true,
      advance_booking_analytics: true,
      priority_search_ranking: true,
      beta_tool_access: true,
    };

    // Suite = "all Premium Solo Pro features, plus team tools" per spec.
    const suiteBase = { ...soloPremium, team_management: true };

    const features: Record<string, Record<string, any>> = {
      // Client plans
      client_free: {
        browse_providers: true,
        book_appointments: true,
        basic_chat: true,
        verified_reviews: true,
      },
      client_paid: {
        unlimited_bookings: true,
        unlimited_chat: true,
        favorite_providers: true,
        personalized_portfolio: true,
        full_booking_history: true,
        discover_any_provider: true,
        verified_reviews: true,
      },

      // Solo professional plans
      solo_basic: soloBasic,
      solo_pro: soloPro,
      solo_premium: soloPremium,

      // Suite owner plans
      suite_starter: { ...suiteBase, team_members: 3 },
      suite_growing: { ...suiteBase, team_members: 7 },
      suite_pro: { ...suiteBase, team_members: 12 },
      suite_elite: { ...suiteBase, team_members: 20 },
    };

    return features[planType] || {};
  }

  /**
   * Resolve when the user requested cancellation (not billing period end).
   */
  private static resolveCanceledAt(subscription: Subscription): Date | null {
    if (!subscription.cancelAtPeriodEnd) {
      return null;
    }

    const metadata = (subscription.metadata ?? {}) as Record<string, unknown>;
    const cancelRequestedAt = metadata.cancelRequestedAt;
    if (typeof cancelRequestedAt === 'string') {
      const parsed = new Date(cancelRequestedAt);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return null;
  }

  /**
   * Stamp the cancellation request time into subscription metadata.
   */
  private static withCancelRequestedAt(
    metadata: object | null,
    shouldStamp: boolean
  ): Record<string, unknown> {
    const base =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? { ...(metadata as Record<string, unknown>) }
        : {};

    if (!shouldStamp) {
      return base;
    }

    if (typeof base.cancelRequestedAt === 'string') {
      return base;
    }

    return {
      ...base,
      cancelRequestedAt: new Date().toISOString(),
    };
  }

  /**
   * Get default subscription info for users without active subscriptions
   */
  private static getDefaultSubscriptionInfo(user: User) {
    const planType = user.role === 'client' ? 'client_free' : `${user.role}_trial`;
    
    return {
      hasActiveSubscription: false,
      planType,
      status: 'trial',
      isCoveredBySuiteOwner: false,
      features: this.getPlanFeatures(planType),
    };
  }

  /**
   * Get Stripe price ID for plan type and billing interval.
   */
  private static getPriceIdForPlan(
    planType: string,
    billingInterval: 'month' | 'year' = 'month'
  ): string | null {
    const monthlyPriceMap: Record<string, string> = {
      client_premium: process.env.STRIPE_CLIENT_PREMIUM_PRICE_ID || 'price_client_premium_test',
      solo_basic: process.env.STRIPE_SOLO_BASIC_PRICE_ID || 'price_solo_basic_test',
      solo_pro: process.env.STRIPE_SOLO_PRO_PRICE_ID || 'price_solo_pro_test',
      solo_premium: process.env.STRIPE_SOLO_PREMIUM_PRICE_ID || 'price_solo_premium_test',
      suite_starter: process.env.STRIPE_SUITE_STARTER_PRICE_ID || 'price_suite_starter_test',
      suite_growing: process.env.STRIPE_SUITE_GROWING_PRICE_ID || 'price_suite_growing_test',
      suite_pro: process.env.STRIPE_SUITE_PRO_PRICE_ID || 'price_suite_pro_test',
      suite_elite: process.env.STRIPE_SUITE_ELITE_PRICE_ID || 'price_suite_elite_test',
    };

    const yearlyPriceMap: Record<string, string | undefined> = {
      client_premium: process.env.STRIPE_CLIENT_PREMIUM_YEARLY_PRICE_ID,
      solo_basic: process.env.STRIPE_SOLO_BASIC_YEARLY_PRICE_ID,
      solo_pro: process.env.STRIPE_SOLO_PRO_YEARLY_PRICE_ID,
      solo_premium: process.env.STRIPE_SOLO_PREMIUM_YEARLY_PRICE_ID,
      suite_starter: process.env.STRIPE_SUITE_STARTER_YEARLY_PRICE_ID,
      suite_growing: process.env.STRIPE_SUITE_GROWING_YEARLY_PRICE_ID,
      suite_pro: process.env.STRIPE_SUITE_PRO_YEARLY_PRICE_ID,
      suite_elite: process.env.STRIPE_SUITE_ELITE_YEARLY_PRICE_ID,
    };

    const priceId =
      billingInterval === 'year'
        ? yearlyPriceMap[planType]
        : monthlyPriceMap[planType];

    if (!priceId) {
      console.error(
        `No ${billingInterval}ly price ID found for plan type: ${planType}`
      );
      return null;
    }

    if (process.env.NODE_ENV === 'production' && priceId.includes('_test')) {
      console.warn(`⚠️  Using test price ID in production for plan: ${planType}`);
    }

    return priceId;
  }

  /**
   * Check if provider is in client's referral list
   */
  private static async isProviderReferred(clientId: string, providerId: string): Promise<boolean> {
    // This would check the referral table
    // Implementation depends on how referrals are stored
    return false; // Placeholder
  }
}
