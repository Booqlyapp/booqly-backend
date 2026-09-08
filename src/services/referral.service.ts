import { User } from '../models/user_model';
import { Referral } from '../models/referral_model';
import { ReferralInvite } from '../models/referral_invite_model';
import { Marketplace } from '../models/marketplace_model';
import { SubscriptionService } from './subscription.service';
import { NotificationService } from './notification.service';
import { Op } from 'sequelize';
import crypto from 'crypto';

export class ReferralService {
  
  /**
   * Generate a custom referral code for a provider
   */
  static async generateReferralCode(providerId: string, customCode: string): Promise<string> {
    try {
      const provider = await User.findByPk(providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }

      // Check if provider has access to referral features
      const hasAccess = await SubscriptionService.hasFeatureAccess(providerId, 'custom_referral_codes');
      if (!hasAccess) {
        throw new Error('Referral feature requires Pro or Premium subscription');
      }

      // Validate custom code format
      if (!customCode || customCode.length < 6 || customCode.length > 12) {
        throw new Error('Referral code must be 6-12 characters long');
      }

      if (!/^[A-Z0-9]+$/.test(customCode)) {
        throw new Error('Referral code must contain only letters and numbers');
      }

      // Check if code already exists
      const existingUser = await User.findOne({
        where: { referralCode: customCode },
      });

      if (existingUser) {
        throw new Error('This referral code is already taken. Please choose a different one.');
      }

      // Update provider with custom referral code
      await provider.update({ referralCode: customCode });

      return customCode;
    } catch (error) {
      console.error('Error creating referral code:', error);
      throw error;
    }
  }

  /**
   * Apply referral code to a client
   */
  static async applyReferralCode(clientId: string, referralCode: string): Promise<{
    success: boolean;
    message: string;
    referrer?: User;
  }> {
    try {
      const client = await User.findByPk(clientId);
      if (!client) {
        throw new Error('Client not found');
      }

      if (client.role !== 'client') {
        throw new Error('Only clients can use referral codes');
      }

      // Find provider with this referral code
      const referrer = await User.findOne({
        where: { referralCode },
        attributes: ['id', 'name', 'email', 'role'],
      });

      if (!referrer) {
        return {
          success: false,
          message: 'Invalid referral code',
        };
      }

      if (referrer.role !== 'solo' && referrer.role !== 'suite') {
        return {
          success: false,
          message: 'Invalid referral code',
        };
      }

      // Check if referral already exists
      const existingReferral = await Referral.findOne({
        where: {
          referrerId: referrer.id,
          referredUserId: clientId,
        },
      });

      if (existingReferral) {
        return {
          success: true,
          message: 'Referral code already applied',
          referrer,
        };
      }

      // Create referral record
      await Referral.create({
        referrerId: referrer.id,
        referredUserId: clientId,
        referralCode,
        status: 'active',
      });

      // Update client's referredBy field
      await client.update({ referredBy: referrer.id });

      // Send notification to referrer
      try {
        await NotificationService.createNotification({
          userId: referrer.id,
          type: 'subscription',
          title: 'New Referral',
          content: `${client.name || 'A new client'} used your referral code`,
          data: {
            clientId,
            referralCode,
          },
        });
      } catch (notificationError) {
        console.error('Failed to send referral notification:', notificationError);
      }

      return {
        success: true,
        message: 'Referral code applied successfully',
        referrer,
      };
    } catch (error) {
      console.error('Error applying referral code:', error);
      throw error;
    }
  }

