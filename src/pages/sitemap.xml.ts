import type { APIRoute } from 'astro';
import { getProducts, getCategories, getGuides, productUrl, categoryUrl, guideUrl } from '../lib/content';
import { isoDate } from '../lib/format';
import { getCatalogOffersForCategory } from '../data/offer-categories';
import { indexableOffers, INDEXED_GEO } from '../data/offer-indexing';
import { geoUrl, offerUrl } from '../data/offers';

export const prerender = true;

/** Statičke stranice koje ulaze u sitemap (pretraga i 404 su namerno izostavljene) */
const STATIC_PAGES = [
  '/',
  '/vodici/',
  '/o-nama/',
  '/kontakt/',
  '/kako-pisemo/',
  '/obrada-porudzbina/',
  '/politika-privatnosti/',
  '/kolacici/',
  '/uslovi-koriscenja/',
];

export const GET: APIRoute = async ({ site }) => {
  const base = (site?.toString() ?? '').replace(/\/$/, '');
  const [products, categories, guides] = await Promise.all([getProducts(), getCategories(), getGuides()]);

  const urls: { loc: string; lastmod?: string }[] = [
    ...STATIC_PAGES.map((p) => ({ loc: p })),
    // kategorija se indeksira kada ima naš proizvod ili ponudu iz kataloga (isto pravilo kao na stranici kategorije)
    ...categories
      .filter((c) => products.some((p) => p.data.category.id === c.id) || getCatalogOffersForCategory(c.data.slug).length > 0)
      .map((c) => ({ loc: categoryUrl(c), lastmod: isoDate(c.data.updatedAt) })),
    ...products.map((p) => ({ loc: productUrl(p), lastmod: isoDate(p.data.updatedAt) })),
    ...guides.map((g) => ({ loc: guideUrl(g), lastmod: isoDate(g.data.updatedAt) })),
    { loc: '/ponude/' },
    { loc: geoUrl(INDEXED_GEO) },
    ...indexableOffers().map((o) => ({ loc: offerUrl(o) })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${base}${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
