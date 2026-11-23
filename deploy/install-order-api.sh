#!/usr/bin/env bash
# =============================================================================
#  Moja Zdravica — API za porudžbine (MonadLead)
#
#  Pokreće se NA SERVERU (kao root). Prvi argument je domen, drugi putanja sajta:
#      curl -fsSL https://raw.githubusercontent.com/agency-adstema/Nutra/main/deploy/install-order-api.sh -o install.sh
#      sudo bash install.sh lamena.io /nutra     # API: https://lamena.io/nutra/api/order/
#      sudo bash install.sh zdravica.rs          # API: https://zdravica.rs/api/order/
#  Ponovno pokretanje = ažuriranje na najnoviji kod (ključ i režim ostaju).
#
#  Šta radi:
#   1. proveri Node.js 22 (ponudi instalaciju ako ga nema)
#   2. skine/ažurira kod (grana main) u /opt/nutra-backend i napravi Node server
#   3. napravi /etc/nutra/backend.env — PITA te za MonadLead API ključ (ne ispisuje ga)
#   4. pokrene servis „nutra-orders“ na 127.0.0.1:4376
#   5. napravi nginx deo /etc/nginx/snippets/order-api-<domen>.conf
#   6. proveri da API odgovara
#
#  Podrazumevano je TEST REŽIM: porudžbine se proveravaju, ali NE šalju u MonadLead.
#  Uključivanje pravih porudžbina: u /etc/nutra/backend.env stavi ORDER_MODE=live,
#  pa: systemctl restart nutra-orders
# =============================================================================
set -Eeuo pipefail

REPO="https://github.com/agency-adstema/Nutra.git"
APP_DIR="/opt/nutra-backend"
ENV_DIR="/etc/nutra"
ENV_FILE="$ENV_DIR/backend.env"
SERVICE="nutra-orders"
PORT="4376"
API_DOMAIN="${1:-${API_DOMAIN:-zdravica.rs}}"
API_PATH="${2:-${API_PATH:-}}"; API_PATH="${API_PATH%/}"   # npr. /nutra
[[ -z "$API_PATH" || "$API_PATH" =~ ^/[a-z0-9/_-]+$ ]] || { echo "Neispravna putanja: $API_PATH"; exit 1; }
API_URL="https://$API_DOMAIN$API_PATH/api/order/"
SNIPPET="/etc/nginx/snippets/order-api-$API_DOMAIN.conf"

say()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mGREŠKA: %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Pokreni kao root: sudo bash $0"
for t in git curl openssl systemctl; do command -v "$t" >/dev/null || die "Nedostaje program: $t (apt install $t)"; done

# --- 1. Node.js 22 ------------------------------------------------------------
say "Proveravam Node.js"
need_node=1
if command -v node >/dev/null; then
  major=$(node -p 'process.versions.node.split(".")[0]')
  [[ "$major" -ge 22 ]] && need_node=0
  echo "Pronađen Node $(node -v)"
fi
if [[ $need_node -eq 1 ]]; then
  read -r -p "Treba Node.js 22. Da ga instaliram sada (NodeSource, apt)? [d/N] " ans
  [[ "$ans" =~ ^[dDyY]$ ]] || die "Instaliraj Node.js 22 pa ponovo pokreni skriptu."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
NODE_BIN="$(command -v node)"

# --- 2. Kod i build -------------------------------------------------------------
say "Preuzimam kod u $APP_DIR"
id -u nutra-orders >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin nutra-orders
if [[ -d "$APP_DIR/.git" ]]; then
  git -c safe.directory="$APP_DIR" -C "$APP_DIR" fetch --depth 1 origin main
  git -c safe.directory="$APP_DIR" -C "$APP_DIR" reset --hard origin/main
else
  rm -rf "$APP_DIR"
  git clone --depth 1 --branch main "$REPO" "$APP_DIR"
fi
chown -R nutra-orders:nutra-orders "$APP_DIR"

say "Instaliram pakete i pravim server (2–4 min)"
cd "$APP_DIR"
runuser -u nutra-orders -- env HOME="$APP_DIR" npm ci --no-audit --no-fund
runuser -u nutra-orders -- env HOME="$APP_DIR" npm test
runuser -u nutra-orders -- env HOME="$APP_DIR" DEPLOY_TARGET=node SITE_URL="https://$API_DOMAIN" PUBLIC_SITE_ENV=staging PUBLIC_MARKET=RS npm run build
[[ -s "$APP_DIR/dist/server/entry.mjs" ]] || die "Build nije napravio dist/server/entry.mjs"

# --- 3. Podešavanja i API ključ ------------------------------------------------------
install -d -o root -g root -m 700 "$ENV_DIR"
if [[ ! -f "$ENV_FILE" ]]; then
  say "Pravim $ENV_FILE"
  read -r -s -p "Nalepi MonadLead API ključ (neće se videti dok kucaš) i pritisni Enter: " API_KEY; echo
  [[ -n "$API_KEY" ]] || die "API ključ je prazan."
  umask 077
  cat > "$ENV_FILE" <<EOF
# Moja Zdravica — API za porudžbine. Samo root sme da čita ovaj fajl.
# test = porudžbine se NE šalju u MonadLead; live = šalju se.
ORDER_MODE=test
CATALOG_ORDERS_ENABLED=true
MONADLEAD_API_KEY_CATALOG=$API_KEY
ORDER_HASH_SALT=$(openssl rand -hex 32)
ALLOWED_ORIGINS=https://lamena.io,https://zdravica.rs,https://www.zdravica.rs
EOF
  unset API_KEY
else
  say "$ENV_FILE već postoji — ne diram ga (ključ i režim ostaju isti)"
fi
chown root:root "$ENV_FILE"; chmod 600 "$ENV_FILE"

