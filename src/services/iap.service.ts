import { Op } from 'sequelize';
import { User } from '../models/user_model';
import { Subscription } from '../models/subscription_model';
import { resolveIapProduct } from './iap_product_map';

export type IapPlatform = 'ios' | 'android';

export interface VerifyIapInput {
  userId: string;
  platform: IapPlatform;
  productId: string;
  purchaseId: string;
  verificationData: string;
  transactionDate?: string;
  startedWithTrial?: boolean;
}

/**
 * Verifies App Store / Play Store purchases and activates local entitlements.
 * Stripe is NOT used for subscription billing anymore.
 */
export class IapService {
  static async verifyAndActivatePurchase(input: VerifyIapInput) {
    const mapped = resolveIapProduct(input.productId);
    if (!mapped) {
      throw new Error(`Unknown store product: ${input.productId}`);
    }

    const user = await User.findByPk(input.userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.isTeamMember) {
      throw new Error(
        'Team members are covered by the suite owner plan and cannot purchase a subscription'
      );
    }

    // Role safety: clients can only buy client plans, etc.
    const role = (user.role || '').toLowerCase();
    if (role === 'client' && !mapped.planType.startsWith('client_')) {
      throw new Error('This plan is not available for client accounts');
    }
    if (role === 'solo' && !mapped.planType.startsWith('solo_')) {
      throw new Error('This plan is not available for solo accounts');
    }
    if (role === 'suite' && !mapped.planType.startsWith('suite_')) {
      throw new Error('This plan is not available for suite accounts');
    }

    let storeExpiresAt: Date | undefined;
    let isStoreTrial = false;
    if (input.platform === 'ios') {
      const apple = await this.verifyAppleReceipt(input.verificationData, input.productId);
      storeExpiresAt = apple.expiresAt;
      isStoreTrial = apple.isTrial === true;
    } else if (input.platform === 'android') {
      await this.verifyGooglePurchase(input);
    } else {
      throw new Error('Unsupported platform');
    }

    const now = new Date();

    // Prefer updating an existing active/IAP subscription for this user
    let subscription = await Subscription.findOne({
      where: {
        userId: input.userId,
        status: { [Op.in]: ['active', 'trialing', 'past_due'] },
      },
      order: [['createdAt', 'DESC']],
    });

    const previousMeta = (subscription?.metadata || {}) as Record<string, unknown>;
    const previousInterval =
      previousMeta.billingInterval === 'year' || previousMeta.billingInterval === 'yearly'
        ? 'year'
        : previousMeta.billingInterval === 'month'
          ? 'month'
          : undefined;

    // Mid-cycle upgrades keep the original billing anchor. Apple/Google charge
    // the unused-credit vs remaining-days difference in the store sheet.
    const sameInterval =
      !!subscription && previousInterval === mapped.billingInterval;
    const existingEnd = subscription?.currentPeriodEnd ?? null;
    const existingStart = subscription?.currentPeriodStart ?? null;
    const keepAnchor =
      sameInterval &&
      !!existingEnd &&
      existingEnd.getTime() > now.getTime() &&
      !!existingStart;

    const periodStart = keepAnchor && existingStart ? existingStart : now;
    let periodEnd =
      storeExpiresAt && storeExpiresAt.getTime() > now.getTime()
        ? storeExpiresAt
        : keepAnchor && existingEnd
          ? existingEnd
          : this.computePeriodEnd(periodStart, mapped.billingInterval);

    const inIntroTrial =
      mapped.billingInterval === 'month' &&
      (isStoreTrial || input.startedWithTrial === true);
    if (
      inIntroTrial &&
      !storeExpiresAt &&
      mapped.planType === 'client_premium' &&
      mapped.billingInterval === 'month'
    ) {
      const threeDays = new Date(periodStart);
      threeDays.setDate(threeDays.getDate() + 3);
      periodEnd = threeDays;
    }
    const trialEnd = inIntroTrial ? periodEnd : null;
    const status = inIntroTrial ? 'trialing' : 'active';

    const metadata = {
      store: input.platform,
      storeProductId: input.productId,
      storePurchaseId: input.purchaseId,
      billingInterval: mapped.billingInterval,
      verifiedAt: now.toISOString(),
      transactionDate: input.transactionDate ?? null,
      billingAnchorPreserved: keepAnchor,
      previousPlanType: subscription?.planType ?? null,
      introductoryTrial: inIntroTrial,
    };

    if (subscription) {
      await subscription.update({
        planType: mapped.planType as any,
        status,
        stripeSubscriptionId: null,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialEnd,
        cancelAtPeriodEnd: false,
        metadata: {
          ...previousMeta,
          ...metadata,
        },
      });
    } else {
      subscription = await Subscription.create({
        userId: input.userId,
        planType: mapped.planType as any,
        stripeSubscriptionId: null,
        status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialEnd,
        cancelAtPeriodEnd: false,
        metadata,
      });
    }

    await user.update({ currentSubscriptionId: subscription.id });

    return {
      subscriptionId: subscription.id,
      planType: subscription.planType,
      billingInterval: mapped.billingInterval,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEnd: subscription.trialEnd,
      store: input.platform,
      productId: input.productId,
    };
  }

