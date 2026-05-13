/**
 * Auth Controller
 * Handles user authentication, registration, and token management
 */

import { Request, Response } from 'express';
import { authService } from '../services/auth.service';

export class AuthController {
  /**
   * Register a new user
   * POST /api/auth/register
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, first_name, last_name } = req.body;

      // Validate required fields
      if (!email || !password) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Email and password are required',
        });
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid email format',
        });
        return;
      }

      // Validate password length
      if (password.length < 8) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Password must be at least 8 characters long',
        });
        return;
      }

      // Register user
      const { user, tokens } = await authService.register(
        email,
        password,
        first_name,
        last_name
      );

      res.status(201).json({
        message: 'User registered successfully',
        user: user.toSafeJSON(),
        ...tokens,
      });
    } catch (error: any) {
      console.error('Registration error:', error);

      if (error.message === 'User already exists') {
        res.status(409).json({
          error: 'Conflict',
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to register user',
      });
    }
  }

  /**
   * Login user
   * POST /api/auth/login
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      // Validate required fields
      if (!email || !password) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Email and password are required',
        });
        return;
      }

      // Login user
      const { user, tokens } = await authService.login(email, password);

      res.status(200).json({
        message: 'Login successful',
        user: user.toSafeJSON(),
        ...tokens,
      });
    } catch (error: any) {
      console.error('Login error:', error);

      if (error.message === 'Invalid credentials' || error.message === 'Account is disabled') {
        res.status(401).json({
          error: 'Unauthorized',
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to login',
      });
    }
  }

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Refresh token is required',
        });
        return;
      }

      const tokens = await authService.refreshAccessToken(refreshToken);

      res.status(200).json({
        message: 'Token refreshed successfully',
        ...tokens,
      });
    } catch (error: any) {
      console.error('Token refresh error:', error);

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token',
      });
    }
  }

  /**
   * Get current user profile
   * GET /api/auth/me
   */
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
        return;
      }

      res.status(200).json({
        user: req.user.toSafeJSON(),
      });
    } catch (error: any) {
      console.error('Get profile error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get user profile',
      });
    }
  }

  /**
   * Change password
   * POST /api/auth/change-password
   */
  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const { oldPassword, newPassword } = req.body;

      if (!req.userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
        return;
      }

      if (!oldPassword || !newPassword) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Old password and new password are required',
        });
        return;
      }

      if (newPassword.length < 8) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'New password must be at least 8 characters long',
        });
        return;
      }

      await authService.changePassword(req.userId, oldPassword, newPassword);

      res.status(200).json({
        message: 'Password changed successfully',
      });
    } catch (error: any) {
      console.error('Change password error:', error);

      if (error.message === 'Invalid current password') {
        res.status(401).json({
          error: 'Unauthorized',
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to change password',
      });
    }
  }

  /**
   * Logout (client-side only, invalidate token on client)
   * POST /api/auth/logout
   */
  async logout(req: Request, res: Response): Promise<void> {
    // In a JWT-based system, logout is typically handled client-side
    // by removing the token. For more security, you could implement
    // a token blacklist in Redis.

    res.status(200).json({
      message: 'Logout successful',
    });
  }
}

// Export singleton instance
export const authController = new AuthController();
