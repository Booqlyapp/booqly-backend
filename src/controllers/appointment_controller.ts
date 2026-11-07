import { Response } from "express";
import { InferCreationAttributes, Op } from "sequelize";
import { Appointment } from "../models/appointment_model";
import { AppointmentServiceStatus } from "../models/appointment_service_status_model";
import { User } from "../models/user_model";
import { Marketplace } from "../models/marketplace_model";
import { Service } from "../models/service_model";
import { Social } from "../models/social_model";
import { SubscriptionService } from "../services/subscription.service";
import { WaitlistService } from "../services/waitlist.service";
import { BookingWindowService } from "../services/booking_window.service";
import { ScheduleAvailabilityService } from "../services/schedule_availability.service";
import { StripeService } from "../services/stripe.service";
import {
  getBookingScope,
  getTeamMemberPermissionsForUser,
} from "../utils/team_member_permission_helper";
import { parseBookingDateTime } from "../utils/booking_datetime";
import { remainingBalanceAfterPriceEdit } from "../utils/appointment_balance";
import { BookingConfirmationEmailService } from "../services/booking_confirmation_email.service";
import { NotificationService } from "../services/notification.service";
import { ChatService } from "../services/chat.service";

interface CreateAppointmentData {
  marketplaceId: string;
  dateTime: string; // ISO string
  paymentStatus?: "pending" | "paid" | "failed" | "refunded" | "partially_paid";
  price: number;
  depositAmount?: number;
  remainingBalance?: number;
  assignedTeamMemberId?: string;
  paymentMethod?: "apple_pay" | "stripe_card" | "paypal" | "cash" | "other";
  services: Array<{
    serviceId: string;
    price: number;
    quantity?: number;
  }>;
}

interface GetAppointmentsQuery {
  marketplaceId: string;
  date?: string; // ISO date string for single day (e.g., "2023-10-15")
  startDate?: string; // ISO date string for range start
  endDate?: string; // ISO date string for range end
  page?: string;
  limit?: string;
  sort?: string; // "asc" | "desc" by dateTime
}

