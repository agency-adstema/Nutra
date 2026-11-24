/** Svaki vodič mora da ima .webp sliku sa alt tekstom (naslovna u frontmatteru i bar jedna u tekstu) */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';

const dir = 'src/content/guides';
const guides = readdirSync(dir)
  .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
  .map((f) => {
    const raw = readFileSync(`${dir}/${f}`, 'utf8');
    const [, fm, ...rest] = raw.split(/^---$/m);
    return { file: f, path: `${dir}/${f}`, data: parse(fm), body: rest.join('---') };
  });

function isWebp(file: string): boolean {
  const b = readFileSync(file);
  return b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP';
}

describe('slike u vodičima', () => {
  it.each(guides.map((g) => [g.file, g]))('%s: naslovna slika je .webp i ima alt', (_: string, g: any) => {
    expect(g.data.heroImage, 'heroImage nedostaje').toBeTruthy();
    expect(g.data.heroImage).toMatch(/\.webp$/);
    const img = resolve(dirname(g.path), g.data.heroImage);
    expect(existsSync(img), `ne postoji ${img}`).toBe(true);
    expect(isWebp(img)).toBe(true);
    expect(statSync(img).size).toBeLessThan(400 * 1024);
    expect(String(g.data.heroImageAlt ?? '').trim().length).toBeGreaterThanOrEqual(20);
  });

  it.each(guides.map((g) => [g.file, g]))('%s: slike u tekstu su .webp i imaju alt', (_: string, g: any) => {
    const imgs = [...g.body.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)];
    expect(imgs.length, 'u tekstu nema slike').toBeGreaterThanOrEqual(1);
    for (const [, alt, src] of imgs) {
      expect(alt.trim().length, `prazan alt za ${src}`).toBeGreaterThanOrEqual(20);
      expect(src).toMatch(/\.webp$/);
      const img = resolve(dirname(g.path), src);
      expect(existsSync(img), `ne postoji ${img}`).toBe(true);
      expect(isWebp(img)).toBe(true);
    }
  });
});
