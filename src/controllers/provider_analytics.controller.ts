import { Request, Response } from "express";
import { ProviderAnalyticsService } from "../services/provider_analytics.service";
import { Marketplace } from "../models/marketplace_model";
import { Service } from "../models/service_model";
import {
  getEarningsScope,
  getTeamMemberPermissionsForUser,
} from "../utils/team_member_permission_helper";

interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

async function resolveMarketplaceAccess(req: AuthRequest, marketplaceId: string) {
  let marketplace = await Marketplace.findOne({
    where: {
      id: marketplaceId,
      userId: req.userId,
    },
  });

  if (!marketplace && req.user?.isTeamMember && req.user?.teamOwnerId) {
    marketplace = await Marketplace.findOne({
      where: {
        id: marketplaceId,
        userId: req.user.teamOwnerId,
      },
    });
  }

  return marketplace;
}

function accessUserId(req: AuthRequest): string {
  return req.user?.isTeamMember ? req.user.teamOwnerId : req.userId!;
}

function parseFilters(req: AuthRequest) {
  const dateRange = ProviderAnalyticsService.resolveDateRange({
    period: req.query.period as string | undefined,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
  });

  const teamMemberId =
    typeof req.query.teamMemberId === "string" && req.query.teamMemberId.trim()
      ? req.query.teamMemberId.trim()
      : null;

  const serviceId =
    typeof req.query.serviceId === "string" && req.query.serviceId.trim()
      ? req.query.serviceId.trim()
      : null;

  const rawStatus = (req.query.bookingStatus as string | undefined)?.toLowerCase();
  let bookingStatus: "completed" | "cancelled" | "no_show" | null = null;
  if (rawStatus === "completed" || rawStatus === "cancelled" || rawStatus === "no_show") {
    bookingStatus = rawStatus;
  }

  return { dateRange, teamMemberId, serviceId, bookingStatus };
}

/**
 * GET /provider-analytics/access
 * Solo: earnings always; booking basic @ Pro; advanced @ Premium
 * Suite: full booking+advanced (all suite tiers inherit Premium features)
 */
export const checkAnalyticsAccess = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const uid = accessUserId(req);
    const access = await ProviderAnalyticsService.checkAnalyticsAccess(uid);
    const role = req.user?.role === "suite" ? "suite" : "solo";
    const isSuiteOwner =
      role === "suite" && req.user?.isTeamMember !== true;

    res.status(200).json({
      status: true,
      message: "Analytics access checked successfully",
      data: {
        hasEarnings: access.hasEarnings,
        hasBasic: access.hasBasic,
        hasAdvanced: access.hasAdvanced,
        accessLevel: access.hasAdvanced
          ? "advanced"
          : access.hasBasic
            ? "basic"
            : "earnings_only",
        role,
        isSuiteOwner,
        // Suite owners always get full suite analytics scope (PRD)
        hasSuiteAnalytics: isSuiteOwner,
      },
    });
  } catch (error) {
    console.error("Error checking analytics access:", error);
    res.status(500).json({
      status: false,
      message: "Failed to check analytics access",
    });
  }
};

/**
 * Unified dashboard — PRD Solo + Suite
 * Query: period|startDate/endDate, teamMemberId, serviceId, bookingStatus
 */
