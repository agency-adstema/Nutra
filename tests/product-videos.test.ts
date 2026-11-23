import { describe, expect, it } from 'vitest';
import { getProductVideos, productVideoPages, type ProductVideo } from '../src/lib/product-videos';
import { videoR2Url, VIDEO_BASE_URL } from '../src/config/video';
import imported from '../src/data/product-videos.json';
import { offers } from '../src/data/offers';

describe('Cloudflare R2 video gallery', () => {
  it('imports every supplied clip, with no duplicate files and max five per product', () => {
    const sets = Object.values(imported);
    expect(sets).toHaveLength(32);
    expect(sets.reduce((n, clips) => n + clips.length, 0)).toBe(61);
    const unique = new Set<string>();
    for (const clips of sets) {
      expect(clips.length).toBeLessThanOrEqual(5);
      for (const v of clips) {
        expect(unique.has(v.file)).toBe(false);
        unique.add(v.file);
        expect(v.file).toMatch(/^[^/]+\/[A-Za-z0-9_. -]+\.mp4$/);
      }
    }
  });
  it('groups videos in pairs (1–2, 3–4, 5)', () => {
    const clips = Array.from({length:5},(_,i) => ({
      title:`Video ${i+1}`,src:'x',poster:'x',date:'2026-11-23',description:'',file:'x'
    })) satisfies ProductVideo[];
    expect(productVideoPages(clips).map(g => g.map(v => v.title))).toEqual([
      ['Video 1','Video 2'],['Video 3','Video 4'],['Video 5']
    ]);
  });
  it('uses one base and URL-encodes spaces without double-encoding', () => {
    expect(videoR2Url('Beauty Derm/Beauty_Derm_1.mp4')).toBe(
      VIDEO_BASE_URL + '/Beauty%20Derm/Beauty_Derm_1.mp4'
    );
    expect(() => videoR2Url('../secret.mp4')).toThrow();
    expect(() => videoR2Url('/absolute.mp4')).toThrow();
  });
  it('does not borrow video testimonials for differently named HP offers', () => {
    expect(getProductVideos('RS','hp-nautubone')).toHaveLength(0);
    expect(getProductVideos('HR','hp-nautubone')).toHaveLength(0);
    expect(getProductVideos('RS','hp-pro-caps')).toHaveLength(0);
  });
  it('matches exact products in the storefront and gives every video a matching poster', () => {
    const hits=offers.filter(o=>getProductVideos(o.geo,o.slug).length>0);
    expect(hits.length).toBeGreaterThan(0);
    for(const o of hits){
      const list=getProductVideos(o.geo,o.slug);
      expect(list.length).toBeLessThanOrEqual(5);
      for(const v of list){
        expect(v.src).toMatch(/^https:\/\/pub-/);
        expect(v.poster).toBe(v.src.replace(/\.mp4$/i,'.jpg'));
        expect(v.description).not.toMatch(/instagram\.com/);
      }
    }
  });
});
