import { Op } from "sequelize";
import { Appointment } from "../models/appointment_model";
import { ExternalAppointment } from "../models/external_appointment_model";
import { Marketplace } from "../models/marketplace_model";
import { Waitlist } from "../models/waitlist_model";
import { NotificationService } from "./notification.service";

const ACTIVE_APPOINTMENT_STATUSES = ["pending", "postponed", "availed"];
const ACTIVE_EXTERNAL_APPOINTMENT_STATUSES = ["pending", "confirmed"];
const ACTIVE_WAITLIST_STATUSES = ["waiting", "notified", "claimed"];

interface WaitlistJoinPayload {
  clientUserId: string;
  marketplaceId: string;
  dateTime: Date;
  note?: string;
}

type ClaimFailureReason =
  | "not_found"
  | "not_owner"
  | "invalid_status"
  | "expired"
  | "missing_expiry";

interface ClaimWaitlistResult {
  entry: Waitlist | null;
  reason?: ClaimFailureReason;
}

export class WaitlistService {
  private static intervalHandle: ReturnType<typeof setInterval> | null = null;

  private static normalizeToMinute(value: Date): Date {
    const date = new Date(value);
    date.setSeconds(0, 0);
    return date;
  }

  private static getMinuteWindow(dateTime: Date): { start: Date; end: Date } {
    const start = this.normalizeToMinute(dateTime);
    const end = new Date(start);
    end.setSeconds(59, 999);
    return { start, end };
  }

  private static async getClaimWindowMinutes(marketplaceId: string): Promise<number> {
    const marketplace = await Marketplace.findByPk(marketplaceId, {
      attributes: ["waitlistClaimWindowMinutes"],
    });

    if (!marketplace || !marketplace.waitlistClaimWindowMinutes) {
      return 15;
    }

    return Math.min(30, Math.max(15, marketplace.waitlistClaimWindowMinutes));
  }

  static async isSlotOccupied(
    marketplaceId: string,
    dateTime: Date,
    options?: { excludeAppointmentId?: string }
  ): Promise<boolean> {
    const { start, end } = this.getMinuteWindow(dateTime);

    const [appointmentCount, externalCount] = await Promise.all([
      Appointment.count({
        where: {
          marketplaceId,
          ...(options?.excludeAppointmentId
            ? { id: { [Op.ne]: options.excludeAppointmentId } }
            : {}),
          status: { [Op.in]: ACTIVE_APPOINTMENT_STATUSES },
          dateTime: { [Op.between]: [start, end] },
        },
      }),
      ExternalAppointment.count({
        where: {
          marketplaceId,
          status: { [Op.in]: ACTIVE_EXTERNAL_APPOINTMENT_STATUSES },
          dateTime: { [Op.between]: [start, end] },
        },
      }),
    ]);

    return appointmentCount + externalCount > 0;
  }

  static async getMarketplaceSettings(marketplaceId: string): Promise<{ waitlistEnabled: boolean; claimWindowMinutes: number }> {
    const marketplace = await Marketplace.findByPk(marketplaceId, {
      attributes: ["waitlistEnabled", "waitlistClaimWindowMinutes"],
    });

    return {
      waitlistEnabled: Boolean(marketplace?.waitlistEnabled),
      claimWindowMinutes: marketplace?.waitlistClaimWindowMinutes ?? 15,
    };
  }

  static async joinWaitlist(payload: WaitlistJoinPayload): Promise<Waitlist> {
    const slotDateTime = this.normalizeToMinute(payload.dateTime);

    const existingActive = await Waitlist.findOne({
      where: {
        marketplaceId: payload.marketplaceId,
        clientUserId: payload.clientUserId,
        dateTime: {
          [Op.between]: [slotDateTime, new Date(slotDateTime.getTime() + 59999)],
        },
        status: { [Op.in]: ACTIVE_WAITLIST_STATUSES },
      },
    });

    if (existingActive) {
      return existingActive;
    }

    return Waitlist.create({
      marketplaceId: payload.marketplaceId,
      clientUserId: payload.clientUserId,
      dateTime: slotDateTime,
      note: payload.note ? payload.note.trim() : null,
      status: "waiting",
    });
  }

  static async canUserBookSlot(
    clientUserId: string,
    marketplaceId: string,
    dateTime: Date
  ): Promise<{ allowed: boolean; message?: string }> {
    const { start, end } = this.getMinuteWindow(dateTime);

    const activeClaim = await Waitlist.findOne({
      where: {
        marketplaceId,
        dateTime: { [Op.between]: [start, end] },
        status: { [Op.in]: ["notified", "claimed"] },
        claimExpiresAt: { [Op.gte]: new Date() },
      },
      order: [["createdAt", "ASC"]],
    });

    if (!activeClaim) {
      return { allowed: true };
    }

    if (activeClaim.clientUserId === clientUserId) {
      return { allowed: true };
    }

    return {
      allowed: false,
      message: "This time slot is currently reserved for a waitlisted client during claim window.",
    };
  }

  static async canPublicBookSlot(
    marketplaceId: string,
    dateTime: Date
  ): Promise<{ allowed: boolean; message?: string }> {
    const { start, end } = this.getMinuteWindow(dateTime);

    const activeClaim = await Waitlist.findOne({
      where: {
        marketplaceId,
        dateTime: { [Op.between]: [start, end] },
        status: { [Op.in]: ["notified", "claimed"] },
        claimExpiresAt: { [Op.gte]: new Date() },
      },
    });

    if (activeClaim) {
      return {
        allowed: false,
        message: "This slot is temporarily reserved for a waitlisted client.",
      };
    }

    return { allowed: true };
  }

