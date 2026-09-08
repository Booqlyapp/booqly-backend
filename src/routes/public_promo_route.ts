import { Router } from 'express';
import { handlePromoUrl } from '../controllers/promo_url.controller';

const router = Router();

/**
 * @route GET /promo
 * @desc Handle public promo URL and return promotion details
 * @access Public
 */
router.get('/promo', handlePromoUrl);

export default router;
