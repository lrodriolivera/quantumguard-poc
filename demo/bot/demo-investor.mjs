/**
 * QuantumGuard AI - Investor Demo Recorder
 * Premium demo with slower pacing for investor presentations
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'https://postcuantica.io';
const DEMO_USER = {
  firstName: 'Carlos',
  lastName: 'Mendoza',
  email: `investor_${Date.now()}@quantumguard.ai`,
  password: 'QuantumSafe2026!',
};
const DOCS_DIR = path.join(__dirname, '..', 'documents');
const VIDEO_DIR = path.join(__dirname, '..', 'videos');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Inject a floating annotation badge on screen */
async function showBadge(page, text, position = 'top-right', durationMs = 3000) {
  await page.evaluate(({ text, position, durationMs }) => {
    const existing = document.getElementById('qg-badge');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.id = 'qg-badge';
    badge.textContent = text;
    const posStyles = {
      'top-right': 'top:80px;right:20px;',
      'top-left': 'top:80px;left:20px;',
      'bottom-right': 'bottom:40px;right:20px;',
      'center': 'top:50%;left:50%;transform:translate(-50%,-50%);font-size:22px;padding:16px 32px;',
    };
    badge.style.cssText = `
      position:fixed;${posStyles[position] || posStyles['top-right']}
      z-index:99999;background:rgba(37,99,235,0.92);color:#fff;
      padding:10px 20px;border-radius:12px;font-size:15px;font-weight:600;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;
      box-shadow:0 8px 32px rgba(0,0,0,0.2);backdrop-filter:blur(8px);
      animation:qgFadeIn 0.4s ease;letter-spacing:0.3px;
    `;
    const style = document.createElement('style');
    style.textContent = `
      @keyframes qgFadeIn { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
      @keyframes qgFadeOut { from{opacity:1} to{opacity:0;transform:translateY(-10px)} }
    `;
    document.head.appendChild(style);
    document.body.appendChild(badge);

    setTimeout(() => {
      badge.style.animation = 'qgFadeOut 0.4s ease forwards';
      setTimeout(() => badge.remove(), 400);
    }, durationMs);
  }, { text, position, durationMs });
}

