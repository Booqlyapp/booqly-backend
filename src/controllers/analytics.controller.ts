import { Request, Response } from 'express';
import { AnalyticsService } from '../services/analytics.service';

interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

/**
 * Get platform overview statistics (admin only)
 */
export const getPlatformOverview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // TODO: Add admin role check
    // if (req.user?.role !== 'admin') {
    //   res.status(403).json({
    //     status: false,
    //     message: 'Admin access required',
    //   });
    //   return;
    // }

    const overview = await AnalyticsService.getPlatformOverview();

    res.status(200).json({
      status: true,
      message: 'Platform overview retrieved successfully',
      data: overview,
    });
  } catch (error) {
    console.error('Error fetching platform overview:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch platform overview',
    });
  }
};

/**
 * Get user growth analytics (admin only)
 */
export const getUserGrowthAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // TODO: Add admin role check
    const { days = 30 } = req.query;

    const analytics = await AnalyticsService.getUserGrowthAnalytics(parseInt(days as string));

    res.status(200).json({
      status: true,
      message: 'User growth analytics retrieved successfully',
      data: analytics,
    });
  } catch (error) {
    console.error('Error fetching user growth analytics:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch user growth analytics',
    });
  }
};

/**
 * Get subscription analytics (admin only)
 */
export const getSubscriptionAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // TODO: Add admin role check
    const analytics = await AnalyticsService.getSubscriptionAnalytics();

    res.status(200).json({
      status: true,
      message: 'Subscription analytics retrieved successfully',
      data: analytics,
    });
  } catch (error) {
    console.error('Error fetching subscription analytics:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch subscription analytics',
    });
  }
};

/**
 * Get appointment analytics (admin only)
 */
export const getAppointmentAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // TODO: Add admin role check
    const { days = 30 } = req.query;

    const analytics = await AnalyticsService.getAppointmentAnalytics(parseInt(days as string));

    res.status(200).json({
      status: true,
      message: 'Appointment analytics retrieved successfully',
      data: analytics,
    });
  } catch (error) {
    console.error('Error fetching appointment analytics:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch appointment analytics',
    });
  }
};

/**
 * Get review analytics (admin only)
 */
export const getReviewAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // TODO: Add admin role check
    const analytics = await AnalyticsService.getReviewAnalytics();

    res.status(200).json({
      status: true,
      message: 'Review analytics retrieved successfully',
      data: analytics,
    });
  } catch (error) {
    console.error('Error fetching review analytics:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch review analytics',
    });
  }
};

/**
 * Get chat analytics (admin only)
 */
export const getChatAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // TODO: Add admin role check
    const { days = 30 } = req.query;

    const analytics = await AnalyticsService.getChatAnalytics(parseInt(days as string));

    res.status(200).json({
      status: true,
      message: 'Chat analytics retrieved successfully',
      data: analytics,
    });
  } catch (error) {
    console.error('Error fetching chat analytics:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch chat analytics',
    });
  }
};

/**
 * Get referral analytics (admin only)
 */
export const getReferralAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // TODO: Add admin role check
    const analytics = await AnalyticsService.getReferralAnalytics();

    res.status(200).json({
      status: true,
      message: 'Referral analytics retrieved successfully',
      data: analytics,
    });
  } catch (error) {
    console.error('Error fetching referral analytics:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch referral analytics',
    });
  }
};

/**
 * Get provider performance analytics (providers can view their own)
 */
export const getProviderPerformance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { providerId } = req.params;
    const { days = 30 } = req.query;

    // Providers can only view their own analytics
    // TODO: Add proper provider ID validation
    // if (req.user?.role !== 'admin' && req.userId !== providerId) {
    //   res.status(403).json({
    //     status: false,
    //     message: 'Access denied',
    //   });
    //   return;
    // }

    const analytics = await AnalyticsService.getProviderPerformance(
      providerId,
      parseInt(days as string)
    );

    res.status(200).json({
      status: true,
      message: 'Provider performance analytics retrieved successfully',
      data: analytics,
    });
  } catch (error) {
    console.error('Error fetching provider performance:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch provider performance analytics',
    });
  }
};
