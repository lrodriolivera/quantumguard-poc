/**
 * Convert pitch deck HTML to PDF using Playwright
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, '..', 'pitch-deck.html');
const PDF = path.join(__dirname, '..', 'videos', 'QuantumGuard-AI-Pitch-Deck.pdf');
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'videos');

(async () => {
  console.log('Generating pitch deck PDF...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`file://${HTML}`, { waitUntil: 'networkidle' });

  // Wait for fonts to load
  await page.waitForTimeout(2000);

  // Generate PDF - one slide per page
  await page.pdf({
    path: PDF,
    width: '1280px',
    height: '720px',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  console.log(`PDF: ${PDF}`);

  // Also generate PNG screenshots of each slide for preview
  const slides = await page.locator('.slide').count();
  console.log(`Slides: ${slides}`);

  for (let i = 0; i < slides; i++) {
    const slide = page.locator('.slide').nth(i);
    await slide.screenshot({
      path: path.join(SCREENSHOTS_DIR, `slide-${String(i + 1).padStart(2, '0')}.png`),
    });
  }
  console.log(`Screenshots: ${SCREENSHOTS_DIR}/slide-*.png`);

  await browser.close();
})();
