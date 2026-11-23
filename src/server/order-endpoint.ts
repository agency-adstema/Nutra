/**
 * POST /api/order — ubacuje se kroz integraciju u astro.config.mjs (samo kada postoji adapter).
 * Sva logika je u src/lib/order/handler.ts; ovde samo povezujemo Astro okruženje.
 */
import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { getSecret } from 'astro:env/server';
import { site } from '../config/site';
import type { OfferGeo } from '../data/offers';
import { getCatalogOrderConfig, catalogOfferEnvKey } from './catalog-order-config';
import { getSuppliedOfferId } from './catalog-offer-ids';
import { createOrderHandler, type ProductOrderConfig } from '../lib/order/handler';

export const prerender = false;

const handler = createOrderHandler({
  env: (key) => getSecret(key) ?? undefined,
  siteUrl: import.meta.env.SITE,
  requireConsent: site.consentMode === 'checkbox',
  getProduct: async (slug): Promise<ProductOrderConfig | undefined> => {
    // The three-country catalog belongs to a SEPARATE advertiser account.
    // Never route these leads through any legacy key or client-provided offer ID.
    const match = /^(rs|ba|hr)-([a-z0-9-]+)$/.exec(slug);
    if (match) {
      const geo = match[1].toUpperCase() as OfferGeo;
      const mapped = getCatalogOrderConfig(geo, match[2], (key) => getSecret(key) ?? undefined);
      if (mapped) return mapped;
    }
    const entry = await getEntry('products', slug);
    if (!entry || entry.data.draft) return undefined;
    const d = entry.data;
    // Existing RS editorial product pages use the same new catalog account.
    // Do not use the legacy key or placeholder ID for Nautubone / Parazol / BoneControl.
    const suppliedRsId = d.countryCode === 'RS' ? getSuppliedOfferId('RS', d.slug) : undefined;
    const catalogKey = suppliedRsId ? catalogOfferEnvKey('RS', d.slug) : undefined;
    const configuredId = catalogKey ? (getSecret(catalogKey) || suppliedRsId || '').trim() : d.offerId;
    const isCatalog = !!catalogKey;
    return {
      slug: d.slug,
      name: d.name,
      market: d.countryCode,
      offerId: configuredId,
      apiKeyEnv: isCatalog ? 'MONADLEAD_API_KEY_CATALOG' : undefined,
      offerEnvKey: catalogKey,
      orderEnabled: isCatalog
        ? (getSecret('CATALOG_ORDERS_ENABLED') === 'true' && /^\d+$/.test(configuredId) && d.orderEnabled)
        : d.orderEnabled,
      currency: d.currency,
      packages: d.packages.map((p) => ({ id: p.id, label: p.label, quantity: p.quantity, price: p.price, offerId: isCatalog ? undefined : p.offerId })),
    };
  },
});

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let ip: string | undefined;
  try {
    ip = clientAddress;
  } catch {
    ip = undefined;
  }
  return handler(request, ip);
};

export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ status: 'error', message: 'Method not allowed' }), {
    status: 405,
    headers: { Allow: 'POST', 'Content-Type': 'application/json' },
  });
