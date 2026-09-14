import dotenv from 'dotenv';
dotenv.config();

import nodemailer from 'nodemailer';

async function testEmail() {
  const emailUser = process.env.EMAIL_USER ? process.env.EMAIL_USER.trim() : '';
  const emailPass = process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/[-\s]/g, '').trim() : '';

  console.log('--------------------------------------------------');
  console.log('🔍 Testing Nodemailer Email Connection...');
  console.log('📧 EMAIL_USER:', emailUser);
  console.log('🔑 Passkey Characters Count:', emailPass.length);
  console.log('--------------------------------------------------');

  if (!emailUser || !emailPass) {
    console.log('❌ Error: EMAIL_USER or EMAIL_PASS is empty in .env');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });

  try {
    await transporter.verify();
    console.log('🎉 SUCCESS! Your Google App Password is 100% WORKING and connected to Gmail SMTP!');
    console.log('Emails will now be delivered to all registered teams and members automatically.');
  } catch (err) {
    console.error('❌ Google SMTP Error:', err.message);
    if (err.message.includes('535') || err.message.includes('BadCredentials')) {
      console.log('\n💡 Why this failed: Google rejected this login as BadCredentials.');
      console.log('1. Make sure 2-Step Verification is ON in your Google Account: https://myaccount.google.com/security');
      console.log('2. Generate a fresh 16-letter App Password from: https://myaccount.google.com/apppasswords');
      console.log('3. Put that exact email in EMAIL_USER and 16-letter code in EMAIL_PASS in .env');
    }
  }
}

testEmail();
