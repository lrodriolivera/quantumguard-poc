/**
 * QuantumGuard AI - Demo Bot Recorder
 * Automates the full demo flow and records video
 *
 * Usage: node demo-recorder.mjs
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'https://postcuantica.io';
const DEMO_USER = {
  firstName: 'Carlos',
  lastName: 'Mendoza',
  email: `demo_${Date.now()}@quantumguard.ai`,
  password: 'QuantumSafe2026!',
};
const DOCS_DIR = path.join(__dirname, '..', 'documents');
const VIDEO_DIR = path.join(__dirname, '..', 'videos');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  console.log('=== QuantumGuard AI - Demo Recorder ===\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--window-size=1280,720', '--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1280, height: 720 },
    },
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    // =========================================================
    // SCENE 1: Landing Page
    // =========================================================
    console.log('[1/7] Landing Page...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await sleep(3000);

    // Scroll to show features
    await page.evaluate(() => window.scrollBy({ top: 500, behavior: 'smooth' }));
    await sleep(2500);
    await page.evaluate(() => window.scrollBy({ top: 500, behavior: 'smooth' }));
    await sleep(2500);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(2000);

    // =========================================================
    // SCENE 2: Register
    // =========================================================
    console.log('[2/7] Registro de usuario...');
    await page.click('a[href="/register"]');
    await page.waitForURL('**/register');
    await sleep(1500);

    await page.type('input[name="firstName"]', DEMO_USER.firstName, { delay: 80 });
    await sleep(400);
    await page.type('input[name="lastName"]', DEMO_USER.lastName, { delay: 80 });
    await sleep(400);
    await page.type('input[name="email"]', DEMO_USER.email, { delay: 50 });
    await sleep(400);
    await page.type('input[name="password"]', DEMO_USER.password, { delay: 50 });
    await sleep(400);
    await page.type('input[name="confirmPassword"]', DEMO_USER.password, { delay: 50 });
    await sleep(1000);

    await page.click('button:has-text("Crear Cuenta")');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log('  -> Registro exitoso');
    await sleep(3000);

    // =========================================================
    // SCENE 3: Dashboard overview
    // =========================================================
    console.log('[3/7] Dashboard...');
    await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
    await sleep(2500);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(1500);

    // =========================================================
    // SCENE 4: Sign Document #1 - ML-DSA-44 (recommended)
    // =========================================================
    console.log('[4/7] Firmar con ML-DSA-44...');
    await page.click('a[href="/sign"]');
    await page.waitForURL('**/sign');
    await sleep(2000);

    await page.waitForSelector('input[type="file"]', { state: 'attached' });
    await page.locator('input[type="file"]').setInputFiles(path.join(DOCS_DIR, 'contrato_ejemplo.txt'));
    console.log('  -> Archivo: contrato_ejemplo.txt');
    await sleep(2500);

    // ML-DSA-44 is default, click label to highlight
    await page.locator('label:has-text("ML-DSA-44")').click();
    await sleep(2000);

    await page.click('button:has-text("Firmar Documento")');
    console.log('  -> Firmando...');

    try {
      await page.waitForSelector('text=/firmado|completad|exitoso|quantum-safe/i', { timeout: 30000 });
    } catch {
      await sleep(6000);
    }
    console.log('  -> Firma ML-DSA-44 completada');

    // Show the result
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(2000);
    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
    await sleep(3000);

    // =========================================================
    // SCENE 5: Sign Document #2 - ML-DSA-87 (max security)
    // =========================================================
    console.log('[5/7] Firmar con ML-DSA-87 (Maxima seguridad)...');
    // SPA navigate back via dashboard then to sign
    await page.click('a[href="/dashboard"]');
    await page.waitForURL('**/dashboard');
    await sleep(1500);

    await page.click('a[href="/sign"]');
    await page.waitForURL('**/sign');
    await sleep(2000);

    await page.waitForSelector('input[type="file"]', { state: 'attached' });
    await page.locator('input[type="file"]').setInputFiles(path.join(DOCS_DIR, 'factura_ejemplo.txt'));
    console.log('  -> Archivo: factura_ejemplo.txt');
    await sleep(2500);

    // Scroll to see all algorithms
    await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
    await sleep(1000);

    // Select ML-DSA-87
    await page.locator('label:has-text("ML-DSA-87")').click();
    console.log('  -> Algoritmo: ML-DSA-87 (Nivel 5)');
    await sleep(2000);

    await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'smooth' }));
    await sleep(800);

    await page.click('button:has-text("Firmar Documento")');
    console.log('  -> Firmando...');

    try {
      await page.waitForSelector('text=/firmado|completad|exitoso|quantum-safe/i', { timeout: 30000 });
    } catch {
      await sleep(6000);
    }
    console.log('  -> Firma ML-DSA-87 completada');
    await sleep(3000);

    // =========================================================
    // SCENE 6: Documents List (show both signed docs)
    // =========================================================
    console.log('[6/7] Lista de Documentos...');
    // Navigate via header
    const docsLink = page.locator('a[href="/documents"]').first();
    await docsLink.click();
    await page.waitForURL('**/documents');
    await sleep(3000);

    await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'smooth' }));
    await sleep(2500);

    // =========================================================
    // SCENE 7: Final dashboard with stats updated
    // =========================================================
    console.log('[7/7] Dashboard final con estadisticas...');
    await page.click('a[href="/dashboard"]');
    await page.waitForURL('**/dashboard');
    await sleep(4000);

    // Show the updated stats (should show 2 documents)
    await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'smooth' }));
    await sleep(3000);

    console.log('\n=== Demo completado exitosamente! ===');

  } catch (err) {
    console.error('\nError durante la grabacion:', err.message);
    try {
      await page.screenshot({ path: path.join(VIDEO_DIR, 'error-screenshot.png') });
      console.log('Screenshot de error guardado');
    } catch (_) { /* browser closed */ }
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  // Rename video
  const { readdirSync, renameSync } = await import('fs');
  const videos = readdirSync(VIDEO_DIR).filter(f => f.endsWith('.webm'));
  if (videos.length > 0) {
    const latest = videos.sort().pop();
    const finalName = 'quantumguard-demo.webm';
    try {
      renameSync(path.join(VIDEO_DIR, latest), path.join(VIDEO_DIR, finalName));
      console.log(`\nVideo: ${VIDEO_DIR}/${finalName}`);
    } catch {
      console.log(`\nVideo: ${VIDEO_DIR}/${latest}`);
    }
  }
})();