export const getProviderAnalytics = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const { marketplaceId } = req.params;
    const marketplace = await resolveMarketplaceAccess(req, marketplaceId);
    if (!marketplace) {
      res.status(404).json({
        status: false,
        message: "Marketplace not found or access denied",
      });
      return;
    }

    const uid = accessUserId(req);
    const access = await ProviderAnalyticsService.checkAnalyticsAccess(uid);
    const isSuiteOwner =
      req.user?.role === "suite" && req.user?.isTeamMember !== true;

    let filters;
    try {
      filters = parseFilters(req);
    } catch (e: any) {
      res.status(400).json({ status: false, message: e.message || "Invalid filters" });
      return;
    }

    // Team members: limited earnings scope may force person filter
    if (req.user?.isTeamMember) {
      const permissions = await getTeamMemberPermissionsForUser(req.user);
      if (!permissions?.viewAnalytics) {
        res.status(403).json({
          status: false,
          message: "You do not have permission to view analytics.",
        });
        return;
      }
      const scope = getEarningsScope(permissions);
      if (scope === "limited") {
        filters.teamMemberId = req.userId!;
      }
    }

    // Solo Basic: earnings only — never expose booking/advanced payloads
    if (!isSuiteOwner && !access.hasBasic && !access.hasAdvanced) {
      const [earnings, payouts] = await Promise.all([
        ProviderAnalyticsService.getEarningsSummary(marketplaceId, {
          assignedTeamMemberId: filters.teamMemberId || undefined,
        }),
        ProviderAnalyticsService.getStripePayoutHistory(uid),
      ]);

      res.status(200).json({
        status: true,
        message: "Earnings analytics retrieved successfully",
        data: {
          accessLevel: "earnings_only",
          dateRange: filters.dateRange,
          filters: {
            teamMemberId: filters.teamMemberId,
            serviceId: filters.serviceId,
            bookingStatus: filters.bookingStatus,
          },
          earnings,
          payouts,
          restricted: {
            bookingAnalytics: {
              unlocksAt: "solo_pro",
              message:
                "Upgrade to Pro to unlock booking totals, cancellations, no-shows, and client count.",
            },
            advancedAnalytics: {
              unlocksAt: "solo_premium",
              message:
                "Upgrade to Premium for revenue by service/client, retention, and growth trends.",
            },
          },
        },
      });
      return;
    }

    if (isSuiteOwner) {
      const [suite, payouts, earnings] = await Promise.all([
        ProviderAnalyticsService.getSuiteAnalytics(
          marketplaceId,
          uid,
          filters
        ),
        ProviderAnalyticsService.getStripePayoutHistory(uid),
        ProviderAnalyticsService.getEarningsSummary(marketplaceId),
      ]);

      res.status(200).json({
        status: true,
        message: "Suite analytics retrieved successfully",
        data: {
          accessLevel: "suite",
          dateRange: filters.dateRange,
          filters: {
            teamMemberId: filters.teamMemberId,
            serviceId: filters.serviceId,
            bookingStatus: filters.bookingStatus,
          },
          earnings,
          payouts,
          suite,
        },
      });
      return;
    }

    // Solo Pro / Premium (and suite team members with analytics)
    const analyticsOptions = {
      assignedTeamMemberId: filters.teamMemberId,
      serviceId: filters.serviceId || undefined,
      bookingStatus: filters.bookingStatus,
    };

    const analytics = access.hasAdvanced
      ? await ProviderAnalyticsService.getAdvancedAnalytics(
          marketplaceId,
          filters.dateRange,
          analyticsOptions
        )
      : await ProviderAnalyticsService.getBasicAnalytics(
          marketplaceId,
          filters.dateRange,
          analyticsOptions
        );

    const [earnings, payouts] = await Promise.all([
      ProviderAnalyticsService.getEarningsSummary(marketplaceId, {
        assignedTeamMemberId:
          filters.teamMemberId && filters.teamMemberId !== "owner"
            ? filters.teamMemberId
            : undefined,
      }),
      ProviderAnalyticsService.getStripePayoutHistory(uid),
    ]);

    res.status(200).json({
      status: true,
      message: "Analytics retrieved successfully",
      data: {
        analytics,
        accessLevel: access.hasAdvanced ? "advanced" : "basic",
        dateRange: filters.dateRange,
        filters: {
          teamMemberId: filters.teamMemberId,
          serviceId: filters.serviceId,
          bookingStatus: filters.bookingStatus,
        },
        earnings,
        payouts,
        restricted: access.hasAdvanced
          ? null
          : {
              advancedAnalytics: {
                unlocksAt: "solo_premium",
                message:
                  "Upgrade to Premium for revenue by service/client, top services, retention, and growth trends.",
              },
            },
      },
    });
  } catch (error) {
    console.error("Error fetching provider analytics:", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch analytics",
    });
  }
};

