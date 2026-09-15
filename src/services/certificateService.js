import { createCanvas, loadImage } from '@napi-rs/canvas';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.join(__dirname, '../assets/certificate_template.png');

let cachedTemplate = null;

/**
 * Load template image with memory caching
 */
const getTemplateImage = async () => {
  if (cachedTemplate) return cachedTemplate;
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Certificate template not found at ${TEMPLATE_PATH}`);
  }
  cachedTemplate = await loadImage(TEMPLATE_PATH);
  return cachedTemplate;
};

/**
 * Clean & format participant name (e.g. "kundan kumar" -> "Kundan Kumar")
 */
export const formatParticipantName = (rawName) => {
  if (!rawName) return 'Participant';
  const trimmed = rawName.toString().trim();
  if (trimmed === trimmed.toLowerCase()) {
    return trimmed
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  return trimmed;
};

/**
 * Generate a personalized certificate buffer (PNG) for a participant
 * @param {string} participantName - Name of the leader or team member
 * @returns {Promise<Buffer>} - PNG image buffer of the personalized certificate
 */
export const generateCertificateBuffer = async (participantName = 'Participant') => {
  const template = await getTemplateImage();
  const canvas = createCanvas(template.width, template.height);
  const ctx = canvas.getContext('2d');

  // Draw base certificate template
  ctx.drawImage(template, 0, 0);

  // Format participant name cleanly from input / database record
  const cleanName = formatParticipantName(participantName);

  // Baseline position above the underline: line is around y = 425
  const centerX = template.width / 2;
  const centerY = 414; // Perfectly positioned above the underline

  // Dynamic font sizing based on name length so long names don't overflow
  let fontSize = 36;
  if (cleanName.length > 30) {
    fontSize = 24;
  } else if (cleanName.length > 22) {
    fontSize = 28;
  } else if (cleanName.length > 16) {
    fontSize = 32;
  }

  // Draw Participant Name with premium typography
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.font = `bold ${fontSize}px "Segoe UI", "Arial", "Helvetica", sans-serif`;
  ctx.fillStyle = '#0f2928'; // Deep teal-black matching IdeaJam branding

  // Measure text to ensure it fits within maximum line width (approx 560px)
  const maxLineWidth = 560;
  let textMetrics = ctx.measureText(cleanName);
  while (textMetrics.width > maxLineWidth && fontSize > 16) {
    fontSize -= 2;
    ctx.font = `bold ${fontSize}px "Segoe UI", "Arial", "Helvetica", sans-serif`;
    textMetrics = ctx.measureText(cleanName);
  }

  ctx.fillText(cleanName, centerX, centerY);
  ctx.restore();

  return canvas.toBuffer('image/png');
};
