import express from 'express';
import {
  registerTeam,
  getAllRegistrations,
  getRegistrationById,
  getAdminTeams,
  updateTeamStatus,
  getRoundProgress,
  updateRound2Status,
  updateRound2Evaluation,
  updateRound3Evaluation,
} from '../controllers/registrationController.js';

const router = express.Router();

// Public Registration Endpoints
router.post('/register', registerTeam);
router.get('/registrations', getAllRegistrations);
router.get('/registrations/:id', getRegistrationById);

// Admin Control Center Endpoints
router.get('/admin/teams', getAdminTeams);
router.get('/admin/teams/:id', getRegistrationById);
router.patch('/admin/teams/:id/status', updateTeamStatus);
router.get('/admin/round-progress', getRoundProgress);
router.patch('/admin/round2/:id/status', updateRound2Status);
router.patch('/admin/round2/:id/evaluation', updateRound2Evaluation);
router.patch('/admin/round3/:id/evaluation', updateRound3Evaluation);

export default router;
