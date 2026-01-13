import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

async function main() {
  const to = process.argv[2] || process.env.SMTP_USER;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('SMTP_USER or SMTP_PASS is not set. Please set them in apps/api/.env or environment.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: 'Calibration-system test email',
      text: 'This is a test email sent from the calibration-system test script.',
    });

    console.log('Test email sent:', info.messageId || info);
  } catch (err) {
    console.error('Failed to send test email:', err);
    process.exit(2);
  }
}

main();
