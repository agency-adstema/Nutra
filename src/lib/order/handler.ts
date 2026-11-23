/**
 * Serverski handler za porudžbine (nezavisan od platforme: radi na Node, Vercel i Cloudflare).
 *
 * Tok: metoda/format → origin → rate limit → honeypot/vreme → (Turnstile) → proizvod i offer ID
 * iz NAŠE konfiguracije → validacija → zaštita od duplih → test režim ILI slanje u CRM.
 *
 * „Uspešno“ se vraća SAMO kada CRM potvrdi kreiranje porudžbine.
 */
import { getMarket, type MarketCode } from '../../config/countries';
import { pickUtm, resolveSubs, sanitizeAttribution } from '../tracking';
import { cleanValue } from '../tracking';
import { orderMessages, type OrderApiResponse } from './messages';
import { validateOrderFields } from './validate';
import { buildMonadleadPayload, redactPayload, sendToMonadlead, type CrmResult } from './monadlead';
import { sendToWebhook } from './webhook';
import { createStore, sha256Hex, type KvStore } from './store';
import { consoleLogger, type Logger } from './log';

export interface ProductOrderConfig {
  slug: string;
  name: string;
  market: MarketCode;
  offerId: string;
  orderEnabled: boolean;
  currency: string;
  /** For a separate MonadLead account. No fallbacks to the legacy account when provided. */
  apiKeyEnv?: string;
  /** Server-only offer-id mapping key, e.g. CATALOG_OFFER_ID_HR_CY_RELIEF. */
  offerEnvKey?: string;
  packages: Array<{ id: string; label: string; quantity: number; price?: number; offerId?: string }>;
}

export interface OrderHandlerDeps {
  env: (key: string) => string | undefined;
  getProduct: (slug: string) => Promise<ProductOrderConfig | undefined>;
  siteUrl: string;
  requireConsent: boolean;
  store?: KvStore;
  fetchImpl?: typeof fetch;
  now?: () => number;
  log?: Logger;
  rateLimit?: { max: number; windowSec: number };
  minFillMs?: number;
  dedupeWindowSec?: number;
}

const MAX_BODY_BYTES = 10_000;

export function isPlaceholderOfferId(id: string | undefined): boolean {
  return !id || /UNETI|POPUNITI|TODO|\[|xxx/i.test(id);
}

function json(status: number, body: OrderApiResponse, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      ...headers,
    },
  });
}

const fail = (status: number, key: keyof typeof orderMessages, extra: Partial<OrderApiResponse> = {}) =>
  json(status, {
    status: status === 429 ? 'rate_limited' : status === 400 && extra.fieldErrors ? 'invalid' : 'error',
    message: orderMessages[key],
    code: key,
    ...extra,
  });

export function getClientIp(request: Request, fallback?: string): string | undefined {
  const h = request.headers;
  const candidates = [
    h.get('cf-connecting-ip'),
    h.get('x-real-ip'),
    h.get('x-vercel-forwarded-for')?.split(',')[0],
    h.get('x-forwarded-for')?.split(',')[0],
    fallback,
  ];
  for (const c of candidates) {
    const v = c?.trim();
    if (v && /^[0-9a-fA-F:.]{3,45}$/.test(v)) return v;
  }
  return undefined;
}

