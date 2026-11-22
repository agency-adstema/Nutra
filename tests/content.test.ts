/** Provere sadržaja koje Astro šema ne pokriva (kontrast teme, rezervisani slugovi, cene) */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { contrastRatio, formatPrice, priceView, normalizeSearch } from '../src/lib/format';
import { reservedSlugs } from '../src/config/site';

function load(dir: string): { file: string; data: any }[] {
  return readdirSync(`src/content/${dir}`)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => ({ file: f, data: parse(readFileSync(`src/content/${dir}/${f}`, 'utf8').split(/^---$/m)[1]) }));
}

const products = load('products');
const categories = load('categories');

describe('proizvodi', () => {
  it('slugovi su jedinstveni i odgovaraju nazivu fajla', () => {
    const slugs = products.map((p) => p.data.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    products.forEach((p) => expect(p.file).toBe(`${p.data.slug}.md`));
  });

  it.each(products.map((p) => [p.data.slug, p.data]))('%s: tema ima dovoljan kontrast (WCAG AA)', (_: string, d: any) => {
    if (d.themePrimary) expect(contrastRatio(d.themePrimary, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    if (d.themePrimary && d.themeBackground) expect(contrastRatio(d.themePrimary, d.themeBackground)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(products.map((p) => [p.data.slug, p.data]))('%s: proverena cena mora imati datum provere', (_: string, d: any) => {
    if (d.priceStatus === 'verified') expect(d.priceCheckedAt).toBeTruthy();
  });

  it.each(products.map((p) => [p.data.slug, p.data]))('%s: prikazani video mora imati dozvolu', (_: string, d: any) => {
    for (const v of d.videos ?? []) {
      if (v.verifiedPurchase) expect(v.permission?.granted).toBe(true);
      if (v.author && v.authorConsent !== true) expect(v.authorConsent).not.toBe(true);
    }
  });
});

describe('kategorije', () => {
  it('slug ne sme biti rezervisan', () => {
    categories.forEach((c) => expect(reservedSlugs).not.toContain(c.data.slug));
  });
  it('svaki proizvod pokazuje na postojeću kategoriju', () => {
    const ids = categories.map((c) => c.data.slug);
    products.forEach((p) => expect(ids).toContain(p.data.category));
  });
});

describe('format', () => {
  it('formatPrice', () => {
    expect(formatPrice(3700)).toBe('3.700 RSD');
    expect(formatPrice(12500, 'KM')).toBe('12.500 KM');
  });
  it('priceView: unknown cena se ne prikazuje', () => {
    expect(priceView('unknown', [{ id: 'a', label: 'a', quantity: 1, price: 100 }]).show).toBe(false);
    expect(priceView('demo', [{ id: 'a', label: 'a', quantity: 1, price: 100 }])).toMatchObject({ show: true, isDemo: true, min: 100 });
  });
  it('normalizeSearch', () => {
    expect(normalizeSearch('Đumbir  ČAJ')).toBe('djumbir caj');
  });
});
