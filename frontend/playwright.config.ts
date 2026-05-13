import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const isRemote = baseURL.startsWith('https://');
const authState = path.join(__dirname, 'e2e', '.auth-state.json');

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html'], ['list']],
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'public',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['api-health.spec.ts', 'home.spec.ts', 'navigation.spec.ts'],
    },
    {
      name: 'authenticated',
      use: { ...devices['Desktop Chrome'], storageState: authState },
      testMatch: ['auth.spec.ts', 'sign-document.spec.ts', 'documents.spec.ts'],
      dependencies: ['public'],
    },
  ],
  ...(isRemote
    ? {} // no webServer for remote targets
    : {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
