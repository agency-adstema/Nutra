// @ts-check
import { defineConfig, envField } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

/**
 * Deploy target:
 *  - STATIC_PREVIEW=true  → čist statički build bez API rute (preview za odobravanje dizajna)
 *  - DEPLOY_TARGET=vercel | cloudflare | node  (ili automatski: VERCEL / CF_PAGES env)
 */
const STATIC_PREVIEW = process.env.STATIC_PREVIEW === 'true';
const target = STATIC_PREVIEW
  ? 'static'
  : process.env.DEPLOY_TARGET ||
    (process.env.VERCEL ? 'vercel' : process.env.CF_PAGES ? 'cloudflare' : 'node');

async function getAdapter() {
  switch (target) {
    case 'static':
      return undefined;
    case 'vercel':
      return (await import('@astrojs/vercel')).default();
    case 'cloudflare': {
      try {
        // @ts-ignore — opcioni paket, instalira se samo za Cloudflare deploy
        return (await import('@astrojs/cloudflare')).default();
      } catch {
        throw new Error('Za Cloudflare deploy pokrenite: npm i @astrojs/cloudflare');
      }
    }
    default:
      return (await import('@astrojs/node')).default({ mode: 'standalone' });
  }
}

/** API ruta za porudžbine se dodaje samo kada postoji server (adapter). */
const orderApi = {
  name: 'bk-order-api',
  hooks: {
    /** @param {{ injectRoute: (r: { pattern: string; entrypoint: string; prerender?: boolean }) => void }} p */
    'astro:config:setup': ({ injectRoute }) => {
      if (target === 'static') return;
      injectRoute({ pattern: '/api/order', entrypoint: './src/server/order-endpoint.ts', prerender: false });
    },
  },
};

export default defineConfig({
  site: process.env.SITE_URL || 'https://biljnikompas.rs',
  trailingSlash: 'always',
  compressHTML: true,
  adapter: await getAdapter(),
  integrations: [orderApi],
  // u statičkom preview-u bez "_" prefiksa (neki hostovi ga rezervišu)
  build: STATIC_PREVIEW ? { assets: 'assets' } : {},
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  image: { responsiveStyles: false },
  vite: {
    plugins: [tailwindcss()],
  },
  env: {
    schema: {
      // Javne (ugrađuju se u build)
      PUBLIC_SITE_ENV: envField.enum({ context: 'client', access: 'public', values: ['production', 'staging', 'development'], default: 'staging' }),
      PUBLIC_MARKET: envField.enum({ context: 'client', access: 'public', values: ['RS', 'BA', 'HR', 'ME', 'XK'], default: 'RS' }),
      PUBLIC_GA4_ID: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_GTM_ID: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_TURNSTILE_SITE_KEY: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_STATIC_PREVIEW: envField.boolean({ context: 'client', access: 'public', default: false }),
      PUBLIC_CATALOG_ORDER_SUBMISSIONS: envField.boolean({ context: 'client', access: 'public', default: false }),
      // Serverske tajne (čitaju se u runtime-u, nikad ne idu u browser)
      ORDER_MODE: envField.enum({ context: 'server', access: 'secret', values: ['test', 'live'], default: 'test' }),
      MONADLEAD_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      MONADLEAD_API_KEY_CATALOG: envField.string({ context: 'server', access: 'secret', optional: true }),
      CATALOG_ORDERS_ENABLED: envField.string({ context: 'server', access: 'secret', optional: true }),
      MONADLEAD_API_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      ORDER_HASH_SALT: envField.string({ context: 'server', access: 'secret', optional: true }),
      ALLOWED_ORIGINS: envField.string({ context: 'server', access: 'secret', optional: true }),
      UPSTASH_REDIS_REST_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      UPSTASH_REDIS_REST_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      TURNSTILE_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      ORDER_WEBHOOK_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      ORDER_WEBHOOK_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
