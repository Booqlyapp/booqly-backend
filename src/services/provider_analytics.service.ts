import { Appointment } from '../models/appointment_model';
import { User } from '../models/user_model';
import { Service } from '../models/service_model';
import { Marketplace } from '../models/marketplace_model';
import { Op, Sequelize } from 'sequelize';
import { SubscriptionService } from './subscription.service';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface BasicAnalytics {
  overview: {
    totalBookings: number;
    totalRevenue: number;
    newClients: number;
    repeatClients: number;
    repeatClientRate: number;
  };
  bookingsByStatus: {
    pending: number;
    availed: number;
    canceled: number;
    noShow: number;
    postponed: number;
  };
  revenueOverTime: Array<{
    date: string;
    revenue: number;
    bookings: number;
  }>;
}

export interface AdvancedAnalytics extends BasicAnalytics {
  revenueByService: Array<{
    serviceId: string;
    serviceName: string;
    revenue: number;
    bookings: number;
    avgPrice: number;
  }>;
  revenueByClient: Array<{
    clientId: string;
    clientName: string;
    revenue: number;
    bookings: number;
  }>;
  topServices: Array<{
    serviceId: string;
    serviceName: string;
    bookings: number;
    revenue: number;
  }>;
  retentionMetrics: {
    totalClients: number;
    newClients: number;
    returningClients: number;
    retentionRate: number;
  };
  trends: {
    revenueGrowth: number;
    bookingGrowth: number;
    avgBookingValue: number;
    avgBookingValueChange: number;
  };
  clientGrowth: Array<{
    date: string;
    newClients: number;
    repeatClients: number;
  }>;
}

export class ProviderAnalyticsService {
  
  /**
   * Check if provider has access to analytics based on subscription
   */
  static async checkAnalyticsAccess(providerId: string): Promise<{
    hasBasic: boolean;
    hasAdvanced: boolean;
  }> {
    const [hasBasic, hasAdvanced] = await Promise.all([
      SubscriptionService.hasFeatureAccess(providerId, 'basic_booking_analytics'),
      SubscriptionService.hasFeatureAccess(providerId, 'advance_booking_analytics'),
    ]);

    return {
      hasBasic,
      hasAdvanced,
    };
  }

