/** Server-side exact GEO + offer ID map from the non-HP MonadLead export.
 * The IDs are publicly supplied offer identifiers, not API credentials.
 * Never infer IDs for excluded hardware, VIP, private or HP offers.
 * Catalog orders remain disabled without explicit server config/credentials.
 */
import data from '../data/monadlead-non-hp.json';
import { slugifyOffer } from '../data/offers';

const idsByGeo = new Map<string, Map<string, string>>();
for (const item of data) {
  if (/^hp(?:[\s-]|$)/i.test(item.product)) throw new Error('HP item in non-HP export');
  if (!idsByGeo.has(item.geo)) idsByGeo.set(item.geo, new Map());
  const ids = idsByGeo.get(item.geo)!;
  const slug = slugifyOffer(item.product);
  if (ids.has(slug)) throw new Error(`Duplicate MonadLead offer ${item.geo}/${slug}`);
  ids.set(slug, String(item.offer_id));
}
export const suppliedRsOfferCount = idsByGeo.get('RS')?.size ?? 0;
export const suppliedHrOfferCount = idsByGeo.get('HR')?.size ?? 0;
export const suppliedBaOfferCount = idsByGeo.get('BA')?.size ?? 0;

/** Exact GEO + slug. Retain the historic RS editorial BoneControl alias. */
export function getSuppliedOfferId(geo: string, slug: string): string | undefined {
  const normalized = geo === 'RS' && slug === 'bonecontrol' ? 'bone-control' : slug;
  return idsByGeo.get(geo)?.get(normalized);
}
