import { beforeEach, describe, expect, it } from 'vitest';
import { createOrderHandler, type ProductOrderConfig } from '../src/lib/order/handler';
import { MemoryStore } from '../src/lib/order/store';
import type { Logger } from '../src/lib/order/log';

const SITE = 'https://biljnikompas.rs';
const NOW = 1_800_000_000_000;

const product: ProductOrderConfig = {
  slug: 'nautubone',
  name: 'Nautubone',
  market: 'RS',
  offerId: 'OFFER-1',
  orderEnabled: true,
  currency: 'RSD',
  packages: [
    { id: '1-komad', label: '1 komad', quantity: 1, price: 3700 },
    { id: '2-komada', label: '2 komada', quantity: 2, price: 5850, offerId: 'OFFER-2PACK' },
  ],
};

type Call = { url: string; body: Record<string, string> };

function setup(opts: { env?: Record<string, string>; product?: ProductOrderConfig; crm?: (body: Record<string, string>) => Response | Promise<Response> } = {}) {
  const calls: Call[] = [];
  const logs: Array<{ level: string; event: string; data?: Record<string, unknown> }> = [];
  const env: Record<string, string> = { ORDER_MODE: 'live', MONADLEAD_API_KEY: 'SECRET-KEY', ...opts.env };
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, body });
    return opts.crm ? opts.crm(body) : new Response(JSON.stringify({ order_id: 'ML-1', click_id: 'CK-1' }), { status: 200 });
  }) as unknown as typeof fetch;
  const log: Logger = (level, event, data) => logs.push({ level, event, data });
  const handler = createOrderHandler({
    env: (k) => env[k],
    getProduct: async (slug) => {
      const configured = opts.product ?? product;
      return slug === configured.slug ? configured : undefined;
    },
    siteUrl: SITE,
    requireConsent: true,
    store: new MemoryStore(() => NOW),
    fetchImpl,
    now: () => NOW,
    log,
  });
  return { handler, calls, logs };
}

let seq = 0;
function body(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return {
    productSlug: 'nautubone',
    firstName: 'Marko',
    lastName: 'Marković',
    phone: '060 123 45 67',
    packageId: '1-komad',
    consent: true,
    website: '',
    startedAt: NOW - 10_000,
    idempotencyKey: `test-key-${seq}-abcdef`,
    attribution: { utm_source: 'google', utm_medium: 'cpc', gclid: 'G-123', landing_page: `${SITE}/zglobovi-i-bolovi/nautubone/`, visit_id: 'v1' },
    offer_id: 'HACKED', // pokušaj podmetanja offer ID-ja — mora biti ignorisan
    ...overrides,
  };
}