  /**
   * Get basic analytics for Solo Pro users
   */
  static async getBasicAnalytics(
    marketplaceId: string,
    dateRange: DateRange
  ): Promise<BasicAnalytics> {
    const { startDate, endDate } = dateRange;

    // Get all appointments in date range
    const appointments = await Appointment.findAll({
      where: {
        marketplaceId,
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });

    // Calculate overview metrics
    const totalBookings = appointments.length;
    const totalRevenue = appointments
      .filter(apt => apt.status === 'availed')
      .reduce((sum, apt) => sum + Number(apt.price), 0);

    // Get unique clients
    const clientIdsArray = Array.from(new Set(appointments.map(apt => apt.userId)));
    const totalClients = clientIdsArray.length;

    // A client counts as "repeat" if they had at least one booking with
    // this provider before this period started; otherwise they're "new".
    // (Previously this checked for prior bookings on-or-before the period's
    // *start* date using a per-client count, which meant a client whose
    // only bookings fell entirely within the period - the common case for
    // any recently-active business - matched neither bucket and silently
    // dropped out of both newClients and repeatClients.)
    const priorBookings = clientIdsArray.length > 0
      ? await Appointment.findAll({
          where: {
            marketplaceId,
            userId: { [Op.in]: clientIdsArray },
            createdAt: { [Op.lt]: startDate },
          },
          attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('userId')), 'userId']],
          raw: true,
        }) as any[]
      : [];

    const repeatClientIds = new Set(priorBookings.map((b: any) => b.userId));
    const repeatClients = repeatClientIds.size;
    const newClients = totalClients - repeatClients;
    const repeatClientRate = totalClients > 0 ? (repeatClients / totalClients) * 100 : 0;

    // Bookings by status
    const bookingsByStatus = {
      pending: appointments.filter(apt => apt.status === 'pending').length,
      availed: appointments.filter(apt => apt.status === 'availed').length,
      canceled: appointments.filter(apt => apt.status === 'canceled').length,
      noShow: appointments.filter(apt => apt.status === 'no_show').length,
      postponed: appointments.filter(apt => apt.status === 'postponed').length,
    };

    // Revenue over time (weekly)
    const revenueOverTime = await this.getRevenueOverTime(
      marketplaceId,
      startDate,
      endDate
    );

    return {
      overview: {
        totalBookings,
        totalRevenue,
        newClients,
        repeatClients,
        repeatClientRate,
      },
      bookingsByStatus,
      revenueOverTime,
    };
  }

  /**
   * Get advanced analytics for Solo Premium users
   */
  static async getAdvancedAnalytics(
    marketplaceId: string,
    dateRange: DateRange
  ): Promise<AdvancedAnalytics> {
    // Get basic analytics first
    const basicAnalytics = await this.getBasicAnalytics(marketplaceId, dateRange);

    const { startDate, endDate } = dateRange;

    // Get revenue by service
    const revenueByService = await this.getRevenueByService(
      marketplaceId,
      startDate,
      endDate
    );

    // Get revenue by client
    const revenueByClient = await this.getRevenueByClient(
      marketplaceId,
      startDate,
      endDate
    );

    // Get top services
    const topServices = await this.getTopServices(
      marketplaceId,
      startDate,
      endDate,
      5
    );

    // Get retention metrics
    const retentionMetrics = await this.getRetentionMetrics(
      marketplaceId,
      startDate,
      endDate
    );

    // Get trends
    const trends = await this.getTrends(marketplaceId, startDate, endDate);

    // Get client growth
    const clientGrowth = await this.getClientGrowth(
      marketplaceId,
      startDate,
      endDate
    );

    return {
      ...basicAnalytics,
      revenueByService,
      revenueByClient,
      topServices,
      retentionMetrics,
      trends,
      clientGrowth,
    };
  }

  // Private helper methods

  private static async getRevenueOverTime(
    marketplaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ date: string; revenue: number; bookings: number }>> {
    const appointments = await Appointment.findAll({
      where: {
        marketplaceId,
        status: 'availed',
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [
        [Sequelize.fn('DATE', Sequelize.col('createdAt')), 'date'],
        [Sequelize.fn('SUM', Sequelize.col('price')), 'revenue'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'bookings'],
      ],
      group: [Sequelize.fn('DATE', Sequelize.col('createdAt'))],
      order: [[Sequelize.fn('DATE', Sequelize.col('createdAt')), 'ASC']],
      raw: true,
    }) as any[];

    return appointments.map(apt => ({
      date: apt.date,
      revenue: parseFloat(apt.revenue || '0'),
      bookings: parseInt(apt.bookings || '0'),
    }));
  }

  private static async getRevenueByService(
    marketplaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{
    serviceId: string;
    serviceName: string;
    revenue: number;
    bookings: number;
    avgPrice: number;
  }>> {
    const results = await Appointment.findAll({
      where: {
        marketplaceId,
        status: 'availed',
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [
        'serviceId',
        [Sequelize.fn('SUM', Sequelize.col('price')), 'revenue'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'bookings'],
        [Sequelize.fn('AVG', Sequelize.col('price')), 'avgPrice'],
      ],
      group: ['serviceId'],
      raw: true,
    }) as any[];

    // Get service names separately
    const serviceIds = results.map(r => r.serviceId);
    const services = await Service.findAll({
      where: {
        id: {
          [Op.in]: serviceIds,
        },
      },
      attributes: ['id', 'name'],
      raw: true,
    }) as any[];

    const serviceMap = new Map(services.map(s => [s.id, s.name]));

    return results.map(r => ({
      serviceId: r.serviceId,
      serviceName: serviceMap.get(r.serviceId) || 'Unknown Service',
      revenue: parseFloat(r.revenue || '0'),
      bookings: parseInt(r.bookings || '0'),
      avgPrice: parseFloat(r.avgPrice || '0'),
    }));
  }

  private static async getRevenueByClient(
    marketplaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{
    clientId: string;
    clientName: string;
    revenue: number;
    bookings: number;
  }>> {
    const results = await Appointment.findAll({
      where: {
        marketplaceId,
        status: 'availed',
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [
        'userId',
        [Sequelize.fn('SUM', Sequelize.col('price')), 'revenue'],
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'bookings'],
      ],
      group: ['userId'],
      order: [[Sequelize.fn('SUM', Sequelize.col('price')), 'DESC']],
      limit: 10,
      raw: true,
    }) as any[];

    // Get user names separately
    const userIds = results.map(r => r.userId);
    const users = await User.findAll({
      where: {
        id: {
          [Op.in]: userIds,
        },
      },
      attributes: ['id', 'name'],
      raw: true,
    }) as any[];

    const userMap = new Map(users.map(u => [u.id, u.name]));

    return results.map(r => ({
      clientId: r.userId,
      clientName: userMap.get(r.userId) || 'Unknown Client',
      revenue: parseFloat(r.revenue || '0'),
      bookings: parseInt(r.bookings || '0'),
    }));
  }

  private static async getTopServices(
    marketplaceId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 5
  ): Promise<Array<{
    serviceId: string;
    serviceName: string;
    bookings: number;
    revenue: number;
  }>> {
    const results = await Appointment.findAll({
      where: {
        marketplaceId,
        status: 'availed',
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [
        'serviceId',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'bookings'],
        [Sequelize.fn('SUM', Sequelize.col('price')), 'revenue'],
      ],
      group: ['serviceId'],
      order: [[Sequelize.fn('COUNT', Sequelize.col('id')), 'DESC']],
      limit,
      raw: true,
    }) as any[];

    // Get service names separately
    const serviceIds = results.map(r => r.serviceId);
    const services = await Service.findAll({
      where: {
        id: {
          [Op.in]: serviceIds,
        },
      },
      attributes: ['id', 'name'],
      raw: true,
    }) as any[];

    const serviceMap = new Map(services.map(s => [s.id, s.name]));

    return results.map(r => ({
      serviceId: r.serviceId,
      serviceName: serviceMap.get(r.serviceId) || 'Unknown Service',
      bookings: parseInt(r.bookings || '0'),
      revenue: parseFloat(r.revenue || '0'),
    }));
  }

  private static async getRetentionMetrics(
    marketplaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalClients: number;
    newClients: number;
    returningClients: number;
    retentionRate: number;
  }> {
    // Get all unique clients in the period
    const clientsInPeriod = await Appointment.findAll({
      where: {
        marketplaceId,
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('userId')), 'userId']],
      raw: true,
    }) as any[];

    const clientIds = clientsInPeriod.map(c => c.userId);
    const totalClients = clientIds.length;

    // Check which clients had bookings before this period
    const previousBookings = await Appointment.findAll({
      where: {
        marketplaceId,
        userId: {
          [Op.in]: clientIds,
        },
        createdAt: {
          [Op.lt]: startDate,
        },
      },
      attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('userId')), 'userId']],
      raw: true,
    }) as any[];

    const returningClientIds = new Set(previousBookings.map(b => b.userId));
    const returningClients = returningClientIds.size;
    const newClients = totalClients - returningClients;
    const retentionRate = totalClients > 0 ? (returningClients / totalClients) * 100 : 0;

    return {
      totalClients,
      newClients,
      returningClients,
      retentionRate,
    };
  }

  private static async getTrends(
    marketplaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    revenueGrowth: number;
    bookingGrowth: number;
    avgBookingValue: number;
    avgBookingValueChange: number;
    newClientsGrowth: number;
    repeatClientsGrowth: number;
    noShowGrowth: number;
  }> {
    // Calculate period duration
    const periodDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Get previous period stats
    const previousStart = new Date(startDate);
    previousStart.setDate(previousStart.getDate() - periodDays);

    const [currentStats, previousStats] = await Promise.all([
      this.getPeriodStats(marketplaceId, startDate, endDate),
      this.getPeriodStats(marketplaceId, previousStart, startDate),
    ]);

    const revenueGrowth =
      previousStats.revenue > 0
        ? ((currentStats.revenue - previousStats.revenue) / previousStats.revenue) * 100
        : 0;

    const bookingGrowth =
      previousStats.bookings > 0
        ? ((currentStats.bookings - previousStats.bookings) / previousStats.bookings) * 100
        : 0;

    const avgBookingValue =
      currentStats.bookings > 0 ? currentStats.revenue / currentStats.bookings : 0;

    const previousAvgBookingValue =
      previousStats.bookings > 0 ? previousStats.revenue / previousStats.bookings : 0;

    const avgBookingValueChange =
      previousAvgBookingValue > 0
        ? ((avgBookingValue - previousAvgBookingValue) / previousAvgBookingValue) * 100
        : 0;

    const newClientsGrowth =
      previousStats.newClients > 0
        ? ((currentStats.newClients - previousStats.newClients) / previousStats.newClients) * 100
        : 0;

    const repeatClientsGrowth =
      previousStats.repeatClients > 0
        ? ((currentStats.repeatClients - previousStats.repeatClients) / previousStats.repeatClients) * 100
        : 0;

    const noShowGrowth =
      previousStats.noShows > 0
        ? ((currentStats.noShows - previousStats.noShows) / previousStats.noShows) * 100
        : 0;

    return {
      revenueGrowth,
      bookingGrowth,
      avgBookingValue,
      avgBookingValueChange,
      newClientsGrowth,
      repeatClientsGrowth,
      noShowGrowth,
    };
  }

  private static async getPeriodStats(
    marketplaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    revenue: number;
    bookings: number;
    newClients: number;
    repeatClients: number;
    noShows: number;
  }> {
    const [revenueResult, noShowResult] = await Promise.all([
      Appointment.findOne({
        where: {
          marketplaceId,
          status: 'availed',
          createdAt: {
            [Op.between]: [startDate, endDate],
          },
        },
        attributes: [
          [Sequelize.fn('SUM', Sequelize.col('price')), 'revenue'],
          [Sequelize.fn('COUNT', Sequelize.col('id')), 'bookings'],
        ],
        raw: true,
      }) as any,
      Appointment.count({
        where: {
          marketplaceId,
          status: 'no_show',
          createdAt: {
            [Op.between]: [startDate, endDate],
          },
        },
      }),
    ]);

    // Get unique clients in this period
    const clientsInPeriod = await Appointment.findAll({
      where: {
        marketplaceId,
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('userId')), 'userId']],
      raw: true,
    }) as any[];

    const clientIds = clientsInPeriod.map(c => c.userId);

    // Check which clients had bookings before this period
    const previousBookings = await Appointment.findAll({
      where: {
        marketplaceId,
        userId: {
          [Op.in]: clientIds,
        },
        createdAt: {
          [Op.lt]: startDate,
        },
      },
      attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('userId')), 'userId']],
      raw: true,
    }) as any[];

    const returningClientIds = new Set(previousBookings.map(b => b.userId));
    const repeatClients = returningClientIds.size;
    const newClients = clientIds.length - repeatClients;

    return {
      revenue: parseFloat(revenueResult?.revenue || '0'),
      bookings: parseInt(revenueResult?.bookings || '0'),
      newClients,
      repeatClients,
      noShows: noShowResult,
    };
  }

  private static async getClientGrowth(
    marketplaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ date: string; newClients: number; repeatClients: number }>> {
    // Get all appointments grouped by date
    const appointmentsByDate = await Appointment.findAll({
      where: {
        marketplaceId,
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [
        [Sequelize.fn('DATE', Sequelize.col('createdAt')), 'date'],
        'userId',
      ],
      group: [Sequelize.fn('DATE', Sequelize.col('createdAt')), 'userId'],
      order: [[Sequelize.fn('DATE', Sequelize.col('createdAt')), 'ASC']],
      raw: true,
    }) as any[];

    // Group by date and check if client is new or repeat
    const dateMap = new Map<string, { newClients: Set<string>; repeatClients: Set<string> }>();

    for (const apt of appointmentsByDate) {
      const date = apt.date;
      if (!dateMap.has(date)) {
        dateMap.set(date, { newClients: new Set(), repeatClients: new Set() });
      }

      // Check if client had previous bookings
      const previousBookings = await Appointment.count({
        where: {
          marketplaceId,
          userId: apt.userId,
          createdAt: {
            [Op.lt]: new Date(date),
          },
        },
      });

      const dateData = dateMap.get(date)!;
      if (previousBookings === 0) {
        dateData.newClients.add(apt.userId);
      } else {
        dateData.repeatClients.add(apt.userId);
      }
    }

    return Array.from(dateMap.entries()).map(([date, data]) => ({
      date,
      newClients: data.newClients.size,
      repeatClients: data.repeatClients.size,
    }));
  }
}
