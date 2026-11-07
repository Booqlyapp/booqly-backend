import nodemailer from "nodemailer";
import { Appointment } from "../models/appointment_model";
import { ExternalAppointment } from "../models/external_appointment_model";
import { Marketplace } from "../models/marketplace_model";
import { User } from "../models/user_model";
import { Service } from "../models/service_model";

export type BookingEmailSource = "app" | "web";

export type BookingEmailPayload = {
  toEmail: string;
  clientFirstName: string;
  clientFullName: string;
  businessName: string;
  businessAddress: string | null;
  customLink: string | null;
  dateTime: Date;
  serviceNames: string[];
  addOnNames: string[];
  stylistName: string | null;
  totalPrice: number;
  depositPaid: number;
  amountDue: number;
  /** When true, subject/body reflect a status confirmation rather than a new booking. */
  isStatusUpdate?: boolean;
  /** When true, subject/body reflect a provider edit / reschedule of an existing booking. */
  isUpdate?: boolean;
  /** App appointment vs custom-link (web) booking — drives Reschedule/Cancel deep links. */
  source: BookingEmailSource;
  appointmentId: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(amount: number): string {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function formatDateTimeParts(dateTime: Date): {
  dateLong: string;
  time: string;
  subjectWhen: string;
} {
  const dateLong = dateTime.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const time = dateTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return {
    dateLong,
    time,
    subjectWhen: `${dateLong}, ${time}`,
  };
}

function toGoogleCalendarUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildGoogleCalendarUrl(payload: BookingEmailPayload): string {
  const start = payload.dateTime;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const title = `${payload.serviceNames.join(", ") || "Appointment"} with ${payload.businessName}`;
  const details = [
    payload.stylistName ? `Stylist: ${payload.stylistName}` : null,
    payload.addOnNames.length
      ? `Add-ons: ${payload.addOnNames.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toGoogleCalendarUtc(start)}/${toGoogleCalendarUtc(end)}`,
    details,
    location: payload.businessAddress || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function bookingHomeUrl(customLink: string | null): string {
  if (customLink && customLink.trim()) {
    return `https://${customLink.trim().toLowerCase()}.booqlyapp.com`;
  }
  return "https://booqlyapp.com";
}

/**
 * App bookings → universal / custom-scheme link that opens the exact appointment in-app.
 * Web custom-link bookings → subdomain appointment page for that exact booking.
 */
function buildManageUrl(
  payload: BookingEmailPayload,
  action: "reschedule" | "cancel"
): string {
  const id = encodeURIComponent(payload.appointmentId);
  const q = `action=${action}`;

  if (payload.source === "app") {
    return `https://api.booqlyapp.com/appointments/${id}?${q}`;
  }

  const home = bookingHomeUrl(payload.customLink);
  return `${home}/appointment/${id}?${q}`;
}

function detailRow(label: string, value: string, withBorder: boolean): string {
  const border = withBorder
    ? "border-bottom:1px solid #E5E7EB;"
    : "border-bottom:none;";
  return `<tr>
                  <td style="padding:12px 0;${border}color:#6B7280;font-size:14px;vertical-align:top;">${label}</td>
                  <td style="padding:12px 0;${border}text-align:right;font-weight:700;color:#111827;font-size:14px;vertical-align:top;">${value}</td>
                </tr>`;
}

function buildHtml(payload: BookingEmailPayload): string {
  const { dateLong, time } = formatDateTimeParts(payload.dateTime);
  const first = escapeHtml(payload.clientFirstName || "there");
  const business = escapeHtml(payload.businessName || "Business");
  const address = escapeHtml(payload.businessAddress || "");
  const services = escapeHtml(payload.serviceNames.join(", ") || "Service");
  const addOns = payload.addOnNames.length
    ? escapeHtml(payload.addOnNames.join(", "))
    : null;
  const stylist = payload.stylistName
    ? escapeHtml(payload.stylistName)
    : "No preference";
  const calendarUrl = buildGoogleCalendarUrl(payload);
  const rescheduleUrl = buildManageUrl(payload, "reschedule");
  const cancelUrl = buildManageUrl(payload, "cancel");
  const total = formatMoney(payload.totalPrice);
  const deposit = formatMoney(payload.depositPaid);
  const due = formatMoney(payload.amountDue);
  const headline = payload.isUpdate
    ? `Your appointment was updated, ${first}!`
    : `You're booked, ${first}!`;

  const detailRows: string[] = [];
  // Always put a separator under every detail row (including the last).
  detailRows.push(detailRow("Services", services, true));
  if (addOns) {
    detailRows.push(detailRow("Add-on", addOns, true));
  }
  detailRows.push(detailRow("Stylist", stylist, true));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Appointment confirmation</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F4F6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:28px 28px 8px 28px;text-align:center;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#111827;margin:0 0 10px 0;text-align:center;">${business}</div>
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.25;font-weight:700;color:#111827;margin:0 0 18px 0;text-align:center;">${headline}</div>
              <a href="${calendarUrl}" style="display:inline-block;padding:10px 16px;border:1.5px solid #759CC9;border-radius:10px;color:#3B629B;text-decoration:none;font-size:14px;font-weight:600;text-align:center;">
                📅 Add to Calendar
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 8px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#E8F1F9;border-radius:12px;">
                <tr>
                  <td align="center" style="padding:16px 16px;text-align:center;">
                    <div style="font-size:15px;font-weight:700;color:#3B629B;text-align:center;">${escapeHtml(dateLong)} • ${escapeHtml(time)}</div>
                    ${
                      address
                        ? `<div style="font-size:13px;color:#5B82C2;margin-top:6px;text-align:center;">${address}</div>`
                        : ""
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:10px 28px 8px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;border-collapse:collapse;">
                ${detailRows.join("\n")}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 28px 8px 28px;">
              <div style="background:#F3F4F6;border-radius:12px;padding:14px 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;border-collapse:collapse;">
                  <tr>
                    <td style="padding:8px 0;color:#6B7280;">Total Price</td>
                    <td style="padding:8px 0;text-align:right;font-weight:600;color:#111827;">${total}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #E5E7EB;color:#6B7280;">Deposit Paid</td>
                    <td style="padding:8px 0;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:600;color:#111827;">– ${deposit}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0 4px 0;font-weight:700;color:#111827;font-size:15px;">Amount Due at Appointment</td>
                    <td style="padding:12px 0 4px 0;text-align:right;font-weight:700;color:#111827;font-size:15px;">${due}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 8px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="48%" style="padding-right:6px;">
                    <a href="${rescheduleUrl}" style="display:block;text-align:center;background:#759CC9;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 10px;border-radius:10px;">Reschedule</a>
                  </td>
                  <td width="48%" style="padding-left:6px;">
                    <a href="${cancelUrl}" style="display:block;text-align:center;background:#ffffff;color:#DC2626;text-decoration:none;font-weight:700;font-size:14px;padding:11px 10px;border-radius:10px;border:1.5px solid #FECACA;">Cancel</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 28px 28px 28px;text-align:center;font-size:12px;color:#9CA3AF;">
              Powered by <strong style="color:#6B7280;">Booqly</strong>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildText(payload: BookingEmailPayload): string {
  const { dateLong, time } = formatDateTimeParts(payload.dateTime);
  const headline = payload.isUpdate
    ? `Your appointment was updated, ${payload.clientFirstName || "there"}!`
    : `You're booked, ${payload.clientFirstName || "there"}!`;
  return [
    headline,
    "",
    `${dateLong} • ${time}`,
    payload.businessAddress || "",
    "",
    `Services: ${payload.serviceNames.join(", ") || "Service"}`,
    payload.addOnNames.length
      ? `Add-on: ${payload.addOnNames.join(", ")}`
      : null,
    `Stylist: ${payload.stylistName || "No preference"}`,
    "",
    `Total Price: ${formatMoney(payload.totalPrice)}`,
    `Deposit Paid: ${formatMoney(payload.depositPaid)}`,
    `Amount Due at Appointment: ${formatMoney(payload.amountDue)}`,
    "",
    `Reschedule: ${buildManageUrl(payload, "reschedule")}`,
    `Cancel: ${buildManageUrl(payload, "cancel")}`,
    "",
    "Powered by Booqly",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function buildIcs(payload: BookingEmailPayload): string {
  const start = payload.dateTime;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const stamp = toGoogleCalendarUtc(new Date());
  const uid = `${start.getTime()}-${payload.toEmail.replace(/[^a-zA-Z0-9]/g, "")}@booqlyapp.com`;
  const summary = `${payload.serviceNames.join(", ") || "Appointment"} with ${payload.businessName}`;
  const description = [
    payload.stylistName ? `Stylist: ${payload.stylistName}` : null,
    payload.addOnNames.length
      ? `Add-ons: ${payload.addOnNames.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Booqly//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toGoogleCalendarUtc(start)}`,
    `DTEND:${toGoogleCalendarUtc(end)}`,
    `SUMMARY:${summary.replace(/\n/g, " ")}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${(payload.businessAddress || "").replace(/\n/g, " ")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export class BookingConfirmationEmailService {
  private static createTransporter() {
    return nodemailer.createTransport({
      host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
      port: parseInt(process.env.BREVO_SMTP_PORT || "587", 10),
      secure: false,
      auth: {
        user: process.env.BREVO_SMTP_LOGIN,
        pass: process.env.BREVO_SMTP_KEY,
      },
    });
  }

  static async send(payload: BookingEmailPayload): Promise<void> {
    if (!payload.toEmail || !payload.toEmail.trim()) {
      console.warn("[BookingEmail] Missing recipient email, skipping");
      return;
    }
    if (!process.env.BREVO_SMTP_LOGIN || !process.env.BREVO_SMTP_KEY) {
      console.warn("[BookingEmail] Brevo SMTP not configured, skipping");
      return;
    }

    const verifiedSender =
      process.env.BREVO_VERIFIED_SENDER || "info@booqlyapp.com";
    const { subjectWhen } = formatDateTimeParts(payload.dateTime);
    const servicesLabel = payload.serviceNames.join(", ") || "Appointment";
    const subjectPrefix = payload.isUpdate
      ? "Appointment updated"
      : payload.isStatusUpdate
        ? "Appointment confirmed"
        : "New appointment";
    const subject = `${subjectPrefix}: ${servicesLabel} (${payload.clientFullName}) - ${subjectWhen} with ${payload.businessName}`;

    const transporter = this.createTransporter();
    await transporter.sendMail({
      from: `"${payload.businessName} via Booqly" <${verifiedSender}>`,
      to: payload.toEmail.trim(),
      subject,
      html: buildHtml(payload),
      text: buildText(payload),
      attachments: [
        {
          filename: "appointment.ics",
          content: buildIcs(payload),
          contentType: "text/calendar; charset=utf-8; method=PUBLISH",
        },
      ],
    });
  }

  /** Fire-and-forget wrapper — never throws to callers. */
  static queueSend(payload: BookingEmailPayload): void {
    void this.send(payload).catch((err) => {
      console.error("[BookingEmail] Failed to send:", err);
    });
  }

  /**
   * App appointments (client self-book OR provider/owner/TM booking for a client).
   * Always emails the appointment's client (`Appointment.userId`).
   */
  static async sendForAppAppointment(
    appointmentId: string,
    options?: { isStatusUpdate?: boolean; isUpdate?: boolean }
  ): Promise<void> {
    const appointment = await Appointment.findByPk(appointmentId, {
      include: [
        { model: User, as: "user", attributes: ["id", "name", "email"] },
        {
          model: Marketplace,
          as: "marketplace",
          attributes: [
            "id",
            "businessName",
            "address",
            "customLink",
            "businessEmail",
            "userId",
          ],
          include: [
            {
              model: User,
              as: "provider",
              attributes: ["id", "name"],
              required: false,
            },
          ],
        },
        {
          model: Service,
          as: "services",
          through: { attributes: [] },
          attributes: ["id", "name"],
        },
        {
          model: User,
          as: "assignedTeamMember",
          attributes: ["id", "name"],
          required: false,
        },
      ],
    });

    if (!appointment) {
      console.warn(`[BookingEmail] App appointment not found: ${appointmentId}`);
      return;
    }

    const user = (appointment as any).user as User | undefined;
    const marketplace = (appointment as any).marketplace as
      | (Marketplace & { provider?: User })
      | undefined;
    const services = ((appointment as any).services || []) as Service[];
    const assignee = (appointment as any).assignedTeamMember as
      | User
      | undefined;
    const marketplaceOwner = marketplace?.provider as User | undefined;

    if (!user?.email) {
      console.warn(
        `[BookingEmail] App appointment ${appointmentId} has no client email`
      );
      return;
    }

    const fullName = (user.name || "").trim() || "Client";
    const firstName = fullName.split(/\s+/)[0] || "there";
    const total = Number(appointment.price || 0);
    const deposit = Number(appointment.depositAmount || 0);
    const remaining =
      appointment.remainingBalance != null
        ? Number(appointment.remainingBalance)
        : Math.max(total - deposit, 0);

    // No Preference → label; else assigned TM; else solo/suite owner name.
    const stylistName = appointment.clientNoPreference
      ? "No preference"
      : assignee?.name?.trim() ||
        marketplaceOwner?.name?.trim() ||
        null;

    await this.send({
      toEmail: user.email,
      clientFirstName: firstName,
      clientFullName: fullName,
      businessName: marketplace?.businessName || "Booqly",
      businessAddress: marketplace?.address || null,
      customLink: marketplace?.customLink || null,
      dateTime: new Date(appointment.dateTime),
      serviceNames: services.map((s) => s.name).filter(Boolean),
      addOnNames: [],
      stylistName,
      totalPrice: total,
      depositPaid: deposit,
      amountDue: remaining,
      isStatusUpdate: options?.isStatusUpdate === true,
      isUpdate: options?.isUpdate === true,
      source: "app",
      appointmentId: appointment.id,
    });
  }

  static async sendForExternalAppointment(
    appointmentId: string,
    options?: { isStatusUpdate?: boolean; isUpdate?: boolean }
  ): Promise<void> {
    const appointment = await ExternalAppointment.findByPk(appointmentId, {
      include: [
        {
          model: Marketplace,
          as: "marketplace",
          attributes: [
            "id",
            "businessName",
            "address",
            "customLink",
            "businessEmail",
          ],
        },
        {
          model: User,
          as: "assignedTeamMember",
          attributes: ["id", "name"],
          required: false,
        },
      ],
    });

    if (!appointment) {
      console.warn(
        `[BookingEmail] External appointment not found: ${appointmentId}`
      );
      return;
    }

    const marketplace = (appointment as any).marketplace as
      | Marketplace
      | undefined;
    const assignee = (appointment as any).assignedTeamMember as
      | User
      | undefined;
    const servicesData = Array.isArray(appointment.servicesData)
      ? appointment.servicesData
      : [];

    const serviceNames = servicesData
      .map((s: any) => String(s?.serviceName || "").trim())
      .filter(Boolean);
    const addOnNames = servicesData.flatMap((s: any) =>
      Array.isArray(s?.addOns)
        ? s.addOns
            .map((a: any) => String(a?.title || "").trim())
            .filter(Boolean)
        : []
    );

    const fullName =
      `${appointment.firstName || ""} ${appointment.lastName || ""}`.trim() ||
      "Client";
    const firstName =
      (appointment.firstName || "").trim() || fullName.split(/\s+/)[0] || "there";
    const total = Number(appointment.price || 0);
    const deposit = appointment.depositPaid
      ? Number(appointment.depositAmount || 0)
      : 0;
    const remaining =
      appointment.remainingBalance != null
        ? Number(appointment.remainingBalance)
        : Math.max(total - deposit, 0);

    const stylistName = appointment.clientNoPreference
      ? "No preference"
      : assignee?.name?.trim() || null;

    await this.send({
      toEmail: appointment.email,
      clientFirstName: firstName,
      clientFullName: fullName,
      businessName: marketplace?.businessName || "Booqly",
      businessAddress: marketplace?.address || null,
      customLink: marketplace?.customLink || null,
      dateTime: new Date(appointment.dateTime),
      serviceNames,
      addOnNames,
      stylistName,
      totalPrice: total,
      depositPaid: deposit,
      amountDue: remaining,
      isStatusUpdate: options?.isStatusUpdate === true,
      isUpdate: options?.isUpdate === true,
      source: "web",
      appointmentId: appointment.id,
    });
  }

  static queueSendForAppAppointment(
    appointmentId: string,
    options?: { isStatusUpdate?: boolean; isUpdate?: boolean }
  ): void {
    void this.sendForAppAppointment(appointmentId, options).catch((err) => {
      console.error(
        `[BookingEmail] App appointment ${appointmentId} failed:`,
        err
      );
    });
  }

  static queueSendForExternalAppointment(
    appointmentId: string,
    options?: { isStatusUpdate?: boolean; isUpdate?: boolean }
  ): void {
    void this.sendForExternalAppointment(appointmentId, options).catch(
      (err) => {
        console.error(
          `[BookingEmail] External appointment ${appointmentId} failed:`,
          err
        );
      }
    );
  }

  static buildDepositPayLink(appointmentId: string): string {
    return `https://api.booqlyapp.com/appointments/${encodeURIComponent(
      appointmentId
    )}?action=pay_deposit`;
  }

  static queueDepositReservationEmail(appointmentId: string): void {
    void this.sendDepositReservationEmail(appointmentId).catch((err) => {
      console.error(
        `[BookingEmail] Deposit reservation ${appointmentId} failed:`,
        err
      );
    });
  }

  static queueDepositExpiredEmail(appointmentId: string): void {
    void this.sendDepositExpiredEmail(appointmentId).catch((err) => {
      console.error(
        `[BookingEmail] Deposit expired ${appointmentId} failed:`,
        err
      );
    });
  }

  static async sendDepositReservationEmail(
    appointmentId: string
  ): Promise<void> {
    const appointment = await Appointment.findByPk(appointmentId, {
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
    });
    if (!appointment) return;
    const user = (appointment as any).user as User | undefined;
    const marketplace = (appointment as any).marketplace as
      | Marketplace
      | undefined;
    if (!user?.email) return;

    const payLink = this.buildDepositPayLink(appointment.id);
    const deposit = Number(appointment.depositAmount || 0);
    const total = Number(appointment.price || 0);
    const services = ((appointment as any).services || []) as Service[];
    const serviceNames = services.map((s) => s.name).filter(Boolean).join(", ");
    const { dateLong, time } = formatDateTimeParts(
      new Date(appointment.dateTime)
    );
    const first =
      (user.name || "").trim().split(/\s+/)[0] || "there";
    const business = marketplace?.businessName || "Booqly";

    const subject = `Deposit required to lock your appointment with ${business}`;
    const text = [
      `Your appointment is reserved, ${first}!`,
      "",
      `${dateLong} • ${time}`,
      marketplace?.address || "",
      `Services: ${serviceNames || "Service"}`,
      `Total: ${formatMoney(total)}`,
      `Deposit due now: ${formatMoney(deposit)} (pay within 2 hours)`,
      "",
      `Click here to pay your deposit to lock it in: ${payLink}`,
      "",
      "If the deposit isn't received within 2 hours, this reservation will expire and the slot will open again.",
      "",
      "Powered by Booqly",
    ].join("\n");

    const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;background:#F3F4F6;padding:24px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">
        <h1 style="font-size:20px;margin:0 0 12px;">Your appointment is reserved!</h1>
        <p style="margin:0 0 12px;color:#374151;">Hi ${escapeHtml(first)}, your appointment with <strong>${escapeHtml(business)}</strong> is held for <strong>2 hours</strong>. Pay your deposit to lock it in.</p>
        <p style="margin:0 0 8px;"><strong>${escapeHtml(dateLong)} • ${escapeHtml(time)}</strong></p>
        <p style="margin:0 0 8px;">Services: ${escapeHtml(serviceNames || "Service")}</p>
        <p style="margin:0 0 8px;">Deposit due: <strong>${formatMoney(deposit)}</strong></p>
        <p style="margin:16px 0;"><a href="${payLink}" style="display:inline-block;background:#759CC9;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">Pay deposit</a></p>
        <p style="margin:0;color:#6B7280;font-size:13px;">Make sure to open this link while signed in as the client who was booked.</p>
      </div></body></html>`;

    await this.sendRaw({
      toEmail: user.email,
      businessName: business,
      subject,
      text,
      html,
    });
  }

  static async sendDepositExpiredEmail(appointmentId: string): Promise<void> {
    const appointment = await Appointment.findByPk(appointmentId, {
      include: [
        { model: User, as: "user", attributes: ["id", "name", "email"] },
        {
          model: Marketplace,
          as: "marketplace",
          attributes: ["id", "businessName"],
        },
      ],
    });
    if (!appointment) return;
    const user = (appointment as any).user as User | undefined;
    const marketplace = (appointment as any).marketplace as
      | Marketplace
      | undefined;
    if (!user?.email) return;

    const first =
      (user.name || "").trim().split(/\s+/)[0] || "there";
    const business = marketplace?.businessName || "your provider";
    const subject = `Booking reservation expired with ${business}`;
    const text = [
      `Hi ${first},`,
      "",
      "Your booking reservation has expired because the deposit wasn't received. Please rebook if you still want this slot!",
      "",
      "Powered by Booqly",
    ].join("\n");
    const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;padding:24px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">
        <h1 style="font-size:20px;margin:0 0 12px;">Reservation expired</h1>
        <p>Hi ${escapeHtml(first)}, your booking reservation has expired because the deposit wasn't received. Please rebook if you still want this slot!</p>
      </div></body></html>`;

    await this.sendRaw({
      toEmail: user.email,
      businessName: business,
      subject,
      text,
      html,
    });
  }

  private static async sendRaw(params: {
    toEmail: string;
    businessName: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void> {
    if (!params.toEmail?.trim()) return;
    if (!process.env.BREVO_SMTP_LOGIN || !process.env.BREVO_SMTP_KEY) {
      console.warn("[BookingEmail] Brevo SMTP not configured, skipping");
      return;
    }
    const verifiedSender =
      process.env.BREVO_VERIFIED_SENDER || "info@booqlyapp.com";
    const transporter = this.createTransporter();
    await transporter.sendMail({
      from: `"${params.businessName} via Booqly" <${verifiedSender}>`,
      to: params.toEmail.trim(),
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
  }
}
