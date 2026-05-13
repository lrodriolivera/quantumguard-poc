import { test, expect } from '@playwright/test';
import path from 'path';
import { DOCS_DIR, gotoAuthenticated } from './helpers';

test.describe.serial('Sign Document - Full Flow', () => {
  test('01 - sign page loads and sign with ML-DSA-44', async ({ page }) => {
    await gotoAuthenticated(page, '/sign');
    await expect(page.locator('text=Firmar Documento')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[type="file"]')).toBeAttached();

    // Sign a document
    await page.locator('input[type="file"]').setInputFiles(
      path.join(DOCS_DIR, 'contrato_ejemplo.txt')
    );
    await page.locator('label:has-text("ML-DSA-44")').click();
    await page.click('button:has-text("Firmar Documento")');
    await expect(
      page.locator('text=Documento Firmado Exitosamente')
    ).toBeVisible({ timeout: 30_000 });
  });
});
