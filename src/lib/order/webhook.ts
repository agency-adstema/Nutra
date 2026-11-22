/**
 * Generički webhook provider — za sopstveni CRM / call centar (npr. za drugo tržište).
 * Šalje JSON sa HMAC-SHA256 potpisom u headeru X-Signature: sha256=<hex>.
 */
import type { CrmResult } from './monadlead';
import { parseMonadleadResponse } from './monadlead';

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sendToWebhook(
  order: Record<string, unknown>,
  opts: { url: string; secret?: string; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<CrmResult> {
  const body = JSON.stringify({ event: 'order.created', order });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.secret) headers['X-Signature'] = `sha256=${await hmacHex(opts.secret, body)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000);
  try {
    const res = await (opts.fetchImpl ?? fetch)(opts.url, { method: 'POST', headers, body, signal: ctrl.signal });
    return parseMonadleadResponse(res.status >= 200 && res.status < 300 ? 200 : res.status, await res.text());
  } catch (e) {
    return { ok: false, kind: (e as Error)?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
