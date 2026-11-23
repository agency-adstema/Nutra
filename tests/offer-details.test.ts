import { describe, expect, it } from 'vitest';
import { offers, getOffer } from '../src/data/offers';
import { getOfferDetails, getOfferImage, offerDetails } from '../src/data/offer-details';
import { getSuppliedOfferId } from '../src/server/catalog-offer-ids';

describe('Partner product sheets integrated into Nutra', () => {
  it('contains exactly one data sheet for every catalog offer', () => {
    expect(offerDetails).toHaveLength(20);
    expect(new Set(offerDetails.map(d => d.country + '/' + d.slug)).size).toBe(20);
    expect(offerDetails.some(d => d.slug.startsWith('hp-'))).toBe(false);
    for (const o of offers) expect(getOfferDetails(o.geo, o.slug)).toBeDefined();
  });

  it('has price and image for all 20 available offers', () => {
    const available = offerDetails.filter(d => d.availableInAccount);
    expect(available).toHaveLength(20);
    expect(available.every(d => d.price && d.imageUrl && d.priceAmount && d.priceAmount > 0)).toBe(true);
    expect(available.every(d => getSuppliedOfferId(d.country, d.slug))).toBe(true);
  });

  it('never exposes internal partner payouts or Drive folder links in public JSON', async () => {
    const doc = JSON.stringify(offerDetails);
    expect(doc).not.toContain('"payout"');
    expect(doc).not.toContain('photos_folder');
    expect(doc).not.toContain('drive.google.com');
  });

  it('preserves exact GEO-specific prices and package descriptions', () => {
    expect(getOfferDetails('RS','dia-drops')).toMatchObject({ price:'3700 RSD',form:'Kapi',package:'30 ml',currency:'RSD' });
    expect(getOfferDetails('HR','cy-relief')).toMatchObject({ price:'39 EUR',currency:'EUR', availableInAccount:true });
    expect(getOfferDetails('BA','nautubone')).toMatchObject({ price:'55 KM',currency:'BAM',form:'Gel',package:'100 ml' });
    expect(getOfferDetails('RS','hp-nautubone')).toBeUndefined();
  });

  it('all Serbian catalog offers use the corrected 3700 RSD price', () => {
    const rs=offerDetails.filter(d=>d.country==='RS'&&d.availableInAccount);
    expect(rs).toHaveLength(8);
    expect(rs.every(d=>d.priceAmount===3700 && d.price==='3700 RSD')).toBe(true);
  });

  it('does not manufacture missing ingredients or usage', () => {
    expect(getOfferDetails('BA','cy-relief')?.usage).toBeNull();
    expect(getOfferDetails('HR','cy-relief')?.usage).toBeNull();
  });

  it('maps each photo to exact supplied partner domain (not another offer)', () => {
    for(const d of offerDetails) {
      const url = getOfferImage(d);
      if (!d.imageUrl) expect(url).toBeNull();
      else {
        expect(d.imageUrl).toMatch(/^https:\/\/api\.monadlead\.com\/storage\/offers\/images\//);
        expect(url).toBeTruthy();
      }
    }
  });
});