export const createAppointment = async (
  req: any,
  res: Response
): Promise<Response> => {
  const transaction = await Appointment.sequelize?.transaction(); // Start transaction
  try {
    // Get userId from authenticated user (SECURE)
    const userId = req.user.id;
    
    // Destructure essential data from req.body
    const {
      marketplaceId,
      dateTime,
      paymentStatus,
      price,
      services,
      depositAmount,
      remainingBalance,
      assignedTeamMemberId,
      paymentMethod,
    } = req.body as CreateAppointmentData;

    const allowedPaymentMethods = [
      "apple_pay",
      "stripe_card",
      "paypal",
      "cash",
      "other",
    ] as const;
    const resolvedPaymentMethod =
      paymentMethod &&
      allowedPaymentMethods.includes(
        paymentMethod as (typeof allowedPaymentMethods)[number]
      )
        ? paymentMethod
        : null;

    // Step 1: Validate essential fields
    if (
      !marketplaceId ||
      !dateTime ||
      !price ||
      !services ||
      !Array.isArray(services) ||
      services.length === 0
    ) {
      await transaction?.rollback();
      return res.status(400).json({
        status: false,
        message:
          "Missing or invalid required fields: marketplaceId, dateTime, price (positive number), and services array (with at least one service).",
      });
    }

    // Parse and validate price
    if (price <= 0) {
      await transaction?.rollback();
      return res.status(200).json({
        status: false,
        message: "price must be a valid positive number (provided as string).",
      });
    }

    // Validate dateTime is in the future (wall-clock digits, not TZ-shifted)
    const appointmentDate = parseBookingDateTime(dateTime);
    if (isNaN(appointmentDate.getTime()) || appointmentDate <= new Date()) {
      await transaction?.rollback();
      return res.status(200).json({
        status: false,
        message:
          "The provided dateTime must be a valid ISO date set in the future (from today onwards).",
      });
    }

    const bookingWindowCheck =
      await BookingWindowService.assertMarketplaceAllowsDate(
        marketplaceId,
        appointmentDate
      );
    if (!bookingWindowCheck.allowed) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        message:
          bookingWindowCheck.message ||
          "This date is outside the provider's booking window.",
      });
    }

    const scheduleCheck = await ScheduleAvailabilityService.assertOpenAt(
      marketplaceId,
      appointmentDate
    );
    if (!scheduleCheck.allowed) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        reason: scheduleCheck.reason,
        message:
          scheduleCheck.message ||
          "This date or time is unavailable on the provider's schedule.",
      });
    }

    if (await WaitlistService.isSlotBlocked(marketplaceId, appointmentDate)) {
      await transaction?.rollback();
      return res.status(409).json({
        status: false,
        reason: "blocked",
        message:
          "This time is blocked by the provider and is unavailable for booking. Please choose another time.",
      });
    }

    // When the primary service has assigned team members, occupancy is checked
    // per member after assignee resolution (supports No Preference / multi-member).
    const primaryServiceIdEarly = services[0]?.serviceId;
    const primaryServiceEarly = primaryServiceIdEarly
      ? await Service.findByPk(primaryServiceIdEarly, {
          attributes: ["id", "providerTeamMemberIds"],
          transaction,
        })
      : null;
    const hasServiceProvidersEarly =
      (primaryServiceEarly?.providerTeamMemberIds || []).length > 0;

    if (!hasServiceProvidersEarly) {
      const isSlotOccupied = await WaitlistService.isSlotOccupied(
        marketplaceId,
        appointmentDate,
        { ignoreBlockedTimes: true }
      );
      if (isSlotOccupied) {
        const waitlistSettings =
          await WaitlistService.getMarketplaceSettings(marketplaceId);
        await transaction?.rollback();
        return res.status(409).json({
          status: false,
          reason: "occupied",
          message:
            "This slot is fully booked. Join the waitlist to be notified if it opens.",
          data: {
            waitlistEnabled: waitlistSettings.waitlistEnabled,
          },
        });
      }
    }

    const claimCheck = await WaitlistService.canUserBookSlot(userId, marketplaceId, appointmentDate);
    if (!claimCheck.allowed) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        message: claimCheck.message,
      });
    }

    // Validate each service (note: per-service price/quantity are validated but not stored, as per migration)
    for (let i = 0; i < services.length; i++) {
      const svc = services[i];
      if (
        !svc.serviceId ||
        !svc.price ||
        svc.price <= 0 ||
        (svc.quantity !== undefined && svc.quantity <= 0)
      ) {
        await transaction?.rollback();
        return res.status(200).json({
          status: false,
          message: `Invalid service at index ${i}: serviceId and price (positive number) are required. Optional quantity must be positive if provided.`,
        });
      }
    }

    // Step 2: Check if user and marketplace exist
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      await transaction?.rollback();
      return res.status(200).json({
        status: false,
        message: "User not found.",
      });
    }

    const marketplace = await Marketplace.findByPk(marketplaceId, {
      transaction,
    });
    if (!marketplace) {
      await transaction?.rollback();
      return res.status(200).json({
        status: false,
        message: "Marketplace not found.",
      });
    }

    // Step 2.5: Check if client can book with this provider
    // Resolve the suite/solo OWNER only — team members share marketplaceId,
    // so findOne({ marketplaceId }) can wrongly return a team member and break
    // assignedTeamMemberId validation (teamOwnerId must be the owner).
    let provider: User | null = null;
    if (marketplace.userId) {
      provider = await User.findByPk(marketplace.userId, { transaction });
    }
    if (!provider) {
      provider = await User.findOne({
        where: {
          marketplaceId: marketplaceId,
          isTeamMember: false,
        },
        transaction,
      });
    }

    if (!provider) {
      await transaction?.rollback();
      return res.status(200).json({
        status: false,
        message: "Provider not found for this marketplace.",
      });
    }

    const canBook = await SubscriptionService.canClientBook(userId, provider.id);
    if (!canBook.canBook) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        message: canBook.reason,
      });
    }

    // Step 3: Check if services exist and belong to the marketplace
    const serviceIds = services.map((svc) => svc.serviceId);
    const validServices = await Service.findAll({
      where: {
        id: { [Op.in]: serviceIds },
        marketplaceId: marketplaceId, // Must belong to this marketplace
      },
      transaction,
    });

    if (validServices.length !== serviceIds.length) {
      await transaction?.rollback();
      return res.status(200).json({
        status: false,
        message:
          "One or more services not found or do not belong to the specified marketplace.",
      });
    }

    // Resolve assigned team member against the primary service providers (if any).
    // Missing / "no_preference" → auto-assign a free member (fewest active bookings).
    let resolvedAssignedTeamMemberId: string | null = null;
    const primaryService = validServices.find(
      (s) => s.id === services[0].serviceId
    ) || validServices[0];
    const serviceProviderIds = (primaryService.providerTeamMemberIds || []).map(
      String
    );

    if (serviceProviderIds.length > 0) {
      const assigneeResult = await WaitlistService.resolveServiceTeamAssignee({
        marketplaceId,
        dateTime: appointmentDate,
        serviceProviderIds,
        teamOwnerId: provider.id,
        assignedTeamMemberId,
        transaction: transaction ?? undefined,
      });

      if (!assigneeResult.ok) {
        await transaction?.rollback();
        const statusCode =
          assigneeResult.reason === "all_providers_booked" ||
          assigneeResult.reason === "provider_occupied"
            ? 409
            : 400;
        return res.status(statusCode).json({
          status: false,
          reason: assigneeResult.reason,
          message: assigneeResult.message,
          data: { reason: assigneeResult.reason },
        });
      }

      resolvedAssignedTeamMemberId = assigneeResult.assignedTeamMemberId;
    }

    // Optional: Validate that provided total price is reasonable (basic sanity check)
    // Note: Frontend handles add-ons calculation, so we only do a basic validation
    const baseServiceTotal = services.reduce(
      (sum, svc) => sum + svc.price * (svc.quantity || 1),
      0
    );
    
    // Allow for add-ons by checking if price is at least the base service total
    // and not unreasonably higher (max 5x base price to prevent abuse)
    if (price < baseServiceTotal || price > baseServiceTotal * 5) {
      await transaction?.rollback();
      return res.status(200).json({
        status: false,
        message: `Invalid total price (${price}). Expected between ${baseServiceTotal.toFixed(2)} and ${(baseServiceTotal * 5).toFixed(2)} (including potential add-ons).`,
      });
    }

    // Step 4: Create the Appointment (using provided total price and quantity)
    const newAppointment = await Appointment.create(
      {
        userId,
        marketplaceId,
        serviceId: services[0].serviceId, // Use first service as primary service
        assignedTeamMemberId: resolvedAssignedTeamMemberId,
        clientNoPreference:
          serviceProviderIds.length > 0
            ? WaitlistService.isClientNoPreference(assignedTeamMemberId)
            : false,
        paymentStatus: paymentStatus ?? "pending",
        paymentMethod: resolvedPaymentMethod,
        dateTime: appointmentDate,
        status: "pending", // Default
        price: price,
        depositAmount: depositAmount,
        remainingBalance: remainingBalance,
      },
      { transaction }
    );

    // Step 5: Create AppointmentServiceStatus entries (simple junction: only appointmentId and serviceId, per migration)
    const serviceStatuses: InferCreationAttributes<AppointmentServiceStatus>[] =
      services.map((svc) => ({
        appointmentId: newAppointment.id,
        serviceId: svc.serviceId,
      })) as InferCreationAttributes<AppointmentServiceStatus>[];

    await AppointmentServiceStatus.bulkCreate(serviceStatuses, { transaction });

    // Step 5.5: Mark free booking as used if this is client's first booking
    if (user.role === 'client' && !user.freeBookingUsed) {
      await user.update({ freeBookingUsed: true }, { transaction });
    }

    // Step 6: Commit transaction
    await transaction?.commit();

    await WaitlistService.clearSlotWaitlist(marketplaceId, appointmentDate, newAppointment.id);

    // Step 7: Fetch the created appointment with includes for full response
    // Adjusted: No through attributes since junction table has none beyond IDs
    const createdAppointment = await Appointment.findByPk(newAppointment.id, {
      include: [
        { model: User, as: "user" }, // Full user object (all fields)
        { 
          model: Marketplace, 
          as: "marketplace",
          include: [
            {
              model: Social,
              as: "socials",
              attributes: ["id", "insta", "tiktok", "facebook", "googlePlaceId"]
            }
          ]
        },
        {
          model: Service,
          as: "services",
          through: {
            attributes: [], // No additional attributes in junction table
          },
          // Removed nested marketplace include (no duplication)
        },
      ],
      transaction: undefined, // No transaction for read
    });

    if (!createdAppointment) {
      return res.status(200).json({
        status: false,
        message: "Failed to retrieve created appointment.",
      });
    }

    BookingConfirmationEmailService.queueSendForAppAppointment(
      newAppointment.id
    );

    return res.status(201).json({
      status: true,
      message: `Appointment created successfully with ${services.length} services (total price: ${price}).`,
      data: createdAppointment.toJSON(), // Full details with associations
    });
  } catch (err: any) {
    await transaction?.rollback();
    console.error("Error creating appointment:", err);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${err.message || err}`,
    });
  }
};

/**
 * Provider-created appointment for an existing client (solo/suite home calendar flow).
 * Unlike createAppointment, the authenticated user is the provider — clientId is required.
 */
export const createProviderAppointment = async (
  req: any,
  res: Response
): Promise<Response> => {
  const transaction = await Appointment.sequelize?.transaction();
  try {
    const requester = req.user as User;
    if (!requester || (requester.role !== "solo" && requester.role !== "suite")) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        message: "Only providers can create appointments for clients.",
      });
    }

    const {
      clientId,
      marketplaceId,
      dateTime,
      paymentStatus,
      price,
      services,
      depositAmount,
      remainingBalance,
      assignedTeamMemberId,
      allowScheduleConflict,
      depositMode,
    } = req.body as CreateAppointmentData & {
      clientId?: string;
      allowScheduleConflict?: boolean;
      /** Provider/owner manual book: send_payment_link | waive_deposit */
      depositMode?: "send_payment_link" | "waive_deposit";
    };

    if (
      !clientId ||
      !marketplaceId ||
      !dateTime ||
      !price ||
      !services ||
      !Array.isArray(services) ||
      services.length === 0
    ) {
      await transaction?.rollback();
      return res.status(400).json({
        status: false,
        message:
          "Missing or invalid required fields: clientId, marketplaceId, dateTime, price, and services array.",
      });
    }

    if (price <= 0) {
      await transaction?.rollback();
      return res.status(400).json({
        status: false,
        message: "price must be a valid positive number.",
      });
    }

    const appointmentDate = parseBookingDateTime(dateTime);
    if (isNaN(appointmentDate.getTime()) || appointmentDate <= new Date()) {
      await transaction?.rollback();
      return res.status(400).json({
        status: false,
        message:
          "The provided dateTime must be a valid ISO date set in the future.",
      });
    }

    for (let i = 0; i < services.length; i++) {
      const svc = services[i];
      if (
        !svc.serviceId ||
        !svc.price ||
        svc.price <= 0 ||
        (svc.quantity !== undefined && svc.quantity <= 0)
      ) {
        await transaction?.rollback();
        return res.status(400).json({
          status: false,
          message: `Invalid service at index ${i}: serviceId and price are required.`,
        });
      }
    }

    const marketplace = await Marketplace.findByPk(marketplaceId, {
      transaction,
    });
    if (!marketplace) {
      await transaction?.rollback();
      return res.status(404).json({
        status: false,
        message: "Marketplace not found.",
      });
    }

    const isMarketplaceOwner = marketplace.userId === requester.id;
    const isTeamMemberOfMarketplace =
      requester.isTeamMember === true &&
      requester.teamOwnerId === marketplace.userId;
    if (!isMarketplaceOwner && !isTeamMemberOfMarketplace) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        message: "You do not have access to this marketplace.",
      });
    }

    const client = await User.findOne({
      where: { id: clientId, role: "client" },
      transaction,
    });
    if (!client) {
      await transaction?.rollback();
      return res.status(404).json({
        status: false,
        message: "Selected client was not found.",
      });
    }

    let provider: User | null = null;
    if (marketplace.userId) {
      provider = await User.findByPk(marketplace.userId, { transaction });
    }
    if (!provider) {
      provider = await User.findOne({
        where: { marketplaceId, isTeamMember: false },
        transaction,
      });
    }
    if (!provider) {
      await transaction?.rollback();
      return res.status(404).json({
        status: false,
        message: "Provider not found for this marketplace.",
      });
    }

    const canBook = await SubscriptionService.canClientBook(
      client.id,
      provider.id
    );
    if (!canBook.canBook) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        message: canBook.reason,
      });
    }

    const serviceIds = services.map((svc) => svc.serviceId);
    const validServices = await Service.findAll({
      where: {
        id: { [Op.in]: serviceIds },
        marketplaceId,
      },
      transaction,
    });
    if (validServices.length !== serviceIds.length) {
      await transaction?.rollback();
      return res.status(400).json({
        status: false,
        message:
          "One or more services not found or do not belong to the specified marketplace.",
      });
    }

    // Resolve assigned team member: explicit id, or auto-assign when requester is a TM.
    let resolvedAssignedTeamMemberId: string | null = null;
    const primaryService =
      validServices.find((s) => s.id === services[0].serviceId) ||
      validServices[0];
    const serviceProviderIds = (
      primaryService.providerTeamMemberIds || []
    ).map(String);
    const requestedAssignee =
      assignedTeamMemberId ||
      (requester.isTeamMember ? requester.id : undefined);

    if (serviceProviderIds.length > 0) {
      if (!requestedAssignee) {
        await transaction?.rollback();
        return res.status(400).json({
          status: false,
          message: "Please select a service provider for this service.",
        });
      }
      if (!serviceProviderIds.includes(String(requestedAssignee))) {
        await transaction?.rollback();
        return res.status(400).json({
          status: false,
          message: "Selected service provider is not assigned to this service.",
        });
      }
      const assignedMember = await User.findOne({
        where: {
          id: requestedAssignee,
          isTeamMember: true,
          teamOwnerId: provider.id,
        },
        transaction,
      });
      if (!assignedMember) {
        await transaction?.rollback();
        return res.status(400).json({
          status: false,
          message: "Selected service provider was not found for this suite.",
        });
      }
      resolvedAssignedTeamMemberId = assignedMember.id;
    } else if (requestedAssignee && requester.isTeamMember) {
      // Service has no fixed providers; still tag the booking to the TM who created it.
      resolvedAssignedTeamMemberId = requester.id;
    }

    const scheduleCheck = await ScheduleAvailabilityService.assertOpenAt(
      marketplaceId,
      appointmentDate
    );
    if (!scheduleCheck.allowed) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        reason: scheduleCheck.reason,
        message:
          scheduleCheck.message ||
          "This date or time is unavailable on your schedule.",
      });
    }

    if (await WaitlistService.isSlotBlocked(marketplaceId, appointmentDate)) {
      await transaction?.rollback();
      return res.status(409).json({
        status: false,
        reason: "blocked",
        message:
          "This time is blocked and cannot be booked. Please choose another time.",
      });
    }

    // Solo: marketplace-wide busy check. Suite: busy only for the same team member
    // (different members at the same time are allowed). allowScheduleConflict lets
    // solo/suite confirm a double-book after the Schedule Conflict dialog.
    // Blocked times still always reject.
    const providerAllowConflict =
      (requester.role === "solo" || requester.role === "suite") &&
      allowScheduleConflict === true;
    const isSlotOccupied = await WaitlistService.isSlotOccupied(
      marketplaceId,
      appointmentDate,
      {
        ignoreBlockedTimes: true,
        ...(providerAllowConflict ? { ignoreAppointments: true } : {}),
        ...(requester.role === "suite"
          ? {
              assignedTeamMemberId: resolvedAssignedTeamMemberId,
              ignoreExternalAppointments: true,
            }
          : {}),
      }
    );
    if (isSlotOccupied) {
      await transaction?.rollback();
      return res.status(409).json({
        status: false,
        reason: "occupied",
        message: "This slot is fully booked.",
      });
    }

    const baseServiceTotal = services.reduce(
      (sum, svc) => sum + svc.price * (svc.quantity || 1),
      0
    );
    if (price < baseServiceTotal || price > baseServiceTotal * 5) {
      await transaction?.rollback();
      return res.status(400).json({
        status: false,
        message: `Invalid total price (${price}). Expected between ${baseServiceTotal.toFixed(
          2
        )} and ${(baseServiceTotal * 5).toFixed(2)}.`,
      });
    }

    // Resolve deposit for provider/owner manual booking options.
    const mode =
      depositMode === "send_payment_link" || depositMode === "waive_deposit"
        ? depositMode
        : null;

    let resolvedDeposit =
      depositAmount != null ? Number(depositAmount) : undefined;
    let resolvedRemaining =
      remainingBalance != null ? Number(remainingBalance) : undefined;
    let resolvedStatus: Appointment["status"] = "pending";
    let resolvedPaymentStatus =
      (paymentStatus as Appointment["paymentStatus"]) ?? "pending";
    let depositExpiresAt: Date | null = null;
    let depositWaived = false;

    if (mode === "send_payment_link" || mode === "waive_deposit") {
      // Prefer explicit body deposit; else compute from primary service rules.
      if (resolvedDeposit == null || !Number.isFinite(resolvedDeposit)) {
        const primary = validServices.find((s) => s.id === services[0].serviceId) ||
          validServices[0];
        resolvedDeposit = computeServiceDepositAmount(primary, Number(price));
      }
      resolvedDeposit = Math.max(0, Number(resolvedDeposit) || 0);

      if (mode === "send_payment_link") {
        if (resolvedDeposit <= 0) {
          await transaction?.rollback();
          return res.status(400).json({
            status: false,
            message:
              "This service has no deposit configured. Choose Waive Deposit, or set a deposit on the service.",
          });
        }
        resolvedRemaining = Math.max(0, Number(price) - resolvedDeposit);
        resolvedStatus = "pending_deposit";
        resolvedPaymentStatus = "pending";
        depositExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
        depositWaived = false;
      } else {
        // Option B: waive deposit — confirmed immediately, full balance at visit.
        resolvedDeposit = 0;
        resolvedRemaining = Number(price);
        resolvedStatus = "confirmed";
        resolvedPaymentStatus = "pending";
        depositExpiresAt = null;
        depositWaived = true;
      }
    }

    const newAppointment = await Appointment.create(
      {
        userId: client.id,
        marketplaceId,
        serviceId: services[0].serviceId,
        assignedTeamMemberId: resolvedAssignedTeamMemberId,
        // Owner/provider picked the member — not a client No Preference booking.
        clientNoPreference: false,
        paymentStatus: resolvedPaymentStatus,
        dateTime: appointmentDate,
        status: resolvedStatus,
        price,
        depositAmount: resolvedDeposit,
        remainingBalance: resolvedRemaining,
        depositExpiresAt,
        depositWaived,
      },
      { transaction }
    );

    const serviceStatuses: InferCreationAttributes<AppointmentServiceStatus>[] =
      services.map((svc) => ({
        appointmentId: newAppointment.id,
        serviceId: svc.serviceId,
      })) as InferCreationAttributes<AppointmentServiceStatus>[];

    await AppointmentServiceStatus.bulkCreate(serviceStatuses, { transaction });

    if (!client.freeBookingUsed) {
      await client.update({ freeBookingUsed: true }, { transaction });
    }

    await transaction?.commit();
    await WaitlistService.clearSlotWaitlist(
      marketplaceId,
      appointmentDate,
      newAppointment.id
    );

    const createdAppointment = await Appointment.findByPk(newAppointment.id, {
      include: [
        { model: User, as: "user" },
        {
          model: Marketplace,
          as: "marketplace",
          include: [
            {
              model: Social,
              as: "socials",
              attributes: ["id", "insta", "tiktok", "facebook", "googlePlaceId"],
            },
          ],
        },
        {
          model: Service,
          as: "services",
          through: { attributes: [] },
        },
        {
          model: User,
          as: "assignedTeamMember",
          attributes: ["id", "name", "profilePic"],
          required: false,
        },
      ],
    });

    if (mode === "send_payment_link") {
      console.log(
        `[BookingEmail] Deposit hold ${newAppointment.id} → client ${client.email}`
      );
      BookingConfirmationEmailService.queueDepositReservationEmail(
        newAppointment.id
      );

      const payLink = BookingConfirmationEmailService.buildDepositPayLink(
        newAppointment.id
      );
      const businessName =
        (createdAppointment as any)?.marketplace?.businessName ||
        "your provider";
      const depositLabel = Number(resolvedDeposit || 0).toFixed(2);

      void NotificationService.createNotification({
        userId: client.id,
        type: "booking_confirmation",
        title: "Appointment reserved — pay deposit",
        content: `Your appointment is reserved! Pay your $${depositLabel} deposit within 2 hours to lock it in: ${payLink}`,
        data: {
          appointmentId: newAppointment.id,
          type: "pending_deposit",
          action: "pay_deposit",
        },
        channels: {
          push: true,
          sms: true,
          email: false,
          in_app: true,
        },
      }).catch((err) =>
        console.error("[BookingNotify] pending deposit notify failed:", err)
      );

      // In-app chat from provider → client with the same pay link.
      const providerId = marketplace.userId;
      if (providerId) {
        try {
          const conversation = await ChatService.getOrCreateConversation(
            client.id,
            providerId
          );
          await ChatService.sendMessage(
            conversation.id,
            providerId,
            `Your appointment with ${businessName} is reserved! Click here to pay your $${depositLabel} deposit to lock it in (expires in 2 hours): ${payLink}`
          );
        } catch (err) {
          console.error("[BookingChat] pending deposit chat failed:", err);
        }
      }
    } else {
      // Waive deposit or legacy create — standard confirmation email.
      console.log(
        `[BookingEmail] Provider-created appointment ${newAppointment.id} → client ${client.email}`
      );
      BookingConfirmationEmailService.queueSendForAppAppointment(
        newAppointment.id
      );
    }

    return res.status(201).json({
      status: true,
      message:
        mode === "send_payment_link"
          ? "Appointment reserved. Payment link sent to the client."
          : mode === "waive_deposit"
            ? "Appointment confirmed (deposit waived)."
            : "Appointment created successfully.",
      data: createdAppointment?.toJSON() ?? newAppointment.toJSON(),
    });
  } catch (err: any) {
    await transaction?.rollback();
    console.error("Error creating provider appointment:", err);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${err.message || err}`,
    });
  }
};

