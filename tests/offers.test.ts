import { describe, expect, it } from 'vitest';
import {
  offers, allOffers, sourceOfferRows, getOffersByGeo, getOffer, offerUrl, geoUrl,
  catalogMarkets, verticalLabel,
} from '../src/data/offers';

describe('Katalog ponuda RS/BA/HR', () => {
  it('čuva 199 kategorijskih redova liste (bez HP ponuda) bez gubljenja GEO podataka', () => {
    expect(sourceOfferRows).toHaveLength(199);
    expect(sourceOfferRows.some((row) => /^HP\b/i.test(row.name))).toBe(false);
    expect(sourceOfferRows.every((row) => ['RS', 'BA', 'HR'].includes(row.geo))).toBe(true);
  });

  it('čuva 167 ponuda i prikazuje svih 167: RS 55, BA 65, HR 47', () => {
    expect(allOffers).toHaveLength(167);
    expect(offers).toHaveLength(167);
    expect(getOffersByGeo('RS')).toHaveLength(55);
    expect(getOffersByGeo('BA')).toHaveLength(65);
    expect(getOffersByGeo('HR')).toHaveLength(47);
    expect(new Set(offers.map((offer) => `${offer.geo}/${offer.slug}`)).size).toBe(offers.length);
    expect(getOffer('HR', 'beauty-derm')).toBeDefined();
  });

  it('nijedna HP ponuda nije u katalogu ni u jednoj zemlji', () => {
    expect(allOffers.some((o) => o.slug.startsWith('hp-') || /^HP\b/i.test(o.name))).toBe(false);
    for (const geo of ['RS', 'BA', 'HR'] as const) {
      for (const slug of ['hp-beauty-derm', 'hp-nautubone', 'hp-bone-control', 'hp-testoy-gel', 'hp-parazol']) {
        expect(getOffer(geo, slug)).toBeUndefined();
      }
    }
  });

  it('spaja samo iste ponude na istom tržištu, bez mešanja država', () => {
    expect(getOffer('RS', 'testoy')?.verticals).toEqual(['Potency', 'Male Enlargement']);
    expect(getOffer('BA', 'pro-caps')?.verticals).toEqual(['Prostatitis']);
    expect(getOffer('BA', 'cy-relief')?.verticals).toEqual(['Cystitis']);
    expect(getOffer('HR', 'nautubone')?.verticals).toEqual(['Bones', 'Joints']);
    expect(getOffer('BA', 'nautubone')?.verticals).toEqual(['Bones', 'Joints']);
  });

  it('zadržava standardne verzije ponuda', () => {
    expect(getOffer('BA', 'nautubone')).toBeDefined();
    expect(getOffer('HR', 'nautubone')).toBeDefined();
    expect(getOffer('RS', 'parazol')).toBeDefined();
    expect(getOffer('RS', 'u-caps')).toBeDefined();
  });

  it('ne otvara porudžbine dok ne dobijemo API offer ID, cenu i validirane slike', () => {
    expect(offers.every((offer) => offer.orderEnabled === false)).toBe(true);
    expect(offers.every((offer) => !('offerId' in offer) && !('price' in offer) && !('image' in offer))).toBe(true);
  });

  it('gradi GEO putanje koje ne kolidiraju', () => {
    expect(geoUrl('RS')).toBe('/ponude/rs/');
    expect(geoUrl('BA')).toBe('/ponude/ba/');
    expect(geoUrl('HR')).toBe('/ponude/hr/');
    expect(offerUrl(getOffer('RS', 'parazol')!)).toBe('/ponude/rs/parazol/');
    expect(offerUrl(getOffer('BA', 'parazol')!)).toBe('/ponude/ba/parazol/');
  });

  it('ima nazive tržišta i prevode dostupnih vertikala', () => {
    expect(catalogMarkets.HR.name).toBe('Hrvatska');
    expect(catalogMarkets.BA.name).toBe('Bosna i Hercegovina');
    expect(verticalLabel('Weight Loss')).toBe('Mršavljenje');
    expect(verticalLabel('Male Enlargement')).toBe('Muško povećanje');
  });
});