# --- 4. Servis ------------------------------------------------------------------------
say "Pokrećem servis $SERVICE"
cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Moja Zdravica — API za porudžbine (MonadLead)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=nutra-orders
Group=nutra-orders
WorkingDirectory=$APP_DIR
Environment=HOST=127.0.0.1
Environment=PORT=$PORT
Environment=NODE_ENV=production
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $APP_DIR/dist/server/entry.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"
sleep 3
systemctl is-active --quiet "$SERVICE" || { journalctl -u "$SERVICE" -n 40 --no-pager; die "Servis se nije pokrenuo."; }

code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/order/")
[[ "$code" == "405" ]] && echo "OK: API radi lokalno (GET → 405, prima samo POST)" || warn "Lokalni GET vratio $code (očekivano 405)"

# --- 5. nginx -------------------------------------------------------------------------
say "nginx"
if command -v nginx >/dev/null; then
  install -d /etc/nginx/snippets
  cat > "$SNIPPET" <<EOF
# Moja Zdravica — API za porudžbine. Ubaci u HTTPS server {} blok za $API_DOMAIN:
#     include $SNIPPET;
location = $API_PATH/api/order {
    return 308 $API_PATH/api/order/;
}
location = $API_PATH/api/order/ {
    limit_except POST OPTIONS { deny all; }
    client_max_body_size 12k;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_pass http://127.0.0.1:$PORT/api/order/;
    proxy_connect_timeout 5s;
    proxy_read_timeout 30s;
    add_header Cache-Control "no-store" always;
}
EOF
  # -R prati symlinkove (sites-enabled → sites-available)
  vhost=""
  [[ -n "$API_PATH" ]] && vhost=$(grep -RlE "location \\^~ $API_PATH/" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -1 || true)
  [[ -z "$vhost" ]] && vhost=$(grep -RlE "server_name[^;]*${API_DOMAIN//./\\.}" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -1 || true)
  if [[ -n "$vhost" ]] && grep -q "$SNIPPET" "$vhost"; then
    echo "Snippet je već uključen u $vhost"
    nginx -t && systemctl reload nginx
  elif [[ -n "$vhost" ]]; then
    backup="/root/nginx-$(basename "$vhost")-$(date +%Y%m%d%H%M%S).bak"
    cp -L "$vhost" "$backup"
    if [[ -n "$API_PATH" ]] && grep -qE "location \^~ $API_PATH/" "$vhost"; then
      # odmah ispred postojeće statičke lokacije sajta (isti server blok)
      sed --follow-symlinks -i "s#^\(\s*\)location \^~ $API_PATH/ {#\1include $SNIPPET;\n\1location ^~ $API_PATH/ {#" "$vhost"
    else
      # posle server_name reda za ovaj domen
      sed --follow-symlinks -i "/server_name[^;]*${API_DOMAIN//./\\.}/a\    include $SNIPPET;" "$vhost"
    fi
    if nginx -t 2>/dev/null; then
      systemctl reload nginx
      echo "Snippet uključen u $vhost (rezervna kopija: $backup)"
    else
      cp "$backup" "$(readlink -f "$vhost")"
      nginx -t || true
      warn "nginx provera nije prošla — vratio sam staru konfiguraciju. Ručno dodaj u HTTPS server { } blok:"
      echo "       include $SNIPPET;"
    fi
  else
    warn "Nisam našao nginx fajl za $API_DOMAIN. U njegov HTTPS server { } blok dodaj red:"
    echo "       include $SNIPPET;"
    echo "   pa pokreni:  nginx -t && systemctl reload nginx"
  fi
else
  warn "nginx nije pronađen — API sluša samo lokalno na 127.0.0.1:$PORT"
fi

# --- 6. Provera spolja -----------------------------------------------------------------------
say "Provera preko $API_URL"
pre=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H "Origin: https://lamena.io" \
  -H "Access-Control-Request-Method: POST" "$API_URL" || true)
post=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Origin: https://lamena.io" \
  -H "Content-Type: application/json" -d '{}' "$API_URL" || true)
direct=$(curl -s -o /dev/null -w '%{http_code}' --resolve "$API_DOMAIN:443:127.0.0.1" -X POST -H "Origin: https://lamena.io" \
  -H "Content-Type: application/json" -d '{}' "$API_URL" || true)
echo "POST direktno na nginx (bez Cloudflare) → $direct (očekivano 400)"
echo "OPTIONS sa lamena.io → $pre (očekivano 204)"
echo "POST prazan zahtev    → $post (očekivano 400, bez slanja porudžbine)"
if [[ "$direct" == "400" && "$post" == "403" ]]; then
  warn "Server radi (400 direktno). 403 spolja daje Cloudflare zaštita za curl sa servera —"
  echo "   to je u redu, iz pregledača (sa sajta) porudžbine prolaze. Probaj porudžbinu na sajtu."
fi
if [[ "$post" == "405" ]]; then
  warn "POST vraća 405: ispred servera je verovatno Cloudflare Worker za $API_DOMAIN$API_PATH* (samo GET)."
  echo "   U Cloudflare → Workers Routes dodaj rutu  $API_DOMAIN$API_PATH/api/*  sa Worker: None,"
  echo "   da porudžbine idu direktno na ovaj server. Zatim ponovo pokreni ovu skriptu."
fi

mode=$(grep -E '^ORDER_MODE=' "$ENV_FILE" | cut -d= -f2)
say "Gotovo. Režim: ${mode:-test}"
echo "Logovi:            journalctl -u $SERVICE -f"
echo "Prave porudžbine:  u $ENV_FILE promeni ORDER_MODE=live, pa: systemctl restart $SERVICE"
echo "Ažuriranje koda:   ponovo pokreni ovu skriptu"
