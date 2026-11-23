/**
 * Server-only mapping of catalog offer pages to the new MonadLead advertiser account.
 * API keys are never present here; they are read from runtime environment variables.
 */
import { catalogMarkets, getOffer, type OfferGeo } from '../data/offers';
import type { ProductOrderConfig } from '../lib/order/handler';
import { getSuppliedOfferId, isExplicitlyUnavailableOffer } from './catalog-offer-ids';

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
  const key = catalogOfferEnvKey(geo, slug);
  // A known unavailable offer cannot be revived accidentally by an env override.
  const id = unavailable ? '' : (env(key) || getSuppliedOfferId(geo, slug) || '').trim();
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
    packages: [{ id: '1-komad', label: '1 pakovanje', quantity: 1 }],
  };
}
