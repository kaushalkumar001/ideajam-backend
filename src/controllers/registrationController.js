import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Registration from '../models/Registration.js';
import { sendRegistrationConfirmationEmails, sendCertificateEmail } from '../services/mailService.js';
import { generateCertificateBuffer } from '../services/certificateService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'registrations.json');

// Ensure data folder and file exists for persistent disk fallback
const initDiskStore = () => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Error initializing disk store:', err.message);
  }
};

initDiskStore();

const loadDiskRegistrations = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(data || '[]');
    }
  } catch (err) {
    console.error('Error reading disk registrations:', err.message);
  }
  return [];
};

// Asynchronous non-blocking disk persistence
const saveDiskRegistrationsAsync = (list) => {
  initDiskStore();
  fs.promises.writeFile(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8').catch((err) => {
    console.error('Error writing disk registrations asynchronously:', err.message);
  });
};

let inMemoryRegistrations = loadDiskRegistrations();

/**
 * Generate a unique registration code like IJ26-X8B9K2
 */
const generateRegistrationId = () => {
  const randomStr = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `IJ26-${randomStr}`;
};

/**
 * Helper: basic email format validator
 */
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * POST /api/register
 * Handle Team Registration
 */
export const registerTeam = async (req, res) => {
  try {
    const reqTeamName = req.body.teamName || req.body.team || '';
    const reqLeaderName = req.body.leaderName || (typeof req.body.leader === 'object' ? req.body.leader?.name : req.body.leader) || '';
    const reqLeaderEmail = req.body.leaderEmail || (typeof req.body.leader === 'object' ? req.body.leader?.email : req.body.email) || '';
    const reqLeaderPhone = req.body.leaderPhone || (typeof req.body.leader === 'object' ? req.body.leader?.phone : req.body.phone) || '';
<<<<<<< HEAD
=======
    const reqProblemStatementId = req.body.problemStatementId || req.body.problemStatement || req.body.problem || req.body.problemId || '';
>>>>>>> 983299c98109fea155a2c3cdc8d5e41663b0e165
    const reqDriveLink = req.body.driveLink || req.body.ppt || req.body.pptUrl || req.body.submissionUrl || '';
    const rawMembers = Array.isArray(req.body.members) ? req.body.members : [];

    // Filter active non-empty member entries
    const activeMembers = rawMembers.filter((m) => m && (m.name?.toString().trim() || m.email?.toString().trim()));

    // 1. Input Validation
    if (!reqTeamName || !reqTeamName.toString().trim()) {
      return res.status(400).json({
        success: false,
        message: 'Team name is required.',
      });
    }

    if (!reqLeaderName || !reqLeaderName.toString().trim()) {
      return res.status(400).json({
        success: false,
        message: 'Team leader name is required.',
      });
    }

    if (!reqLeaderEmail || !isValidEmail(reqLeaderEmail.toString().trim())) {
      return res.status(400).json({
        success: false,
        message: 'A valid team leader email address is required.',
      });
    }

    if (!reqLeaderPhone || !reqLeaderPhone.toString().trim()) {
      return res.status(400).json({
        success: false,
        message: 'Team leader phone number is required.',
      });
    }

    // Fallback: If no extra members provided, add at least 1 member slot automatically
    if (activeMembers.length < 1) {
      activeMembers.push({
        id: 1,
        name: reqLeaderName.toString().trim(),
        email: reqLeaderEmail.toString().trim(),
      });
    }

    if (activeMembers.length > 5) {
      return res.status(400).json({
        success: false,
        message: 'A maximum of 5 team members is allowed.',
      });
    }

    // Validate each member
    for (let i = 0; i < activeMembers.length; i++) {
      const m = activeMembers[i];
      if (!m || !m.name || !m.name.toString().trim()) {
        return res.status(400).json({
          success: false,
          message: `Team member #${i + 1} name is required.`,
        });
      }
      if (!m.email || !isValidEmail(m.email.toString().trim())) {
        return res.status(400).json({
          success: false,
          message: `A valid email is required for member #${i + 1} (${m.name || 'Unnamed'}).`,
        });
      }
    }

    const cleanTeamName = reqTeamName.toString().trim();
    const cleanLeaderEmail = reqLeaderEmail.toString().trim().toLowerCase();
    const cleanLeaderName = reqLeaderName.toString().trim();
    const cleanLeaderPhone = reqLeaderPhone.toString().trim();
<<<<<<< HEAD
=======
    const cleanProblemStatementId = (reqProblemStatementId || '').toString().trim();
>>>>>>> 983299c98109fea155a2c3cdc8d5e41663b0e165
    const cleanDriveLink = (reqDriveLink || '').toString().trim();
    const cleanMembers = activeMembers.map((m, idx) => ({
      id: m.id || idx + 1,
      name: m.name.toString().trim(),
      email: m.email.toString().trim().toLowerCase(),
    }));

    // 2. Generate unique Registration ID
    let registrationId = generateRegistrationId();

    // 3. Save to MongoDB (or fallback disk/memory)
    let savedRegistration = null;
    let isDbConnected = false;

    try {
      // Check for duplicate team leader email in MongoDB
      const existingLeader = await Registration.findOne({ 'leader.email': cleanLeaderEmail }).lean();
      if (existingLeader) {
        return res.status(409).json({
          success: false,
          message: `This team leader email (${cleanLeaderEmail}) is already registered under team "${existingLeader.teamName}".`,
          registrationId: existingLeader.registrationId,
        });
      }

      // Check for duplicate team name in MongoDB
      const existingTeam = await Registration.findOne({
        teamName: { $regex: new RegExp(`^${cleanTeamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      }).lean();
      if (existingTeam) {
        return res.status(409).json({
          success: false,
          message: `Team name "${cleanTeamName}" is already taken. Please choose another unique name.`,
        });
      }

      const newRegistration = new Registration({
        registrationId,
        teamName: cleanTeamName,
        leader: {
          name: cleanLeaderName,
          email: cleanLeaderEmail,
          phone: cleanLeaderPhone,
        },
        members: cleanMembers,
        problemStatementId: cleanProblemStatementId,
        driveLink: cleanDriveLink,
        status: 'Pending',
      });

      savedRegistration = await newRegistration.save();
      isDbConnected = true;
      console.log(`✅ [Database] Team registered & saved to MongoDB: ${cleanTeamName} (${registrationId})`);
    } catch (dbErr) {
      // Handle MongoDB E11000 Duplicate Key Error explicitly for race conditions
      if (dbErr.code === 11000) {
        const errorPattern = JSON.stringify(dbErr.keyPattern || dbErr.message || '');
        if (errorPattern.includes('leader') || errorPattern.includes('email')) {
          return res.status(409).json({
            success: false,
            message: `This team leader email (${cleanLeaderEmail}) is already registered.`,
          });
        }
        return res.status(409).json({
          success: false,
          message: `Team name "${cleanTeamName}" is already taken. Please choose another unique name.`,
        });
      }

      console.warn(`⚠️ [Database Notice] MongoDB save unavailable (${dbErr.message}). Saving to persistent disk store.`);
      
      // Check in-memory duplicates
      const dupLeader = inMemoryRegistrations.find((r) => r.leader?.email?.toLowerCase() === cleanLeaderEmail);
      if (dupLeader) {
        return res.status(409).json({
          success: false,
          message: `This team leader email (${cleanLeaderEmail}) is already registered under team "${dupLeader.teamName}".`,
          registrationId: dupLeader.registrationId,
        });
      }

      const dupTeam = inMemoryRegistrations.find((r) => r.teamName?.toLowerCase() === cleanTeamName.toLowerCase());
      if (dupTeam) {
        return res.status(409).json({
          success: false,
          message: `Team name "${cleanTeamName}" is already taken. Please choose another unique name.`,
        });
      }

      const fallbackRecord = {
        _id: 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        registrationId,
        teamName: cleanTeamName,
        leader: {
          name: cleanLeaderName,
          email: cleanLeaderEmail,
          phone: cleanLeaderPhone,
        },
        members: cleanMembers,
        problemStatementId: cleanProblemStatementId,
        driveLink: cleanDriveLink,
        status: 'Pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemoryRegistrations.unshift(fallbackRecord);
      saveDiskRegistrationsAsync(inMemoryRegistrations);
      savedRegistration = fallbackRecord;
    }

    // 4. Automated Email Dispatch (Awaited for serverless compatibility)
    try {
      const emailResult = await sendRegistrationConfirmationEmails({
        teamName: cleanTeamName,
        leader: {
          name: cleanLeaderName,
          email: cleanLeaderEmail,
          phone: cleanLeaderPhone,
        },
        members: cleanMembers,
        problemStatementId: cleanProblemStatementId,
        driveLink: cleanDriveLink,
        registrationId,
      });

      if (isDbConnected && savedRegistration?._id) {
        await Registration.findByIdAndUpdate(savedRegistration._id, {
          'emailNotification.leaderDelivered': emailResult.leaderSent,
          'emailNotification.membersDeliveredCount': emailResult.membersSentCount,
          'emailNotification.lastSentAt': new Date(),
        }).catch(() => {});
      }
    } catch (emailErr) {
      console.error('⚠️ [Email Dispatch Notice]:', emailErr.message);
    }

    // 5. Immediate Fast HTTP Response
    return res.status(201).json({
      success: true,
      message: 'Team registered successfully! Confirmation emails are being dispatched to the team.',
      data: {
        registrationId,
        teamName: cleanTeamName,
        leader: {
          name: cleanLeaderName,
          email: cleanLeaderEmail,
          phone: cleanLeaderPhone,
        },
        members: cleanMembers,
        problemStatementId: cleanProblemStatementId,
        driveLink: cleanDriveLink,
        createdAt: savedRegistration.createdAt || new Date(),
      },
    });
  } catch (error) {
    console.error('❌ [Registration Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred while processing registration.',
      error: error.message,
    });
  }
};

/**
 * GET /api/registrations
 * Retrieve all registered teams
 */
export const getAllRegistrations = async (req, res) => {
  try {
    let registrations = [];
    try {
      registrations = await Registration.find().sort({ createdAt: -1 }).lean();
    } catch (err) {
      registrations = inMemoryRegistrations;
    }

    return res.status(200).json({
      success: true,
      count: registrations.length,
      data: registrations,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve registrations',
      error: error.message,
    });
  }
};

/**
 * Helper: format team object consistently for admin dashboard frontend
 */
const formatTeamRecord = (item, idx = 0) => {
  if (!item) return null;
<<<<<<< HEAD
=======
  const problemVal = item.problemStatementId || item.problem || item.problemStatement || 'Registered Solution';
>>>>>>> 983299c98109fea155a2c3cdc8d5e41663b0e165
  return {
    id: item.registrationId || item._id || idx + 1,
    registrationId: item.registrationId || item._id,
    team: item.teamName || item.team || 'Unnamed Team',
    teamName: item.teamName || item.team || 'Unnamed Team',
    leader: item.leader?.name || item.leader || '—',
    email: item.leader?.email || item.email || '—',
    phone: item.leader?.phone || item.phone || '—',
    department: item.department || 'General',
    route: item.route || 'SIH Problem Statement',
<<<<<<< HEAD
    problem: item.problem || 'Registered Solution',
=======
    problemStatementId: item.problemStatementId || problemVal,
    problem: problemVal,
>>>>>>> 983299c98109fea155a2c3cdc8d5e41663b0e165
    idea: item.idea || 'Idea submission for IdeaJam 2026',
    ppt: item.driveLink || item.ppt || '',
    driveLink: item.driveLink || item.ppt || '',
    status: item.status || 'Pending',
    score: item.score || null,
    remark: item.remark || '',
    members: item.members || [],
    round2Marks: item.round2Marks || {},
    round3Marks: item.round3Marks || {},
    round2Status: item.round2Status || 'Pending',
    createdAt: item.createdAt || new Date(),
  };
};

/**
 * GET /api/registrations/:id
 * Retrieve specific registration by registrationId or DB _id
 */
export const getRegistrationById = async (req, res) => {
  try {
    const { id } = req.params;
    let registration = null;

    try {
      registration = await Registration.findOne({
        $or: [{ registrationId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
      }).lean();
    } catch (err) {
      registration = inMemoryRegistrations.find((r) => r.registrationId === id || r._id === id);
    }

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Registration not found with ID: ' + id,
      });
    }

    return res.status(200).json({
      success: true,
      data: formatTeamRecord(registration),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error finding registration',
      error: error.message,
    });
  }
};

/**
 * Admin: GET /api/admin/teams
 */
export const getAdminTeams = async (req, res) => {
  try {
    let list = [];
    try {
      list = await Registration.find().sort({ createdAt: -1 }).lean();
    } catch (err) {
      list = inMemoryRegistrations;
    }

    const formatted = list.map((item, idx) => formatTeamRecord(item, idx));

    return res.status(200).json({
      success: true,
      teams: formatted,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Admin: PATCH /api/admin/teams/:id/status
 */
export const updateTeamStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remark } = req.body;

    let updated = null;
    try {
      updated = await Registration.findOneAndUpdate(
        { $or: [{ registrationId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }] },
        { status, remark },
        { new: true }
      ).lean();
    } catch (err) {
      const idx = inMemoryRegistrations.findIndex((r) => r.registrationId === id || r._id === id);
      if (idx !== -1) {
        inMemoryRegistrations[idx].status = status;
        inMemoryRegistrations[idx].remark = remark;
        saveDiskRegistrationsAsync(inMemoryRegistrations);
        updated = inMemoryRegistrations[idx];
      }
    }

    return res.status(200).json({
      success: true,
      data: formatTeamRecord(updated),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Admin: GET /api/admin/round-progress
 */
export const getRoundProgress = async (req, res) => {
  try {
    let list = [];
    try {
      list = await Registration.find().lean();
    } catch (err) {
      list = inMemoryRegistrations;
    }

    const formattedList = list.map((item, idx) => formatTeamRecord(item, idx));
    const round2Teams = formattedList.filter((t) => t.status === 'Accepted');
    const round3Teams = formattedList.filter((t) => t.round2Status === 'Accepted');

    return res.status(200).json({
      success: true,
      round2Teams,
      round3Teams,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Admin: PATCH /api/admin/round2/:id/status
 */
export const updateRound2Status = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remark } = req.body;

    let updated = null;
    try {
      updated = await Registration.findOneAndUpdate(
        { $or: [{ registrationId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }] },
        { round2Status: status, round2Remark: remark },
        { new: true }
      ).lean();
    } catch (err) {
      const idx = inMemoryRegistrations.findIndex((r) => r.registrationId === id || r._id === id);
      if (idx !== -1) {
        inMemoryRegistrations[idx].round2Status = status;
        inMemoryRegistrations[idx].round2Remark = remark;
        saveDiskRegistrationsAsync(inMemoryRegistrations);
        updated = inMemoryRegistrations[idx];
      }
    }

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Admin: PATCH /api/admin/round2/:id/evaluation
 */
export const updateRound2Evaluation = async (req, res) => {
  try {
    const { id } = req.params;
    const { marks, total } = req.body;

    let updated = null;
    try {
      updated = await Registration.findOneAndUpdate(
        { $or: [{ registrationId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }] },
        { round2Marks: marks, round2Score: total },
        { new: true }
      ).lean();
    } catch (err) {
      const idx = inMemoryRegistrations.findIndex((r) => r.registrationId === id || r._id === id);
      if (idx !== -1) {
        inMemoryRegistrations[idx].round2Marks = marks;
        inMemoryRegistrations[idx].round2Score = total;
        saveDiskRegistrationsAsync(inMemoryRegistrations);
        updated = inMemoryRegistrations[idx];
      }
    }

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Admin: PATCH /api/admin/round3/:id/evaluation
 */
export const updateRound3Evaluation = async (req, res) => {
  try {
    const { id } = req.params;
    const { marks, total } = req.body;

    let updated = null;
    try {
      updated = await Registration.findOneAndUpdate(
        { $or: [{ registrationId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }] },
        { round3Marks: marks, round3Score: total },
        { new: true }
      ).lean();
    } catch (err) {
      const idx = inMemoryRegistrations.findIndex((r) => r.registrationId === id || r._id === id);
      if (idx !== -1) {
        inMemoryRegistrations[idx].round3Marks = marks;
        inMemoryRegistrations[idx].round3Score = total;
        saveDiskRegistrationsAsync(inMemoryRegistrations);
        updated = inMemoryRegistrations[idx];
      }
    }

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Admin: POST /api/admin/login
 * Secure authentication handled entirely on the backend
 */
export const adminLogin = async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const inputUser = (email || username || '').trim().toLowerCase();
    const inputPass = (password || '').trim();

    if (!inputUser || !inputPass) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const expectedUser = (process.env.ADMIN_EMAIL || 'admin@gmail.com').trim().toLowerCase();
    const expectedPass = (process.env.ADMIN_PASSWORD || '123456').trim();

    if (inputUser === expectedUser && inputPass === expectedPass) {
      const token = 'admin_session_' + crypto.randomBytes(24).toString('hex');
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          username: inputUser,
          role: 'Super admin'
        }
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid email or password'
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Authentication failed due to server error'
    });
  }
};


/**
 * Admin: GET /api/admin/certificate-preview?name=John+Doe
 * Direct certificate image generator endpoint for live preview/download
 */
export const previewCertificate = async (req, res) => {
  try {
    const name = req.query.name || req.query.participant || 'Participant Name';
    const buffer = await generateCertificateBuffer(name);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="certificate_${encodeURIComponent(name)}.png"`);
    return res.send(buffer);
  } catch (err) {
    console.error('Error generating certificate preview:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate certificate preview',
      error: err.message,
    });
  }
};

/**
 * Helper: Send certificate to a single participant with buffer generation
 */
const deliverCertificateToPerson = async ({ name, email, teamName }) => {
  try {
    const cleanName = (name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      return { success: false, name: cleanName, email: cleanEmail, error: 'Invalid email address' };
    }

    const certBuffer = await generateCertificateBuffer(cleanName || 'Participant');
    const sendRes = await sendCertificateEmail({
      recipientName: cleanName || 'Participant',
      recipientEmail: cleanEmail,
      teamName: teamName || 'IdeaJam 2026',
      certificateBuffer: certBuffer,
    });

    return {
      success: sendRes.success,
      name: cleanName,
      email: cleanEmail,
      teamName,
      error: sendRes.error || null,
      messageId: sendRes.messageId || null,
    };
  } catch (err) {
    return {
      success: false,
      name,
      email,
      teamName,
      error: err.message,
    };
  }
};

/**
 * Admin: POST /api/admin/send-certificates
 * Generate & dispatch personalized certificates to all registered team leaders & members
 */
export const sendCertificates = async (req, res) => {
  try {
    const { teamId, email: targetEmail, name: targetName } = req.body || {};

    // 1. Fetch relevant registrations
    let registrations = [];
    try {
      if (teamId) {
        registrations = await Registration.find({
          $or: [{ registrationId: teamId }, { _id: teamId.match(/^[0-9a-fA-F]{24}$/) ? teamId : null }],
        }).lean();
      } else {
        registrations = await Registration.find().lean();
      }
    } catch (err) {
      if (teamId) {
        registrations = inMemoryRegistrations.filter((r) => r.registrationId === teamId || r._id === teamId);
      } else {
        registrations = inMemoryRegistrations;
      }
    }

    // If single target email and name provided directly in request body
    if (targetEmail && isValidEmail(targetEmail)) {
      const singleRes = await deliverCertificateToPerson({
        name: targetName || 'IdeaJam Participant',
        email: targetEmail,
        teamName: 'IdeaJam 2026',
      });

      return res.status(200).json({
        success: singleRes.success,
        message: singleRes.success
          ? `Certificate sent successfully to ${targetEmail} (${targetName || 'Participant'})`
          : `Failed sending certificate to ${targetEmail}: ${singleRes.error}`,
        data: singleRes,
      });
    }

    if (!registrations || registrations.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No registered teams found to send certificates.',
      });
    }

    // 2. Extract unique recipients across teams (leaders and members)
    const recipientMap = new Map(); // email -> { name, email, teamName }

    for (const team of registrations) {
      const teamName = team.teamName || 'IdeaJam Team';

      // Team Leader
      if (team.leader && team.leader.email) {
        const leaderEmail = team.leader.email.trim().toLowerCase();
        if (isValidEmail(leaderEmail) && !recipientMap.has(leaderEmail)) {
          recipientMap.set(leaderEmail, {
            name: team.leader.name || 'Team Leader',
            email: leaderEmail,
            teamName,
          });
        }
      }

      // Team Members
      if (Array.isArray(team.members)) {
        for (const member of team.members) {
          if (member && member.email) {
            const memberEmail = member.email.trim().toLowerCase();
            if (isValidEmail(memberEmail) && !recipientMap.has(memberEmail)) {
              recipientMap.set(memberEmail, {
                name: member.name || 'Team Member',
                email: memberEmail,
                teamName,
              });
            }
          }
        }
      }
    }

    const recipients = Array.from(recipientMap.values());

    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid recipient email addresses found in registrations.',
      });
    }

    console.log(`🚀 [Certificates] Starting bulk certificate dispatch to ${recipients.length} recipients across ${registrations.length} teams...`);

    // 3. Process dispatch in controlled batches of 5 to avoid SMTP rate limiting
    const BATCH_SIZE = 5;
    const results = [];

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map((r) => deliverCertificateToPerson(r));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Short delay between batches
      if (i + BATCH_SIZE < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.length - successCount;

    console.log(`✅ [Certificates] Dispatch completed: ${successCount} sent, ${failedCount} failed.`);

    return res.status(200).json({
      success: true,
      message: `Certificates dispatched! Successfully sent to ${successCount} of ${recipients.length} participants across ${registrations.length} teams.`,
      stats: {
        totalTeams: registrations.length,
        totalRecipients: recipients.length,
        sentCount: successCount,
        failedCount: failedCount,
      },
      results,
    });
  } catch (error) {
    console.error('❌ [Certificates Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while sending certificates: ' + error.message,
    });
  }
};

/**
 * Admin: POST /api/admin/teams/:id/send-certificate
 * Dispatch certificates to a specific team's leader & members
 */
export const sendTeamCertificate = async (req, res) => {
  req.body = { ...(req.body || {}), teamId: req.params.id };
  return sendCertificates(req, res);
};



