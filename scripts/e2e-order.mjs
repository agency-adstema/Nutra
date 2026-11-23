/**
 * E2E test forme u pravom browseru, uz LOKALNI lažni MonadLead (ništa ne ide na pravi API).
 * Pre pokretanja: npm run build
 * Upotreba: npm run test:e2e   (CHROME_PATH=/putanja/do/chrome po potrebi)
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { startMock } from './mock-monadlead.mjs';

const MOCK_PORT = 4545;
const LIVE_PORT = 4601;
const TEST_PORT = 4602;
const PRODUCT = '/zglobovi-i-bolovi/nautubone/';
const shotsDir = process.env.E2E_SHOTS || '';

let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failed++;
};

function startServer(port, env) {
  const child = spawn(process.execPath, ['dist/server/entry.mjs'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.logs = '';
  child.stdout.on('data', (d) => (child.logs += d));
  child.stderr.on('data', (d) => (child.logs += d));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server start timeout')), 15000);
    const check = async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/`);
        if (r.ok) {
          clearTimeout(t);
          return resolve(child);
        }
      } catch {}
      setTimeout(check, 200);
    };
    check();
  });
}

async function fill(page, { first = 'Test', last = 'Korisnik', phone = '060 123 45 67', consent = true } = {}) {
  await page.fill('#of-first', first);
  await page.fill('#of-last', last);
  await page.fill('#of-phone', phone);
  if (consent) await page.check('input[name="consent"]');
}

const mock = await startMock(MOCK_PORT);
const live = await startServer(LIVE_PORT, {
  ORDER_MODE: 'live',
  MONADLEAD_API_KEY: 'e2e-test-key',
  MONADLEAD_API_URL: `http://127.0.0.1:${MOCK_PORT}/api/v1/orders/create/`,
  OFFER_ID_NAUTUBONE: 'E2E-OFFER',
  ORDER_HASH_SALT: 'e2e',
});
const testMode = await startServer(TEST_PORT, { ORDER_MODE: 'test' });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const events = [];
  await page.exposeFunction('__e2eEvent', (e) => events.push(e));
  await page.addInitScript(() => window.addEventListener('bk:track', (e) => window.__e2eEvent(e.detail.event)));

  // 1) Validacija u browseru
  await page.goto(`http://127.0.0.1:${LIVE_PORT}${PRODUCT}?utm_source=google&utm_medium=cpc&gclid=E2E-GCLID`);
  ok(events.includes('view_item'), 'view_item događaj');
  await page.click('[data-hero-cta]');
  await page.waitForTimeout(1500);
  const formTop = await page.locator('#poruci').evaluate((el) => el.getBoundingClientRect().top);
  ok(formTop >= 0 && formTop < 400, '„Poručite odmah“ skroluje do forme');
  await page.click('[data-submit]');
  ok(await page.locator('[data-error-for="firstName"]').isVisible(), 'prazna forma prikazuje greške');
  ok(events.includes('form_error'), 'form_error događaj');
  await page.fill('#of-phone', '12345');
  await page.click('[data-submit]');
  ok((await page.locator('[data-error-for="phone"]').textContent()).length > 5, 'neispravan telefon prikazuje grešku');

  // 2) Uspešan lead + dupli klik
  await fill(page);
  await page.waitForTimeout(2600); // minimalno vreme popunjavanja (anti-bot)
  await page.locator('[data-submit]').dblclick();
  await page.waitForSelector('[data-order-status][data-kind="success"]', { timeout: 10000 });
  ok(true, 'uspeh prikazan tek posle potvrde MonadLead-a');
  ok(events.includes('begin_checkout') && events.includes('generate_lead'), 'begin_checkout i generate_lead događaji');
  if (shotsDir) await page.locator('#poruci').screenshot({ path: `${shotsDir}/form-success-mobile.png` });
  const received = await (await fetch(`http://127.0.0.1:${MOCK_PORT}/__orders`)).json();
  ok(received.length === 1, `dupli klik = jedna porudžbina (primljeno: ${received.length})`);
  const o = received[0] ?? {};
  ok(o.name === 'Test Korisnik' && o.phone === '+381601234567', 'ime spojeno, telefon normalizovan (+381…)');
  ok(o.offer_id === 'E2E-OFFER' && o.country_code === 'RS', 'offer_id iz serverske konfiguracije, country_code RS');
  ok(o.sub_1 === 'google' && o.sub_2 === 'cpc' && o.sub_3 === 'nautubone' && o.sub_4 === 'E2E-GCLID', 'sub_1–sub_4 i click ID sačuvani');
  ok(o.utm_source === 'google' && o.utm_medium === 'cpc' && o.base_url && o.api_key_received, 'UTM, base_url i api_key prosleđeni');
  ok(!live.logs.includes('Korisnik') && !live.logs.includes('601234567') && !live.logs.includes('e2e-test-key'), 'serverski logovi bez ličnih podataka i ključa');

  // 3) Greška iz MonadLead-a (400) — bez lažne potvrde
  const page2 = await ctx.newPage();
  await page2.goto(`http://127.0.0.1:${LIVE_PORT}${PRODUCT}`);
  await fill(page2, { phone: '060 000 0000' });
  await page2.waitForTimeout(2600);
  await page2.click('[data-submit]');
  await page2.waitForSelector('[data-order-status][data-kind="error"]', { timeout: 10000 });
  ok((await page2.locator('[data-order-status][data-kind="success"]').count()) === 0, 'odbijen lead (400) ne prikazuje uspeh');
  if (shotsDir) await page2.locator('#poruci').screenshot({ path: `${shotsDir}/form-error-mobile.png` });

  // 4) Serverska greška (500)
  const page3 = await ctx.newPage();
  await page3.goto(`http://127.0.0.1:${LIVE_PORT}${PRODUCT}`);
  await fill(page3, { first: 'Server', phone: '063 777 8899' });
  await page3.waitForTimeout(2600);
  await page3.click('[data-submit]');
  await page3.waitForSelector('[data-order-status][data-kind="error"]', { timeout: 10000 });
  ok(true, 'serverska greška (500) prikazuje poruku o grešci');

  // 5) Test režim — bez slanja, bez lažnog uspeha
  const page4 = await ctx.newPage();
  await page4.goto(`http://127.0.0.1:${TEST_PORT}${PRODUCT}`);
  await fill(page4, { phone: '065 111 2233' });
  await page4.waitForTimeout(2600);
  await page4.click('[data-submit]');
  await page4.waitForSelector('[data-order-status][data-kind="test"]', { timeout: 10000 });
  ok(true, 'test režim prikazuje „porudžbina NIJE poslata“');
  if (shotsDir) await page4.locator('#poruci').screenshot({ path: `${shotsDir}/form-testmode-mobile.png` });
  const after = await (await fetch(`http://127.0.0.1:${MOCK_PORT}/__orders`)).json();
  ok(after.length === 1, 'test režim nije poslao ništa u CRM');

  // 6) Objavljeni video je samo autentičan, uz potvrđenu dozvolu.
  await page.goto(`http://127.0.0.1:${LIVE_PORT}${PRODUCT}`);
  const approvedVideos = page.locator('[data-video-play]');
  if (await approvedVideos.count()) {
    await approvedVideos.first().click();
    await page.waitForTimeout(800);
    ok((await page.locator('[data-video-card] video, [data-video-card] iframe').count()) >= 1, 'dozvoljeni video se učitava tek na klik');
    ok(events.includes('video_start'), 'video_start događaj');
  } else {
    ok((await page.locator('#video').count()) === 0, 'nema lažnih video-recenzija dok ne dodamo stvarne snimke');
  }

  // 7) Sticky CTA na mobilnom
  await page.evaluate(() => window.scrollTo(0, 1600));
  await page.waitForTimeout(500);
  const stickyShown = await page.locator('[data-sticky-cta]').evaluate((el) => !el.classList.contains('translate-y-full'));
  ok(stickyShown, 'sticky CTA se pojavljuje posle hero sekcije');
  await page.locator('#poruci').evaluate((el) => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
  await page.waitForTimeout(800);
  const stickyHidden = await page.locator('[data-sticky-cta]').evaluate((el) => el.classList.contains('translate-y-full'));
  ok(stickyHidden, 'sticky CTA se sklanja kad je forma na ekranu');
} finally {
  await browser.close();
  live.kill();
  testMode.kill();
  mock.close();
}

if (failed) {
  console.error(`\n✗ E2E: ${failed} provera nije prošlo`);
  process.exit(1);
}
console.log('\n✓ E2E forma: sve provere prošle');
