import { Router } from "express";
import {
  createExternalAppointment,
  getMarketplaceByCustomLink,
  getAvailableTimeSlots,
  getBookableDates,
  checkSlotAvailability,
  createExternalAppointmentWithDeposit,
  createDepositPaymentIntent,
  getExternalAppointments,
  updateExternalAppointmentStatus,
} from "../controllers/external_appointment_controller";
import { authenticateToken } from "../middlewares/auth.middleware";

const router = Router();

// Public routes (no authentication required)
router.post("/book", createExternalAppointment);
router.post("/book-with-deposit", createExternalAppointmentWithDeposit);
router.post("/create-payment-intent", createDepositPaymentIntent);
router.get("/marketplace/:customLink", getMarketplaceByCustomLink);
router.get("/available-slots", getAvailableTimeSlots);
router.get("/bookable-dates", getBookableDates);
router.get("/check-slot-availability", checkSlotAvailability);

// Protected routes (authentication required)
router.get("/external-appointments", authenticateToken, getExternalAppointments);
router.put("/update-external-appointment-status", authenticateToken, updateExternalAppointmentStatus);

export default router;
