import { Request, Response } from 'express';
import { ProviderAnalyticsService } from '../services/provider_analytics.service';
import { Marketplace } from '../models/marketplace_model';
import { Appointment } from '../models/appointment_model';
import { Service } from '../models/service_model';
import { Op, Sequelize } from 'sequelize';

interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

/**
 * Get provider analytics based on subscription level
 * - Solo Basic: No analytics access
 * - Solo Pro: Basic analytics
 * - Solo Premium: Advanced analytics
 */
export const getProviderAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { marketplaceId } = req.params;
    const { startDate, endDate } = req.query;

    // Verify marketplace belongs to user
    const marketplace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
        userId: req.userId,
      },
    });

    if (!marketplace) {
      res.status(404).json({
        status: false,
        message: 'Marketplace not found or access denied',
      });
      return;
    }

    // Check analytics access level
    const access = await ProviderAnalyticsService.checkAnalyticsAccess(req.userId);

    if (!access.hasBasic && !access.hasAdvanced) {
      res.status(403).json({
        status: false,
        message: 'Analytics access requires Solo Pro or Premium subscription',
        upgrade: {
          required: true,
          minPlan: 'solo_pro',
          feature: 'basic_booking_analytics',
        },
      });
      return;
    }

    // Parse date range
    const dateRange = {
      startDate: startDate ? new Date(startDate as string) : getDefaultStartDate(),
      endDate: endDate ? new Date(endDate as string) : new Date(),
    };

    // Get analytics based on subscription level
    let analytics;
    if (access.hasAdvanced) {
      analytics = await ProviderAnalyticsService.getAdvancedAnalytics(
        marketplaceId,
        dateRange
      );
    } else {
      analytics = await ProviderAnalyticsService.getBasicAnalytics(
        marketplaceId,
        dateRange
      );
    }

    res.status(200).json({
      status: true,
      message: 'Analytics retrieved successfully',
      data: {
        analytics,
        accessLevel: access.hasAdvanced ? 'advanced' : 'basic',
        dateRange,
      },
    });
  } catch (error) {
    console.error('Error fetching provider analytics:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch analytics',
    });
  }
};

/**
 * Get analytics overview (summary stats)
 */
export const getAnalyticsOverview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { marketplaceId } = req.params;

    // Verify marketplace belongs to user
    const marketplace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
        userId: req.userId,
      },
    });

    if (!marketplace) {
      res.status(404).json({
        status: false,
        message: 'Marketplace not found or access denied',
      });
      return;
    }

    // Check analytics access
    const access = await ProviderAnalyticsService.checkAnalyticsAccess(req.userId);

    if (!access.hasBasic && !access.hasAdvanced) {
      res.status(403).json({
        status: false,
        message: 'Analytics access requires Solo Pro or Premium subscription',
      });
      return;
    }

    // Get current month analytics
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const analytics = access.hasAdvanced
      ? await ProviderAnalyticsService.getAdvancedAnalytics(marketplaceId, {
          startDate: startOfMonth,
          endDate: endOfMonth,
        })
      : await ProviderAnalyticsService.getBasicAnalytics(marketplaceId, {
          startDate: startOfMonth,
          endDate: endOfMonth,
        });

    res.status(200).json({
      status: true,
      message: 'Analytics overview retrieved successfully',
      data: {
        overview: analytics.overview,
        accessLevel: access.hasAdvanced ? 'advanced' : 'basic',
      },
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch analytics overview',
    });
  }
};

/**
 * Get earnings summary (today, this week, this month)
 */
