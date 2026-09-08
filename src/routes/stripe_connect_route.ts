import { Router } from 'express';
import {
  startConnectOnboarding,
  getConnectStatus,
  getConnectDashboardLink,
  connectOnboardingComplete,
  connectOnboardingRefresh,
} from '../controllers/stripe_connect_controller';
import { authenticateToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

// Public: Stripe redirects the provider's own browser here (not the app),
// so these can't require our auth token.
router.get('/complete', connectOnboardingComplete);
router.get('/refresh', connectOnboardingRefresh);

// All other Connect routes are provider-only (marketplace owners)
router.use(authenticateToken, requireRole(['solo', 'suite']));

// Start or resume onboarding, returns a Stripe-hosted onboarding link
router.post('/onboard', startConnectOnboarding);

// Live-synced onboarding/payout status for the authenticated provider
router.get('/status', getConnectStatus);

// Login link into the provider's Stripe Express dashboard
router.post('/dashboard-link', getConnectDashboardLink);

export default router;
