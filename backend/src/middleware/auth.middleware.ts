/**
 * Auth Middleware
 * JWT authentication middleware for protected routes
 */

import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { User } from '../models/user.model';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
    }
  }
}

/**
 * Middleware to authenticate JWT token
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided',
      });
      return;
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token and get user
    const user = await authService.getUserByToken(token);

    // Attach user to request
    req.user = user;
    req.userId = user.id;

    next();
  } catch (error: any) {
    res.status(401).json({
      error: 'Unauthorized',
      message: error.message || 'Invalid token',
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 * But attaches user if token is valid
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const user = await authService.getUserByToken(token);
      req.user = user;
      req.userId = user.id;
    }

    next();
  } catch (error) {
    // Continue without user
    next();
  }
};
