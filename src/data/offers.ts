/**
 * Partner offer catalog supplied by the operator on 2026-11-23.
 *
 * Source fields: offer name, GEO and vertical. We have NO verified prices,
 * inventory, imagery rights, conversion payout, fulfillment details or API offer IDs.
 * Entries here are discoverable in the shop, but cannot accept orders.
 *
 * Preserve source casing and all source rows. Duplicate name+GEO rows are merged;
 * distinct verticals on one offer are kept as tags.
 */
import productsJson from './products.json';
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

const rawOfferRows = `
TestoY|RS|Potency
TestoY|RS|Male Enlargement
Parazol|RS|Parasites
O caps|RS|Vision
Mikoherb|RS|Fungus
U Caps|RS|Hearing
CY-relief|HR|Cystitis
Nautubone|BA|Joints
Pro Caps|BA|Prostatitis
Deep Inhale|HR|Muscle
HP Para Caps|BA|Parasites
HP Testoy Gel|HR|Potency
HP Cardio Zen|BA|Hypertension
Power Pulse XXL|RS|Potency
HP Testoy Gel|BA|Potency
HP Testoy Gel|BA|Male Enlargement
HP Para Clean|BA|Parasites
Beauty Derm|HR|Beauty
HP Parazol|HR|Parasites
Dia Drops|RS|Diabetes
Pro Caps|BA|Prostatitis
Quick Fit|RS|Weight Loss
HP Lossless|RS|Hair
HP Varcosin|RS|Varicose
HP Pro Caps|BA|Prostatitis
HP Beauty Derm|BA|Beauty
HP GoSlim|RS|Weight Loss
HP Slim Ease|BA|Weight Loss
Parazol|BA|Parasites
HP Glyco Balance|BA|Diabetes
HP Nautubone|BA|Joints
CY-relief|BA|Cystitis
HP Para Caps|RS|Parasites
Nautubone|HR|Joints
Pro Caps|HR|Prostatitis
HP Pro Caps|RS|Prostatitis
HP Nautubone|BA|Joints
Nautubone|HR|Joints
HP TestoY Gel|RS|Potency
CY-relief|BA|Cystitis
HP Nautubone|BA|Joints
HP Nautubone|RS|Joints
Mikoherb|HR|Fungus
HP Beauty Derm|RS|Health & Beauty
HP U Caps|RS|Hearing
HP Bone Control|RS|Joints
HP Nautubone|HR|Joints
HP Para Clean|BA|Parasites
Diatea|HR|Diabetes
HP TestoY Gel|RS|Potency
HP Beauty Derm|HR|Beauty
HP Slim Ease|BA|Weight Loss
HP Slim Ease|RS|Weight Loss
HP Lossless|RS|Hair
HP GoSlim|HR|Weight Loss
Varcosin|HR|Varicose
`.trim();

export const sourceOfferRows = rawOfferRows.split('\n').map((line) => {
  const [name, geo, vertical] = line.trim().split('|');
  if (!name || !['RS', 'BA', 'HR'].includes(geo) || !vertical) {
    throw new Error(`Neispravan red u katalogu ponuda: ${line}`);
  }
  return { name, geo: geo as OfferGeo, vertical };
});

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

// Preserve all 45 source offers for audit, but publish only the 41 with
// pricing.packages and a matched offer_id. Four unavailable BA products disappear
// from navigation, search, categories and newly generated offer pages.
export const allOffers: Offer[] = Array.from(catalogMap.values()).sort(
  (a, b) => catalogGeoOrder.indexOf(a.geo) - catalogGeoOrder.indexOf(b.geo)
    || a.name.localeCompare(b.name, 'sr'),
);
const sellableKeys = new Set(
  productsJson.filter(p => p.offer_id && p.pricing && p.pricing.packages?.length > 0)
    .map(p => p.country + '/' + p.slug),
);
export const offers: Offer[] = allOffers.filter(o => sellableKeys.has(o.geo + '/' + o.slug));
export const getOffersByGeo = (geo: OfferGeo) => offers.filter((offer) => offer.geo === geo);
export const offerUrl = (offer: Offer) => `/ponude/${offer.geo.toLowerCase()}/${offer.slug}/`;
export const geoUrl = (geo: OfferGeo) => `/ponude/${geo.toLowerCase()}/`;
export const getOffer = (geo: OfferGeo, slug: string) =>
  offers.find((offer) => offer.geo === geo && offer.slug === slug);