function computeServiceDepositAmount(
  service: Service | undefined,
  totalPrice: number
): number {
  if (!service || !service.requireDeposit) return 0;
  const raw = Number(service.depositAmount ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const type = String(service.depositType || "fixed").toLowerCase();
  if (type === "percentage") {
    return Math.round(((totalPrice * raw) / 100) * 100) / 100;
  }
  return raw;
}

// Create a Stripe PaymentIntent for an existing appointment, split between
// the platform (1.5%) and the provider's connected Stripe account (98.5%).
export const createAppointmentPaymentIntent = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user.id;
    const { appointmentId } = req.params;

    const appointment = await Appointment.findOne({
      where: { id: appointmentId, userId },
    });
    if (!appointment) {
      return res.status(404).json({
        status: false,
        message: "Appointment not found.",
      });
    }

    if (appointment.paymentStatus === "paid") {
      return res.status(400).json({
        status: false,
        message: "This appointment has already been paid.",
      });
    }

    const marketplace = await Marketplace.findByPk(appointment.marketplaceId);
    if (!marketplace) {
      return res.status(404).json({
        status: false,
        message: "Marketplace not found.",
      });
    }

    // The provider must have completed Stripe Connect onboarding before we
    // can split and route a payment to their account.
    const provider = await User.findOne({ where: { id: marketplace.userId as string } });
    if (!provider?.stripeConnectAccountId || !provider.stripeConnectChargesEnabled) {
      return res.status(400).json({
        status: false,
        message: "This provider hasn't finished payment setup yet. Please try again later.",
      });
    }

    const client = await User.findByPk(userId);
    if (!client) {
      return res.status(404).json({
        status: false,
        message: "User not found.",
      });
    }

    const customerId = await StripeService.getOrCreateValidCustomer(client);

    // Clients pay the deposit now when required — never the full service total.
    const deposit = Number(appointment.depositAmount ?? 0);
    const amount = deposit > 0 ? deposit : Number(appointment.price);
    if (!amount || amount <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid payment amount for this appointment.",
      });
    }

    const applicationFeeAmount = Math.round(amount * 100 * StripeService.PLATFORM_FEE_PERCENT);

    const paymentIntent = await StripeService.createPaymentIntent(
      amount,
      "usd",
      customerId,
      {
        appointmentId: appointment.id,
        marketplaceId: appointment.marketplaceId,
        paymentType: deposit > 0 ? "deposit" : "full",
      },
      {
        accountId: provider.stripeConnectAccountId,
        applicationFeeAmount,
      }
    );

    return res.status(200).json({
      status: true,
      message: "Payment intent created successfully.",
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount,
        platformFee: applicationFeeAmount / 100,
        providerAmount: amount - applicationFeeAmount / 100,
      },
    });
  } catch (err: any) {
    console.error("Error creating appointment payment intent:", err);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${err.message || err}`,
    });
  }
};

export const getAppointments = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const {
      marketplaceId,
      date,
      startDate,
      endDate,
      page = "1",
      limit = "10",
      sort = "asc",
    } = req.query as GetAppointmentsQuery;

    // Validate required marketplaceId
    if (!marketplaceId) {
      return res.status(200).json({
        status: false,
        message: "marketplaceId is required.",
      });
    }

    // Optional: Validate marketplace exists
    const marketplace = await Marketplace.findByPk(marketplaceId);
    if (!marketplace) {
      return res.status(200).json({
        status: false,
        message: "Marketplace not found.",
      });
    }

    // Build date filter logic
    let dateFilter: any = {};
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Normalize to start of today for calculations

    if (date) {
      // Case 1: Single day filter
      const dayStart = new Date(date);
      if (isNaN(dayStart.getTime())) {
        return res.status(200).json({
          status: false,
          message:
            "Invalid date format. Use ISO date string (e.g., '2023-10-15').",
        });
      }
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      dateFilter = {
        dateTime: {
          [Op.between]: [dayStart, dayEnd],
        },
      };
    } else if (startDate && endDate) {
      // Case 2: Date range filter
      const rangeStart = new Date(startDate);
      const rangeEnd = new Date(endDate);
      if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
        return res.status(200).json({
          status: false,
          message: "Invalid startDate or endDate format. Use ISO date strings.",
        });
      }
      if (rangeStart > rangeEnd) {
        return res.status(200).json({
          status: false,
          message: "startDate must be before or equal to endDate.",
        });
      }
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd.setHours(23, 59, 59, 999);
      dateFilter = {
        dateTime: {
          [Op.between]: [rangeStart, rangeEnd],
        },
      };
    } else {
      // Case 3: Default - From yesterday to 29 days onwards
      const yesterdayStart = new Date(now);
      yesterdayStart.setDate(now.getDate() - 1);
      yesterdayStart.setHours(0, 0, 0, 0);

      const futureEnd = new Date(now);
      futureEnd.setDate(now.getDate() + 29);
      futureEnd.setHours(23, 59, 59, 999);

      dateFilter = {
        dateTime: {
          [Op.between]: [yesterdayStart, futureEnd],
        },
      };
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    const sortDirection = String(sort).toLowerCase() === "desc" ? "DESC" : "ASC";

    const whereClause: any = {
      marketplaceId,
      ...dateFilter,
    };

    // Team members only see bookings assigned to them.
    // Suite owner (non-team-member) sees the full marketplace calendar.
    const requester = req.user as User | undefined;
    if (requester?.isTeamMember) {
      const permissions = await getTeamMemberPermissionsForUser(requester);
      const scope = getBookingScope(permissions);
      if (scope === "none") {
        return res.status(403).json({
          status: false,
          message: "You do not have permission to view bookings.",
        });
      }
      whereClause.assignedTeamMemberId = requester.id;
    }

    // Fetch appointments with includes
    const { count, rows: appointments } = await Appointment.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: "user",
          // Client profile phone (from signup) for provider/owner booking details.
          attributes: [
            "id",
            "name",
            "email",
            "phone",
            "profilePic",
            "role",
            "status",
            "accountVerified",
            "identityVerified",
            "professionalVerified",
            "businessVerified",
          ],
        },
        {
          model: User,
          as: "assignedTeamMember",
          required: false,
          attributes: ["id", "name", "profilePic", "jobTitle", "isTeamMember"],
        },
        { 
          model: Marketplace, 
          as: "marketplace",
          attributes: ["id", "businessName", "phoneNumber", "address", "latitude", "longitude", "imagesList", "userId"],
          include: [
            {
              model: Social,
              as: "socials",
              attributes: ["id", "insta", "tiktok", "facebook", "googlePlaceId"]
            }
          ]
        },
        {
          model: Service,
          as: "services",
          through: {
            attributes: [], // No additional attributes in junction table (matches migration)
          },
        },
      ],
      limit: limitNum,
      offset,
      order: [["dateTime", sortDirection]],
    });

    return res.status(200).json({
      status: true,
      message: date
        ? `Appointments fetched successfully for ${date}.`
        : startDate && endDate
        ? `Appointments fetched successfully from ${startDate} to ${endDate}.`
        : `Appointments fetched successfully from yesterday to 29 days onwards.`,
      data: {
        appointments: appointments.map((apt) => apt.toJSON()), // Serialize to JSON
        pagination: {
          total: count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(count / limitNum),
        },
      },
    });
  } catch (err: any) {
    console.error("Error fetching appointments:", err);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${err.message || err}`,
    });
  }
};

