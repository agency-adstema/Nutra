/**
 * Partner offer catalog supplied by the operator on 2026-11-23.
 *
 * Source fields: exact product name, GEO, category, offer ID, direct price
 * and image URL from the merchant's JSON. Order submission remains separate.
 *
 * Preserve source casing. Duplicate name+GEO rows are merged;
 * distinct verticals on one offer are kept as tags.
 * Merchant decision (23 Nov 2026): all "HP" offers removed from the catalog in
 * every GEO; they duplicated the regular products.
 */
import productsJson from './products.json';
import monadleadOffers from './monadlead-non-hp.json';
export type OfferGeo = 'RS' | 'BA' | 'HR';
export const catalogMarkets: Record<OfferGeo, { name: string; shortName: string; currency: string }> = {
  RS: { name: 'Srbija', shortName: 'Srbija', currency: 'RSD' },
  BA: { name: 'Bosna i Hercegovina', shortName: 'Bosna', currency: 'BAM' },
  HR: { name: 'Hrvatska', shortName: 'Hrvatska', currency: 'EUR' },
};
export const catalogGeoOrder: OfferGeo[] = ['RS', 'BA', 'HR'];

const verticalLabels: Record<string, string> = {
  'Potency': 'Potencija',
  'Male Enlargement': 'Muško povećanje',
  'Parasites': 'Paraziti',
  'Vision': 'Vid',
  'Fungus': 'Gljivice',
  'Hearing': 'Sluh',
  'Cystitis': 'Cistitis',
  'Joints': 'Zglobovi',
  'Prostatitis': 'Prostata',
  'Muscle': 'Mišići',
  'Hypertension': 'Krvni pritisak',
  'Beauty': 'Lepota',
  'Diabetes': 'Šećer u krvi',
  'Weight Loss': 'Mršavljenje',
  'Hair': 'Kosa',
  'Varicose': 'Proširene vene',
  'Health & Beauty': 'Zdravlje i lepota',
};
export const verticalLabel = (value: string) => verticalLabels[value] ?? value;

export interface Offer {
  name: string;
  geo: OfferGeo;
  slug: string;
  verticals: string[];
  /** Catalog listing only. Order processing stays off until validated CRM IDs/prices exist. */
  orderEnabled: false;
}

/** Every direct-price non-HP MonadLead offer supplied on 23 November 2026.
 * Category labels remain verbatim from the partner and are split by comma.
 * Hardware, private/VIP and test lists were explicitly excluded.
 */
export const sourceOfferRows = monadleadOffers.flatMap((offer) =>
  offer.category.split(',').map((vertical) => ({
    name: offer.product,
    geo: offer.geo as OfferGeo,
    vertical: vertical.trim(),
  })).filter((record) => record.vertical.length > 0)
);

export const slugifyOffer = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const catalogMap = new Map<string, Offer>();
for (const row of sourceOfferRows) {
  const key = `${row.geo}:${slugifyOffer(row.name)}`;
  let offer = catalogMap.get(key);
  if (!offer) {
    offer = { name: row.name, geo: row.geo, slug: slugifyOffer(row.name), verticals: [], orderEnabled: false };
    catalogMap.set(key, offer);
  }
  if (!offer.verticals.includes(row.vertical)) offer.verticals.push(row.vertical);
}

// Publish only offers with pricing.packages and a matched offer_id.
export const allOffers: Offer[] = Array.from(catalogMap.values()).sort(
  (a, b) => catalogGeoOrder.indexOf(a.geo) - catalogGeoOrder.indexOf(b.geo)
    || a.name.localeCompare(b.name, 'sr'),
);
const sellableKeys = new Set(
  productsJson.filter(p => p.offer_id && p.pricing && p.pricing.packages?.length > 0)
    .map(p => p.country + '/' + p.slug),
);
export const offers: Offer[] = allOffers.filter((o) => sellableKeys.has(o.geo + '/' + o.slug));
export const getOffersByGeo = (geo: OfferGeo) => offers.filter((offer) => offer.geo === geo);
export const offerUrl = (offer: Offer) => `/ponude/${offer.geo.toLowerCase()}/${offer.slug}/`;
export const geoUrl = (geo: OfferGeo) => `/ponude/${geo.toLowerCase()}/`;
export const getOffer = (geo: OfferGeo, slug: string) =>
  offers.find((offer) => offer.geo === geo && offer.slug === slug);
