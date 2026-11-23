#!/usr/bin/env node
/**
 * Pretvara keširane slike proizvoda (public/catalog-products/*.png|jpg) u WebP
 * i ažurira src/data/catalog-image-manifest.json. Pokreće se u buildu posle
 * scripts/cache-catalog-images.py. Original se briše tek kad WebP uspešno nastane.
 */
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url).pathname;
const MANIFEST = join(ROOT, 'src/data/catalog-image-manifest.json');
const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
let converted = 0;
for (const [key, path] of Object.entries(manifest)) {
  if (!/\.(png|jpe?g)$/i.test(path)) continue;
  const src = join(ROOT, 'public', path);
  const outPath = path.replace(/\.(png|jpe?g)$/i, '.webp');
  try {
    await sharp(src).resize({ width: 1000, withoutEnlargement: true }).webp({ quality: 82 }).toFile(join(ROOT, 'public', outPath));
    await unlink(src);
    manifest[key] = outPath;
    converted++;
  } catch (e) {
    console.log(`WebP nije napravljen za ${key}: ${e.message} (ostaje original)`);
  }
}
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`WebP: ${converted} slika proizvoda pretvoreno`);
