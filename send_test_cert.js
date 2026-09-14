import dotenv from 'dotenv';
dotenv.config();

import { generateCertificateBuffer } from './src/services/certificateService.js';
import { sendCertificateEmail } from './src/services/mailService.js';

async function sendTest() {
  const recipientName = 'Kundan Kumar';
  const recipientEmail = 'kundanbth133@gmail.com';
  const teamName = 'IdeaJam Team';

  console.log(`🎨 1. Generating personalized certificate for ${recipientName}...`);
  const certBuffer = await generateCertificateBuffer(recipientName);
  console.log(`✅ Certificate generated successfully (${certBuffer.length} bytes)`);

  console.log(`📧 2. Sending email with certificate to ${recipientEmail}...`);
  const result = await sendCertificateEmail({
    recipientName,
    recipientEmail,
    teamName,
    certificateBuffer: certBuffer,
  });

  if (result.success) {
    console.log(`\n🎉 CERTIFICATE SENT SUCCESSFULLY TO ${recipientEmail}!`);
    console.log('Message ID:', result.messageId);
  } else {
    console.error(`\n❌ Failed to send certificate:`, result.error || result.reason);
  }
}

sendTest().catch((err) => {
  console.error('Execution error:', err);
  process.exit(1);
});
