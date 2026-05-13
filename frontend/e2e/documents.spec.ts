import { test, expect } from '@playwright/test';
import path from 'path';
import { DOCS_DIR, gotoAuthenticated } from './helpers';

test.describe.serial('Documents - List & Management', () => {
  test('01 - sign doc and view in documents list', async ({ page }) => {
    await gotoAuthenticated(page, '/sign');
    await page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 15_000 });
    await page.locator('input[type="file"]').setInputFiles(
      path.join(DOCS_DIR, 'acuerdo_confidencialidad.txt')
    );
    await page.locator('label:has-text("ML-DSA-44")').click();
    await page.click('button:has-text("Firmar Documento")');
    await expect(
      page.locator('text=Documento Firmado Exitosamente')
    ).toBeVisible({ timeout: 30_000 });

    // Navigate to documents via SPA
    const link = page.locator('a[href="/documents"]').first();
    await link.click();
    await page.waitForURL(/documents/);
    await expect(page.locator('text=/acuerdo_confidencialidad/i').first()).toBeVisible({ timeout: 10_000 });
  });
});
