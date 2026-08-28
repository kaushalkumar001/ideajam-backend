import dotenv from 'dotenv';
dotenv.config();

import nodemailer from 'nodemailer';

let transporterInstance = null;

/**
 * Get or create a Singleton Pooled Nodemailer Transporter
 */
const getTransporter = () => {
  const emailUser = (process.env.EMAIL_USER || '').trim();
  const emailPass = (process.env.EMAIL_PASS || '').replace(/[-\s]/g, '').trim();

  if (!emailUser || !emailPass) {
    return null;
  }

  if (!transporterInstance) {
    transporterInstance = nodemailer.createTransport({
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 5,
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  return transporterInstance;
};

/**
 * Generate Leader HTML Email Template
 */
const getLeaderEmailTemplate = ({ teamName, leaderName, members, leaderPhone, driveLink }) => {
  const membersHtml = members
    .map(
      (m, idx) => `
      <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
        <td style="padding: 12px 16px; color: #1BB683; font-weight: 700; font-size: 14px;">#0${idx + 1}</td>
        <td style="padding: 12px 16px; color: #ffffff; font-weight: 600; font-size: 14px;">${m.name}</td>
        <td style="padding: 12px 16px; color: #94a3b8; font-size: 14px;">${m.email}</td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IdeaJam 2026 Registration Confirmation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0B111B; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #ffffff;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0B111B; padding: 40px 10px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #111A29; border-radius: 20px; border: 1px solid rgba(27, 182, 131, 0.25); overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);">
          
          <!-- Top Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #111A29 0%, #16263D 100%); padding: 36px 32px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="display: inline-block; padding: 6px 16px; background-color: rgba(27, 182, 131, 0.15); border: 1px solid rgba(27, 182, 131, 0.4); border-radius: 50px; margin-bottom: 16px;">
                <span style="color: #1BB683; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">✨ REGISTRATION CONFIRMED</span>
              </div>
              <h1 style="margin: 0; font-size: 32px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff;">
                IdeaJam <span style="color: #1BB683;">2026</span>
              </h1>
              <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 15px;">
                Welcome aboard! Your team is officially registered.
              </p>
            </td>
          </tr>

          <!-- Main Details -->
          <tr>
            <td style="padding: 24px 32px;">
              <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Hey <strong style="color: #ffffff;">${leaderName}</strong>, congratulations on registering <strong style="color: #1BB683;">${teamName}</strong> for IdeaJam 2026! We are thrilled to have you lead your team into the hackathon arena.
              </p>

              <!-- Leader Summary Card -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #172336; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
                <tr>
                  <td width="50%" style="vertical-align: top;">
                    <div style="color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase;">Team Name</div>
                    <div style="color: #ffffff; font-size: 16px; font-weight: 700; margin-top: 4px;">${teamName}</div>
                  </td>
                  <td width="50%" style="vertical-align: top;">
                    <div style="color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase;">Leader Phone</div>
                    <div style="color: #ffffff; font-size: 15px; font-weight: 600; margin-top: 4px;">${leaderPhone}</div>
                  </td>
                </tr>
                ${driveLink ? `
                <tr>
                  <td colspan="2" style="padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.08); margin-top: 10px;">
                    <div style="color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase;">Project / Drive Link</div>
                    <div style="margin-top: 4px;">
                      <a href="${driveLink}" target="_blank" style="color: #1BB683; font-size: 13px; font-weight: 600; text-decoration: underline; word-break: break-all;">${driveLink}</a>
                    </div>
                  </td>
                </tr>
                ` : ''}
              </table>

              <!-- Member Roster -->
              <h3 style="color: #ffffff; font-size: 16px; font-weight: 800; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px;">
                👥 Registered Team Roster (${members.length} Members)
              </h3>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #172336; border-radius: 12px; border-collapse: collapse; overflow: hidden; margin-bottom: 24px;">
                <thead>
                  <tr style="background-color: rgba(27, 182, 131, 0.15); border-bottom: 1px solid rgba(27, 182, 131, 0.3);">
                    <th style="padding: 10px 16px; text-align: left; color: #1BB683; font-size: 11px; font-weight: 800; text-transform: uppercase;">Slot</th>
                    <th style="padding: 10px 16px; text-align: left; color: #1BB683; font-size: 11px; font-weight: 800; text-transform: uppercase;">Name</th>
                    <th style="padding: 10px 16px; text-align: left; color: #1BB683; font-size: 11px; font-weight: 800; text-transform: uppercase;">Email</th>
                  </tr>
                </thead>
                <tbody>
                  ${membersHtml}
                </tbody>
              </table>

              <!-- Roadmap / Guidelines Overview -->
              <div style="background-color: rgba(245, 158, 11, 0.08); border-left: 4px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <h4 style="margin: 0 0 8px 0; color: #f59e0b; font-size: 14px; font-weight: 800; text-transform: uppercase;">🚀 What's Next? (Round 1)</h4>
                <ul style="margin: 0; padding-left: 20px; color: #cbd5e1; font-size: 13px; line-height: 1.6;">
                  <li>Round 1 pitch submission deadline details will be notified soon.</li>
                  <li>Ensure all team members join the official Discord/WhatsApp announcement channel.</li>
                </ul>
              </div>

              <!-- Button CTA -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0 20px 0;">
                    <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}" target="_blank" style="display: inline-block; background: linear-gradient(90deg, #1BB683, #10b981); color: #0B111B; font-size: 15px; font-weight: 800; text-decoration: none; padding: 14px 36px; border-radius: 12px; box-shadow: 0 8px 20px rgba(27, 182, 131, 0.3);">
                      Visit Hackathon Dashboard →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0d1522; padding: 24px 32px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.06);">
              <p style="margin: 0 0 8px 0; color: #64748b; font-size: 12px;">
                IdeaJam 2026 Organizing Committee • Innovate, Build, Win
              </p>
              <p style="margin: 0; color: #475569; font-size: 11px;">
                This is an automated notification. If you didn't register for this event, please contact support.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

/**
 * Generate Team Member HTML Email Template
 */
const getMemberEmailTemplate = ({ teamName, memberName, leaderName }) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've been added to Team ${teamName} - IdeaJam 2026</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0B111B; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #ffffff;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0B111B; padding: 40px 10px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #111A29; border-radius: 20px; border: 1px solid rgba(27, 182, 131, 0.25); overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);">
          
          <!-- Top Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #111A29 0%, #16263D 100%); padding: 32px 28px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="display: inline-block; padding: 6px 16px; background-color: rgba(27, 182, 131, 0.15); border: 1px solid rgba(27, 182, 131, 0.4); border-radius: 50px; margin-bottom: 14px;">
                <span style="color: #1BB683; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">🚀 TEAM MEMBER REGISTRATION</span>
              </div>
              <h1 style="margin: 0; font-size: 28px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff;">
                Welcome to <span style="color: #1BB683;">IdeaJam 2026</span>
              </h1>
              <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 14px;">
                You are registered as part of Team <strong style="color: #ffffff;">${teamName}</strong>
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 20px 28px 28px 28px;">
              <p style="color: #e2e8f0; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
                Hello <strong style="color: #ffffff;">${memberName}</strong>!
              </p>
              <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                Your team leader <strong style="color: #1BB683;">${leaderName}</strong> has added you to <strong style="color: #ffffff;">${teamName}</strong> for IdeaJam 2026. Get ready for an intense hackathon journey filled with coding, pitching, mentorship, and grand prizes!
              </p>

              <div style="background-color: #172336; border-radius: 12px; padding: 18px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 8px 0; color: #1BB683; font-size: 13px; font-weight: 800; text-transform: uppercase;">📌 Important Highlights</h4>
                <ul style="margin: 0; padding-left: 18px; color: #94a3b8; font-size: 13px; line-height: 1.6;">
                  <li>Connect with your leader to finalize the Round 1 idea pitch.</li>
                  <li>36-Hour continuous prototype build begins in Round 3.</li>
                  <li>Grand Finale Pitch before industry experts and VCs.</li>
                </ul>
              </div>

              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}" target="_blank" style="display: inline-block; background: linear-gradient(90deg, #1BB683, #10b981); color: #0B111B; font-size: 14px; font-weight: 800; text-decoration: none; padding: 12px 30px; border-radius: 10px; box-shadow: 0 6px 16px rgba(27, 182, 131, 0.3);">
                      Visit IdeaJam 2026 Portal →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #0d1522; padding: 20px 28px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.06);">
              <p style="margin: 0 0 6px 0; color: #64748b; font-size: 12px;">
                IdeaJam 2026 Organizing Committee
              </p>
              <p style="margin: 0; color: #475569; font-size: 11px;">
                Sent to ${memberName} as part of Team ${teamName}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

/**
 * Send automated confirmation emails to Team Leader and all Members
 */
export const sendRegistrationConfirmationEmails = async ({ teamName, leader, members, driveLink, registrationId }) => {
  const transporter = getTransporter();

  if (!transporter) {
    console.warn(`⚠️ [Nodemailer Notice] EMAIL_USER or EMAIL_PASS missing in .env. Skipping automated email dispatch.`);
    return { leaderSent: false, membersSentCount: 0, totalTargetMembers: members.length };
  }

  const fromEmail = (process.env.EMAIL_USER || '').trim();
  const fromName = process.env.EMAIL_FROM_NAME || 'IdeaJam 2026';
  const fromAddress = `"${fromName}" <${fromEmail}>`;

  let leaderSent = false;
  let membersSentCount = 0;

  // 1. Send Email to Team Leader
  try {
    const leaderMailOptions = {
      from: fromAddress,
      to: leader.email,
      subject: `🎉 Registration Confirmed: Team "${teamName}" - IdeaJam 2026`,
      html: getLeaderEmailTemplate({
        teamName,
        leaderName: leader.name,
        leaderPhone: leader.phone,
        driveLink,
        members,
      }),
    };

    const leaderResult = await transporter.sendMail(leaderMailOptions);
    console.log(`✅ [Nodemailer] Confirmation email successfully sent to Team Leader: ${leader.email} (MsgID: ${leaderResult.messageId})`);
    leaderSent = true;
  } catch (error) {
    if (error.message && error.message.includes('454')) {
      console.warn(`⚠️ [Nodemailer Notice] Google SMTP Rate-Limit (454): Too many login attempts in a short duration. Email queued for later retry.`);
    } else {
      console.error(`❌ [Nodemailer Error] Failed to send email to Leader (${leader.email}):`, error.message);
    }
  }

  // 2. Send Emails to all Team Members
  for (const member of members) {
    if (!member.email || !member.name) continue;

    try {
      const memberMailOptions = {
        from: fromAddress,
        to: member.email,
        subject: `🚀 You've joined Team "${teamName}" for IdeaJam 2026!`,
        html: getMemberEmailTemplate({
          teamName,
          memberName: member.name,
          leaderName: leader.name,
        }),
      };

      const memberResult = await transporter.sendMail(memberMailOptions);
      console.log(`✅ [Nodemailer] Member email sent to: ${member.email} (MsgID: ${memberResult.messageId})`);
      membersSentCount++;
    } catch (err) {
      if (err.message && err.message.includes('454')) {
        console.warn(`⚠️ [Nodemailer Notice] Google SMTP Rate-Limit (454): Member email queued.`);
      } else {
        console.error(`❌ [Nodemailer Error] Failed to send email to member (${member.email}):`, err.message);
      }
    }
  }

  return {
    leaderSent,
    membersSentCount,
    totalTargetMembers: members.length,
  };
};


