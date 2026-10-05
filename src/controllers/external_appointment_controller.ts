import { Request, Response } from "express";
import { Op } from "sequelize";
import { ExternalAppointment } from "../models/external_appointment_model";
import { Appointment } from "../models/appointment_model";
import { Marketplace } from "../models/marketplace_model";
import { Service } from "../models/service_model";
import { Schedule } from "../models/schedule_model";
import { ServiceAddOn } from "../models/service_addon_model";
import { Review } from "../models/review_model";
import { User } from "../models/user_model";
import { StripeService } from "../services/stripe.service";
import { WaitlistService } from "../services/waitlist.service";
import Stripe from 'stripe';
import sequelize from "../config/database";
import {
  getBookingScope,
  getTeamMemberPermissionsForUser,
} from "../utils/team_member_permission_helper";

interface GetExternalAppointmentsQuery {
  marketplaceId: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  page?: string;
  limit?: string;
  sort?: string; // "asc" | "desc" by dateTime
}

// Create external appointment (public booking) - Supports multiple services with add-ons
export const createExternalAppointment = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const transaction = await sequelize.transaction();
  
  try {
    const {
      marketplaceId,
      services, // Required: Array of { serviceId, addOnIds: [] }
      firstName,
      lastName,
      email,
      phone,
      dateTime,
      price,
      depositAmount,
      remainingBalance,
      acceptedTerms,
      marketingConsent,
      notes,
    } = req.body;

    // Validation
    if (!marketplaceId || !services || !Array.isArray(services) || services.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        status: false,
        message: "Missing required fields. Services array is required.",
      });
    }

    if (!acceptedTerms) {
      await transaction.rollback();
      return res.status(400).json({
        status: false,
        message: "You must accept the terms and conditions",
      });
    }

    const bookingDateTime = new Date(dateTime);
    if (Number.isNaN(bookingDateTime.getTime())) {
      await transaction.rollback();
      return res.status(400).json({
        status: false,
        message: "dateTime must be a valid ISO date.",
      });
    }

    const slotOccupied = await WaitlistService.isSlotOccupied(marketplaceId, bookingDateTime);
    if (slotOccupied) {
      await transaction.rollback();
      return res.status(409).json({
        status: false,
        message: "This slot is fully booked.",
      });
    }

    const claimCheck = await WaitlistService.canPublicBookSlot(marketplaceId, bookingDateTime);
    if (!claimCheck.allowed) {
      await transaction.rollback();
      return res.status(403).json({
        status: false,
        message: claimCheck.message,
      });
    }

    // Verify marketplace exists
    const marketplace = await Marketplace.findOne({
      where: { id: marketplaceId, deletedAt: null },
      transaction,
    });

    if (!marketplace) {
      await transaction.rollback();
      return res.status(404).json({
        status: false,
        message: "Marketplace not found",
      });
    }

    // Verify all services exist and belong to marketplace
    const serviceIds = services.map((s: any) => s.serviceId);
    const foundServices = await Service.findAll({
      where: {
        id: { [Op.in]: serviceIds },
        marketplaceId: marketplaceId,
        deletedAt: null,
      },
      include: [
        {
          model: ServiceAddOn,
          as: 'addOns',
          where: { isActive: true, deletedAt: null },
          required: false,
        },
      ],
      transaction,
    });

    if (foundServices.length !== serviceIds.length) {
      await transaction.rollback();
      return res.status(404).json({
        status: false,
        message: "One or more services not found or don't belong to this marketplace",
      });
    }

    // Build servicesData array with snapshots
    const servicesData = services
      .map((serviceReq: any) => {
        const service = foundServices.find((s: any) => s.id === serviceReq.serviceId);
        if (!service) return null;

        const selectedAddOns = (serviceReq.addOnIds || [])
          .map((addOnId: string) => {
            const addOn = (service as any).addOns?.find((a: any) => a.id === addOnId);
            if (!addOn) return null;
            return {
              id: addOn.id,
              title: addOn.title,
              price: parseFloat(addOn.price),
            };
          })
          .filter((a: any) => a !== null);

        return {
          serviceId: service.id,
          serviceName: service.name,
          price: parseFloat(service.price as any),
          addOns: selectedAddOns.length > 0 ? selectedAddOns : undefined,
        };
      })
      .filter((s: any) => s !== null) as Array<{
        serviceId: string;
        serviceName: string;
        price: number;
        addOns?: Array<{ id: string; title: string; price: number }>;
      }>;

    // Create external appointment with servicesData
    const appointment = await ExternalAppointment.create({
      marketplaceId,
      servicesData: servicesData,
      firstName,
      lastName,
      email,
      phone,
      dateTime: bookingDateTime,
      status: "pending",
      price,
      depositAmount: depositAmount || null,
      remainingBalance: remainingBalance || null,
      depositPaid: false,
      acceptedTerms,
      marketingConsent: marketingConsent || false,
      notes: notes || null,
    }, { transaction });

    await transaction.commit();
  await WaitlistService.clearSlotWaitlist(marketplaceId, bookingDateTime);

    return res.status(201).json({
      status: true,
      message: "Appointment booked successfully! You will receive a confirmation email shortly.",
      data: appointment,
    });
  } catch (error: any) {
    await transaction.rollback();
    console.error("Error creating external appointment:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to create appointment",
      error: error.message,
    });
  }
};

