#!/usr/bin/env bash
# =============================================================================
#  Moja Zdravica — prebacivanje sajta sa lamena.io/nutra na https://zdravica.rs
#
#  Pokreće se JEDNOM na lamena.io serveru (kao root):
#      curl -fsSL https://raw.githubusercontent.com/agency-adstema/Nutra/main/deploy/setup-zdravica.sh -o setup-zdravica.sh
#      sudo bash setup-zdravica.sh
#  Ponovno pokretanje je bezbedno (ništa se ne duplira).
#
#  Šta radi:
#   1. proveri da zdravica.rs (DNS) pokazuje na ovaj server
#   2. napravi nginx sajt za zdravica.rs (www → bez www, http → https),
#      root je postojeći folder /var/www/nutra-preview
#   3. izda besplatan SSL (Let's Encrypt) i podesi automatsko obnavljanje
#   4. poveže formu za porudžbine (servis nutra-orders) na https://zdravica.rs/api/order/
#      i admin stranicu za slanje baze (servis nutra-bulk) na https://zdravica.rs/api/
#   5. zameni automatski updater (sada prima build za zdravica.rs, bez noindex)
#   6. lamena.io/nutra/... → 301 na zdravica.rs/... (i lamena.io/nutra/api/ → zdravica.rs/api/)
#   7. proveri da sve odgovara
#  Pre svake izmene nginx-a pravi rezervnu kopiju; ako `nginx -t` padne, vraća staru.
# =============================================================================
set -Eeuo pipefail

DOMAIN="zdravica.rs"
WWW="www.zdravica.rs"
SITE_DIR="/var/www/nutra-preview"
ACME_DIR="/var/www/letsencrypt"
VHOST="/etc/nginx/sites-available/zdravica.rs"
API_SNIPPET="/etc/nginx/snippets/order-api-zdravica.rs.conf"
BULK_SNIPPET="/etc/nginx/snippets/bulk-admin-zdravica.rs.conf"
BULK_PORT="8790"
ENV_FILE="/etc/nutra/backend.env"
UPDATER="/usr/local/sbin/nutra-update-preview"
RAW="${NUTRA_RAW:-https://raw.githubusercontent.com/agency-adstema/Nutra/main}"
API_PORT="4376"
TS="$(date +%Y%m%d%H%M%S)"
SELF_CERT="/etc/ssl/zdravica-selfsigned.crt"
SELF_KEY="/etc/ssl/zdravica-selfsigned.key"
LE_CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
LE_KEY="/etc/letsencrypt/live/$DOMAIN/privkey.pem"

say()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32mOK\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mGREŠKA: %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Pokreni kao root: sudo bash $0"
for t in nginx curl openssl python3 getent; do command -v "$t" >/dev/null || die "Nedostaje program: $t"; done
[[ -s "$SITE_DIR/index.html" ]] || die "Nema sajta u $SITE_DIR (prvo mora da radi lamena.io/nutra)."

# --- 1. DNS ------------------------------------------------------------------------------
say "1/7 Proveravam DNS za $DOMAIN"
server_ips=" $(hostname -I 2>/dev/null) $(curl -4 -s -m 6 https://api.ipify.org 2>/dev/null || true) "
dns_ip="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"
www_ip="$(getent ahostsv4 "$WWW" 2>/dev/null | awk 'NR==1{print $1}' || true)"
echo "    server: $server_ips"
echo "    $DOMAIN → ${dns_ip:-nema A zapisa}   $WWW → ${www_ip:-nema zapisa}"
[[ -n "$dns_ip" ]] || die "$DOMAIN još nema A zapis. U DNS-u dodaj: A  @  → IP ovog servera (gore), pa pokreni ponovo."
behind_cf=0
if [[ "$server_ips" == *" $dns_ip "* ]]; then
  ok "$DOMAIN pokazuje direktno na ovaj server"
elif curl -sL -m 8 "http://$DOMAIN/cdn-cgi/trace" 2>/dev/null | grep -q '^fl='; then
  behind_cf=1
  ok "$DOMAIN ide preko Cloudflare proxy-ja (narandžasti oblačić)"
else
  warn "$DOMAIN pokazuje na $dns_ip, a to nije ovaj server."
  read -r -p "Ipak nastavi? [d/N] " ans; [[ "$ans" =~ ^[dDyY]$ ]] || die "Ispravi A zapis za $DOMAIN pa pokreni ponovo."
fi
names=("$DOMAIN"); [[ -n "$www_ip" ]] && names+=("$WWW") || warn "$WWW nema DNS zapis — dodaj CNAME www → $DOMAIN (radiće posle ponovnog pokretanja)."

