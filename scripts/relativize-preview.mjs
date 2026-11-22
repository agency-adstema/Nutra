/**
 * Pretvara apsolutne putanje (/_astro/..., /kategorija/) u relativne, da statički preview radi
 * sa bilo koje adrese (npr. hostovani pregled ili otvaranje fajlova lokalno).
 * Koristi se samo za `npm run build:static-preview` — produkcijski build ostaje netaknut.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';

const root = process.argv[2] || 'preview-dist';
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

/** "/zglobovi/" → "../zglobovi/index.html" iz date datoteke */
function rel(fromFile, url) {
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  const m = url.match(/^([^?#]*)([?#].*)?$/);
  let path = m[1];
  const suffix = m[2] ?? '';
  if (path.endsWith('/')) path += 'index.html';
  else if (!posix.extname(path)) {
    const asDir = join(root, path, 'index.html');
    if (existsSync(asDir)) path += '/index.html';
  }
  const fromDir = dirname(relative(root, fromFile));
  let r = posix.relative(fromDir.split('\\').join('/') || '.', path.slice(1));
  if (!r.startsWith('.')) r = `./${r}`;
  return r + suffix;
}

const ATTRS = ['href', 'src', 'poster', 'action', 'data-src', 'data-index-url'];
let changed = 0;

// Fajlovi čije ime počinje sa "_" preimenujemo (neki hostovi rezervišu taj prefiks)
const renames = new Map();
for (const file of walk(root)) {
  const base = file.split('/').pop();
  if (base.startsWith('_')) {
    const next = `u${base}`;
    renameSync(file, join(dirname(file), next));
    renames.set(base, next);
  }
}
if (renames.size) {
  for (const file of walk(root).filter((f) => /\.(html|js|css|json)$/.test(f))) {
    let s = readFileSync(file, 'utf8');
    for (const [from, to] of renames) s = s.split(`/${from}`).join(`/${to}`).split(`"./${from}`).join(`"./${to}`);
    writeFileSync(file, s);
  }
}

for (const file of walk(root)) {
  if (file.endsWith('.html')) {
    let s = readFileSync(file, 'utf8');
    for (const a of ATTRS) {
      s = s.replace(new RegExp(`(\\s${a}=")(/[^"]*)"`, 'g'), (_, pre, url) => `${pre}${rel(file, url)}"`);
    }
    s = s.replace(/(\ssrcset=")([^"]*)"/g, (_, pre, list) =>
      `${pre}${list
        .split(',')
        .map((part) => {
          const [u, ...d] = part.trim().split(/\s+/);
          return [rel(file, u), ...d].join(' ');
        })
        .join(', ')}"`,
    );
    writeFileSync(file, s);
    changed++;
  } else if (file.endsWith('.css')) {
    const s = readFileSync(file, 'utf8').replace(/url\((["']?)(\/[^)"']+)\1\)/g, (_, q, u) => `url(${q}${rel(file, u)}${q})`);
    writeFileSync(file, s);
  } else if (file.endsWith('search-index.json')) {
    // linkovi iz pretrage se otvaraju sa /pretraga/ stranice
    const from = join(root, 'pretraga', 'index.html');
    const items = JSON.parse(readFileSync(file, 'utf8')).map((it) => ({ ...it, url: rel(from, it.url) }));
    writeFileSync(file, JSON.stringify(items));
  }
}
console.log(`✓ Relativne putanje: ${changed} HTML fajlova u ${root}`);