//* ===================== UPDATE APPOINTMENT DATE TIME ====================
export const updateAppointmentDateTime = async (
  req: any,
  res: Response
): Promise<Response> => {
  const transaction = await Appointment.sequelize?.transaction(); // Start transaction
  try {
    const { appointmentId, dateTime } = req.body;

    // Step 1: Validate essential fields
    if (!appointmentId || !dateTime) {
      await transaction?.rollback();
      return res.status(200).json({
        status: false,
        message:
          "Missing required fields: appointmentId (route param) and dateTime (future ISO string).",
      });
    }

    // Validate new dateTime is in the future (wall-clock digits, not TZ-shifted)
    const newAppointmentDate = parseBookingDateTime(dateTime);
    if (
      isNaN(newAppointmentDate.getTime()) ||
      newAppointmentDate <= new Date()
    ) {
      await transaction?.rollback();
      return res.status(400).json({
        status: false,
        message: "dateTime must be a valid future ISO date.",
      });
    }

    // Step 2: Find the appointment
    const appointment = await Appointment.findByPk(appointmentId, {
      transaction,
    });

    if (!appointment) {
      await transaction?.rollback();
      return res.status(404).json({
        status: false,
        message: "Appointment not found.",
      });
    }

    // Step 3: Verify user owns this appointment
    const user = req.user;
    if (appointment.userId !== user.id) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        message: "You can only update your own appointments.",
      });
    }

    const bookingWindowCheck =
      await BookingWindowService.assertMarketplaceAllowsDate(
        appointment.marketplaceId,
        newAppointmentDate
      );
    if (!bookingWindowCheck.allowed) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        message:
          bookingWindowCheck.message ||
          "This date is outside the provider's booking window.",
      });
    }

    const scheduleCheck = await ScheduleAvailabilityService.assertOpenAt(
      appointment.marketplaceId,
      newAppointmentDate
    );
    if (!scheduleCheck.allowed) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        reason: scheduleCheck.reason,
        message:
          scheduleCheck.message ||
          "This date or time is unavailable on the provider's schedule.",
      });
    }

    if (
      await WaitlistService.isSlotBlocked(
        appointment.marketplaceId,
        newAppointmentDate
      )
    ) {
      await transaction?.rollback();
      return res.status(409).json({
        status: false,
        reason: "blocked",
        message:
          "This time is blocked by the provider and is unavailable for booking. Please choose another time.",
      });
    }

    const oldDateTime = new Date(appointment.dateTime);

    const isSlotOccupied = await WaitlistService.isSlotOccupied(
      appointment.marketplaceId,
      newAppointmentDate,
      { excludeAppointmentId: appointment.id }
    );
    if (isSlotOccupied) {
      await transaction?.rollback();
      return res.status(409).json({
        status: false,
        message: "Requested slot is fully booked.",
      });
    }

    const claimCheck = await WaitlistService.canUserBookSlot(user.id, appointment.marketplaceId, newAppointmentDate);
    if (!claimCheck.allowed) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        message: claimCheck.message,
      });
    }

    // Step 4: Update the appointment's dateTime
    appointment.dateTime = newAppointmentDate;
    appointment.updatedAt = new Date(); // Update timestamp
    await appointment.save({ transaction });

    // Step 4: Commit transaction
    await transaction?.commit();

    await WaitlistService.processSlotAvailability(appointment.marketplaceId, oldDateTime);
    await WaitlistService.clearSlotWaitlist(appointment.marketplaceId, newAppointmentDate, appointment.id);

    // Step 5: Fetch the updated appointment with full includes for response
    const updatedAppointment = await Appointment.findByPk(appointmentId, {
      // ? Enable only if needed
      // include: [
      //   { model: User, as: "user" },
      //   {
      //     model: Service,
      //     as: "services",
      //     through: {
      //       attributes: [], // No additional attributes in junction table
      //     },
      //   },
      // ],
      transaction: undefined,
    });

    if (!updatedAppointment) {
      return res.status(200).json({
        status: false,
        message: "Failed to retrieve updated appointment.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Appointment rescheduled successfully.",
      data: updatedAppointment.toJSON(),
    });
  } catch (err: any) {
    await transaction?.rollback();
    console.error("Error updating appointment dateTime:", err);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${err.message || err}`,
    });
  }
};

//* ===================== UPDATE APPOINTMENT PAYMENT STATUS ====================
export const updateAppointmentPaymentStatus = async (
  req: any,
  res: Response
): Promise<Response> => {
  const transaction = await Appointment.sequelize?.transaction(); // Start transaction
  try {
    const { appointmentId, paymentStatus } = req.body;

    // Step 1: Validate essential fields
    if (!appointmentId || !paymentStatus) {
      await transaction?.rollback();
      return res.status(200).json({
        status: false,
        message: "Missing required fields: appointmentId and paymentStatus.",
      });
    }

    // Validate paymentStatus is one of the allowed values (customize as needed)
    const allowedStatuses = ["pending", "paid", "failed", "refunded"];
    if (!allowedStatuses.includes(paymentStatus)) {
      await transaction?.rollback();
      return res.status(400).json({
        status: false,
        message: `Invalid paymentStatus. Allowed values: ${allowedStatuses.join(
          ", "
        )}.`,
      });
    }

    // Step 2: Find the appointment
    const appointment = await Appointment.findByPk(appointmentId, {
      transaction,
    });

    if (!appointment) {
      await transaction?.rollback();
      return res.status(404).json({
        status: false,
        message: "Appointment not found.",
      });
    }

    // Step 3: Verify user owns this appointment
    const user = req.user;
    if (appointment.userId !== user.id) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        message: "You can only update your own appointments.",
      });
    }

    // Step 4: Update the appointment's paymentStatus
    appointment.paymentStatus = paymentStatus;
    appointment.updatedAt = new Date(); // Update timestamp
    await appointment.save({ transaction });

    // Step 4: Commit transaction
    await transaction?.commit();

    // Step 5: Fetch the updated appointment with full includes for response
    const updatedAppointment = await Appointment.findByPk(appointmentId, {
      // ? Enable only if needed
      // include: [
      //   { model: User, as: "user" },
      //   {
      //     model: Service,
      //     as: "services",
      //     through: {
      //       attributes: [],
      //     },
      //   },
      // ],
      transaction: undefined,
    });

    if (!updatedAppointment) {
      return res.status(200).json({
        status: false,
        message: "Failed to retrieve updated appointment.",
      });
    }

    return res.status(200).json({
      status: true,
      message: `Appointment paymentStatus updated successfully to ${paymentStatus}.`,
      data: updatedAppointment.toJSON(),
    });
  } catch (err: any) {
    await transaction?.rollback();
    console.error("Error updating appointment paymentStatus:", err);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${err.message || err}`,
    });
  }
};