function req(b: unknown, headers: Record<string, string> = {}) {
  return new Request(`${SITE}/api/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SITE, 'x-forwarded-for': '203.0.113.7', ...headers },
    body: typeof b === 'string' ? b : JSON.stringify(b),
  });
}

describe('order handler', () => {
  beforeEach(() => {
    seq += 100;
  });

  it('šalje validan lead u MonadLead i potvrđuje tek posle 200', async () => {
    const { handler, calls, logs } = setup();
    const res = await handler(req(body()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ status: 'created', orderId: 'ML-1' });

    expect(calls).toHaveLength(1);
    const p = calls[0].body;
    expect(calls[0].url).toBe('https://api.monadlead.com/api/v1/orders/create/');
    expect(p).toMatchObject({
      api_key: 'SECRET-KEY',
      name: 'Marko Marković',
      phone: '0601234567', // lokalni oblik kao u MonadLead dokumentaciji
      offer_id: 'OFFER-1',
      country_code: 'RS',
      base_url: SITE,
      user_ip: '203.0.113.7',
      sub_1: 'google',
      sub_2: 'cpc',
      sub_3: 'nautubone',
      sub_4: 'G-123',
      utm_source: 'google',
      utm_medium: 'cpc',
    });
    // logovi bez ličnih podataka i bez API ključa
    const dump = JSON.stringify(logs);
    expect(dump).not.toContain('Marko');
    expect(dump).not.toContain('601234567');
    expect(dump).not.toContain('SECRET-KEY');
    expect(dump).toContain('ML-1');
  });

  it('izdvojeni catalog nalog: zaseban API key + offer ID iz server env-a + HR country_code', async () => {
    const catalogProduct: ProductOrderConfig = {
      slug: 'hr-cy-relief', name: 'CY-relief', market: 'HR',
      currency: 'EUR', offerId: '', orderEnabled: true,
      apiKeyEnv: 'MONADLEAD_API_KEY_CATALOG', offerEnvKey: 'CATALOG_OFFER_ID_HR_CY_RELIEF',
      packages: [{ id: '1-komad', label: '1 pakovanje', quantity: 1 }],
    };
    const { handler, calls } = setup({
      product: catalogProduct,
      env: {
        MONADLEAD_API_KEY: 'LEGACY-NEVER-USE',
        MONADLEAD_API_KEY_CATALOG: 'NEW-ACCOUNT-TEST-KEY',
        CATALOG_OFFER_ID_HR_CY_RELIEF: '2026',
      },
      crm: () => new Response('{"type":"success","order_id":456,"body":{"click_id":"abc"}}', { status: 200 }),
    });
    const res = await handler(req(body({ productSlug: 'hr-cy-relief', phone: '091 234 5678' })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'created', orderId: '456' });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({
      api_key: 'NEW-ACCOUNT-TEST-KEY',
      offer_id: '2026',
      country_code: 'HR',
      phone: '0912345678',
    });
  });

  it('catalog nikada ne koristi stari API ključ ako novi nije podešen', async () => {
    const catalogProduct: ProductOrderConfig = {
      slug: 'ba-nautubone', name: 'Nautubone', market: 'BA',
      currency: 'BAM', offerId: '', orderEnabled: true,
      apiKeyEnv: 'MONADLEAD_API_KEY_CATALOG', offerEnvKey: 'CATALOG_OFFER_ID_BA_NAUTUBONE',
      packages: [{ id: '1-komad', label: '1 pakovanje', quantity: 1 }],
    };
    const { handler, calls } = setup({
      product: catalogProduct,
      env: { MONADLEAD_API_KEY_CATALOG: '', CATALOG_OFFER_ID_BA_NAUTUBONE: '1769' },
    });
    const res = await handler(req(body({ productSlug: 'ba-nautubone', phone: '061 123 456' })));
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it('catalog ne šalje porudžbinu bez eksplicitnog offer ID za konkretan proizvod', async () => {
    const catalogProduct: ProductOrderConfig = {
      slug: 'rs-u-caps', name: 'U Caps', market: 'RS',
      currency: 'RSD', offerId: '', orderEnabled: true,
      apiKeyEnv: 'MONADLEAD_API_KEY_CATALOG', offerEnvKey: 'CATALOG_OFFER_ID_RS_U_CAPS',
      packages: [{ id: '1-komad', label: '1 pakovanje', quantity: 1 }],
    };
    const { handler, calls } = setup({ product: catalogProduct, env: { MONADLEAD_API_KEY_CATALOG: 'NEW-ACCOUNT-TEST-KEY' } });
    const res = await handler(req(body({ productSlug: 'rs-u-caps' })));
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it('offer ID pakovanja ima prednost; offer iz zahteva se ignoriše', async () => {
    const { handler, calls } = setup();
    await handler(req(body({ packageId: '2-komada', phone: '064 555 1234' })));
    expect(calls[0].body.offer_id).toBe('OFFER-2PACK');
  });

  it('test režim: ne zove CRM i ne prijavljuje uspeh', async () => {
    const { handler, calls } = setup({ env: { ORDER_MODE: 'test' } });
    const res = await handler(req(body()));
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.status).toBe('test_mode');
    expect(json.preview.api_key).toBe('***');
    expect(calls).toHaveLength(0);
  });

  it('400 iz MonadLead-a → greška polja, bez lažne potvrde', async () => {
    const { handler } = setup({ crm: () => new Response('{"phone":["invalid"]}', { status: 400 }) });
    const res = await handler(req(body()));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.status).toBe('invalid');
    expect(json.fieldErrors.phone).toBeTruthy();
  });

  it('500 iz MonadLead-a → serverska greška', async () => {
    const { handler } = setup({ crm: () => new Response('err', { status: 500 }) });
    const res = await handler(req(body()));
    expect(res.status).toBe(502);
    expect((await res.json()).status).toBe('error');
  });

  it('dupli klik (isti idempotency ključ) → jedan poziv CRM-a, isti odgovor', async () => {
    const { handler, calls } = setup();
    const b = body();
    const [r1, r2] = await Promise.all([handler(req(b)), handler(req(b))]);
    const statuses = [r1.status, r2.status].sort();
    expect(calls).toHaveLength(1);
    expect(statuses).toContain(200);
    const r3 = await handler(req(b));
    expect(r3.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('isti telefon + ista ponuda u kratkom roku → duplikat', async () => {
    const { handler, calls } = setup();
    await handler(req(body()));
    const res = await handler(req(body()));
    expect(res.status).toBe(409);
    expect((await res.json()).status).toBe('duplicate');
    expect(calls).toHaveLength(1);
  });

  it('honeypot i prebrzo slanje se odbijaju', async () => {
    const { handler, calls } = setup();
    expect((await handler(req(body({ website: 'http://spam' })))).status).toBe(400);
    expect((await handler(req(body({ startedAt: NOW - 500 })))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rate limit po IP adresi', async () => {
    const { handler } = setup({ env: { ORDER_MODE: 'test' } });
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await handler(req(body({ phone: `06012345${String(i).padStart(2, '0')}` })))).status;
    expect(last).toBe(429);
  });

  it('tuđi Origin, pogrešan Content-Type i nepoznat proizvod se odbijaju', async () => {
    const { handler } = setup();
    expect((await handler(req(body(), { Origin: 'https://evil.example' }))).status).toBe(403);
    expect((await handler(new Request(`${SITE}/api/order`, { method: 'POST', body: 'x', headers: { 'Content-Type': 'text/plain' } }))).status).toBe(415);
    expect((await handler(req(body({ productSlug: 'nepostoji' })))).status).toBe(400);
    expect((await handler(req('{not json'))).status).toBe(400);
  });

  it('live bez API ključa ili sa placeholder offer ID → konfiguraciona greška, CRM se ne zove', async () => {
    const { handler, calls } = setup({ env: { MONADLEAD_API_KEY: '' } });
    const res = await handler(req(body()));
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it('validacione greške vraćaju poruke po polju', async () => {
    const { handler, calls } = setup();
    const res = await handler(req(body({ phone: '123', consent: false })));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(Object.keys(json.fieldErrors).sort()).toEqual(['consent', 'phone']);
    expect(calls).toHaveLength(0);
  });
});

describe('MonadLead: oblik broja telefona', () => {
  it('ako MonadLead odbije broj, proba sledeći oblik i ne pravi duplikat', async () => {
    const { createOrderHandler } = await import('../src/lib/order/handler');
    const sent: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const p = JSON.parse(String(init.body));
      sent.push(p.phone);
      if (p.phone === '601234567') return new Response(JSON.stringify({ order_id: '777' }), { status: 200 });
      return new Response(JSON.stringify({ phone: ['Invalid phone'] }), { status: 400 });
    }) as unknown as typeof fetch;
    const handler = createOrderHandler({
      env: (k: string) => ({ ORDER_MODE: 'live', MONADLEAD_API_KEY_RS: 'K', SITE_URL: 'https://example.rs' } as Record<string, string>)[k],
      siteUrl: 'https://example.rs',
      requireConsent: false,
      fetchImpl,
      minFillMs: 0,
      getProduct: async () => ({
        slug: 'nautubone', name: 'Nautubone', market: 'RS', offerId: '51', orderEnabled: true, currency: 'RSD',
        packages: [{ id: '1-komad', label: '1 pakovanje', quantity: 1, price: 3700 }],
      }),
    });
    const res = await handler(new Request('https://example.rs/api/order/', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.rs' },
      body: JSON.stringify({ productSlug: 'nautubone', firstName: 'Ana', lastName: 'Test', phone: '060 123 4567', packageId: '1-komad', consent: true, website: '', startedAt: Date.now() - 10_000, idempotencyKey: 'phone-fallback-abcdef' }),
    }), '10.9.9.9');
    expect(res.status).toBe(200);
    expect(sent).toEqual(['0601234567', '601234567']);
  });
});

describe('MonadLead: referrer', () => {
  it('uvek šalje referrer (stranica porudžbine), i kad kupac dođe direktno', async () => {
    const { createOrderHandler } = await import('../src/lib/order/handler');
    let payload: Record<string, string> = {};
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      payload = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ order_id: '1' }), { status: 200 });
    }) as unknown as typeof fetch;
    const handler = createOrderHandler({
      env: (k: string) => ({ ORDER_MODE: 'live', MONADLEAD_API_KEY_RS: 'K' } as Record<string, string>)[k],
      siteUrl: 'https://example.rs', requireConsent: false, fetchImpl, minFillMs: 0,
      getProduct: async () => ({ slug: 'nautubone', name: 'N', market: 'RS', offerId: '51', orderEnabled: true, currency: 'RSD',
        packages: [{ id: '1-komad', label: '1', quantity: 1, price: 3700 }] }),
    });
    const res = await handler(new Request('https://example.rs/api/order/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.rs', referer: 'https://example.rs/zglobovi/nautubone/' },
      body: JSON.stringify({ productSlug: 'nautubone', firstName: 'Ana', lastName: 'Test', phone: '064 555 9876', packageId: '1-komad', consent: true, website: '', startedAt: Date.now() - 10_000, idempotencyKey: 'referrer-test-abcdef', attribution: {} }),
    }), '10.8.8.8');
    expect(res.status).toBe(200);
    expect(payload.referrer).toBe('https://example.rs/zglobovi/nautubone/');
  });

  it('čita MonadLead listu grešaka i ne prijavljuje je kao grešku broja', async () => {
    const { parseMonadleadResponse } = await import('../src/lib/order/monadlead');
    const r = parseMonadleadResponse(400, '{"errors":[{"field":"referrer","reason":"empty"}]}');
    expect(r).toMatchObject({ ok: false, kind: 'validation', field: 'other' });
  });
});
