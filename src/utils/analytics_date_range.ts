/**
 * PRD shared date filters: Today, this week, this month, or custom range.
 */

export type AnalyticsPeriodPreset = "today" | "week" | "month" | "custom";

export interface AnalyticsDateRange {
  startDate: Date;
  endDate: Date;
  preset: AnalyticsPeriodPreset;
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

/** Sunday-start week to match existing dashboard weekly logic. */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Resolve PRD date filter from query params.
 * - period=today|week|month
 * - or startDate + endDate for custom
 */
export function resolveAnalyticsDateRange(query: {
  period?: string;
  startDate?: string;
  endDate?: string;
  now?: Date;
}): AnalyticsDateRange {
  const now = query.now ? new Date(query.now) : new Date();

  if (query.startDate && query.endDate) {
    const startDate = startOfDay(new Date(query.startDate));
    const endDate = endOfDay(new Date(query.endDate));
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new Error("Invalid custom date range");
    }
    if (startDate.getTime() > endDate.getTime()) {
      throw new Error("startDate must be on or before endDate");
    }
    return { startDate, endDate, preset: "custom" };
  }

  const period = (query.period || "week").toLowerCase();

  if (period === "today") {
    return {
      startDate: startOfDay(now),
      endDate: endOfDay(now),
      preset: "today",
    };
  }

  if (period === "month") {
    return {
      startDate: startOfMonth(now),
      endDate: endOfDay(now),
      preset: "month",
    };
  }

  // week (default) and legacy "weekly"
  return {
    startDate: startOfWeek(now),
    endDate: endOfDay(now),
    preset: "week",
  };
}

export function previousPeriodRange(range: AnalyticsDateRange): AnalyticsDateRange {
  const duration = range.endDate.getTime() - range.startDate.getTime();
  const endDate = new Date(range.startDate.getTime() - 1);
  const startDate = new Date(endDate.getTime() - duration);
  return { startDate, endDate, preset: range.preset };
}
