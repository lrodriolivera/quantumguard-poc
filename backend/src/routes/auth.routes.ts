/**
 * Auth Routes
 * Authentication and authorization endpoints
 */

import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * Public routes (no authentication required)
 */

// POST /api/auth/register - Register new user
router.post('/register', (req, res) => authController.register(req, res));

// POST /api/auth/login - Login user
router.post('/login', (req, res) => authController.login(req, res));

// POST /api/auth/refresh - Refresh access token
router.post('/refresh', (req, res) => authController.refreshToken(req, res));

/**
 * Protected routes (authentication required)
 */

// GET /api/auth/me - Get current user profile
router.get('/me', authenticate, (req, res) => authController.getProfile(req, res));

// POST /api/auth/change-password - Change user password
router.post('/change-password', authenticate, (req, res) =>
  authController.changePassword(req, res)
);

// POST /api/auth/logout - Logout user (client-side token removal)
router.post('/logout', authenticate, (req, res) => authController.logout(req, res));

export default router;
