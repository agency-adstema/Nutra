/**
 * Server-only mapping of catalog offer pages to the new MonadLead advertiser account.
 * API keys are never present here; they are read from runtime environment variables.
 */
import { catalogMarkets, getOffer, type OfferGeo } from '../data/offers';
import type { ProductOrderConfig } from '../lib/order/handler';
import { getSuppliedOfferId } from './catalog-offer-ids';
import productSheets from '../data/products.json';
import { getCatalogPrice } from '../data/offer-pricing';

export const catalogOfferEnvKey = (geo: OfferGeo, slug: string) =>
  `CATALOG_OFFER_ID_${geo}_${slug.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

export function getCatalogOrderConfig(
  geo: OfferGeo,
  slug: string,
  env: (key: string) => string | undefined,
): ProductOrderConfig | undefined {
  const offer = getOffer(geo, slug);
  if (!offer) return undefined;

  const sheet = productSheets.find(p => p.country === geo && p.slug === slug);
  if (!sheet?.pricing || !sheet.offer_id) return undefined;
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
    orderEnabled: validId && env('CATALOG_ORDERS_ENABLED') === 'true',
    currency: catalogMarkets[geo].currency,
    // Sajt prikazuje 1/2/3 pakovanja (cene sa Limited Charm za isti proizvod), pa API prima
    // ista pakovanja da kupac ne dobije grešku. MonadLead create-order nema polje za količinu:
    // šalje se offer_id proizvoda, a operater pri pozivu potvrđuje pakovanje i cenu.
    // Kad MonadLead da posebne offer ID-jeve po pakovanju, upisuju se u packages[].offerId.
    packages: (getCatalogPrice(geo, slug)?.tiers ?? [{ id: '1-komad' as const, quantity: 1 as const, label: '', newPrice: sheet.pricing.packages[0].price }])
      .map((t) => ({
        id: t.id,
        label: t.quantity === 1 ? (geo === 'HR' ? '1 pakiranje' : '1 pakovanje') : `${t.quantity} ${geo === 'HR' ? 'pakiranja' : 'pakovanja'}`,
        quantity: t.quantity,
        price: t.newPrice,
      })),
  };
}
