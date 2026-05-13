import { chromium, FullConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE = path.join(__dirname, '.auth-state.json');

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000';
  const email = `e2e_${Date.now()}@test.quantumguard.ai`;
  const password = 'TestE2E_2026!';

  console.log(`[E2E Setup] Registering test user: ${email}`);

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  // Register (with retry for rate-limiting)
  await page.goto('/register');
  await page.fill('input[name="firstName"]', 'Test');
  await page.fill('input[name="lastName"]', 'E2E');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirmPassword"]', password);

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.click('button:has-text("Crear Cuenta")');
    try {
      await page.waitForURL('**/dashboard', { timeout: 15_000 });
      break;
    } catch {
      if (attempt < 2) {
        console.log(`[E2E Setup] Registration attempt ${attempt + 1} failed, retrying in ${5 * (attempt + 1)}s...`);
        await page.waitForTimeout(5000 * (attempt + 1));
      } else {
        throw new Error('Registration failed after 3 attempts (likely rate-limited)');
      }
    }
  }

  console.log('[E2E Setup] Registration successful, saving state...');

  // Save auth state (localStorage + cookies)
  await context.storageState({ path: STORAGE_STATE });

  // Also write credentials to a file for tests that need to re-login
  const fs = await import('fs');
  fs.writeFileSync(
    path.join(__dirname, '.test-credentials.json'),
    JSON.stringify({ email, password })
  );

  await browser.close();
  console.log('[E2E Setup] Done.');
}

export default globalSetup;
