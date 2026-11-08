import { Op } from "sequelize";
import { Appointment } from "../models/appointment_model";
import { ExternalAppointment } from "../models/external_appointment_model";
import { Marketplace } from "../models/marketplace_model";
import { User } from "../models/user_model";
import { Service } from "../models/service_model";
import { NotificationService } from "./notification.service";
import { BookingConfirmationEmailService } from "./booking_confirmation_email.service";

type ReminderKind = "24h" | "1h";

/**
 * Sends client-only 24h and 1h appointment reminders (email + push/in-app)
 * for confirmed app bookings and confirmed web (external) bookings.
 */
export class AppointmentReminderService {
  private static intervalHandle: ReturnType<typeof setInterval> | null = null;

  static startProcessor(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => {
      void this.processDueReminders().catch((err) => {
        console.error("[AppointmentReminder] processor error:", err);
      });
    }, 60 * 1000);
    console.log("Appointment reminder processor started (1 minute interval)");
  }

  static async processDueReminders(): Promise<void> {
    const now = new Date();
    await this.processAppReminders(now);
    await this.processExternalReminders(now);
  }

  private static async processAppReminders(now: Date): Promise<void> {
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);

    // 24h window: appointment is more than 1h away, but within the next 24h.
    const due24h = await Appointment.findAll({
      where: {
        status: { [Op.in]: ["confirmed", "availed"] },
        reminder24hSentAt: null,
        dateTime: {
          [Op.gt]: in1h,
          [Op.lte]: in24h,
        },
      },
      include: [
        { model: User, as: "user", attributes: ["id", "name", "email"] },
        {
          model: Marketplace,
          as: "marketplace",
          attributes: ["id", "businessName", "address"],
        },
        {
          model: Service,
          as: "services",
          through: { attributes: [] },
          attributes: ["id", "name"],
        },
      ],
      limit: 50,
    });

    for (const appointment of due24h) {
      await this.sendAppReminder(appointment, "24h");
    }

    // 1h window: appointment starts within the next hour (and is still upcoming).
    const due1h = await Appointment.findAll({
      where: {
        status: { [Op.in]: ["confirmed", "availed"] },
        reminder1hSentAt: null,
        dateTime: {
          [Op.gt]: now,
          [Op.lte]: in1h,
        },
      },
      include: [
        { model: User, as: "user", attributes: ["id", "name", "email"] },
        {
          model: Marketplace,
          as: "marketplace",
          attributes: ["id", "businessName", "address"],
        },
        {
          model: Service,
          as: "services",
          through: { attributes: [] },
          attributes: ["id", "name"],
        },
      ],
      limit: 50,
    });

    for (const appointment of due1h) {
      await this.sendAppReminder(appointment, "1h");
    }
  }

  private static async processExternalReminders(now: Date): Promise<void> {
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);

    const due24h = await ExternalAppointment.findAll({
      where: {
        status: "confirmed",
        reminder24hSentAt: null,
        dateTime: {
          [Op.gt]: in1h,
          [Op.lte]: in24h,
        },
      },
      include: [
        {
          model: Marketplace,
          as: "marketplace",
          attributes: ["id", "businessName", "address"],
        },
      ],
      limit: 50,
    });

    for (const appointment of due24h) {
      await this.sendExternalReminder(appointment, "24h");
    }

    const due1h = await ExternalAppointment.findAll({
      where: {
        status: "confirmed",
        reminder1hSentAt: null,
        dateTime: {
          [Op.gt]: now,
          [Op.lte]: in1h,
        },
      },
      include: [
        {
          model: Marketplace,
          as: "marketplace",
          attributes: ["id", "businessName", "address"],
        },
      ],
      limit: 50,
    });

    for (const appointment of due1h) {
      await this.sendExternalReminder(appointment, "1h");
    }
  }

  private static async sendAppReminder(
    appointment: Appointment,
    kind: ReminderKind
  ): Promise<void> {
    try {
      const client = (appointment as any).user as User | undefined;
      if (!client?.id) return;

      const marketplace = (appointment as any).marketplace as
        | Marketplace
        | undefined;
      const services = ((appointment as any).services || []) as Service[];
      const serviceNames = services
        .map((s) => s.name)
        .filter(Boolean)
        .join(", ");
      const businessName = marketplace?.businessName || "your provider";
      const label = kind === "24h" ? "24 hours" : "1 hour";
      const title =
        kind === "24h"
          ? "Appointment reminder — 24 hours"
          : "Appointment reminder — 1 hour";
      const content = `Reminder: your appointment with ${businessName}${
        serviceNames ? ` (${serviceNames})` : ""
      } is in ${label}.`;

      // Mark sent first to avoid duplicate sends if push/email is slow.
      await appointment.update(
        kind === "24h"
          ? { reminder24hSentAt: new Date() }
          : { reminder1hSentAt: new Date() }
      );

      BookingConfirmationEmailService.queueClientReminderEmail({
        toEmail: client.email || "",
        clientName: client.name || "there",
        businessName,
        businessAddress: marketplace?.address || null,
        dateTime: new Date(appointment.dateTime),
        serviceNames: serviceNames || "Appointment",
        reminderKind: kind,
        appointmentId: appointment.id,
        source: "app",
      });

      void NotificationService.createNotification({
        userId: client.id,
        type: "booking_reminder",
        title,
        content,
        data: {
          appointmentId: appointment.id,
          reminderKind: kind,
          type: "appointment_reminder",
          source: "app",
        },
        channels: {
          push: true,
          email: false, // Brevo email sent above (same as deposit emails)
          sms: false,
          in_app: true,
        },
      }).catch((err) =>
        console.error(
          `[AppointmentReminder] app notify failed ${appointment.id}:`,
          err
        )
      );

      console.log(
        `[AppointmentReminder] Sent ${kind} reminder for app appointment ${appointment.id}`
      );
    } catch (err) {
      console.error(
        `[AppointmentReminder] Failed app ${kind} for ${appointment.id}:`,
        err
      );
    }
  }

  private static async sendExternalReminder(
    appointment: ExternalAppointment,
    kind: ReminderKind
  ): Promise<void> {
    try {
      const email = (appointment.email || "").trim();
      if (!email) return;

      const marketplace = (appointment as any).marketplace as
        | Marketplace
        | undefined;
      const businessName = marketplace?.businessName || "your provider";
      const servicesData = (appointment.servicesData || []) as Array<{
        serviceName?: string;
      }>;
      const serviceNames = servicesData
        .map((s) => s.serviceName)
        .filter(Boolean)
        .join(", ");
      const clientName =
        [appointment.firstName, appointment.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || "there";
      const label = kind === "24h" ? "24 hours" : "1 hour";
      const title =
        kind === "24h"
          ? "Appointment reminder — 24 hours"
          : "Appointment reminder — 1 hour";
      const content = `Reminder: your appointment with ${businessName}${
        serviceNames ? ` (${serviceNames})` : ""
      } is in ${label}.`;

      await appointment.update(
        kind === "24h"
          ? { reminder24hSentAt: new Date() }
          : { reminder1hSentAt: new Date() }
      );

      BookingConfirmationEmailService.queueClientReminderEmail({
        toEmail: email,
        clientName,
        businessName,
        businessAddress: marketplace?.address || null,
        dateTime: new Date(appointment.dateTime),
        serviceNames: serviceNames || "Appointment",
        reminderKind: kind,
        appointmentId: appointment.id,
        source: "web",
      });

      // Push/in-app only when this web client also has a Booqly user account.
      const matchedUser = await User.findOne({
        where: { email, role: "client" },
        attributes: ["id"],
      });
      if (matchedUser?.id) {
        void NotificationService.createNotification({
          userId: matchedUser.id,
          type: "booking_reminder",
          title,
          content,
          data: {
            appointmentId: appointment.id,
            reminderKind: kind,
            type: "appointment_reminder",
            source: "web",
          },
          channels: {
            push: true,
            email: false,
            sms: false,
            in_app: true,
          },
        }).catch((err) =>
          console.error(
            `[AppointmentReminder] web notify failed ${appointment.id}:`,
            err
          )
        );
      }

      console.log(
        `[AppointmentReminder] Sent ${kind} reminder for web appointment ${appointment.id}`
      );
    } catch (err) {
      console.error(
        `[AppointmentReminder] Failed web ${kind} for ${appointment.id}:`,
        err
      );
    }
  }
}
