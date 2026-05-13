/**
 * Auth Service Unit Tests
 */

import { AuthService } from '../../src/services/auth.service';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'testPassword123';
      const hash = await authService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'testPassword123';
      const hash1 = await authService.hashPassword(password);
      const hash2 = await authService.hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('comparePassword', () => {
    it('should return true for matching password', async () => {
      const password = 'testPassword123';
      const hash = await authService.hashPassword(password);
      const isMatch = await authService.comparePassword(password, hash);

      expect(isMatch).toBe(true);
    });

    it('should return false for non-matching password', async () => {
      const password = 'testPassword123';
      const hash = await authService.hashPassword(password);
      const isMatch = await authService.comparePassword('wrongPassword', hash);

      expect(isMatch).toBe(false);
    });
  });

  describe('generateAccessToken', () => {
    it('should generate a valid JWT token', () => {
      const userId = 'test-user-id';
      const email = 'test@example.com';
      const token = authService.generateAccessToken(userId, email);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid refresh token', () => {
      const userId = 'test-user-id';
      const email = 'test@example.com';
      const token = authService.generateRefreshToken(userId, email);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });
  });

  describe('generateTokens', () => {
    it('should generate both access and refresh tokens', () => {
      const userId = 'test-user-id';
      const email = 'test@example.com';
      const tokens = authService.generateTokens(userId, email);

      expect(tokens).toBeDefined();
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBeDefined();
    });

    it('should generate different access and refresh tokens', () => {
      const userId = 'test-user-id';
      const email = 'test@example.com';
      const tokens = authService.generateTokens(userId, email);

      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const userId = 'test-user-id';
      const email = 'test@example.com';
      const token = authService.generateAccessToken(userId, email);

      const payload = authService.verifyToken(token);

      expect(payload).toBeDefined();
      expect(payload.userId).toBe(userId);
      expect(payload.email).toBe(email);
      expect(payload.type).toBe('access');
    });

    it('should throw error for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => authService.verifyToken(invalidToken)).toThrow('Invalid or expired token');
    });

    it('should verify refresh token correctly', () => {
      const userId = 'test-user-id';
      const email = 'test@example.com';
      const token = authService.generateRefreshToken(userId, email);

      const payload = authService.verifyToken(token);

      expect(payload.type).toBe('refresh');
    });
  });
});
