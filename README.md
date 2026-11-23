# Moja Zdravica — SEO affiliate sajt za prirodne preparate

Astro 7 (SSG) + Tailwind CSS 4 + Markdown content collections + serverless API za porudžbine (MonadLead).
Naziv „Moja Zdravica“ menja se na jednom mestu: `src/config/site.ts`.

> **Status:** preview/staging. Sav sadržaj proizvoda je **DEMO** i jasno je označen. Sajt je `noindex` dok
> `PUBLIC_SITE_ENV` nije `production`. Porudžbine su u **testnom režimu** dok `ORDER_MODE` nije `live`.

---

## 1. Brzi start

```bash
npm install
cp .env.example .env          # popuniti po potrebi
npm run dev                   # http://localhost:4321
```

| Komanda | Šta radi |
|---|---|
| `npm run dev` | lokalni razvoj |
| `npm run build` | produkcijski build (statičke stranice + `/api/order/` server ruta) |
| `npm run preview` | pokreće build lokalno (Node adapter) |
| `npm test` | unit testovi (forma, telefon, tracking, MonadLead, handler, sadržaj) |
| `npm run test:seo` | posle builda: title, description, canonical, H1, OG, JSON-LD, alt, sitemap, robots, bez tajni u frontendu |
| `npm run test:e2e` | posle builda: forma u pravom browseru uz **lokalni lažni MonadLead** (ništa ne ide na pravi API) |
| `npm run check:prod` | pada dok postoje demo podaci, `[POPUNITI]` polja ili nedostaju env varijable |
| `npm run build:static-preview` | statički preview bez servera (za pregled dizajna) u `preview-dist/` |

Node ≥ 22.12. E2E i screenshot skripte koriste instalirani Chrome (`CHROME_PATH=/putanja/do/chrome`).

---

## 2. Struktura

```
src/
  config/
    site.ts          naziv sajta, operater, navigacija, način saglasnosti
    countries.ts     tržišta RS/BA/ME/XK: valuta, telefon, CRM podešavanja
    tracking.ts      UTM/click ID parametri i mapiranje sub_1–sub_4
  content/
    products/        jedan .md po proizvodu (+ _sablon-proizvoda.md)
    categories/      kategorije
    guides/          SEO vodiči
  content.config.ts  šeme (validacija svih polja pri buildu)
  assets/            slike (automatski WebP/AVIF, više širina)
  components/        UI komponente (product/ = stranica proizvoda)
  layouts/           BaseLayout (SEO, JSON-LD), PageLayout (pravne stranice)
  pages/             rute; [category]/[product].astro = stranica proizvoda
  lib/order/         server: validacija, MonadLead klijent, zaštita, logovanje
  scripts/           browser: forma, analitika, consent, atribucija
  server/order-endpoint.ts   POST /api/order/
public/videos/       hostovani video snimci
scripts/             seo-check, e2e, mock MonadLead, screenshot, production-check
tests/               Vitest
```

---

## 3. Dodavanje novog proizvoda (bez menjanja koda)

1. Kopirajte `src/content/products/_sablon-proizvoda.md` u `src/content/products/<slug>.md`.
2. Slike stavite u `src/assets/products/<slug>/` (hero min. 1200 px širine) i upišite putanju u `heroImage`.
3. Popunite polja (svako je objašnjeno u šablonu). Obavezno: `name`, `slug`, `category`, `shortDescription`,
   `intro`, `heroImage`, `packages`, `offerId`, `seo.title`, `seo.description`.
4. `draft: false`, `demo: false` kada je sadržaj proveren.
5. `npm run build` — greška u polju daje jasnu poruku (fajl + polje).

Stranica se automatski pojavljuje na `/<kategorija>/<slug>/`, u kategoriji, sitemap-u, pretrazi i (ako
`featured: true`) na početnoj. Nova kategorija = novi `.md` u `src/content/categories/`.

### Vizuelna tema proizvoda
Polja `themePrimary`, `themeSecondary`, `themeBackground`, `themeAccent` (format `#RRGGBB`) menjaju boje cele
stranice proizvoda i njegove kartice. Opciono `brandLogo` i `heroImage`. Test proverava da `themePrimary` ima
dovoljan kontrast (WCAG AA) sa belim tekstom i pozadinom.

