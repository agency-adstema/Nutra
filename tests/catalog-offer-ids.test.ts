import { describe, expect, it } from 'vitest';
import { offers, allOffers, getOffer, type OfferGeo } from '../src/data/offers';
import {
  getSuppliedOfferId, isExplicitlyUnavailableOffer,
  suppliedRsOfferCount, suppliedHrOfferCount, suppliedBaOfferCount,
} from '../src/server/catalog-offer-ids';
import { catalogOfferEnvKey, getCatalogOrderConfig } from '../src/server/catalog-order-config';
import productSheets from '../src/data/products.json';

const missingBA = ['hp-cardio-zen', 'hp-glyco-balance', 'hp-para-clean', 'hp-slim-ease'];

describe('Novi MonadLead nalog: validirani GEO/offer ID-jevi', () => {
  it('čuva celu dostavljenu RS listu bez ponavljanja', () => {
    expect(suppliedRsOfferCount).toBe(93);
    expect(suppliedHrOfferCount).toBe(13);
    expect(suppliedBaOfferCount).toBe(9);
  });

  it('objavljuje 38 ponuda, izostavlja 3 HP Beauty Derm i 4 nedostupne BA', () => {
    const connected = offers.filter(o => getSuppliedOfferId(o.geo, o.slug));
    expect(connected).toHaveLength(38);
    expect(connected.filter(o => o.geo === 'RS')).toHaveLength(18);
    expect(connected.filter(o => o.geo === 'HR')).toHaveLength(12);
    expect(connected.filter(o => o.geo === 'BA')).toHaveLength(8);
    expect(offers.filter(o => !getSuppliedOfferId(o.geo, o.slug))).toHaveLength(0);
    expect(allOffers.filter(o => !getSuppliedOfferId(o.geo, o.slug)).map(o => o.geo + '/' + o.slug).sort())
      .toEqual(missingBA.map(s => 'BA/' + s).sort());
  });

  it.each([
    ['HR', 'beauty-derm', '302'],
    ['HR', 'cy-relief', '752'],
    ['HR', 'deep-inhale', '1167'],
    ['HR', 'diatea', '92'],
    ['HR', 'hp-goslim', '583'],
    ['HR', 'mikoherb', '301'],
    ['HR', 'nautubone', '90'],
    ['HR', 'hp-nautubone', '1186'],
    ['HR', 'hp-parazol', '551'],
    ['HR', 'pro-caps', '315'],
    ['HR', 'hp-testoy-gel', '1576'],
    ['HR', 'varcosin', '95'],
    ['BA', 'cy-relief', '862'],
    ['BA', 'nautubone', '17'],
    ['BA', 'hp-nautubone', '1188'],
    ['BA', 'hp-para-caps', '724'],
    ['BA', 'parazol', '18'],
    ['BA', 'pro-caps', '292'],
    ['BA', 'hp-pro-caps', '705'],
    ['BA', 'hp-testoy-gel', '1644'],
  ] as const)('%s / %s -> %s', (geo, slug, expected) => {
    expect(getOffer(geo, slug)).toBeDefined();
    expect(getSuppliedOfferId(geo, slug)).toBe(expected);
  });

  it('strogo razdvaja obične/HP verzije i GEO', () => {
    expect(getSuppliedOfferId('RS', 'nautubone')).toBe('51');
    expect(getSuppliedOfferId('HR', 'nautubone')).toBe('90');
    expect(getSuppliedOfferId('BA', 'nautubone')).toBe('17');
    expect(getSuppliedOfferId('RS', 'hp-nautubone')).toBe('1189');
    expect(getSuppliedOfferId('HR', 'hp-nautubone')).toBe('1186');
    expect(getSuppliedOfferId('BA', 'hp-nautubone')).toBe('1188');
    expect(getSuppliedOfferId('RS', 'hp-testoy-gel')).toBe('1047');
    expect(getSuppliedOfferId('HR', 'hp-testoy-gel')).toBe('1576');
    expect(getSuppliedOfferId('BA', 'hp-testoy-gel')).toBe('1644');
    expect(getSuppliedOfferId('RS', 'testoy')).toBe('59');
    expect(getSuppliedOfferId('RS', 'testoy-gel')).toBe('464');
    expect(getSuppliedOfferId('RS', 'hp-erek-x')).toBe('1769');
    expect(getSuppliedOfferId('RS', 'bonecontrol')).toBe('100');
    expect(getSuppliedOfferId('RS', 'hp-bone-control')).toBe('717');
    expect(getSuppliedOfferId('HR', 'bonecontrol')).toBeUndefined();
  });

  it('četiri nedostupne BA ponude ostaju isključene i uz override', () => {
    for (const slug of missingBA) {
      expect(isExplicitlyUnavailableOffer('BA', slug)).toBe(true);
      expect(getSuppliedOfferId('BA', slug)).toBeUndefined();
      const env = (key: string) => key === 'CATALOG_ORDERS_ENABLED' ? 'true' : '99999';
      const config = getCatalogOrderConfig('BA', slug, env);
      expect(getOffer('BA', slug)).toBeUndefined();
      expect(config).toBeUndefined();
    }
  });

  it('mape ne aktiviraju poručivanje bez posebne dozvole i backend-a', () => {
    const env = () => undefined;
    for (const offer of offers) {
      const config = getCatalogOrderConfig(offer.geo, offer.slug, env);
      expect(config?.orderEnabled).toBe(false);
      expect(config?.apiKeyEnv).toBe('MONADLEAD_API_KEY_CATALOG');
    }
    expect(getCatalogOrderConfig('HR', 'cy-relief', env)?.offerId).toBe('752');
  });

  it('sa eksplicitnom dozvolom numerički ID aktivira samo postojeće ponude', () => {
    const env = (key: string) => key === 'CATALOG_ORDERS_ENABLED' ? 'true' : undefined;
    expect(getCatalogOrderConfig('HR', 'cy-relief', env)).toMatchObject({
      slug: 'hr-cy-relief',
      offerId: '752',
      market: 'HR',
      currency: 'EUR',
      orderEnabled: true,
    });
    expect(getCatalogOrderConfig('BA', 'nautubone', env)).toMatchObject({ offerId: '17', orderEnabled: true });
    expect(getCatalogOrderConfig('RS', 'testoy', env)).toMatchObject({ offerId: '59', orderEnabled: true });
    expect(getCatalogOrderConfig('BA', 'nepostoji', env)).toBeUndefined();
    for (const geo of ['RS', 'BA', 'HR'] as const) {
      expect(getCatalogOrderConfig(geo, 'hp-beauty-derm', env)).toBeUndefined();
    }
  });

  it('server-only ključ pojedinačnog offera može da zameni unapred uneseni ID', () => {
    const key = catalogOfferEnvKey('HR', 'cy-relief');
    expect(key).toBe('CATALOG_OFFER_ID_HR_CY_RELIEF');
    const env = (k: string) => k === key ? '8888' : undefined;
    expect(getCatalogOrderConfig('HR', 'cy-relief', env)?.offerId).toBe('8888');
    expect(getCatalogOrderConfig('HR', 'cy-relief', env)?.orderEnabled).toBe(false);
  });

  it('svih 38 javnih stranica koristi isključivo products.json offer_id, nikada hp_offer_id', () => {
    const env = () => undefined;
    for (const offer of offers) {
      const source = productSheets.find(p => p.country === offer.geo && p.slug === offer.slug)!;
      const config = getCatalogOrderConfig(offer.geo, offer.slug, env);
      expect(config?.offerId).toBe(String(source.offer_id));
      expect(config?.packages.map(p => p.id)).toEqual(['1-komad']);
      expect(config?.apiKeyEnv).toBe('MONADLEAD_API_KEY_CATALOG');
      expect(source).not.toHaveProperty('hp_offer_id');
    }
  });

  it('niti jedan key ne sme da pomeša zemlju i proizvod', () => {
    const keys = offers.map(o => catalogOfferEnvKey(o.geo as OfferGeo, o.slug));
    expect(new Set(keys).size).toBe(38);
  });
});
