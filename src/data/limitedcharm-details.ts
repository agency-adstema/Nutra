/**
 * Sastav i komentari kupaca preuzeti sa Limited Charm stranica proizvoda.
 * Fajl limitedcharm-details.json puni scripts/import-limitedcharm-details.py (GitHub Actions).
 * To su tvrdnje prodavca: prikazuju se uz oznaku izvora i NE ulaze u JSON-LD.
 */
import raw from './limitedcharm-details.json';

export interface LcComposition {
  eyebrow: string;
  title: string;
  label: string;
  name: string;
  latin?: string | null;
  inci: string;
  tags: string[];
  image?: string;
  imageAlt?: string | null;
}
export interface LcReview {
  text: string;
  initials: string;
  score: number;
}
export interface LcReviews {
  score: number | null;
  count: number | null;
  items: LcReview[];
}
export interface LcPricing {
  tiers: { quantity: number; oldPrice: number; price: number }[];
  freeDelivery: boolean;
}
export interface LcDetails {
  sourceUrl: string;
  composition: LcComposition | null;
  reviews: LcReviews | null;
  pricing?: LcPricing | null;
}

const data = raw as { sourceName: string; checkedAt: string; items: Record<string, LcDetails> };
export const lcSourceName = data.sourceName;
export const lcCheckedAt = new Date(`${data.checkedAt}T00:00:00Z`);

export function getLcDetails(geo: string, slug: string): LcDetails | undefined {
  return data.items[`${geo}/${slug}`];
}
