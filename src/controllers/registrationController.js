import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Registration from '../models/Registration.js';
import { sendRegistrationConfirmationEmails, sendCertificateEmail } from '../services/mailService.js';
import { generateCertificateBuffer, formatParticipantName } from '../services/certificateService.js';

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
 * Helper: Extract distinct recipients across team leaders, members, and direct records
 */
const extractRecipientsFromTeams = (teamsList) => {
  const recipientMap = new Map();

  const addRecipient = (rawName, rawEmail, teamName) => {
    if (!rawEmail || typeof rawEmail !== 'string') return;
    const cleanEmail = rawEmail.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) return;

    let candidateName = (rawName || '').toString().trim();
    const lower = candidateName.toLowerCase();
    const isPlaceholder = (
      !candidateName ||
      lower === '—' ||
      lower === '-' ||
      lower === 'undefined' ||
      lower === 'null' ||
      lower === 'none' ||
      lower === 'na' ||
      lower === 'n/a' ||
      lower === 'team leader' ||
      lower === 'team member' ||
      lower === 'participant'
    );

    if (isPlaceholder) {
      const prefix = cleanEmail.split('@')[0].replace(/[0-9._-]+/g, ' ').trim();
      candidateName = prefix
        ? prefix.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        : 'Participant';
    }

    const formattedName = formatParticipantName(candidateName);

    if (recipientMap.has(cleanEmail)) {
      const existing = recipientMap.get(cleanEmail);
      if (existing.name === 'Participant' && formattedName !== 'Participant') {
        recipientMap.set(cleanEmail, {
          name: formattedName,
          email: cleanEmail,
          teamName: teamName || existing.teamName || 'IdeaJam 2026',
        });
      }
      return;
    }

    recipientMap.set(cleanEmail, {
      name: formattedName,
      email: cleanEmail,
      teamName: teamName || 'IdeaJam 2026',
    });
  };

  for (const team of teamsList) {
    if (!team) continue;
    const teamDisplayName = team.teamName || team.team || (team.name ? `${team.name}'s Team` : 'IdeaJam 2026');

    // 1. Direct participant record fields
    if (team.email) {
      const directName = team.name || team.fullName || team.participantName || team.studentName || team.userName || team.leaderName;
      addRecipient(directName, team.email, teamDisplayName);
    }

    // 2. Leader
    if (team.leader) {
      if (typeof team.leader === 'object') {
        const leaderName = team.leader.name || team.leader.fullName || team.leader.participantName || team.leaderName || team.name;
        const leaderEmail = team.leader.email || team.leaderEmail || team.email;
        addRecipient(leaderName, leaderEmail, teamDisplayName);
      } else if (typeof team.leader === 'string' && team.leader !== '—') {
        addRecipient(team.leader, team.leaderEmail || team.email, teamDisplayName);
      }
    }

    // 3. Team Members Array
    if (Array.isArray(team.members)) {
      for (const m of team.members) {
        if (!m) continue;
        if (typeof m === 'object') {
          const memberName = m.name || m.fullName || m.memberName || m.participantName || m.studentName;
          const memberEmail = m.email || m.memberEmail || m.userEmail;
          addRecipient(memberName, memberEmail, teamDisplayName);
        } else if (typeof m === 'string') {
          if (isValidEmail(m)) {
            addRecipient('', m, teamDisplayName);
          } else {
            addRecipient(m, '', teamDisplayName);
          }
        }
      }
    }

    // 4. Explicit member property fields
    for (let i = 1; i <= 10; i++) {
      const mName = team[`member${i}_name`] || team[`member${i}Name`];
      const mEmail = team[`member${i}_email`] || team[`member${i}Email`];
      if (mEmail) {
        addRecipient(mName, mEmail, teamDisplayName);
      }
    }
  }

  return Array.from(recipientMap.values());
};

/**
 * Helper: Send certificate to a single participant with buffer generation
 */
