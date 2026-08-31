import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Registration from '../models/Registration.js';
import { sendRegistrationConfirmationEmails } from '../services/mailService.js';

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
        driveLink: cleanDriveLink,
        status: 'Pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemoryRegistrations.unshift(fallbackRecord);
      saveDiskRegistrationsAsync(inMemoryRegistrations);
      savedRegistration = fallbackRecord;
    }

    // 4. Asynchronous Background Email Dispatch (Non-blocking for high concurrency)
    setImmediate(async () => {
      try {
        const emailResult = await sendRegistrationConfirmationEmails({
          teamName: cleanTeamName,
          leader: {
            name: cleanLeaderName,
            email: cleanLeaderEmail,
            phone: cleanLeaderPhone,
          },
          members: cleanMembers,
          registrationId,
        });

        if (isDbConnected && savedRegistration?._id) {
          await Registration.findByIdAndUpdate(savedRegistration._id, {
            'emailNotification.leaderDelivered': emailResult.leaderSent,
            'emailNotification.membersDeliveredCount': emailResult.membersSentCount,
            'emailNotification.lastSentAt': new Date(),
          });
        }
      } catch (emailErr) {
        console.error('⚠️ [Async Email Notice]:', emailErr.message);
      }
    });

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
    problem: item.problem || 'Registered Solution',
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

