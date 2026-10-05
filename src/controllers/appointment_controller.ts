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
import { StripeService } from "../services/stripe.service";
import {
  getBookingScope,
  getTeamMemberPermissionsForUser,
} from "../utils/team_member_permission_helper";

interface CreateAppointmentData {
  marketplaceId: string;
  dateTime: string; // ISO string
  paymentStatus?: "pending" | "paid" | "failed" | "refunded" | "partially_paid";
  price: number;
  depositAmount?: number;
  remainingBalance?: number;
  assignedTeamMemberId?: string;
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
    const { marketplaceId, dateTime, paymentStatus, price, services, depositAmount, remainingBalance, assignedTeamMemberId } =
      req.body as CreateAppointmentData;

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

    // Validate dateTime is in the future
    const appointmentDate = new Date(dateTime);
    if (isNaN(appointmentDate.getTime()) || appointmentDate <= new Date()) {
      await transaction?.rollback();
      return res.status(200).json({
        status: false,
        message:
          "The provided dateTime must be a valid ISO date set in the future (from today onwards).",
      });
    }

    const isSlotOccupied = await WaitlistService.isSlotOccupied(marketplaceId, appointmentDate);
    if (isSlotOccupied) {
      const waitlistSettings = await WaitlistService.getMarketplaceSettings(marketplaceId);
      await transaction?.rollback();
      return res.status(409).json({
        status: false,
        message: "This slot is fully booked. Join the waitlist to be notified if it opens.",
        data: {
          waitlistEnabled: waitlistSettings.waitlistEnabled,
        },
      });
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
    // Find the provider (user) who owns this marketplace
    const provider = await User.findOne({
      where: { marketplaceId: marketplaceId },
      transaction,
    });
    
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

    // Validate assigned team member against the primary service providers (if any).
    let resolvedAssignedTeamMemberId: string | null = null;
    const primaryService = validServices.find(
      (s) => s.id === services[0].serviceId
    ) || validServices[0];
    const serviceProviderIds = (primaryService.providerTeamMemberIds || []).map(
      String
    );

    if (serviceProviderIds.length > 0) {
      if (!assignedTeamMemberId) {
        await transaction?.rollback();
        return res.status(400).json({
          status: false,
          message: "Please select a service provider for this service.",
        });
      }
      if (!serviceProviderIds.includes(String(assignedTeamMemberId))) {
        await transaction?.rollback();
        return res.status(400).json({
          status: false,
          message: "Selected service provider is not assigned to this service.",
        });
      }
      const assignedMember = await User.findOne({
        where: {
          id: assignedTeamMemberId,
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
        paymentStatus: paymentStatus ?? "pending",
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
        { model: User, as: "user" }, // Full user object
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

    // Validate new dateTime is in the future
    const newAppointmentDate = new Date(dateTime);
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
      message: `Appointment dateTime updated successfully to ${newAppointmentDate.toISOString()}.`,
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
