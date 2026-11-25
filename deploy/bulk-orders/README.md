# /nutra/api – slanje stare baze na MonadLead

Mala admin stranica na `https://lamena.io/nutra/api/`:

- učitaš Excel sa sheetom **"Za slanje"** (npr. `Za_slanje_MonadLead_RS.xlsx`),
- stranica sama šalje **50 ordera svaki dan u 09:00** (Europe/Belgrade) – broj i vreme se menjaju na stranici,
- dugmad: **Test: 1 order na Pro Drops**, ručno slanje N ordera, probno slanje (bez slanja),
- svaki order se upisuje u isti Excel (Status, MonadLead order_id, datum + sheet "Dnevnik slanja");
  Excel se skida dugmetom **Preuzmi Excel sa beleškama**.

Šalju se samo redovi sa Status = "Za slanje" i sa imenom; isti red se nikad ne šalje dvaput.
Kad učitaš novu listu, ko je već poslat (isti telefon + offer) dobija status "Duplikat".
Dnevni broj se deli na offere srazmerno onome što je ostalo (npr. 50 → ~31 Pro Drops, 15 Dia Drops, 3 Mikoherb, 1 Hyper Drops).

Kod: `tools/bulk-orders/app.py` (stranica + raspored) i `tools/bulk-orders/posalji_ordere.py` (slanje, radi i iz komandne linije).
Samo Python 3.9+ i `openpyxl`. **Lista sa kontaktima se nikad ne commituje u repo** – živi samo na serveru u `/var/lib/nutra-bulk/`.

## Instalacija na VPS-u (lamena.io)

```bash
# 1. kod
sudo apt-get install -y python3-openpyxl          # ili: sudo pip3 install openpyxl
sudo useradd --system --home /opt/nutra-bulk --shell /usr/sbin/nologin nutra-orders 2>/dev/null || true
sudo install -d -o root -g root -m 755 /opt/nutra-bulk
cd /tmp && git clone --depth 1 https://github.com/agency-adstema/Nutra nutra-src
sudo cp nutra-src/tools/bulk-orders/app.py nutra-src/tools/bulk-orders/posalji_ordere.py /opt/nutra-bulk/

# 2. tajne (lozinka za stranicu + MonadLead ključ naloga za katalog, offeri 134/135/119/114)
sudo install -d -o root -g root -m 700 /etc/nutra
sudo tee /etc/nutra/bulk.env >/dev/null <<'EOF'
BULK_ADMIN_USER=admin
BULK_ADMIN_PASSWORD=promeni-ovo-u-dugu-lozinku
MONADLEAD_API_KEY_CATALOG=ovde-ide-kljuc
EOF
sudo chmod 600 /etc/nutra/bulk.env
# (ako /etc/nutra/backend.env već ima MONADLEAD_API_KEY_CATALOG, ključ ovde nije potreban)

# 3. servis
sudo cp nutra-src/deploy/bulk-orders/nutra-bulk.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now nutra-bulk
sudo systemctl status nutra-bulk --no-pager

# 4. nginx: sadržaj deploy/bulk-orders/nginx-nutra-api.conf ubaci u HTTPS server blok za lamena.io
sudo nano /etc/nginx/sites-available/lamena
sudo nginx -t && sudo systemctl reload nginx
```

## Prvi start

1. Otvori `https://lamena.io/nutra/api/`, uloguj se (admin + lozinka iz `bulk.env`).
2. Učitaj `Za_slanje_MonadLead_RS.xlsx`.
3. Klikni **Test: 1 order na Pro Drops** i proveri u MonadLead panelu da je stigao (offer 134, sub_1 = baza_prostadrops).
4. Uključi **Automatsko slanje** (50 dnevno, 09:00).

Automatsko slanje radi samo u prva 3 sata posle zadatog vremena i najviše jednom dnevno, pa restart servisa ne šalje duplo.
Ako MonadLead vrati 401/403 (ključ), slanje se prekida.

## Iz komandne linije (bez stranice)

```bash
cd /var/lib/nutra-bulk
sudo -u nutra-orders env $(sudo cat /etc/nutra/bulk.env | xargs) python3 /opt/nutra-bulk/posalji_ordere.py --file lista.xlsx --limit 1 --offer "Pro Drops"
```
