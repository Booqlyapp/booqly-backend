import { Router } from 'express';
import { authenticateToken } from '../middlewares/auth.middleware';
import { 
  generatePromoUrl, 
  handlePromoUrl, 
  generateShareMessage 
} from '../controllers/promo_url.controller';

const router = Router();

/**
 * @route POST /promo-url/generate
 * @desc Generate a shareable promo URL
 * @access Private (Provider only)
 */
router.post('/generate', authenticateToken, generatePromoUrl);

/**
 * @route POST /promo-url/share-message
 * @desc Generate platform-specific share message
 * @access Private (Provider only)
 */
router.post('/share-message', authenticateToken, generateShareMessage);

export default router;
