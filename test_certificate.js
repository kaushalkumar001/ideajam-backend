import { generateCertificateBuffer } from './src/services/certificateService.js';
import { getCertificateEmailTemplate, sendCertificateEmail } from './src/services/mailService.js';
import fs from 'fs';

async function runVerification() {
  console.log('--- 1. Testing Certificate Generation ---');
  const sampleName = 'Munaza Hilal';
  const buffer = await generateCertificateBuffer(sampleName);
  
  if (buffer && buffer.length > 0) {
    console.log(`✅ Certificate generated successfully for "${sampleName}" (${buffer.length} bytes)`);
  } else {
    throw new Error('Certificate buffer is empty!');
  }

  console.log('\n--- 2. Testing Email Template Generation ---');
  const templateHtml = getCertificateEmailTemplate({
    recipientName: sampleName,
    teamName: 'Vision of victory',
  });

  if (templateHtml.includes(sampleName) && templateHtml.includes('Vision of victory') && templateHtml.includes('cid:certificateImage')) {
    console.log('✅ Certificate email HTML template generated correctly with inline CID attachment & participant details.');
  } else {
    throw new Error('Email template missing required elements!');
  }

  console.log('\n--- 3. Testing Certificate Dispatch Function ---');
  const sendRes = await sendCertificateEmail({
    recipientName: sampleName,
    recipientEmail: 'test@example.com',
    teamName: 'Vision of victory',
    certificateBuffer: buffer,
  });
  console.log('Certificate email dispatch test result:', sendRes);

  console.log('\n🎉 ALL CERTIFICATE VERIFICATION CHECKS PASSED!');
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
