import {
  ALL_TRACKED_KEYS,
  CLICK_ID_KEYS,
  MAX_TRACKING_VALUE_LENGTH,
  SUB_MAPPING,
  UTM_KEYS,
} from '../config/tracking';

/** Atribucija posete — samo marketinški parametri, bez ličnih podataka */
export type Attribution = Record<string, string>;

const EXTRA_KEYS = ['referrer', 'landing_page', 'visit_id'] as const;

export function cleanValue(value: unknown, max = MAX_TRACKING_VALUE_LENGTH): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  // uklanja kontrolne karaktere i višak razmaka
  const v = String(value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!v) return undefined;
  return v.slice(0, max);
}

function cleanUrl(value: unknown): string | undefined {
  const v = cleanValue(value, 500);
  if (!v) return undefined;
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.toString().slice(0, 500);
  } catch {
    return undefined;
  }
}

/** Server: prihvata samo poznate ključeve i očišćene vrednosti */
export function sanitizeAttribution(input: unknown): Attribution {
  const out: Attribution = {};
  if (!input || typeof input !== 'object') return out;
  const src = input as Record<string, unknown>;
  for (const key of ALL_TRACKED_KEYS) {
    const v = cleanValue(src[key]);
    if (v) out[key] = v;
  }
  const ref = cleanUrl(src.referrer);
  if (ref) out.referrer = ref;
  const landing = cleanUrl(src.landing_page);
  if (landing) out.landing_page = landing;
  const visit = cleanValue(src.visit_id, 64);
  if (visit && /^[a-zA-Z0-9_-]+$/.test(visit)) out.visit_id = visit;
  return out;
}

/** Browser: izvlači praćene parametre iz URL-a */
export function extractTrackingParams(search: string): Attribution {
  const params = new URLSearchParams(search);
  const out: Attribution = {};
  for (const key of ALL_TRACKED_KEYS) {
    const v = cleanValue(params.get(key));
    if (v) out[key] = v;
  }
  return out;
}

export function hasCampaignParams(attr: Attribution): boolean {
  return ALL_TRACKED_KEYS.some((k) => !!attr[k]);
}

export function firstClickId(attr: Attribution): { key: string; value: string } | undefined {
  for (const key of CLICK_ID_KEYS) {
    if (attr[key]) return { key, value: attr[key] };
  }
  return undefined;
}

const SEARCH_ENGINES: Array<[RegExp, string]> = [
  [/(^|\.)google\./, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)yahoo\./, 'yahoo'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)yandex\./, 'yandex'],
  [/(^|\.)ecosia\.org$/, 'ecosia'],
];
const SOCIAL: Array<[RegExp, string]> = [
  [/(^|\.)(facebook|fb)\.com$/, 'facebook'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)youtube\.com$/, 'youtube'],
  [/(^|\.)t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, 'x'],
];

/** Izračunava izvor/kanal kada nema UTM parametara */
export function deriveChannel(attr: Attribution, ownHost?: string): { source: string; medium: string } {
  if (attr.utm_source || attr.utm_medium) {
    return { source: attr.utm_source || '(not set)', medium: attr.utm_medium || '(not set)' };
  }
  if (attr.gclid || attr.gbraid || attr.wbraid) return { source: 'google', medium: 'cpc' };
  if (attr.msclkid) return { source: 'bing', medium: 'cpc' };
  if (attr.ttclid) return { source: 'tiktok', medium: 'cpc' };
  if (attr.fbclid) return { source: 'facebook', medium: 'social' };
  const cid = firstClickId(attr);
  if (cid) return { source: 'affiliate', medium: 'affiliate' };

  if (attr.referrer) {
    try {
      const host = new URL(attr.referrer).hostname.replace(/^www\./, '');
      if (ownHost && host === ownHost.replace(/^www\./, '')) return { source: '(direct)', medium: '(none)' };
      for (const [re, name] of SEARCH_ENGINES) if (re.test(host)) return { source: name, medium: 'organic' };
      for (const [re, name] of SOCIAL) if (re.test(host)) return { source: name, medium: 'social' };
      return { source: host, medium: 'referral' };
    } catch {
      /* ignore */
    }
  }
  return { source: '(direct)', medium: '(none)' };
}

export interface SubContext {
  attribution: Attribution;
  productSlug: string;
  packageId?: string;
  ownHost?: string;
}

export type SubValues = Partial<Record<'sub_1' | 'sub_2' | 'sub_3' | 'sub_4', string>>;

/** Primenjuje SUB_MAPPING (ili prosleđeno mapiranje) */
export function resolveSubs(ctx: SubContext, mapping: Record<string, string[]> = SUB_MAPPING): SubValues {
  const derived = deriveChannel(ctx.attribution, ctx.ownHost);
  const cid = firstClickId(ctx.attribution);
  const out: SubValues = {};

  const resolveSource = (source: string): string | undefined => {
    const [kind, ...rest] = source.split(':');
    const arg = rest.join(':');
    switch (kind) {
      case 'param':
      case 'utm':
        return ctx.attribution[arg];
      case 'derived':
        return arg === 'medium' ? derived.medium : derived.source;
      case 'clickid':
        return cid?.value;
      case 'clickid_key':
        return cid?.key;
      case 'product':
        return ctx.productSlug;
      case 'package':
        return ctx.packageId;
      case 'visit':
        return ctx.attribution.visit_id;
      case 'const':
        return arg;
      default:
        return undefined;
    }
  };

  for (const [sub, sources] of Object.entries(mapping)) {
    for (const s of sources) {
      const v = cleanValue(resolveSource(s));
      if (v) {
        out[sub as keyof SubValues] = v;
        break;
      }
    }
  }
  return out;
}

export function pickUtm(attr: Attribution): Partial<Record<(typeof UTM_KEYS)[number], string>> {
  const out: Partial<Record<(typeof UTM_KEYS)[number], string>> = {};
  for (const k of UTM_KEYS) if (attr[k]) out[k] = attr[k];
  return out;
}

export { EXTRA_KEYS };