// Get marketplace by custom link (public endpoint)
export const getMarketplaceByCustomLink = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { customLink } = req.params;

    if (!customLink) {
      return res.status(400).json({
        status: false,
        message: "Custom link is required",
      });
    }

    const marketplace = await Marketplace.findOne({
      where: {
        customLink: customLink.toLowerCase(),
        deletedAt: null,
      },
      include: [
        {
          model: Service,
          as: "services",
          where: { deletedAt: null },
          required: false,
          include: [
            {
              model: ServiceAddOn,
              as: "addOns",
              where: { deletedAt: null },
              required: false,
            },
          ],
        },
        {
          model: Schedule,
          as: "schedule",
          required: false,
        },
        {
          model: Review,
          as: "reviews",
          where: {
            status: "approved",
            isPublic: true,
          },
          required: false,
          include: [
            {
              model: User,
              as: "client",
              attributes: ["name", "profilePic"],
            },
          ],
          order: [["createdAt", "DESC"]],
          limit: 10,
        },
      ],
    });

    if (!marketplace) {
      return res.status(404).json({
        status: false,
        message: "Marketplace not found",
      });
    }

    // Process image URLs
    const processedMarketplace = {
      ...marketplace.toJSON(),
      imagesList: marketplace.imagesList?.map((img: string) => {
        if (img.startsWith('http')) return img;
        return `${process.env.BASE_URL || 'http://localhost:3000'}${img}`;
      }),
      portfolioImages: marketplace.portfolioImages?.map((img: string) => {
        if (img.startsWith('http')) return img;
        return `${process.env.BASE_URL || 'http://localhost:3000'}${img}`;
      }),
    };

    return res.status(200).json({
      status: true,
      message: "Marketplace retrieved successfully",
      data: processedMarketplace,
    });
  } catch (error: any) {
    console.error("Error fetching marketplace by custom link:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch marketplace",
      error: error.message,
    });
  }
};

