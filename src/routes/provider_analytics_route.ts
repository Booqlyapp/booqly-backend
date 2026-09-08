import express from 'express';
import {
  getProviderAnalytics,
  getAnalyticsOverview,
  getEarningsSummary,
  checkAnalyticsAccess,
  getDashboardSummary,
} from '../controllers/provider_analytics.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = express.Router();

/**
 * @route   GET /provider-analytics/access
 * @desc    Check analytics access level
 * @access  Private (Solo/Suite providers)
 */
router.get('/access', authenticateToken, checkAnalyticsAccess);

/**
 * @route   GET /provider-analytics/:marketplaceId/dashboard
 * @desc    Get dashboard summary (earnings, upcoming, top service, booking stats, revenue by service)
 * @access  Private (All providers)
 */
router.get('/:marketplaceId/dashboard', authenticateToken, getDashboardSummary);

/**
 * @route   GET /provider-analytics/:marketplaceId
 * @desc    Get provider analytics (Basic or Advanced based on subscription)
 * @access  Private (Solo Pro/Premium, Suite owners)
 * @query   startDate, endDate (optional)
 */
router.get('/:marketplaceId', authenticateToken, getProviderAnalytics);

/**
 * @route   GET /provider-analytics/:marketplaceId/overview
 * @desc    Get analytics overview (summary stats)
 * @access  Private (Solo Pro/Premium, Suite owners)
 */
router.get('/:marketplaceId/overview', authenticateToken, getAnalyticsOverview);

/**
 * @route   GET /provider-analytics/:marketplaceId/earnings
 * @desc    Get earnings summary (today, this week, this month)
 * @access  Private (Solo Pro/Premium, Suite owners)
 */
router.get('/:marketplaceId/earnings', authenticateToken, getEarningsSummary);

export default router;
