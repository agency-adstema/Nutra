import { describe, expect, it } from 'vitest';
import { buildMonadleadPayload, parseMonadleadResponse, redactPayload, sendToMonadlead } from '../src/lib/order/monadlead';

describe('buildMonadleadPayload', () => {
  it('sadrži obavezna polja i izostavlja prazna opciona', () => {
    const p = buildMonadleadPayload({
      apiKey: 'KEY',
      name: 'Marko Marković',
      phone: '+381601234567',
      offerId: '123',
      countryCode: 'RS',
      baseUrl: 'https://biljnikompas.rs',
      referrer: 'https://google.com/',
      userIp: '1.2.3.4',
      subs: { sub_1: 'google', sub_2: 'organic', sub_3: 'nautubone' },
      utm: { utm_source: 'google' },
    });
    expect(p).toEqual({
      api_key: 'KEY',
      name: 'Marko Marković',
      phone: '+381601234567',
      offer_id: '123',
      country_code: 'RS',
      base_url: 'https://biljnikompas.rs',
      referrer: 'https://google.com/',
      user_ip: '1.2.3.4',
      sub_1: 'google',
      sub_2: 'organic',
      sub_3: 'nautubone',
      utm_source: 'google',
    });
    expect(redactPayload(p).api_key).toBe('***');
  });
});

describe('parseMonadleadResponse', () => {
  it('200 → uspeh, čuva order_id i click_id', () => {
    expect(parseMonadleadResponse(200, '{"order_id":987,"click_id":"c1"}')).toEqual({ ok: true, orderId: '987', clickId: 'c1' });
    expect(parseMonadleadResponse(200, '{"data":{"order_id":"55"}}')).toEqual({ ok: true, orderId: '55', clickId: undefined });
  });
  it('200 sa eksplicitnom greškom → nije uspeh', () => {
    const r = parseMonadleadResponse(200, '{"success":false,"error":"phone is invalid"}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('phone');
  });
  it('novi nalog: 200 type success sa order_id i body.click_id', () => {
    const response = JSON.stringify({ type: 'success', order_id: 9876, body: { click_id: 'click-xyz' } });
    expect(parseMonadleadResponse(200, response)).toEqual({ ok: true, orderId: '9876', clickId: 'click-xyz' });
  });
  it('novi nalog: type error i 200 bez order_id ne predstavljaju uspešnu porudžbinu', () => {
    expect(parseMonadleadResponse(200, '{"type":"error","field":"phone","reason":"wrong format"}'))
      .toMatchObject({ ok: false, kind: 'rejected', field: 'phone' });
    expect(parseMonadleadResponse(200, '{"type":"success"}'))
      .toMatchObject({ ok: false, kind: 'rejected' });
  });
  it('novi nalog: 400 vraća bezbedno polje i reason, bez API ključa i broja', () => {
    const response = JSON.stringify({ type: 'error', field: 'phone', reason: 'wrong format', api_key: 'SECRET-SHOULD-NOT-BE-LOGGED', phone: '+381601234567' });
    const parsed = parseMonadleadResponse(400, response);
    expect(parsed).toMatchObject({ ok: false, kind: 'validation', field: 'phone' });
    if (!parsed.ok) {
      expect(parsed.detail).toContain('wrong format');
      expect(parsed.detail).not.toContain('SECRET-SHOULD-NOT-BE-LOGGED');
      expect(parsed.detail).not.toContain('601234567');
    }
  });

  it('400 → validacija sa poljem; telefon u detaljima se maskira', () => {
    const r = parseMonadleadResponse(400, '{"phone":["Invalid phone +381601234567"]}');
    expect(r).toMatchObject({ ok: false, kind: 'validation', field: 'phone' });
    if (!r.ok) expect(r.detail).not.toContain('601234567');
  });
  it('405/406 → greška konfiguracije, 500 → serverska', () => {
    expect(parseMonadleadResponse(405, '')).toMatchObject({ ok: false, kind: 'config' });
    expect(parseMonadleadResponse(406, '')).toMatchObject({ ok: false, kind: 'config' });
    expect(parseMonadleadResponse(500, 'oops')).toMatchObject({ ok: false, kind: 'server' });
  });
});

describe('sendToMonadlead', () => {
  it('šalje POST JSON na endpoint', async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response('{"order_id":1}', { status: 200 });
    }) as unknown as typeof fetch;
    const r = await sendToMonadlead({ api_key: 'k', name: 'A B', phone: '+381601234567', offer_id: '1', country_code: 'RS', base_url: 'https://x' }, { fetchImpl });
    expect(r.ok).toBe(true);
    expect(captured!.url).toBe('https://api.monadlead.com/api/v1/orders/create/');
    expect(captured!.init.method).toBe('POST');
    expect((captured!.init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });
  it('timeout se prijavljuje kao timeout', async () => {
    const fetchImpl = ((_: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    const r = await sendToMonadlead({}, { fetchImpl, timeoutMs: 20 });
    expect(r).toEqual({ ok: false, kind: 'timeout' });
  });
});
