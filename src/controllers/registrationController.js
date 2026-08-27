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

const saveDiskRegistrations = (list) => {
  try {
    initDiskStore();
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing disk registrations:', err.message);
  }
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
    const { teamName, leaderName, leaderEmail, leaderPhone, driveLink, members } = req.body;

    // 1. Validation
    if (!teamName || !teamName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Team name is required.',
      });
    }

    if (!leaderName || !leaderName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Team leader name is required.',
      });
    }

    if (!leaderEmail || !isValidEmail(leaderEmail)) {
      return res.status(400).json({
        success: false,
        message: 'A valid team leader email address is required.',
      });
    }

    if (!leaderPhone || !leaderPhone.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Team leader phone number is required.',
      });
    }

    if (!Array.isArray(members) || members.length < 1) {
      return res.status(400).json({
        success: false,
        message: 'A minimum of 1 team member (in addition to leader) is required.',
      });
    }

    if (members.length > 5) {
      return res.status(400).json({
        success: false,
        message: 'A maximum of 5 team members is allowed.',
      });
    }

    // Validate each member
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (!m.name || !m.name.trim()) {
        return res.status(400).json({
          success: false,
          message: `Team member #${i + 1} name is required.`,
        });
      }
      if (!m.email || !isValidEmail(m.email)) {
        return res.status(400).json({
          success: false,
          message: `A valid email is required for member #${i + 1} (${m.name || 'Unnamed'}).`,
        });
      }
    }

    const cleanTeamName = teamName.trim();
    const cleanLeaderEmail = leaderEmail.trim().toLowerCase();
    const cleanLeaderName = leaderName.trim();
    const cleanLeaderPhone = leaderPhone.trim();
    const cleanDriveLink = (driveLink || '').trim();
    const cleanMembers = members.map((m, idx) => ({
      id: m.id || idx + 1,
      name: m.name.trim(),
      email: m.email.trim().toLowerCase(),
    }));

    // 2. Generate unique Registration ID
    let registrationId = generateRegistrationId();

    // 3. Save to MongoDB (or fallback disk/memory)
    let savedRegistration = null;
    let isDbConnected = false;

    try {
      // Check for duplicate team leader email in MongoDB
      const existingLeader = await Registration.findOne({ 'leader.email': cleanLeaderEmail });
      if (existingLeader) {
        return res.status(409).json({
          success: false,
          message: `This team leader email (${cleanLeaderEmail}) is already registered under team "${existingLeader.teamName}".`,
          registrationId: existingLeader.registrationId,
        });
      }

      // Check for duplicate team name in MongoDB
      const existingTeam = await Registration.findOne({
        teamName: { $regex: new RegExp(`^${cleanTeamName}$`, 'i') },
      });
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
      saveDiskRegistrations(inMemoryRegistrations);
      savedRegistration = fallbackRecord;
    }

    // 4. Send Confirmation Emails to Leader & All Members asynchronously
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

    // 5. Update record with email dispatch status
    if (isDbConnected && savedRegistration?._id) {
      try {
        await Registration.findByIdAndUpdate(savedRegistration._id, {
          'emailNotification.leaderDelivered': emailResult.leaderSent,
          'emailNotification.membersDeliveredCount': emailResult.membersSentCount,
          'emailNotification.lastSentAt': new Date(),
        });
      } catch (err) {
        console.error('Error updating email status in DB:', err.message);
      }
    } else if (savedRegistration) {
      savedRegistration.emailNotification = {
        leaderDelivered: emailResult.leaderSent,
        membersDeliveredCount: emailResult.membersSentCount,
        lastSentAt: new Date(),
      };
      saveDiskRegistrations(inMemoryRegistrations);
    }

    // 6. Return response
    return res.status(201).json({
      success: true,
      message: 'Team registered successfully! Confirmation emails have been dispatched to the leader and all team members.',
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
        emailNotification: emailResult,
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
      registrations = await Registration.find().sort({ createdAt: -1 });
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
      });
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
      data: registration,
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
      list = await Registration.find().sort({ createdAt: -1 });
    } catch (err) {
      list = inMemoryRegistrations;
    }

    const formatted = list.map((item, idx) => ({
      id: item.registrationId || item._id || idx + 1,
      team: item.teamName || item.team || 'Unnamed Team',
      leader: item.leader?.name || item.leader || '—',
      email: item.leader?.email || item.email || '—',
      phone: item.leader?.phone || item.phone || '—',
      department: item.department || 'General',
      route: item.route || 'SIH Problem Statement',
      problem: item.problem || 'Registered Solution',
      idea: item.idea || 'Idea submission for IdeaJam 2026',
      ppt: item.driveLink || item.ppt || '',
      driveLink: item.driveLink || '',
      status: item.status || 'Pending',
      score: item.score || null,
      remark: item.remark || '',
      members: item.members || [],
      round2Marks: item.round2Marks || {},
      round3Marks: item.round3Marks || {},
      round2Status: item.round2Status || 'Pending',
      createdAt: item.createdAt || new Date(),
    }));

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
      );
    } catch (err) {
      const idx = inMemoryRegistrations.findIndex((r) => r.registrationId === id || r._id === id);
      if (idx !== -1) {
        inMemoryRegistrations[idx].status = status;
        inMemoryRegistrations[idx].remark = remark;
        saveDiskRegistrations(inMemoryRegistrations);
        updated = inMemoryRegistrations[idx];
      }
    }

    return res.status(200).json({
      success: true,
      data: updated,
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
      list = await Registration.find();
    } catch (err) {
      list = inMemoryRegistrations;
    }

    const round2Teams = list.filter((t) => t.status === 'Accepted');
    const round3Teams = list.filter((t) => t.round2Status === 'Accepted');

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
      );
    } catch (err) {
      const idx = inMemoryRegistrations.findIndex((r) => r.registrationId === id || r._id === id);
      if (idx !== -1) {
        inMemoryRegistrations[idx].round2Status = status;
        inMemoryRegistrations[idx].round2Remark = remark;
        saveDiskRegistrations(inMemoryRegistrations);
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
      );
    } catch (err) {
      const idx = inMemoryRegistrations.findIndex((r) => r.registrationId === id || r._id === id);
      if (idx !== -1) {
        inMemoryRegistrations[idx].round2Marks = marks;
        inMemoryRegistrations[idx].round2Score = total;
        saveDiskRegistrations(inMemoryRegistrations);
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
      );
    } catch (err) {
      const idx = inMemoryRegistrations.findIndex((r) => r.registrationId === id || r._id === id);
      if (idx !== -1) {
        inMemoryRegistrations[idx].round3Marks = marks;
        inMemoryRegistrations[idx].round3Score = total;
        saveDiskRegistrations(inMemoryRegistrations);
        updated = inMemoryRegistrations[idx];
      }
    }

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