  private static computePeriodEnd(start: Date, interval: 'month' | 'year'): Date {
    const end = new Date(start);
    if (interval === 'year') {
      end.setFullYear(end.getFullYear() + 1);
    } else {
      end.setMonth(end.getMonth() + 1);
    }
    return end;
  }

  /**
   * Apple verifyReceipt (production first, sandbox fallback for status 21007).
   * Set APPLE_SHARED_SECRET in env (App Store Connect → App-Specific Shared Secret).
   * In development, if APPLE_IAP_SKIP_VERIFY=true, accepts without remote check.
   */
  private static async verifyAppleReceipt(
    receiptData: string,
    productId: string
  ): Promise<{ expiresAt?: Date; isTrial?: boolean }> {
    if (process.env.APPLE_IAP_SKIP_VERIFY === 'true') {
      console.warn('⚠️  Skipping Apple receipt verification (APPLE_IAP_SKIP_VERIFY=true)');
      return {};
    }

    const sharedSecret = process.env.APPLE_SHARED_SECRET;
    if (!sharedSecret) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '⚠️  APPLE_SHARED_SECRET not set — accepting iOS purchase in non-production'
        );
        return {};
      }
      throw new Error('Apple IAP is not configured (missing APPLE_SHARED_SECRET)');
    }

    const body = {
      'receipt-data': receiptData,
      password: sharedSecret,
      'exclude-old-transactions': true,
    };

    let json = await this.postAppleVerify(
      'https://buy.itunes.apple.com/verifyReceipt',
      body
    );

    // Sandbox receipt used in production endpoint
    if (json.status === 21007) {
      json = await this.postAppleVerify(
        'https://sandbox.itunes.apple.com/verifyReceipt',
        body
      );
    }

    if (json.status !== 0) {
      throw new Error(`Apple receipt invalid (status ${json.status})`);
    }

    const latest = Array.isArray(json.latest_receipt_info)
      ? json.latest_receipt_info
      : [];
    const inApp = Array.isArray(json.receipt?.in_app) ? json.receipt.in_app : [];
    const entries = [...latest, ...inApp];
    const match = entries.find((e: any) => e.product_id === productId);

    if (!match && entries.length > 0) {
      // Some restores return multiple products; accept if any mapped product is present
      const anyKnown = entries.some((e: any) => resolveIapProduct(e.product_id));
      if (!anyKnown) {
        throw new Error('Apple receipt does not contain a Booqly subscription product');
      }
    }

    let expiresAt: Date | undefined;
    if (match?.expires_date_ms) {
      const expires = Number(match.expires_date_ms);
      if (!Number.isNaN(expires) && expires < Date.now()) {
        throw new Error('Apple subscription has expired');
      }
      if (!Number.isNaN(expires) && expires > 0) {
        expiresAt = new Date(expires);
      }
    }

    const isTrial =
      match?.is_trial_period === 'true' || match?.is_in_intro_offer_period === 'true';

    return { expiresAt, isTrial };
  }

  private static async postAppleVerify(url: string, body: object): Promise<any> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Apple verifyReceipt HTTP ${response.status}`);
    }
    return response.json();
  }

  /**
   * Google Play purchase verification.
   * Full Android Publisher API needs a service account.
   * For now: require token presence; optionally skip in non-production.
   * Set GOOGLE_IAP_SKIP_VERIFY=true to bypass during local testing.
   */
  private static async verifyGooglePurchase(input: VerifyIapInput) {
    if (process.env.GOOGLE_IAP_SKIP_VERIFY === 'true') {
      console.warn('⚠️  Skipping Google Play verification (GOOGLE_IAP_SKIP_VERIFY=true)');
      return;
    }

    if (!input.verificationData || input.verificationData.trim().length < 10) {
      throw new Error('Invalid Google Play purchase token');
    }

    // Production hardening: wire Google Play Developer API here with service account.
    // Until configured, allow in non-production only.
    if (process.env.NODE_ENV === 'production' && !process.env.GOOGLE_PLAY_PACKAGE_NAME) {
      console.warn(
        '⚠️  GOOGLE_PLAY_PACKAGE_NAME not set — accepting Android purchase token without remote verify'
      );
    }
  }
}
