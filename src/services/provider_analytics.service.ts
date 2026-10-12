import { Appointment } from "../models/appointment_model";
import { User } from "../models/user_model";
import { Service } from "../models/service_model";
import { Marketplace } from "../models/marketplace_model";
import { Review } from "../models/review_model";
import { Op, Sequelize } from "sequelize";
import { SubscriptionService } from "./subscription.service";
import {
  AnalyticsDateRange,
  previousPeriodRange,
  resolveAnalyticsDateRange,
} from "../utils/analytics_date_range";
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" })
  : null;

/** Completed appointments drive recognized service revenue (PRD). */
const COMPLETED = "availed" as const;

export interface AnalyticsFilters {
  dateRange: AnalyticsDateRange;
  /** Suite: null/undefined = entire suite; set = one team member (or owner via 'owner'). */
  teamMemberId?: string | null;
  serviceId?: string | null;
  /** completed | cancelled | no_show — maps to availed | canceled | no_show */
  bookingStatus?: "completed" | "cancelled" | "no_show" | null;
  /** When set, limits rows to these statuses. Empty means no status filter. */
  bookingStatuses?: Array<"completed" | "cancelled" | "no_show"> | null;
}

export interface BasicAnalytics {
  overview: {
    totalBookings: number;
    totalRevenue: number;
    completedBookings: number;
    newClients: number;
    repeatClients: number;
    repeatClientRate: number;
    totalClientCount: number;
  };
  bookingsByStatus: {
    pending: number;
    availed: number;
    canceled: number;
    noShow: number;
    postponed: number;
  };
  revenueOverTime: Array<{ date: string; revenue: number; bookings: number }>;
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
    newClientsGrowth: number;
    repeatClientsGrowth: number;
    noShowGrowth: number;
  };
  clientGrowth: Array<{
    date: string;
    newClients: number;
    repeatClients: number;
  }>;
}

function statusWhere(
  bookingStatus?: AnalyticsFilters["bookingStatus"]
): Record<string, unknown> | undefined {
  if (!bookingStatus) return undefined;
  if (bookingStatus === "completed") return { status: COMPLETED };
  if (bookingStatus === "cancelled") return { status: "canceled" };
  if (bookingStatus === "no_show") return { status: "no_show" };
  return undefined;
}

function buildAppointmentWhere(
  marketplaceId: string,
  filters: AnalyticsFilters
): Record<string, unknown> {
  const { dateRange, teamMemberId, serviceId, bookingStatus, bookingStatuses } = filters;
  const where: Record<string, unknown> = {
    marketplaceId,
    dateTime: {
      [Op.between]: [dateRange.startDate, dateRange.endDate],
    },
  };

  if (teamMemberId === "owner") {
    where.assignedTeamMemberId = null;
  } else if (teamMemberId) {
    where.assignedTeamMemberId = teamMemberId;
  }

  if (serviceId) {
    where.serviceId = serviceId;
  }

  if (bookingStatuses && bookingStatuses.length > 0) {
    where.status = {
      [Op.in]: bookingStatuses.map((status) => {
        if (status === "completed") return COMPLETED;
        if (status === "cancelled") return "canceled";
        return "no_show";
      }),
    };
  } else {
    const status = statusWhere(bookingStatus);
    if (status) Object.assign(where, status);
  }

  return where;
}

export class ProviderAnalyticsService {
  static resolveDateRange(query: {
    period?: string;
    startDate?: string;
    endDate?: string;
  }): AnalyticsDateRange {
    return resolveAnalyticsDateRange(query);
  }

  static async checkAnalyticsAccess(providerId: string): Promise<{
    hasBasic: boolean;
    hasAdvanced: boolean;
    /** Earnings available to all Solo tiers and Suite (PRD). */
    hasEarnings: boolean;
  }> {
    const [hasBasic, hasAdvanced] = await Promise.all([
      SubscriptionService.hasFeatureAccess(providerId, "basic_booking_analytics"),
      SubscriptionService.hasFeatureAccess(
        providerId,
        "advance_booking_analytics"
      ),
    ]);

    return {
      hasBasic,
      hasAdvanced,
      hasEarnings: true,
    };
  }

