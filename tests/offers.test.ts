import { describe, expect, it } from 'vitest';
import {
  offers, allOffers, sourceOfferRows, getOffersByGeo, getOffer, offerUrl, geoUrl,
  catalogMarkets, verticalLabel,
} from '../src/data/offers';

describe('Katalog ponuda RS/BA/HR', () => {
  it('čuva svih 56 redova primljene liste bez gubljenja GEO podataka', () => {
    expect(sourceOfferRows).toHaveLength(56);
    expect(sourceOfferRows.every((row) => ['RS', 'BA', 'HR'].includes(row.geo))).toBe(true);
  });

  it('čuva 45 izvornih ponuda, prikazuje 41 sa cenom: RS 19, BA 9, HR 13', () => {
    expect(allOffers).toHaveLength(45);
    expect(offers).toHaveLength(41);
    expect(getOffersByGeo('RS')).toHaveLength(19);
    expect(getOffersByGeo('BA')).toHaveLength(9);
    expect(getOffersByGeo('HR')).toHaveLength(13);
    expect(new Set(offers.map((offer) => `${offer.geo}/${offer.slug}`)).size).toBe(offers.length);
    for(const slug of ['hp-cardio-zen','hp-glyco-balance','hp-para-clean','hp-slim-ease']) expect(getOffer('BA',slug)).toBeUndefined();
  });

  it('spaja samo iste ponude na istom tržištu, bez mešanja država', () => {
    expect(getOffer('RS', 'testoy')?.verticals).toEqual(['Potency', 'Male Enlargement']);
    expect(getOffer('BA', 'hp-testoy-gel')?.verticals).toEqual(['Potency', 'Male Enlargement']);
    expect(getOffer('HR', 'hp-testoy-gel')?.verticals).toEqual(['Potency']);
    expect(getOffer('RS', 'hp-testoy-gel')?.verticals).toEqual(['Potency']);
    expect(getOffer('BA', 'pro-caps')?.verticals).toEqual(['Prostatitis']);
    expect(getOffer('BA', 'hp-nautubone')?.verticals).toEqual(['Joints']);
    expect(getOffer('HR', 'nautubone')?.verticals).toEqual(['Joints']);
    expect(getOffer('BA', 'nautubone')?.verticals).toEqual(['Joints']);
  });

  it('ne meša HP i standardne verzije ponuda', () => {
    expect(getOffer('BA', 'nautubone')).toBeDefined();
    expect(getOffer('BA', 'hp-nautubone')).toBeDefined();
    expect(getOffer('HR', 'hp-parazol')).toBeDefined();
    expect(getOffer('RS', 'parazol')).toBeDefined();
    expect(getOffer('RS', 'hp-bone-control')).toBeDefined();
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