/** PRD earnings — available all Solo tiers + suite */
export const getEarningsSummary = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const { marketplaceId } = req.params;
    const marketplace = await resolveMarketplaceAccess(req, marketplaceId);
    if (!marketplace) {
      res.status(404).json({
        status: false,
        message: "Marketplace not found or access denied",
      });
      return;
    }

    let assignedTeamMemberId: string | undefined;
    if (req.user?.isTeamMember) {
      const permissions = await getTeamMemberPermissionsForUser(req.user);
      const scope = getEarningsScope(permissions);
      if (scope === "none") {
        res.status(403).json({
          status: false,
          message: "You do not have permission to view earnings.",
        });
        return;
      }
      if (scope === "limited") {
        assignedTeamMemberId = req.userId;
      }
    }

    const data = await ProviderAnalyticsService.getEarningsSummary(
      marketplaceId,
      { assignedTeamMemberId }
    );

    res.status(200).json({
      status: true,
      message: "Earnings summary retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error fetching earnings summary:", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch earnings summary",
    });
  }
};

export const getPayoutHistory = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const uid = accessUserId(req);
    const payouts = await ProviderAnalyticsService.getStripePayoutHistory(uid);

    res.status(200).json({
      status: true,
      message: "Payout history retrieved successfully",
      data: { payouts },
    });
  } catch (error) {
    console.error("Error fetching payout history:", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch payout history",
    });
  }
};

/**
 * PRD Suite: team member detail — bookings, services, earnings, ratings
 */
export const getTeamMemberAnalyticsDetail = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    if (req.user?.role !== "suite" || req.user?.isTeamMember === true) {
      res.status(403).json({
        status: false,
        message: "Team member analytics detail is only for suite owners.",
      });
      return;
    }

    const { marketplaceId, teamMemberId } = req.params;
    const marketplace = await resolveMarketplaceAccess(req, marketplaceId);
    if (!marketplace) {
      res.status(404).json({
        status: false,
        message: "Marketplace not found or access denied",
      });
      return;
    }

    let dateRange;
    try {
      dateRange = ProviderAnalyticsService.resolveDateRange({
        period: req.query.period as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
      });
    } catch (e: any) {
      res.status(400).json({ status: false, message: e.message });
      return;
    }

    const detail = await ProviderAnalyticsService.getTeamMemberDetail(
      marketplaceId,
      req.userId,
      teamMemberId,
      dateRange
    );

    res.status(200).json({
      status: true,
      message: "Team member analytics retrieved successfully",
      data: { detail, dateRange },
    });
  } catch (error: any) {
    console.error("Error fetching team member analytics:", error);
    res.status(error.message === "Team member not found" ? 404 : 500).json({
      status: false,
      message: error.message || "Failed to fetch team member analytics",
    });
  }
};

export const getMetricDrilldown = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const { marketplaceId } = req.params;
    const marketplace = await resolveMarketplaceAccess(req, marketplaceId);
    if (!marketplace) {
      res.status(404).json({
        status: false,
        message: "Marketplace not found or access denied",
      });
      return;
    }

    const uid = accessUserId(req);
    const access = await ProviderAnalyticsService.checkAnalyticsAccess(uid);
    const isSuiteOwner =
      req.user?.role === "suite" && req.user?.isTeamMember !== true;

    if (!isSuiteOwner && !access.hasBasic && !access.hasAdvanced) {
      res.status(403).json({
        status: false,
        message: "Drill-down requires Pro or Premium booking analytics.",
        upgrade: { required: true, minPlan: "solo_pro" },
      });
      return;
    }

    let filters;
    try {
      filters = parseFilters(req);
    } catch (e: any) {
      res.status(400).json({ status: false, message: e.message });
      return;
    }

    const metric = (req.query.metric as string) || "bookings";
    const allowed = [
      "bookings",
      "completed",
      "cancelled",
      "no_shows",
      "clients",
      "revenue",
    ];
    if (!allowed.includes(metric)) {
      res.status(400).json({ status: false, message: "Invalid metric" });
      return;
    }

    const records = await ProviderAnalyticsService.getMetricDrilldown(
      marketplaceId,
      filters,
      metric as any
    );

    res.status(200).json({
      status: true,
      message: "Drill-down retrieved successfully",
      data: {
        metric,
        dateRange: filters.dateRange,
        records,
        empty: records.length === 0,
      },
    });
  } catch (error) {
    console.error("Error fetching drill-down:", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch drill-down",
    });
  }
};

