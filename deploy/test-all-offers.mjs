#!/usr/bin/env node
/**
 * Moja Zdravica — proba svih ponuda u MonadLead-u (po jedna TEST porudžbina po ponudi).
 *
 * Na serveru (kao root):
 *   curl -fsSL https://raw.githubusercontent.com/agency-adstema/Nutra/main/deploy/test-all-offers.mjs -o test-offers.mjs
 *   node test-offers.mjs              # sve ponude koje su na sajtu
 *   node test-offers.mjs RS           # samo Srbija (može i BA, HR)
 *   node test-offers.mjs RS nautubone # jedna ponuda
 *
 * Šalje PRAVE porudžbine sa imenom „TEST Moja Zdravica“ i tvojim brojem — najavi ih
 * menadžeru u MonadLead-u da ih označi kao test. Spisak ponuda i offer ID-jeve uzima iz
 * istog koda kao sajt (GitHub, grana main). API ključ čita iz /etc/nutra/backend.env.
 * Rezultat ispiše na ekranu i sačuva u /root/test-ponuda-<datum>.csv.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const RAW = 'https://raw.githubusercontent.com/agency-adstema/Nutra/main/src/data';
const API = 'https://api.monadlead.com/api/v1/orders/create/';
const SITE = 'https://lamena.io/nutra';
const DIAL = { RS: '381', BA: '387', HR: '385' };
const PAUSE_MS = 1500;

const [geoArg, slugArg] = process.argv.slice(2).map((a) => a?.trim());
const env = readFileSync('/etc/nutra/backend.env', 'utf8');
const KEY = (env.match(/^MONADLEAD_API_KEY_CATALOG=(.*)$/m)?.[1] || '').trim();
if (!KEY) { console.error('Nema MONADLEAD_API_KEY_CATALOG u /etc/nutra/backend.env'); process.exit(1); }

const getText = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} → ${r.status}`); return r.text(); };
const products = JSON.parse(await getText(`${RAW}/products.json`));
const details = JSON.parse(await getText(`${RAW}/offer-details.json`));
const offersTs = await getText(`${RAW}/offers.ts`);
const removed = new Set([...(offersTs.match(/removedOffers = new Set\(\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]));
const available = new Set(details.filter((d) => d.availableInAccount).map((d) => `${d.country}/${d.slug}`));

let list = products.filter((p) => {
  const key = `${p.country}/${p.slug}`;
  return p.offer_id && p.pricing?.packages?.length && !removed.has(key) && available.has(key) && DIAL[p.country];
});
if (geoArg) list = list.filter((p) => p.country === geoArg.toUpperCase());
if (slugArg) list = list.filter((p) => p.slug === slugArg.toLowerCase());
if (!list.length) { console.error('Nijedna ponuda ne odgovara izboru.'); process.exit(1); }

const byGeo = list.reduce((a, p) => ((a[p.country] = (a[p.country] || 0) + 1), a), {});
console.log(`Ponuda za test: ${list.length} (${Object.entries(byGeo).map(([g, n]) => `${g} ${n}`).join(', ')})`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const national = (raw, geo) => {
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith(DIAL[geo])) d = d.slice(DIAL[geo].length);
  d = d.replace(/^0+/, '');
  return d.length >= 7 && d.length <= 10 ? `0${d}` : '';
};
const phones = {};
for (const geo of Object.keys(byGeo)) {
  const fallback = phones.RS || phones.BA || phones.HR;
  const ans = await rl.question(`Broj telefona za ${geo}${fallback ? ' (Enter = isti kao gore)' : ''}: `);
  phones[geo] = ans.trim() ? national(ans, geo) : fallback;
  if (!phones[geo]) { console.error('Broj nije ispravan.'); process.exit(1); }
}
const ok = (await rl.question(`Poslati ${list.length} TEST porudžbina u MonadLead? Upiši "da": `)).trim().toLowerCase();
rl.close();
if (ok !== 'da') { console.log('Otkazano, ništa nije poslato.'); process.exit(0); }

const mask = (s) => String(s).split(KEY).join('***').replace(/\d{6,}/g, '[broj]').slice(0, 200);
const rows = [['zemlja', 'proizvod', 'offer_id', 'rezultat', 'order_id', 'sekundi', 'razlog']];
const times = [];
let good = 0;
for (const [i, p] of list.entries()) {
  const payload = {
    api_key: KEY,
    name: 'TEST Moja Zdravica',
    phone: phones[p.country],
    offer_id: String(p.offer_id),
    country_code: p.country,
    base_url: 'https://lamena.io',
    referrer: `${SITE}/ponude/${p.country.toLowerCase()}/${p.slug}/`,
    sub_1: 'test',
    sub_3: `${p.country.toLowerCase()}-${p.slug}`,
  };
  let status = 0, text = '';
  const t0 = Date.now();
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
    status = r.status; text = await r.text();
  } catch (e) { text = `mreža: ${e.message}`; }
  const sec = (Date.now() - t0) / 1000;
  times.push(sec);
  let body = {}; try { body = JSON.parse(text); } catch { /* nije JSON */ }
  const orderId = body.order_id ?? body.data?.order_id ?? body.order?.id;
  const success = (status === 200 || status === 201) && orderId && body.type !== 'error';
  const reason = success ? '' : Array.isArray(body.errors)
    ? body.errors.map((e) => `${e.field}: ${e.reason}`).join(', ')
    : mask(body.message || body.error || text || `HTTP ${status}`);
  if (success) good++;
  console.log(`${String(i + 1).padStart(3)}/${list.length}  ${p.country} ${p.slug.padEnd(24)} offer ${String(p.offer_id).padEnd(5)} ${success ? `OK  #${orderId}` : `GREŠKA (${status}) ${reason}`}  (${sec.toFixed(2)} s)`);
  rows.push([p.country, p.slug, p.offer_id, success ? 'OK' : `GRESKA ${status}`, success ? orderId : '', sec.toFixed(2), reason.replace(/[,\n]/g, ';')]);
  await new Promise((r) => setTimeout(r, PAUSE_MS));
}

const file = `/root/test-ponuda-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
writeFileSync(file, rows.map((r) => r.join(',')).join('\n') + '\n');
const avg = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
console.log(`\nProšlo: ${good}/${list.length}. Ne prolazi: ${list.length - good}. Spisak: ${file}`);
console.log(`MonadLead odgovor: prosečno ${avg.toFixed(2)} s, najsporiji ${Math.max(...times).toFixed(2)} s po porudžbini.`);
