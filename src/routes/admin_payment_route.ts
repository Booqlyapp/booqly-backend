import { Router } from 'express';
import {
  getPaymentSummary,
  getCommissionByCategory,
  getCommissionByPaymentMethod,
  getTopPayingClients,
  getStripeConnectStatusList,
  getRecentPayouts,
} from '../controllers/admin_payment_controller';
import { authenticateToken, requireRole } from '../middlewares/auth.middleware';
import { validateQuery, schemas } from '../middlewares/validation.middleware';

const router = Router();

router.use(authenticateToken, requireRole('admin'));

router.get('/summary', validateQuery(schemas.adminPaymentDateRange), getPaymentSummary);
router.get(
  '/commission-by-category',
  validateQuery(schemas.adminPaymentDateRange),
  getCommissionByCategory
);
router.get(
  '/commission-by-method',
  validateQuery(schemas.adminPaymentDateRange),
  getCommissionByPaymentMethod
);
router.get(
  '/top-clients',
  validateQuery(schemas.adminPaymentTopClients),
  getTopPayingClients
);
router.get(
  '/stripe-connect-status',
  validateQuery(schemas.adminPaymentPaginated),
  getStripeConnectStatusList
);
router.get('/payouts', validateQuery(schemas.adminPaymentPaginated), getRecentPayouts);

export default router;
