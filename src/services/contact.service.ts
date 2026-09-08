import nodemailer from 'nodemailer';

interface ContactEmailData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export class ContactService {
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

  static async sendContactEmail(data: ContactEmailData): Promise<void> {
    const transporter = this.createTransporter();

    const recipientEmail = process.env.CONTACT_RECIPIENT_EMAIL || 'support@booqlyapp.com';
    const verifiedSender = process.env.BREVO_VERIFIED_SENDER || 'info@booqlyapp.com';

    console.log(`[ContactService] Sending email to: ${recipientEmail} via Brevo SMTP`);
    console.log(`[ContactService] SMTP Host: ${process.env.BREVO_SMTP_HOST}`);
    console.log(`[ContactService] SMTP Login set: ${!!process.env.BREVO_SMTP_LOGIN}`);
    console.log(`[ContactService] SMTP Key set: ${!!process.env.BREVO_SMTP_KEY}`);

    const mailOptions = {
      from: `"Booqly" <${verifiedSender}>`,
      to: recipientEmail,
      replyTo: data.email,
      subject: `[Booqly Contact] ${data.subject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>New Contact Message</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #759CC9; color: white; padding: 24px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { background: #F6FBFF; padding: 28px; border: 1px solid #E4E7EC; }
            .field { margin-bottom: 20px; }
            .field-label { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #759CC9; letter-spacing: 0.05em; margin-bottom: 4px; }
            .field-value { font-size: 15px; color: #0E1724; background: #fff; border: 1px solid #E4E7EC; border-radius: 6px; padding: 10px 14px; }
            .message-value { white-space: pre-wrap; }
            .footer { background: #f9f9f9; padding: 16px 20px; text-align: center; font-size: 12px; color: #667085; border-radius: 0 0 8px 8px; border: 1px solid #E4E7EC; border-top: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Contact Message</h1>
            </div>
            <div class="content">
              <div class="field">
                <div class="field-label">From</div>
                <div class="field-value">${data.name}</div>
              </div>
              <div class="field">
                <div class="field-label">Email</div>
                <div class="field-value">${data.email}</div>
              </div>
              <div class="field">
                <div class="field-label">Subject</div>
                <div class="field-value">${data.subject}</div>
              </div>
              <div class="field">
                <div class="field-label">Message</div>
                <div class="field-value message-value">${data.message}</div>
              </div>
            </div>
            <div class="footer">
              <p>This message was sent via the Booqly website contact form at booqlyapp.com</p>
              <p>Reply directly to this email to respond to ${data.name}.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `New Contact Message from Booqly Website\n\nFrom: ${data.name}\nEmail: ${data.email}\nSubject: ${data.subject}\n\nMessage:\n${data.message}`,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`[ContactService] Email sent successfully. MessageId: ${info.messageId}`);
    } catch (smtpError: any) {
      console.error(`[ContactService] SMTP Error: ${smtpError.message}`);
      console.error(`[ContactService] SMTP Error Code: ${smtpError.code}`);
      console.error(`[ContactService] SMTP Response: ${smtpError.response}`);
      throw smtpError;
    }
  }
}