  /**
   * Get referrals for a provider
   */
  static async getProviderReferrals(providerId: string, page: number = 1, limit: number = 20) {
    try {
      const offset = (page - 1) * limit;

      const { count, rows: referrals } = await Referral.findAndCountAll({
        where: { referrerId: providerId },
        include: [
          {
            model: User,
            as: 'referredUser',
            attributes: ['id', 'name', 'email', 'createdAt'],
          },
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      return {
        referrals,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      };
    } catch (error) {
      console.error('Error fetching provider referrals:', error);
      throw error;
    }
  }

  /**
   * Get client's referred providers
   */
  static async getClientReferredProviders(clientId: string) {
    try {
      const referrals = await Referral.findAll({
        where: { referredUserId: clientId, status: 'active' },
        include: [
          {
            model: User,
            as: 'referrer',
            attributes: ['id', 'name', 'email', 'profilePic'],
            include: [
              {
                model: Marketplace,
                as: 'marketplace',
                attributes: ['businessName', 'bio', 'address'],
              },
            ],
          },
        ],
      });

      return referrals.map(referral => (referral as any).referrer);
    } catch (error) {
      console.error('Error fetching referred providers:', error);
      throw error;
    }
  }

  /**
   * Check if client is referred to a specific provider
   */
  static async isClientReferredToProvider(clientId: string, providerId: string): Promise<boolean> {
    try {
      const referral = await Referral.findOne({
        where: {
          referrerId: providerId,
          referredUserId: clientId,
          status: 'active',
        },
      });

      return !!referral;
    } catch (error) {
      console.error('Error checking referral status:', error);
      return false;
    }
  }

  /**
   * Remove referral (deactivate)
   */
  static async removeReferral(clientId: string, providerId: string): Promise<void> {
    try {
      await Referral.update(
        { status: 'inactive' },
        {
          where: {
            referrerId: providerId,
            referredUserId: clientId,
          },
        }
      );
    } catch (error) {
      console.error('Error removing referral:', error);
      throw error;
    }
  }

  /**
   * Get referral statistics for a provider
   */
  static async getProviderReferralStats(providerId: string) {
    try {
      const totalReferrals = await Referral.count({
        where: { referrerId: providerId },
      });

      const activeReferrals = await Referral.count({
        where: { referrerId: providerId, status: 'active' },
      });

      // Get referrals by month (last 12 months)
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const monthlyReferrals = await Referral.findAll({
        where: {
          referrerId: providerId,
          createdAt: {
            [require('sequelize').Op.gte]: twelveMonthsAgo,
          },
        },
        attributes: [
          [Referral.sequelize!.fn('DATE_TRUNC', 'month', Referral.sequelize!.col('createdAt')), 'month'],
          [Referral.sequelize!.fn('COUNT', Referral.sequelize!.col('id')), 'count'],
        ],
        group: [Referral.sequelize!.fn('DATE_TRUNC', 'month', Referral.sequelize!.col('createdAt'))],
        order: [[Referral.sequelize!.fn('DATE_TRUNC', 'month', Referral.sequelize!.col('createdAt')), 'ASC']],
        raw: true,
      });

      return {
        totalReferrals,
        activeReferrals,
        monthlyReferrals,
      };
    } catch (error) {
      console.error('Error fetching referral stats:', error);
      throw error;
    }
  }

  /**
   * Validate referral code format
   */
  static validateReferralCode(code: string): boolean {
    // Referral codes should be 6-12 characters, alphanumeric
    const regex = /^[A-Z0-9]{6,12}$/;
    return regex.test(code);
  }

  /**
   * Get provider's referral code
   */
  static async getProviderReferralCode(providerId: string): Promise<string | null> {
    try {
      const provider = await User.findByPk(providerId, {
        attributes: ['referralCode'],
      });

      return provider?.referralCode || null;
    } catch (error) {
      console.error('Error fetching referral code:', error);
      return null;
    }
  }

  /**
   * Delete (clear) a provider's referral code. Existing clients who already
   * redeemed it keep their free access (the `Referral` rows are untouched) —
   * this only stops the code from being shareable/redeemable going forward.
   */
  static async deleteReferralCode(providerId: string): Promise<void> {
    const provider = await User.findByPk(providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    await provider.update({ referralCode: null });
  }

  /**
   * Search for clients by name or email
   */
  static async searchClients(searchTerm: string, limit: number = 10): Promise<User[]> {
    try {
      const clients = await User.findAll({
        where: {
          role: 'client',
          [Op.or]: [
            { name: { [Op.iLike]: `%${searchTerm}%` } },
            { email: { [Op.iLike]: `%${searchTerm}%` } },
          ],
        },
        attributes: ['id', 'name', 'email', 'profilePic'],
        limit,
        order: [['name', 'ASC']],
      });

      return clients;
    } catch (error) {
      console.error('Error searching clients:', error);
      throw error;
    }
  }

  /**
   * Send referral code to a specific client
   */
  static async sendReferralCodeToClient(
    providerId: string,
    clientId: string,
    benefits?: string
  ): Promise<ReferralInvite> {
    try {
      // Get provider details
      const provider = await User.findByPk(providerId, {
        attributes: ['id', 'name', 'businessName', 'referralCode'],
      });

      if (!provider) {
        throw new Error('Provider not found');
      }

      if (!provider.referralCode) {
        throw new Error('Provider does not have a referral code. Generate one first.');
      }

      // Get client details
      const client = await User.findByPk(clientId, {
        attributes: ['id', 'name', 'email', 'role'],
      });

      if (!client) {
        throw new Error('Client not found');
      }

      if (client.role !== 'client') {
        throw new Error('Can only send referral codes to clients');
      }

      // Check if invite already exists and is pending
      const existingInvite = await ReferralInvite.findOne({
        where: {
          providerId,
          clientId,
          status: 'pending',
        },
      });

      if (existingInvite) {
        throw new Error('Referral code already sent to this client');
      }

      // Create referral invite
      const referralInvite = await ReferralInvite.create({
        providerId,
        clientId,
        referralCode: provider.referralCode,
        providerName: provider.name || 'Provider',
        providerBusinessName: provider.businessName,
        benefits: benefits || 'Free access to book appointments and message this provider',
        status: 'pending',
        sentAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });

      // Send notification to client
      await NotificationService.createNotification({
        userId: clientId,
        type: 'subscription',
        title: 'Referral Code Received',
        content: `${provider.name || provider.businessName || 'A provider'} sent you a referral code`,
        data: {
          referralInviteId: referralInvite.id,
          providerId,
          referralCode: provider.referralCode,
        },
      });

      return referralInvite;
    } catch (error) {
      console.error('Error sending referral code:', error);
      throw error;
    }
  }

  /**
   * Get referral invites received by a client
   */
  static async getClientReferralInvites(clientId: string): Promise<ReferralInvite[]> {
    try {
      const invites = await ReferralInvite.findAll({
        where: {
          clientId,
          status: { [Op.in]: ['pending', 'applied'] },
        },
        order: [['sentAt', 'DESC']],
      });

      return invites;
    } catch (error) {
      console.error('Error fetching client referral invites:', error);
      throw error;
    }
  }

  /**
   * Apply referral code from invite
   */
  static async applyReferralInvite(clientId: string, inviteId: string): Promise<{
    success: boolean;
    message: string;
    referrer?: User;
  }> {
    try {
      // Get the invite
      const invite = await ReferralInvite.findByPk(inviteId);

      if (!invite) {
        return {
          success: false,
          message: 'Referral invite not found',
        };
      }

      if (invite.clientId !== clientId) {
        return {
          success: false,
          message: 'Unauthorized access to referral invite',
        };
      }

      if (invite.status !== 'pending') {
        return {
          success: false,
          message: 'Referral code already applied or expired',
        };
      }

      if (invite.expiresAt && invite.expiresAt < new Date()) {
        // Mark as expired
        await invite.update({ status: 'expired' });
        return {
          success: false,
          message: 'Referral code has expired',
        };
      }

      // Apply the referral code using existing logic
      const result = await this.applyReferralCode(clientId, invite.referralCode);

      if (result.success) {
        // Update invite status
        await invite.update({
          status: 'applied',
          appliedAt: new Date(),
        });
      } else if (result.message === 'Referral code already applied') {
        await invite.update({
          status: 'applied',
          appliedAt: invite.appliedAt ?? new Date(),
        });
        return {
          success: true,
          message: result.message,
          referrer: result.referrer,
        };
      }

      return result;
    } catch (error) {
      console.error('Error applying referral invite:', error);
      throw error;
    }
  }

  /**
   * Generate Booqly Pass URL for sharing
   */
  static generateBooqlyPassUrl(referralCode: string, baseUrl: string = 'https://booqly.app'): string {
    return `${baseUrl}/join?ref=${referralCode}`;
  }
}
