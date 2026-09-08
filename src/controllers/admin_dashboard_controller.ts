import { Request, Response } from "express";
import { AdminDashboardService } from "../services/admin_dashboard.service";
import {
  AdminCalendarInsightsService,
  CalendarPeriod,
} from "../services/admin_calendar_insights.service";

interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

/**
 * GET /admin/dashboard/stats
 * Returns totalUsers, totalBookings, totalRevenue, totalActiveProviders.
 */
export const getDashboardStats = async (
  _req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const data = await AdminDashboardService.getDashboardStats();

    res.status(200).json({
      status: true,
      message: "Dashboard stats retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error fetching admin dashboard stats:", error);
    res.status(500).json({
      status: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch dashboard stats",
    });
  }
};

/**
 * GET /admin/dashboard/calendar-insights
 * Calendar Insights: summary KPIs, bookings overview, top services,
 * time-slot %, revenue series (weekly/monthly/yearly), upcoming list.
 *
 * Query: startDate?, endDate?, period?=weekly|monthly|yearly, upcomingLimit?
 */
export const getCalendarInsights = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { startDate, endDate, period, upcomingLimit } = req.query;

    const allowedPeriods: CalendarPeriod[] = ["weekly", "monthly", "yearly"];
    const resolvedPeriod =
      typeof period === "string" &&
      allowedPeriods.includes(period as CalendarPeriod)
        ? (period as CalendarPeriod)
        : "weekly";

    const data = await AdminCalendarInsightsService.getCalendarInsights({
      startDate: typeof startDate === "string" ? startDate : undefined,
      endDate: typeof endDate === "string" ? endDate : undefined,
      period: resolvedPeriod,
      upcomingLimit:
        typeof upcomingLimit === "string"
          ? Math.min(Math.max(parseInt(upcomingLimit, 10) || 10, 1), 50)
          : 10,
    });

    res.status(200).json({
      status: true,
      message: "Calendar insights retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error fetching calendar insights:", error);
    res.status(500).json({
      status: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch calendar insights",
    });
  }
};
