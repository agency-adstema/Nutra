/** Product-matched Cloudflare R2 videos imported from spisak_videa.csv.
 * The CSV has no GEO. Clips are re-used for the same exact product name in
 * RS / BA / HR and are NEVER silently attributed to similarly named HP offers.
 * These are third-party videos, not verified purchasers of this shop.
 */
import raw from '../data/product-videos.json';
import { videoR2Url } from '../config/video';
import type { OfferGeo } from '../data/offers';

export interface ProductVideo {
  title: string;
  src: string;
  poster: string;
  file: string;
  date: string;
  description: string;
}
export interface RawVideo {
  file: string;
  date: string;
  title: string;
  description: string;
}
const manifest = raw as Record<string, RawVideo[]>;
const slugify = (v: string) =>
  v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const aliases: Record<string,string> = {
  'dia-tea': 'diatea',
};
const bySlug = new Map<string,RawVideo[]>();
for (const [product, videos] of Object.entries(manifest)) {
  const slug = aliases[slugify(product)] || slugify(product);
  if (bySlug.has(slug)) throw new Error('Duplicate video product alias: ' + product);
  bySlug.set(slug, videos);
}
const safeFile = /^[^/\\]+\/[A-Za-z0-9_. -]+\.mp4$/;
export function getProductVideos(_geo: OfferGeo, productSlug: string): ProductVideo[] {
  // Exact slug match only; never map videos onto similarly named offers.
  const files = bySlug.get(productSlug) ?? [];
  const unique = new Set<string>();
  return files.slice(0,5).flatMap(item => {
    const file = item.file?.replace(/\\/g,'/');
    if (!file || !safeFile.test(file) || file.includes('..') || unique.has(file)) return [];
    unique.add(file);
    return [{
      file,
      date: item.date || '',
      title: String(item.title || 'Video o proizvodu').slice(0,100),
      description: String(item.description || '').slice(0,230),
      src: videoR2Url(file),
      poster: videoR2Url(file.replace(/\.mp4$/i, '.jpg')),
    }];
  });
}
export function productVideoPages(videos: ProductVideo[]): ProductVideo[][] {
  const pages: ProductVideo[][] = [];
  for(let i=0;i<videos.length;i+=2)pages.push(videos.slice(i,i+2));
  return pages;
}