# Da li neki drugi nginx fajl već koristi zdravica.rs?
others="$(grep -RlsE "server_name[^;]*[[:space:]]$(sed 's/\./\\./g' <<<"$DOMAIN")([[:space:];]|$)" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | xargs -r readlink -f | grep -vx "$VHOST" || true)"
if [[ -n "$others" ]]; then
  warn "$DOMAIN se već pominje u: $others"
  read -r -p "To može da napravi konflikt. Nastavi? [d/N] " ans; [[ "$ans" =~ ^[dDyY]$ ]] || die "Prekinuto."
fi

# --- 2. nginx sajt (prvo sa privremenim sertifikatom, da bi Let's Encrypt mogao da proveri domen) -------
say "2/7 Pravim nginx sajt za $DOMAIN"
install -d -m 755 "$ACME_DIR/.well-known/acme-challenge" /etc/nginx/snippets
if [[ ! -s "$SELF_CERT" ]]; then
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout "$SELF_KEY" -out "$SELF_CERT" \
    -subj "/CN=$DOMAIN" -addext "subjectAltName=DNS:$DOMAIN,DNS:$WWW" >/dev/null 2>&1
  chmod 600 "$SELF_KEY"
fi

# API za porudžbine na korenu domena (isti sadržaj koji pravi deploy/install-order-api.sh zdravica.rs)
have_api=0
if systemctl list-unit-files nutra-orders.service 2>/dev/null | grep -q nutra-orders; then
  have_api=1
  cat > "$API_SNIPPET" <<EOF
# Moja Zdravica — API za porudžbine. Ubaci u HTTPS server { } blok za $DOMAIN:
#     include $API_SNIPPET;
location = /api/order {
    return 308 /api/order/;
}
location = /api/order/ {
    limit_except POST OPTIONS { deny all; }
    client_max_body_size 12k;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_pass http://127.0.0.1:$API_PORT/api/order/;
    proxy_connect_timeout 5s;
    proxy_read_timeout 30s;
    add_header Cache-Control "no-store" always;
}
EOF
  ok "API deo: $API_SNIPPET"
else
  warn "Servis nutra-orders nije instaliran — forma neće slati porudžbine dok ne pokreneš: sudo bash install-order-api.sh $DOMAIN"
fi

# Admin stranica za slanje baze (lozinka) na https://zdravica.rs/api/.
# /api/order/ ostaje forma za porudžbine (tačno poklapanje u nginx-u ima prednost).
have_bulk=0
if systemctl list-unit-files nutra-bulk.service 2>/dev/null | grep -q nutra-bulk; then
  have_bulk=1
  cat > "$BULK_SNIPPET" <<EOF
# Moja Zdravica — admin stranica za slanje baze na MonadLead (servis nutra-bulk, BULK_BASE=/api).
location = /api {
    return 308 /api/;
}
location ^~ /api/ {
    proxy_pass http://127.0.0.1:$BULK_PORT;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Real-IP \$remote_addr;
    client_max_body_size 25m;
    proxy_read_timeout 120s;
    add_header X-Robots-Tag "noindex, nofollow" always;
}
EOF
  ok "Admin deo: $BULK_SNIPPET"
fi

ipv6=0; grep -RqsE 'listen[[:space:]]+\[::\]' /etc/nginx/sites-enabled /etc/nginx/conf.d && ipv6=1
nginx_ver="$(nginx -v 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
if [[ "$(printf '%s\n1.25.1\n' "$nginx_ver" | sort -V | head -1)" == "1.25.1" ]]; then
  listen443="listen 443 ssl;"; listen443v6="listen [::]:443 ssl;"; h2="http2 on;"
elif grep -RlsE 'listen[^;]*443[^;]*http2' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | xargs -r readlink -f | grep -qvx "$VHOST"; then
  # stariji nginx: http2 mora da bude isti kao kod ostalih sajtova na portu 443
  listen443="listen 443 ssl http2;"; listen443v6="listen [::]:443 ssl http2;"; h2=""
else
  listen443="listen 443 ssl;"; listen443v6="listen [::]:443 ssl;"; h2=""
fi

