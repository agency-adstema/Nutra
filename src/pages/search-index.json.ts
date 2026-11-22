import type { APIRoute } from 'astro';
import { getProducts, getCategories, getGuides, productUrl, categoryUrl, guideUrl } from '../lib/content';

export const prerender = true;

export const GET: APIRoute = async () => {
  const [products, categories, guides] = await Promise.all([getProducts(), getCategories(), getGuides()]);
  const items = [
    ...products.map((p) => ({
      type: 'product',
      title: p.data.h1 ?? p.data.name,
      url: productUrl(p),
      description: p.data.shortDescription,
      keywords: [p.data.name, p.data.productType, ...p.data.ingredients.map((i) => `${i.name} ${i.latin ?? ''}`)].join(' '),
    })),
    ...categories.map((c) => ({ type: 'category', title: c.data.name, url: categoryUrl(c), description: c.data.shortDescription, keywords: '' })),
    ...guides.map((g) => ({ type: 'guide', title: g.data.title, url: guideUrl(g), description: g.data.description, keywords: '' })),
  ];
  return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
