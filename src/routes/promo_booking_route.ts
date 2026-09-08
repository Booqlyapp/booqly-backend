import { Router } from 'express';
import { getPromoBookingData } from '../controllers/promo_booking.controller';

const router = Router();

/**
 * @route GET /promo-booking
 * @desc Get comprehensive promo booking data
 * @access Public
 */
router.get('/promo-booking', getPromoBookingData);

export default router;