export const getEarningsSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { marketplaceId } = req.params;

    // Verify marketplace belongs to user
    const marketplace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
        userId: req.userId,
      },
    });

    if (!marketplace) {
      res.status(404).json({
        status: false,
        message: 'Marketplace not found or access denied',
      });
      return;
    }

    // Check analytics access
    const access = await ProviderAnalyticsService.checkAnalyticsAccess(req.userId);

    if (!access.hasBasic && !access.hasAdvanced) {
      res.status(403).json({
        status: false,
        message: 'Analytics access requires Solo Pro or Premium subscription',
      });
      return;
    }

    const now = new Date();

    // Today
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    // This week
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // This month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayAnalytics, weekAnalytics, monthAnalytics] = await Promise.all([
      ProviderAnalyticsService.getBasicAnalytics(marketplaceId, {
        startDate: startOfToday,
        endDate: endOfToday,
      }),
      ProviderAnalyticsService.getBasicAnalytics(marketplaceId, {
        startDate: startOfWeek,
        endDate: now,
      }),
      ProviderAnalyticsService.getBasicAnalytics(marketplaceId, {
        startDate: startOfMonth,
        endDate: now,
      }),
    ]);

    res.status(200).json({
      status: true,
      message: 'Earnings summary retrieved successfully',
      data: {
        today: todayAnalytics.overview.totalRevenue,
        thisWeek: weekAnalytics.overview.totalRevenue,
        thisMonth: monthAnalytics.overview.totalRevenue,
      },
    });
  } catch (error) {
    console.error('Error fetching earnings summary:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch earnings summary',
    });
  }
};

/**
 * Check analytics access level
 */
export const checkAnalyticsAccess = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const access = await ProviderAnalyticsService.checkAnalyticsAccess(req.userId);

    res.status(200).json({
      status: true,
      message: 'Analytics access checked successfully',
      data: {
        hasBasic: access.hasBasic,
        hasAdvanced: access.hasAdvanced,
        accessLevel: access.hasAdvanced ? 'advanced' : access.hasBasic ? 'basic' : 'none',
      },
    });
  } catch (error) {
    console.error('Error checking analytics access:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to check analytics access',
    });
  }
};

/**
 * Get dashboard summary for the analytics_view
 * Returns: earnings, upcoming appointments, top service, booking stats, revenue by service
 * Supports ?period=weekly|monthly|yearly (default: weekly)
 * No subscription gating — available to all providers
 */
