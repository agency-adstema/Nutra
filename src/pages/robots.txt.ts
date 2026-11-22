import type { APIRoute } from 'astro';
import { PUBLIC_SITE_ENV } from 'astro:env/client';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? '').replace(/\/$/, '');
  const body =
    PUBLIC_SITE_ENV === 'production'
      ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /pretraga/\n\nSitemap: ${base}/sitemap.xml\n`
      : `# Staging/preview — indeksiranje isključeno\nUser-agent: *\nDisallow: /\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
