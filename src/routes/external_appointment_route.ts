import { Router } from "express";
import {
  createExternalAppointment,
  getMarketplaceByCustomLink,
  getAvailableTimeSlots,
  getBookableDates,
  getOccupiedSlots,
  checkSlotAvailability,
  createExternalAppointmentWithDeposit,
  createDepositPaymentIntent,
  getExternalAppointments,
  getPublicExternalAppointmentById,
  cancelPublicExternalAppointment,
  reschedulePublicExternalAppointment,
  updateExternalAppointmentStatus,
  updateProviderExternalAppointment,
} from "../controllers/external_appointment_controller";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware";

const router = Router();

// Public routes (no authentication required)
router.post("/book", createExternalAppointment);
router.post("/book-with-deposit", createExternalAppointmentWithDeposit);
router.post("/create-payment-intent", createDepositPaymentIntent);
router.get("/marketplace/:customLink", getMarketplaceByCustomLink);
router.get("/available-slots", getAvailableTimeSlots);
router.get("/bookable-dates", getBookableDates);
router.get("/occupied-slots", getOccupiedSlots);
router.get("/check-slot-availability", checkSlotAvailability);
router.get("/external-appointments/:appointmentId", getPublicExternalAppointmentById);
router.post(
  "/external-appointments/:appointmentId/cancel",
  cancelPublicExternalAppointment
);
router.put(
  "/external-appointments/:appointmentId/reschedule",
  reschedulePublicExternalAppointment
);

// Protected routes (authentication required)
router.get("/external-appointments", authenticateToken, getExternalAppointments);
router.put("/update-external-appointment-status", authenticateToken, updateExternalAppointmentStatus);
router.put(
  "/update-provider-external-appointment",
  authenticateToken,
  requireRole(["solo", "suite"]),
  updateProviderExternalAppointment
);

export default router;