### Cene
- `priceStatus: verified` + `priceCheckedAt` → cena se prikazuje sa „Cena proverena: datum“ i ulazi u Product schema.
- `priceStatus: demo` → prikazuje se sa oznakom „demo cena“ (samo za preview).
- `priceStatus: unknown` → cena se ne prikazuje; piše da je potvrđuje operater.

### Video iskustva
- `type: instagram` (`url` reel-a) ili `type: hosted` (`src` fajla u `public/videos/`), uz `thumbnail`.
- Prikazuje se **samo** ako je `permission.granted: true`.
- Naslov „Video iskustva kupaca“ i oznaka „potvrđena kupovina“ samo uz `verifiedPurchase: true`.
- Ime autora samo uz `authorConsent: true`.
- Video se pokreće tek na klik. Instagram iframe se učitava tek na klik (bez Meta kolačića pre toga).

---

## 4. Porudžbine → MonadLead

**Tok:** forma → `POST /api/order/` (naš server) → `POST https://api.monadlead.com/api/v1/orders/create/`.
API ključ postoji samo na serveru (env), nikada u browseru.

Server redom proverava: metodu i `Content-Type`, Origin, rate limit po IP-u (10 / 10 min), honeypot i
minimalno vreme popunjavanja (2,5 s), opciono Turnstile, proizvod i **offer ID iz naše konfiguracije**
(vrednost `offer_id` poslata iz browsera se ignoriše), validaciju polja, idempotency ključ (dupli klik) i isti
telefon + ista ponuda u roku od 30 min (duplikat).

**Šta se šalje:** `api_key, name` (ime + prezime), `phone` (E.164, npr. `+381601234567`), `offer_id`,
`country_code`, `base_url`, `referrer`, `user_ip`, `sub_1`–`sub_4`, `utm_*`. Prazna opciona polja se izostavljaju.

**Offer ID — redosled prednosti:** `packages[].offerId` → env `OFFER_ID_<SLUG>` → `offerId` u Markdown-u.

**Odgovori:**

| MonadLead | Korisnik vidi |
|---|---|
| 200 | „Porudžbina je uspešno poslata“ (jedini slučaj uspeha). Čuvamo `order_id` i `click_id` u logu i za GA4. |
| 400 | poruka uz polje (telefon/ime), bez potvrde |
| 405/406 | „Tehnička greška“, greška se loguje kao konfiguraciona |
| 500 / mreža | „Servis trenutno nije dostupan“ |
| timeout | „Nismo dobili potvrdu… ne šaljite ponovo odmah“ (broj se blokira 15 min da ne nastane duplikat) |

**Test režim** (`ORDER_MODE=test`, podrazumevano): validacija i zaštite rade, ali se ništa ne šalje. Korisnik
vidi žutu poruku „porudžbina NIJE poslata“ i pregled payload-a bez API ključa.

### sub_1–sub_4 (konfigurabilno)
`src/config/tracking.ts` → `SUB_MAPPING`. Za svako polje navodi se lista izvora; koristi se prvi koji postoji.

```ts
sub_1: ['param:sub_1', 'param:sub1', 'utm:utm_source', 'derived:source'],   // google
sub_2: ['param:sub_2', 'param:sub2', 'utm:utm_medium', 'derived:medium'],   // organic / cpc
sub_3: ['param:sub_3', 'param:sub3', 'product:slug'],                        // nautubone
sub_4: ['param:sub_4', 'param:sub4', 'clickid', 'visit:id'],                 // gclid/fbclid/click_id…
```
Affiliate parametri iz URL-a (`sub_1`…`sub_4`) imaju prednost, pa se originalni click ID ne gubi.
Organski saobraćaj se prepoznaje iz referrera (google/bing… → `organic`).

### ⚠️ Pakovanja i količina — potrebno potvrditi sa MonadLead-om
U dokumentaciji nema polja za količinu, pakovanje ni cenu. Zato se izabrano pakovanje **ne šalje** u MonadLead
(samo u naš log). Moguća rešenja, kada ih MonadLead potvrdi:
1. poseban offer ID po pakovanju → upisati `offerId` u `packages[]`;
2. dodatni API parametar → dodati ga u `buildMonadleadPayload` (`src/lib/order/monadlead.ts`);
3. operater pita kupca za pakovanje tokom poziva.

### Testiranje bez slanja pravih porudžbina
```bash
npm run build && npm run test:e2e
```
Pokreće lokalni lažni MonadLead (`scripts/mock-monadlead.mjs`) i proverava: uspeh, dupli klik, 400, 500,
test režim, sub/UTM mapiranje, video, sticky CTA.

