import { Op, QueryTypes } from "sequelize";
import sequelize from "../config/database";
import { Appointment } from "../models/appointment_model";
import { User } from "../models/user_model";
import { Service } from "../models/service_model";
import { AdminPaymentService } from "./admin_payment.service";

export type CalendarPeriod = "weekly" | "monthly" | "yearly";

interface MetricCount {
  count: number;
  changePercent: number;
}

interface MetricAmount {
  amount: number;
  changePercent: number;
}

interface DayCount {
  date: string;
  label: string;
  bookings: number;
}

interface RevenuePoint {
  date: string;
  label: string;
  revenue: number;
}

const TIME_SLOTS = [
  { key: "09-12", label: "9 AM – 12 PM", startHour: 9, endHour: 12 },
  { key: "12-15", label: "12 PM – 3 PM", startHour: 12, endHour: 15 },
  { key: "15-18", label: "3 PM – 6 PM", startHour: 15, endHour: 18 },
  { key: "18-21", label: "6 PM – 9 PM", startHour: 18, endHour: 21 },
  { key: "21-24", label: "9 PM – 12 AM", startHour: 21, endHour: 24 },
] as const;

export class AdminCalendarInsightsService {
  /**
   * Calendar Insights payload for the admin dashboard.
   * Supports startDate/endDate and period=weekly|monthly|yearly.
   */
  static async getCalendarInsights(options: {
    startDate?: string;
    endDate?: string;
    period?: CalendarPeriod;
    upcomingLimit?: number;
  }) {
    const period = options.period || "weekly";
    const range = this.resolveRange(options.startDate, options.endDate, period);
    const {
      startDate,
      endDate,
      previousStartDate,
      previousEndDate,
    } = range;

    const [
      currentSummary,
      previousSummary,
      bookingsOverview,
      previousBookingsOverview,
      topServices,
      bookingsByTimeSlot,
      revenueSeries,
      upcomingBookings,
    ] = await Promise.all([
      this.getSummaryCounts(startDate, endDate),
      this.getSummaryCounts(previousStartDate, previousEndDate),
      this.getDailyBookingCounts(startDate, endDate),
      this.getDailyBookingCounts(previousStartDate, previousEndDate),
      this.getTopServices(startDate, endDate),
      this.getBookingsByTimeSlot(startDate, endDate),
      this.getRevenueSeries(startDate, endDate, period),
      this.getUpcomingBookings(options.upcomingLimit || 10),
    ]);

    const pct = AdminPaymentService.calcPercentChange;

    return {
      range: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        previousStartDate: previousStartDate.toISOString(),
        previousEndDate: previousEndDate.toISOString(),
        period,
      },
      summary: {
        totalBookings: {
          count: currentSummary.total,
          changePercent: pct(currentSummary.total, previousSummary.total),
        } as MetricCount,
        completed: {
          count: currentSummary.completed,
          changePercent: pct(currentSummary.completed, previousSummary.completed),
        } as MetricCount,
        upcoming: {
          count: currentSummary.upcoming,
          changePercent: pct(currentSummary.upcoming, previousSummary.upcoming),
        } as MetricCount,
        cancelled: {
          count: currentSummary.cancelled,
          changePercent: pct(currentSummary.cancelled, previousSummary.cancelled),
        } as MetricCount,
        totalRevenue: {
          amount: currentSummary.revenue,
          changePercent: pct(currentSummary.revenue, previousSummary.revenue),
        } as MetricAmount,
      },
      bookingsOverview: {
        current: bookingsOverview,
        previous: previousBookingsOverview,
      },
      topServices,
      bookingsByTimeSlot,
      revenueOverview: {
        period,
        total: currentSummary.revenue,
        changePercent: pct(currentSummary.revenue, previousSummary.revenue),
        series: revenueSeries,
      },
      upcomingBookings,
    };
  }

  private static resolveRange(
    startDate?: string,
    endDate?: string,
    period: CalendarPeriod = "weekly"
  ) {
    if (startDate || endDate) {
      return AdminPaymentService.parseDateRange(startDate, endDate);
    }

    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);

    if (period === "yearly") {
      start.setMonth(0, 1);
    } else if (period === "monthly") {
      start.setDate(1);
    } else {
      // weekly: last 7 days including today
      start.setDate(start.getDate() - 6);
    }
    start.setHours(0, 0, 0, 0);

    return AdminPaymentService.parseDateRange(
      start.toISOString(),
      end.toISOString()
    );
  }

  private static paidAmountSql(alias = "a"): string {
    return `CASE
      WHEN ${alias}."paymentStatus" = 'partially_paid'
        THEN COALESCE(${alias}."depositAmount", ${alias}.price)
      WHEN ${alias}."paymentStatus" = 'paid'
        THEN ${alias}.price
      ELSE 0
    END`;
  }

  private static async getSummaryCounts(start: Date, end: Date) {
    const paidAmount = this.paidAmountSql("a");
    const now = new Date();

    const [row] = await sequelize.query<{
      total: string;
      completed: string;
      upcoming: string;
      cancelled: string;
      revenue: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE a.status = 'availed')::text AS completed,
         COUNT(*) FILTER (
           WHERE a.status = 'pending' AND a."dateTime" >= :now
         )::text AS upcoming,
         COUNT(*) FILTER (WHERE a.status = 'canceled')::text AS cancelled,
         COALESCE(SUM((${paidAmount})::numeric), 0)::text AS revenue
       FROM "Appointments" a
       WHERE a."deletedAt" IS NULL
         AND a."dateTime" BETWEEN :start AND :end`,
      {
        replacements: { start, end, now },
        type: QueryTypes.SELECT,
      }
    );

    return {
      total: parseInt(row?.total || "0", 10),
      completed: parseInt(row?.completed || "0", 10),
      upcoming: parseInt(row?.upcoming || "0", 10),
      cancelled: parseInt(row?.cancelled || "0", 10),
      revenue: AdminPaymentService.roundMoney(parseFloat(row?.revenue || "0")),
    };
  }

  private static async getDailyBookingCounts(
    start: Date,
    end: Date
  ): Promise<DayCount[]> {
    const rows = await sequelize.query<{ day: string; bookings: string }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('day', a."dateTime"), 'YYYY-MM-DD') AS day,
         COUNT(*)::text AS bookings
       FROM "Appointments" a
       WHERE a."deletedAt" IS NULL
         AND a."dateTime" BETWEEN :start AND :end
       GROUP BY DATE_TRUNC('day', a."dateTime")
       ORDER BY DATE_TRUNC('day', a."dateTime") ASC`,
      {
        replacements: { start, end },
        type: QueryTypes.SELECT,
      }
    );

    const byDay = new Map(rows.map((r) => [r.day, parseInt(r.bookings, 10)]));
    return this.eachDay(start, end).map((date) => ({
      date,
      label: this.formatDayLabel(date),
      bookings: byDay.get(date) || 0,
    }));
  }

  private static async getTopServices(start: Date, end: Date) {
    const rows = await sequelize.query<{
      serviceId: string;
      serviceName: string;
      bookings: string;
    }>(
      `SELECT
         s.id AS "serviceId",
         COALESCE(s.name, 'Unknown Service') AS "serviceName",
         COUNT(*)::text AS bookings
       FROM "Appointments" a
       INNER JOIN "Services" s ON s.id = a."serviceId"
       WHERE a."deletedAt" IS NULL
         AND a."dateTime" BETWEEN :start AND :end
       GROUP BY s.id, s.name
       ORDER BY COUNT(*) DESC
       LIMIT 5`,
      {
        replacements: { start, end },
        type: QueryTypes.SELECT,
      }
    );

    const total = rows.reduce((sum, r) => sum + parseInt(r.bookings, 10), 0);

    return rows.map((r) => {
      const bookings = parseInt(r.bookings, 10);
      return {
        serviceId: r.serviceId,
        serviceName: r.serviceName,
        bookings,
        percentage:
          total > 0
            ? AdminPaymentService.roundMoney((bookings / total) * 100)
            : 0,
      };
    });
  }

  private static async getBookingsByTimeSlot(start: Date, end: Date) {
    const rows = await sequelize.query<{ hour: string; bookings: string }>(
      `SELECT
         EXTRACT(HOUR FROM a."dateTime")::int::text AS hour,
         COUNT(*)::text AS bookings
       FROM "Appointments" a
       WHERE a."deletedAt" IS NULL
         AND a."dateTime" BETWEEN :start AND :end
       GROUP BY EXTRACT(HOUR FROM a."dateTime")
       ORDER BY EXTRACT(HOUR FROM a."dateTime") ASC`,
      {
        replacements: { start, end },
        type: QueryTypes.SELECT,
      }
    );

    const hourCounts = new Map(
      rows.map((r) => [parseInt(r.hour, 10), parseInt(r.bookings, 10)])
    );

    const slots = TIME_SLOTS.map((slot) => {
      let bookings = 0;
      for (let h = slot.startHour; h < slot.endHour; h++) {
        bookings += hourCounts.get(h) || 0;
      }
      return {
        key: slot.key,
        slot: slot.label,
        bookings,
        percentage: 0,
      };
    });

    const total = slots.reduce((sum, s) => sum + s.bookings, 0);
    return {
      totalBookings: total,
      slots: slots.map((s) => ({
        ...s,
        percentage:
          total > 0
            ? AdminPaymentService.roundMoney((s.bookings / total) * 100)
            : 0,
      })),
    };
  }

  private static async getRevenueSeries(
    start: Date,
    end: Date,
    period: CalendarPeriod
  ): Promise<RevenuePoint[]> {
    const paidAmount = this.paidAmountSql("a");
    // Whitelisted only: "month" | "day"
    const truncUnit = period === "yearly" ? "month" : "day";

    const rows = await sequelize.query<{ bucket: string; revenue: string }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('${truncUnit}', a."dateTime"), 'YYYY-MM-DD') AS bucket,
         COALESCE(SUM((${paidAmount})::numeric), 0)::text AS revenue
       FROM "Appointments" a
       WHERE a."deletedAt" IS NULL
         AND a."dateTime" BETWEEN :start AND :end
         AND a."paymentStatus" IN ('paid', 'partially_paid')
       GROUP BY DATE_TRUNC('${truncUnit}', a."dateTime")
       ORDER BY DATE_TRUNC('${truncUnit}', a."dateTime") ASC`,
      {
        replacements: { start, end },
        type: QueryTypes.SELECT,
      }
    );

    const byBucket = new Map(
      rows.map((r) => [
        r.bucket,
        AdminPaymentService.roundMoney(parseFloat(r.revenue)),
      ])
    );

    if (period === "yearly") {
      return this.eachMonth(start, end).map((date) => ({
        date,
        label: this.formatMonthLabel(date),
        revenue: byBucket.get(date) || 0,
      }));
    }

    return this.eachDay(start, end).map((date) => ({
      date,
      label: this.formatDayLabel(date),
      revenue: byBucket.get(date) || 0,
    }));
  }

  private static async getUpcomingBookings(limit: number) {
    const now = new Date();

    const appointments = await Appointment.findAll({
      where: {
        status: "pending",
        dateTime: { [Op.gte]: now },
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "name", "email", "profilePic"],
        },
        {
          model: Service,
          as: "services",
          through: { attributes: [] },
          attributes: ["id", "name", "price", "duration"],
        },
      ],
      order: [["dateTime", "ASC"]],
      limit,
    });

    return appointments.map((apt) => {
      const user = (apt as any).user;
      const services = ((apt as any).services || []) as Array<{
        id: string;
        name: string;
      }>;
      const primaryService =
        services.find((s) => s.id === apt.serviceId) || services[0];

      return {
        id: apt.id,
        clientName: user?.name || "Unknown",
        clientId: apt.userId,
        clientEmail: user?.email || null,
        clientProfilePic: user?.profilePic || null,
        serviceId: apt.serviceId,
        serviceName: primaryService?.name || "Unknown Service",
        dateTime: apt.dateTime,
        status: apt.status,
        displayStatus: apt.paymentStatus === "paid" ? "Confirmed" : "Pending",
        paymentStatus: apt.paymentStatus,
        price: Number(apt.price),
      };
    });
  }

  private static eachDay(start: Date, end: Date): string[] {
    const days: string[] = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const last = new Date(end);
    last.setHours(0, 0, 0, 0);

    while (cursor <= last) {
      days.push(this.toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  private static eachMonth(start: Date, end: Date): string[] {
    const months: string[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);

    while (cursor <= last) {
      months.push(this.toDateKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }

  private static toDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  private static formatDayLabel(dateKey: string): string {
    const date = new Date(`${dateKey}T00:00:00`);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  private static formatMonthLabel(dateKey: string): string {
    const date = new Date(`${dateKey}T00:00:00`);
    return date.toLocaleDateString("en-US", { month: "short" });
  }
}
