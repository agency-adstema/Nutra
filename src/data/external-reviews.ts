/**
 * Ratings DISPLAYED on exact Limited Charm product DETAIL pages, checked on 2026-11-23.
 * These are third-party claims, not Moja Zdravica reviews or independent verification.
 *
 * IMPORTANT: Their /svi-proizvodi listing often shows a DIFFERENT number
 * (e.g. Nautubone RS listing 4.9/4120 vs product page 4.6/87).
 * Only the product detail's explicitly stated review count is used here.
 *
 * No HP offer inherits a rating from a non-HP product. No rating is fabricated.
 */
import type { OfferGeo } from './offers';

export interface ExternalReview {
  score: number;
  count: number;
  sourceName: 'Limited Charm';
  sourceUrl: string;
  checkedAt: string;
}
type Entry = readonly [OfferGeo, string, number, number, string];
const checkedAt = '2026-11-23';
const entries: readonly Entry[] = [
  // Serbia — exact match, individual product page data
  ['RS','testoy',4.6,6,'testoy'],
  ['RS','parazol',4.5,28,'parazol'],
  ['RS','o-caps',4.5,10,'o-caps'],
  ['RS','mikoherb',4.4,16,'miko-herb'],
  ['RS','u-caps',4.7,5,'u-caps'],
  ['RS','dia-drops',4.5,17,'diadrops'],
  ['RS','nautubone',4.6,87,'nautubone'],
  ['RS','bonecontrol',4.5,20,'bone-control'],

  // Bosnia & Herzegovina — exact match, individual product page data
  ['BA','nautubone',4.6,77,'nautubone'],
  ['BA','pro-caps',4.4,15,'pro-caps'],
  ['BA','parazol',4.6,10,'parazol'],

  // Croatia — exact match, individual product page data
  ['HR','beauty-derm',4.6,48,'beauty-derm'],
  ['HR','deep-inhale',5.0,1,'deep-inhale'],
  ['HR','diatea',4.3,5,'diatea'],
  ['HR','mikoherb',4.6,24,'miko-herb'],
  ['HR','nautubone',4.6,84,'nautubone'],
  ['HR','pro-caps',4.5,5,'pro-caps'],
  ['HR','varcosin',4.6,15,'varcosin'],
];
export const externalReviews = new Map<string, ExternalReview>(
  entries.map(([geo, slug, score, count, sourceSlug]) => [
    `${geo}/${slug}`,
    {
      score,
      count,
      sourceName: 'Limited Charm',
      sourceUrl: `https://limitedcharm.com/${geo.toLowerCase()}/proizvod/${sourceSlug}`,
      checkedAt,
    },
  ]),
);

export function getExternalReview(geo: OfferGeo, slug: string): ExternalReview | undefined {
  // Exact GEO+product match; don't transfer reviews to HP alternative offers.
  return externalReviews.get(`${geo}/${slug}`);
}
