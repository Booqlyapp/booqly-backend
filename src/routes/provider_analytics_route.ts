import express from "express";
import {
  getProviderAnalytics,
  getAnalyticsOverview,
  getEarningsSummary,
  checkAnalyticsAccess,
  getDashboardSummary,
  getPayoutHistory,
  getMetricDrilldown,
  getTeamMemberAnalyticsDetail,
  updateMonthlyRevenueGoal,
  getAnalyticsFilterOptions,
} from "../controllers/provider_analytics.controller";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware";

const router = express.Router();

router.get(
  "/access",
  authenticateToken,
  requireRole(["solo", "suite"]),
  checkAnalyticsAccess
);

router.get(
  "/:marketplaceId/filters",
  authenticateToken,
  requireRole(["solo", "suite"]),
  getAnalyticsFilterOptions
);

router.get(
  "/:marketplaceId/team/:teamMemberId",
  authenticateToken,
  requireRole(["suite"]),
  getTeamMemberAnalyticsDetail
);

router.get(
  "/:marketplaceId/dashboard",
  authenticateToken,
  requireRole(["solo", "suite"]),
  getDashboardSummary
);

router.get(
  "/:marketplaceId/overview",
  authenticateToken,
  requireRole(["solo", "suite"]),
  getAnalyticsOverview
);

router.get(
  "/:marketplaceId/earnings",
  authenticateToken,
  requireRole(["solo", "suite"]),
  getEarningsSummary
);

router.get(
  "/:marketplaceId/payouts",
  authenticateToken,
  requireRole(["solo", "suite"]),
  getPayoutHistory
);

router.get(
  "/:marketplaceId/drilldown",
  authenticateToken,
  requireRole(["solo", "suite"]),
  getMetricDrilldown
);

router.put(
  "/:marketplaceId/revenue-goal",
  authenticateToken,
  requireRole(["suite"]),
  updateMonthlyRevenueGoal
);

router.get(
  "/:marketplaceId",
  authenticateToken,
  requireRole(["solo", "suite"]),
  getProviderAnalytics
);

export default router;
