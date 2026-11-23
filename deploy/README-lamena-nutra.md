# lamena.io/nutra/ — Nutra staging deploy

**Target:** https://lamena.io/nutra/

**Source:** `agency-adstema/Nutra` branch `gh-pages`, a pre-built *static* preview
that uses relative links/assets and has demo data + `noindex`.
This is a staging deployment, NOT production COD order processing.
Its order form displays a test-mode message and NEVER creates a MonadLead order.

## Assumptions to verify before deploying

Earlier lamena.io deployment used an Ubuntu/Vultr VPS with Nginx, an HTTPS
server block at `/etc/nginx/sites-available/lamena`, and Cloudflare DNS.
Confirm that this is still the active serving setup with
`sudo nginx -T | grep -n 'server_name.*lamena.io'`.
If the current setup is different, adapt the deployment to the actual host
rather than replacing existing configurations.

## Deploy (run on the lamena.io VPS)

1. Have `git`, `rsync`, and `nginx` available. Fetch this repo and run:
   ```bash
   sudo bash deploy/deploy-nutra-preview.sh
   ```
   Or clone the `gh-pages` branch and rsync its **contents** to
   `/var/www/nutra-preview/`.

2. Back up the active vhost. Open the **existing HTTPS server block** for
   `lamena.io` and copy both `location` blocks from
   `deploy/nginx-nutra-preview.conf` into it. Keep all other configuration,
   SSL settings and `location /` unchanged. If a /nutra location already
   exists, inspect/replace that one instead of adding a duplicate.

3. Validate configuration and reload:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

4. Verify:
   ```bash
   curl -I https://lamena.io/
   curl -I https://lamena.io/nutra/
   curl -I https://lamena.io/nutra/zglobovi-i-bolovi/
   curl -I https://lamena.io/nutra/assets/BaseLayout.D7yc46n3.css
   ```
   The asset filename is an example from the current build and may change.
   Verify CSS/JS/images visually on mobile and desktop, internal navigation,
   and that `X-Robots-Tag: noindex, nofollow` is present. Confirm the homepage
   at `https://lamena.io/` still works exactly as before.

5. To update the staging site: rebuild/push branch `gh-pages` using the
   existing preview build pipeline, and rerun `deploy-nutra-preview.sh`
   on the VPS. Do not clone `main` into the public directory.

## Important

- Do NOT add a CNAME: DNS cannot select URL subfolders.
- A Cloudflare Worker is an alternate route; if Nginx is already on the VPS,
  this native location is simpler. Do NOT activate both Nginx and Worker
  solutions simultaneously without explicitly planning precedence.
- `/nutra/` is separate from root and other paths.
- This static preview does not provide `POST /nutra/api/order/`. To enable
  real MonadLead COD calls later, deploy a server-rendered Astro/Node adapter,
  set a `base: '/nutra'` strategy and API path consistently, configure
  secrets only on the server, and run a controlled test order.
- Do not remove staging/noindex or activate MonadLead until demo content,
  legal pages, offer IDs, prices and API settings are production-ready.
