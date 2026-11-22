import { describe, expect, it } from 'vitest';
import { deriveChannel, extractTrackingParams, resolveSubs, sanitizeAttribution } from '../src/lib/tracking';

describe('extractTrackingParams', () => {
  it('uzima samo poznate parametre', () => {
    const a = extractTrackingParams('?utm_source=google&utm_medium=cpc&gclid=abc&foo=bar&sub_1=aff7');
    expect(a).toEqual({ utm_source: 'google', utm_medium: 'cpc', gclid: 'abc', sub_1: 'aff7' });
  });
});

describe('sanitizeAttribution', () => {
  it('odbacuje nepoznate ključeve, kontrolne karaktere i ne-http URL-ove', () => {
    const a = sanitizeAttribution({
      utm_source: 'goo\u0000gle',
      evil: 'x',
      referrer: 'javascript:alert(1)',
      landing_page: 'https://biljnikompas.rs/x/?utm_source=a',
      visit_id: 'abc-123',
      phone: '0601234567',
    });
    expect(a).toEqual({ utm_source: 'google', landing_page: 'https://biljnikompas.rs/x/?utm_source=a', visit_id: 'abc-123' });
  });
  it('skraćuje predugačke vrednosti', () => {
    expect(sanitizeAttribution({ utm_term: 'x'.repeat(500) }).utm_term).toHaveLength(200);
  });
});

describe('deriveChannel', () => {
  it.each([
    [{ utm_source: 'meta', utm_medium: 'paid' }, 'meta', 'paid'],
    [{ gclid: '1' }, 'google', 'cpc'],
    [{ fbclid: '1' }, 'facebook', 'social'],
    [{ click_id: 'x' }, 'affiliate', 'affiliate'],
    [{ referrer: 'https://www.google.rs/' }, 'google', 'organic'],
    [{ referrer: 'https://l.instagram.com/' }, 'instagram', 'social'],
    [{ referrer: 'https://forum.example.com/t/1' }, 'forum.example.com', 'referral'],
    [{}, '(direct)', '(none)'],
  ])('%j → %s / %s', (attr, source, medium) => {
    expect(deriveChannel(attr as Record<string, string>)).toEqual({ source, medium });
  });
});

describe('resolveSubs (podrazumevano mapiranje)', () => {
  it('organski Google: sub_1=google, sub_2=organic, sub_3=slug, sub_4=visit id', () => {
    const subs = resolveSubs({ attribution: { referrer: 'https://www.google.com/', visit_id: 'v1' }, productSlug: 'nautubone' });
    expect(subs).toEqual({ sub_1: 'google', sub_2: 'organic', sub_3: 'nautubone', sub_4: 'v1' });
  });

  it('affiliate sub parametri imaju prednost i čuvaju originalni click ID', () => {
    const subs = resolveSubs({
      attribution: { sub_1: 'partner42', sub_4: 'CLICK-XYZ', utm_source: 'push', gclid: 'G' },
      productSlug: 'parazol',
    });
    expect(subs).toEqual({ sub_1: 'partner42', sub_2: '(not set)', sub_3: 'parazol', sub_4: 'CLICK-XYZ' });
  });

  it('Google Ads gclid ide u sub_4', () => {
    const subs = resolveSubs({ attribution: { gclid: 'Cj0K', utm_source: 'google', utm_medium: 'cpc' }, productSlug: 'x' });
    expect(subs.sub_4).toBe('Cj0K');
    expect(subs.sub_2).toBe('cpc');
  });

  it('mapiranje je konfigurabilno', () => {
    const subs = resolveSubs(
      { attribution: { fbclid: 'FB1' }, productSlug: 'x', packageId: '2-komada' },
      { sub_1: ['const:seo-sajt'], sub_2: ['clickid_key'], sub_3: ['package:id'], sub_4: ['clickid'] },
    );
    expect(subs).toEqual({ sub_1: 'seo-sajt', sub_2: 'fbclid', sub_3: '2-komada', sub_4: 'FB1' });
  });
});