  static async claimWaitlistSpot(clientUserId: string, waitlistId: string): Promise<ClaimWaitlistResult> {
    const entry = await Waitlist.findByPk(waitlistId);

    if (!entry) {
      return { entry: null, reason: "not_found" };
    }

    if (entry.clientUserId !== clientUserId) {
      return { entry: null, reason: "not_owner" };
    }

    if (entry.status !== "notified") {
      return { entry: null, reason: "invalid_status" };
    }

    if (!entry.claimExpiresAt) {
      return { entry: null, reason: "missing_expiry" };
    }

    if (entry.claimExpiresAt < new Date()) {
      return { entry: null, reason: "expired" };
    }

    entry.status = "claimed";
    entry.claimedAt = new Date();
    await entry.save();
    return { entry };
  }

  static async cancelWaitlistEntry(clientUserId: string, waitlistId: string): Promise<boolean> {
    const entry = await Waitlist.findOne({
      where: {
        id: waitlistId,
        clientUserId,
        status: { [Op.in]: ["waiting", "notified", "claimed"] },
      },
    });

    if (!entry) {
      return false;
    }

    entry.status = "cancelled";
    await entry.save();
    await this.processSlotAvailability(entry.marketplaceId, entry.dateTime);
    return true;
  }

  static async clearSlotWaitlist(
    marketplaceId: string,
    dateTime: Date,
    fulfilledAppointmentId?: string
  ): Promise<void> {
    const { start, end } = this.getMinuteWindow(dateTime);

    await Waitlist.update(
      {
        status: "filled",
        fulfilledAppointmentId: fulfilledAppointmentId ?? null,
        claimExpiresAt: null,
      },
      {
        where: {
          marketplaceId,
          dateTime: { [Op.between]: [start, end] },
          status: { [Op.in]: ACTIVE_WAITLIST_STATUSES },
        },
      }
    );
  }

  static async processSlotAvailability(marketplaceId: string, dateTime: Date): Promise<void> {
    const slotOccupied = await this.isSlotOccupied(marketplaceId, dateTime);
    if (slotOccupied) {
      return;
    }

    const { start, end } = this.getMinuteWindow(dateTime);
    const now = new Date();

    const activeReservation = await Waitlist.findOne({
      where: {
        marketplaceId,
        dateTime: { [Op.between]: [start, end] },
        status: { [Op.in]: ["notified", "claimed"] },
        claimExpiresAt: { [Op.gte]: now },
      },
      order: [["createdAt", "ASC"]],
    });

    if (activeReservation) {
      return;
    }

    const nextInLine = await Waitlist.findOne({
      where: {
        marketplaceId,
        dateTime: { [Op.between]: [start, end] },
        status: "waiting",
      },
      order: [["createdAt", "ASC"]],
    });

    if (!nextInLine) {
      return;
    }

    const claimWindowMinutes = await this.getClaimWindowMinutes(marketplaceId);
    const claimExpiresAt = new Date(now.getTime() + claimWindowMinutes * 60 * 1000);

    nextInLine.status = "notified";
    nextInLine.notifiedAt = now;
    nextInLine.claimExpiresAt = claimExpiresAt;
    await nextInLine.save();

    await NotificationService.createNotification({
      userId: nextInLine.clientUserId,
      type: "booking_reminder",
      title: "Waitlist Spot Opened",
      content: `A slot opened for ${start.toLocaleString()}. Claim within ${claimWindowMinutes} minutes.`,
      data: {
        waitlistId: nextInLine.id,
        marketplaceId,
        dateTime: start.toISOString(),
        claimExpiresAt: claimExpiresAt.toISOString(),
      },
      channels: {
        push: true,
        email: true,
        sms: false,
        in_app: true,
      },
    });
  }

  static async processExpiredClaims(): Promise<void> {
    const now = new Date();

    const expiredEntries = await Waitlist.findAll({
      where: {
        status: { [Op.in]: ["notified", "claimed"] },
        claimExpiresAt: { [Op.lt]: now },
      },
      attributes: ["id", "marketplaceId", "dateTime"],
    });

    if (expiredEntries.length === 0) {
      return;
    }

    const affectedSlots = new Map<string, { marketplaceId: string; dateTime: Date }>();

    for (const entry of expiredEntries) {
      const normalizedDate = this.normalizeToMinute(entry.dateTime);
      const key = `${entry.marketplaceId}_${normalizedDate.toISOString()}`;
      affectedSlots.set(key, {
        marketplaceId: entry.marketplaceId,
        dateTime: normalizedDate,
      });
    }

    await Waitlist.update(
      {
        status: "expired",
      },
      {
        where: {
          id: { [Op.in]: expiredEntries.map((entry) => entry.id) },
        },
      }
    );

    for (const slot of affectedSlots.values()) {
      await this.processSlotAvailability(slot.marketplaceId, slot.dateTime);
    }
  }

  static startProcessor(): void {
    if (this.intervalHandle) {
      return;
    }

    this.intervalHandle = setInterval(async () => {
      try {
        await this.processExpiredClaims();
      } catch (error) {
        console.error("Waitlist processor error:", error);
      }
    }, 60 * 1000);

    console.log("Waitlist processor started (1 minute interval)");
  }
}
