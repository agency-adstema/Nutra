import type { APIRoute } from 'astro';
import { getProducts, getCategories, getGuides, productUrl, categoryUrl, guideUrl } from '../lib/content';
import { offers, offerUrl, verticalLabel, catalogMarkets } from '../data/offers';

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
    ...offers.map((o) => ({
      type: 'offer',
      title: `${o.name} – ${catalogMarkets[o.geo].shortName}`,
      url: offerUrl(o),
      description: 'Kataloška ponuda – cena i dostupnost u pripremi.',
      keywords: [o.name, o.geo, catalogMarkets[o.geo].name, ...o.verticals.map(verticalLabel), ...o.verticals].join(' '),
    })),
    ...categories.map((c) => ({ type: 'category', title: c.data.name, url: categoryUrl(c), description: c.data.shortDescription, keywords: '' })),
    ...guides.map((g) => ({ type: 'guide', title: g.data.title, url: guideUrl(g), description: g.data.description, keywords: '' })),
  ];
  return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
