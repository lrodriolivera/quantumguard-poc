import { Page, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DOCS_DIR = path.join(__dirname, '..', '..', 'demo', 'documents');

export function uniqueEmail(): string {
  return `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.quantumguard.ai`;
}

export const TEST_PASSWORD = 'TestE2E_2026!';

/** Load credentials saved by global-setup */
export function getTestCredentials(): { email: string; password: string } {
  const credsPath = path.join(__dirname, '.test-credentials.json');
  return JSON.parse(readFileSync(credsPath, 'utf-8'));
}

export async function register(page: Page, email: string) {
  await page.goto('/register');
  await page.fill('input[name="firstName"]', 'Test');
  await page.fill('input[name="lastName"]', 'E2E');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.fill('input[name="confirmPassword"]', TEST_PASSWORD);
  await page.click('button:has-text("Crear Cuenta")');
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

export async function login(page: Page, email?: string, password?: string) {
  const creds = email ? { email, password: password || TEST_PASSWORD } : getTestCredentials();
  if (!page.url().includes('/login')) {
    await page.goto('/login');
  }
  await page.fill('#correo-electronico', creds.email);
  await page.fill('#contrasena', creds.password);

  // Try up to 3 times with increasing waits (rate-limit handling)
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.click('button:has-text("Iniciar Sesion")');
    try {
      await page.waitForURL('**/dashboard', { timeout: 10_000 });
      return; // success
    } catch {
      if (page.url().includes('/login')) {
        // Rate-limited (429) or auth error — wait and retry
        await page.waitForTimeout(5000 * (attempt + 1));
        // Dismiss error toast if visible
        const closeBtn = page.locator('button:near(:text("429"))');
        if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await closeBtn.click();
        }
      } else {
        return; // navigated somewhere else, probably OK
      }
    }
  }
}

/** Login using credentials from global setup */
export async function loginWithTestUser(page: Page) {
  const creds = getTestCredentials();
  await login(page, creds.email, creds.password);
}

/** SPA nav link selectors for protected routes */
const NAV_LINKS: Record<string, string> = {
  '/sign': 'a[href="/sign"]',
  '/verify': 'a[href="/verify"]',
  '/documents': 'a[href="/documents"]',
  '/profile': 'a[href="/profile"]',
  '/dashboard': 'a[href="/dashboard"]',
};

/**
 * Navigate to a protected route with auth.
 * Intercepts /api/auth/me to avoid rate-limiting (the real sign/verify/download
 * calls still hit the real backend). Then navigates via SPA links.
 */
export async function gotoAuthenticated(page: Page, route: string) {
  // Read user from storageState credentials
  const creds = getTestCredentials();

  // Intercept /api/auth/me to prevent rate-limiting on auth verification.
  // The SPA calls this on every page load — mocking it lets us focus
  // E2E tests on the actual business flows (sign, verify, documents).
  await page.route('**/api/auth/me', async (routeObj) => {
    await routeObj.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: 'e2e-test-user',
          email: creds.email,
          first_name: 'Test',
          last_name: 'E2E',
          is_active: true,
        },
      }),
    });
  });

  // Load dashboard — auth/me is mocked so it always succeeds
  await page.goto('/dashboard');
  await expect(page.locator('text=Bienvenido')).toBeVisible({ timeout: 15_000 });

  // Navigate via SPA link (no full page reload)
  if (route !== '/dashboard') {
    const selector = NAV_LINKS[route];
    if (selector) {
      await page.locator(selector).first().click();
      await page.waitForURL(`**${route}`, { timeout: 10_000 });
    }
  }

  // Remove the mock so subsequent API calls hit the real backend
  await page.unroute('**/api/auth/me');
}
