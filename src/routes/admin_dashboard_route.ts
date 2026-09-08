import { Router } from "express";
import {
  getDashboardStats,
  getCalendarInsights,
} from "../controllers/admin_dashboard_controller";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticateToken, requireRole("admin"));

router.get("/stats", getDashboardStats);
router.get("/calendar-insights", getCalendarInsights);

export default router;
