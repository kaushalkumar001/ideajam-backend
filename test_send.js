import dotenv from 'dotenv';
dotenv.config();

import nodemailer from 'nodemailer';

async function testSendLiveMail() {
  const emailUser = process.env.EMAIL_USER ? process.env.EMAIL_USER.trim() : '';
  const emailPass = process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/[-\s]/g, '').trim() : '';

  console.log(`Connecting as: ${emailUser}`);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });

  try {
    console.log('Sending live test email to:', emailUser);
    const info = await transporter.sendMail({
      from: `"IdeaJam 2026" <${emailUser}>`,
      to: emailUser,
      subject: '🎉 Test Email: IdeaJam 2026 Nodemailer is WORKING!',
      html: '<h2>Congratulations!</h2><p>Your Nodemailer configuration with Google App Password is 100% active and working.</p>',
    });

    console.log('✅ TEST EMAIL SENT SUCCESSFULLY!');
    console.log('Message ID:', info.messageId);
  } catch (err) {
    console.error('❌ Error sending mail:', err.message);
  }
}

testSendLiveMail();
