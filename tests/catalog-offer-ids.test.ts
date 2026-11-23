import { describe, expect, it } from 'vitest';
import { offers, allOffers, getOffer, type OfferGeo } from '../src/data/offers';
import {
  getSuppliedOfferId,
  suppliedRsOfferCount, suppliedHrOfferCount, suppliedBaOfferCount,
} from '../src/server/catalog-offer-ids';
import { catalogOfferEnvKey, getCatalogOrderConfig } from '../src/server/catalog-order-config';
import productSheets from '../src/data/products.json';

describe('Novi MonadLead nalog: validirani GEO/offer ID-jevi', () => {
  it('čuva dostavljenu listu bez ponavljanja i bez HP ponuda', () => {
    expect(suppliedRsOfferCount).toBe(55);
    expect(suppliedHrOfferCount).toBe(47);
    expect(suppliedBaOfferCount).toBe(65);
  });

  it('objavljuje svih 167 ponuda, sve sa offer ID-jem', () => {
    const connected = offers.filter(o => getSuppliedOfferId(o.geo, o.slug));
    expect(connected).toHaveLength(167);
    expect(connected.filter(o => o.geo === 'RS')).toHaveLength(55);
    expect(connected.filter(o => o.geo === 'HR')).toHaveLength(47);
    expect(connected.filter(o => o.geo === 'BA')).toHaveLength(65);
    expect(allOffers.filter(o => !getSuppliedOfferId(o.geo, o.slug))).toHaveLength(0);
  });

  it.each([
    ['HR', 'beauty-derm', '302'],
    ['HR', 'cy-relief', '752'],
    ['HR', 'deep-inhale', '1167'],
    ['HR', 'diatea', '92'],
    ['HR', 'mikoherb', '301'],
    ['HR', 'nautubone', '90'],
    ['HR', 'pro-caps', '315'],
    ['HR', 'varcosin', '95'],
    ['BA', 'cy-relief', '862'],
    ['BA', 'nautubone', '17'],
    ['BA', 'parazol', '18'],
    ['BA', 'pro-caps', '292'],
  ] as const)('%s / %s -> %s', (geo, slug, expected) => {
    expect(getOffer(geo, slug)).toBeDefined();
    expect(getSuppliedOfferId(geo, slug)).toBe(expected);
  });

  it('strogo razdvaja GEO; HP ID-jevi više ne postoje', () => {
    expect(getSuppliedOfferId('RS', 'nautubone')).toBe('51');
    expect(getSuppliedOfferId('HR', 'nautubone')).toBe('90');
    expect(getSuppliedOfferId('BA', 'nautubone')).toBe('17');
    expect(getSuppliedOfferId('RS', 'testoy')).toBe('59');
    expect(getSuppliedOfferId('RS', 'testoy-gel')).toBe('464');
    expect(getSuppliedOfferId('RS', 'erek-x')).toBe('1768');
    expect(getSuppliedOfferId('RS', 'bonecontrol')).toBe('100');
    expect(getSuppliedOfferId('HR', 'bonecontrol')).toBeUndefined();
    for (const geo of ['RS', 'BA', 'HR'] as const) {
      for (const slug of ['hp-nautubone', 'hp-testoy-gel', 'hp-bone-control', 'hp-erek-x', 'hp-beauty-derm']) {
        expect(getSuppliedOfferId(geo, slug)).toBeUndefined();
      }
    }
  });

  it('bivše HP ponude ne mogu da prime porudžbinu ni uz override', () => {
    const env = (key: string) => key === 'CATALOG_ORDERS_ENABLED' ? 'true' : '99999';
    for (const [geo, slug] of [['BA', 'hp-nautubone'], ['RS', 'hp-bone-control'], ['HR', 'hp-parazol'], ['BA', 'hp-slim-ease']] as const) {
      expect(getOffer(geo, slug)).toBeUndefined();
      expect(getCatalogOrderConfig(geo, slug, env)).toBeUndefined();
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

  it('svih 167 javnih stranica koristi isključivo products.json offer_id, nikada hp_offer_id', () => {
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
    expect(new Set(keys).size).toBe(167);
  });
});