//* ===================== MARK APPOINTMENT PAID IN CASH (PROVIDER) ====================
export const markAppointmentPaidInCash = async (
  req: any,
  res: Response
): Promise<Response> => {
  const transaction = await Appointment.sequelize?.transaction();
  try {
    const { appointmentId } = req.body;
    const user = req.user;

    if (!appointmentId) {
      await transaction?.rollback();
      return res.status(200).json({
        status: false,
        message: "Missing required field: appointmentId.",
      });
    }

    const appointment = await Appointment.findByPk(appointmentId, {
      transaction,
    });

    if (!appointment) {
      await transaction?.rollback();
      return res.status(404).json({
        status: false,
        message: "Appointment not found.",
      });
    }

    if (appointment.paymentStatus === "paid") {
      await transaction?.rollback();
      return res.status(200).json({
        status: false,
        message: "This appointment is already marked as paid.",
      });
    }

    const marketplace = await Marketplace.findByPk(appointment.marketplaceId, {
      transaction,
    });

    if (!marketplace) {
      await transaction?.rollback();
      return res.status(404).json({
        status: false,
        message: "Marketplace not found for this appointment.",
      });
    }

    const isMarketplaceOwner = marketplace.userId === user.id;
    const isTeamMemberOfMarketplace =
      user.isTeamMember === true && user.teamOwnerId === marketplace.userId;

    if (!isMarketplaceOwner && !isTeamMemberOfMarketplace) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        message:
          "Only marketplace owners or their team members can mark bookings as paid in cash.",
      });
    }

    appointment.paymentStatus = "paid";
    appointment.paymentMethod = "cash";
    appointment.remainingBalance = 0;
    appointment.updatedAt = new Date();
    await appointment.save({ transaction });

    await transaction?.commit();

    const updatedAppointment = await Appointment.findByPk(appointmentId, {
      include: [
        { model: User, as: "user" },
        {
          model: Service,
          as: "services",
          through: { attributes: [] },
        },
      ],
    });

    return res.status(200).json({
      status: true,
      message: "Appointment marked as paid in cash successfully.",
      data: updatedAppointment?.toJSON() ?? appointment.toJSON(),
    });
  } catch (err: any) {
    await transaction?.rollback();
    console.error("Error marking appointment paid in cash:", err);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${err.message || err}`,
    });
  }
};

/**
 * Provider/owner/TM edit of a confirmed app appointment (date/time/service/assignee).
 * Does NOT change status — client is not asked to re-confirm. Emails the client.
 */
export const updateProviderAppointment = async (
  req: any,
  res: Response
): Promise<Response> => {
  const transaction = await Appointment.sequelize?.transaction();
  try {
    const requester = req.user as User;
    if (!requester || (requester.role !== "solo" && requester.role !== "suite")) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        message: "Only providers can edit appointments.",
      });
    }

    const {
      appointmentId,
      dateTime,
      price,
      services,
      assignedTeamMemberId,
    } = req.body as {
      appointmentId?: string;
      dateTime?: string;
      price?: number;
      services?: Array<{ serviceId: string; price: number; quantity?: number }>;
      assignedTeamMemberId?: string | null;
    };

    if (
      !appointmentId ||
      !dateTime ||
      price == null ||
      !services ||
      !Array.isArray(services) ||
      services.length === 0
    ) {
      await transaction?.rollback();
      return res.status(400).json({
        status: false,
        message:
          "Missing required fields: appointmentId, dateTime, price, and services.",
      });
    }

    if (Number(price) <= 0) {
      await transaction?.rollback();
      return res.status(400).json({
        status: false,
        message: "price must be a positive number.",
      });
    }

    const appointmentDate = parseBookingDateTime(dateTime);
    if (isNaN(appointmentDate.getTime())) {
      await transaction?.rollback();
      return res.status(400).json({
        status: false,
        message: "dateTime must be a valid ISO date.",
      });
    }

    const appointment = await Appointment.findByPk(appointmentId, {
      transaction,
    });
    if (!appointment) {
      await transaction?.rollback();
      return res.status(404).json({
        status: false,
        message: "Appointment not found.",
      });
    }

    // Editable once confirmed (manual waive → confirmed, or Confirm → availed).
    if (
      appointment.status !== "availed" &&
      appointment.status !== "confirmed"
    ) {
      await transaction?.rollback();
      return res.status(400).json({
        status: false,
        message:
          "Only confirmed appointments can be edited. Confirm the booking first.",
      });
    }

    const marketplace = await Marketplace.findByPk(appointment.marketplaceId, {
      transaction,
    });
    if (!marketplace) {
      await transaction?.rollback();
      return res.status(404).json({
        status: false,
        message: "Marketplace not found.",
      });
    }

    const isMarketplaceOwner = marketplace.userId === requester.id;
    const isTeamMemberOfMarketplace =
      requester.isTeamMember === true &&
      requester.teamOwnerId === marketplace.userId;
    if (!isMarketplaceOwner && !isTeamMemberOfMarketplace) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        message: "You do not have access to this marketplace.",
      });
    }

    for (let i = 0; i < services.length; i++) {
      const svc = services[i];
      if (!svc.serviceId || !svc.price || svc.price <= 0) {
        await transaction?.rollback();
        return res.status(400).json({
          status: false,
          message: `Invalid service at index ${i}.`,
        });
      }
    }

    const serviceIds = services.map((s) => s.serviceId);
    const validServices = await Service.findAll({
      where: {
        id: { [Op.in]: serviceIds },
        marketplaceId: appointment.marketplaceId,
      },
      transaction,
    });
    if (validServices.length !== serviceIds.length) {
      await transaction?.rollback();
      return res.status(400).json({
        status: false,
        message:
          "One or more services not found or do not belong to this marketplace.",
      });
    }

    const primaryService =
      validServices.find((s) => s.id === services[0].serviceId) ||
      validServices[0];
    const serviceProviderIds = (primaryService.providerTeamMemberIds || []).map(
      String
    );

    const scheduleCheck = await ScheduleAvailabilityService.assertOpenAt(
      appointment.marketplaceId,
      appointmentDate
    );
    if (!scheduleCheck.allowed) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        reason: scheduleCheck.reason,
        message:
          scheduleCheck.message ||
          "This date or time is unavailable on your schedule.",
      });
    }

    if (
      await WaitlistService.isSlotBlocked(
        appointment.marketplaceId,
        appointmentDate
      )
    ) {
      await transaction?.rollback();
      return res.status(409).json({
        status: false,
        reason: "blocked",
        message: "This time is blocked and cannot be booked.",
      });
    }

    let resolvedAssignedTeamMemberId: string | null = null;
    let clientNoPreference = false;

    if (serviceProviderIds.length > 0) {
      const teamOwnerId = String(marketplace.userId);
      const assignee = await WaitlistService.resolveServiceTeamAssignee({
        marketplaceId: appointment.marketplaceId,
        dateTime: appointmentDate,
        serviceProviderIds,
        teamOwnerId,
        assignedTeamMemberId,
        transaction: transaction || undefined,
        excludeAppointmentId: appointment.id,
      });
      if (!assignee.ok) {
        await transaction?.rollback();
        return res.status(409).json({
          status: false,
          reason: assignee.reason,
          message: assignee.message,
        });
      }
      resolvedAssignedTeamMemberId = assignee.assignedTeamMemberId;
      clientNoPreference = WaitlistService.isClientNoPreference(
        assignedTeamMemberId
      );
    } else {
      // Solo / no fixed providers: marketplace-wide occupancy excluding this booking.
      const occupied = await WaitlistService.isSlotOccupied(
        appointment.marketplaceId,
        appointmentDate,
        { excludeAppointmentId: appointment.id, ignoreBlockedTimes: true }
      );
      if (occupied) {
        await transaction?.rollback();
        return res.status(409).json({
          status: false,
          reason: "occupied",
          message: "This slot is fully booked.",
        });
      }
      resolvedAssignedTeamMemberId = null;
      clientNoPreference = false;
    }

    const oldDateTime = new Date(appointment.dateTime);
    const newPrice = Number(price);
    // Keep deposit already paid; roll any price increase into remaining balance
    // (do not collect a second deposit).
    const { remainingBalance } = remainingBalanceAfterPriceEdit({
      oldPrice: Number(appointment.price || 0),
      oldRemainingBalance: appointment.remainingBalance,
      oldDepositAmount: appointment.depositAmount,
      newPrice,
    });
    let nextPaymentStatus = appointment.paymentStatus;
    if (remainingBalance > 0 && nextPaymentStatus === "paid") {
      nextPaymentStatus = "partially_paid";
    } else if (remainingBalance <= 0 && nextPaymentStatus === "partially_paid") {
      // Price reduced to (or below) amount already paid — nothing left due.
      nextPaymentStatus = "paid";
    }

    await AppointmentServiceStatus.destroy({
      where: { appointmentId: appointment.id },
      transaction,
    });
    await AppointmentServiceStatus.bulkCreate(
      services.map((svc) => ({
        appointmentId: appointment.id,
        serviceId: svc.serviceId,
      })) as InferCreationAttributes<AppointmentServiceStatus>[],
      { transaction }
    );

    await appointment.update(
      {
        dateTime: appointmentDate,
        price: newPrice,
        remainingBalance,
        paymentStatus: nextPaymentStatus,
        serviceId: services[0].serviceId,
        assignedTeamMemberId: resolvedAssignedTeamMemberId,
        clientNoPreference,
        // Keep status as availed — no re-confirm required.
        // depositAmount is intentionally unchanged (already collected).
      },
      { transaction }
    );

    await transaction?.commit();

    await WaitlistService.processSlotAvailability(
      appointment.marketplaceId,
      oldDateTime
    );
    await WaitlistService.clearSlotWaitlist(
      appointment.marketplaceId,
      appointmentDate,
      appointment.id
    );

    // Email includes updated total / deposit paid / amount due.
    BookingConfirmationEmailService.queueSendForAppAppointment(appointment.id, {
      isUpdate: true,
    });

    // In-app + push + SMS for Booqly clients (email already sent above).
    if (appointment.userId) {
      void NotificationService.createNotification({
        userId: appointment.userId,
        type: "booking_confirmation",
        title: "Appointment updated",
        content: `Your appointment was updated. New total $${newPrice.toFixed(
          2
        )}. Amount due at appointment: $${remainingBalance.toFixed(2)}.`,
        data: {
          appointmentId: appointment.id,
          type: "booking_update",
        },
        channels: {
          push: true,
          sms: true,
          email: false,
          in_app: true,
        },
      }).catch((err) => {
        console.error(
          `[BookingNotify] App appointment update ${appointment.id} failed:`,
          err
        );
      });
    }

    const updated = await Appointment.findByPk(appointment.id, {
      include: [
        { model: User, as: "user" },
        {
          model: Marketplace,
          as: "marketplace",
          include: [
            {
              model: Social,
              as: "socials",
              attributes: ["id", "insta", "tiktok", "facebook", "googlePlaceId"],
            },
          ],
        },
        {
          model: Service,
          as: "services",
          through: { attributes: [] },
        },
        {
          model: User,
          as: "assignedTeamMember",
          attributes: ["id", "name", "profilePic"],
          required: false,
        },
      ],
    });

    return res.status(200).json({
      status: true,
      message: "Appointment updated successfully.",
      data: updated?.toJSON() ?? appointment.toJSON(),
    });
  } catch (err: any) {
    await transaction?.rollback();
    console.error("Error updating provider appointment:", err);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${err.message || err}`,
    });
  }
};

