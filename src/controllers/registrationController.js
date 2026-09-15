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
    const reqProblemStatementId = req.body.problemStatementId || req.body.problemStatement || req.body.problem || req.body.problemId || '';
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
    const cleanProblemStatementId = (reqProblemStatementId || '').toString().trim();
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
 * Safe Mongoose Query Helper for Registration ID, ObjectId, Email, Name, AdmNo, Team, Phone
 */
const buildIdQuery = (rawId) => {
  if (!rawId) return null;
  const idStr = rawId.toString().trim();
  const lowerStr = idStr.toLowerCase();
  const escapedStr = idStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactRegex = new RegExp(`^${escapedStr}$`, 'i');
  const partialRegex = new RegExp(escapedStr, 'i');

  const orConditions = [
    { registrationId: idStr },
    { registrationId: lowerStr },
    { email: lowerStr },
    { email: exactRegex },
    { 'leader.email': lowerStr },
    { 'leader.email': exactRegex },
    { admNo: idStr },
    { admNo: exactRegex },
    { phone: idStr },
    { 'leader.phone': idStr },
    { name: exactRegex },
    { 'leader.name': exactRegex },
    { teamName: exactRegex },
    { 'members.email': lowerStr },
    { 'members.name': exactRegex },
    // Partial fallbacks for search strings
    { name: partialRegex },
    { 'leader.name': partialRegex },
    { teamName: partialRegex },
    { admNo: partialRegex },
    { email: partialRegex },
  ];

  if (/^[0-9a-fA-F]{24}$/.test(idStr)) {
    orConditions.push({ _id: idStr });
  }

  return { $or: orConditions };
};

/**
 * Helper: format team object consistently for admin dashboard frontend
 */
