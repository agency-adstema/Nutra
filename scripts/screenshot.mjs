/**
 * Screenshotovi za pregled dizajna (desktop + mobilni).
 * Upotreba: node scripts/screenshot.mjs http://localhost:4321 out-dir [putanje...]
 * Potreban je Chrome/Chromium (CHROME_PATH ili /usr/bin/google-chrome).
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const [base = 'http://localhost:4321', out = 'screenshots', ...paths] = process.argv.slice(2);
const pages = paths.length ? paths : ['/', '/zglobovi-i-bolovi/nautubone/'];
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const viewports = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, isMobile: true, deviceScaleFactor: 2, hasTouch: true },
];

for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, deviceScaleFactor: vp.deviceScaleFactor, hasTouch: vp.hasTouch });
  const page = await ctx.newPage();
  for (const p of pages) {
    await page.goto(base + p, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      // učitaj lazy slike
      document.documentElement.style.scrollBehavior = 'auto';
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => img.setAttribute('loading', 'eager'));
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 80));
      }
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(600);
    const slug = p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '_');
    await page.screenshot({ path: `${out}/${slug}-${vp.name}.png`, fullPage: true });
    await page.screenshot({ path: `${out}/${slug}-${vp.name}-fold.png`, fullPage: false });
    console.log('✓', slug, vp.name);
  }
  await ctx.close();
}
await browser.close();
