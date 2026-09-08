import { User } from '../models/user_model';
import { Subscription } from '../models/subscription_model';
import { Appointment } from '../models/appointment_model';
import { Review } from '../models/review_model';
import { Conversation } from '../models/conversation_model';
import { Message } from '../models/message_model';
import { Referral } from '../models/referral_model';
import { Op } from 'sequelize';
import {
  monthlyRecurringAmount,
  resolveBillingInterval,
} from './iap_product_map';

export class AnalyticsService {
  
  /**
   * Get platform overview statistics
   */
  static async getPlatformOverview() {
    try {
      const [
        totalUsers,
        totalClients,
        totalProviders,
        activeSubscriptions,
        totalAppointments,
        totalReviews,
        totalRevenue
      ] = await Promise.all([
        User.count(),
        User.count({ where: { role: 'client' } }),
        User.count({ where: { role: { [Op.in]: ['solo', 'suite'] } } }),
        Subscription.count({ where: { status: 'active' } }),
        Appointment.count(),
        Review.count({ where: { status: 'approved' } }),
        this.getTotalRevenue()
      ]);

      return {
        users: {
          total: totalUsers,
          clients: totalClients,
          providers: totalProviders,
        },
        subscriptions: {
          active: activeSubscriptions,
        },
        appointments: {
          total: totalAppointments,
        },
        reviews: {
          total: totalReviews,
        },
        revenue: {
          total: totalRevenue,
        },
      };
    } catch (error) {
      console.error('Error fetching platform overview:', error);
      throw error;
    }
  }

