/**
 * Product-specific prices copied from the exact uploaded spreadsheet (worksheet
 * "Cene", 45 rows) and normalized into src/data/products.json -> pricing.packages.
 *
 * Regular "old" amounts are REFERENCE prices from the partner sheet; not
 * independently verified previous sale prices. Never assert verified markdown.
 * HP "old" prices were explicitly labeled proposals; omit old/savings/% for HP.
 * Free shipping and 1–2 business days are partner-supplied delivery estimates.
 */
import productsJson from './products.json';
import { getOfferDetails } from './offer-details';
import type { OfferGeo } from './offers';

export type PriceTier = {
  id: '1-komad' | '2-komada' | '3-komada';
  quantity: 1 | 2 | 3;
  label: string;
  newPrice: number;
  referencePrice: number | null;
  savings: number | null;
  discountPercent: number | null;
  unitPrice: number;
};
export type CatalogPrice = {
  geo: OfferGeo;
  type: 'regular' | 'hp';
  currency: 'RSD' | 'BAM' | 'EUR';
  currencyLabel: 'RSD' | 'KM' | '€';
  freeShippingPerSheet: boolean;
  estimatedDeliveryBusinessDays: readonly [number,number];
  paymentOnDelivery: true;
  priceVerifiedWithMerchant: false;
  tiers: PriceTier[];
};

type ProductPriceSource = {
  country: OfferGeo;
  slug: string;
  offer_id: number | null;
  pricing: null | {
    currency: CatalogPrice['currency'];
    packages: Array<{
      id: PriceTier['id'];
      quantity: PriceTier['quantity'];
      oldPrice: number | null;
      price: number;
      savings: number | null;
      discountPercent: number | null;
      unitPrice: number;
    }>;
  };
  delivery: null | {
    free: boolean;
    estimatedBusinessDays: number[];
    cod: boolean;
  };
};
const sources = productsJson as ProductPriceSource[];
const sourceByKey = new Map(sources.map((r) => [r.country + '/' + r.slug, r]));
const currencyLabels: Record<OfferGeo,CatalogPrice['currencyLabel']> = { RS:'RSD', BA:'KM', HR:'€' };

export function getCatalogPrice(geo: OfferGeo, slug: string): CatalogPrice | undefined {
  const source = sourceByKey.get(geo + '/' + slug);
  const details = getOfferDetails(geo, slug);
  if (!source?.pricing || !source.offer_id || !details?.availableInAccount) return undefined;
  const type = slug.startsWith('hp-') ? 'hp' : 'regular';
  const tiers = source.pricing.packages.map(p => ({
    id: p.id,
    quantity: p.quantity,
    label: p.quantity === 1 ? (geo === 'HR' ? '1 pakiranje' : '1 pakovanje')
      : `${p.quantity} ${geo === 'HR' ? 'pakiranja' : 'pakovanja'}`,
    newPrice: p.price,
    referencePrice: type === 'hp' ? null : p.oldPrice,
    savings: type === 'hp' ? null : p.savings,
    discountPercent: type === 'hp' ? null : p.discountPercent,
    unitPrice: p.unitPrice,
  }));
  if (!tiers.length || tiers[0].newPrice !== details.priceAmount ||
      source.pricing.currency !== details.currency) {
    throw new Error(`Price mismatch between products.json and offer-details.json: ${geo}/${slug}`);
  }
  return {
    geo, type,
    currency: source.pricing.currency,
    currencyLabel: currencyLabels[geo],
    freeShippingPerSheet: source.delivery?.free === true,
    estimatedDeliveryBusinessDays: [1,2],
    paymentOnDelivery: true,
    priceVerifiedWithMerchant: false,
    tiers,
  };
}

/** Three legacy RS editorial pages use regular RS price sheet; Nautubone and
 * BoneControl were not individual regular RS rows in the 45-offer sheet. */
export function getEditorialPrice(geo: string, slug: string): CatalogPrice | undefined {
  if (geo !== 'RS' || !['nautubone', 'bonecontrol', 'parazol'].includes(slug)) return undefined;
  return getCatalogPrice('RS', 'parazol');
}
export function formatCatalogPrice(amount: number, geo: OfferGeo): string {
  const amountText = new Intl.NumberFormat(
    geo === 'RS' ? 'sr-RS' : geo === 'BA' ? 'bs-BA' : 'hr-HR',
    { minimumFractionDigits: geo === 'RS' ? 0 : 2, maximumFractionDigits: geo === 'RS' ? 0 : 2 }
  ).format(amount);
  return geo === 'HR' ? `${amountText} €` : `${amountText} ${currencyLabels[geo]}`;
}

export function popularPackageBadge(geo: OfferGeo, quantity: number): string | null {
  if (quantity !== 3) return null;
  if (geo === 'RS') return 'NAJPOPULARNIJE · -59%';
  if (geo === 'BA') return 'Najpopularnije · Najbolja cijena';
  return 'Najpopularnije · -67%';
}

export function deliveryTerms(geo: OfferGeo): string {
  return geo === 'BA'
    ? 'Besplatna dostava · Dostava 1–2 radna dana · Plaćanje pouzećem'
    : geo === 'HR'
      ? 'Besplatna dostava · Dostava 1–2 radna dana · Plaćanje pouzećem'
      : 'Besplatna dostava · Dostava 1–2 radna dana · Plaćanje pouzećem';
}
