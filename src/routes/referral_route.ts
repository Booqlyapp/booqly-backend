import { Router } from 'express';
import {
  generateReferralCode,
  applyReferralCode,
  getProviderReferrals,
  getClientReferredProviders,
  getProviderReferralStats,
  getProviderReferralCode,
  deleteReferralCode,
  removeReferral,
  searchClients,
  sendReferralCodeToClient,
  getClientReferralInvites,
  applyReferralInvite,
} from '../controllers/referral.controller';
import { authenticateToken, requireRole } from '../middlewares/auth.middleware';
import { validateUUID } from '../middlewares/validation.middleware';

const router = Router();

// Generate referral code (providers only)
router.post('/generate', authenticateToken, requireRole(['solo', 'suite']), generateReferralCode);

// Apply referral code (clients only)
router.post('/apply', authenticateToken, requireRole('client'), applyReferralCode);

// Get provider's referrals
router.get('/my-referrals', authenticateToken, requireRole(['solo', 'suite']), getProviderReferrals);

// Get client's referred providers
router.get('/referred-providers', authenticateToken, requireRole('client'), getClientReferredProviders);

// Get provider's referral statistics
router.get('/stats', authenticateToken, requireRole(['solo', 'suite']), getProviderReferralStats);

// Get provider's referral code
router.get('/my-code', authenticateToken, requireRole(['solo', 'suite']), getProviderReferralCode);

// Delete (clear) provider's referral code
router.delete('/my-code', authenticateToken, requireRole(['solo', 'suite']), deleteReferralCode);

// Remove referral (clients only)
router.delete('/remove/:providerId', authenticateToken, requireRole('client'), validateUUID('providerId'), removeReferral);

// Search clients for referral sharing (providers only)
router.get('/search-clients', authenticateToken, requireRole(['solo', 'suite']), searchClients);

// Send referral code to specific client (providers only)
router.post('/send-to-client', authenticateToken, requireRole(['solo', 'suite']), sendReferralCodeToClient);

// Get client's received referral invites (clients only)
router.get('/invites', authenticateToken, requireRole('client'), getClientReferralInvites);

// Apply referral code from invite (clients only)
router.post('/apply-invite', authenticateToken, requireRole('client'), applyReferralInvite);

export default router;
