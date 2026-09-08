import { Notification } from '../models/notification_model';
import { User } from '../models/user_model';
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
// import twilio from 'twilio'; // Uncomment when Twilio is configured

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

interface NotificationData {
  userId: string;
  type: 'booking_confirmation' | 'booking_reminder' | 'message' | 'review' | 'payment' | 'subscription' | 'review_response' | 'identity_verified' | 'identity_rejected';
  title: string;
  content: string;
  data?: any;
  channels?: {
    push?: boolean;
    sms?: boolean;
    email?: boolean;
    in_app?: boolean;
  };
}

export class NotificationService {
  private static firebaseInitialized = false;

  private static ensureFirebaseInitialized(): void {
    if (this.firebaseInitialized || admin.apps.length > 0) {
      this.firebaseInitialized = true;
      return;
    }

    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      });
      this.firebaseInitialized = true;
      console.log('Firebase Admin initialized for push notifications');
    } catch (error) {
      console.error('Failed to initialize Firebase Admin:', error);
    }
  }

  private static toFirebaseData(data?: any): Record<string, string> {
    if (!data || typeof data !== 'object') {
      return {};
    }

    const payload: Record<string, string> = {};
    Object.entries(data).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        return;
      }
      payload[key] = typeof value === 'string' ? value : JSON.stringify(value);
    });
    return payload;
  }
  
  /**
   * Create and send notification
   */
  static async createNotification(notificationData: NotificationData): Promise<Notification> {
    try {
      // Create notification in database
      const notification = await Notification.create({
        userId: notificationData.userId,
        type: notificationData.type,
        title: notificationData.title,
        content: notificationData.content,
        data: notificationData.data || {},
        channels: notificationData.channels || {
          push: true,
          sms: false,
          email: false,
          in_app: true,
        },
        isRead: false,
      });

      // Send notification through enabled channels
      await this.sendNotification(notification);

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw new Error('Failed to create notification');
    }
  }

  /**
   * Send notification through various channels
   */
  private static async sendNotification(notification: Notification): Promise<void> {
    try {
      const user = await User.findByPk(notification.userId);
      if (!user) return;

      const channels = notification.channels as any;

      // Send email notification
      if (channels.email && user.email) {
        await this.sendEmailNotification(user, notification);
      }

      // Send SMS notification
      if (channels.sms && user.phone) {
        await this.sendSMSNotification(user, notification);
      }

      // Send push notification
      if (channels.push) {
        await this.sendPushNotification(user, notification);
      }

      // Update sent timestamp
      await notification.update({ sentAt: new Date() });
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  /**
   * Send email notification
   */
  private static async sendEmailNotification(user: User, notification: Notification): Promise<void> {
    try {
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log('Email credentials not configured, skipping email notification');
        return;
      }

      const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });

      const mailOptions = {
        from: `"Booqly" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: notification.title,
        html: this.generateEmailTemplate(notification),
      };

      await transporter.sendMail(mailOptions);
      console.log(`Email notification sent to ${user.email}`);
    } catch (error) {
      console.error('Error sending email notification:', error);
    }
  }

  /**
   * Send SMS notification
   */
  private static async sendSMSNotification(user: User, notification: Notification): Promise<void> {
    try {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        console.log('Twilio credentials not configured, skipping SMS notification');
        return;
      }

      // Uncomment when Twilio is configured
      /*
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      
      await client.messages.create({
        body: `${notification.title}: ${notification.content}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: user.phone,
      });
      
      console.log(`SMS notification sent to ${user.phone}`);
      */
      console.log(`SMS notification would be sent to ${user.phone}: ${notification.content}`);
    } catch (error) {
      console.error('Error sending SMS notification:', error);
    }
  }

  /**
   * Send push notification
   */
  private static async sendPushNotification(user: User, notification: Notification): Promise<void> {
    try {
      if (!user.fcmToken) {
        console.log(`Push notification skipped for user ${user.id}: no FCM token`);
        return;
      }

      this.ensureFirebaseInitialized();
      if (!this.firebaseInitialized) {
        return;
      }

      await admin.messaging().send({
        token: user.fcmToken,
        notification: {
          title: notification.title,
          body: notification.content,
        },
        data: this.toFirebaseData(notification.data),
      });

      console.log(`Push notification sent to user ${user.id}`);
    } catch (error) {
      console.error('Error sending push notification:', error);

      // Invalidate bad tokens so future sends don't keep failing.
      if (
        error instanceof Error &&
        (error.message.includes('registration-token-not-registered') ||
          error.message.includes('invalid-registration-token'))
      ) {
        await user.update({ fcmToken: null });
      }
    }
  }

  /**
   * Generate email template
   */
  private static generateEmailTemplate(notification: Notification): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${notification.title}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #6366f1; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Booqly</h1>
          </div>
          <div class="content">
            <h2>${notification.title}</h2>
            <p>${notification.content}</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Booqly. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get user notifications with pagination
   */
  static async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    unreadOnly: boolean = false
  ) {
    try {
      const offset = (page - 1) * limit;
      const whereClause: any = { userId };
      
      if (unreadOnly) {
        whereClause.isRead = false;
      }

      const { count, rows: notifications } = await Notification.findAndCountAll({
        where: whereClause,
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      return {
        notifications,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      };
    } catch (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      await Notification.update(
        { isRead: true },
        {
          where: {
            id: notificationId,
            userId,
          },
        }
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for user
   */
  static async markAllAsRead(userId: string): Promise<void> {
    try {
      await Notification.update(
        { isRead: true },
        {
          where: {
            userId,
            isRead: false,
          },
        }
      );
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Get unread notification count
   */
  static async getUnreadCount(userId: string): Promise<number> {
    try {
      return await Notification.count({
        where: {
          userId,
          isRead: false,
        },
      });
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Schedule appointment reminders
   */
  static async scheduleAppointmentReminders(appointmentId: string, appointmentDateTime: Date): Promise<void> {
    try {
      // This would typically use a job queue like Bull or Agenda
      // For now, we'll create the notifications immediately
      
      const reminderTimes = [
        { hours: 24, title: '24 Hour Reminder' },
        { hours: 1, title: '1 Hour Reminder' },
      ];

      for (const reminder of reminderTimes) {
        const reminderTime = new Date(appointmentDateTime.getTime() - (reminder.hours * 60 * 60 * 1000));
        
        if (reminderTime > new Date()) {
          // In a real implementation, you'd schedule this with a job queue
          console.log(`Would schedule ${reminder.title} for appointment ${appointmentId} at ${reminderTime}`);
        }
      }
    } catch (error) {
      console.error('Error scheduling appointment reminders:', error);
    }
  }
}