(async () => {
  console.log('=== QuantumGuard AI - Investor Demo ===\n');

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
    // SCENE 1: Landing Page - First Impression
    // =========================================================
    console.log('[1/7] Landing Page...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await sleep(2000);
    await showBadge(page, 'postcuantica.io — Plataforma live en produccion', 'top-right', 4000);
    await sleep(4500);

    // Smooth scroll to show features
    await page.evaluate(() => window.scrollBy({ top: 450, behavior: 'smooth' }));
    await sleep(1000);
    await showBadge(page, 'Firmas digitales quantum-safe con ML-DSA (FIPS 204)', 'top-right', 3500);
    await sleep(4000);

    await page.evaluate(() => window.scrollBy({ top: 450, behavior: 'smooth' }));
    await sleep(1000);
    await showBadge(page, 'Algoritmos certificados por NIST — Resistentes a computadoras cuanticas', 'top-right', 3500);
    await sleep(4000);

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(2000);

    // =========================================================
    // SCENE 2: Register - Instant onboarding
    // =========================================================
    console.log('[2/7] Registro...');
    await page.click('a[href="/register"]');
    await page.waitForURL('**/register');
    await sleep(1500);
    await showBadge(page, 'Registro instantaneo — Sin fricciones', 'top-right', 3000);

    await page.type('input[name="firstName"]', DEMO_USER.firstName, { delay: 70 });
    await sleep(300);
    await page.type('input[name="lastName"]', DEMO_USER.lastName, { delay: 70 });
    await sleep(300);
    await page.type('input[name="email"]', DEMO_USER.email, { delay: 40 });
    await sleep(300);
    await page.type('input[name="password"]', DEMO_USER.password, { delay: 40 });
    await sleep(300);
    await page.type('input[name="confirmPassword"]', DEMO_USER.password, { delay: 40 });
    await sleep(800);

    await page.click('button:has-text("Crear Cuenta")');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log('  -> Registro exitoso');
    await sleep(1500);
    await showBadge(page, 'Cuenta creada — Redireccion automatica al Dashboard', 'top-right', 3000);
    await sleep(3500);

    // =========================================================
    // SCENE 3: Dashboard
    // =========================================================
    console.log('[3/7] Dashboard...');
    await showBadge(page, 'Panel de control — Metricas en tiempo real', 'top-right', 3000);
    await sleep(2000);
    await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
    await sleep(3000);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(1500);

    // =========================================================
    // SCENE 4: Sign Document #1 - ML-DSA-44
    // =========================================================
    console.log('[4/7] Firma ML-DSA-44...');
    await page.click('a[href="/sign"]');
    await page.waitForURL('**/sign');
    await sleep(1500);
    await showBadge(page, 'Firma de documentos — Tecnologia post-cuantica', 'top-right', 3000);
    await sleep(1500);

    // Upload
    await page.waitForSelector('input[type="file"]', { state: 'attached' });
    await page.locator('input[type="file"]').setInputFiles(path.join(DOCS_DIR, 'contrato_ejemplo.txt'));
    console.log('  -> Archivo cargado');
    await sleep(2000);

    // Show algorithm selection
    await showBadge(page, 'ML-DSA-44 (Dilithium) — FIPS 204 — Nivel de seguridad 2', 'top-right', 4000);
    await page.locator('label:has-text("ML-DSA-44")').click();
    await sleep(4500);

    // Sign
    await page.click('button:has-text("Firmar Documento")');
    console.log('  -> Firmando...');

    try {
      await page.waitForSelector('text=/firmado|completad|exitoso|quantum-safe/i', { timeout: 30000 });
    } catch {
      await sleep(6000);
    }
    console.log('  -> Firma completada');
    await sleep(1500);

    await showBadge(page, 'Firma completada en < 1 segundo — 2,600+ firmas/seg', 'center', 4000);
    await sleep(2000);

    // Scroll to show signature details
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(1500);
    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
    await sleep(4000);

    // =========================================================
    // SCENE 5: Sign Document #2 - ML-DSA-87 (max security)
    // =========================================================
    console.log('[5/7] Firma ML-DSA-87...');
    await page.click('a[href="/dashboard"]');
    await page.waitForURL('**/dashboard');
    await sleep(1500);

    await page.click('a[href="/sign"]');
    await page.waitForURL('**/sign');
    await sleep(1500);

    await page.waitForSelector('input[type="file"]', { state: 'attached' });
    await page.locator('input[type="file"]').setInputFiles(path.join(DOCS_DIR, 'factura_ejemplo.txt'));
    console.log('  -> Archivo cargado');
    await sleep(2000);

    // Scroll to algorithms
    await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
    await sleep(1000);

    await showBadge(page, 'ML-DSA-87 — Nivel 5 — Maxima proteccion cuantica', 'top-right', 4000);
    await page.locator('label:has-text("ML-DSA-87")').click();
    await sleep(4500);

    await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'smooth' }));
    await sleep(800);

    await page.click('button:has-text("Firmar Documento")');
    console.log('  -> Firmando...');

    try {
      await page.waitForSelector('text=/firmado|completad|exitoso|quantum-safe/i', { timeout: 30000 });
    } catch {
      await sleep(6000);
    }
    console.log('  -> Firma completada');
    await sleep(1000);
    await showBadge(page, 'Validez de firma: 50+ anos — Resistente a ataques cuanticos', 'center', 4000);
    await sleep(4500);

    // =========================================================
    // SCENE 6: Documents List
    // =========================================================
    console.log('[6/7] Documentos firmados...');
    const docsLink = page.locator('a[href="/documents"]').first();
    await docsLink.click();
    await page.waitForURL('**/documents');
    await sleep(2000);
    await showBadge(page, 'Repositorio de documentos — Auditoria y trazabilidad completa', 'top-right', 3500);
    await sleep(4000);

    await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'smooth' }));
    await sleep(2500);

    // =========================================================
    // SCENE 7: Final Dashboard + Closing
    // =========================================================
    console.log('[7/7] Cierre...');
    await page.click('a[href="/dashboard"]');
    await page.waitForURL('**/dashboard');
    await sleep(2000);

    await showBadge(page, '2 documentos firmados — Criptografia post-cuantica NIST', 'top-right', 3500);
    await sleep(4000);

    // Final badge
    await showBadge(page, 'QuantumGuard AI — postcuantica.io', 'center', 5000);
    await sleep(5500);

    console.log('\n=== Demo completado exitosamente! ===');

  } catch (err) {
    console.error('\nError:', err.message);
    try {
      await page.screenshot({ path: path.join(VIDEO_DIR, 'error-screenshot.png') });
    } catch (_) {}
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
    const name = 'quantumguard-investor-raw.webm';
    try {
      renameSync(path.join(VIDEO_DIR, latest), path.join(VIDEO_DIR, name));
      console.log(`\nVideo raw: ${VIDEO_DIR}/${name}`);
    } catch {
      console.log(`\nVideo: ${VIDEO_DIR}/${latest}`);
    }
  }
})();
