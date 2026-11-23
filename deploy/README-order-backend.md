# Nutra order API — existing code and VPS deployment

**Status as of 23 Nov 2026:** the API handler exists in source code at
`src/server/order-endpoint.ts` and `src/lib/order/handler.ts`.
It is injected into Astro under **`POST /api/order/`** when `DEPLOY_TARGET=node`.
The public `https://lamena.io/nutra/` site is an independent, static/noindex
preview deployed from `gh-pages`. Its catalog forms are hardcoded to preview
mode and do not send customer data. **The Node service and Nginx proxy are not
installed merely by committing these files.**

The API supports name, surname, validated RS/BA/HR phone, an allowlisted product
slug, server-controlled new-account MonadLead offer IDs, CSRF/origin checks,
honeypot, optional Turnstile, throttling and idempotency.
Never store an API key in code, GitHub, a query string or frontend JavaScript.

## Pricing limitations from the uploaded Excel

- 20 regular catalog offers have one/two/three-package *quoted* prices.
- All HP catalog offers were removed on 23 Nov 2026 (they duplicated regular products).
- Regular "old" reference prices are from the sheet, not verified sales history.
- The uploaded spreadsheet says free delivery and 1–2 working days, but delivery
  times, stock scarcity and time-limited offers have not been verified; DO NOT
  hardcode countdown timers, stock scarcity or guaranteed dispatch promises.
- **Critical**: MonadLead's provided create-order API contains `offer_id` but no
  `quantity`, `package_id` or `price` field. The on-page 2/3-package selectors
  are PREVIEW only. Do not enable live bundled orders until the call center
  confirms an explicit package-routing mechanism and price. Do not hide the
  package in customer names or overwrite affiliate click IDs.

## Server-only installation — test mode first

1. Verify VPS `178.62.254.33`, Nginx vhost for `lamena.io` and Node.js >=22:
   ```bash
   sudo nginx -T | grep -n 'server_name.*lamena.io'
   command -v node && node --version
   ```
   Do **not** replace the vhost; `/astro/` and other sites must remain intact.

2. Use a dedicated non-login service account and private backend directory:
   ```bash
   sudo useradd --system --home /opt/nutra-backend --shell /usr/sbin/nologin nutra-orders || true
   sudo install -d -o nutra-orders -g nutra-orders -m 750 /opt/nutra-backend
   sudo install -d -o root -g root -m 700 /etc/nutra
   ```
   Copy a clean checkout of the **main** branch (not `gh-pages`) into
   `/opt/nutra-backend` and make it writable by `nutra-orders` only.
   If the repo is private, use short-lived authorized checkout mechanisms;
   never put a GitHub token in the URL, shell history or environment file.

3. Build the Astro Node backend in that checkout (build does not send orders):
   ```bash
   cd /opt/nutra-backend
   npm ci
   npm test
   DEPLOY_TARGET=node SITE_URL=https://lamena.io PUBLIC_SITE_ENV=staging PUBLIC_MARKET=RS npm run build
   test -s dist/server/entry.mjs
   ```
   Ensure the version of Node used by systemd is the same as the build version.

4. Create `/etc/nutra/backend.env` using the `deploy/backend.env.example`
   **only as a template**. Permissions must be root-only:
   ```bash
   sudo chmod 600 /etc/nutra/backend.env
   sudo chown root:root /etc/nutra/backend.env
   ```
   Set `ORDER_MODE=test`, `CATALOG_ORDERS_ENABLED=false` and
   `ALLOWED_ORIGINS=https://lamena.io`.
   For later production, set a freshly rotated
   `MONADLEAD_API_KEY_CATALOG` directly on the VPS, not in GitHub.
   Generate a long random `ORDER_HASH_SALT`.
   Secrets and the Node adapter environment variables must be injected at
   **runtime**; they are not loaded automatically by the Node adapter.

5. Install `deploy/nutra-backend.service.example` as
   `/etc/systemd/system/nutra-orders.service` after confirming
   `/usr/bin/node` exists; otherwise adapt the absolute `ExecStart` path.
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now nutra-orders
   sudo systemctl status nutra-orders --no-pager
   ```
   Verify a GET to `http://127.0.0.1:4376/api/order/` returns **405**
   (a POST-only endpoint), **not** 200. Invalid POST with an empty JSON object
   should give a controlled 400 and must not create any order.

6. Insert both `location` blocks from
   `deploy/nginx-nutra-orders.example.conf` into the active HTTPS server
   block for `lamena.io`. Do not add duplicate locations or remove the
   existing static `/nutra/` alias. Back up the vhost first:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```
   Verify `/nutra/api/order/` has no fallback to the static HTML
   or to another site; it must proxy to `127.0.0.1:4376` and accept POST only.

## Controlled activation (NOT DONE)

Before enabling real orders:
- obtain confirmed seller/legal and privacy/contact information;
- validate accepted delivery terms and prices for each country;
- verify secure site-only API key with a newly rotated credential;
- confirm package routing for 2/3-pack pricing (MonadLead documentation
  supplied by the user does not include quantities);
- ensure durable rate limiting/idempotency store, Turnstile, reliable logging;
- run test-mode requests and inspect redacted responses (never expose PII);
- obtain explicit approval for **one controlled live test lead** on a known
  offer and confirm it appears in the new MonadLead account;
- only then decide when to enable `ORDER_MODE=live` and
  `CATALOG_ORDERS_ENABLED=true` in the VPS environment file.

**CAUTION**: Even after the Node service is running, the static-preview
catalog form is configured with `staticPreview=true` and intentionally cannot
send real leads. The production frontend must be built/deployed separately
after a reviewed release gate. Do not flip this flag just to make buttons work.

The static preview `deploy/nutra-update-preview.sh` only updates HTML/assets;
it does not start, stop or deploy the Node order API.
