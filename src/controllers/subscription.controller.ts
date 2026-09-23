import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { StripeService } from '../services/stripe.service';
import { SubscriptionService } from '../services/subscription.service';
import { Subscription } from '../models/subscription_model';
import { SubscriptionPlan } from '../models/subscription_plan_model';
import {
  monthlyRecurringAmount,
  resolveBillingInterval,
} from '../services/iap_product_map';
import { log } from '../utils/logger';

interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

/**
 * Get available subscription plans  (public endpoint)
 */
export const getSubscriptionPlans = async (req: Request, res: Response): Promise<void> => {
  try {
    const { role } = req.query;

    if (!role) {
      res.status(400).json({
        status: false,
        message: 'Role parameter is required (client, solo, suite)',
      });
      return;
    }

    // Validate role parameter
    const validRoles = ['client', 'solo', 'suite'];
    if (!validRoles.includes(role as string)) {
      res.status(400).json({
        status: false,
        message: 'Invalid role. Must be one of: client, solo, suite',
      });
      return;
    }

    const plans = await SubscriptionPlan.findAll({
      where: { userRole: role as any, isActive: true },
      order: [['price', 'ASC']],
    });

    res.status(200).json({
      status: true,
      message: 'Subscription plans retrieved successfully',
      data: plans,
    });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch subscription plans',
    });
  }
};

/**
 * Get user's current subscription info
 */
export const getUserSubscription = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const subscriptionInfo = await SubscriptionService.getUserSubscriptionInfo(req.userId);

    res.status(200).json({
      status: true,
      message: 'Subscription info retrieved successfully',
      data: subscriptionInfo,
    });
  } catch (error) {
    console.error('Error fetching subscription info:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch subscription info',
    });
  }
};

/**
 * Create a new subscription
 * @deprecated Use verifyIapPurchase — Stripe subscription billing is disabled.
 */
export const createSubscription = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(410).json({
    status: false,
    message:
      'Stripe subscriptions are disabled. Purchase via App Store / Google Play, then call POST /subscriptions/verify-iap.',
  });
};

/**
 * Verify App Store / Play Store purchase and activate entitlement
 */
export const verifyIapPurchase = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { platform, productId, purchaseId, verificationData, transactionDate, startedWithTrial } = req.body;

    if (!platform || !['ios', 'android'].includes(platform)) {
      res.status(400).json({
        status: false,
        message: 'platform must be ios or android',
      });
      return;
    }

    if (!productId || !purchaseId || !verificationData) {
      res.status(400).json({
        status: false,
        message: 'productId, purchaseId, and verificationData are required',
      });
      return;
    }

    const result = await SubscriptionService.verifyIapPurchase({
      userId: req.userId,
      platform,
      productId,
      purchaseId,
      verificationData,
      transactionDate,
      startedWithTrial: startedWithTrial === true,
    });

    res.status(200).json({
      status: true,
      message: 'Purchase verified and subscription activated',
      data: result,
    });
  } catch (error) {
    console.error('Error verifying IAP purchase:', error);
    res.status(400).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to verify purchase',
    });
  }
};

/**
 * Update subscription (upgrade/downgrade)
 * @deprecated Use a new store purchase + verify-iap
 */
export const updateSubscription = async (req: AuthRequest, res: Response): Promise<void> => {
  res.status(410).json({
    status: false,
    message:
      'Plan changes must be completed in the App Store / Google Play. After purchasing, the app calls /subscriptions/verify-iap.',
  });
};

/**
 * Cancel subscription
 */
export const cancelSubscription = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { immediately = false } = req.body || {};

    const result = await SubscriptionService.cancelSubscription(req.userId, immediately);

    res.status(200).json({
      status: true,
      message: immediately ? 'Subscription canceled immediately' : 'Subscription will cancel at period end',
      data: result,
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to cancel subscription';
    const statusCode = message === 'No active subscription found' ? 404 : 500;

    res.status(statusCode).json({
      status: false,
      message,
    });
  }
};

/**
 * Check if user can perform an action (booking, messaging, etc.)
 */
