/** Saglasnost za kolačiće (analitika). Čuva se lokalno; bez saglasnosti GA4/GTM se ne učitava. */
export interface ConsentState {
  analytics: boolean;
  ts: number;
  v: 1;
}

const KEY = 'bk_consent';

export function getConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as ConsentState;
    return c && c.v === 1 ? c : null;
  } catch {
    return null;
  }
}

export function setConsent(analytics: boolean): void {
  const state: ConsentState = { analytics, ts: Date.now(), v: 1 };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('bk:consent', { detail: state }));
}

export function hasAnalyticsConsent(): boolean {
  return getConsent()?.analytics === true;
}
