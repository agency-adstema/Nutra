import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { PUBLIC_MARKET } from 'astro:env/client';

export type Product = CollectionEntry<'products'>;
export type Category = CollectionEntry<'categories'>;
export type Guide = CollectionEntry<'guides'>;

export const MARKET = PUBLIC_MARKET;

export async function getProducts(): Promise<Product[]> {
  const all = await getCollection('products', (p) => !p.data.draft && p.data.market === MARKET);
  return all.sort(
    (a, b) => Number(b.data.featured) - Number(a.data.featured) || a.data.sortOrder - b.data.sortOrder || a.data.name.localeCompare(b.data.name, 'sr'),
  );
}

export async function getCategories(): Promise<Category[]> {
  const all = await getCollection('categories', (c) => c.data.market === MARKET);
  return all.sort((a, b) => a.data.order - b.data.order);
}

export async function getGuides(): Promise<Guide[]> {
  const all = await getCollection('guides', (g) => !g.data.draft && g.data.market === MARKET);
  return all.sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
}

export async function getProductsByIds(ids: { id: string }[]): Promise<Product[]> {
  const entries = await Promise.all(ids.map((r) => getEntry('products', r.id)));
  return entries.filter((p): p is Product => !!p && !p.data.draft);
}

export const productUrl = (p: Product) => `/${p.data.category.id}/${p.data.slug}/`;
export const categoryUrl = (c: Category) => `/${c.data.slug}/`;
export const guideUrl = (g: Guide) => `/vodici/${g.data.slug}/`;

/** Videi koji smeju da se prikažu: samo uz potvrđenu dozvolu */
export function visibleVideos(p: Product) {
  return p.data.videos.filter((v) => v.permission.granted === true && !v.demo);
}
