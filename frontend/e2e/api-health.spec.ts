import { test, expect } from '@playwright/test';

test.describe('API Health - Backend & Crypto Service', () => {
  test('01 - frontend serves HTML', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');
  });

  test('02 - backend API responds', async ({ request }) => {
    const res = await request.get('/api/auth/me');
    // 401 is expected without token - proves API is alive
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('03 - health endpoint responds', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
  });
});
