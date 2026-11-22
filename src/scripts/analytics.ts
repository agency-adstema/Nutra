/**
 * GA4 / GTM — učitava se tek posle saglasnosti. Događaji ne sadrže lične podatke.
 * Događaji: view_item, select_item, video_start, video_complete, begin_checkout,
 *           generate_lead, form_error, click_phone
 */
import { hasAnalyticsConsent } from './consent';

type Params = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
    __bk?: { ga4Id?: string; gtmId?: string; env?: string; loaded?: boolean };
  }
}

const FORBIDDEN = /name|phone|tel|email|ime|prezime|telefon/i;

function cleanParams(params: Params): Params {
  const out: Params = {};
  for (const [k, v] of Object.entries(params)) {
    if (FORBIDDEN.test(k) && !/^item_name$|^video_title$|^item_list_name$/.test(k)) continue;
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

export function loadAnalytics(): void {
  const cfg = window.__bk;
  if (!cfg || cfg.loaded || (!cfg.ga4Id && !cfg.gtmId)) return;
  cfg.loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
  });

  const s = document.createElement('script');
  s.async = true;
  if (cfg.gtmId) {
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(cfg.gtmId)}`;
  } else if (cfg.ga4Id) {
    window.gtag('js', new Date());
    window.gtag('config', cfg.ga4Id);
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cfg.ga4Id)}`;
  }
  document.head.appendChild(s);
}

export function track(event: string, params: Params = {}): void {
  const p = cleanParams(params);
  // interni događaj (testovi, debug)
  window.dispatchEvent(new CustomEvent('bk:track', { detail: { event, params: p } }));
  if (window.__bk?.env !== 'production') console.debug('[analytics]', event, p);
  if (!hasAnalyticsConsent()) return;
  const cfg = window.__bk;
  if (!cfg?.ga4Id && !cfg?.gtmId) return;
  window.dataLayer = window.dataLayer || [];
  if (cfg.gtmId) window.dataLayer.push({ event, ...p });
  else window.gtag?.('event', event, p);
}

export function initGlobalTracking(): void {
  if (hasAnalyticsConsent()) loadAnalytics();
  window.addEventListener('bk:consent', (e) => {
    if ((e as CustomEvent).detail?.analytics) loadAnalytics();
  });

  document.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    const card = target?.closest<HTMLElement>('[data-select-item]');
    if (card) {
      track('select_item', {
        item_list_name: card.dataset.list || 'products',
        items: [{ item_id: card.dataset.itemId, item_name: card.dataset.itemName, item_category: card.dataset.itemCategory }],
      });
    }
    const tel = target?.closest<HTMLAnchorElement>('a[href^="tel:"]');
    if (tel) track('click_phone', { link_location: tel.dataset.location || 'page' });
  });
}
