/**
 * Server-only mapping of catalog offer pages to the new MonadLead advertiser account.
 * API keys are never present here; they are read from runtime environment variables.
 */
import { catalogMarkets, getOffer, type OfferGeo } from '../data/offers';
import type { ProductOrderConfig } from '../lib/order/handler';
import { getSuppliedOfferId, isExplicitlyUnavailableOffer } from './catalog-offer-ids';
import productSheets from '../data/products.json';

export const catalogOfferEnvKey = (geo: OfferGeo, slug: string) =>
  `CATALOG_OFFER_ID_${geo}_${slug.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

export function getCatalogOrderConfig(
  geo: OfferGeo,
  slug: string,
  env: (key: string) => string | undefined,
): ProductOrderConfig | undefined {
  const offer = getOffer(geo, slug);
  if (!offer) return undefined;

  const unavailable = isExplicitlyUnavailableOffer(geo, slug);
  const sheet = productSheets.find(p => p.country === geo && p.slug === slug);
  if (!sheet?.pricing || !sheet.offer_id || unavailable) return undefined;
  // The exact offer_id from products.json is matched against the independently
  // supplied server-side account mapping. Never look up / accept hp_offer_id.
  const referenceId = getSuppliedOfferId(geo, slug);
  if (referenceId !== String(sheet.offer_id)) throw new Error(`Offer ID mismatch: ${geo}/${slug}`);
  const key = catalogOfferEnvKey(geo, slug);
  const id = (env(key) || String(sheet.offer_id)).trim();
  const validId = /^\d+$/.test(id);

  return {
    slug: `${geo.toLowerCase()}-${offer.slug}`,
    name: offer.name,
    market: geo,
    offerId: validId ? id : '',
    apiKeyEnv: 'MONADLEAD_API_KEY_CATALOG',
    offerEnvKey: key,
    orderEnabled: !unavailable && validId && env('CATALOG_ORDERS_ENABLED') === 'true',
    currency: catalogMarkets[geo].currency,
    // API order-create only documents offer_id (no quantity/package field).
    // Until the merchant confirms a bundle mechanism, live requests accept
    // ONLY a single package; the website's 2/3 options remain preview-only.
    packages: [{
      id: '1-komad', label: geo === 'HR' ? '1 pakiranje' : '1 pakovanje',
      quantity: 1, price: sheet.pricing.packages[0].price,
    }],
  };
}