function envOfferKey(slug: string) {
  return `OFFER_ID_${slug.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

export function createOrderHandler(deps: OrderHandlerDeps) {
  const log = deps.log ?? consoleLogger;
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const rate = deps.rateLimit ?? { max: 10, windowSec: 600 };
  const minFillMs = deps.minFillMs ?? 2500;
  const dedupeWindowSec = deps.dedupeWindowSec ?? 30 * 60;

  return async function handleOrder(request: Request, clientAddress?: string): Promise<Response> {
    const store = deps.store ?? createStore(deps.env, fetchImpl);
    const salt = deps.env('ORDER_HASH_SALT') || 'bk-default-salt';
    const hash = (v: string) => sha256Hex(`${salt}:${v}`);

    // 1) Metoda i format
    if (request.method !== 'POST') return json(405, { status: 'error', message: orderMessages.invalid_request, code: 'method' }, { Allow: 'POST' });
    if (!(request.headers.get('content-type') || '').includes('application/json')) return fail(415, 'invalid_request');

    // 2) Origin (zaštita od slanja sa tuđih sajtova)
    const origin = request.headers.get('origin');
    if (origin) {
      const allowed = new Set<string>([new URL(deps.siteUrl).origin, new URL(request.url).origin]);
      // iza proxy-ja (Vercel/Cloudflare/nginx) request.url može imati interni host — prihvatamo host iz zahteva
      for (const h of [request.headers.get('x-forwarded-host'), request.headers.get('host')]) {
        const host = h?.split(',')[0].trim();
        if (host && /^[a-z0-9.\-:[\]]+$/i.test(host)) {
          allowed.add(`https://${host}`);
          allowed.add(`http://${host}`);
        }
      }
      for (const o of (deps.env('ALLOWED_ORIGINS') || '').split(',')) if (o.trim()) allowed.add(o.trim().replace(/\/$/, ''));
      if (!allowed.has(origin)) {
        log('warn', 'order_blocked_origin', { origin });
        return fail(403, 'invalid_request');
      }
    }

    // 3) Telo zahteva
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return fail(413, 'invalid_request');
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not object');
    } catch {
      return fail(400, 'invalid_request');
    }

    // 4) Rate limit po IP adresi (heširano)
    const ip = getClientIp(request, clientAddress);
    try {
      const n = await store.incr(`rl:${await hash(ip || 'unknown')}`, rate.windowSec);
      if (n > rate.max) {
        log('warn', 'order_rate_limited', { count: n });
        return fail(429, 'rate_limited');
      }
    } catch (e) {
      log('error', 'store_error', { op: 'rate_limit', error: String(e) });
    }

    // 5) Anti-spam: honeypot + minimalno vreme popunjavanja
    if (cleanValue(body.website) || cleanValue(body.company_url)) {
      log('warn', 'order_spam_honeypot');
      return fail(400, 'bot_suspected');
    }
    const startedAt = Number(body.startedAt);
    if (!Number.isFinite(startedAt)) return fail(400, 'invalid_request');
    if (now() - startedAt < minFillMs) {
      log('warn', 'order_spam_too_fast', { ms: now() - startedAt });
      return fail(400, 'too_fast');
    }

    // 6) Opcioni Cloudflare Turnstile
    const turnstileSecret = deps.env('TURNSTILE_SECRET_KEY');
    if (turnstileSecret) {
      const token = cleanValue(body.turnstileToken, 2048);
      let passed = false;
      if (token) {
        try {
          const form = new URLSearchParams({ secret: turnstileSecret, response: token });
          if (ip) form.set('remoteip', ip);
          const r = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
          passed = ((await r.json()) as { success?: boolean }).success === true;
        } catch (e) {
          log('error', 'turnstile_error', { error: String(e) });
        }
      }
      if (!passed) return fail(400, 'captcha_failed');
    }

    // 7) Proizvod i offer ID — isključivo iz naše konfiguracije
    const slug = cleanValue(body.productSlug, 80) || '';
    const product = /^[a-z0-9-]+$/.test(slug) ? await deps.getProduct(slug) : undefined;
    if (!product) return fail(400, 'invalid_request');
    if (!product.orderEnabled) return fail(409, 'unavailable');
    const market = getMarket(product.market);

    // 8) Validacija polja
    const v = validateOrderFields(
      {
        firstName: String(body.firstName ?? ''),
        lastName: String(body.lastName ?? ''),
        phone: String(body.phone ?? ''),
        packageId: String(body.packageId ?? ''),
        consent: body.consent === true,
      },
      { market, packageIds: product.packages.map((p) => p.id), requireConsent: deps.requireConsent },
    );
    if (!v.ok) return json(400, { status: 'invalid', message: orderMessages.crm_validation, code: 'validation', fieldErrors: v.fieldErrors });
    const fields = v.value;
    const pkg = product.packages.find((p) => p.id === fields.packageId)!;
    const offerId = (pkg.offerId || deps.env(product.offerEnvKey || envOfferKey(product.slug)) || product.offerId || '').trim();

    const mode = deps.env('ORDER_MODE') === 'live' ? 'live' : 'test';

    // 9) Zaštita od duplih submitova (idempotency ključ iz forme)
    const idemRaw = cleanValue(body.idempotencyKey, 64);
    const idemKey = idemRaw && /^[a-zA-Z0-9-]{8,64}$/.test(idemRaw) ? `idem:${await hash(idemRaw)}` : undefined;
    if (idemKey) {
      const locked = await store.setNX(idemKey, 'pending', 120).catch(() => true);
      if (!locked) {
        const prev = await store.get(idemKey).catch(() => null);
        if (!prev || prev === 'pending') return json(409, { status: 'in_progress', message: orderMessages.in_progress, code: 'in_progress' });
        try {
          const { httpStatus, response } = JSON.parse(prev);
          return json(httpStatus, response);
        } catch {
          return json(409, { status: 'in_progress', message: orderMessages.in_progress, code: 'in_progress' });
        }
      }
    }
    const finish = async (httpStatus: number, response: OrderApiResponse, remember: boolean) => {
      if (idemKey) {
        if (remember) await store.set(idemKey, JSON.stringify({ httpStatus, response }), 30 * 60).catch(() => {});
        else await store.del(idemKey).catch(() => {});
      }
      return json(httpStatus, response);
    };

    // 10) Ista ponuda + isti telefon u kratkom roku = duplikat
    const dupKey = `dup:${offerId || product.slug}:${await hash(fields.phoneE164)}`;
    if (mode === 'live' && (await store.get(dupKey).catch(() => null))) {
      log('info', 'order_duplicate', { product: product.slug, offerId });
      return finish(409, { status: 'duplicate', message: orderMessages.duplicate, code: 'duplicate' }, true);
    }

    // 11) Tracking
    const attribution = sanitizeAttribution(body.attribution);
    const siteUrl = deps.env('SITE_URL') || deps.siteUrl;
    const subs = resolveSubs({ attribution, productSlug: product.slug, packageId: pkg.id, ownHost: new URL(siteUrl).hostname });
    const utm = pickUtm(attribution);
    const crm = market.crm;
    const apiKey = product.apiKeyEnv
      ? (deps.env(product.apiKeyEnv) || '')
      : (deps.env(crm.apiKeyEnv) || deps.env('MONADLEAD_API_KEY') || '');
    const phoneForCrm =
      crm.phoneFormat === 'national' ? fields.phoneNational : crm.phoneFormat === 'e164_no_plus' ? fields.phoneE164.slice(1) : fields.phoneE164;

    const payload = buildMonadleadPayload({
      apiKey,
      name: `${fields.firstName} ${fields.lastName}`,
      phone: phoneForCrm,
      offerId,
      countryCode: market.code,
      baseUrl: new URL(siteUrl).origin,
      referrer: attribution.referrer,
      userIp: ip,
      subs,
      utm,
    });
    const meta = {
      product: product.slug,
      package: pkg.id,
      quantity: pkg.quantity,
      price: pkg.price,
      currency: product.currency,
      offerId,
      market: market.code,
      landingPage: attribution.landing_page,
      subs,
      utm,
      mode,
    };

    // 12) Test režim — ništa se ne šalje u CRM, korisnik NE dobija lažnu potvrdu
    if (mode === 'test') {
      log('info', 'order_test_mode', meta);
      return finish(
        202,
        {
          status: 'test_mode',
          message: orderMessages.test_mode,
          code: 'test_mode',
          preview: {
            ...redactPayload(payload),
            _package: `${pkg.label} (${pkg.id})`,
            _offerIdWarning: isPlaceholderOfferId(offerId) ? 'offer_id nije podešen' : undefined,
          },
        },
        false,
      );
    }

    // 13) Live — provera konfiguracije
    if (crm.provider === 'monadlead' && (!apiKey || isPlaceholderOfferId(offerId))) {
      log('error', 'order_config_missing', { product: product.slug, hasApiKey: !!apiKey, offerIdSet: !isPlaceholderOfferId(offerId) });
      return finish(503, { status: 'error', message: orderMessages.config_error, code: 'config_error' }, false);
    }

    let result: CrmResult;
    if (crm.provider === 'webhook') {
      const url = deps.env('ORDER_WEBHOOK_URL');
      if (!url) return finish(503, { status: 'error', message: orderMessages.config_error, code: 'config_error' }, false);
      result = await sendToWebhook(
        { ...payload, api_key: undefined, package_id: pkg.id, quantity: pkg.quantity, price: pkg.price, currency: product.currency, created_at: new Date(now()).toISOString() },
        { url, secret: deps.env('ORDER_WEBHOOK_SECRET'), fetchImpl },
      );
    } else {
      result = await sendToMonadlead(payload, { url: deps.env('MONADLEAD_API_URL') || undefined, fetchImpl });
    }

    if (result.ok) {
      await store.set(dupKey, '1', dedupeWindowSec).catch(() => {});
      log('info', 'order_created', { ...meta, orderId: result.orderId, clickId: result.clickId });
      if (!result.orderId) log('warn', 'order_created_without_id', { product: product.slug });
      return finish(200, { status: 'created', message: orderMessages.success, orderId: result.orderId }, true);
    }

    log(result.kind === 'validation' ? 'warn' : 'error', 'order_failed', {
      ...meta,
      kind: result.kind,
      httpStatus: result.status,
      field: result.field,
      detail: result.detail,
    });

    switch (result.kind) {
      case 'validation':
      case 'rejected': {
        const key = result.field === 'phone' ? 'crm_phone' : result.field === 'name' ? 'crm_name' : 'crm_validation';
        const fieldErrors: Record<string, string> | undefined =
          result.field === 'phone' ? { phone: orderMessages.crm_phone } : result.field === 'name' ? { firstName: orderMessages.crm_name } : undefined;
        return finish(400, { status: 'invalid', message: orderMessages[key], code: key, fieldErrors }, false);
      }
      case 'config':
        return finish(502, { status: 'error', message: orderMessages.config_error, code: 'config_error' }, false);
      case 'timeout':
        // porudžbina je možda kreirana — blokiramo brzo ponavljanje istog broja
        await store.set(dupKey, '1', 15 * 60).catch(() => {});
        return finish(504, { status: 'error', message: orderMessages.timeout_uncertain, code: 'timeout_uncertain' }, true);
      case 'network':
      case 'server':
      default:
        return finish(502, { status: 'error', message: orderMessages.server_error, code: 'server_error' }, false);
    }
  };
}
