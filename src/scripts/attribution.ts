/**
 * Hvata izvor posete (UTM, click ID, sub parametri, referrer, landing URL) u sessionStorage.
 * Ne čuva lične podatke. Nova kampanja u URL-u zamenjuje prethodnu atribuciju u sesiji.
 */
import { extractTrackingParams, hasCampaignParams, type Attribution } from '../lib/tracking';

const KEY = 'bk_attr';

function newVisitId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  } catch {
    return Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
  }
}

export function getAttribution(): Attribution {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '{}') as Attribution;
  } catch {
    return {};
  }
}

export function captureAttribution(): void {
  try {
    const stored = getAttribution();
    const params = extractTrackingParams(location.search);
    let ref = '';
    try {
      if (document.referrer && new URL(document.referrer).host !== location.host) ref = document.referrer;
    } catch {
      /* ignore */
    }
    const landing = (location.origin + location.pathname + location.search).slice(0, 500);

    if (hasCampaignParams(params)) {
      const next: Attribution = { ...params, landing_page: landing, visit_id: stored.visit_id || newVisitId() };
      if (ref) next.referrer = ref;
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } else if (!stored.visit_id) {
      const next: Attribution = { landing_page: landing, visit_id: newVisitId() };
      if (ref) next.referrer = ref;
      sessionStorage.setItem(KEY, JSON.stringify(next));
    }
  } catch {
    /* sessionStorage nedostupan — porudžbina i dalje radi, bez atribucije */
  }
}
