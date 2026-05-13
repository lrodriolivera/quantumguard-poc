/**
 * API Integration Tests
 * Tests the Express app endpoints
 */

import request from 'supertest';
import app from '../../src/app';

// Note: These tests require the database and crypto service to be running
// Run with: npm test -- --testPathPattern=integration

describe('API Integration Tests', () => {
  describe('Health Check', () => {
    it('GET /health should return healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('service', 'quantumguard-backend-api');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('API Info', () => {
    it('GET /api should return API information', async () => {
      const response = await request(app).get('/api');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'QuantumGuard API');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('endpoints');
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown/route');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
    });
  });

  describe('Auth Endpoints', () => {
    describe('POST /api/auth/register', () => {
      it('should reject registration without email', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({ password: 'password123' });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      });

      it('should reject registration without password', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({ email: 'test@example.com' });

        expect(response.status).toBe(400);
      });

      it('should reject registration with short password', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({ email: 'test@example.com', password: 'short' });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('8 characters');
      });

      it('should reject registration with invalid email', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({ email: 'invalid-email', password: 'password123' });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('email');
      });
    });

    describe('POST /api/auth/login', () => {
      it('should reject login without credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({});

        expect(response.status).toBe(400);
      });

      it('should reject login with invalid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({ email: 'nonexistent@example.com', password: 'wrongpassword' });

        expect(response.status).toBe(401);
      });
    });

    describe('POST /api/auth/refresh', () => {
      it('should reject refresh without token', async () => {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({});

        expect(response.status).toBe(400);
      });

      it('should reject refresh with invalid token', async () => {
        const response = await request(app)
          .post('/api/auth/refresh')
          .send({ refreshToken: 'invalid-token' });

        expect(response.status).toBe(401);
      });
    });
  });

  describe('Protected Endpoints', () => {
    describe('GET /api/documents', () => {
      it('should reject request without auth token', async () => {
        const response = await request(app).get('/api/documents');

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('message', 'No token provided');
      });

      it('should reject request with invalid auth token', async () => {
        const response = await request(app)
          .get('/api/documents')
          .set('Authorization', 'Bearer invalid-token');

        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/users/profile', () => {
      it('should reject request without auth token', async () => {
        const response = await request(app).get('/api/users/profile');

        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/users/stats', () => {
      it('should reject request without auth token', async () => {
        const response = await request(app).get('/api/users/stats');

        expect(response.status).toBe(401);
      });
    });
  });

  describe('Document Verification (Public)', () => {
    describe('POST /api/documents/verify', () => {
      it('should reject verification without file', async () => {
        const response = await request(app)
          .post('/api/documents/verify')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('file');
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const response = await request(app).get('/health');

      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers from helmet', async () => {
      const response = await request(app).get('/health');

      // Helmet adds various security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });
  });

  describe('CORS', () => {
    it('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/api/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      // Should not be 404
      expect(response.status).not.toBe(404);
    });
  });
});
