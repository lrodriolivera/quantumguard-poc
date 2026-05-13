import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test('should display landing page', async ({ page }) => {
    await page.goto('/');

    // Check hero section
    await expect(page.getByRole('heading', { name: /firmas digitales del futuro/i })).toBeVisible();
    await expect(page.getByText(/post-cuantica/i).first()).toBeVisible();
  });

  test('should display features section', async ({ page }) => {
    await page.goto('/');

    // Check feature cards
    await expect(page.getByText(/post-cuantico/i).first()).toBeVisible();
    await expect(page.getByText(/seguridad maxima/i)).toBeVisible();
    await expect(page.getByText(/ultra rapido/i)).toBeVisible();
    await expect(page.getByText(/verificacion instantanea/i)).toBeVisible();
  });

  test('should navigate to register from CTA', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: /comenzar gratis/i }).first().click();

    await expect(page).toHaveURL('/register');
  });

  test('should navigate to login from header', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: /iniciar sesion/i }).first().click();

    await expect(page).toHaveURL('/login');
  });

  test('should display QuantumGuard branding', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('QuantumGuard').first()).toBeVisible();
  });

  test('should have responsive navigation', async ({ page }) => {
    await page.goto('/');

    // Desktop navigation should be visible on large screens
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByRole('link', { name: /iniciar sesion/i }).first()).toBeVisible();
  });
});
