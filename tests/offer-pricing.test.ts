import { describe, expect, it } from 'vitest';
import { offers, allOffers, type OfferGeo } from '../src/data/offers';
import { getCatalogPrice, formatCatalogPrice, popularPackageBadge, deliveryTerms } from '../src/data/offer-pricing';
import { getOfferDetails } from '../src/data/offer-details';

const regular: Record<OfferGeo, number[][]> = {
  RS: [[5500,3700],[11000,5850],[16500,6800]],
  BA: [[110,55],[220,85],[330,100]],
  HR: [[78,39],[156,69],[234,78]],
};

describe('Cene u XLSX: redovi 2-46, list Cene', () => {
  it('svih 162 javna proizvoda ima cenu, bez HP ponuda', () => {
    const mapped = offers.filter(o=>getCatalogPrice(o.geo,o.slug));
    expect(mapped).toHaveLength(162);
    expect(allOffers.filter(o=>!getCatalogPrice(o.geo,o.slug))).toHaveLength(0);
    expect(offers.some(o=>o.slug.startsWith('hp-'))).toBe(false);
  });

  it('svih 53 RS ponude imaju cenu jednog pakovanja 3.700 RSD, bez 2.000 RSD', () => {
    const rs = offers.filter(o => o.geo === 'RS');
    expect(rs).toHaveLength(53);
    for (const offer of rs) {
      const pricing = getCatalogPrice('RS', offer.slug);
      expect(pricing?.tiers[0].newPrice).toBe(3700);
      expect(pricing?.tiers[0].unitPrice).toBe(3700);
    }
  });

  it('162 regular proizvoda ima tačnu direktnu cenu, uz dodatne pakete samo gde su dostavljeni', () => {
    expect(offers).toHaveLength(162);
    for (const o of offers) {
      const p = getCatalogPrice(o.geo, o.slug)!;
      expect(p.type).toBe('regular');
      expect(p.tiers.length).toBeGreaterThanOrEqual(1);
      expect(p.tiers[0].newPrice).toBe(({ RS: 3700, BA: 55, HR: 39 } as const)[o.geo]);
      expect(p.tiers.every(t => t.newPrice > 0)).toBe(true);
    }
    for (const [geo, slug] of [['RS','dia-drops'], ['RS','parazol']] as const) {
      const p = getCatalogPrice(geo, slug)!;
      expect(p.tiers).toHaveLength(3);
      expect(p.tiers.map(t => [t.referencePrice, t.newPrice])).toEqual(regular[geo]);
    }
  });

  it('cena jednog pakovanja u novom cenovniku se poklapa sa prethodnim partner podacima', () => {
    for (const o of offers) {
      const p=getCatalogPrice(o.geo,o.slug);
      const d=getOfferDetails(o.geo,o.slug);
      if(p) expect(p.tiers[0].newPrice).toBe(d?.priceAmount);
    }
  });

  it('formatira cene prema tržištu sa dve decimale za BA/HR', () => {
    expect(formatCatalogPrice(3700,'RS')).toBe('3.700 RSD');
    expect(formatCatalogPrice(55,'BA')).toBe('55,00 KM');
    expect(formatCatalogPrice(39,'HR')).toBe('39,00 €');
    expect(formatCatalogPrice(100/3,'BA')).toBe('33,33 KM');
    expect(formatCatalogPrice(6800/3,'RS')).toBe('2.267 RSD');
  });

  it('računa uštedu i popust za sve regularne pakete', () => {
    const rs=getCatalogPrice('RS','parazol')!;
    expect(rs.tiers.map(t=>t.savings)).toEqual([1800,5150,9700]);
    expect(rs.tiers.map(t=>t.discountPercent)).toEqual([33,47,59]);
    expect(popularPackageBadge('RS',3)).toBe('NAJPOPULARNIJE · -59%');
    expect(popularPackageBadge('BA',3)).toBe('Najpopularnije · Najbolja cijena');
    expect(popularPackageBadge('HR',3)).toBe('Najpopularnije · -67%');
    expect(deliveryTerms('HR')).toContain('Dostava 1–2 radna dana');
  });

  it('nema lažnih datuma akcija, nestanka zaliha ili neproverenih rokova dostave', () => {
    for (const o of offers) {
      const p=getCatalogPrice(o.geo,o.slug);
      if(p) {
        expect(typeof p.freeShippingPerSheet).toBe('boolean');
        if (!p.freeShippingPerSheet) expect(deliveryTerms(o.geo, p)).toContain('Uslovi dostave');
        expect(p.priceVerifiedWithMerchant).toBe(false);
        expect(JSON.stringify(p)).not.toMatch(/endsAt|stockRemaining|discountEndsAt|countdown/);
      }
    }
  });
});
