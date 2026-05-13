/**
 * Jest Test Setup
 * Configures the test environment
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.CRYPTO_SERVICE_URL = 'http://localhost:8001';
process.env.DATABASE_URL = 'postgres://postgres:quantum123@localhost:5432/quantumguard_test';

// Increase timeout for async operations
jest.setTimeout(30000);

// Global cleanup
afterAll(async () => {
  // Add cleanup logic if needed
});
