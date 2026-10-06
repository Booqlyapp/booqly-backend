import { Router } from "express";
import {
  createBlockedTime,
  getBlockedTimes,
} from "../controllers/blocked_time_controller";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware";

const router = Router();

router.post(
  "/",
  authenticateToken,
  requireRole(["solo", "suite"]),
  createBlockedTime
);
router.get(
  "/",
  authenticateToken,
  requireRole(["solo", "suite"]),
  getBlockedTimes
);

export default router;
