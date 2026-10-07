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
  const { dateRange, teamMemberId, serviceId, bookingStatus } = filters;
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

  const status = statusWhere(bookingStatus);
  if (status) Object.assign(where, status);

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
    };

    const basicAnalytics = await this.getBasicAnalytics(
      marketplaceId,
      filters.dateRange,
      {
        assignedTeamMemberId: options?.assignedTeamMemberId,
        serviceId: options?.serviceId,
        bookingStatus: options?.bookingStatus,
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
  ): Promise<{ today: number; thisWeek: number; thisMonth: number }> {
    const now = new Date();
    const today = resolveAnalyticsDateRange({ period: "today", now });
    const week = resolveAnalyticsDateRange({ period: "week", now });
    const month = resolveAnalyticsDateRange({ period: "month", now });

    const [t, w, m] = await Promise.all([
      this.sumCompletedRevenue(marketplaceId, today, options?.assignedTeamMemberId),
      this.sumCompletedRevenue(marketplaceId, week, options?.assignedTeamMemberId),
      this.sumCompletedRevenue(marketplaceId, month, options?.assignedTeamMemberId),
    ]);

    return { today: t, thisWeek: w, thisMonth: m };
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
    }>
  > {
    const owner = await User.findByPk(ownerUserId, {
      attributes: ["id", "stripeConnectAccountId"],
    });
    if (!owner?.stripeConnectAccountId || !stripe) {
      return [];
    }

    try {
      const payouts = await stripe.payouts.list(
        { limit: Math.min(limit, 50) },
        { stripeAccount: owner.stripeConnectAccountId }
      );
      return payouts.data.map((p) => ({
        id: p.id,
        amount: p.amount / 100,
        currency: (p.currency || "usd").toUpperCase(),
        status: p.status,
        arrivalDate: p.arrival_date
          ? new Date(p.arrival_date * 1000).toISOString()
          : null,
        created: new Date(p.created * 1000).toISOString(),
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
      totalSuiteRevenue: number;
      monthlyRevenueGoal: number | null;
      cancellations: number;
      noShows: number;
    };
    teamPerformance: Array<{
      teamMemberId: string | null;
      name: string;
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
      }>;
      tipsAndCommissionsEnabled: boolean;
    };
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
      attributes: ["id", "name"],
    });

    const owner = await User.findByPk(ownerUserId, {
      attributes: ["id", "name", "businessName"],
    });

    const membersForPerf: Array<{
      id: string | null;
      name: string;
      isOwner: boolean;
    }> = [
      {
        id: null,
        name: owner?.businessName || owner?.name || "Owner",
        isOwner: true,
      },
      ...teamMembers.map((m) => ({
        id: m.id as string,
        name: m.name || "Team member",
        isOwner: false,
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

    const revenueByService = await this.getRevenueByService(marketplaceId, {
      dateRange: filters.dateRange,
      teamMemberId: filters.teamMemberId,
      serviceId: filters.serviceId,
      bookingStatus: filters.bookingStatus === "completed" ? "completed" : filters.bookingStatus,
    });

    // Suite total from team rows — no double counting
    const totalFromTeam = teamPerformance.reduce((s, t) => s + t.revenue, 0);

    return {
      businessOverview: {
        upcomingAppointments,
        teamBookingActivity: basic.overview.totalBookings,
        totalSuiteRevenue: personFilter ? basic.overview.totalRevenue : totalFromTeam,
        monthlyRevenueGoal: marketplace?.monthlyRevenueGoal != null
          ? Number(marketplace.monthlyRevenueGoal)
          : null,
        cancellations: basic.bookingsByStatus.canceled,
        noShows: basic.bookingsByStatus.noShow,
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
    isOwner: boolean;
    bookings: number;
    completedBookings: number;
    earnings: number;
    rating: number | null;
    services: Array<{
      serviceId: string;
      serviceName: string;
      bookings: number;
      revenue: number;
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
    if (isOwner) {
      const owner = await User.findByPk(ownerUserId, {
        attributes: ["name", "businessName"],
      });
      name = owner?.businessName || owner?.name || "Owner";
    } else {
      const member = await User.findOne({
        where: {
          id: teamMemberId,
          teamOwnerId: ownerUserId,
          isTeamMember: true,
        },
        attributes: ["name"],
      });
      if (!member) {
        throw new Error("Team member not found");
      }
      name = member.name || "Team member";
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

    return {
      teamMemberId: isOwner ? null : teamMemberId,
      name,
      isOwner,
      bookings: basic.overview.totalBookings,
      completedBookings: basic.overview.completedBookings,
      earnings: basic.overview.totalRevenue,
      rating,
      services: services.map((s) => ({
        serviceId: s.serviceId,
        serviceName: s.serviceName,
        bookings: s.bookings,
        revenue: s.revenue,
      })),
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

  /** Drill-down: records behind a metric total (PRD detail state). */
  static async getMetricDrilldown(
    marketplaceId: string,
    filters: AnalyticsFilters,
    metric:
      | "bookings"
      | "completed"
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
    }>
  > {
    let statusFilter: AnalyticsFilters["bookingStatus"] = filters.bookingStatus;
    if (metric === "completed" || metric === "revenue") statusFilter = "completed";
    if (metric === "cancelled") statusFilter = "cancelled";
    if (metric === "no_shows") statusFilter = "no_show";

    const where = buildAppointmentWhere(marketplaceId, {
      ...filters,
      bookingStatus: statusFilter,
    });

    const rows = await Appointment.findAll({
      where: where as any,
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

    return rows.map((a: any) => ({
      id: a.id,
      dateTime: a.dateTime?.toISOString?.() || String(a.dateTime),
      status: a.status,
      price: Number(a.price),
      clientName: a.user?.name || null,
      serviceName: serviceMap.get(a.serviceId) || null,
      assignedTeamMemberId: a.assignedTeamMemberId,
    }));
  }

  static async updateMonthlyRevenueGoal(
    marketplaceId: string,
    ownerUserId: string,
    goal: number | null
  ): Promise<number | null> {
    const marketplace = await Marketplace.findOne({
      where: { id: marketplaceId, userId: ownerUserId },
    });
    if (!marketplace) {
      throw new Error("Marketplace not found");
    }
    await marketplace.update({
      monthlyRevenueGoal: goal == null ? null : Number(goal),
    });
    return marketplace.monthlyRevenueGoal != null
      ? Number(marketplace.monthlyRevenueGoal)
      : null;
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
    return rows
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, limit)
      .map(({ serviceId, serviceName, bookings, revenue }) => ({
        serviceId,
        serviceName,
        bookings,
        revenue,
      }));
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
