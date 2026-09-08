import { Router } from 'express';
import {
  createPromotion,
  getMyPromotions,
  getActivePromotions,
  applyPromotion,
  applyPromotionByCode,
  updatePromotion,
  deletePromotion,
  getPromotionStats,
  getPromotionById,
} from '../controllers/promotion.controller';
import { authenticateToken, requireRole } from '../middlewares/auth.middleware';
import { validateUUID } from '../middlewares/validation.middleware';

const router = Router();

// Create promotion (providers only)
router.post('/', authenticateToken, requireRole(['solo', 'suite']), createPromotion);

// Get my promotions (providers only)
router.get('/my-promotions', authenticateToken, requireRole(['solo', 'suite']), getMyPromotions);

// Get active promotions (public endpoint)
router.get('/active', getActivePromotions);

// Apply promotion to calculate discount (public endpoint)
router.post('/apply', applyPromotion);

// Apply promotion by code to calculate discount (public endpoint)
router.post('/apply-code', applyPromotionByCode);

// Get promotion statistics (providers only)
router.get('/stats', authenticateToken, requireRole(['solo', 'suite']), getPromotionStats);

// Get promotion by ID (providers only)
router.get('/:promotionId', authenticateToken, requireRole(['solo', 'suite']), validateUUID('promotionId'), getPromotionById);

// Update promotion (providers only)
router.put('/:promotionId', authenticateToken, requireRole(['solo', 'suite']), validateUUID('promotionId'), updatePromotion);

// Delete promotion (providers only)
router.delete('/:promotionId', authenticateToken, requireRole(['solo', 'suite']), validateUUID('promotionId'), deletePromotion);

export default router;
