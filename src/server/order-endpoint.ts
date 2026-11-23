/**
 * POST /api/order — ubacuje se kroz integraciju u astro.config.mjs (samo kada postoji adapter).
 * Sva logika je u src/lib/order/handler.ts; ovde samo povezujemo Astro okruženje.
 */
import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { getSecret } from 'astro:env/server';
import { site } from '../config/site';
import { catalogMarkets, getOffer, type OfferGeo } from '../data/offers';
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
      const offer = getOffer(geo, match[2]);
      if (offer) {
        const offerEnvKey = `CATALOG_OFFER_ID_${geo}_${offer.slug.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
        const id = getSecret(offerEnvKey) ?? '';
        const enabled = getSecret('CATALOG_ORDERS_ENABLED') === 'true' && /^\\d+$/.test(id);
        return {
          slug,
          name: offer.name,
          market: geo,
          offerId: '',
          apiKeyEnv: 'MONADLEAD_API_KEY_CATALOG',
          offerEnvKey,
          orderEnabled: enabled,
          currency: catalogMarkets[geo].currency,
          packages: [{ id: '1-komad', label: '1 pakovanje', quantity: 1 }],
        };
      }
    }
    const entry = await getEntry('products', slug);
    if (!entry || entry.data.draft) return undefined;
    const d = entry.data;
    return {
      slug: d.slug,
      name: d.name,
      market: d.countryCode,
      offerId: d.offerId,
      orderEnabled: d.orderEnabled,
      currency: d.currency,
      packages: d.packages.map((p) => ({ id: p.id, label: p.label, quantity: p.quantity, price: p.price, offerId: p.offerId })),
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