export const checkFeatureAccess = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { feature, providerId } = req.query;

    if (!feature) {
      res.status(400).json({
        status: false,
        message: 'Feature parameter is required',
      });
      return;
    }

    let result: any = { hasAccess: false };

    switch (feature) {
      case 'booking':
        result = await SubscriptionService.canClientBook(req.userId);
        break;
      case 'messaging':
        if (!providerId) {
          res.status(400).json({
            status: false,
            message: 'Provider ID is required for messaging check',
          });
          return;
        }
        result = await SubscriptionService.canClientMessage(req.userId, providerId as string);
        break;
      default:
        const hasAccess = await SubscriptionService.hasFeatureAccess(req.userId, feature as string);
        result = { hasAccess };
    }

    res.status(200).json({
      status: true,
      message: 'Feature access checked successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error checking feature access:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to check feature access',
    });
  }
};

/**
 * Handle Stripe webhooks
 */
export const handleStripeWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // Check if webhook secret is configured
    if (!endpointSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      res.status(400).json({ error: 'Webhook secret not configured' });
      return;
    }

    if (!sig) {
      console.error('No stripe-signature header found');
      res.status(400).json({ error: 'No signature header' });
      return;
    }

    let event: any;

    try {
      // Verify webhook signature for security
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', {
        error: err.message,
        signature: sig,
        bodyType: typeof req.body,
        bodyLength: req.body?.length || 0,
      });
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }

    // Handle the event
    await StripeService.handleWebhook(event);
    log.info('Webhook handled successfully', { eventType: event.type, eventId: event.id });

    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Webhook handling error:', error);
    res.status(500).json({
      status: false,
      message: 'Webhook handling failed',
      error: error.message,
    });
  }
};

/**
 * Get subscription analytics (for admin)
 * Revenue is estimated from IAP catalog prices — Stripe subscription billing is disabled.
 */
export const getSubscriptionAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const [totalSubscriptions, activeRows, canceledInLast30Days] = await Promise.all([
      Subscription.count(),
      Subscription.findAll({
        where: { status: { [Op.in]: ['active', 'trialing'] } },
        attributes: ['planType', 'metadata'],
      }),
      Subscription.count({
        where: {
          status: 'canceled',
          updatedAt: {
            [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    const subscriptionsByPlan: Record<string, number> = {};
    let monthlyRevenue = 0;

    for (const row of activeRows) {
      const planType = row.planType;
      subscriptionsByPlan[planType] = (subscriptionsByPlan[planType] || 0) + 1;
      monthlyRevenue += monthlyRecurringAmount(
        planType,
        resolveBillingInterval(row.metadata)
      );
    }

    const churnRate =
      totalSubscriptions > 0 ? (canceledInLast30Days / totalSubscriptions) * 100 : 0;

    res.status(200).json({
      status: true,
      message: 'Subscription analytics retrieved successfully',
      data: {
        totalSubscriptions,
        activeSubscriptions: activeRows.length,
        subscriptionsByPlan,
        monthlyRevenue: parseFloat(monthlyRevenue.toFixed(2)),
        churnRate: parseFloat(churnRate.toFixed(2)),
        billingSource: 'iap',
      },
    });
  } catch (error) {
    console.error('Error fetching subscription analytics:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch subscription analytics',
    });
  }
};

/**
 * Check if client can discover providers
 */
export const checkClientDiscoveryAccess = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId || req.user?.id;

    if (!userId) {
      res.status(401).json({
        status: false,
        message: 'Unauthorized',
      });
      return;
    }

    const result = await SubscriptionService.canClientDiscoverProviders(userId);

    res.status(200).json({
      status: true,
      message: result.canDiscover ? 'Discovery access granted' : 'Discovery access denied',
      data: result,
    });
  } catch (error) {
    console.error('Error checking client discovery access:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to check discovery access',
    });
  }
};

/**
 * Get client subscription tier
 */
export const getClientSubscriptionTier = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId || req.user?.id;

    if (!userId) {
      res.status(401).json({
        status: false,
        message: 'Unauthorized',
      });
      return;
    }

    const tierInfo = await SubscriptionService.getClientSubscriptionTier(userId);

    res.status(200).json({
      status: true,
      message: 'Client subscription tier retrieved successfully',
      data: tierInfo,
    });
  } catch (error) {
    console.error('Error getting client subscription tier:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to get subscription tier',
    });
  }
};
