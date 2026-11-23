import { describe, expect, it } from 'vitest';
import { getExternalReview, externalReviews } from '../src/data/external-reviews';
import { offers } from '../src/data/offers';

describe('Sourced Limited Charm ratings on Nutra catalog cards', () => {
  it('uses only sourced product-detail ratings and valid source URLs', () => {
    expect(externalReviews.size).toBe(18);
    for (const [key, review] of externalReviews) {
      expect(review.score).toBeGreaterThan(0);
      expect(review.score).toBeLessThanOrEqual(5);
      expect(review.count).toBeGreaterThan(0);
      expect(review.sourceName).toBe('Limited Charm');
      expect(review.sourceUrl).toMatch(/^https:\/\/limitedcharm\.com\/(rs|ba|hr)\/proizvod\/[a-z0-9-]+$/);
      expect(review.checkedAt).toBe('2026-11-23');
      expect(key).toMatch(/^(RS|BA|HR)\/[a-z0-9-]+$/);
    }
  });

  it('has no HP offers left to attach reviews to', () => {
    expect(offers.some(o => o.slug.startsWith('hp-'))).toBe(false);
    expect(getExternalReview('RS','hp-nautubone')).toBeUndefined();
  });

  it('different markets may have different counts for the same product', () => {
    expect(getExternalReview('RS','nautubone')).toMatchObject({score:4.6,count:87});
    expect(getExternalReview('BA','nautubone')).toMatchObject({score:4.6,count:77});
    expect(getExternalReview('HR','nautubone')).toMatchObject({score:4.6,count:84});
    expect(getExternalReview('RS','parazol')).toMatchObject({score:4.5,count:28});
    expect(getExternalReview('BA','parazol')).toMatchObject({score:4.6,count:10});
  });

  it('uses imported Limited Charm product-page ratings when no manual entry exists', () => {
    expect(getExternalReview('RS','quick-fit')).toMatchObject({ score: 4.5, count: 12, sourceName: 'Limited Charm' });
  });

  it('keeps missing ratings missing, not 4.9 by default', () => {
    expect(getExternalReview('HR','cy-relief')).toBeUndefined();
    expect(getExternalReview('RS','hp-lossless')).toBeUndefined();
  });
});