const deliverCertificateToPerson = async ({ name, email, teamName }) => {
  try {
    const cleanName = formatParticipantName(name || 'Participant');
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      return { success: false, name: cleanName, email: cleanEmail, error: 'Invalid email address' };
    }

    const certBuffer = await generateCertificateBuffer(cleanName);
    const sendRes = await sendCertificateEmail({
      recipientName: cleanName,
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
      name: formatParticipantName(name || 'Participant'),
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

    let detectedName = (
      directNameInput ||
      leaderName ||
      (req.body?.name && req.body.name !== detectedEmail ? req.body.name : '') ||
      (req.body?.participantName || '')
    ).toString().trim();

    // 1. Direct single email dispatch
    if (detectedEmail && isValidEmail(detectedEmail)) {
      let resolvedTeamName = req.body?.teamName || req.body?.team || '';
      let dbUser = null;

      try {
        dbUser = await Registration.findOne({
          $or: [
            { email: detectedEmail },
            { 'leader.email': detectedEmail },
            { 'members.email': detectedEmail },
          ],
        }).lean();

        if (dbUser) {
          if (!resolvedTeamName) {
            resolvedTeamName = dbUser.teamName || dbUser.team || '';
          }
          if (!detectedName || detectedName.toLowerCase() === 'participant') {
            if (dbUser.email === detectedEmail) {
              detectedName = dbUser.name || dbUser.fullName || dbUser.participantName || dbUser.studentName || '';
            } else if (dbUser.leader?.email === detectedEmail) {
              detectedName = dbUser.leader.name || '';
            } else if (Array.isArray(dbUser.members)) {
              const matchedMember = dbUser.members.find((m) => m && m.email?.toLowerCase() === detectedEmail);
              if (matchedMember) {
                detectedName = matchedMember.name || '';
              }
            }
          }
        }
      } catch (dbLookupErr) {
        console.warn('Single certificate DB lookup notice:', dbLookupErr.message);
      }

      const cleanName = formatParticipantName(detectedName || 'Participant');
      const singleRes = await deliverCertificateToPerson({
        name: cleanName,
        email: detectedEmail,
        teamName: resolvedTeamName || 'IdeaJam 2026',
      });

      return res.status(200).json({
        success: singleRes.success,
        message: singleRes.success
          ? `Certificate sent successfully to ${detectedEmail} (${cleanName})`
          : `Failed sending certificate to ${detectedEmail}: ${singleRes.error}`,
        summary: {
          sent: singleRes.success ? 1 : 0,
          failed: singleRes.success ? 0 : 1,
          skipped: 0,
          totalRecipients: 1,
        },
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
      if (Array.isArray(rawArray) && rawArray.length > 0 && typeof rawArray[0] === 'object' && rawArray[0]?.email) {
        registrations = rawArray;
      } else {
        return res.status(404).json({
          success: false,
          message: `No matching participant or team found for "${lookupId || 'specified query'}".`,
          summary: { sent: 0, failed: 1, skipped: 0, totalRecipients: 0 },
        });
      }
    }

    // 3. Extract unique recipients across teams & individual participants
    const recipients = extractRecipientsFromTeams(registrations);

    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid recipient email addresses found in matched registrations.',
        summary: { sent: 0, failed: 1, skipped: 0, totalRecipients: 0 },
      });
    }

    console.log(`🚀 [Certificates] Analyzed ${registrations.length} team(s)/group(s). Starting dispatch to all ${recipients.length} individual members...`);

    // For single or small team (<= 3 members): process synchronously and return full result
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
        summary: {
          sent: successCount,
          failed: recipients.length - successCount,
          skipped: 0,
          totalRecipients: recipients.length,
        },
        stats: {
          totalTeams: registrations.length,
          totalRecipients: recipients.length,
          sentCount: successCount,
          failedCount: recipients.length - successCount,
        },
        results,
      });
    }

    // For 60+ members or multi-member groups (> 3 members):
    const results = [];
    const BATCH_SIZE = 6;

    // Process first batch
    const firstBatch = recipients.slice(0, BATCH_SIZE);
    const firstBatchPromises = firstBatch.map((r) => deliverCertificateToPerson(r));
    const firstSettled = await Promise.allSettled(firstBatchPromises);
    const firstResults = firstSettled.map((s) => (s.status === 'fulfilled' ? s.value : { success: false, error: s.reason?.message }));
    results.push(...firstResults);

    // Process remainder in background queue
    if (recipients.length > BATCH_SIZE) {
      const remaining = recipients.slice(BATCH_SIZE);
      (async () => {
        for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
          const batch = remaining.slice(i, i + BATCH_SIZE);
          const batchPromises = batch.map((r) => deliverCertificateToPerson(r));
          await Promise.allSettled(batchPromises);
          if (i + BATCH_SIZE < remaining.length) {
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
        }
        console.log(`🎉 [Certificates] All ${recipients.length} certificates processed successfully across ${registrations.length} team(s)/group(s).`);
      })().catch((err) => console.error('Background bulk dispatch error:', err));
    }

    const firstSuccessCount = firstResults.filter((r) => r.success).length;

    return res.status(200).json({
      success: true,
      message: `Analyzing completed! Certificates dispatch started for all ${recipients.length} members across ${registrations.length} team(s)/group(s).`,
      summary: {
        sent: firstSuccessCount + (recipients.length - firstBatch.length),
        failed: firstResults.length - firstSuccessCount,
        skipped: 0,
        totalRecipients: recipients.length,
      },
      stats: {
        totalTeams: registrations.length,
        totalRecipients: recipients.length,
        sentCount: firstSuccessCount,
        queuedCount: recipients.length - firstBatch.length,
      },
      results,
    });
  } catch (error) {
    console.error('❌ [Certificates Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while sending certificates: ' + error.message,
      summary: { sent: 0, failed: 1, skipped: 0, totalRecipients: 0 },
    });
  }
};

