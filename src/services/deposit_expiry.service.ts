import { Op } from "sequelize";
import { Appointment } from "../models/appointment_model";
import { Marketplace } from "../models/marketplace_model";
import { User } from "../models/user_model";
import { NotificationService } from "./notification.service";
import { ChatService } from "./chat.service";
import { BookingConfirmationEmailService } from "./booking_confirmation_email.service";
import { WaitlistService } from "./waitlist.service";

/**
 * Expires provider/owner "Send Payment Link" holds after 2 hours unpaid.
 * Releases the calendar slot (status leaves ACTIVE_APPOINTMENT_STATUSES).
 */
export class DepositExpiryService {
  private static intervalHandle: ReturnType<typeof setInterval> | null = null;

  static startProcessor(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => {
      void this.processExpiredDeposits().catch((err) => {
        console.error("[DepositExpiry] processor error:", err);
      });
    }, 60 * 1000);
    console.log("Deposit expiry processor started (1 minute interval)");
  }

  static async processExpiredDeposits(): Promise<void> {
    const now = new Date();
    const expired = await Appointment.findAll({
      where: {
        status: "pending_deposit",
        paymentStatus: "pending",
        depositExpiresAt: { [Op.lt]: now },
      },
      include: [
        { model: User, as: "user", attributes: ["id", "name", "email", "phone"] },
        {
          model: Marketplace,
          as: "marketplace",
          attributes: ["id", "businessName", "userId"],
        },
      ],
      limit: 50,
    });

    for (const appointment of expired) {
      try {
        await appointment.update({
          status: "deposit_expired",
          paymentStatus: "failed",
        });

        // Slot is released because deposit_expired is not an active status.
        await WaitlistService.processSlotAvailability(
          appointment.marketplaceId,
          appointment.dateTime
        );

        BookingConfirmationEmailService.queueDepositExpiredEmail(appointment.id);

        const clientId = appointment.userId;
        const marketplace = (appointment as any).marketplace as
          | Marketplace
          | undefined;
        const providerId = marketplace?.userId;
        const businessName = marketplace?.businessName || "your provider";

        if (clientId) {
          void NotificationService.createNotification({
            userId: clientId,
            type: "booking_confirmation",
            title: "Booking reservation expired",
            content:
              "Your booking reservation has expired because the deposit wasn't received. Please rebook if you still want this slot!",
            data: {
              appointmentId: appointment.id,
              type: "deposit_expired",
            },
            channels: {
              push: true,
              sms: true,
              email: false,
              in_app: true,
            },
          }).catch((err) =>
            console.error("[DepositExpiry] notify failed:", err)
          );
        }

        if (clientId && providerId) {
          try {
            const conversation = await ChatService.getOrCreateConversation(
              clientId,
              providerId
            );
            await ChatService.sendMessage(
              conversation.id,
              providerId,
              `Your booking reservation with ${businessName} has expired because the deposit wasn't received. Please rebook if you still want this slot!`
            );
          } catch (err) {
            console.error("[DepositExpiry] chat notify failed:", err);
          }
        }

        console.log(
          `[DepositExpiry] Expired pending deposit appointment ${appointment.id}`
        );
      } catch (err) {
        console.error(
          `[DepositExpiry] Failed for appointment ${appointment.id}:`,
          err
        );
      }
    }
  }
}