export const getDashboardSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { marketplaceId } = req.params;
    const period = (req.query.period as string) || 'weekly';

    const marketplace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
        userId: req.userId,
      },
    });

    if (!marketplace) {
      res.status(404).json({
        status: false,
        message: 'Marketplace not found or access denied',
      });
      return;
    }

    const now = new Date();

    // Calculate date ranges based on period
    let periodStart: Date;
    let periodEnd: Date;
    let prevPeriodStart: Date;
    let prevPeriodEnd: Date;

    if (period === 'monthly') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now);
      periodEnd.setHours(23, 59, 59, 999);
      prevPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevPeriodEnd = new Date(periodStart);
      prevPeriodEnd.setMilliseconds(-1);
    } else if (period === 'yearly') {
      periodStart = new Date(now.getFullYear(), 0, 1);
      periodEnd = new Date(now);
      periodEnd.setHours(23, 59, 59, 999);
      prevPeriodStart = new Date(now.getFullYear() - 1, 0, 1);
      prevPeriodEnd = new Date(periodStart);
      prevPeriodEnd.setMilliseconds(-1);
    } else {
      // weekly (default)
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - now.getDay());
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(now);
      periodEnd.setHours(23, 59, 59, 999);
      prevPeriodStart = new Date(periodStart);
      prevPeriodStart.setDate(prevPeriodStart.getDate() - 7);
      prevPeriodEnd = new Date(periodStart);
      prevPeriodEnd.setMilliseconds(-1);
    }

    // Earnings for the period
    const [currentResult, prevResult] = await Promise.all([
      Appointment.findOne({
        where: {
          marketplaceId,
          status: 'availed',
          createdAt: { [Op.between]: [periodStart, periodEnd] },
        },
        attributes: [
          [Sequelize.fn('SUM', Sequelize.col('price')), 'revenue'],
        ],
        raw: true,
      }) as any,
      Appointment.findOne({
        where: {
          marketplaceId,
          status: 'availed',
          createdAt: { [Op.between]: [prevPeriodStart, prevPeriodEnd] },
        },
        attributes: [
          [Sequelize.fn('SUM', Sequelize.col('price')), 'revenue'],
        ],
        raw: true,
      }) as any,
    ]);

    const periodEarnings = parseFloat(currentResult?.revenue || '0');
    const prevEarnings = parseFloat(prevResult?.revenue || '0');
    const earningsGrowth = prevEarnings > 0
      ? ((periodEarnings - prevEarnings) / prevEarnings) * 100
      : 0;

    // Upcoming appointments (pending, future dateTime)
    const upcomingCount = await Appointment.count({
      where: {
        marketplaceId,
        status: 'pending',
        dateTime: { [Op.gte]: now },
      },
    });

    // Previous period booking count (for growth)
    const [currentBookingCount, prevBookingCount] = await Promise.all([
      Appointment.count({
        where: {
          marketplaceId,
          createdAt: { [Op.between]: [periodStart, periodEnd] },
        },
      }),
      Appointment.count({
        where: {
          marketplaceId,
          createdAt: { [Op.between]: [prevPeriodStart, prevPeriodEnd] },
        },
      }),
    ]);
    const bookingGrowth = prevBookingCount > 0
      ? ((currentBookingCount - prevBookingCount) / prevBookingCount) * 100
      : 0;

    // Top performing service (within this period)
    const topServiceResult = await Appointment.findAll({
      where: {
        marketplaceId,
        createdAt: { [Op.between]: [periodStart, periodEnd] },
      },
      attributes: [
        'serviceId',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'bookings'],
      ],
      group: ['serviceId'],
      order: [[Sequelize.fn('COUNT', Sequelize.col('id')), 'DESC']],
      limit: 1,
      raw: true,
    }) as any[];

    let topService: { serviceId: string; serviceName: string; bookings: number } | null = null;
    if (topServiceResult.length > 0) {
      const service = await Service.findByPk(topServiceResult[0].serviceId, {
        attributes: ['id', 'name'],
        raw: true,
      }) as any;
      topService = {
        serviceId: topServiceResult[0].serviceId,
        serviceName: service?.name || 'Unknown',
        bookings: parseInt(topServiceResult[0].bookings),
      };
    }

    // Booking stats grouped by date within the period
    const bookingsInPeriod = await Appointment.findAll({
      where: {
        marketplaceId,
        createdAt: { [Op.between]: [periodStart, periodEnd] },
      },
      attributes: [
        [Sequelize.fn('DATE', Sequelize.col('createdAt')), 'date'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'bookings'],
      ],
      group: [Sequelize.fn('DATE', Sequelize.col('createdAt'))],
      order: [[Sequelize.fn('DATE', Sequelize.col('createdAt')), 'ASC']],
      raw: true,
    }) as any[];

    const bookingStats = bookingsInPeriod.map(b => ({
      date: b.date,
      bookings: parseInt(b.bookings || '0'),
    }));

    // Revenue by service within the period
    const revenueByService = await Appointment.findAll({
      where: {
        marketplaceId,
        status: 'availed',
        createdAt: { [Op.between]: [periodStart, periodEnd] },
      },
      attributes: [
        'serviceId',
        [Sequelize.fn('SUM', Sequelize.col('price')), 'revenue'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'bookings'],
      ],
      group: ['serviceId'],
      order: [[Sequelize.fn('SUM', Sequelize.col('price')), 'DESC']],
      limit: 5,
      raw: true,
    }) as any[];

    const serviceIds = revenueByService.map(r => r.serviceId);
    const services = serviceIds.length > 0 ? await Service.findAll({
      where: { id: { [Op.in]: serviceIds } },
      attributes: ['id', 'name'],
      raw: true,
    }) as any[] : [];
    const serviceMap = new Map(services.map(s => [s.id, s.name]));

    const revenueByServiceData = revenueByService.map(r => ({
      serviceId: r.serviceId,
      serviceName: serviceMap.get(r.serviceId) || 'Unknown',
      revenue: parseFloat(r.revenue || '0'),
      bookings: parseInt(r.bookings || '0'),
    }));

    res.status(200).json({
      status: true,
      message: 'Dashboard summary retrieved successfully',
      data: {
        period,
        periodEarnings,
        earningsGrowth,
        upcomingAppointments: upcomingCount,
        bookingGrowth,
        topService,
        bookingStats,
        revenueByService: revenueByServiceData,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch dashboard summary',
    });
  }
};

// Helper function to get default start date (30 days ago)
function getDefaultStartDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date;
}
