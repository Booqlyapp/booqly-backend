import { Marketplace } from "../models/marketplace_model";
import { Schedule } from "../models/schedule_model";
import { BookingWindowService } from "./booking_window.service";

export type ScheduleDenyReason = "closed" | "outside_hours" | "no_schedule";

export type ScheduleAvailabilityResult = {
  allowed: boolean;
  reason?: ScheduleDenyReason;
  message?: string;
};

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/** Normalize schedule strings from various clients/locales. */
function normalizeScheduleText(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/\u202f/g, " ")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTimeToMinutes(timeStr: string): number | null {
  const normalized = normalizeScheduleText(timeStr);
  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function dayScheduleString(schedule: Schedule, date: Date): string {
  const key = DAY_KEYS[date.getDay()];
  const raw = (schedule as any)[key];
  if (raw == null) return "";
  if (typeof raw === "string") return normalizeScheduleText(raw);
  if (typeof raw === "object") {
    if (raw.isOpen === false) return "closed";
    if (raw.startTime && raw.endTime) {
      return normalizeScheduleText(`${raw.startTime} - ${raw.endTime}`);
    }
  }
  return normalizeScheduleText(String(raw));
}

function parseOpenCloseMinutes(
  dayStr: string
): { openMinutes: number; closeMinutes: number } | null {
  const normalized = normalizeScheduleText(dayStr);
  const match = normalized.match(
    /^(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM))$/i
  );
  if (!match) return null;
  const openMinutes = parseTimeToMinutes(match[1]);
  const closeMinutes = parseTimeToMinutes(match[2]);
  if (openMinutes == null || closeMinutes == null) return null;
  return { openMinutes, closeMinutes };
}

/**
 * Closed days and open hours from marketplace schedule.
 * Blocked times are handled separately (WaitlistService.isSlotBlocked).
 *
 * Uses the Date's local calendar day + clock (wall-clock). Callers must pass
 * a Date built from the client's selected local date/time (not a shifted UTC
 * instant of a different wall-clock).
 */
export class ScheduleAvailabilityService {
  static async assertOpenAt(
    marketplaceId: string,
    appointmentDate: Date
  ): Promise<ScheduleAvailabilityResult> {
    const marketplace = await Marketplace.findByPk(marketplaceId, {
      include: [{ model: Schedule, as: "schedule", required: false }],
    });

    const schedule = (marketplace as any)?.schedule as Schedule | undefined;
    if (!schedule) {
      // No schedule configured — do not block (legacy marketplaces).
      return { allowed: true };
    }

    const dayStr = dayScheduleString(schedule, appointmentDate);
    if (!dayStr || dayStr.toLowerCase() === "closed") {
      return {
        allowed: false,
        reason: "closed",
        message:
          "This day is closed on the provider's schedule. Please choose another date.",
      };
    }

    const hours = parseOpenCloseMinutes(dayStr);
    if (!hours) {
      return {
        allowed: false,
        reason: "no_schedule",
        message:
          "This day is unavailable on the provider's schedule. Please choose another date.",
      };
    }

    const slotMinutes =
      appointmentDate.getHours() * 60 + appointmentDate.getMinutes();
    if (
      slotMinutes < hours.openMinutes ||
      slotMinutes >= hours.closeMinutes
    ) {
      return {
        allowed: false,
        reason: "outside_hours",
        message:
          "This time is outside the provider's open hours. Please choose another time.",
      };
    }

    return { allowed: true };
  }

  /**
   * Calendar days (YYYY-MM-DD) for Select Date — same rules as booking Continuity:
   * booking window + weekly schedule closed days only.
   * Block Time closes specific clock times (assertOpenAt / isSlotBlocked on Continue),
   * not entire calendar days — a 12:30–1:30 block must still leave that day selectable.
   */
  static async listBookableDates(
    marketplaceId: string,
    fromDateOnly: string,
    toDateOnly: string
  ): Promise<string[]> {
    const from = parseDateOnlyParts(fromDateOnly);
    const to = parseDateOnlyParts(toDateOnly);
    if (!from || !to) return [];

    const marketplace = await Marketplace.findByPk(marketplaceId, {
      include: [{ model: Schedule, as: "schedule", required: false }],
    });
    if (!marketplace) return [];

    const schedule = (marketplace as any)?.schedule as Schedule | undefined;
    const windowSettings = await BookingWindowService.getMarketplaceSettings(
      marketplaceId
    );

    const dates: string[] = [];
    let cursor = new Date(from.y, from.m - 1, from.d);
    const last = new Date(to.y, to.m - 1, to.d);
    const maxDays = 366;
    let scanned = 0;

    while (cursor.getTime() <= last.getTime() && scanned < maxDays) {
      scanned += 1;

      const windowCheck = BookingWindowService.assertWithinWindow(
        windowSettings,
        cursor
      );
      if (!windowCheck.allowed) {
        cursor = addCalendarDays(cursor, 1);
        continue;
      }

      // Same closed-day rule as assertOpenAt (wall-clock local day).
      if (schedule) {
        const dayStr = dayScheduleString(schedule, cursor);
        if (!dayStr || dayStr.toLowerCase() === "closed") {
          cursor = addCalendarDays(cursor, 1);
          continue;
        }
      }

      dates.push(formatDateOnly(cursor));
      cursor = addCalendarDays(cursor, 1);
    }

    return dates;
  }
}

function parseDateOnlyParts(
  value: string
): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addCalendarDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
