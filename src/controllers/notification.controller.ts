import { Request, Response } from 'express';
import { NotificationService } from '../services/notification.service';

interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

/**
 * Get user notifications
 */
export const getUserNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    const result = await NotificationService.getUserNotifications(
      req.userId,
      parseInt(page as string),
      parseInt(limit as string),
      unreadOnly === 'true'
    );

    res.status(200).json({
      status: true,
      message: 'Notifications retrieved successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch notifications',
    });
  }
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const count = await NotificationService.getUnreadCount(req.userId);

    res.status(200).json({
      status: true,
      message: 'Unread count retrieved successfully',
      data: { unreadCount: count },
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch unread count',
    });
  }
};

/**
 * Mark notification as read
 */
export const markAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { notificationId } = req.params;

    await NotificationService.markAsRead(notificationId, req.userId);

    res.status(200).json({
      status: true,
      message: 'Notification marked as read',
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to mark notification as read',
    });
  }
};

/**
 * Mark all notifications as read
 */
export const markAllAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    await NotificationService.markAllAsRead(req.userId);

    res.status(200).json({
      status: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to mark all notifications as read',
    });
  }
};

/**
 * Create test notification (development only)
 */
export const createTestNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({
        status: false,
        message: 'Test notifications not available in production',
      });
      return;
    }

    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { type, title, content, data } = req.body;

    const notification = await NotificationService.createNotification({
      userId: req.userId,
      type: type || 'message',
      title: title || 'Test Notification',
      content: content || 'This is a test notification',
      data: data || {},
    });

    res.status(201).json({
      status: true,
      message: 'Test notification created successfully',
      data: notification,
    });
  } catch (error) {
    console.error('Error creating test notification:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to create test notification',
    });
  }
};
