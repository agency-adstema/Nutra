#!/usr/bin/env bash
# Instalira /nutra/api (slanje baze na MonadLead) na lamena.io VPS.
#   sudo bash <(curl -fsSL https://raw.githubusercontent.com/agency-adstema/Nutra/bulk-orders-api/deploy/bulk-orders/install.sh)
# Pita lozinku za stranicu i MonadLead ključ (ne prikazuju se na ekranu). Može da se pokrene ponovo – samo ažurira.
set -euo pipefail

BRANCH="${BRANCH:-bulk-orders-api}"
REPO="https://github.com/agency-adstema/Nutra"
APP_DIR=/opt/nutra-bulk
ENV_FILE=/etc/nutra/bulk.env
SVC=nutra-bulk
PORT=8790

[ "$(id -u)" = 0 ] || { echo "Pokreni sa sudo."; exit 1; }
say(){ printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

say "Paketi (python3, openpyxl, git)"
if command -v apt-get >/dev/null; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3 python3-openpyxl git curl >/dev/null
else
  command -v python3 >/dev/null || { echo "Nema python3"; exit 1; }
  python3 -c 'import openpyxl' 2>/dev/null || pip3 install -q openpyxl
fi
python3 -c 'import openpyxl, zoneinfo' || { echo "Python mora biti 3.9+ sa openpyxl"; exit 1; }

say "Kod sa grane $BRANCH"
TMP=$(mktemp -d)
git clone -q --depth 1 -b "$BRANCH" "$REPO" "$TMP/src"
id nutra-orders >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin nutra-orders
install -d -o root -g root -m 755 "$APP_DIR"
install -o root -g root -m 644 "$TMP/src/tools/bulk-orders/app.py" "$TMP/src/tools/bulk-orders/posalji_ordere.py" "$APP_DIR/"
install -o root -g root -m 644 "$TMP/src/deploy/bulk-orders/nutra-bulk.service" /etc/systemd/system/$SVC.service

say "Tajne ($ENV_FILE)"
install -d -o root -g root -m 700 /etc/nutra
if [ -f "$ENV_FILE" ] && grep -q '^BULK_ADMIN_PASSWORD=.\+' "$ENV_FILE"; then
  echo "Već postoji – ostavljam ga (obriši $ENV_FILE ako hoćeš nove vrednosti)."
else
  read -rp  "Korisničko ime za stranicu [admin]: " U; U=${U:-admin}
  while :; do
    read -rsp "Lozinka za stranicu (min 10 znakova): " P; echo
    [ ${#P} -ge 10 ] && break; echo "Prekratka."
  done
  HAVE_KEY=""
  [ -f /etc/nutra/backend.env ] && grep -q '^MONADLEAD_API_KEY_CATALOG=.\+' /etc/nutra/backend.env && HAVE_KEY=1
  if [ -n "$HAVE_KEY" ]; then
    echo "MONADLEAD_API_KEY_CATALOG već postoji u /etc/nutra/backend.env – koristiću njega."; K=""
  else
    read -rsp "MonadLead API ključ (nalog za katalog, offeri 134/135/119/114): " K; echo
    [ -n "$K" ] || { echo "Ključ je obavezan."; exit 1; }
  fi
  umask 077
  { echo "BULK_ADMIN_USER=$U"; echo "BULK_ADMIN_PASSWORD=$P"; [ -n "$K" ] && echo "MONADLEAD_API_KEY_CATALOG=$K"; } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"; unset P K
fi

say "Servis $SVC"
systemctl daemon-reload
systemctl enable -q $SVC
systemctl restart $SVC
sleep 2
systemctl is-active --quiet $SVC || { journalctl -u $SVC -n 30 --no-pager; echo "Servis nije pokrenut."; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/nutra/api/)
[ "$code" = 401 ] && echo "Servis radi (traži lozinku – OK)." || echo "Upozorenje: lokalni test vratio $code"

say "Nginx"
VHOST="${VHOST:-}"
if [ -z "$VHOST" ]; then
  # tačno "lamena.io" (ne admin.lamena.io); prednost ima fajl koji već služi /nutra/
  CANDS=$(grep -lE 'server_name[^;]*[[:space:]]lamena\.io([[:space:];]|$)' /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf 2>/dev/null || true)
  for f in $CANDS; do grep -q '/nutra' "$f" && { VHOST=$f; break; }; done
  [ -z "$VHOST" ] && VHOST=$(echo "$CANDS" | head -1)
fi
if [ -z "$VHOST" ]; then
  echo "Nisam našao nginx vhost za lamena.io. Pokreni ponovo sa: VHOST=/etc/nginx/sites-available/<fajl> bash $0"; exit 1
fi
VHOST=$(readlink -f "$VHOST"); echo "vhost: $VHOST"
if grep -q 'location \^~ /nutra/api/' "$VHOST"; then
  echo "Blok za /nutra/api već postoji."
else
  cp -a "$VHOST" "$VHOST.bak.$(date +%Y%m%d%H%M%S)"
  python3 - "$VHOST" "$TMP/src/deploy/bulk-orders/nginx-nutra-api.conf" <<'PY'
import re, sys
vh, snip = sys.argv[1], open(sys.argv[2]).read()
s = open(vh).read()
block = '\n'.join('    ' + l if l.strip() else l for l in snip.splitlines() if not l.startswith('#')) + '\n'
# ubaci ispred postojećeg /nutra/ bloka u HTTPS (listen 443) server bloku, inače ispred prvog "location /"
m = None
for sm in re.finditer(r'(^|\n)[ \t]*server\s*\{', s):
    i = s.index('{', sm.start()) + 1; depth = 1
    while depth and i < len(s):
        depth += {'{': 1, '}': -1}.get(s[i], 0); i += 1
    seg = s[sm.start():i]
    if re.search(r'listen[^;]*443', seg) or 'ssl_certificate' in seg:
        mm = re.search(r'\n[ \t]*location\s+(=\s*)?/nutra\b|\n[ \t]*location\s+/\s*\{', seg)
        if mm:
            m = sm.start() + mm.start(); break
if m is None:
    sys.exit('Ne mogu da nađem gde da ubacim blok.')
open(vh, 'w').write(s[:m] + '\n' + block + s[m:])
PY
  if nginx -t 2>/dev/null; then systemctl reload nginx; echo "Nginx ažuriran."
  else
    echo "nginx -t nije prošao – vraćam staru konfiguraciju."; cp -a "$(ls -t "$VHOST".bak.* | head -1)" "$VHOST"; nginx -t; exit 1
  fi
fi
rm -rf "$TMP"

code=$(curl -s -o /dev/null -w '%{http_code}' https://lamena.io/nutra/api/ || true)
say "Gotovo. https://lamena.io/nutra/api/ vraća $code (401 = traži lozinku, to je OK)."
echo "Sledeće: otvori stranicu, učitaj Excel, klikni 'Test: 1 order na Pro Drops', pa uključi automatsko slanje."
