import nodemailer from 'nodemailer';

export class PasswordResetService {
  private static createTransporter() {
    return nodemailer.createTransport({
      host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
      port: parseInt(process.env.BREVO_SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.BREVO_SMTP_LOGIN,
        pass: process.env.BREVO_SMTP_KEY,
      },
    });
  }

  static async sendOtpEmail(email: string, name: string | null, otp: string): Promise<void> {
    const transporter = this.createTransporter();
    const verifiedSender = process.env.BREVO_VERIFIED_SENDER || 'info@booqlyapp.com';
    const greetingName = name && name.trim() !== '' ? name : 'there';

    const mailOptions = {
      from: `"Booqly" <${verifiedSender}>`,
      to: email,
      subject: 'Your Booqly password reset code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Password Reset Code</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #759CC9; color: white; padding: 24px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { background: #F6FBFF; padding: 28px; border: 1px solid #E4E7EC; }
            .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0E1724; background: #fff; border: 1px solid #E4E7EC; border-radius: 6px; padding: 16px; text-align: center; margin: 20px 0; }
            .footer { background: #f9f9f9; padding: 16px 20px; text-align: center; font-size: 12px; color: #667085; border-radius: 0 0 8px 8px; border: 1px solid #E4E7EC; border-top: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Reset Your Password</h1>
            </div>
            <div class="content">
              <p>Hi ${greetingName},</p>
              <p>Use the code below to reset your Booqly password. This code expires in 10 minutes.</p>
              <div class="otp-code">${otp}</div>
              <p>If you didn't request this, you can safely ignore this email - your password won't be changed.</p>
            </div>
            <div class="footer">
              <p>This is an automated message from Booqly.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${greetingName},\n\nYour Booqly password reset code is: ${otp}\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore this email.`,
    };

    await transporter.sendMail(mailOptions);
  }
}