const formatTeamRecord = (item, idx = 0) => {
  if (!item) return null;
  const problemVal = item.problemStatementId || item.problem || item.problemStatement || 'Registered Solution';
  const personName = item.name || item.fullName || item.participantName || item.studentName || item.leader?.name || item.leaderName || (typeof item.leader === 'string' ? item.leader : '') || 'Participant';
  const personEmail = item.email || item.leader?.email || '';
  const personPhone = item.phone || item.leader?.phone || '';
  const teamDisplayName = item.teamName || item.team || (item.name ? `${item.name}'s Team` : 'IdeaJam Team');
  const recordId = (item.registrationId || item._id || idx + 1).toString();

  return {
    id: recordId,
    _id: item._id ? item._id.toString() : recordId,
    registrationId: recordId,
    team: teamDisplayName,
    teamName: teamDisplayName,
    name: personName,
    leader: personName,
    leaderName: personName,
    email: personEmail || '—',
    leaderEmail: personEmail,
    phone: personPhone || '—',
    leaderPhone: personPhone,
    admNo: item.admNo || '',
    department: item.department || 'General',
    route: item.route || 'SIH Problem Statement',
    problemStatementId: item.problemStatementId || problemVal,
    problem: problemVal,
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
      const query = buildIdQuery(id);
      if (query) {
        registration = await Registration.findOne(query).lean();
      }
    } catch (err) {
      registration = inMemoryRegistrations.find((r) => r.registrationId === id || r._id === id || r.email === id);
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
    const searchQuery = (req.query.search || req.query.q || req.query.query || '').trim();
    let query = {};

    if (searchQuery) {
      const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      const orConditions = [
        { name: regex },
        { teamName: regex },
        { email: regex },
        { 'leader.name': regex },
        { 'leader.email': regex },
        { 'leader.phone': regex },
        { admNo: regex },
        { phone: regex },
        { registrationId: regex },
        { 'members.name': regex },
        { 'members.email': regex },
      ];
      if (/^[0-9a-fA-F]{24}$/.test(searchQuery)) {
        orConditions.push({ _id: searchQuery });
      }
      query = { $or: orConditions };
    }

    let list = [];
    try {
      list = await Registration.find(query).sort({ createdAt: -1 }).lean();
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
      const query = buildIdQuery(id);
      if (query) {
        updated = await Registration.findOneAndUpdate(
          query,
          { status, remark },
          { new: true }
        ).lean();
      }
    } catch (err) {
      const idx = inMemoryRegistrations.findIndex((r) => r.registrationId === id || r._id === id || r.email === id);
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
      const query = buildIdQuery(id);
      if (query) {
        updated = await Registration.findOneAndUpdate(
          query,
          { round2Status: status, round2Remark: remark },
          { new: true }
        ).lean();
      }
    } catch (err) {
      const idx = inMemoryRegistrations.findIndex((r) => r.registrationId === id || r._id === id || r.email === id);
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
      const query = buildIdQuery(id);
      if (query) {
        updated = await Registration.findOneAndUpdate(
          query,
          { round2Marks: marks, round2Score: total },
          { new: true }
        ).lean();
      }
    } catch (err) {
      const idx = inMemoryRegistrations.findIndex((r) => r.registrationId === id || r._id === id || r.email === id);
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
      const query = buildIdQuery(id);
      if (query) {
        updated = await Registration.findOneAndUpdate(
          query,
          { round3Marks: marks, round3Score: total },
          { new: true }
        ).lean();
      }
    } catch (err) {
      const idx = inMemoryRegistrations.findIndex((r) => r.registrationId === id || r._id === id || r.email === id);
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
    const {
      teamId,
      id,
      registrationId,
      _id,
      admNo,
      search,
      q,
      query: bodyQuery,
      email: directEmailInput,
      name: directNameInput,
      leaderEmail,
      leaderName,
      teams: targetTeams,
      selectedTeams,
      selectedIds,
      recipients: directRecipientsList,
    } = req.body || {};

    const lookupId = teamId || id || registrationId || _id || admNo || search || q || bodyQuery || req.params?.id;

    // Check if a direct valid email is passed anywhere in the request
    const detectedEmail = (
      directEmailInput ||
      leaderEmail ||
      (typeof teamId === 'string' && isValidEmail(teamId) ? teamId : '') ||
      (typeof id === 'string' && isValidEmail(id) ? id : '') ||
      (typeof lookupId === 'string' && isValidEmail(lookupId) ? lookupId : '')
    ).toString().trim().toLowerCase();

    const detectedName = (
      directNameInput ||
      leaderName ||
      (req.body?.name && req.body.name !== detectedEmail ? req.body.name : '') ||
      (req.body?.participantName || '')
    ).toString().trim();

    // 1. Direct single email dispatch
    if (detectedEmail && isValidEmail(detectedEmail)) {
      const cleanName = detectedName || 'Participant';
      const singleRes = await deliverCertificateToPerson({
        name: cleanName,
        email: detectedEmail,
        teamName: req.body?.teamName || req.body?.team || 'IdeaJam 2026',
      });

      return res.status(200).json({
        success: singleRes.success,
        message: singleRes.success
          ? `Certificate sent successfully to ${detectedEmail} (${cleanName})`
          : `Failed sending certificate to ${detectedEmail}: ${singleRes.error}`,
        data: singleRes,
      });
    }

    // 2. Fetch relevant registrations from DB
    let registrations = [];
    const rawArray = targetTeams || selectedTeams || selectedIds || directRecipientsList;

    try {
      if (Array.isArray(rawArray) && rawArray.length > 0) {
        const idList = rawArray
          .map((t) => (typeof t === 'string' ? t.trim() : (t.id || t.registrationId || t._id || t.email || t.admNo || t.name)))
          .filter(Boolean);
        const objectIds = idList.filter((i) => /^[0-9a-fA-F]{24}$/.test(i));
        const emailList = idList.filter((i) => isValidEmail(i)).map((i) => i.toLowerCase());

        registrations = await Registration.find({
          $or: [
            { registrationId: { $in: idList } },
            ...(objectIds.length > 0 ? [{ _id: { $in: objectIds } }] : []),
            ...(emailList.length > 0 ? [{ email: { $in: emailList } }, { 'leader.email': { $in: emailList } }] : []),
            { admNo: { $in: idList } },
            { name: { $in: idList } },
            { teamName: { $in: idList } },
          ],
        }).lean();
      } else if (lookupId && lookupId !== 'all') {
        const query = buildIdQuery(lookupId);
        if (query) {
          registrations = await Registration.find(query).lean();
        }
      } else {
        registrations = await Registration.find().lean();
      }
    } catch (err) {
      console.warn('Database query fallback in sendCertificates:', err.message);
      if (lookupId && lookupId !== 'all') {
        registrations = inMemoryRegistrations.filter(
          (r) => r.registrationId === lookupId || r._id === lookupId || r.email === lookupId || r.name === lookupId
        );
      } else {
        registrations = inMemoryRegistrations;
      }
    }

    if (!registrations || registrations.length === 0) {
      // If direct array of recipient objects with name & email was provided
      if (Array.isArray(rawArray) && rawArray.length > 0 && typeof rawArray[0] === 'object' && rawArray[0]?.email) {
        registrations = rawArray;
      } else {
        return res.status(404).json({
          success: false,
          message: `No matching participant or team found for "${lookupId || 'specified query'}".`,
        });
      }
    }

    // 3. Extract unique recipients across teams & individual participants
    const recipientMap = new Map(); // email -> { name, email, teamName }

    for (const team of registrations) {
      const teamName = team.teamName || team.team || (team.name ? `${team.name}'s Team` : 'IdeaJam 2026');

      // Direct participant record (name, email)
      if (team.email) {
        const directEmail = team.email.trim().toLowerCase();
        if (isValidEmail(directEmail) && !recipientMap.has(directEmail)) {
          const directName = (team.name || team.fullName || team.participantName || team.studentName || 'Participant').toString().trim();
          recipientMap.set(directEmail, {
            name: directName,
            email: directEmail,
            teamName,
          });
        }
      }

      // Team Leader
      if (team.leader && (typeof team.leader === 'object' ? team.leader.email : team.email)) {
        const leaderEmail = (typeof team.leader === 'object' ? team.leader.email : team.email || '').trim().toLowerCase();
        if (isValidEmail(leaderEmail) && !recipientMap.has(leaderEmail)) {
          const leaderName = (typeof team.leader === 'object' ? (team.leader.name || team.leaderName) : team.leader || team.name || 'Team Leader').toString().trim();
          recipientMap.set(leaderEmail, {
            name: leaderName,
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
              const memberName = (member.name || member.fullName || member.memberName || 'Team Member').toString().trim();
              recipientMap.set(memberEmail, {
                name: memberName,
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
        message: 'No valid recipient email addresses found in matched registrations.',
      });
    }

    console.log(`🚀 [Certificates] Starting certificate dispatch to ${recipients.length} recipients...`);

    // For single or small batch (<= 3): process synchronously and return full result
    if (recipients.length <= 3) {
      const results = [];
      for (const r of recipients) {
        const resDeliver = await deliverCertificateToPerson(r);
        results.push(resDeliver);
      }
      const successCount = results.filter((r) => r.success).length;
      return res.status(200).json({
        success: successCount > 0,
        message: successCount > 0
          ? `Certificate delivered successfully to ${recipients.map((r) => `${r.name} (${r.email})`).join(', ')}`
          : `Failed delivering certificate: ${results.map((r) => r.error).join('; ')}`,
        stats: {
          totalRecipients: recipients.length,
          sentCount: successCount,
          failedCount: recipients.length - successCount,
        },
        results,
      });
    }

    // For larger bulk batches (> 3): process first batch synchronously so response returns fast, rest in background
    const results = [];
    const BATCH_SIZE = 5;

    // Process first batch to verify SMTP
    const firstBatch = recipients.slice(0, BATCH_SIZE);
    const firstResults = await Promise.all(firstBatch.map((r) => deliverCertificateToPerson(r)));
    results.push(...firstResults);

    // If remaining recipients exist, run background queue
    if (recipients.length > BATCH_SIZE) {
      const remaining = recipients.slice(BATCH_SIZE);
      (async () => {
        for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
          const batch = remaining.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map((r) => deliverCertificateToPerson(r)));
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      })().catch((err) => console.error('Background batch dispatch error:', err));
    }

    const firstSuccessCount = firstResults.filter((r) => r.success).length;

    return res.status(200).json({
      success: true,
      message: `Certificates dispatch started! Delivered to first ${firstSuccessCount} participants, remaining ${recipients.length - firstBatch.length} being sent in background.`,
      stats: {
        totalRecipients: recipients.length,
        sentCount: firstSuccessCount,
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



