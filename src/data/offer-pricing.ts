/**
 * Partner pricing supplied in uploaded XLSX "Biljni kompas – proizvodi, offer ID i slike (MonadLead).xlsx".
 * Worksheet "Cene": 45 offer rows; worksheet "Tekstovi za cene": 1/2/3-pack copy.
 *
 * Source status:
 * - All 20 Regular offers: one, two, three package *new* prices from XLSX.
 * - All 21 HP offers: ONE package new price; old HP prices are PROPOSALS in XLSX
 *   and MUST NOT be displayed as real historical/discount prices.
 * - 4 BA unavailable: no price, no order.
 * - Regular "old" prices are reference values in XLSX, not independently verified
 *   past selling prices. Keep for controlled staging previews; don't publish as
 *   consumer-facing crossed-out prices before confirming previous prices.
 * - Delivery 1–2 workdays, deadlines, stock scarcity and "30-day supply" remain
 *   unverified and are deliberately not advertised.
 */
import { getOfferDetails } from './offer-details';
import type { OfferGeo } from './offers';

export type PriceTier = {
  id: '1-komad' | '2-komada' | '3-komada';
  quantity: 1 | 2 | 3;
  label: string;
  newPrice: number;
  /** XLSX reference price. Not a confirmed historical selling price. */
  referencePrice: number | null;
};
export type CatalogPrice = {
  geo: OfferGeo;
  type: 'regular' | 'hp';
  currency: 'RSD' | 'BAM' | 'EUR';
  currencyLabel: 'RSD' | 'KM' | '€';
  freeShippingPerSheet: boolean;
  priceVerifiedWithMerchant: false;
  tiers: PriceTier[];
};

const xlsxPriceMatrix: Record<OfferGeo,{
  currency: CatalogPrice['currency'];
  currencyLabel: CatalogPrice['currencyLabel'];
  regular: Array<[number, number, number]>;
  hpOne: number;
}> = {
  RS: {
    currency: 'RSD', currencyLabel: 'RSD',
    regular: [[1, 5500, 3700], [2, 11000, 5850], [3, 16500, 6800]],
    hpOne: 2000,
  },
  BA: {
    currency: 'BAM', currencyLabel: 'KM',
    regular: [[1, 110, 55], [2, 220, 85], [3, 330, 100]],
    hpOne: 30,
  },
  HR: {
    currency: 'EUR', currencyLabel: '€',
    regular: [[1, 78, 39], [2, 156, 69], [3, 234, 78]],
    hpOne: 20,
  },
};

export function getCatalogPrice(geo: OfferGeo, slug: string): CatalogPrice | undefined {
  const details = getOfferDetails(geo, slug);
  if (!details?.availableInAccount || details.priceAmount == null) return undefined;
  const cfg = xlsxPriceMatrix[geo];
  const isHP = slug.startsWith('hp-');
  const tiers: PriceTier[] = isHP
    ? [{ id: '1-komad', quantity: 1, label: '1 pakovanje', newPrice: cfg.hpOne, referencePrice: null }]
    : cfg.regular.map(([qty, old, current]) => ({
      id: qty === 1 ? '1-komad' : qty === 2 ? '2-komada' : '3-komada',
      quantity: qty as 1 | 2 | 3,
      label: `${qty} ${geo === 'HR' ? 'pakiranja' : 'pakovanja'}`,
      newPrice: current,
      referencePrice: old,
    }));
  // Fail closed if the partner's provided one-pack price disagrees with Excel.
  if (tiers[0].newPrice !== details.priceAmount || details.currency !== cfg.currency) {
    throw new Error(`Cena u XLSX i partner products.json nije usaglašena: ${geo}/${slug}`);
  }
  return {
    geo,
    type: isHP ? 'hp' : 'regular',
    currency: cfg.currency,
    currencyLabel: cfg.currencyLabel,
    freeShippingPerSheet: true,
    priceVerifiedWithMerchant: false,
    tiers,
  };
}

/**
 * Three established editorial pages predate the multi-GEO /ponude/ catalog.
 * Their RS regular package prices use the *general* Regular/RS tiers in the XLSX.
 * Note: Nautubone RS and BoneControl RS are not individual rows in that
 * 45-offer sheet, so those values are a template awaiting per-offer confirmation.
 */
export function getEditorialPrice(geo: string, slug: string): CatalogPrice | undefined {
  if (geo !== 'RS' || !['nautubone', 'bonecontrol', 'parazol'].includes(slug)) return undefined;
  const cfg = xlsxPriceMatrix.RS;
  return {
    geo: 'RS', type: 'regular', currency: cfg.currency, currencyLabel: cfg.currencyLabel,
    freeShippingPerSheet: true, priceVerifiedWithMerchant: false,
    tiers: cfg.regular.map(([qty, reference, current]) => ({
      id: qty === 1 ? '1-komad' : qty === 2 ? '2-komada' : '3-komada',
      quantity: qty as 1 | 2 | 3,
      label: `${qty} pakovanja`,
      newPrice: current,
      referencePrice: reference,
    })),
  };
}

export function referencePriceNotice(slug: string): string {
  return slug === 'nautubone' || slug === 'bonecontrol'
    ? 'Prema RS Regular cenovniku iz dokumenta; cena za ovaj konkretan offer još nije pojedinačno potvrđena.'
    : 'Prema dostavljenom cenovniku partnera; referentna cena nije nezavisno potvrđena kao prethodna prodajna cena.';
}

export function formatCatalogPrice(amount: number, geo: OfferGeo): string {
  const p = xlsxPriceMatrix[geo];
  const s = new Intl.NumberFormat(geo === 'HR' ? 'hr-HR' : 'sr-RS', {
    maximumFractionDigits: 0,
  }).format(amount);
  return p.currencyLabel === '€' ? `${s} €` : `${s} ${p.currencyLabel}`;
}