// Get available time slots for a service on a specific date
export const getAvailableTimeSlots = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { marketplaceId, serviceId, date } = req.query;

    if (!marketplaceId || !serviceId || !date) {
      return res.status(400).json({
        status: false,
        message: "Missing required parameters",
      });
    }

    // Get marketplace schedule
    const marketplace = await Marketplace.findOne({
      where: { id: marketplaceId as string, deletedAt: null },
      include: [
        {
          model: Schedule,
          as: "schedule",
          required: false,
        },
      ],
    });

    const schedule = (marketplace as any).schedule;
    
    if (!marketplace || !schedule) {
      return res.status(404).json({
        status: false,
        message: "Marketplace or schedule not found",
      });
    }

    // Get service details for duration
    const service = await Service.findOne({
      where: { id: serviceId as string, deletedAt: null },
    });

    if (!service) {
      return res.status(404).json({
        status: false,
        message: "Service not found",
      });
    }

    const serviceDuration = typeof service.duration === 'string' ? parseInt(service.duration) : (service.duration || 60);

    // Get existing appointments for the date (both external and regular appointments)
    const startOfDay = new Date(date as string);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date as string);
    endOfDay.setHours(23, 59, 59, 999);

    // Query external appointments
    const externalAppointments = await ExternalAppointment.findAll({
      where: {
        marketplaceId: marketplaceId as string,
        dateTime: {
          [Op.gte]: startOfDay,
          [Op.lte]: endOfDay,
        },
        status: {
          [Op.in]: ["pending", "confirmed"],
        },
        deletedAt: null,
      },
    });

    // Query regular appointments (from the main Appointments table)
    // Note: Appointments table has different status values: pending, canceled, postponed, availed
    const regularAppointments = await Appointment.findAll({
      where: {
        marketplaceId: marketplaceId as string,
        dateTime: {
          [Op.gte]: startOfDay,
          [Op.lte]: endOfDay,
        },
        status: {
          [Op.in]: ["pending", "availed"],
        },
        deletedAt: null,
      },
    });

    // Combine both appointment types
    const existingAppointments = [...externalAppointments, ...regularAppointments];

    // Generate available time slots based on schedule
    // This is a simplified version - you may want to enhance this logic
    const timeSlots = generateTimeSlots(
      schedule,
      serviceDuration,
      existingAppointments,
      new Date(date as string)
    );

    return res.status(200).json({
      status: true,
      message: "Available time slots retrieved successfully",
      data: timeSlots,
    });
  } catch (error: any) {
    console.error("Error fetching available time slots:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch available time slots",
      error: error.message,
    });
  }
};

// Helper function to parse time string (e.g., "9:00 AM" to 24-hour format)
function parseTime(timeStr: string): { hour: number; minute: number } {
  const [time, period] = timeStr.trim().split(" ");
  const [hourStr, minuteStr] = time.split(":");
  let hour = parseInt(hourStr);
  const minute = parseInt(minuteStr);

  if (period === "PM" && hour !== 12) {
    hour += 12;
  } else if (period === "AM" && hour === 12) {
    hour = 0;
  }

  return { hour, minute };
}

