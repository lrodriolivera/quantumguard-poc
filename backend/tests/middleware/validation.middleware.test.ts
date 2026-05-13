/**
 * Validation Middleware Unit Tests
 */

import { Request, Response, NextFunction } from 'express';
import {
  validateRequired,
  validateEmail,
  validatePassword,
  validateUUID,
  validateAlgorithm,
  sanitizeInputs,
  validatePagination,
} from '../../src/middleware/validation.middleware';

// Mock Express objects
const mockRequest = (body: any = {}, params: any = {}, query: any = {}) => ({
  body,
  params,
  query,
});

const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn();

describe('Validation Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateRequired', () => {
    it('should pass when all required fields are present', () => {
      const req = mockRequest({ email: 'test@test.com', password: 'password123' });
      const res = mockResponse();
      const middleware = validateRequired(['email', 'password']);

      middleware(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should fail when required fields are missing', () => {
      const req = mockRequest({ email: 'test@test.com' });
      const res = mockResponse();
      const middleware = validateRequired(['email', 'password']);

      middleware(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: expect.stringContaining('password'),
        })
      );
    });

    it('should fail when field is empty string', () => {
      const req = mockRequest({ email: '', password: 'password123' });
      const res = mockResponse();
      const middleware = validateRequired(['email', 'password']);

      middleware(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateEmail', () => {
    it('should pass with valid email', () => {
      const req = mockRequest({ email: 'test@example.com' });
      const res = mockResponse();

      validateEmail(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should fail with invalid email', () => {
      const req = mockRequest({ email: 'invalid-email' });
      const res = mockResponse();

      validateEmail(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid email format',
        })
      );
    });

    it('should pass when no email provided', () => {
      const req = mockRequest({});
      const res = mockResponse();

      validateEmail(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validatePassword', () => {
    it('should pass with valid password', () => {
      const req = mockRequest({ password: 'password123' });
      const res = mockResponse();

      validatePassword(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should fail with short password', () => {
      const req = mockRequest({ password: 'short' });
      const res = mockResponse();

      validatePassword(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('8 characters'),
        })
      );
    });
  });

  describe('validateUUID', () => {
    it('should pass with valid UUID', () => {
      const req = mockRequest({}, { id: '550e8400-e29b-41d4-a716-446655440000' });
      const res = mockResponse();
      const middleware = validateUUID('id');

      middleware(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should fail with invalid UUID', () => {
      const req = mockRequest({}, { id: 'not-a-uuid' });
      const res = mockResponse();
      const middleware = validateUUID('id');

      middleware(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateAlgorithm', () => {
    it('should pass with valid algorithm', () => {
      const req = mockRequest({ algorithm: 'Dilithium2' });
      const res = mockResponse();

      validateAlgorithm(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should pass with ML-DSA algorithm', () => {
      const req = mockRequest({ algorithm: 'ML-DSA-65' });
      const res = mockResponse();

      validateAlgorithm(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should fail with invalid algorithm', () => {
      const req = mockRequest({ algorithm: 'InvalidAlgorithm' });
      const res = mockResponse();

      validateAlgorithm(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('sanitizeInputs', () => {
    it('should sanitize XSS in string inputs', () => {
      const req = mockRequest({ name: '<script>alert("xss")</script>' });
      const res = mockResponse();

      sanitizeInputs(req as any, res as any, mockNext);

      expect(req.body.name).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should trim whitespace', () => {
      const req = mockRequest({ name: '  John Doe  ' });
      const res = mockResponse();

      sanitizeInputs(req as any, res as any, mockNext);

      expect(req.body.name).toBe('John Doe');
    });

    it('should handle nested objects', () => {
      const req = mockRequest({
        user: {
          name: '<b>Test</b>',
        },
      });
      const res = mockResponse();

      sanitizeInputs(req as any, res as any, mockNext);

      expect(req.body.user.name).toBe('&lt;b&gt;Test&lt;/b&gt;');
    });
  });

  describe('validatePagination', () => {
    it('should pass with valid pagination', () => {
      const req = mockRequest({}, {}, { page: '1', limit: '10' });
      const res = mockResponse();

      validatePagination(req as any, res as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.query.page).toBe('1');
      expect(req.query.limit).toBe('10');
    });

    it('should fail with invalid page', () => {
      const req = mockRequest({}, {}, { page: '0' });
      const res = mockResponse();

      validatePagination(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should fail with limit over 100', () => {
      const req = mockRequest({}, {}, { limit: '200' });
      const res = mockResponse();

      validatePagination(req as any, res as any, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