write_vhost() {  # $1 = cert, $2 = key
  local cert="$1" key="$2" v6_80="" v6_443="" api_inc="" bulk_inc=""
  [[ $ipv6 -eq 1 ]] && { v6_80="listen [::]:80;"; v6_443="$listen443v6"; }
  [[ $have_api -eq 1 ]] && api_inc="include $API_SNIPPET;"
  [[ $have_bulk -eq 1 ]] && bulk_inc="include $BULK_SNIPPET;"
  cat > "$VHOST" <<EOF
# Moja Zdravica — https://$DOMAIN (napravio deploy/setup-zdravica.sh, $TS)
# Sadržaj sajta: $SITE_DIR (automatski se ažurira iz grane gh-pages, $UPDATER)

server {
    listen 80;
    $v6_80
    server_name $DOMAIN $WWW;
    location ^~ /.well-known/acme-challenge/ { root $ACME_DIR; default_type text/plain; }
    location / { return 301 https://$DOMAIN\$request_uri; }
}

server {
    $listen443
    $v6_443
    $h2
    server_name $WWW;
    ssl_certificate     $cert;
    ssl_certificate_key $key;
    location ^~ /.well-known/acme-challenge/ { root $ACME_DIR; default_type text/plain; }
    location / { return 301 https://$DOMAIN\$request_uri; }
}

server {
    $listen443
    $v6_443
    $h2
    server_name $DOMAIN;
    ssl_certificate     $cert;
    ssl_certificate_key $key;

    root  $SITE_DIR;
    index index.html;
    charset utf-8;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    gzip on;
    gzip_vary on;
    gzip_types text/css application/javascript application/json image/svg+xml application/xml text/xml text/plain;

    location ^~ /.well-known/acme-challenge/ { root $ACME_DIR; default_type text/plain; }

    $api_inc
    $bulk_inc

    # fajlovi sa hešom u imenu se nikad ne menjaju
    location ^~ /assets/ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files \$uri =404;
    }
    location ~* \.(?:webp|avif|jpe?g|png|svg|ico|mp4|woff2)\$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
        try_files \$uri =404;
    }
    # skriveni fajlovi (.git, .nutra-deployed-commit…)
    location ~ /\.(?!well-known/) { deny all; }

    location / {
        try_files \$uri \$uri/ =404;
    }
    error_page 404 /404.html;
}
EOF
}

enable_vhost() {
  if [[ -d /etc/nginx/sites-enabled ]]; then
    ln -sfn "$VHOST" /etc/nginx/sites-enabled/zdravica.rs
  else
    ln -sfn "$VHOST" /etc/nginx/conf.d/zdravica.rs.conf
  fi
}

[[ -f "$VHOST" ]] && cp -a "$VHOST" "/root/nginx-zdravica.rs-$TS.bak"
if [[ -s "$LE_CERT" ]]; then write_vhost "$LE_CERT" "$LE_KEY"; else write_vhost "$SELF_CERT" "$SELF_KEY"; fi
enable_vhost
if nginx -t 2>/tmp/zdravica-nginx-test.log; then
  systemctl reload nginx; ok "nginx: $VHOST"
else
  cat /tmp/zdravica-nginx-test.log
  rm -f /etc/nginx/sites-enabled/zdravica.rs /etc/nginx/conf.d/zdravica.rs.conf
  [[ -f "/root/nginx-zdravica.rs-$TS.bak" ]] && cp -a "/root/nginx-zdravica.rs-$TS.bak" "$VHOST"
  die "nginx provera nije prošla — ništa nije promenjeno."
fi

# --- 3. SSL (Let's Encrypt) ----------------------------------------------------------------------
say "3/7 SSL sertifikat"
if ! command -v certbot >/dev/null; then
  command -v apt-get >/dev/null || die "Nema certbot-a ni apt-get-a. Instaliraj certbot pa pokreni ponovo."
  apt-get update -qq && apt-get install -y -qq certbot >/dev/null
fi
cb_args=(); for n in "${names[@]}"; do cb_args+=(-d "$n"); done
if certbot certonly --webroot -w "$ACME_DIR" "${cb_args[@]}" --cert-name "$DOMAIN" --expand \
     --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring \
     --deploy-hook "systemctl reload nginx"; then
  write_vhost "$LE_CERT" "$LE_KEY"
  if nginx -t 2>/dev/null; then systemctl reload nginx; ok "Let's Encrypt sertifikat aktivan (obnavlja se automatski)"
  else write_vhost "$SELF_CERT" "$SELF_KEY"; nginx -t && systemctl reload nginx; warn "Sertifikat izdat, ali nginx ga nije prihvatio — ostaje privremeni."; fi
else
  if [[ $behind_cf -eq 1 ]]; then
    warn "Let's Encrypt nije uspeo. Sajt radi preko Cloudflare-a ako je SSL/TLS režim „Full“ (ne „Full (strict)“)."
  else
    warn "Let's Encrypt nije uspeo (proveri da port 80 nije blokiran i da DNS pokazuje ovde). Pokreni skriptu ponovo kasnije."
  fi
