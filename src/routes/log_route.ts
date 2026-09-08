import { Router } from "express";
import {
  getLogs,
  getLogStats,
  getRecentErrors,
  cleanupLogs
} from "../controllers/log.controller";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware";

const router = Router();

// Get logs with filtering and pagination
router.get(
  "/logs",
  authenticateToken,
  getLogs
);

// Get log statistics
router.get(
  "/logs/stats",
  authenticateToken,
  getLogStats
);

// Get recent errors
router.get(
  "/logs/errors",
  authenticateToken,
  getRecentErrors
);

// Cleanup old logs
router.delete(
  "/logs/cleanup",
  authenticateToken,
  cleanupLogs
);

export default router;