### Prva prava test porudžbina (tek uz odobrenje vlasnika naloga)
1. Na stagingu postaviti `ORDER_MODE=live`, `MONADLEAD_API_KEY`, `OFFER_ID_<SLUG>`, `ORDER_HASH_SALT`.
2. Poslati JEDNU porudžbinu sa jasno označenim test imenom.
3. Proveriti u MonadLead dashboardu: ime, telefon, offer ID, sub_1–sub_4, UTM.
4. Proveriti grešku (npr. neispravan telefon) i dupli klik.
5. Javiti mreži/call centru da je to test porudžbina.

---

## 5. Analitika i saglasnost

- GA4 (`PUBLIC_GA4_ID`) ili GTM (`PUBLIC_GTM_ID`) se učitava **tek posle** „Prihvati analitiku“. Banner se
  prikazuje samo kada je analitika podešena. Consent Mode: reklamni signali su uvek `denied`.
- Događaji: `view_item`, `select_item`, `video_start`, `video_complete` (hostovani video), `begin_checkout`,
  `generate_lead` (samo posle potvrde MonadLead-a), `form_error`, `click_phone`.
- U analitiku se nikad ne šalju ime ni telefon. U browseru se čuva samo izvor posete (`sessionStorage`).

---

## 6. SEO

- Jedinstveni title/description, canonical, Open Graph slika, breadcrumbs, H1/H2/H3 struktura.
- JSON-LD: Organization (svuda), BreadcrumbList, Product (bez ocena i recenzija; `offers` samo uz proverenu
  cenu), Article (vodiči), FAQPage samo uz `faqSchema: true`.
- `/sitemap.xml` i `/robots.txt` se generišu automatski. Na stagingu `robots.txt` blokira sve, a stranice imaju `noindex`.
- Hreflang se ne dodaje dok ne postoje stvarne lokalizovane verzije.

---

## 7. Deploy

**Vercel (preporuka):** import repoa, framework Astro, env varijable iz `.env.example`. Adapter se bira automatski.
Za rate limit i duplikate koji važe za sve instance dodati Upstash Redis (`UPSTASH_REDIS_REST_URL/TOKEN`).

**Cloudflare:** `npm i @astrojs/cloudflare`, `DEPLOY_TARGET=cloudflare`, env kao secrets.

**VPS / Node:** `npm run build && node dist/server/entry.mjs` (`HOST`, `PORT`).

Bez servera (samo pregled dizajna): `npm run build:static-preview` → folder `preview-dist/`.

---

## 8. Više tržišta (BA, ME, XK)

Pripremljeno u `src/config/countries.ts` (valuta, format telefona, CRM po tržištu, uključujući generički webhook).
Svaki sadržaj ima polje `market`. Model je jedan kod i poseban deploy po domenu, sa `PUBLIC_MARKET=BA` i
odgovarajućim API ključem (`MONADLEAD_API_KEY_BA`). Za aktivaciju: `active: true`, prevedeni sadržaj sa
`market: BA` i lokalizovane cene.

---

## 9. Pre puštanja u produkciju

- [ ] `src/config/site.ts` → stvarni podaci operatera (naziv, MB, PIB, adresa, e-mail)
- [ ] Pravne stranice: popuniti `[POPUNITI]` i dati na pravnu proveru
- [ ] Za svaki proizvod: sastav sa deklaracije, provereni podaci, `demo: false`, prave slike, `priceStatus`
- [ ] Ukloniti test video (`demo: true`) i dodati autentične snimke uz dozvolu
- [ ] Offer ID za svaki proizvod (Markdown ili `OFFER_ID_<SLUG>`)
- [ ] Potvrditi sa MonadLead-om kako se šalju pakovanja (videti 4.)
- [ ] Vodiče da pregleda stručna osoba (`reviewedBy` samo uz stvarnu proveru)
- [ ] `PUBLIC_SITE_ENV=production`, `ORDER_MODE=live`, `SITE_URL`, `ORDER_HASH_SALT`, GA4 ID
- [ ] `npm run check:prod && npm test && npm run build && npm run test:seo && npm run test:e2e`
- [ ] Jedna odobrena test porudžbina u MonadLead (videti 4.)
- [ ] Google Search Console: verifikacija domena i slanje `sitemap.xml`