// Helper function to generate time slots
function generateTimeSlots(
  schedule: any,
  serviceDuration: number,
  existingAppointments: any[],
  date: Date
): string[] {
  const slots: string[] = [];
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Map day of week to schedule property
  const dayMap: { [key: number]: string } = {
    0: "sunday",
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
    6: "saturday",
  };

  const daySchedule = schedule[dayMap[dayOfWeek]];
  
  // Check if the day is closed (handle both string and object formats)
  if (!daySchedule) {
    return slots;
  }
  
  // Handle object format: { isOpen: false } or { isOpen: true, startTime: "9:00 AM", endTime: "5:00 PM" }
  if (typeof daySchedule === 'object') {
    if (!daySchedule.isOpen || daySchedule.isOpen === false) {
      return slots;
    }
    // If it's an object with isOpen: true, we'll use startTime and endTime below
  }
  
  // Handle string format: "closed" or "9:00 AM - 5:00 PM"
  const dayScheduleStr = typeof daySchedule === 'string' ? daySchedule : `${daySchedule.startTime} - ${daySchedule.endTime}`;
  
  if (dayScheduleStr.toLowerCase() === "closed") {
    return slots;
  }

  // Parse schedule string format: "9:00 AM - 7:00 PM"
  const scheduleMatch = dayScheduleStr.match(/^(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM))$/i);
  
  if (!scheduleMatch) {
    console.error(`Invalid schedule format for ${dayMap[dayOfWeek]}: ${dayScheduleStr}`);
    return slots;
  }

  const startTimeStr = scheduleMatch[1];
  const endTimeStr = scheduleMatch[2];

  // Parse start and end times
  const { hour: startHour, minute: startMinute } = parseTime(startTimeStr);
  const { hour: endHour, minute: endMinute } = parseTime(endTimeStr);

  let currentTime = new Date(date);
  currentTime.setHours(startHour, startMinute, 0, 0);

  const endTime = new Date(date);
  endTime.setHours(endHour, endMinute, 0, 0);

  // Get current time to prevent booking in the past
  const now = new Date();

  // Generate slots every 15 minutes
  while (currentTime < endTime) {
    const slotEnd = new Date(currentTime.getTime() + serviceDuration * 60000);
    
    if (slotEnd <= endTime) {
      // Skip past time slots
      if (currentTime <= now) {
        currentTime = new Date(currentTime.getTime() + 15 * 60000);
        continue;
      }

      // Check if slot is available (not conflicting with existing appointments)
      const isAvailable = !existingAppointments.some((apt) => {
        const aptTime = new Date(apt.dateTime);
        return (
          currentTime < new Date(aptTime.getTime() + serviceDuration * 60000) &&
          slotEnd > aptTime
        );
      });

      if (isAvailable) {
        const hours = currentTime.getHours();
        const minutes = currentTime.getMinutes();
        const period = hours >= 12 ? "PM" : "AM";
        const displayHours = hours % 12 || 12;
        const timeString = `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
        slots.push(timeString);
      }
    }

    currentTime = new Date(currentTime.getTime() + 15 * 60000); // Add 15 minutes
  }

  return slots;
}

// Create external appointment with deposit payment
export const createExternalAppointmentWithDeposit = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const {
      marketplaceId,
      services, // Required: Array of {serviceId, addOnIds}
      firstName,
      lastName,
      email,
      phone,
      dateTime,
      price,
      depositAmount,
      remainingBalance,
      acceptedTerms,
      marketingConsent,
      notes,
      paymentMethodId,
    } = req.body;

    // Validation
    if (!marketplaceId || !services || !Array.isArray(services) || services.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Missing required fields. Services array is required.",
      });
    }

    if (!firstName || !lastName || !email || !phone || !dateTime || !price) {
      return res.status(400).json({
        status: false,
        message: "Missing required customer information",
      });
    }

    if (!acceptedTerms) {
      return res.status(400).json({
        status: false,
        message: "You must accept the terms and conditions",
      });
    }

    if (!depositAmount || !paymentMethodId) {
      return res.status(400).json({
        status: false,
        message: "Deposit amount and payment method are required",
      });
    }

    const bookingDateTime = new Date(dateTime);
    if (Number.isNaN(bookingDateTime.getTime())) {
      return res.status(400).json({
        status: false,
        message: "dateTime must be a valid ISO date.",
      });
    }

    const slotOccupied = await WaitlistService.isSlotOccupied(marketplaceId, bookingDateTime);
    if (slotOccupied) {
      return res.status(409).json({
        status: false,
        message: "This slot is fully booked.",
      });
    }

    const claimCheck = await WaitlistService.canPublicBookSlot(marketplaceId, bookingDateTime);
    if (!claimCheck.allowed) {
      return res.status(403).json({
        status: false,
        message: claimCheck.message,
      });
    }

    // Verify marketplace exists
    const marketplace = await Marketplace.findOne({
      where: { id: marketplaceId, deletedAt: null },
    });

    if (!marketplace) {
      return res.status(404).json({
        status: false,
        message: "Marketplace not found",
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

    // Verify all services exist and belong to marketplace
    const serviceIds = services.map((s: any) => s.serviceId);
    const foundServices = await Service.findAll({
      where: {
        id: { [Op.in]: serviceIds },
        marketplaceId: marketplaceId,
        deletedAt: null,
      },
      include: [
        {
          model: ServiceAddOn,
          as: 'addOns',
          where: { isActive: true, deletedAt: null },
          required: false,
        },
      ],
    });

    if (foundServices.length !== serviceIds.length) {
      return res.status(404).json({
        status: false,
        message: "One or more services not found",
      });
    }

    // Build servicesData array
    const servicesData = services
      .map((serviceReq: any) => {
        const service = foundServices.find((s: any) => s.id === serviceReq.serviceId);
        if (!service) return null;

        const selectedAddOns = (serviceReq.addOnIds || [])
          .map((addOnId: string) => {
            const addOn = (service as any).addOns?.find((a: any) => a.id === addOnId);
            if (!addOn) return null;
            return {
              id: addOn.id,
              title: addOn.title,
              price: parseFloat(addOn.price),
            };
          })
          .filter((a: any) => a !== null);

        return {
          serviceId: service.id,
          serviceName: service.name,
          price: parseFloat(service.price as any),
          addOns: selectedAddOns.length > 0 ? selectedAddOns : undefined,
        };
      })
      .filter((s: any) => s !== null) as Array<{
        serviceId: string;
        serviceName: string;
        price: number;
        addOns?: Array<{ id: string; title: string; price: number }>;
      }>;

    // Client is charged exactly the deposit amount. Stripe splits it:
    // 1.5% platform application fee, the rest transferred to the provider's
    // connected account.
    const totalCharge = Number(depositAmount);
    const platformFee = StripeService.calculateApplicationFeeAmount(Math.round(totalCharge * 100)) / 100;

    // Create Stripe Payment Intent (destination charge, split with the provider)
    const paymentIntent = await StripeService.createPaymentIntent(
      totalCharge,
      'usd',
      undefined,
      {
        marketplaceId,
        serviceIds: serviceIds.join(','),
        customerEmail: email,
        customerName: `${firstName} ${lastName}`,
        depositAmount: depositAmount.toString(),
        platformFee: platformFee.toFixed(2),
      },
      {
        accountId: provider.stripeConnectAccountId,
        applicationFeeAmount: Math.round(totalCharge * 100 * StripeService.PLATFORM_FEE_PERCENT),
      }
    );

    // Confirm the payment with the payment method
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });

    // Construct proper return URL with https scheme
    const frontendUrl = process.env.FRONTEND_URL || 'https://booqlyapp.com';
    const returnUrl = frontendUrl.startsWith('http') 
      ? `${frontendUrl}/book/${marketplace.customLink}/success`
      : `https://${frontendUrl}/book/${marketplace.customLink}/success`;

    console.log(`💳 Confirming payment with return URL: ${returnUrl}`);

    const confirmedPayment = await stripe.paymentIntents.confirm(paymentIntent.id, {
      payment_method: paymentMethodId,
      return_url: returnUrl,
    });

    if (confirmedPayment.status !== 'succeeded') {
      return res.status(400).json({
        status: false,
        message: "Payment failed. Please try again.",
        error: confirmedPayment.last_payment_error?.message,
      });
    }

    // Retrieve the payment intent with expanded charges
    const paymentWithCharges = await stripe.paymentIntents.retrieve(confirmedPayment.id, {
      expand: ['latest_charge'],
    });

    // Extract charge ID safely
    const chargeId = typeof paymentWithCharges.latest_charge === 'string' 
      ? paymentWithCharges.latest_charge 
      : paymentWithCharges.latest_charge?.id;

    console.log(`✅ Payment confirmed - Payment Intent: ${confirmedPayment.id}, Charge: ${chargeId}`);

    // Create external appointment with payment info and servicesData
    const appointment = await ExternalAppointment.create({
      marketplaceId,
      servicesData: servicesData,
      firstName,
      lastName,
      email,
      phone,
      dateTime: bookingDateTime,
      status: "pending",
      price,
      depositAmount,
      remainingBalance: remainingBalance || null,
      depositPaid: true,
      stripePaymentIntentId: confirmedPayment.id,
      stripeChargeId: chargeId || undefined,
      depositPaidAt: new Date(),
      acceptedTerms,
      marketingConsent: marketingConsent || false,
      notes: notes || null,
    });

    await WaitlistService.clearSlotWaitlist(marketplaceId, bookingDateTime);

    return res.status(201).json({
      status: true,
      message: "Appointment booked successfully! Deposit payment confirmed. You will receive a confirmation email shortly.",
      data: {
        appointment,
        payment: {
          id: confirmedPayment.id,
          amount: totalCharge,
          depositAmount,
          platformFee,
          providerAmount: totalCharge - platformFee,
          status: confirmedPayment.status,
        },
      },
    });
  } catch (error: any) {
    console.error("Error creating external appointment with deposit:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to create appointment",
      error: error.message,
    });
  }
};

