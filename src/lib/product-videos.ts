/**
 * Opt-in, self-hosted product videos. User will supply MP4 files downloaded
 * with rights/permission to republish; do not invent testimonials.
 *
 * Manifest key: "RS/nautubone", "BA/nautubone", "HR/cy-relief", etc.
 * Only exact GEO+slug matches with consentGranted=true are rendered.
 */
import manifest from '../data/product-videos.json';
import type { OfferGeo } from '../data/offers';

export interface ProductVideo {
  title: string;
  src: string;
  poster?: string;
  consentGranted: true;
  /** Never infer that the person purchased or used the product. */
  verifiedPurchase?: boolean;
}

const videoPath = /^\/videos\/products\/(rs|ba|hr)\/([a-z0-9-]+)\/([a-z0-9_-]+)\.mp4$/i;
const posterPath = /^\/videos\/products\/(rs|ba|hr)\/([a-z0-9-]+)\/([a-z0-9_-]+)\.(webp|jpe?g|png)$/i;
type RawVideo = Partial<ProductVideo>;

function matchesMarketAndProduct(path: string, geo: OfferGeo, slug: string, pattern: RegExp): boolean {
  const match = pattern.exec(path);
  return !!match && match[1].toLowerCase() === geo.toLowerCase() && match[2] === slug;
}

export function getProductVideos(geo: OfferGeo, slug: string): ProductVideo[] {
  const key = `${geo}/${slug}`;
  const raw = (manifest as Record<string, unknown>)[key];
  if (!Array.isArray(raw)) return [];
  const used = new Set<string>();
  const videos: ProductVideo[] = [];
  for (const item of raw as RawVideo[]) {
    if (item?.consentGranted !== true ||
        typeof item.title !== 'string' || !item.title.trim() ||
        typeof item.src !== 'string' ||
        !matchesMarketAndProduct(item.src, geo, slug, videoPath) ||
        used.has(item.src)) continue;
    const poster = typeof item.poster === 'string' &&
      matchesMarketAndProduct(item.poster, geo, slug, posterPath)
      ? item.poster : undefined;
    used.add(item.src);
    videos.push({
      title: item.title.trim().slice(0, 100),
      src: item.src,
      ...(poster ? { poster } : {}),
      consentGranted: true,
      verifiedPurchase: item.verifiedPurchase === true,
    });
  }
  return videos;
}

export function productVideoPages(videos: ProductVideo[]): ProductVideo[][] {
  const pages: ProductVideo[][] = [];
  for (let i = 0; i < videos.length; i += 2) pages.push(videos.slice(i, i + 2));
  return pages;
}
