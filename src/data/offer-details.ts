/**
 * Shop-facing product details from partner-supplied products.json (23 Nov 2026).
 * Internal payout, Drive folders and tracking are intentionally not public.
 * Price and instructions are supplier claims, not medical or current-price verification.
 */
import raw from './offer-details.json';
import manifest from './catalog-image-manifest.json';
import type { OfferGeo } from './offers';

export interface OfferDetails {
  country: OfferGeo;
  slug: string;
  price: string | null;
  priceAmount: number | null;
  currency: string;
  form: string | null;
  package: string | null;
  description: string | null;
  composition: string | null;
  usage: string | null;
  not_for: string | null;
  imageUrl: string | null;
  partnerVerified: boolean;
  availableInAccount: boolean;
}

export const offerDetails = raw as OfferDetails[];
const entries = new Map<string, OfferDetails>(offerDetails.map(d => [`${d.country}/${d.slug}`, d]));

export function getOfferDetails(geo: OfferGeo, slug: string): OfferDetails | undefined {
  return entries.get(`${geo}/${slug}`);
}

/** Self-hosted when downloaded during staging build; remote original is fallback. */
export function getOfferImage(details: OfferDetails | undefined): string | null {
  if (!details?.imageUrl) return null;
  const key = `${details.country}/${details.slug}`;
  const local = (manifest as Record<string,string>)[key];
  return local || details.imageUrl;
}