// Create Payment Intent for deposit (returns client secret)
export const createDepositPaymentIntent = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { depositAmount, email, firstName, lastName, marketplaceId, serviceId } = req.body;

    if (!depositAmount || !email || !marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "Deposit amount, email, and marketplaceId are required",
      });
    }

    const marketplace = await Marketplace.findOne({ where: { id: marketplaceId, deletedAt: null } });
    if (!marketplace) {
      return res.status(404).json({ status: false, message: "Marketplace not found" });
    }

    const provider = await User.findOne({ where: { id: marketplace.userId as string } });
    if (!provider?.stripeConnectAccountId || !provider.stripeConnectChargesEnabled) {
      return res.status(400).json({
        status: false,
        message: "This provider hasn't finished payment setup yet. Please try again later.",
      });
    }

    // Client is charged exactly the deposit amount; Stripe splits it 1.5%
    // platform / 98.5% provider via the connected account.
    const totalCharge = Number(depositAmount);
    const platformFee = StripeService.calculateApplicationFeeAmount(Math.round(totalCharge * 100)) / 100;

    // Create Payment Intent
    const paymentIntent = await StripeService.createPaymentIntent(
      totalCharge,
      'usd',
      undefined,
      {
        marketplaceId,
        serviceId: serviceId || '',
        customerEmail: email,
        customerName: `${firstName || ''} ${lastName || ''}`,
        depositAmount: depositAmount.toString(),
        platformFee: platformFee.toFixed(2),
      },
      {
        accountId: provider.stripeConnectAccountId,
        applicationFeeAmount: Math.round(totalCharge * 100 * StripeService.PLATFORM_FEE_PERCENT),
      }
    );

    return res.status(200).json({
      status: true,
      message: "Payment intent created successfully",
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: totalCharge,
        depositAmount,
        platformFee,
        providerAmount: totalCharge - platformFee,
      },
    });
  } catch (error: any) {
    console.error("Error creating payment intent:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to create payment intent",
      error: error.message,
    });
  }
}

