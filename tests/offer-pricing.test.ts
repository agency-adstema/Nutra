import { describe, expect, it } from 'vitest';
import { offers, getOffer, type OfferGeo } from '../src/data/offers';
import { getCatalogPrice } from '../src/data/offer-pricing';
import { getOfferDetails } from '../src/data/offer-details';

const regular: Record<OfferGeo, number[][]> = {
  RS: [[5500,3700],[11000,5850],[16500,6800]],
  BA: [[110,55],[220,85],[330,100]],
  HR: [[78,39],[156,69],[234,78]],
};
const hp: Record<OfferGeo,number> = {RS:2000, BA:30, HR:20};

describe('Cene u XLSX: redovi 2-46, list Cene', () => {
  it('41 dostupna proizvoda i 4 nedostupna BA nemaju prikaz cene', () => {
    const mapped = offers.filter(o=>getCatalogPrice(o.geo,o.slug));
    expect(mapped).toHaveLength(41);
    expect(offers.filter(o=>!getCatalogPrice(o.geo,o.slug)).map(o=>o.geo+'/'+o.slug).sort())
      .toEqual(['BA/hp-cardio-zen','BA/hp-glyco-balance','BA/hp-para-clean','BA/hp-slim-ease'].sort());
  });

  it('20 regular proizvoda imaju tri paketa iz tabele', () => {
    const regularOffers = offers.filter(o=>!o.slug.startsWith('hp-') && getCatalogPrice(o.geo,o.slug));
    expect(regularOffers).toHaveLength(20);
    for (const o of regularOffers) {
      const p=getCatalogPrice(o.geo,o.slug)!;
      expect(p.type).toBe('regular');
      expect(p.tiers).toHaveLength(3);
      expect(p.tiers.map(t=>[t.referencePrice,t.newPrice])).toEqual(regular[o.geo]);
      expect(p.tiers.map(t=>t.id)).toEqual(['1-komad','2-komada','3-komada']);
      expect(p.tiers.map(t=>t.quantity)).toEqual([1,2,3]);
      expect(p.tiers.every(t=>t.newPrice>0)).toBe(true);
    }
  });

  it('21 HP proizvod imaju SAMO jednu cenu, bez izmišljene precrtane stare cene', () => {
    const hpOffers=offers.filter(o=>o.slug.startsWith('hp-')&&getCatalogPrice(o.geo,o.slug));
    expect(hpOffers).toHaveLength(21);
    for(const o of hpOffers) {
      const p=getCatalogPrice(o.geo,o.slug)!;
      expect(p.type).toBe('hp');
      expect(p.tiers).toEqual([{
        id:'1-komad',label:'1 pakovanje',quantity:1,
        newPrice:hp[o.geo],referencePrice:null
      }]);
    }
  });

  it('cena jednog pakovanja u novom cenovniku se poklapa sa prethodnim partner podacima', () => {
    for (const o of offers) {
      const p=getCatalogPrice(o.geo,o.slug);
      const d=getOfferDetails(o.geo,o.slug);
      if(p) expect(p.tiers[0].newPrice).toBe(d?.priceAmount);
    }
  });

  it('nema lažnih datuma akcija, nestanka zaliha ili neproverenih rokova dostave', () => {
    for (const o of offers) {
      const p=getCatalogPrice(o.geo,o.slug);
      if(p) {
        expect(p.freeShippingPerSheet).toBe(true);
        expect(p.priceVerifiedWithMerchant).toBe(false);
        expect(JSON.stringify(p)).not.toMatch(/endsAt|stockRemaining|deliveryDays|discountEndsAt|countdown/);
      }
    }
  });
});
