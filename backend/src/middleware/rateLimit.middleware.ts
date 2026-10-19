/**
 * Rate Limiting Middleware
 * Protect API from abuse with request rate limiting
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitConfig {
  name: string; // Isolates this limiter's counters from the others
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory storage for rate limits (use Redis in production for scalability)
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clean up expired entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute

/**
 * Get client identifier (user ID if authenticated, otherwise client IP).
 * req.ip honours Express' "trust proxy" setting (see app.ts), so a client
 * cannot pick its own identity through X-Forwarded-For.
 */
const getClientId = (req: Request): string => {
  if (req.userId) {
    return `user:${req.userId}`;
  }
  return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
};

/**
 * Create rate limiter middleware
 */
export const rateLimit = (config: RateLimitConfig) => {
  const { name, windowMs, maxRequests, message = 'Too many requests, please try again later' } = config;

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientId = `${name}:${getClientId(req)}`;
    const now = Date.now();

    let entry = rateLimitStore.get(clientId);

    if (!entry || entry.resetTime < now) {
      // Create new entry or reset expired one
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(clientId, entry);
    } else {
      // Increment counter
      entry.count++;
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));

    // Check if limit exceeded
    if (entry.count > maxRequests) {
      res.status(429).json({
        error: 'Too Many Requests',
        message,
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
      return;
    }

    next();
  };
};

/**
 * Preset rate limiters for different use cases
 */

// General API rate limit: 100 requests per minute
export const generalLimiter = rateLimit({
  name: 'general',
  windowMs: 60 * 1000,
  maxRequests: 100,
});

// Auth endpoints: 10 requests per minute (prevent brute force)
export const authLimiter = rateLimit({
  name: 'auth',
  windowMs: 60 * 1000,
  maxRequests: 10,
  message: 'Too many authentication attempts, please try again later',
});

// Document signing: 20 requests per minute (resource intensive)
export const signLimiter = rateLimit({
  name: 'sign',
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: 'Too many signing requests, please try again later',
});

// Upload rate limit: 30 uploads per minute
export const uploadLimiter = rateLimit({
  name: 'upload',
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Too many upload requests, please try again later',
});

// Strict rate limit for sensitive operations: 5 requests per minute
export const strictLimiter = rateLimit({
  name: 'strict',
  windowMs: 60 * 1000,
  maxRequests: 5,
  message: 'Rate limit exceeded for sensitive operation',
});

// Public verification endpoint: 30 requests per minute per client
export const verifyLimiter = rateLimit({
  name: 'verify',
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Too many verification requests, please try again later',
});
