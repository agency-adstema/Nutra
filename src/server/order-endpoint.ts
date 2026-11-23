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

/** CORS: forma na drugom domenu (npr. lamena.io → zdravica.rs) sme da šalje samo sa ALLOWED_ORIGINS. */
function allowedOrigin(request: Request): string | undefined {
  const origin = request.headers.get('origin')?.replace(/\/$/, '');
  if (!origin) return undefined;
  const list = (getSecret('ALLOWED_ORIGINS') || '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
  return list.includes(origin) ? origin : undefined;
}

function withCors(request: Request, response: Response): Response {
  const origin = allowedOrigin(request);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.append('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const OPTIONS: APIRoute = ({ request }) => {
  const origin = allowedOrigin(request);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    },
  });
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let ip: string | undefined;
  try {
    ip = clientAddress;
  } catch {
    ip = undefined;
  }
  return withCors(request, await handler(request, ip));
};

export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ status: 'error', message: 'Method not allowed' }), {
    status: 405,
    headers: { Allow: 'POST', 'Content-Type': 'application/json' },
  });
