import { Marketplace } from "../models/marketplace_model";
import { Schedule } from "../models/schedule_model";

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

function parseTimeToMinutes(timeStr: string): number | null {
  const match = timeStr
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
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
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "object") {
    if (raw.isOpen === false) return "closed";
    if (raw.startTime && raw.endTime) {
      return `${raw.startTime} - ${raw.endTime}`;
    }
  }
  return String(raw).trim();
}

/**
 * Closed days and open hours from marketplace schedule.
 * Blocked times are handled separately (WaitlistService.isSlotBlocked).
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

    const match = dayStr.match(
      /^(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM))$/i
    );
    if (!match) {
      return {
        allowed: false,
        reason: "no_schedule",
        message:
          "This day is unavailable on the provider's schedule. Please choose another date.",
      };
    }

    const openMinutes = parseTimeToMinutes(match[1]);
    const closeMinutes = parseTimeToMinutes(match[2]);
    if (openMinutes == null || closeMinutes == null) {
      return {
        allowed: false,
        reason: "no_schedule",
        message:
          "This day is unavailable on the provider's schedule. Please choose another date.",
      };
    }

    const slotMinutes =
      appointmentDate.getHours() * 60 + appointmentDate.getMinutes();
    if (slotMinutes < openMinutes || slotMinutes >= closeMinutes) {
      return {
        allowed: false,
        reason: "outside_hours",
        message:
          "This time is outside the provider's open hours. Please choose another time.",
      };
    }

    return { allowed: true };
  }
}
