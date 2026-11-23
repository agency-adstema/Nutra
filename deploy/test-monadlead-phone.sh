#!/usr/bin/env bash
# Proba MonadLead API-ja direktno sa servera: koji oblik broja telefona prihvata.
#   sudo bash test-monadlead-phone.sh
# Šalje PRAVU probnu porudžbinu (Nautubone RS, offer 51) sa TVOJIM brojem, redom u
# 3 oblika (+381…, 381…, 0…) i staje na prvom koji MonadLead prihvati.
# API ključ čita iz /etc/nutra/backend.env i nikad ga ne ispisuje.
set -Eeuo pipefail
ENV_FILE=/etc/nutra/backend.env
[[ $EUID -eq 0 ]] || { echo "Pokreni kao root: sudo bash $0"; exit 1; }
KEY=$(grep -E '^MONADLEAD_API_KEY_CATALOG=' "$ENV_FILE" | cut -d= -f2-)
[[ -n "$KEY" ]] || { echo "Nema MONADLEAD_API_KEY_CATALOG u $ENV_FILE"; exit 1; }

read -r -p "Tvoj broj telefona (npr. 0612938152): " RAW
NSN=$(echo "$RAW" | tr -cd '0-9' | sed -E 's/^381//; s/^0+//')
[[ ${#NSN} -ge 8 && ${#NSN} -le 10 ]] || { echo "Broj ne izgleda ispravno: $RAW"; exit 1; }

mask() { local t="$1"; t="${t//"$KEY"/***KLJUC***}"; printf '%s' "$t" | sed -E 's/[0-9]{6,}/[broj]/g'; }

for P in "+381$NSN" "381$NSN" "0$NSN"; do
  echo
  echo "== Šaljem broj u obliku: $(echo "$P" | sed -E 's/[0-9]{4}$/xxxx/')"
  BODY=$(printf '{"api_key":"%s","name":"Proba Sajt","phone":"%s","offer_id":"51","country_code":"RS","base_url":"https://lamena.io"}' "$KEY" "$P")
  RESP=$(curl -s -w '\nHTTP %{http_code}' -X POST https://api.monadlead.com/api/v1/orders/create/ \
    -H 'Content-Type: application/json' -H 'Accept: application/json' -d "$BODY" || true)
  mask "$RESP" | head -c 600; echo
  if echo "$RESP" | grep -q '"order_id"'; then
    echo
    echo ">>> USPEH: MonadLead prihvata oblik $(echo "$P" | sed -E 's/[0-9]+$/…/'). Javi Claude-u koji je prošao."
    exit 0
  fi
done
echo
echo ">>> Nijedan oblik nije prošao. Pošalji Claude-u ovaj ispis (ključ i broj su sakriveni)."
