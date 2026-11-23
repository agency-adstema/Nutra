/**
 * Provera osnovnih SEO elemenata posle builda.
 * Upotreba: node scripts/seo-check.mjs dist/client
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] || 'dist/client';
const errors = [];
const warn = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(root);
const html = files.filter((f) => f.endsWith('.html'));
const titles = new Map();
const descs = new Map();
const canonicals = new Set();
const intentionallyNoindex = new Set();
const indexable = new Set();

const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];

for (const file of html) {
  const rel = relative(root, file);
  const s = readFileSync(file, 'utf8');
  const is404 = rel === '404.html';

  const title = s.match(/<title>([^<]*)<\/title>/)?.[1]?.trim();
  if (!title) err(rel, 'nema <title>');
  else if (titles.has(title)) err(rel, `duplikat title sa ${titles.get(title)}`);
  else titles.set(title, rel);

  const descTag = s.match(/<meta name="description"[^>]*>/)?.[0];
  const desc = descTag && attr(descTag, 'content');
  if (!desc) err(rel, 'nema meta description');
  else {
    if (desc.length < 50 || desc.length > 170) warn.push(`${rel}: meta description dužine ${desc.length}`);
    if (descs.has(desc)) err(rel, `duplikat description sa ${descs.get(desc)}`);
    descs.set(desc, rel);
  }

  const canonTag = s.match(/<link rel="canonical"[^>]*>/)?.[0];
  const canonical = canonTag && attr(canonTag, 'href');
  if (!canonical) err(rel, 'nema canonical');
  else {
    if (!/^https:\/\//.test(canonical)) err(rel, `canonical nije apsolutan: ${canonical}`);
    if (!canonical.endsWith('/')) err(rel, `canonical bez završne kose crte: ${canonical}`);
    canonicals.add(canonical);
  }

  const robots = attr(s.match(/<meta name="robots"[^>]*>/)?.[0] ?? '', 'content') ?? '';
  const noindex = /noindex/.test(robots);
  if (/<html[^>]*data-noindex="true"/.test(s) && canonical) intentionallyNoindex.add(canonical);
  if (!noindex && !is404 && canonical) indexable.add(canonical);

  const h1 = (s.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) err(rel, `broj H1 elemenata: ${h1}`);

  if (!/<meta property="og:image" content="https?:\/\/[^"]+"/.test(s)) err(rel, 'nema og:image');
  if (!/<html lang="sr-Latn"/.test(s)) err(rel, 'nedostaje lang');

  const ld = [...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!ld.length) err(rel, 'nema JSON-LD');
  for (const m of ld) {
    try {
      const data = JSON.parse(m[1]);
      const types = (data['@graph'] ?? [data]).map((n) => n['@type']);
      if (!types.includes('Organization')) err(rel, 'JSON-LD bez Organization');
      if (rel !== 'index.html' && !is404 && !rel.startsWith('pretraga') && !types.includes('BreadcrumbList')) err(rel, 'JSON-LD bez BreadcrumbList');
      if (/aggregateRating|"review"/i.test(m[1])) err(rel, 'JSON-LD sadrži ocene/recenzije (zabranjeno bez stvarnih podataka)');
      if (rel.split('/').length === 3 && !rel.startsWith('vodici/') && !types.includes('Product')) err(rel, 'stranica proizvoda bez Product schema');
      if (rel.startsWith('vodici/') && rel !== 'vodici/index.html' && !types.includes('Article')) err(rel, 'vodič bez Article schema');
    } catch (e) {
      err(rel, `neispravan JSON-LD: ${e.message}`);
    }
  }

  for (const img of s.match(/<img\b[^>]*>/g) || []) {
    if (!/\salt(=|\s|>)/.test(img)) err(rel, `slika bez alt atributa: ${img.slice(0, 80)}`);
  }
}

// Tajne i offer ID ne smeju u frontend
for (const f of files.filter((f) => /\.(html|js|json|css)$/.test(f))) {
  const s = readFileSync(f, 'utf8');
  if (/UNETI_OFFER_ID|offerId|offer_id"\s*:\s*"[^"]/.test(s) && !f.endsWith('search-index.json')) err(relative(root, f), 'offer ID je dospeo u frontend');
  if (/api_key"\s*:\s*"[^*"]/.test(s) || /MONADLEAD_API_KEY=/.test(s)) err(relative(root, f), 'API ključ u frontendu');
}

// sitemap + robots
const sitemapPath = join(root, 'sitemap.xml');
if (!existsSync(sitemapPath)) err('sitemap.xml', 'ne postoji');
else {
  const sm = readFileSync(sitemapPath, 'utf8');
  const locs = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  for (const c of canonicals) {
    if (intentionallyNoindex.has(c)) continue;
    if (!locs.has(c)) err('sitemap.xml', `nedostaje ${c}`);
  }
  for (const l of locs) {
    if (!canonicals.has(l)) err('sitemap.xml', `URL bez stranice: ${l}`);
    if (intentionallyNoindex.has(l)) err('sitemap.xml', `noindex stranica u sitemap-u: ${l}`);
  }
}
const robotsPath = join(root, 'robots.txt');
if (!existsSync(robotsPath)) err('robots.txt', 'ne postoji');

console.log(`Provereno HTML stranica: ${html.length}, indeksabilnih: ${indexable.size}`);
warn.forEach((w) => console.log(`  upozorenje: ${w}`));
if (errors.length) {
  console.error(`\n✗ SEO provera: ${errors.length} grešaka`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log('✓ SEO provera prošla (title, description, canonical, H1, OG, JSON-LD, alt, sitemap, robots, bez tajni u frontendu)');