/**
 * Frontend Dashboard Endpoint: POST /api/certificates/send-page
 * Dispatches certificates to all participants / teams on the specified page (e.g. 60 members per page)
 */
export const sendCertificatesPage = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.body?.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.body?.limit, 10) || 60);
    const skip = (page - 1) * limit;

    let teams = [];
    try {
      teams = await Registration.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    } catch (err) {
      teams = inMemoryRegistrations.slice(skip, skip + limit);
    }

    if (!teams || teams.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No teams found for the specified page.',
        summary: { sent: 0, failed: 0, skipped: 0, totalRecipients: 0 },
        results: [],
      });
    }

    // Extract all recipients across teams (Leader + all members)
    const recipients = extractRecipientsFromTeams(teams);
    const totalRecipients = recipients.length;

    if (totalRecipients === 0) {
      return res.status(200).json({
        success: true,
        message: 'No eligible recipients with valid emails found on this page.',
        summary: { sent: 0, failed: 0, skipped: 0, totalRecipients: 0 },
        results: [],
      });
    }

    console.log(`🚀 [Certificates Page ${page}] Dispatching to ${totalRecipients} recipients across ${teams.length} teams...`);

    // Process first batch in parallel
    const BATCH_SIZE = 6;
    const firstBatch = recipients.slice(0, BATCH_SIZE);
    const firstResults = await Promise.allSettled(firstBatch.map((r) => deliverCertificateToPerson(r)));
    const results = firstResults.map((s) => (s.status === 'fulfilled' ? s.value : { success: false, error: s.reason?.message }));

    // Queue remainder in background
    if (totalRecipients > BATCH_SIZE) {
      const remaining = recipients.slice(BATCH_SIZE);
      (async () => {
        for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
          const batch = remaining.slice(i, i + BATCH_SIZE);
          await Promise.allSettled(batch.map((r) => deliverCertificateToPerson(r)));
          if (i + BATCH_SIZE < remaining.length) {
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
        }
        console.log(`🎉 [Certificates Page ${page}] All ${totalRecipients} certificates dispatched.`);
      })().catch((err) => console.error('Background page batch dispatch error:', err));
    }

    const sentCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return res.status(200).json({
      success: true,
      message: `Certificates dispatch initiated for all ${totalRecipients} members on page ${page}!`,
      summary: {
        sent: sentCount + (totalRecipients - firstBatch.length),
        failed: failedCount,
        skipped: 0,
        totalRecipients,
      },
      results,
    });
  } catch (error) {
    console.error('❌ [sendCertificatesPage Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to dispatch certificates for page: ' + error.message,
      summary: { sent: 0, failed: 1, skipped: 0, totalRecipients: 0 },
    });
  }
};

/**
 * Admin / Frontend: POST /api/certificates/send-team/:id
 * Dispatch certificates to a specific team's leader & members
 */
export const sendTeamCertificate = async (req, res) => {
  req.body = { ...(req.body || {}), teamId: req.params.id || req.body?.teamId || req.body?.id };
  return sendCertificates(req, res);
};



