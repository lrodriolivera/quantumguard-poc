/**
 * Users Routes
 * User profile and statistics endpoints
 */

import { Router } from 'express';
import { usersController } from '../controllers/users.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * All routes require authentication
 */

// GET /api/users/profile - Get user profile
router.get('/profile', authenticate, (req, res) => usersController.getProfile(req, res));

// PUT /api/users/profile - Update user profile
router.put('/profile', authenticate, (req, res) => usersController.updateProfile(req, res));

// GET /api/users/stats - Get user statistics
router.get('/stats', authenticate, (req, res) => usersController.getStats(req, res));

// GET /api/users/activity - Get user activity history
router.get('/activity', authenticate, (req, res) => usersController.getActivity(req, res));

export default router;
