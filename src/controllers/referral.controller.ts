import { Request, Response } from 'express';
import { ReferralService } from '../services/referral.service';

interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

/**
 * Generate referral code (providers only)
 */
export const generateReferralCode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { referralCode: customCode } = req.body;
    
    if (!customCode || typeof customCode !== 'string') {
      res.status(400).json({
        status: false,
        message: 'Referral code is required',
      });
      return;
    }

    const referralCode = await ReferralService.generateReferralCode(req.userId, customCode.toUpperCase());
    
    res.status(200).json({
      status: true,
      message: 'Referral code created successfully',
      data: { referralCode },
    });
  } catch (error) {
    console.error('Error creating referral code:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to create referral code',
    });
  }
};

/**
 * Apply referral code (clients only)
 */
export const applyReferralCode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { referralCode } = req.body;
    
    if (!referralCode) {
      res.status(400).json({
        status: false,
        message: 'Referral code is required',
      });
      return;
    }

    if (!ReferralService.validateReferralCode(referralCode)) {
      res.status(400).json({
        status: false,
        message: 'Invalid referral code format. Code must be 6-12 uppercase letters and numbers.',
      });
      return;
    }

    const result = await ReferralService.applyReferralCode(req.userId, referralCode);
    
    res.status(result.success ? 200 : 400).json({
      status: result.success,
      message: result.message,
      data: result.referrer,
    });
  } catch (error) {
    console.error('Error applying referral code:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to apply referral code',
    });
  }
};

/**
 * Get provider's referrals
 */
export const getProviderReferrals = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { page = 1, limit = 20 } = req.query;
    
    const result = await ReferralService.getProviderReferrals(
      req.userId,
      parseInt(page as string),
      parseInt(limit as string)
    );
    
    res.status(200).json({
      status: true,
      message: 'Referrals retrieved successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error fetching referrals:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch referrals',
    });
  }
};

/**
 * Get client's referred providers
 */
export const getClientReferredProviders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const providers = await ReferralService.getClientReferredProviders(req.userId);
    
    res.status(200).json({
      status: true,
      message: 'Referred providers retrieved successfully',
      data: providers,
    });
  } catch (error) {
    console.error('Error fetching referred providers:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch referred providers',
    });
  }
};

/**
 * Get provider's referral statistics
 */
export const getProviderReferralStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const stats = await ReferralService.getProviderReferralStats(req.userId);
    
    res.status(200).json({
      status: true,
      message: 'Referral statistics retrieved successfully',
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch referral statistics',
    });
  }
};

/**
 * Get provider's referral code
 */
export const getProviderReferralCode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const referralCode = await ReferralService.getProviderReferralCode(req.userId);
    
    if (!referralCode) {
      res.status(404).json({
        status: false,
        message: 'No referral code found. Generate one first.',
      });
      return;
    }

    const booqlyPassUrl = ReferralService.generateBooqlyPassUrl(referralCode);
    
    res.status(200).json({
      status: true,
      message: 'Referral code retrieved successfully',
      data: {
        referralCode,
        booqlyPassUrl,
      },
    });
  } catch (error) {
    console.error('Error fetching referral code:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch referral code',
    });
  }
};

/**
 * Delete provider's referral code (providers only)
 */
export const deleteReferralCode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    await ReferralService.deleteReferralCode(req.userId);

    res.status(200).json({
      status: true,
      message: 'Referral code deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting referral code:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to delete referral code',
    });
  }
};

/**
 * Remove referral (deactivate)
 */
export const removeReferral = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { providerId } = req.params;
    
    await ReferralService.removeReferral(req.userId, providerId);
    
    res.status(200).json({
      status: true,
      message: 'Referral removed successfully',
    });
  } catch (error) {
    console.error('Error removing referral:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to remove referral',
    });
  }
};

/**
 * Search clients for referral code sharing
 */
export const searchClients = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { search, limit = 10 } = req.query;

    if (!search || typeof search !== 'string') {
      res.status(400).json({
        status: false,
        message: 'Search term is required',
      });
      return;
    }

    const clients = await ReferralService.searchClients(search, parseInt(limit as string));
    
    res.status(200).json({
      status: true,
      message: 'Clients retrieved successfully',
      data: clients,
    });
  } catch (error) {
    console.error('Error searching clients:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to search clients',
    });
  }
};

/**
 * Send referral code to specific client
 */
export const sendReferralCodeToClient = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { clientId, benefits } = req.body;

    if (!clientId) {
      res.status(400).json({
        status: false,
        message: 'Client ID is required',
      });
      return;
    }

    const referralInvite = await ReferralService.sendReferralCodeToClient(
      req.userId,
      clientId,
      benefits
    );
    
    res.status(201).json({
      status: true,
      message: 'Referral code sent successfully',
      data: referralInvite,
    });
  } catch (error) {
    console.error('Error sending referral code:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to send referral code',
    });
  }
};

/**
 * Get client's received referral invites
 */
export const getClientReferralInvites = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const invites = await ReferralService.getClientReferralInvites(req.userId);
    
    res.status(200).json({
      status: true,
      message: 'Referral invites retrieved successfully',
      data: invites,
    });
  } catch (error) {
    console.error('Error fetching referral invites:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch referral invites',
    });
  }
};

/**
 * Apply referral code from invite
 */
export const applyReferralInvite = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { inviteId } = req.body;

    if (!inviteId) {
      res.status(400).json({
        status: false,
        message: 'Invite ID is required',
      });
      return;
    }

    const result = await ReferralService.applyReferralInvite(req.userId, inviteId);
    
    res.status(result.success ? 200 : 400).json({
      status: result.success,
      message: result.message,
      data: result.referrer,
    });
  } catch (error) {
    console.error('Error applying referral invite:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to apply referral invite',
    });
  }
};