  /**
   * Get user growth analytics
   */
  static async getUserGrowthAnalytics(days: number = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const userGrowth = await User.findAll({
        where: {
          createdAt: {
            [Op.gte]: startDate,
          },
        },
        attributes: [
          [User.sequelize!.fn('DATE', User.sequelize!.col('createdAt')), 'date'],
          'role',
          [User.sequelize!.fn('COUNT', User.sequelize!.col('id')), 'count'],
        ],
        group: [
          User.sequelize!.fn('DATE', User.sequelize!.col('createdAt')),
          'role',
        ],
        order: [[User.sequelize!.fn('DATE', User.sequelize!.col('createdAt')), 'ASC']],
        raw: true,
      });

      return userGrowth;
    } catch (error) {
      console.error('Error fetching user growth analytics:', error);
      throw error;
    }
  }

  /**
   * Get subscription analytics
   */
  static async getSubscriptionAnalytics() {
    try {
      const [
        subscriptionsByPlan,
        subscriptionsByStatus,
        monthlyRecurringRevenue,
        churnRate
      ] = await Promise.all([
        this.getSubscriptionsByPlan(),
        this.getSubscriptionsByStatus(),
        this.getMonthlyRecurringRevenue(),
        this.getChurnRate()
      ]);

      return {
        byPlan: subscriptionsByPlan,
        byStatus: subscriptionsByStatus,
        mrr: monthlyRecurringRevenue,
        churnRate,
      };
    } catch (error) {
      console.error('Error fetching subscription analytics:', error);
      throw error;
    }
  }

  /**
   * Get appointment analytics
   */
  static async getAppointmentAnalytics(days: number = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [
        appointmentsByStatus,
        appointmentsByDate,
        averageAppointmentValue,
        topServices
      ] = await Promise.all([
        this.getAppointmentsByStatus(startDate),
        this.getAppointmentsByDate(startDate),
        this.getAverageAppointmentValue(startDate),
        this.getTopServices(startDate)
      ]);

      return {
        byStatus: appointmentsByStatus,
        byDate: appointmentsByDate,
        averageValue: averageAppointmentValue,
        topServices,
      };
    } catch (error) {
      console.error('Error fetching appointment analytics:', error);
      throw error;
    }
  }

  /**
   * Get review analytics
   */
  static async getReviewAnalytics() {
    try {
      const [
        reviewsByRating,
        averageRating,
        reviewsByStatus,
        topRatedProviders
      ] = await Promise.all([
        this.getReviewsByRating(),
        this.getAverageRating(),
        this.getReviewsByStatus(),
        this.getTopRatedProviders()
      ]);

      return {
        byRating: reviewsByRating,
        averageRating,
        byStatus: reviewsByStatus,
        topProviders: topRatedProviders,
      };
    } catch (error) {
      console.error('Error fetching review analytics:', error);
      throw error;
    }
  }

  /**
   * Get chat analytics
   */
  static async getChatAnalytics(days: number = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [
        totalConversations,
        activeConversations,
        totalMessages,
        averageMessagesPerConversation
      ] = await Promise.all([
        Conversation.count({
          where: {
            createdAt: {
              [Op.gte]: startDate,
            },
          },
        }),
        Conversation.count({
          where: {
            status: 'active',
            lastMessageAt: {
              [Op.gte]: startDate,
            },
          },
        }),
        Message.count({
          where: {
            createdAt: {
              [Op.gte]: startDate,
            },
          },
        }),
        this.getAverageMessagesPerConversation(startDate)
      ]);

      return {
        totalConversations,
        activeConversations,
        totalMessages,
        averageMessagesPerConversation,
      };
    } catch (error) {
      console.error('Error fetching chat analytics:', error);
      throw error;
    }
  }

  /**
   * Get referral analytics
   */
  static async getReferralAnalytics() {
    try {
      const [
        totalReferrals,
        activeReferrals,
        topReferrers,
        referralConversionRate
      ] = await Promise.all([
        Referral.count(),
        Referral.count({ where: { status: 'active' } }),
        this.getTopReferrers(),
        this.getReferralConversionRate()
      ]);

      return {
        totalReferrals,
        activeReferrals,
        topReferrers,
        conversionRate: referralConversionRate,
      };
    } catch (error) {
      console.error('Error fetching referral analytics:', error);
      throw error;
    }
  }

  /**
   * Get provider performance analytics
   */
  static async getProviderPerformance(providerId: string, days: number = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [
        totalAppointments,
        completedAppointments,
        totalRevenue,
        averageRating,
        totalReviews,
        responseRate
      ] = await Promise.all([
        Appointment.count({
          where: {
            marketplaceId: providerId,
            createdAt: {
              [Op.gte]: startDate,
            },
          },
        }),
        Appointment.count({
          where: {
            marketplaceId: providerId,
            status: 'availed',
            createdAt: {
              [Op.gte]: startDate,
            },
          },
        }),
        this.getProviderRevenue(providerId, startDate),
        this.getProviderAverageRating(providerId),
        Review.count({
          where: {
            providerId,
            createdAt: {
              [Op.gte]: startDate,
            },
          },
        }),
        this.getProviderResponseRate(providerId)
      ]);

      return {
        appointments: {
          total: totalAppointments,
          completed: completedAppointments,
          completionRate: totalAppointments > 0 ? (completedAppointments / totalAppointments) * 100 : 0,
        },
        revenue: totalRevenue,
        rating: {
          average: averageRating,
          totalReviews,
        },
        responseRate,
      };
    } catch (error) {
      console.error('Error fetching provider performance:', error);
      throw error;
    }
  }

  // Private helper methods

  private static async getTotalRevenue(): Promise<number> {
    const result = await Appointment.findOne({
      where: {
        status: 'availed',
      },
      attributes: [
        [Appointment.sequelize!.fn('SUM', Appointment.sequelize!.col('price')), 'total'],
      ],
      raw: true,
    }) as any;

    return parseFloat(result?.total || '0');
  }

  private static async getSubscriptionsByPlan() {
    return await Subscription.findAll({
      attributes: [
        'planType',
        [Subscription.sequelize!.fn('COUNT', Subscription.sequelize!.col('id')), 'count'],
      ],
      group: ['planType'],
      raw: true,
    });
  }

  private static async getSubscriptionsByStatus() {
    return await Subscription.findAll({
      attributes: [
        'status',
        [Subscription.sequelize!.fn('COUNT', Subscription.sequelize!.col('id')), 'count'],
      ],
      group: ['status'],
      raw: true,
    });
  }

  private static async getMonthlyRecurringRevenue(): Promise<number> {
    const active = await Subscription.findAll({
      where: { status: { [Op.in]: ['active', 'trialing'] } },
      attributes: ['planType', 'metadata'],
    });

    const mrr = active.reduce((sum, row) => {
      return (
        sum +
        monthlyRecurringAmount(row.planType, resolveBillingInterval(row.metadata))
      );
    }, 0);

    return parseFloat(mrr.toFixed(2));
  }

  private static async getChurnRate(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalActive, canceled] = await Promise.all([
      Subscription.count({
        where: {
          status: 'active',
          createdAt: {
            [Op.lt]: thirtyDaysAgo,
          },
        },
      }),
      Subscription.count({
        where: {
          status: 'canceled',
          updatedAt: {
            [Op.gte]: thirtyDaysAgo,
          },
        },
      }),
    ]);

    return totalActive > 0 ? (canceled / totalActive) * 100 : 0;
  }

  private static async getAppointmentsByStatus(startDate: Date) {
    return await Appointment.findAll({
      where: {
        createdAt: {
          [Op.gte]: startDate,
        },
      },
      attributes: [
        'status',
        [Appointment.sequelize!.fn('COUNT', Appointment.sequelize!.col('id')), 'count'],
      ],
      group: ['status'],
      raw: true,
    });
  }

  private static async getAppointmentsByDate(startDate: Date) {
    return await Appointment.findAll({
      where: {
        createdAt: {
          [Op.gte]: startDate,
        },
      },
      attributes: [
        [Appointment.sequelize!.fn('DATE', Appointment.sequelize!.col('createdAt')), 'date'],
        [Appointment.sequelize!.fn('COUNT', Appointment.sequelize!.col('id')), 'count'],
      ],
      group: [Appointment.sequelize!.fn('DATE', Appointment.sequelize!.col('createdAt'))],
      order: [[Appointment.sequelize!.fn('DATE', Appointment.sequelize!.col('createdAt')), 'ASC']],
      raw: true,
    });
  }

  private static async getAverageAppointmentValue(startDate: Date): Promise<number> {
    const result = await Appointment.findOne({
      where: {
        createdAt: {
          [Op.gte]: startDate,
        },
        status: 'availed',
      },
      attributes: [
        [Appointment.sequelize!.fn('AVG', Appointment.sequelize!.col('price')), 'average'],
      ],
      raw: true,
    }) as any;

    return parseFloat(result?.average || '0');
  }

  private static async getTopServices(startDate: Date) {
    // This would require joining with appointment services
    // For now, return placeholder
    return [];
  }

  private static async getReviewsByRating() {
    return await Review.findAll({
      where: {
        status: 'approved',
      },
      attributes: [
        'rating',
        [Review.sequelize!.fn('COUNT', Review.sequelize!.col('id')), 'count'],
      ],
      group: ['rating'],
      order: [['rating', 'ASC']],
      raw: true,
    });
  }

  private static async getAverageRating(): Promise<number> {
    const result = await Review.findOne({
      where: {
        status: 'approved',
      },
      attributes: [
        [Review.sequelize!.fn('AVG', Review.sequelize!.col('rating')), 'average'],
      ],
      raw: true,
    }) as any;

    return parseFloat(result?.average || '0');
  }

  private static async getReviewsByStatus() {
    return await Review.findAll({
      attributes: [
        'status',
        [Review.sequelize!.fn('COUNT', Review.sequelize!.col('id')), 'count'],
      ],
      group: ['status'],
      raw: true,
    });
  }

  private static async getTopRatedProviders(limit: number = 10) {
    return await Review.findAll({
      where: {
        status: 'approved',
      },
      attributes: [
        'providerId',
        [Review.sequelize!.fn('AVG', Review.sequelize!.col('rating')), 'averageRating'],
        [Review.sequelize!.fn('COUNT', Review.sequelize!.col('id')), 'reviewCount'],
      ],
      group: ['providerId'],
      having: Review.sequelize!.where(
        Review.sequelize!.fn('COUNT', Review.sequelize!.col('id')),
        Op.gte,
        5
      ),
      order: [[Review.sequelize!.fn('AVG', Review.sequelize!.col('rating')), 'DESC']],
      limit,
      raw: true,
    });
  }

  private static async getAverageMessagesPerConversation(startDate: Date): Promise<number> {
    const result = await Message.findOne({
      include: [
        {
          model: Conversation,
          as: 'conversation',
          where: {
            createdAt: {
              [Op.gte]: startDate,
            },
          },
        },
      ],
      attributes: [
        [Message.sequelize!.fn('COUNT', Message.sequelize!.col('Message.id')), 'totalMessages'],
        [Message.sequelize!.fn('COUNT', Message.sequelize!.fn('DISTINCT', Message.sequelize!.col('conversationId'))), 'totalConversations'],
      ],
      raw: true,
    }) as any;

    const totalMessages = parseInt(result?.totalMessages || '0');
    const totalConversations = parseInt(result?.totalConversations || '0');

    return totalConversations > 0 ? totalMessages / totalConversations : 0;
  }

  private static async getTopReferrers(limit: number = 10) {
    return await Referral.findAll({
      attributes: [
        'referrerId',
        [Referral.sequelize!.fn('COUNT', Referral.sequelize!.col('id')), 'referralCount'],
      ],
      group: ['referrerId'],
      order: [[Referral.sequelize!.fn('COUNT', Referral.sequelize!.col('id')), 'DESC']],
      limit,
      raw: true,
    });
  }

  private static async getReferralConversionRate(): Promise<number> {
    const [totalReferrals, activeReferrals] = await Promise.all([
      Referral.count(),
      Referral.count({ where: { status: 'active' } }),
    ]);

    return totalReferrals > 0 ? (activeReferrals / totalReferrals) * 100 : 0;
  }

  private static async getProviderRevenue(providerId: string, startDate: Date): Promise<number> {
    const result = await Appointment.findOne({
      where: {
        marketplaceId: providerId,
        status: 'availed',
        createdAt: {
          [Op.gte]: startDate,
        },
      },
      attributes: [
        [Appointment.sequelize!.fn('SUM', Appointment.sequelize!.col('price')), 'total'],
      ],
      raw: true,
    }) as any;

    return parseFloat(result?.total || '0');
  }

  private static async getProviderAverageRating(providerId: string): Promise<number> {
    const result = await Review.findOne({
      where: {
        providerId,
        status: 'approved',
      },
      attributes: [
        [Review.sequelize!.fn('AVG', Review.sequelize!.col('rating')), 'average'],
      ],
      raw: true,
    }) as any;

    return parseFloat(result?.average || '0');
  }

  private static async getProviderResponseRate(providerId: string): Promise<number> {
    const [totalConversations, respondedConversations] = await Promise.all([
      Conversation.count({
        where: {
          providerId,
        },
      }),
      Conversation.count({
        where: {
          providerId,
          providerHasResponded: true,
        },
      }),
    ]);

    return totalConversations > 0 ? (respondedConversations / totalConversations) * 100 : 0;
  }
}
