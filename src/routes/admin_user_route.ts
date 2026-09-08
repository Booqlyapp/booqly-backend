import { Router } from "express";
import {
  listUsers,
  getUserByIdAdmin,
  updateUserByAdmin,
  deleteUserByAdmin,
  getUserBookingHistoryAdmin,
} from "../controllers/admin_user_controller";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware";
import { validate, validateQuery, validateUUID, schemas } from "../middlewares/validation.middleware";

const router = Router();

router.use(authenticateToken, requireRole("admin"));

// List users (paginated, filterable, searchable)
router.get("/", validateQuery(schemas.adminListUsers), listUsers);

// Get a single user
router.get("/:id", validateUUID("id"), getUserByIdAdmin);

// Get a user's booking history (client bookings made, or provider bookings received)
router.get(
  "/:id/bookings",
  validateUUID("id"),
  validateQuery(schemas.adminUserBookingHistory),
  getUserBookingHistoryAdmin
);

// Update a user
router.put("/:id", validateUUID("id"), validate(schemas.adminUpdateUser), updateUserByAdmin);

// Delete a user (soft delete by default, ?force=true to hard delete)
router.delete("/:id", validateUUID("id"), deleteUserByAdmin);

export default router;
