/**
 * Provera pre puštanja u produkciju. Pada dok postoje demo podaci ili [POPUNITI] polja.
 * Upotreba: npm run check:prod
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const problems = [];
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

for (const f of [...walk('src/config'), ...walk('src/pages')]) {
  const s = readFileSync(f, 'utf8');
  const n = (s.match(/\[POPUNITI/g) || []).length;
  if (n) problems.push(`${f}: ${n}× [POPUNITI] — upisati stvarne podatke`);
}

for (const f of walk('src/content').filter((f) => f.endsWith('.md') && !f.split('/').pop().startsWith('_'))) {
  const s = readFileSync(f, 'utf8');
  const fm = s.split(/^---$/m)[1] ?? '';
  if (/^draft:\s*true/m.test(fm)) continue;
  if (/^demo:\s*true/m.test(fm)) problems.push(`${f}: demo: true — zameniti proverenim sadržajem`);
  if (/^priceStatus:\s*demo/m.test(fm)) problems.push(`${f}: priceStatus: demo — proveriti cenu ili staviti unknown`);
  if (/UNETI_OFFER_ID/.test(fm)) problems.push(`${f}: offerId nije podešen (ili postaviti env OFFER_ID_<SLUG>)`);
  if (/^\s+demo:\s*true/m.test(fm)) problems.push(`${f}: sadrži demo/test video`);
}

const env = process.env;
if (env.PUBLIC_SITE_ENV !== 'production') problems.push('PUBLIC_SITE_ENV nije "production" (sajt bi ostao noindex)');
if (env.ORDER_MODE !== 'live') problems.push('ORDER_MODE nije "live" (porudžbine se ne bi slale)');
if (!env.MONADLEAD_API_KEY && !env.MONADLEAD_API_KEY_RS) problems.push('MONADLEAD_API_KEY nije podešen');
if (!env.ORDER_HASH_SALT) problems.push('ORDER_HASH_SALT nije podešen');
if (!env.SITE_URL) problems.push('SITE_URL nije podešen');

if (problems.length) {
  console.error(`✗ Nije spremno za produkciju (${problems.length}):`);
  problems.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}
console.log('✓ Spremno za produkciju');
