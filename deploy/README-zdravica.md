# Moja Zdravica na https://zdravica.rs

Sajt radi na korenu domena **zdravica.rs**. Indeksiranje je uključeno: nema noindex, a robots.txt i sitemap
pokazuju na zdravica.rs. Stara adresa **lamena.io/nutra** vodi na nov domen preko 301 preusmeravanja.

| Šta | Adresa | Servis na serveru |
|---|---|---|
| Sajt (statički build iz `gh-pages`) | https://zdravica.rs/ | nginx, folder `/var/www/nutra-preview` |
| Forma za porudžbine | https://zdravica.rs/api/order/ | `nutra-orders` (127.0.0.1:4376) |
| Admin za slanje baze (lozinka) | https://zdravica.rs/api/ | `nutra-bulk` (127.0.0.1:8790, `BULK_BASE=/api`) |

## Jednokratno podešavanje (na lamena.io serveru)

```bash
curl -fsSL https://raw.githubusercontent.com/agency-adstema/Nutra/main/deploy/setup-zdravica.sh -o setup-zdravica.sh
sudo bash setup-zdravica.sh
```

Skripta proverava DNS, pravi nginx sajt (www i http idu na https://zdravica.rs) i izdaje Let's Encrypt SSL
sa automatskim obnavljanjem. Zatim povezuje API i admin stranicu, menja updater i preusmerava lamena.io/nutra.
Pre svake izmene pravi rezervnu kopiju u `/root/*.bak`, a ako `nginx -t` ne prođe, vraća staru konfiguraciju.
Može se pokrenuti više puta.

## Kako izmene stižu na sajt

1. Push na `main` → GitHub Actions (`.github/workflows/nutra-staging.yml`): testovi, `npm run build:site`
   sa `SITE_URL=https://zdravica.rs` i `PUBLIC_SITE_ENV=production`, objava na granu `gh-pages`.
2. Cron na serveru (`/usr/local/sbin/nutra-update-preview`, svakih 5 min) prebacuje `gh-pages` u
   `/var/www/nutra-preview`. Prihvata samo build napravljen za zdravica.rs. Log: `/var/log/nutra-preview-updates.log`.

## Posle podešavanja

- Google Search Console: dodaj domen `zdravica.rs` i pošalji `https://zdravica.rs/sitemap.xml`.
- Kontakt e-mail na sajtu je `kontakt@zdravica.rs`. Podesi mu prosleđivanje, npr. Cloudflare Email Routing.
- Režim porudžbina (`ORDER_MODE=test|live`) i dalje je u `/etc/nutra/backend.env`. Skripta ga ne menja.
