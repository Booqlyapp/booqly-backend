import { Request, Response } from 'express';
import { ContactService } from '../services/contact.service';

export class ContactController {
  static async sendContactMessage(req: Request, res: Response): Promise<void> {
    try {
      const { name, email, subject, message } = req.body;

      if (!name || !email || !subject || !message) {
        res.status(400).json({
          status: false,
          message: 'All fields are required: name, email, subject, message',
        });
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          status: false,
          message: 'Invalid email address',
        });
        return;
      }

      if (name.length > 100 || subject.length > 200 || message.length > 5000) {
        res.status(400).json({
          status: false,
          message: 'Input exceeds maximum allowed length',
        });
        return;
      }

      await ContactService.sendContactEmail({ name, email, subject, message });

      res.status(200).json({
        status: true,
        message: 'Your message has been sent successfully. We will get back to you soon.',
      });
    } catch (error) {
      console.error('Error sending contact email:', error);
      res.status(500).json({
        status: false,
        message: 'Failed to send message. Please try again later.',
      });
    }
  }
}
