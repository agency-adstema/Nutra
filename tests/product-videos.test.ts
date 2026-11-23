import { describe, expect, it } from 'vitest';
import {
  filterPermittedProductVideos,
  getProductVideos,
  productVideoPages,
  type ProductVideo,
} from '../src/lib/product-videos';
import { offers } from '../src/data/offers';

const source = '/videos/products/rs/nautubone/';

describe('Product-specific Instagram video gallery', () => {
  it('groups videos two at a time (1–2, 3–4, 5–6)', () => {
    const samples: ProductVideo[] = Array.from({length: 5}, (_, i) => ({
      title: 'Video '+(i+1), src: source+(i+1)+'.mp4', consentGranted: true,
    }));
    expect(productVideoPages(samples).map(page => page.map(v=>v.title))).toEqual([
      ['Video 1', 'Video 2'], ['Video 3', 'Video 4'], ['Video 5'],
    ]);
    expect(productVideoPages([])).toEqual([]);
  });

  it('refuses videos without republishing permission', () => {
    expect(filterPermittedProductVideos([
      {title:'Without permission', src:source+'01.mp4', consentGranted:false},
      {title:'Missing permission', src:source+'02.mp4'},
    ], 'RS','nautubone')).toEqual([]);
  });

  it('allows only self-hosted MP4s in the exact market/product directory', () => {
    const list = [
      {title:'RS clip',src:source+'01.mp4',poster:source+'01.webp',consentGranted:true},
      {title:'BA same product',src:'/videos/products/ba/nautubone/02.mp4',consentGranted:true},
      {title:'RS HP product',src:'/videos/products/rs/hp-nautubone/03.mp4',consentGranted:true},
      {title:'external Instagram',src:'https://instagram.com/reel/123',consentGranted:true},
      {title:'path traversal',src:'/videos/products/rs/nautubone/../secret.mp4',consentGranted:true},
      {title:'duplicate',src:source+'01.mp4',consentGranted:true},
      {title:'valid with bad poster',src:source+'04.mp4',poster:'https://example.com/evil.webp',consentGranted:true},
    ];
    const result=filterPermittedProductVideos(list,'RS','nautubone');
    expect(result.map(v=>v.src)).toEqual([source+'01.mp4',source+'04.mp4']);
    expect(result[0].poster).toBe(source+'01.webp');
    expect(result[1].poster).toBeUndefined();
  });

  it('empty galleries do not fabricate reviews or actual video files', () => {
    for(const o of offers) {
      const videos=getProductVideos(o.geo,o.slug);
      expect(videos.every(v=>v.consentGranted===true)).toBe(true);
      expect(videos.every(v=>v.src.startsWith('/videos/products/'+o.geo.toLowerCase()+'/'+o.slug+'/'))).toBe(true);
    }
  });
});