  static async getBasicAnalytics(
    marketplaceId: string,
    dateRange: AnalyticsDateRange | { startDate: Date; endDate: Date },
    options?: {
      /** Team member id, or `"owner"` for unassigned (owner) bookings. */
      assignedTeamMemberId?: string | null;
      serviceId?: string;
      bookingStatus?: AnalyticsFilters["bookingStatus"];
      bookingStatuses?: AnalyticsFilters["bookingStatuses"];
    }
  ): Promise<BasicAnalytics> {
    const filters: AnalyticsFilters = {
      dateRange: {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        preset: "preset" in dateRange ? (dateRange as AnalyticsDateRange).preset : "custom",
      },
      teamMemberId: options?.assignedTeamMemberId ?? undefined,
      serviceId: options?.serviceId,
      bookingStatus: options?.bookingStatus,
      bookingStatuses: options?.bookingStatuses,
    };

    const appointments = await Appointment.findAll({
      where: buildAppointmentWhere(marketplaceId, filters) as any,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    const totalBookings = appointments.length;
    const completed = appointments.filter((a) => a.status === COMPLETED);
    const totalRevenue = completed.reduce((sum, apt) => sum + Number(apt.price), 0);

    const clientIdsArray = Array.from(
      new Set(appointments.map((apt) => apt.userId))
    );
    const totalClientCount = clientIdsArray.length;

    // PRD: returning clients = clients with more than one completed appointment
    // (lifetime with this marketplace), among clients active in the period.
    const completedCounts =
      clientIdsArray.length > 0
        ? ((await Appointment.findAll({
            where: {
              marketplaceId,
              userId: { [Op.in]: clientIdsArray },
              status: COMPLETED,
            },
            attributes: [
              "userId",
              [Sequelize.fn("COUNT", Sequelize.col("id")), "cnt"],
            ],
            group: ["userId"],
            raw: true,
          })) as any[])
        : [];

    const returningIds = new Set(
      completedCounts
        .filter((r) => parseInt(r.cnt || "0", 10) > 1)
        .map((r) => r.userId)
    );
    const repeatClients = clientIdsArray.filter((id) => returningIds.has(id)).length;
    const newClients = totalClientCount - repeatClients;
    const repeatClientRate =
      totalClientCount > 0 ? (repeatClients / totalClientCount) * 100 : 0;

    const bookingsByStatus = {
      pending: appointments.filter((apt) => apt.status === "pending").length,
      availed: appointments.filter((apt) => apt.status === COMPLETED).length,
      canceled: appointments.filter((apt) => apt.status === "canceled").length,
      noShow: appointments.filter((apt) => apt.status === "no_show").length,
      postponed: appointments.filter((apt) => apt.status === "postponed").length,
    };

    const revenueOverTime = await this.getRevenueOverTime(
      marketplaceId,
      filters
    );

    return {
      overview: {
        totalBookings,
        totalRevenue,
        completedBookings: bookingsByStatus.availed,
        newClients,
        repeatClients,
        repeatClientRate,
        totalClientCount,
      },
      bookingsByStatus,
      revenueOverTime,
    };
  }

  static async getAdvancedAnalytics(
    marketplaceId: string,
    dateRange: AnalyticsDateRange | { startDate: Date; endDate: Date },
    options?: {
      assignedTeamMemberId?: string | null;
      serviceId?: string;
      bookingStatus?: AnalyticsFilters["bookingStatus"];
      bookingStatuses?: AnalyticsFilters["bookingStatuses"];
    }
  ): Promise<AdvancedAnalytics> {
    const filters: AnalyticsFilters = {
      dateRange: {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        preset:
          "preset" in dateRange
            ? (dateRange as AnalyticsDateRange).preset
            : "custom",
      },
      teamMemberId: options?.assignedTeamMemberId ?? undefined,
      serviceId: options?.serviceId,
      bookingStatus: options?.bookingStatus,
      bookingStatuses: options?.bookingStatuses,
    };

    const basicAnalytics = await this.getBasicAnalytics(
      marketplaceId,
      filters.dateRange,
      {
        assignedTeamMemberId: options?.assignedTeamMemberId,
        serviceId: options?.serviceId,
        bookingStatus: options?.bookingStatus,
        bookingStatuses: options?.bookingStatuses,
      }
    );

    const [
      revenueByService,
      revenueByClient,
      topServices,
      retentionMetrics,
      trends,
      clientGrowth,
    ] = await Promise.all([
      this.getRevenueByService(marketplaceId, filters),
      this.getRevenueByClient(marketplaceId, filters),
      this.getTopServices(marketplaceId, filters, 5),
      this.getRetentionMetrics(marketplaceId, filters),
      this.getTrends(marketplaceId, filters),
      this.getClientGrowth(marketplaceId, filters),
    ]);

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

  /** PRD Solo Basic: daily, weekly and monthly earnings. */
  static async getEarningsSummary(
    marketplaceId: string,
    options?: { assignedTeamMemberId?: string }
  ): Promise<{
    today: number;
    thisWeek: number;
    thisMonth: number;
    todayCompletedCount: number;
  }> {
    const now = new Date();
    const today = resolveAnalyticsDateRange({ period: "today", now });
    const week = resolveAnalyticsDateRange({ period: "week", now });
    const month = resolveAnalyticsDateRange({ period: "month", now });

    const [t, w, m, todayCompletedCount] = await Promise.all([
      this.sumCompletedRevenue(marketplaceId, today, options?.assignedTeamMemberId),
      this.sumCompletedRevenue(marketplaceId, week, options?.assignedTeamMemberId),
      this.sumCompletedRevenue(marketplaceId, month, options?.assignedTeamMemberId),
      this.countCompletedAppointments(
        marketplaceId,
        today,
        options?.assignedTeamMemberId
      ),
    ]);

    return { today: t, thisWeek: w, thisMonth: m, todayCompletedCount };
  }

  static async compareCompletedRevenue(
    marketplaceId: string,
    range: AnalyticsDateRange,
    assignedTeamMemberId?: string
  ): Promise<{ current: number; previous: number; changePercent: number | null }> {
    const current = await this.sumCompletedRevenue(
      marketplaceId,
      range,
      assignedTeamMemberId
    );
    const previous = await this.sumCompletedRevenue(
      marketplaceId,
      previousPeriodRange(range),
      assignedTeamMemberId
    );
    const changePercent =
      previous === 0 ? null : ((current - previous) / previous) * 100;
    return { current, previous, changePercent };
  }

  static async getProClients(
    marketplaceId: string,
    dateRange: AnalyticsDateRange,
    serviceId?: string | null
  ): Promise<{
    clients: Array<Record<string, unknown>>;
    staleClientIds: string[];
  }> {
    const periodWhere: any = {
      marketplaceId,
      dateTime: { [Op.between]: [dateRange.startDate, dateRange.endDate] },
    };
    if (serviceId) periodWhere.serviceId = serviceId;

    const periodRows = await Appointment.findAll({
      where: periodWhere,
      include: [{ model: User, as: "user", attributes: ["id", "name"] }],
      order: [["dateTime", "DESC"]],
    });

    const serviceIds = Array.from(
      new Set(periodRows.map((row) => row.serviceId).filter(Boolean))
    );
    const services =
      serviceIds.length > 0
        ? ((await Service.findAll({
            where: { id: { [Op.in]: serviceIds } },
            attributes: ["id", "name"],
            raw: true,
          })) as any[])
        : [];
    const serviceMap = new Map(services.map((service) => [service.id, service.name]));

    const clientIds = Array.from(new Set(periodRows.map((row) => row.userId).filter(Boolean)));
    const lifetimeRows =
      clientIds.length === 0
        ? []
        : await Appointment.findAll({
            where: { marketplaceId, userId: { [Op.in]: clientIds } },
            attributes: ["userId", "status", "dateTime", "price", "serviceId"],
            raw: true,
          });

    const lifetimeByClient = new Map<string, any[]>();
    for (const row of lifetimeRows as any[]) {
      const list = lifetimeByClient.get(row.userId) || [];
      list.push(row);
      lifetimeByClient.set(row.userId, list);
    }

    const clients = clientIds.map((userId) => {
      const period = periodRows.filter((row) => row.userId === userId);
      const lifetime = lifetimeByClient.get(userId) || [];
      const completedLife = lifetime.filter((row) => row.status === COMPLETED);
      const periodCompleted = period.filter((row) => row.status === COMPLETED);
      const firstCompleted = completedLife
        .map((row) => new Date(row.dateTime))
        .sort((a, b) => a.getTime() - b.getTime())[0];
      const lastCompleted = completedLife
        .map((row) => new Date(row.dateTime))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const sample = period[0] as any;
      return {
        userId,
        name: sample?.user?.name || null,
        clientSince: firstCompleted ? firstCompleted.toISOString() : null,
        lifetimeVisits: completedLife.length,
        periodVisits: periodCompleted.length,
        periodSpend: periodCompleted.reduce((sum, row) => sum + Number(row.price || 0), 0),
        lifetimeNoShows: lifetime.filter((row) => row.status === "no_show").length,
        isReturning: completedLife.length > 1,
        lastCompletedAt: lastCompleted ? lastCompleted.toISOString() : null,
        history: period.slice(0, 8).map((row: any) => ({
          dateTime: new Date(row.dateTime).toISOString(),
          serviceId: row.serviceId || null,
          serviceName: serviceMap.get(row.serviceId) || null,
          amount: Number(row.price) || 0,
          status: row.status,
        })),
      };
    });

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    const completedAll = (await Appointment.findAll({
      where: { marketplaceId, status: COMPLETED },
      attributes: ["userId", "dateTime"],
      raw: true,
    })) as any[];
    const latest = new Map<string, Date>();
    for (const row of completedAll) {
      const when = new Date(row.dateTime);
      const current = latest.get(row.userId);
      if (!current || when > current) latest.set(row.userId, when);
    }
    const staleClientIds = Array.from(latest.entries())
      .filter(([, when]) => when.getTime() < cutoff.getTime())
      .map(([userId]) => userId);

    return { clients, staleClientIds };
  }

  /**
   * Basic earnings detail: completed appointments only.
   * Week is Monday–Sunday. Does not return booking-analytics metrics.
   */
  static async getBasicEarningsDetail(
    marketplaceId: string,
    options?: { assignedTeamMemberId?: string; weekStart?: string }
  ): Promise<{
    weekStart: string;
    weekEnd: string;
    weekTotal: number;
    today: string;
    canGoNext: boolean;
    days: Array<{ date: string; amount: number; isFuture: boolean }>;
    appointments: Array<{
      date: string;
      dateTime: string;
      clientName: string | null;
      serviceName: string | null;
      amount: number;
    }>;
    months: Array<{ month: string; amount: number }>;
  }> {
    const today = startOfDay(new Date());
    const requested = options?.weekStart
      ? startOfDay(new Date(`${options.weekStart}T00:00:00`))
      : today;
    const currentMonday = startOfMonday(today);
    let monday = startOfMonday(
      Number.isNaN(requested.getTime()) ? today : requested
    );
    if (monday.getTime() > currentMonday.getTime()) {
      monday = currentMonday;
    }
    const sunday = endOfDay(new Date(monday));
    sunday.setDate(monday.getDate() + 6);

    const where: any = {
      marketplaceId,
      status: COMPLETED,
      dateTime: { [Op.between]: [monday, sunday] },
    };
    if (options?.assignedTeamMemberId) {
      where.assignedTeamMemberId = options.assignedTeamMemberId;
    }

    const rows = await Appointment.findAll({
      where,
      include: [{ model: User, as: "user", attributes: ["id", "name"] }],
      order: [["dateTime", "ASC"]],
    });

    const serviceIds = Array.from(
      new Set(rows.map((a) => a.serviceId).filter(Boolean))
    );
    const services =
      serviceIds.length > 0
        ? ((await Service.findAll({
            where: { id: { [Op.in]: serviceIds } },
            attributes: ["id", "name"],
            raw: true,
          })) as any[])
        : [];
    const serviceMap = new Map(services.map((s) => [s.id, s.name]));

    const dayAmounts = new Map<string, number>();
    const appointments = rows.map((a: any) => {
      const when = new Date(a.dateTime);
      const date = formatYmd(when);
      const price = Number(a.price) || 0;
      dayAmounts.set(date, (dayAmounts.get(date) || 0) + price);
      return {
        date,
        dateTime: when.toISOString(),
        clientName: a.user?.name || null,
        serviceName: serviceMap.get(a.serviceId) || null,
        amount: price,
      };
    });

    const days = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + index);
      const date = formatYmd(day);
      return {
        date,
        amount: dayAmounts.get(date) || 0,
        isFuture: startOfDay(day).getTime() > today.getTime(),
      };
    });

    const weekTotal = days.reduce((sum, day) => sum + day.amount, 0);
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);

