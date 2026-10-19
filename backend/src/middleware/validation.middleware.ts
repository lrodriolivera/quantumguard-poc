/**
 * Validation Middleware
 * Request validation and sanitization
 */

import { Request, Response, NextFunction } from 'express';
import { SUPPORTED_ALGORITHMS, canonicalAlgorithm } from '../utils/signature.utils';

/**
 * Validate required fields in request body
 */
export const validateRequired = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missingFields: string[] = [];

    for (const field of fields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Missing required fields: ${missingFields.join(', ')}`,
      });
      return;
    }

    next();
  };
};

/**
 * Validate email format
 */
export const validateEmail = (req: Request, res: Response, next: NextFunction): void => {
  const { email } = req.body;

  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid email format',
      });
      return;
    }
  }

  next();
};

/**
 * Validate password strength
 */
export const validatePassword = (req: Request, res: Response, next: NextFunction): void => {
  const { password } = req.body;

  if (password) {
    if (password.length < 8) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Password must be at least 8 characters long',
      });
      return;
    }
  }

  next();
};

/**
 * Validate UUID format
 */
export const validateUUID = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const uuid = req.params[paramName];

    if (uuid) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(uuid)) {
        res.status(400).json({
          error: 'Bad Request',
          message: `Invalid ${paramName} format`,
        });
        return;
      }
    }

    next();
  };
};

/**
 * Validate algorithm parameter
 */
export const validateAlgorithm = (req: Request, res: Response, next: NextFunction): void => {
  const { algorithm } = req.body;

  if (algorithm && !canonicalAlgorithm(algorithm)) {
    res.status(400).json({
      error: 'Bad Request',
      message: `Invalid algorithm. Supported: ${SUPPORTED_ALGORITHMS.join(', ')}`,
    });
    return;
  }

  next();
};

/**
 * Sanitize string inputs (remove potential XSS)
 */
export const sanitizeInputs = (req: Request, res: Response, next: NextFunction): void => {
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .trim();
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key of Object.keys(obj)) {
        sanitized[key] = sanitize(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }

  next();
};

/**
 * Validate file upload
 */
export const validateFileUpload = (options: {
  maxSize?: number;
  allowedTypes?: string[];
}) => {
  const maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB default
  const allowedTypes = options.allowedTypes || [];

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.file) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'No file uploaded',
      });
      return;
    }

    // Check file size
    if (req.file.size > maxSize) {
      res.status(400).json({
        error: 'Bad Request',
        message: `File too large. Maximum size: ${maxSize / (1024 * 1024)}MB`,
      });
      return;
    }

    // Check file type if specified
    if (allowedTypes.length > 0 && !allowedTypes.includes(req.file.mimetype)) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Invalid file type. Allowed: ${allowedTypes.join(', ')}`,
      });
      return;
    }

    next();
  };
};

/**
 * Validate pagination parameters
 */
export const validatePagination = (req: Request, res: Response, next: NextFunction): void => {
  const { page, limit } = req.query;

  if (page) {
    const pageNum = parseInt(page as string, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Page must be a positive integer',
      });
      return;
    }
    req.query.page = String(pageNum);
  }

  if (limit) {
    const limitNum = parseInt(limit as string, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Limit must be between 1 and 100',
      });
      return;
    }
    req.query.limit = String(limitNum);
  }

  next();
};
