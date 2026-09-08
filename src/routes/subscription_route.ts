import { Router } from 'express';
import {
  getSubscriptionPlans,
  getUserSubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  checkFeatureAccess,
  handleStripeWebhook,
  getSubscriptionAnalytics,
  checkClientDiscoveryAccess,
  getClientSubscriptionTier,
  verifyIapPurchase,
} from '../controllers/subscription.controller';
import { authenticateToken, requireRole } from '../middlewares/auth.middleware';
import { validate, schemas } from '../middlewares/validation.middleware';

const router = Router();

// Get subscription plans (public)
router.get('/plans', getSubscriptionPlans);

// Get user's subscription info (authenticated)
router.get('/me', authenticateToken, getUserSubscription);

// Create subscription (deprecated — Stripe billing removed)
router.post('/', authenticateToken, validate(schemas.createSubscription), createSubscription);

// Verify App Store / Play Store purchase and activate plan
router.post('/verify-iap', authenticateToken, verifyIapPurchase);

// Update subscription (deprecated — use store purchase + verify-iap)
router.put('/', authenticateToken, updateSubscription);

// Cancel subscription (authenticated)
router.delete('/', authenticateToken, cancelSubscription);

// Check feature access (authenticated)
router.get('/feature-access', authenticateToken, checkFeatureAccess);

// Check client discovery access (authenticated)
router.get('/client/can-discover', authenticateToken, checkClientDiscoveryAccess);

// Get client subscription tier (authenticated)
router.get('/client/tier', authenticateToken, getClientSubscriptionTier);

// Stripe webhook (no auth required)
router.post('/webhook/stripe', handleStripeWebhook);

// Admin subscription revenue analytics (IAP catalog, not Stripe)
router.get(
  '/analytics',
  authenticateToken,
  requireRole('admin'),
  getSubscriptionAnalytics
);

export default router;