export const updateMonthlyRevenueGoal = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    if (req.user?.role !== "suite" || req.user?.isTeamMember === true) {
      res.status(403).json({
        status: false,
        message: "Only suite owners can set a monthly revenue goal.",
      });
      return;
    }

    const { marketplaceId } = req.params;
    const goalRaw = req.body?.monthlyRevenueGoal;
    const goal =
      goalRaw === null || goalRaw === undefined || goalRaw === ""
        ? null
        : Number(goalRaw);

    if (goal != null && (!Number.isFinite(goal) || goal < 0)) {
      res.status(400).json({
        status: false,
        message: "monthlyRevenueGoal must be a non-negative number or null.",
      });
      return;
    }

    const saved = await ProviderAnalyticsService.updateMonthlyRevenueGoal(
      marketplaceId,
      req.userId,
      goal
    );

    res.status(200).json({
      status: true,
      message: "Monthly revenue goal updated",
      data: { monthlyRevenueGoal: saved },
    });
  } catch (error: any) {
    console.error("Error updating revenue goal:", error);
    res.status(error.message === "Marketplace not found" ? 404 : 500).json({
      status: false,
      message: error.message || "Failed to update revenue goal",
    });
  }
};

/** Services list for filter dropdown */
export const getAnalyticsFilterOptions = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const { marketplaceId } = req.params;
    const marketplace = await resolveMarketplaceAccess(req, marketplaceId);
    if (!marketplace) {
      res.status(404).json({
        status: false,
        message: "Marketplace not found or access denied",
      });
      return;
    }

    const services = await Service.findAll({
      where: { marketplaceId, isActive: true },
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
    });

    const isSuiteOwner =
      req.user?.role === "suite" && req.user?.isTeamMember !== true;

    let teamMembers: Array<{ id: string | null; name: string }> = [];
    if (isSuiteOwner) {
      const { User } = await import("../models/user_model");
      const members = await User.findAll({
        where: { teamOwnerId: req.userId, isTeamMember: true },
        attributes: ["id", "name"],
      });
      teamMembers = [
        { id: null, name: "Entire suite" },
        {
          id: "owner",
          name: marketplace.businessName || "Owner",
        },
        ...members.map((m) => ({ id: m.id as string, name: m.name || "Team member" })),
      ];
    }

    res.status(200).json({
      status: true,
      data: {
        services: services.map((s) => ({ id: s.id, name: s.name })),
        teamMembers,
        bookingStatuses: [
          { id: null, name: "All statuses" },
          { id: "completed", name: "Completed" },
          { id: "cancelled", name: "Cancelled" },
          { id: "no_show", name: "No-show" },
        ],
        periods: [
          { id: "today", name: "Today" },
          { id: "week", name: "This week" },
          { id: "month", name: "This month" },
          { id: "custom", name: "Custom range" },
        ],
      },
    });
  } catch (error) {
    console.error("Error fetching filter options:", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch filter options",
    });
  }
};

/**
 * Legacy overview — maps to month basic/advanced for Pro+.
 * Kept so older clients do not break.
 */