fi

# --- 4. API za porudžbine: adresa sajta i dozvoljeni domeni ---------------------------------------
say "4/7 API za porudžbine"
if [[ -f "$ENV_FILE" ]]; then
  cp -a "$ENV_FILE" "/root/backend.env-$TS.bak"
  if grep -q '^SITE_URL=' "$ENV_FILE"; then sed -i "s#^SITE_URL=.*#SITE_URL=https://$DOMAIN#" "$ENV_FILE"
  else printf 'SITE_URL=https://%s\n' "$DOMAIN" >> "$ENV_FILE"; fi
  if grep -q '^ALLOWED_ORIGINS=' "$ENV_FILE"; then
    grep -q "^ALLOWED_ORIGINS=.*https://$DOMAIN" "$ENV_FILE" || sed -i "s#^ALLOWED_ORIGINS=\(.*\)#ALLOWED_ORIGINS=\1,https://$DOMAIN,https://$WWW#" "$ENV_FILE"
  else
    printf 'ALLOWED_ORIGINS=https://%s,https://%s,https://lamena.io\n' "$DOMAIN" "$WWW" >> "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"; chown root:root "$ENV_FILE"
  if systemctl restart nutra-orders; then ok "nutra-orders: SITE_URL=https://$DOMAIN (ORDER_MODE nije menjan)"
  else warn "nutra-orders se nije restartovao — proveri: journalctl -u nutra-orders -n 40"; fi
else
  warn "$ENV_FILE ne postoji — preskačem (API nije instaliran)."
fi

if [[ $have_bulk -eq 1 ]]; then
  install -d /etc/systemd/system/nutra-bulk.service.d
  printf '# Admin stranica je na https://%s/api/ (deploy/setup-zdravica.sh)\n[Service]\nEnvironment=BULK_BASE=/api\n' "$DOMAIN" \
    > /etc/systemd/system/nutra-bulk.service.d/zdravica.conf
  systemctl daemon-reload
  if systemctl restart nutra-bulk; then ok "nutra-bulk: admin stranica je sada na https://$DOMAIN/api/ (lozinka ista)"
  else warn "nutra-bulk se nije restartovao — proveri: journalctl -u nutra-bulk -n 40"; fi
fi

# --- 5. Updater sajta (prima build za zdravica.rs) ------------------------------------------------
say "5/7 Automatsko ažuriranje sajta"
tmp_upd="$(mktemp)"
curl -fsSL "$RAW/deploy/nutra-update-preview.sh" -o "$tmp_upd" || die "Ne mogu da preuzmem novi updater sa GitHub-a."
grep -q 'zdravica.rs' "$tmp_upd" || die "Preuzeti updater nije nova verzija — pokušaj ponovo za par minuta."
[[ -f "$UPDATER" ]] && cp -a "$UPDATER" "/root/nutra-update-preview-$TS.bak"
install -m 755 "$tmp_upd" "$UPDATER"; rm -f "$tmp_upd"
upd_args=(); [[ -f /etc/cron.d/nutra-preview-updates ]] || upd_args=(--install)
"$UPDATER" "${upd_args[@]}" || warn "Updater nije preuzeo novi build (vidi poruku iznad). Ako GitHub još pravi build za zdravica.rs, sledeći pokušaj je automatski za 5 minuta."
ok "Cron: /etc/cron.d/nutra-preview-updates, log: /var/log/nutra-preview-updates.log"

# --- 6. lamena.io/nutra → zdravica.rs -------------------------------------------------------------
say "6/7 Preusmeravanje lamena.io/nutra → https://$DOMAIN"
lamena_vhost="$(grep -RlsE 'location[[:space:]]+\^~[[:space:]]+/nutra/[[:space:]]*\{' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -1 || true)"
if [[ -z "$lamena_vhost" ]]; then
  warn "Nisam našao blok „location ^~ /nutra/“ — preskačem (možda je već preusmeren ili uklonjen)."
else
  lamena_vhost="$(readlink -f "$lamena_vhost")"
  cp -a "$lamena_vhost" "/root/nginx-$(basename "$lamena_vhost")-$TS.bak"
  python3 - "$lamena_vhost" "$DOMAIN" "$have_bulk" <<'PY'
import re, sys
path, domain, bulk = sys.argv[1], sys.argv[2], sys.argv[3] == '1'
s = open(path).read()

