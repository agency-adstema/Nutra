/**
 * POST /api/order — ubacuje se kroz integraciju u astro.config.mjs (samo kada postoji adapter).
 * Sva logika je u src/lib/order/handler.ts; ovde samo povezujemo Astro okruženje.
 */
import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { getSecret } from 'astro:env/server';
import { site } from '../config/site';
import { createOrderHandler, type ProductOrderConfig } from '../lib/order/handler';

export const prerender = false;

const handler = createOrderHandler({
  env: (key) => getSecret(key) ?? undefined,
  siteUrl: import.meta.env.SITE,
  requireConsent: site.consentMode === 'checkbox',
  getProduct: async (slug): Promise<ProductOrderConfig | undefined> => {
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