    const months = await Promise.all(
      Array.from({ length: 6 }, async (_, index) => {
        const monthDate = new Date(today.getFullYear(), today.getMonth() - index, 1);
        const range = {
          startDate: new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 0, 0, 0, 0),
          endDate: new Date(
            monthDate.getFullYear(),
            monthDate.getMonth() + 1,
            0,
            23,
            59,
            59,
            999
          ),
          preset: "month" as const,
        };
        const amount = await this.sumCompletedRevenue(
          marketplaceId,
          range,
          options?.assignedTeamMemberId
        );
        return { month: formatYmd(monthDate), amount };
      })
    );

    return {
      weekStart: formatYmd(monday),
      weekEnd: formatYmd(sunday),
      weekTotal,
      today: formatYmd(today),
      canGoNext: nextMonday.getTime() <= currentMonday.getTime(),
      days,
      appointments,
      months,
    };
  }

  /** PRD: Stripe payout history for the marketplace owner Connect account. */
  static async getStripePayoutHistory(
    ownerUserId: string,
    limit = 20
  ): Promise<
    Array<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      arrivalDate: string | null;
      created: string;
      bankLast4: string | null;
    }>
  > {
    const owner = await User.findByPk(ownerUserId, {
      attributes: ["id", "stripeConnectAccountId"],
    });
    if (!owner?.stripeConnectAccountId || !stripe) {
      return [];
    }

    try {
      const accountId = owner.stripeConnectAccountId;
      const [payouts, bankLast4] = await Promise.all([
        stripe.payouts.list(
          { limit: Math.min(limit, 50) },
          { stripeAccount: accountId }
        ),
        this.getPayoutBankLast4(accountId),
      ]);
      return payouts.data.map((p) => ({
        id: p.id,
        amount: p.amount / 100,
        currency: (p.currency || "usd").toUpperCase(),
        status: p.status,
        arrivalDate: p.arrival_date
          ? new Date(p.arrival_date * 1000).toISOString()
          : null,
        created: new Date(p.created * 1000).toISOString(),
        bankLast4,
      }));
    } catch (err) {
      console.error("Failed to list Stripe payouts for analytics:", err);
      return [];
    }
  }

  /**
   * Suite Owner analytics (same scope all suite tiers).
   * Stations = active team members + owner (no separate room model in product).
   */
  static async getSuiteAnalytics(
    marketplaceId: string,
    ownerUserId: string,
    filters: AnalyticsFilters
  ): Promise<{
    businessOverview: {
      upcomingAppointments: number;
      teamBookingActivity: number;
      completedBookings: number;
      totalSuiteRevenue: number;
      monthlyRevenueGoal: number | null;
      splitRevenueGoalByMember: boolean;
      revenueGoalProgressAlerts: boolean;
      cancellations: number;
      noShows: number;
      goalContext: {
        last3MonthsAverage: number;
        previousMonthRevenue: number;
        previousMonthLabel: string;
      };
    };
    teamPerformance: Array<{
      teamMemberId: string | null;
      name: string;
      profilePic: string | null;
      bookings: number;
      revenue: number;
      rating: number | null;
      isOwner: boolean;
    }>;
    occupancy: {
      occupiedStations: number;
      availableStations: number;
      totalStations: number;
      stations: Array<{
        teamMemberId: string | null;
        name: string;
        occupied: boolean;
      }>;
      busiestDays: Array<{ day: string; bookings: number }>;
      busiestHours: Array<{ hour: number; bookings: number }>;
    };
    clients: {
      total: number;
      newClients: number;
      returningClients: number;
      retentionRate: number;
      /** PRD: client loyalty / retention snapshot */
      loyaltyRate: number;
      byTeamMember: Array<{
        teamMemberId: string | null;
        name: string;
        clientCount: number;
      }>;
      /** PRD: booking history (recent completed/pending in range) */
      bookingHistory: Array<{
        appointmentId: string;
        clientId: string;
        clientName: string | null;
        serviceName: string | null;
        dateTime: string;
        status: string;
        price: number;
        teamMemberId: string | null;
      }>;
    };
    payments: {
      totalSuiteEarnings: number;
      byTeamMember: Array<{
        teamMemberId: string | null;
        name: string;
        revenue: number;
      }>;
      revenueByService: Array<{
        serviceId: string;
        serviceName: string;
        revenue: number;
        bookings: number;
        byTeamMember: Array<{
          teamMemberId: string | null;
          name: string;
          revenue: number;
        }>;
      }>;
      tipsAndCommissionsEnabled: boolean;
    };
    /** Pending appointments later today for the suite / selected member. */
    upNextToday: Array<{
      appointmentId: string;
      dateTime: string;
      serviceName: string | null;
      clientName: string | null;
      teamMemberId: string | null;
      teamMemberName: string;
      stationNumber: number;
    }>;
  }> {
    const marketplace = await Marketplace.findByPk(marketplaceId);
    const personFilter = filters.teamMemberId || undefined;
    const basic = await this.getBasicAnalytics(marketplaceId, filters.dateRange, {
      assignedTeamMemberId: personFilter,
      serviceId: filters.serviceId || undefined,
      bookingStatus: filters.bookingStatus,
    });

    const now = new Date();
    const upcomingAppointments = await Appointment.count({
      where: {
        marketplaceId,
        status: "pending",
        dateTime: { [Op.gte]: now },
        ...(filters.teamMemberId === "owner"
          ? { assignedTeamMemberId: null }
          : filters.teamMemberId
            ? { assignedTeamMemberId: filters.teamMemberId }
            : {}),
      },
    });

    const teamMembers = await User.findAll({
      where: {
        teamOwnerId: ownerUserId,
        isTeamMember: true,
      },
      attributes: ["id", "name", "profilePic"],
    });

    const owner = await User.findByPk(ownerUserId, {
      attributes: ["id", "name", "businessName", "profilePic"],
    });

    const membersForPerf: Array<{
      id: string | null;
      name: string;
      isOwner: boolean;
      profilePic: string | null;
    }> = [
      {
        id: null,
        name: owner?.businessName || owner?.name || "Owner",
        isOwner: true,
        profilePic: owner?.profilePic || null,
      },
      ...teamMembers.map((m) => ({
        id: m.id as string,
        name: m.name || "Team member",
        isOwner: false,
        profilePic: m.profilePic || null,
      })),
    ];

    // Team breakdown always suite-wide for the period (PRD: total alongside members).
    // Person filter scopes overview/payments totals only.
    const suiteWide = await Appointment.findAll({
      where: buildAppointmentWhere(marketplaceId, {
        dateRange: filters.dateRange,
        serviceId: filters.serviceId,
        bookingStatus: filters.bookingStatus,
      }) as any,
    });

    const teamPerformance = await Promise.all(
      membersForPerf.map(async (m) => {
        const memberAppts = suiteWide.filter((a) =>
          m.isOwner
            ? a.assignedTeamMemberId == null
            : a.assignedTeamMemberId === m.id
        );
        const completed = memberAppts.filter((a) => a.status === COMPLETED);
        const revenue = completed.reduce((s, a) => s + Number(a.price), 0);
        const rating = await this.getMemberRating(
          marketplaceId,
          m.isOwner ? null : m.id
        );
        return {
          teamMemberId: m.id,
          name: m.name,
          profilePic: m.profilePic,
          bookings: memberAppts.length,
          revenue,
          rating,
          isOwner: m.isOwner,
        };
      })
    );

    // Occupancy: each team member + owner = station; occupied if pending/availed
    // appointment overlapping "now" (or any booking today if none current).
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const todayAppts = await Appointment.findAll({
      where: {
        marketplaceId,
        dateTime: { [Op.between]: [dayStart, dayEnd] },
        status: { [Op.in]: ["pending", COMPLETED] },
      },
    });

    const stations = membersForPerf.map((m) => {
      const occupied = todayAppts.some((a) =>
        m.isOwner
          ? a.assignedTeamMemberId == null
          : a.assignedTeamMemberId === m.id
      );
      return {
        teamMemberId: m.id,
        name: m.name,
        occupied,
      };
    });
    const occupiedStations = stations.filter((s) => s.occupied).length;

    const busiestDaysMap = new Map<string, number>();
    const busiestHoursMap = new Map<number, number>();
    for (const a of suiteWide) {
      const d = new Date(a.dateTime);
      const day = d.toLocaleDateString("en-US", { weekday: "short" });
      busiestDaysMap.set(day, (busiestDaysMap.get(day) || 0) + 1);
      busiestHoursMap.set(d.getHours(), (busiestHoursMap.get(d.getHours()) || 0) + 1);
    }
    const busiestDays = Array.from(busiestDaysMap.entries())
      .map(([day, bookings]) => ({ day, bookings }))
      .sort((a, b) => b.bookings - a.bookings);
    const busiestHours = Array.from(busiestHoursMap.entries())
      .map(([hour, bookings]) => ({ hour, bookings }))
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 8);

    const retention = await this.getRetentionMetrics(marketplaceId, {
      dateRange: filters.dateRange,
      serviceId: filters.serviceId,
      bookingStatus: filters.bookingStatus,
    });

    const byTeamMemberClients = membersForPerf.map((m) => {
      const ids = new Set(
        suiteWide
          .filter((a) =>
            m.isOwner
              ? a.assignedTeamMemberId == null
              : a.assignedTeamMemberId === m.id
          )
          .map((a) => a.userId)
      );
      return {
        teamMemberId: m.id,
        name: m.name,
        clientCount: ids.size,
      };
    });

    const revenueByServiceBase = await this.getRevenueByService(marketplaceId, {
      dateRange: filters.dateRange,
      teamMemberId: filters.teamMemberId,
      serviceId: filters.serviceId,
      bookingStatus: filters.bookingStatus === "completed" ? "completed" : filters.bookingStatus,
    });

    // Suite total from team rows — no double counting
    const totalFromTeam = teamPerformance.reduce((s, t) => s + t.revenue, 0);

    // Per-service × team-member revenue for Payments stacked bars (completed only).
    const completedForPayments = suiteWide.filter((a) => a.status === COMPLETED);
    const serviceMemberMap = new Map<
      string,
      Map<string, { teamMemberId: string | null; name: string; revenue: number }>
    >();
    for (const a of completedForPayments) {
      const sid = a.serviceId ? String(a.serviceId) : "";
      if (!sid) continue;
      if (filters.teamMemberId === "owner" && a.assignedTeamMemberId != null) {
        continue;
      }
      if (
        filters.teamMemberId &&
        filters.teamMemberId !== "owner" &&
        a.assignedTeamMemberId !== filters.teamMemberId
      ) {
        continue;
      }
      const memberKey = a.assignedTeamMemberId
        ? String(a.assignedTeamMemberId)
        : "owner";
      const memberMeta = membersForPerf.find((m) =>
        m.isOwner ? memberKey === "owner" : m.id === memberKey
      );
      if (!serviceMemberMap.has(sid)) {
        serviceMemberMap.set(sid, new Map());
      }
      const inner = serviceMemberMap.get(sid)!;
      const existing = inner.get(memberKey) || {
        teamMemberId: memberMeta?.isOwner ? null : memberMeta?.id || null,
        name: memberMeta?.name || "Team",
        revenue: 0,
      };
      existing.revenue += Number(a.price || 0);
      inner.set(memberKey, existing);
    }

    const revenueByService = revenueByServiceBase.map((s) => ({
      serviceId: s.serviceId,
      serviceName: s.serviceName,
      revenue: s.revenue,
      bookings: s.bookings,
      byTeamMember: Array.from(
        serviceMemberMap.get(String(s.serviceId))?.values() || []
      ).sort((a, b) => b.revenue - a.revenue),
    }));

    const stationIndex = new Map<string, number>();
    membersForPerf.forEach((m, idx) => {
      stationIndex.set(m.isOwner ? "owner" : String(m.id), idx + 1);
    });
    const nameByMember = new Map<string, string>();
    membersForPerf.forEach((m) => {
      nameByMember.set(m.isOwner ? "owner" : String(m.id), m.name);
    });

    const upNextWhere: any = {
      marketplaceId,
      status: "pending",
      dateTime: { [Op.between]: [now, dayEnd] },
    };
    if (filters.teamMemberId === "owner") {
      upNextWhere.assignedTeamMemberId = null;
    } else if (filters.teamMemberId) {
      upNextWhere.assignedTeamMemberId = filters.teamMemberId;
    }
    if (filters.serviceId) {
      upNextWhere.serviceId = filters.serviceId;
    }

    const upNextRows = await Appointment.findAll({
      where: upNextWhere,
      include: [{ model: User, as: "user", attributes: ["id", "name"] }],
      order: [["dateTime", "ASC"]],
      limit: 8,
    });
    const upNextServiceIds = Array.from(
      new Set(upNextRows.map((a) => a.serviceId).filter(Boolean))
    );
    const upNextServices =
      upNextServiceIds.length > 0
        ? ((await Service.findAll({
            where: { id: { [Op.in]: upNextServiceIds } },
            attributes: ["id", "name"],
            raw: true,
          })) as any[])
        : [];
    const upNextServiceMap = new Map(
      upNextServices.map((s) => [s.id, s.name])
    );
    const upNextToday = upNextRows.map((a: any) => {
      const memberKey = a.assignedTeamMemberId
        ? String(a.assignedTeamMemberId)
        : "owner";
      return {
        appointmentId: a.id,
        dateTime: a.dateTime?.toISOString?.() || String(a.dateTime),
        serviceName: upNextServiceMap.get(a.serviceId) || null,
        clientName: a.user?.name || null,
        teamMemberId: a.assignedTeamMemberId || null,
        teamMemberName: nameByMember.get(memberKey) || "Team",
        stationNumber: stationIndex.get(memberKey) || 1,
      };
    });

    const goalContext = await this.getRevenueGoalContext(marketplaceId);

    return {
      businessOverview: {
        upcomingAppointments,
        teamBookingActivity: basic.overview.totalBookings,
        completedBookings: basic.overview.completedBookings,
        totalSuiteRevenue: personFilter ? basic.overview.totalRevenue : totalFromTeam,
        monthlyRevenueGoal: marketplace?.monthlyRevenueGoal != null
          ? Number(marketplace.monthlyRevenueGoal)
          : null,
        splitRevenueGoalByMember: marketplace?.splitRevenueGoalByMember === true,
        revenueGoalProgressAlerts:
          marketplace?.revenueGoalProgressAlerts !== false,
        cancellations: basic.bookingsByStatus.canceled,
        noShows: basic.bookingsByStatus.noShow,
        goalContext,
      },
      teamPerformance,
      occupancy: {
        occupiedStations,
        availableStations: stations.length - occupiedStations,
        totalStations: stations.length,
        stations,
        busiestDays,
        busiestHours,
      },
      clients: {
        total: retention.totalClients,
        newClients: retention.newClients,
        returningClients: retention.returningClients,
        retentionRate: retention.retentionRate,
        loyaltyRate: retention.retentionRate,
        byTeamMember: byTeamMemberClients,
        bookingHistory: await this.getClientBookingHistory(
          marketplaceId,
          filters,
          40
        ),
      },
      payments: {
        totalSuiteEarnings: personFilter
          ? basic.overview.totalRevenue
          : totalFromTeam,
        byTeamMember: teamPerformance.map((t) => ({
          teamMemberId: t.teamMemberId,
          name: t.name,
          revenue: t.revenue,
        })),
        revenueByService,
        // No tip/commission columns on appointments — not enabled
        tipsAndCommissionsEnabled: false,
      },
      upNextToday,
    };
  }

  /**
   * PRD: Selecting a team member opens bookings, services, earnings and ratings.
   * teamMemberId: UUID or "owner"
   */
  static async getTeamMemberDetail(
    marketplaceId: string,
    ownerUserId: string,
    teamMemberId: string,
    dateRange: AnalyticsDateRange
  ): Promise<{
    teamMemberId: string | null;
    name: string;
    jobTitle: string | null;
    profilePic: string | null;
    isOwner: boolean;
    stationNumber: number;
    suiteRank: number | null;
    bookings: number;
    completedBookings: number;
    earnings: number;
    clients: number;
    rating: number | null;
    earningsByWeek: Array<{ label: string; revenue: number; weekStart: string }>;
    services: Array<{
      serviceId: string;
      serviceName: string;
      bookings: number;
      revenue: number;
    }>;
    ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
    reviewCount: number;
    reviews: Array<{
      id: string;
      clientName: string;
      rating: number;
      comment: string | null;
      createdAt: string;
    }>;
    recentBookings: Array<{
      id: string;
      dateTime: string;
      status: string;
      price: number;
      clientName: string | null;
      serviceName: string | null;
    }>;
  }> {
    const isOwner = teamMemberId === "owner";
    const memberKey = isOwner ? "owner" : teamMemberId;

    let name = "Team member";
    let jobTitle: string | null = null;
    let profilePic: string | null = null;

    const teamMembers = await User.findAll({
      where: { teamOwnerId: ownerUserId, isTeamMember: true },
      attributes: ["id", "name", "jobTitle", "profilePic", "createdAt"],
      order: [["createdAt", "ASC"]],
    });

    const stationIndex = new Map<string, number>();
    stationIndex.set("owner", 1);
    teamMembers.forEach((m, i) => {
      stationIndex.set(String(m.id), i + 2);
    });

    if (isOwner) {
      const owner = await User.findByPk(ownerUserId, {
        attributes: ["name", "businessName", "jobTitle", "profilePic"],
      });
      name = owner?.businessName || owner?.name || "Owner";
      jobTitle = owner?.jobTitle || "Suite owner";
      profilePic = owner?.profilePic || null;
    } else {
      const member = teamMembers.find((m) => String(m.id) === teamMemberId);
      if (!member) {
        throw new Error("Team member not found");
      }
      name = member.name || "Team member";
      jobTitle = member.jobTitle || null;
      profilePic = member.profilePic || null;
    }

    const filters: AnalyticsFilters = {
      dateRange,
      teamMemberId: memberKey,
    };
    const basic = await this.getBasicAnalytics(marketplaceId, dateRange, {
      assignedTeamMemberId: memberKey,
    });
    const services = await this.getRevenueByService(marketplaceId, {
      ...filters,
      bookingStatus: "completed",
    });
    const rating = await this.getMemberRating(
      marketplaceId,
      isOwner ? null : teamMemberId
    );
    const recentBookings = await this.getMetricDrilldown(
      marketplaceId,
      filters,
      "bookings"
    );

    const earningsByWeek = this.bucketRevenueByWeek(
      basic.revenueOverTime,
      dateRange
    );

    // Suite rank by completed revenue in the same period (1 = top).
    const suiteWide = await Appointment.findAll({
      where: buildAppointmentWhere(marketplaceId, {
        dateRange,
        bookingStatus: "completed",
      }) as any,
      attributes: ["assignedTeamMemberId", "price"],
      raw: true,
    });
    const revenueByKey = new Map<string, number>();
    revenueByKey.set("owner", 0);
    for (const m of teamMembers) {
      revenueByKey.set(String(m.id), 0);
    }
    for (const row of suiteWide as any[]) {
      const key = row.assignedTeamMemberId
        ? String(row.assignedTeamMemberId)
        : "owner";
      if (!revenueByKey.has(key)) continue;
      revenueByKey.set(
        key,
        (revenueByKey.get(key) || 0) + Number(row.price || 0)
      );
    }
    const ranked = Array.from(revenueByKey.entries()).sort(
      (a, b) => b[1] - a[1]
    );
    const suiteRankIndex = ranked.findIndex(([key]) => key === memberKey);
    const suiteRank =
      suiteRankIndex >= 0 && (revenueByKey.get(memberKey) || 0) > 0
        ? suiteRankIndex + 1
        : null;

    // Reviews / distribution are appointment-linked for this member (all-time),
    // matching getMemberRating — KPIs above stay period-scoped.
    const memberApptIds = (
      await Appointment.findAll({
        where: {
          marketplaceId,
          ...(isOwner
            ? { assignedTeamMemberId: null }
            : { assignedTeamMemberId: teamMemberId }),
        },
        attributes: ["id"],
        raw: true,
      })
    ).map((a: any) => a.id as string);

    const ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    let reviews: Array<{
      id: string;
      clientName: string;
      rating: number;
      comment: string | null;
      createdAt: string;
    }> = [];

    if (memberApptIds.length > 0) {
      const [reviewRows, distRows] = await Promise.all([
        Review.findAll({
          where: {
            appointmentId: { [Op.in]: memberApptIds },
            status: "approved",
            rating: { [Op.gte]: 1 },
          },
          include: [
            {
              model: User,
              as: "client",
              attributes: ["id", "name"],
            },
          ],
          order: [["createdAt", "DESC"]],
          limit: 20,
        }),
        Review.findAll({
          where: {
            appointmentId: { [Op.in]: memberApptIds },
            status: "approved",
            rating: { [Op.gte]: 1 },
          },
          attributes: [
            "rating",
            [Sequelize.fn("COUNT", Sequelize.col("id")), "cnt"],
          ],
          group: ["rating"],
          raw: true,
        }) as Promise<any[]>,
      ]);

      for (const row of distRows) {
        const stars = Math.round(Number(row.rating));
        if (stars >= 1 && stars <= 5) {
          ratingDistribution[stars as 1 | 2 | 3 | 4 | 5] = parseInt(
            row.cnt || "0",
            10
          );
        }
      }

      reviews = (reviewRows as any[]).map((r) => ({
        id: r.id,
        clientName: r.client?.name || "Client",
        rating: Number(r.rating),
        comment: r.comment || null,
        createdAt:
          r.createdAt?.toISOString?.() ||
          (r.createdAt ? String(r.createdAt) : ""),
      }));
    }

    const reviewCount =
      ratingDistribution[1] +
      ratingDistribution[2] +
      ratingDistribution[3] +
      ratingDistribution[4] +
      ratingDistribution[5];

    return {
      teamMemberId: isOwner ? null : teamMemberId,
      name,
      jobTitle,
      profilePic,
      isOwner,
      stationNumber: stationIndex.get(memberKey) || 1,
      suiteRank,
      bookings: basic.overview.totalBookings,
      completedBookings: basic.overview.completedBookings,
      earnings: basic.overview.totalRevenue,
      clients: basic.overview.totalClientCount,
      rating,
      earningsByWeek,
      services: services.map((s) => ({
        serviceId: s.serviceId,
        serviceName: s.serviceName,
        bookings: s.bookings,
        revenue: s.revenue,
      })),
      ratingDistribution,
      reviewCount,
      reviews,
      recentBookings: recentBookings.slice(0, 50).map((b) => ({
        id: b.id,
        dateTime: b.dateTime,
        status: b.status,
        price: b.price,
        clientName: b.clientName,
        serviceName: b.serviceName,
      })),
    };
  }

  /** Bucket daily revenue into Wk 1..N within the selected date range. */
  private static bucketRevenueByWeek(
    revenueOverTime: Array<{ date: string; revenue: number; bookings: number }>,
    dateRange: AnalyticsDateRange
  ): Array<{ label: string; revenue: number; weekStart: string }> {
    const start = new Date(dateRange.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.endDate);
    end.setHours(23, 59, 59, 999);

    const mondayOf = (d: Date) => {
      const copy = new Date(d);
      copy.setHours(0, 0, 0, 0);
      const day = copy.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      copy.setDate(copy.getDate() + diff);
      return copy;
    };

    let cursor = mondayOf(start);
    const bars: Array<{ label: string; revenue: number; weekStart: string }> =
      [];
    let index = 1;
    while (cursor <= end) {
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      const revenue = revenueOverTime
        .filter((row) => {
          const d = new Date(row.date);
          return d >= cursor && d <= weekEnd;
        })
        .reduce((sum, row) => sum + Number(row.revenue || 0), 0);
      bars.push({
        label: `Wk ${index}`,
        revenue,
        weekStart: cursor.toISOString().slice(0, 10),
      });
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 7);
      index += 1;
      if (index > 12) break;
    }
    return bars;
  }

  /** Drill-down: records behind a metric total (PRD detail state). */
  static async getMetricDrilldown(
    marketplaceId: string,
    filters: AnalyticsFilters,
    metric:
      | "bookings"
      | "completed"
      | "upcoming"
      | "cancelled"
      | "no_shows"
      | "clients"
      | "revenue"
  ): Promise<
    Array<{
      id: string;
      dateTime: string;
      status: string;
      price: number;
      clientName: string | null;
      serviceName: string | null;
      assignedTeamMemberId: string | null;
      stationNumber: number;
    }>
  > {
    let statusFilter: AnalyticsFilters["bookingStatus"] = filters.bookingStatus;
    if (metric === "completed" || metric === "revenue") statusFilter = "completed";
    if (metric === "cancelled") statusFilter = "cancelled";
    if (metric === "no_shows") statusFilter = "no_show";

    const where = buildAppointmentWhere(marketplaceId, {
      ...filters,
      bookingStatus: metric === "upcoming" ? null : statusFilter,
      bookingStatuses: metric === "upcoming" ? null : filters.bookingStatuses,
    }) as any;
    if (metric === "upcoming") {
      where.status = "pending";
    }

    const rows = await Appointment.findAll({
      where,
      include: [{ model: User, as: "user", attributes: ["id", "name"] }],
      order: [["dateTime", "DESC"]],
      limit: 100,
    });

    const serviceIds = Array.from(
      new Set(rows.map((a) => a.serviceId).filter(Boolean))
    );
    const services =
      serviceIds.length > 0
        ? ((await Service.findAll({
            where: { id: { [Op.in]: serviceIds } },
            attributes: ["id", "name"],
            raw: true,
          })) as any[])
        : [];
    const serviceMap = new Map(services.map((s) => [s.id, s.name]));

    const marketplace = await Marketplace.findByPk(marketplaceId, {
      attributes: ["userId"],
    });
    const stationIndex = new Map<string, number>();
    if (marketplace?.userId) {
      const teamMembers = await User.findAll({
        where: { teamOwnerId: marketplace.userId, isTeamMember: true },
        attributes: ["id"],
        order: [["createdAt", "ASC"]],
      });
      stationIndex.set("owner", 1);
      teamMembers.forEach((m, i) => {
        stationIndex.set(String(m.id), i + 2);
      });
    }

    return rows.map((a: any) => {
      const memberKey = a.assignedTeamMemberId
        ? String(a.assignedTeamMemberId)
        : "owner";
      return {
        id: a.id,
        dateTime: a.dateTime?.toISOString?.() || String(a.dateTime),
        status: a.status,
        price: Number(a.price),
        clientName: a.user?.name || null,
        serviceName: serviceMap.get(a.serviceId) || null,
        assignedTeamMemberId: a.assignedTeamMemberId,
        stationNumber: stationIndex.get(memberKey) || 1,
      };
    });
  }

  static async updateMonthlyRevenueGoal(
    marketplaceId: string,
    ownerUserId: string,
    goal: number | null,
    options?: {
      splitRevenueGoalByMember?: boolean;
      revenueGoalProgressAlerts?: boolean;
    }
  ): Promise<{
    monthlyRevenueGoal: number | null;
    splitRevenueGoalByMember: boolean;
    revenueGoalProgressAlerts: boolean;
  }> {
    const marketplace = await Marketplace.findOne({
      where: { id: marketplaceId, userId: ownerUserId },
    });
    if (!marketplace) {
      throw new Error("Marketplace not found");
    }
    const patch: Record<string, unknown> = {
      monthlyRevenueGoal: goal == null ? null : Number(goal),
    };
    if (typeof options?.splitRevenueGoalByMember === "boolean") {
      patch.splitRevenueGoalByMember = options.splitRevenueGoalByMember;
    }
    if (typeof options?.revenueGoalProgressAlerts === "boolean") {
      patch.revenueGoalProgressAlerts = options.revenueGoalProgressAlerts;
    }
    await marketplace.update(patch);
    await marketplace.reload();
    return {
      monthlyRevenueGoal:
        marketplace.monthlyRevenueGoal != null
          ? Number(marketplace.monthlyRevenueGoal)
          : null,
      splitRevenueGoalByMember: marketplace.splitRevenueGoalByMember === true,
      revenueGoalProgressAlerts:
        marketplace.revenueGoalProgressAlerts !== false,
    };
  }

  /** Completed revenue helpers for the revenue-goal editor. */
  private static async getRevenueGoalContext(marketplaceId: string): Promise<{
    last3MonthsAverage: number;
    previousMonthRevenue: number;
    previousMonthLabel: string;
  }> {
    const now = new Date();
    const threeStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const rows = (await Appointment.findAll({
      where: {
        marketplaceId,
        status: COMPLETED,
        dateTime: { [Op.between]: [threeStart, prevEnd] },
      },
      attributes: ["dateTime", "price"],
      raw: true,
    })) as Array<{ dateTime: Date | string; price: number }>;

    const byMonth = new Map<string, number>();
    for (const row of rows) {
      const when = new Date(row.dateTime);
      const key = `${when.getFullYear()}-${when.getMonth()}`;
      byMonth.set(key, (byMonth.get(key) || 0) + Number(row.price || 0));
    }

    const monthTotals: number[] = [];
    for (let i = 3; i >= 1; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthTotals.push(byMonth.get(key) || 0);
    }
    const last3MonthsAverage =
      monthTotals.reduce((sum, v) => sum + v, 0) / 3;

    const prevKey = `${prevStart.getFullYear()}-${prevStart.getMonth()}`;
    const previousMonthRevenue = byMonth.get(prevKey) || 0;
    const previousMonthLabel = prevStart.toLocaleString("en-US", {
      month: "long",
    });

    return {
      last3MonthsAverage: Math.round(last3MonthsAverage * 100) / 100,
      previousMonthRevenue: Math.round(previousMonthRevenue * 100) / 100,
      previousMonthLabel,
    };
  }

  // ─── private helpers ─────────────────────────────────────────────

  private static async getClientBookingHistory(
    marketplaceId: string,
    filters: AnalyticsFilters,
    limit: number
  ): Promise<
    Array<{
      appointmentId: string;
      clientId: string;
      clientName: string | null;
      serviceName: string | null;
      dateTime: string;
      status: string;
      price: number;
      teamMemberId: string | null;
    }>
  > {
    const rows = await Appointment.findAll({
      where: buildAppointmentWhere(marketplaceId, filters) as any,
      include: [{ model: User, as: "user", attributes: ["id", "name"] }],
      order: [["dateTime", "DESC"]],
      limit,
    });

    const serviceIds = Array.from(
      new Set(rows.map((a) => a.serviceId).filter(Boolean))
    );
    const services =
      serviceIds.length > 0
        ? ((await Service.findAll({
            where: { id: { [Op.in]: serviceIds } },
            attributes: ["id", "name"],
            raw: true,
          })) as any[])
        : [];
    const serviceMap = new Map(services.map((s) => [s.id, s.name]));

    return rows.map((a: any) => ({
      appointmentId: a.id,
      clientId: a.userId,
      clientName: a.user?.name || null,
      serviceName: serviceMap.get(a.serviceId) || null,
      dateTime: a.dateTime?.toISOString?.() || String(a.dateTime),
      status: a.status,
      price: Number(a.price),
      teamMemberId: a.assignedTeamMemberId,
    }));
  }

  private static async getPayoutBankLast4(
    stripeAccountId: string
  ): Promise<string | null> {
    if (!stripe) return null;
    try {
      const external = await stripe.accounts.listExternalAccounts(
        stripeAccountId,
        { object: "bank_account", limit: 1 }
      );
      const bank = external.data[0] as { last4?: string } | undefined;
      return bank?.last4 ?? null;
    } catch (err) {
      console.error("Failed to read Stripe payout bank for analytics:", err);
      return null;
    }
  }

  private static async countCompletedAppointments(
    marketplaceId: string,
    range: AnalyticsDateRange,
    assignedTeamMemberId?: string
  ): Promise<number> {
    const where: any = {
      marketplaceId,
      status: COMPLETED,
      dateTime: { [Op.between]: [range.startDate, range.endDate] },
    };
    if (assignedTeamMemberId) {
      where.assignedTeamMemberId = assignedTeamMemberId;
    }
    return Appointment.count({ where });
  }

  private static async sumCompletedRevenue(
    marketplaceId: string,
    range: AnalyticsDateRange,
    assignedTeamMemberId?: string
  ): Promise<number> {
    const where: any = {
      marketplaceId,
      status: COMPLETED,
      dateTime: { [Op.between]: [range.startDate, range.endDate] },
    };
    if (assignedTeamMemberId) {
      where.assignedTeamMemberId = assignedTeamMemberId;
    }
    const row = (await Appointment.findOne({
      where,
      attributes: [[Sequelize.fn("SUM", Sequelize.col("price")), "revenue"]],
      raw: true,
    })) as any;
    return parseFloat(row?.revenue || "0");
  }

  private static async getMemberRating(
    marketplaceId: string,
    teamMemberId: string | null
  ): Promise<number | null> {
    const appts = await Appointment.findAll({
      where: {
        marketplaceId,
        ...(teamMemberId
          ? { assignedTeamMemberId: teamMemberId }
          : { assignedTeamMemberId: null }),
      },
      attributes: ["id"],
      raw: true,
    });
    const ids = appts.map((a: any) => a.id);
    if (ids.length === 0) return null;

    const result = (await Review.findOne({
      where: {
        appointmentId: { [Op.in]: ids },
        status: "approved",
      },
      attributes: [[Sequelize.fn("AVG", Sequelize.col("rating")), "avg"]],
      raw: true,
    })) as any;

    const avg = parseFloat(result?.avg || "");
    return Number.isFinite(avg) ? Math.round(avg * 10) / 10 : null;
  }

  private static async getRevenueOverTime(
    marketplaceId: string,
    filters: AnalyticsFilters
  ) {
    const where = {
      ...buildAppointmentWhere(marketplaceId, {
        ...filters,
        bookingStatus: "completed",
      }),
    };
    const appointments = (await Appointment.findAll({
      where: where as any,
      attributes: [
        [Sequelize.fn("DATE", Sequelize.col("dateTime")), "date"],
        [Sequelize.fn("SUM", Sequelize.col("price")), "revenue"],
        [Sequelize.fn("COUNT", Sequelize.col("id")), "bookings"],
      ],
      group: [Sequelize.fn("DATE", Sequelize.col("dateTime"))],
      order: [[Sequelize.fn("DATE", Sequelize.col("dateTime")), "ASC"]],
      raw: true,
    })) as any[];

    return appointments.map((apt) => ({
      date: apt.date,
      revenue: parseFloat(apt.revenue || "0"),
      bookings: parseInt(apt.bookings || "0", 10),
    }));
  }

  private static async getRevenueByService(
    marketplaceId: string,
    filters: AnalyticsFilters
  ) {
    const where = buildAppointmentWhere(marketplaceId, {
      ...filters,
      bookingStatus: filters.bookingStatus || "completed",
    });
    // Revenue by service always uses completed unless status filter is cancel/no-show
    if (!filters.bookingStatus || filters.bookingStatus === "completed") {
      Object.assign(where, { status: COMPLETED });
    }

    const results = (await Appointment.findAll({
      where: where as any,
      attributes: [
        "serviceId",
        [Sequelize.fn("SUM", Sequelize.col("price")), "revenue"],
        [Sequelize.fn("COUNT", Sequelize.col("id")), "bookings"],
        [Sequelize.fn("AVG", Sequelize.col("price")), "avgPrice"],
      ],
      group: ["serviceId"],
      raw: true,
    })) as any[];

    const serviceIds = results.map((r) => r.serviceId).filter(Boolean);
    const services =
      serviceIds.length > 0
        ? ((await Service.findAll({
            where: { id: { [Op.in]: serviceIds } },
            attributes: ["id", "name"],
            raw: true,
          })) as any[])
        : [];
    const serviceMap = new Map(services.map((s) => [s.id, s.name]));

    return results.map((r) => ({
      serviceId: r.serviceId,
      serviceName: serviceMap.get(r.serviceId) || "Unknown Service",
      revenue: parseFloat(r.revenue || "0"),
      bookings: parseInt(r.bookings || "0", 10),
      avgPrice: parseFloat(r.avgPrice || "0"),
    }));
  }

  private static async getRevenueByClient(
    marketplaceId: string,
    filters: AnalyticsFilters
  ) {
    const where = buildAppointmentWhere(marketplaceId, {
      ...filters,
      bookingStatus: "completed",
    });

    const results = (await Appointment.findAll({
      where: where as any,
      attributes: [
        "userId",
        [Sequelize.fn("SUM", Sequelize.col("price")), "revenue"],
        [Sequelize.fn("COUNT", Sequelize.col("id")), "bookings"],
      ],
      group: ["userId"],
      order: [[Sequelize.fn("SUM", Sequelize.col("price")), "DESC"]],
      limit: 10,
      raw: true,
    })) as any[];

    const userIds = results.map((r) => r.userId);
    const users =
      userIds.length > 0
        ? ((await User.findAll({
            where: { id: { [Op.in]: userIds } },
            attributes: ["id", "name"],
            raw: true,
          })) as any[])
        : [];
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    return results.map((r) => ({
      clientId: r.userId,
      clientName: userMap.get(r.userId) || "Unknown Client",
      revenue: parseFloat(r.revenue || "0"),
      bookings: parseInt(r.bookings || "0", 10),
    }));
  }

  private static async getTopServices(
    marketplaceId: string,
    filters: AnalyticsFilters,
    limit: number
  ) {
    const rows = await this.getRevenueByService(marketplaceId, {
      ...filters,
      bookingStatus: "completed",
    });
    const top = rows.sort((a, b) => b.bookings - a.bookings).slice(0, limit);
    const detailed = [];
    for (const row of top) {
      const periodClients = (await Appointment.findAll({
        where: {
          marketplaceId,
          serviceId: row.serviceId,
          status: COMPLETED,
          dateTime: {
            [Op.between]: [filters.dateRange.startDate, filters.dateRange.endDate],
          },
        },
        attributes: ["userId"],
        raw: true,
      })) as any[];
      const clientIds = Array.from(
        new Set(periodClients.map((item) => item.userId).filter(Boolean))
      );
      let returningRate = 0;
      if (clientIds.length > 0) {
        const counts = (await Appointment.findAll({
          where: {
            marketplaceId,
            userId: { [Op.in]: clientIds },
            status: COMPLETED,
          },
          attributes: ["userId", [Sequelize.fn("COUNT", Sequelize.col("id")), "cnt"]],
          group: ["userId"],
          raw: true,
        })) as any[];
        const returning = counts.filter((item) => parseInt(item.cnt || "0", 10) > 1).length;
        returningRate = (returning / clientIds.length) * 100;
      }
      detailed.push({ ...row, returningRate });
    }
    return detailed;
  }

  static async getMonthlyTrend(
    marketplaceId: string,
    assignedTeamMemberId?: string,
    months = 6
  ): Promise<Array<{ month: string; revenue: number; bookings: number }>> {
    const today = new Date();
    const rows = [];
    for (let index = months - 1; index >= 0; index -= 1) {
      const start = new Date(today.getFullYear(), today.getMonth() - index, 1, 0, 0, 0, 0);
      const end = new Date(today.getFullYear(), today.getMonth() - index + 1, 0, 23, 59, 59, 999);
      const range = { startDate: start, endDate: end, preset: "month" as const };
      const [revenue, bookings] = await Promise.all([
        this.sumCompletedRevenue(marketplaceId, range, assignedTeamMemberId),
        this.countCompletedAppointments(marketplaceId, range, assignedTeamMemberId),
      ]);
      const month = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
      rows.push({ month, revenue, bookings });
    }
    return rows;
  }

  static async getServiceInsight(
    marketplaceId: string,
    serviceId: string,
    dateRange: AnalyticsDateRange,
    assignedTeamMemberId?: string
  ) {
    const service = await Service.findByPk(serviceId, {
      attributes: ["id", "name", "price", "duration"],
    });
    if (!service) return null;

    const where: any = {
      marketplaceId,
      serviceId,
      status: COMPLETED,
      dateTime: { [Op.between]: [dateRange.startDate, dateRange.endDate] },
    };
    if (assignedTeamMemberId) where.assignedTeamMemberId = assignedTeamMemberId;

    const periodRows = (await Appointment.findAll({
      where,
      attributes: ["userId", "price", "dateTime"],
      raw: true,
    })) as any[];
    const revenue = periodRows.reduce((sum, row) => sum + Number(row.price || 0), 0);
    const bookings = periodRows.length;
    const clientIds = Array.from(new Set(periodRows.map((row) => row.userId).filter(Boolean)));

    const previous = previousPeriodRange(dateRange);
    const previousWhere = {
      ...where,
      dateTime: { [Op.between]: [previous.startDate, previous.endDate] },
    };
    const previousBookings = await Appointment.count({ where: previousWhere });

    let returningClients = 0;
    const oneTimeClientIds: string[] = [];
    if (clientIds.length > 0) {
      const counts = (await Appointment.findAll({
        where: {
          marketplaceId,
          userId: { [Op.in]: clientIds },
          status: COMPLETED,
        },
        attributes: ["userId", [Sequelize.fn("COUNT", Sequelize.col("id")), "cnt"]],
        group: ["userId"],
        raw: true,
      })) as any[];
      for (const row of counts) {
        const count = parseInt(row.cnt || "0", 10);
        if (count > 1) returningClients += 1;
        if (count === 1) oneTimeClientIds.push(row.userId);
      }
    }

    const totalRevenue = await this.sumCompletedRevenue(
      marketplaceId,
      dateRange,
      assignedTeamMemberId
    );

    const months = [];
    const end = dateRange.endDate;
    for (let index = 5; index >= 0; index -= 1) {
      const start = new Date(end.getFullYear(), end.getMonth() - index, 1, 0, 0, 0, 0);
      const monthEnd = new Date(end.getFullYear(), end.getMonth() - index + 1, 0, 23, 59, 59, 999);
      const monthWhere = {
        ...where,
        dateTime: { [Op.between]: [start, monthEnd] },
      };
      const count = await Appointment.count({ where: monthWhere });
      months.push({
        month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`,
        bookings: count,
      });
    }

    return {
      serviceId: service.id,
      serviceName: service.name,
      price: Number(service.price) || 0,
      duration: service.duration,
      revenue,
      bookings,
      previousBookings,
      revenueShare: totalRevenue === 0 ? 0 : (revenue / totalRevenue) * 100,
      clientCount: clientIds.length,
      returningClients,
      returningRate: clientIds.length === 0 ? 0 : (returningClients / clientIds.length) * 100,
      oneTimeClientIds,
      months,
    };
  }

  /**
   * PRD: returning clients = more than one completed appointment.
   * new = clients in period with exactly one lifetime completed (or first period visit).
   */
  private static async getRetentionMetrics(
    marketplaceId: string,
    filters: AnalyticsFilters
  ) {
    const inPeriod = (await Appointment.findAll({
      where: buildAppointmentWhere(marketplaceId, filters) as any,
      attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("userId")), "userId"]],
      raw: true,
    })) as any[];

    const clientIds = inPeriod.map((c) => c.userId);
    const totalClients = clientIds.length;
    if (totalClients === 0) {
      return {
        totalClients: 0,
        newClients: 0,
        returningClients: 0,
        retentionRate: 0,
      };
    }

    const completedCounts = (await Appointment.findAll({
      where: {
        marketplaceId,
        userId: { [Op.in]: clientIds },
        status: COMPLETED,
      },
      attributes: [
        "userId",
        [Sequelize.fn("COUNT", Sequelize.col("id")), "cnt"],
      ],
      group: ["userId"],
      raw: true,
    })) as any[];

    const returningClients = completedCounts.filter(
      (r) => parseInt(r.cnt || "0", 10) > 1
    ).length;
    const newClients = totalClients - returningClients;
    const retentionRate =
      totalClients > 0 ? (returningClients / totalClients) * 100 : 0;

    return {
      totalClients,
      newClients,
      returningClients,
      retentionRate,
    };
  }

  private static async getTrends(
    marketplaceId: string,
    filters: AnalyticsFilters
  ) {
    const prev = previousPeriodRange(filters.dateRange);
    const [currentStats, previousStats] = await Promise.all([
      this.getPeriodStats(marketplaceId, filters),
      this.getPeriodStats(marketplaceId, { ...filters, dateRange: prev }),
    ]);

    const pct = (cur: number, prevV: number) =>
      prevV > 0 ? ((cur - prevV) / prevV) * 100 : 0;

    const avgBookingValue =
      currentStats.bookings > 0
        ? currentStats.revenue / currentStats.bookings
        : 0;
    const previousAvg =
      previousStats.bookings > 0
        ? previousStats.revenue / previousStats.bookings
        : 0;

    return {
      revenueGrowth: pct(currentStats.revenue, previousStats.revenue),
      bookingGrowth: pct(currentStats.bookings, previousStats.bookings),
      avgBookingValue,
      avgBookingValueChange: pct(avgBookingValue, previousAvg),
      newClientsGrowth: pct(currentStats.newClients, previousStats.newClients),
      repeatClientsGrowth: pct(
        currentStats.repeatClients,
        previousStats.repeatClients
      ),
      noShowGrowth: pct(currentStats.noShows, previousStats.noShows),
    };
  }

  private static async getPeriodStats(
    marketplaceId: string,
    filters: AnalyticsFilters
  ) {
    const basic = await this.getBasicAnalytics(marketplaceId, filters.dateRange, {
      assignedTeamMemberId: filters.teamMemberId || undefined,
      serviceId: filters.serviceId || undefined,
      bookingStatus: filters.bookingStatus,
    });
    return {
      revenue: basic.overview.totalRevenue,
      bookings: basic.overview.totalBookings,
      newClients: basic.overview.newClients,
      repeatClients: basic.overview.repeatClients,
      noShows: basic.bookingsByStatus.noShow,
    };
  }

  private static async getClientGrowth(
    marketplaceId: string,
    filters: AnalyticsFilters
  ) {
    const appointmentsByDate = (await Appointment.findAll({
      where: buildAppointmentWhere(marketplaceId, filters) as any,
      attributes: [
        [Sequelize.fn("DATE", Sequelize.col("dateTime")), "date"],
        "userId",
      ],
      group: [Sequelize.fn("DATE", Sequelize.col("dateTime")), "userId"],
      order: [[Sequelize.fn("DATE", Sequelize.col("dateTime")), "ASC"]],
      raw: true,
    })) as any[];

    const dateMap = new Map<
      string,
      { newClients: Set<string>; repeatClients: Set<string> }
    >();

    for (const apt of appointmentsByDate) {
      const date = apt.date;
      if (!dateMap.has(date)) {
        dateMap.set(date, {
          newClients: new Set(),
          repeatClients: new Set(),
        });
      }
      const completedBefore = await Appointment.count({
        where: {
          marketplaceId,
          userId: apt.userId,
          status: COMPLETED,
          dateTime: { [Op.lt]: new Date(date) },
        },
      });
      const dateData = dateMap.get(date)!;
      if (completedBefore === 0) {
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

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfMonday(d: Date): Date {
  const x = startOfDay(d);
  const weekday = x.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  x.setDate(x.getDate() + diff);
  return x;
}

function formatYmd(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}
