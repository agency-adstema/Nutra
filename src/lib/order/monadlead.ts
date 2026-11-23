/**
 * MonadLead API klijent.
 * POST https://api.monadlead.com/api/v1/orders/create/  (application/json)
 *
 * Odgovori prema dokumentaciji:
 *  200 → porudžbina kreirana (čuvamo order_id i click_id ako postoje)
 *  400 → neispravno polje
 *  405/406 → greška u metodi/formatu zahteva
 *  500 → serverska greška
 */
import type { SubValues } from '../tracking';

export const MONADLEAD_DEFAULT_URL = 'https://api.monadlead.com/api/v1/orders/create/';

export interface MonadleadPayloadInput {
  apiKey: string;
  name: string;
  phone: string;
  offerId: string;
  countryCode: string;
  baseUrl: string;
  referrer?: string;
  userIp?: string;
  subs: SubValues;
  utm: Partial<Record<'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_term' | 'utm_content', string>>;
}

export type MonadleadPayload = Record<string, string>;

export function buildMonadleadPayload(i: MonadleadPayloadInput): MonadleadPayload {
  const payload: MonadleadPayload = {
    api_key: i.apiKey,
    name: i.name,
    phone: i.phone,
    offer_id: i.offerId,
    country_code: i.countryCode,
    base_url: i.baseUrl,
  };
  const optional: Record<string, string | undefined> = {
    referrer: i.referrer,
    user_ip: i.userIp,
    sub_1: i.subs.sub_1,
    sub_2: i.subs.sub_2,
    sub_3: i.subs.sub_3,
    sub_4: i.subs.sub_4,
    utm_campaign: i.utm.utm_campaign,
    utm_source: i.utm.utm_source,
    utm_medium: i.utm.utm_medium,
    utm_term: i.utm.utm_term,
    utm_content: i.utm.utm_content,
  };
  for (const [k, v] of Object.entries(optional)) {
    if (v) payload[k] = v;
  }
  return payload;
}

/** Za logove i test režim — nikad ne prikazujemo API ključ */
export function redactPayload(p: MonadleadPayload): MonadleadPayload {
  return { ...p, api_key: p.api_key ? '***' : '' };
}

export type CrmResult =
  | { ok: true; orderId?: string; clickId?: string }
  | {
      ok: false;
      kind: 'validation' | 'config' | 'server' | 'network' | 'timeout' | 'rejected';
      status?: number;
      field?: 'phone' | 'name' | 'other';
      detail?: string;
    };

function pick(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, any>;
  const v = b[key] ?? b.body?.[key] ?? b.data?.[key] ?? b.result?.[key] ?? b.order?.[key === 'order_id' ? 'id' : key];
  if (v === undefined || v === null || v === '') return undefined;
  return String(v).slice(0, 100);
}

function detectField(text: string): 'phone' | 'name' | 'other' {
  if (/phone|telefon|tel\b/i.test(text)) return 'phone';
  if (/\bname\b|ime/i.test(text)) return 'name';
  return 'other';
}

export function parseMonadleadResponse(status: number, text: string): CrmResult {
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  // Never log the raw upstream body: some providers echo api_key, phone and name.
  // Only document-defined field/reason codes are safe to retain.
  const b = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  // MonadLead greške dolaze i kao lista: {"errors":[{"field":"referrer","reason":"empty"}]}
  const firstError = Array.isArray(b.errors) && b.errors[0] && typeof b.errors[0] === 'object'
    ? b.errors[0] as Record<string, unknown> : undefined;
  const providerField = typeof b.field === 'string' ? b.field : typeof firstError?.field === 'string' ? firstError.field : '';
  const providerReasonRaw = typeof b.reason === 'string' ? b.reason : typeof firstError?.reason === 'string' ? firstError.reason : '';
  const providerReason = providerReasonRaw.toLowerCase().trim();
  const safeReason = ['incorrect', 'empty', 'wrong format', 'not found'].includes(providerReason) ? providerReason : '';
  const field = detectField(providerField || text);
  // Kratak opis greške od MonadLead-a za log: bez api_key, imena i broja (cifre se maskiraju).
  const providerText = ['message', 'error', 'errors', 'detail', 'msg', 'phone', 'reason']
    .filter((k) => k in b)
    .map((k) => `${k}:${typeof b[k] === 'string' ? b[k] : JSON.stringify(b[k])}`)
    .join(' ')
    .replace(/\d{4,}/g, '#')
    .slice(0, 160);
  const detail = [safeReason ? `field=${field}; reason=${safeReason}` : '', providerText ? `provider=${providerText}` : '']
    .filter(Boolean).join('; ') || undefined;

  if (status === 200 || status === 201) {
    const orderId = pick(body, 'order_id');
    const explicitFailure =
      b.type === 'error' || b.success === false || b.status === 'error' || b.status === false || b.ok === false ||
      (b.error !== undefined && b.error !== null && b.error !== false);
    // Reject unknown 200 responses or missing order_id; do not promise a placed order.
    if (explicitFailure || !orderId) return { ok: false, kind: 'rejected', status, field, detail };
    return { ok: true, orderId, clickId: pick(body, 'click_id') };
  }
  if (status === 400 || status === 422) return { ok: false, kind: 'validation', status, field, detail };
  if ([401, 403, 404, 405, 406, 415].includes(status)) return { ok: false, kind: 'config', status, detail };
  return { ok: false, kind: 'server', status, detail };
}

export async function sendToMonadlead(
  payload: MonadleadPayload,
  opts: { url?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<CrmResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000);
  try {
    const res = await (opts.fetchImpl ?? fetch)(opts.url || MONADLEAD_DEFAULT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    return parseMonadleadResponse(res.status, text);
  } catch (e) {
    const name = (e as Error)?.name;
    return { ok: false, kind: name === 'AbortError' || name === 'TimeoutError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
