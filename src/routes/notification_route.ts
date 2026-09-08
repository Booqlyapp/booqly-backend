import { Router } from 'express';
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createTestNotification,
} from '../controllers/notification.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validateUUID } from '../middlewares/validation.middleware';

const router = Router();

// All notification routes require authentication
router.use(authenticateToken);

// Get user notifications
router.get('/', getUserNotifications);

// Get unread notification count
router.get('/unread-count', getUnreadCount);

// Mark notification as read
router.put('/:notificationId/read', validateUUID('notificationId'), markAsRead);

// Mark all notifications as read
router.put('/read-all', markAllAsRead);

// Create test notification (development only)
router.post('/test', createTestNotification);

export default router;
