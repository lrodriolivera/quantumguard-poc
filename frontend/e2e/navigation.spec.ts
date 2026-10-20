import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should redirect to login when accessing protected route', async ({ page }) => {
    await page.goto('/dashboard');

    // Should redirect to login
    await expect(page).toHaveURL('/login');
  });

  test('should redirect to login when accessing sign page', async ({ page }) => {
    await page.goto('/sign');

    await expect(page).toHaveURL('/login');
  });

  test('should redirect to login when accessing verify page', async ({ page }) => {
    await page.goto('/verify');

    await expect(page).toHaveURL('/login');
  });

  test('should redirect to login when accessing documents page', async ({ page }) => {
    await page.goto('/documents');

    await expect(page).toHaveURL('/login');
  });

  test('should redirect to login when accessing profile page', async ({ page }) => {
    await page.goto('/profile');

    await expect(page).toHaveURL('/login');
  });

  test('should display footer on all pages', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText(/postcuantica/i)).toBeVisible();
    await expect(page.getByText(/todos los derechos reservados/i)).toBeVisible();
  });
});
