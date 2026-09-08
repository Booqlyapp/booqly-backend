import { Router } from 'express';
import {
  createReview,
  updateReview,
  getProviderReviews,
  getClientReviews,
  respondToReview,
  getProviderReviewStats,
  updateReviewStatus,
  getPendingReviews,
  deleteReview,
  createProviderReview,
  getReviewsByProvider,
  getReviewsForClient,
  getReviewsForClientById,
  deleteProviderReview,
  getReviewByAppointment,
  getPendingReviewOpportunities,
  createProviderResponse,
  updateWithClientReview,
  recordPromptDismissal,
  getAllReviews,
  flagReview,
} from '../controllers/review.controller';
import { authenticateToken, requireRole } from '../middlewares/auth.middleware';
import { validate, validateQuery, schemas, validateUUID } from '../middlewares/validation.middleware';

const router = Router();

// Create review (clients only)
router.post(
  '/',
  authenticateToken,
  requireRole('client'),
  validate(schemas.createReview),
  createReview
);

// Update review (clients can only update their own reviews)
router.put(
  '/:reviewId',
  authenticateToken,
  requireRole('client'),
  validateUUID('reviewId'),
  updateReview
);

// Get provider reviews (public)
router.get('/provider/:providerId', validateUUID('providerId'), getProviderReviews);

// Get provider review statistics (public)
router.get('/provider/:providerId/stats', validateUUID('providerId'), getProviderReviewStats);

// Get client's reviews (authenticated)
router.get('/client', authenticateToken, getClientReviews);

// Get review by appointment ID (authenticated)
router.get('/appointment/:appointmentId', authenticateToken, validateUUID('appointmentId'), getReviewByAppointment);

// Respond to review (providers only)
router.put(
  '/:reviewId/respond',
  authenticateToken,
  requireRole(['solo', 'suite']),
  validateUUID('reviewId'),
  respondToReview
);

// Flag a review (clients and providers)
router.post(
  '/:reviewId/flag',
  authenticateToken,
  validateUUID('reviewId'),
  validate(schemas.flagReview),
  flagReview
);

// Delete review (client or admin)
router.delete('/:reviewId', authenticateToken, validateUUID('reviewId'), deleteReview);

// Provider review routes
router.post(
  '/provider-review',
  authenticateToken,
  requireRole(['solo', 'suite']),
  createProviderReview
);

router.get(
  '/provider-reviews/by-provider',
  authenticateToken,
  requireRole(['solo', 'suite']),
  getReviewsByProvider
);

router.get(
  '/provider-reviews/for-client',
  authenticateToken,
  requireRole('client'),
  getReviewsForClient
);

// Providers viewing a specific client's review summary/list
router.get(
  '/client/:clientId',
  authenticateToken,
  requireRole(['solo', 'suite']),
  validateUUID('clientId'),
  getReviewsForClientById
);

router.delete(
  '/provider-review/:reviewId',
  authenticateToken,
  requireRole(['solo', 'suite']),
  validateUUID('reviewId'),
  deleteProviderReview
);

// NOTE: there is deliberately no route allowing a provider to delete a
// client's review of them - see deleteProviderReview above.

// Review trigger system routes
router.get('/pending-opportunities', authenticateToken, getPendingReviewOpportunities);
router.post('/provider-response', authenticateToken, requireRole(['solo', 'suite']), createProviderResponse);
router.put('/:reviewId/client-review', authenticateToken, requireRole('client'), validateUUID('reviewId'), updateWithClientReview);
router.post('/dismiss-prompt', authenticateToken, recordPromptDismissal);

// Admin routes (TODO: Add admin role check)
router.get(
  '/all',
  authenticateToken,
  requireRole('admin'),
  validateQuery(schemas.adminListReviews),
  getAllReviews
);
router.get('/pending', authenticateToken, requireRole('admin'), getPendingReviews);
router.put('/:reviewId/status', authenticateToken, requireRole('admin'), validateUUID('reviewId'), updateReviewStatus);

export default router;