//* ===================== UPDATE APPOINTMENT STATUS ====================
export const updateAppointmentStatus = async (
  req: any,
  res: Response
): Promise<Response> => {
  const transaction = await Appointment.sequelize?.transaction(); // Start transaction
  try {
    const { appointmentId, status } = req.body;

    // Step 1: Validate essential fields
    if (!appointmentId || !status) {
      await transaction?.rollback();
      return res.status(200).json({
        status: false,
        message: "Missing required fields: appointmentId and status.",
      });
    }

    // Validate status is one of the allowed values (customize as needed)
    const allowedStatuses = ["pending", "canceled", "postponed", "availed"];
    if (!allowedStatuses.includes(status)) {
      await transaction?.rollback();
      return res.status(400).json({
        status: false,
        message: `Invalid status. Allowed values: ${allowedStatuses.join(
          ", "
        )}.`,
      });
    }

    // Step 2: Find the appointment
    const appointment = await Appointment.findByPk(appointmentId, {
      transaction,
    });

    if (!appointment) {
      await transaction?.rollback();
      return res.status(404).json({
        status: false,
        message: "Appointment not found.",
      });
    }

    const previousStatus = appointment.status;

    // Step 3: Verify user owns this appointment OR owns the marketplace
    const user = req.user;
    
    // Check if user is the appointment owner (client) OR marketplace owner
    const isAppointmentOwner = appointment.userId === user.id;
    
    // Check if user owns the marketplace for this appointment
    const marketplace = await Marketplace.findByPk(appointment.marketplaceId, {
      transaction,
    });
    
    const isMarketplaceOwner = marketplace && marketplace.userId === user.id;
    
    if (!isAppointmentOwner && !isMarketplaceOwner) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        message: "You can only update appointments for your own bookings or your marketplace.",
      });
    }

    // Step 4: Update the appointment's status
    appointment.status = status;
    appointment.updatedAt = new Date(); // Update timestamp
    await appointment.save({ transaction });

    // Step 4: Commit transaction
    await transaction?.commit();

    const activeStatuses = ["pending", "postponed", "availed"];
    const isNowActive = activeStatuses.includes(status);
    const wasActive = activeStatuses.includes(previousStatus);

    if (!isNowActive && wasActive) {
      await WaitlistService.processSlotAvailability(appointment.marketplaceId, appointment.dateTime);
    }

    if (isNowActive) {
      await WaitlistService.clearSlotWaitlist(appointment.marketplaceId, appointment.dateTime, appointment.id);
    }

    // Step 5: Fetch the updated appointment with full includes for response
    const updatedAppointment = await Appointment.findByPk(appointmentId, {
      // ? Enable only if needed
      // include: [
      //   { model: User, as: "user" },
      //   {
      //     model: Service,
      //     as: "services",
      //     through: {
      //       attributes: [],
      //     },
      //   },
      // ],
      transaction: undefined,
    });

    if (!updatedAppointment) {
      return res.status(200).json({
        status: false,
        message: "Failed to retrieve updated appointment.",
      });
    }

    // No confirmation email on status change — emails only fire on booking create
    // (client self-book or provider/owner/TM book-for-client).

    return res.status(200).json({
      status: true,
      message: `Appointment paymentStatus updated successfully to ${status}.`,
      data: updatedAppointment.toJSON(),
    });
  } catch (err: any) {
    await transaction?.rollback();
    console.error("Error updating appointment paymentStatus:", err);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${err.message || err}`,
    });
  }
};

//* ===================== UPDATE APPOINTMENT PRICE ====================

export const updateAppointmentPrice = async (
  req: any,
  res: Response
): Promise<Response> => {
  const transaction = await Appointment.sequelize?.transaction();
  try {
    const { appointmentId, price } = req.body;

    // Step 1: Validate essential fields
    if (!appointmentId || typeof price !== "number") {
      await transaction?.rollback();
      return res.status(200).json({
        status: false,
        message:
          "Missing required fields: appointmentId (route param) and price (positive number).",
      });
    }

    // Validate price is positive
    if (price <= 0) {
      await transaction?.rollback();
      return res.status(400).json({
        status: false,
        message: "price must be a valid positive number.",
      });
    }

    // Step 2: Find the appointment
    const appointment = await Appointment.findByPk(appointmentId, {
      transaction,
    });

    if (!appointment) {
      await transaction?.rollback();
      return res.status(404).json({
        status: false,
        message: "Appointment not found.",
      });
    }

    // Step 3: Verify user owns this appointment
    const user = req.user;
    if (appointment.userId !== user.id) {
      await transaction?.rollback();
      return res.status(403).json({
        status: false,
        message: "You can only update your own appointments.",
      });
    }

    // Step 4: Update the appointment's price
    appointment.price = price;
    appointment.updatedAt = new Date(); // Update timestamp
    await appointment.save({ transaction });

    // Step 4: Commit transaction
    await transaction?.commit();

    // Step 5: Fetch the updated appointment with full includes for response
    const updatedAppointment = await Appointment.findByPk(appointmentId, {
      // ? Enable only if needed
      // include: [
      //   { model: User, as: "user" }, // Full user object
      //   { model: Marketplace, as: "marketplace" }, // Full marketplace
      //   {
      //     model: Service,
      //     as: "services",
      //     through: {
      //       attributes: [], // No additional attributes in junction table
      //     },
      //   },
      // ],
      transaction: undefined, // No transaction for read
    });

    if (!updatedAppointment) {
      return res.status(500).json({
        status: false,
        message: "Failed to retrieve updated appointment.",
      });
    }

    return res.status(200).json({
      status: true,
      message: `Appointment price updated successfully to ${price}.`,
      data: updatedAppointment.toJSON(), // Full details with associations
    });
  } catch (err: any) {
    await transaction?.rollback();
    console.error("Error updating appointment price:", err);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${err.message || err}`,
    });
  }
};