export const getAnalyticsOverview = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const { marketplaceId } = req.params;
    const marketplace = await resolveMarketplaceAccess(req, marketplaceId);
    if (!marketplace) {
      res.status(404).json({
        status: false,
        message: "Marketplace not found or access denied",
      });
      return;
    }

    const uid = accessUserId(req);
    const access = await ProviderAnalyticsService.checkAnalyticsAccess(uid);
    if (!access.hasBasic && !access.hasAdvanced) {
      res.status(403).json({
        status: false,
        message: "Analytics access requires Solo Pro or Premium subscription",
        upgrade: { required: true, minPlan: "solo_pro" },
      });
      return;
    }

    const dateRange = ProviderAnalyticsService.resolveDateRange({ period: "month" });
    const analytics = access.hasAdvanced
      ? await ProviderAnalyticsService.getAdvancedAnalytics(marketplaceId, dateRange)
      : await ProviderAnalyticsService.getBasicAnalytics(marketplaceId, dateRange);

    res.status(200).json({
      status: true,
      message: "Analytics overview retrieved successfully",
      data: {
        overview: analytics.overview,
        accessLevel: access.hasAdvanced ? "advanced" : "basic",
      },
    });
  } catch (error) {
    console.error("Error fetching analytics overview:", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch analytics overview",
    });
  }
};

/**
 * Legacy dashboard — redirects behavior into gated analytics.
 * Still used by older Flutter builds; returns earnings always + booking only if Pro+.
 */
export const getDashboardSummary = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const { marketplaceId } = req.params;
    const marketplace = await resolveMarketplaceAccess(req, marketplaceId);
    if (!marketplace) {
      res.status(404).json({
        status: false,
        message: "Marketplace not found or access denied",
      });
      return;
    }

    const uid = accessUserId(req);
    const access = await ProviderAnalyticsService.checkAnalyticsAccess(uid);

    // Map legacy weekly/monthly/yearly → PRD week/month (yearly → month for safety)
    const legacy = ((req.query.period as string) || "weekly").toLowerCase();
    const period =
      legacy === "monthly" || legacy === "month"
        ? "month"
        : legacy === "today"
          ? "today"
          : "week";

    const dateRange = ProviderAnalyticsService.resolveDateRange({ period });
    const earnings = await ProviderAnalyticsService.getEarningsSummary(marketplaceId);

    const periodEarnings =
      period === "today"
        ? earnings.today
        : period === "month"
          ? earnings.thisMonth
          : earnings.thisWeek;

    if (!access.hasBasic && !access.hasAdvanced) {
      res.status(200).json({
        status: true,
        message: "Dashboard summary retrieved successfully",
        data: {
          period,
          periodEarnings,
          earningsGrowth: 0,
          upcomingAppointments: 0,
          bookingGrowth: 0,
          topService: null,
          bookingStats: [],
          revenueByService: [],
          accessLevel: "earnings_only",
        },
      });
      return;
    }

    const basic = await ProviderAnalyticsService.getBasicAnalytics(
      marketplaceId,
      dateRange
    );
    const advanced = access.hasAdvanced
      ? await ProviderAnalyticsService.getAdvancedAnalytics(marketplaceId, dateRange)
      : null;

    const { Appointment } = await import("../models/appointment_model");
    const { Op } = await import("sequelize");
    const upcomingAppointments = await Appointment.count({
      where: {
        marketplaceId,
        status: "pending",
        dateTime: { [Op.gte]: new Date() },
      },
    });

    res.status(200).json({
      status: true,
      message: "Dashboard summary retrieved successfully",
      data: {
        period,
        periodEarnings,
        earningsGrowth: advanced?.trends.revenueGrowth ?? 0,
        upcomingAppointments,
        bookingGrowth: advanced?.trends.bookingGrowth ?? 0,
        topService: advanced?.topServices?.[0] || null,
        bookingStats: basic.revenueOverTime.map((r) => ({
          date: r.date,
          bookings: r.bookings,
        })),
        // Premium-only on legacy dashboard
        revenueByService: advanced?.revenueByService ?? [],
        accessLevel: access.hasAdvanced ? "advanced" : "basic",
        bookingsByStatus: basic.bookingsByStatus,
        overview: basic.overview,
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard summary:", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch dashboard summary",
    });
  }
};