def replace_blocks(s, header, body):
    out, pos, n = [], 0, 0
    for m in re.finditer(header, s):
        if m.start() < pos:
            continue
        i = s.index('{', m.start())
        depth, k = 0, i
        while k < len(s):
            if s[k] == '{': depth += 1
            elif s[k] == '}':
                depth -= 1
                if depth == 0: break
            k += 1
        line_start = s.rfind('\n', 0, m.start()) + 1
        indent = re.match(r'[ \t]*', s[line_start:m.start()]).group(0)
        out.append(s[pos:m.start()])
        out.append(body.replace('\n', '\n' + indent))
        pos, n = k + 1, n + 1
    out.append(s[pos:])
    return ''.join(out), n

s, a = replace_blocks(s, r'location\s+=\s+/nutra\s*\{',
    'location = /nutra {\n    return 301 https://%s/;\n}' % domain)
s, b = replace_blocks(s, r'location\s+\^~\s+/nutra/\s*\{',
    'location ^~ /nutra/ {\n    # Sajt je preseljen na https://%s (deploy/setup-zdravica.sh).\n'
    '    rewrite ^/nutra/(.*)$ https://%s/$1 permanent;\n}' % (domain, domain))
c = d = 0
if bulk:
    s, c = replace_blocks(s, r'location\s+=\s+/nutra/api\s*\{',
        'location = /nutra/api {\n    return 301 https://%s/api/;\n}' % domain)
    s, d = replace_blocks(s, r'location\s+\^~\s+/nutra/api/\s*\{',
        'location ^~ /nutra/api/ {\n    # Admin stranica je preseljena na https://%s/api/ (deploy/setup-zdravica.sh)\n'
        '    rewrite ^/nutra/api/(.*)$ https://%s/api/$1 permanent;\n}' % (domain, domain))
open(path, 'w').write(s)
print(f"    zamenjeno blokova: /nutra = {a}, /nutra/ = {b}, /nutra/api = {c}, /nutra/api/ = {d}")
PY
  if nginx -t 2>/tmp/zdravica-nginx-test.log; then
    systemctl reload nginx; ok "lamena.io/nutra/… → https://$DOMAIN/… (rezervna kopija u /root)"
  else
    cat /tmp/zdravica-nginx-test.log
    cp -a "/root/nginx-$(basename "$lamena_vhost")-$TS.bak" "$lamena_vhost"; nginx -t && systemctl reload nginx
    warn "nginx nije prihvatio preusmeravanje — vratio sam staru konfiguraciju lamena.io."
  fi
fi

# --- 7. Provera -------------------------------------------------------------------------------------
say "7/7 Provera"
sleep 2  # nginx reload se završava u pozadini
chk() { curl -sk -o /dev/null -m 10 --resolve "$1:443:127.0.0.1" -w '%{http_code} %{redirect_url}' "https://$1$2" || echo "greška"; }
echo "    https://$DOMAIN/            → $(chk "$DOMAIN" /)"
echo "    https://$DOMAIN/robots.txt  → $(chk "$DOMAIN" /robots.txt)"
echo "    https://$DOMAIN/sitemap.xml → $(chk "$DOMAIN" /sitemap.xml)"
echo "    https://$WWW/              → $(chk "$WWW" /)"
[[ $have_api -eq 1 ]] && echo "    https://$DOMAIN/api/order/  → $(chk "$DOMAIN" /api/order/)   (očekivano 403/405 za GET)"
[[ $have_bulk -eq 1 ]] && echo "    https://$DOMAIN/api/        → $(chk "$DOMAIN" /api/)   (očekivano 401 — traži lozinku)"
echo "    https://lamena.io/nutra/vodici/ → $(chk lamena.io /nutra/vodici/)"
[[ $have_bulk -eq 1 ]] && echo "    https://lamena.io/nutra/api/ → $(chk lamena.io /nutra/api/)"
if grep -q 'https://zdravica.rs/' "$SITE_DIR/index.html"; then
  ok "Na serveru je build za zdravica.rs"
else
  warn "Na serveru je još stari build. Novi stiže automatski (GitHub Actions → gh-pages → cron za ≤5 min)."
fi

cat <<EOF

Gotovo. Sledeći koraci:
  • Otvori https://$DOMAIN na telefonu i računaru.
  • Admin za slanje baze: https://$DOMAIN/api/ (ista lozinka kao ranije).
  • Google Search Console: dodaj domen $DOMAIN i pošalji https://$DOMAIN/sitemap.xml
  • Za kontakt e-mail kontakt@$DOMAIN podesi prosleđivanje (npr. Cloudflare Email Routing).
Rezervne kopije nginx-a i podešavanja su u /root (*-$TS.bak).
EOF
