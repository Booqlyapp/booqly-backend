import { Router } from 'express';
import {
  getPlatformOverview,
  getUserGrowthAnalytics,
  getSubscriptionAnalytics,
  getAppointmentAnalytics,
  getReviewAnalytics,
  getChatAnalytics,
  getReferralAnalytics,
  getProviderPerformance,
} from '../controllers/analytics.controller';
import { authenticateToken, requireRole } from '../middlewares/auth.middleware';
import { validateUUID } from '../middlewares/validation.middleware';

const router = Router();

// All analytics routes require authentication
router.use(authenticateToken);

// Admin-only analytics endpoints
router.get('/platform/overview', requireRole('admin'), getPlatformOverview);
router.get('/platform/user-growth', requireRole('admin'), getUserGrowthAnalytics);
router.get('/platform/subscriptions', requireRole('admin'), getSubscriptionAnalytics);
router.get('/platform/appointments', requireRole('admin'), getAppointmentAnalytics);
router.get('/platform/reviews', requireRole('admin'), getReviewAnalytics);
router.get('/platform/chat', requireRole('admin'), getChatAnalytics);
router.get('/platform/referrals', requireRole('admin'), getReferralAnalytics);

// Provider analytics (providers can view their own)
router.get('/provider/:providerId/performance', 
  requireRole(['solo', 'suite']), 
  validateUUID('providerId'), 
  getProviderPerformance
);

export default router;
