import { Router } from 'express';
import { handleStripeWebhook } from '../controllers/webhook.controller';

const router = Router();

// Stripe webhook endpoint (no auth required, Stripe signature verification instead)
router.post('/stripe', handleStripeWebhook);

export default router;
