import { test, expect } from '@playwright/test';
import { gotoAuthenticated } from './helpers';

test.describe('Auth - Authenticated User', () => {
  // storageState from global-setup is injected by playwright config
  // Note: unauthenticated redirect tests are in navigation.spec.ts (public project)

  test('01 - dashboard loads with session and shows user info', async ({ page }) => {
    await gotoAuthenticated(page, '/dashboard');
    await expect(page.locator('a[href="/sign"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=Bienvenido')).toBeVisible();
    await expect(page.locator('text=Total Documentos')).toBeVisible();
  });
});
