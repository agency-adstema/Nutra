/**
 * Nutra preview proxy: display the EXISTING GitHub Pages staging site at
 * https://<your-domain>/nutra/ without touching any other paths on the domain.
 *
 * Deploy in Cloudflare Dashboard -> Workers & Pages -> Create Worker,
 * then add a route in your existing DNS zone:
 *   <your-domain>/nutra*
 *
 * This is a TEMPORARY, GET/HEAD-only PREVIEW proxy; it does NOT support
 * POST /api/order, so MonadLead cannot be used on this static deployment.
 * When switching to the production Astro server, remove this route and
 * configure the real /nutra/ and /nutra/api/order/ paths.
 *
 * Ensure the source stays a static staging build with noindex and demo content.
 */
const SOURCE = 'https://agency-adstema.github.io';
const SOURCE_PREFIX = '/Nutra';
const TARGET_PREFIX = '/nutra';

export default {
  async fetch(request) {
    const incoming = new URL(request.url);

    if (incoming.pathname === TARGET_PREFIX) {
      incoming.pathname = TARGET_PREFIX + '/';
      return Response.redirect(incoming.toString(), 308);
    }

    if (!incoming.pathname.startsWith(TARGET_PREFIX + '/')) {
      return new Response('Not found', { status: 404 });
    }

    // This proxy is ONLY for browsing the staging preview; never accept orders.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Preview only: orders are disabled', {
        status: 405,
        headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' },
      });
    }

    const upstream = new URL(SOURCE);
    upstream.pathname = SOURCE_PREFIX + incoming.pathname.slice(TARGET_PREFIX.length);
    upstream.search = incoming.search;

    // Do not forward visitor cookies, credentials, or personal data to GitHub.
    const response = await fetch(upstream.toString(), {
      method: request.method,
      redirect: 'manual',
      headers: { Accept: request.headers.get('Accept') || '*/*' },
    });

    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('Cache-Control', response.ok ? 'public, max-age=300' : 'no-store');
    headers.delete('set-cookie');

    const redirect = headers.get('location');
    if (redirect) {
      const loc = new URL(redirect, upstream);
      if (loc.origin === SOURCE && (loc.pathname === SOURCE_PREFIX || loc.pathname.startsWith(SOURCE_PREFIX + '/'))) {
        loc.protocol = incoming.protocol;
        loc.host = incoming.host;
        loc.pathname = TARGET_PREFIX + loc.pathname.slice(SOURCE_PREFIX.length);
        headers.set('location', loc.toString());
      }
    }

    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
