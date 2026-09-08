import { Router } from "express";
import {
  createAppointment,
  createAppointmentPaymentIntent,
  getAppointments,
  getUserAppointments,
  markAppointmentPaidInCash,
  updateAppointmentDateTime,
  updateAppointmentPaymentStatus,
  updateAppointmentPrice,
  updateAppointmentStatus,
} from "../controllers/appointment_controller";
import { authenticateToken, requireVerification } from "../middlewares/auth.middleware";
import { requireClientIdentityDocument } from "../middlewares/client-verification.middleware";

const router = Router();

router.post("/create-new-appointment", authenticateToken, requireClientIdentityDocument, createAppointment);
router.post("/:appointmentId/payment-intent", authenticateToken, createAppointmentPaymentIntent);
router.get("/get-appointments", authenticateToken, getAppointments);
router.get("/get-user-appointments", authenticateToken, getUserAppointments);
router.put("/update-appointment-date-time", authenticateToken, updateAppointmentDateTime);
router.put(
  "/update-appointment-payment-status",
  authenticateToken,
  updateAppointmentPaymentStatus
);
router.put(
  "/mark-paid-in-cash",
  authenticateToken,
  markAppointmentPaidInCash
);
router.put("/update-appointment-status", authenticateToken, updateAppointmentStatus);
router.put("/update-status/:appointmentId", authenticateToken, updateAppointmentStatus);
router.put("/update-appointment-price", authenticateToken, updateAppointmentPrice);

export default router;