// Get external appointments for a marketplace
export const getExternalAppointments = async (
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
      limit = "50",
      sort = "asc",
    } = req.query as GetExternalAppointmentsQuery;

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
    now.setHours(0, 0, 0, 0);

    if (date) {
      // Case 1: Single day filter
      const dayStart = new Date(date);
      if (isNaN(dayStart.getTime())) {
        return res.status(200).json({
          status: false,
          message: "Invalid date format. Use ISO date string (e.g., '2023-10-15').",
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

    const requester = (req as any).user as User | undefined;
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

    // Fetch external appointments
    const { count, rows: externalAppointments } = await ExternalAppointment.findAndCountAll({
      where: whereClause,
      limit: limitNum,
      offset,
      order: [["dateTime", sortDirection]],
    });

    return res.status(200).json({
      status: true,
      message: date
        ? `External appointments fetched successfully for ${date}.`
        : startDate && endDate
        ? `External appointments fetched successfully from ${startDate} to ${endDate}.`
        : `External appointments fetched successfully from yesterday to 29 days onwards.`,
      data: {
        appointments: externalAppointments.map((apt) => apt.toJSON()),
        pagination: {
          total: count,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(count / limitNum),
        },
      },
    });
  } catch (err: any) {
    console.error("Error fetching external appointments:", err);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${err.message || err}`,
    });
  }
};

// Update external appointment status
export const updateExternalAppointmentStatus = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const { appointmentId, status } = req.body;

    // Validate required fields
    if (!appointmentId || !status) {
      return res.status(200).json({
        status: false,
        message: "appointmentId and status are required.",
      });
    }

    // Validate status value
    const validStatuses = ["pending", "confirmed", "canceled", "completed"];
    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(200).json({
        status: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Find the external appointment
    const externalAppointment = await ExternalAppointment.findByPk(appointmentId);
    
    if (!externalAppointment) {
      return res.status(200).json({
        status: false,
        message: "External appointment not found.",
      });
    }

    const previousStatus = externalAppointment.status;

    // Update the status
    await externalAppointment.update({ status: status.toLowerCase() });

    const activeStatuses = ["pending", "confirmed"];
    const isNowActive = activeStatuses.includes(status.toLowerCase());
    const wasActive = activeStatuses.includes(previousStatus);

    if (!isNowActive && wasActive) {
      await WaitlistService.processSlotAvailability(
        externalAppointment.marketplaceId,
        externalAppointment.dateTime
      );
    }

    if (isNowActive) {
      await WaitlistService.clearSlotWaitlist(
        externalAppointment.marketplaceId,
        externalAppointment.dateTime
      );
    }

    return res.status(200).json({
      status: true,
      message: `External appointment status updated to ${status}.`,
      data: {
        appointment: externalAppointment.toJSON(),
      },
    });
  } catch (err: any) {
    console.error("Error updating external appointment status:", err);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${err.message || err}`,
    });
  }
};