/** Authenticated client: fetch one of their appointments by id (email deep links). */
export const getClientAppointmentById = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;
    const { appointmentId } = req.params;

    if (!userId || !appointmentId) {
      return res.status(400).json({
        status: false,
        message: "Authentication and appointmentId are required.",
      });
    }

    const appointment = await Appointment.findOne({
      where: { id: appointmentId, userId },
      include: [
        {
          model: Marketplace,
          as: "marketplace",
          attributes: [
            "id",
            "businessName",
            "phoneNumber",
            "address",
            "latitude",
            "longitude",
            "imagesList",
            "userId",
            "customLink",
          ],
          include: [
            {
              model: Social,
              as: "socials",
              attributes: ["id", "insta", "tiktok", "facebook", "googlePlaceId"],
            },
          ],
        },
        {
          model: Service,
          as: "services",
          through: { attributes: [] },
          attributes: ["id", "name", "description", "price", "duration"],
        },
        {
          model: User,
          as: "assignedTeamMember",
          attributes: ["id", "name", "profilePic"],
          required: false,
        },
      ],
    });

    if (!appointment) {
      return res.status(404).json({
        status: false,
        message: "Appointment not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Appointment fetched successfully.",
      data: appointment.toJSON(),
    });
  } catch (err: any) {
    console.error("Error fetching client appointment by id:", err);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${err.message || err}`,
    });
  }
};

// Get user's appointments (client-specific)
export const getUserAppointments = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user.id;
    const { page = "1", limit = "10", status } = req.query;

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Build where clause
    const whereClause: any = { userId };
    if (status) {
      whereClause.status = status;
    }

    // Fetch user's appointments with includes
    const { count, rows: appointments } = await Appointment.findAndCountAll({
      where: whereClause,
      include: [
        { 
          model: Marketplace, 
          as: "marketplace",
          attributes: ["id", "businessName", "phoneNumber", "address", "latitude", "longitude", "imagesList", "userId"],
          include: [
            {
              model: Social,
              as: "socials",
              attributes: ["id", "insta", "tiktok", "facebook", "googlePlaceId"]
            }
          ]
        },
        {
          model: Service,
          as: "services",
          through: {
            attributes: [], // No additional attributes in junction table
          },
          attributes: ["id", "name", "description", "price", "duration"]
        },
      ],
      limit: limitNum,
      offset,
      order: [["dateTime", "DESC"]], // Sort by dateTime descending (newest first)
    });

    return res.status(200).json({
      status: true,
      message: `User appointments fetched successfully.`,
      data: {
        appointments: appointments.map((apt) => apt.toJSON()),
        pagination: {
          total: count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(count / limitNum),
        },
      },
    });
  } catch (err: any) {
    console.error("Error fetching user appointments:", err);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${err.message || err}`,
    });
  }
};
