# Pravila za blog (vodiče) — Moja Zdravica

Ova pravila važe za svaki post u `src/content/guides/`, bez obzira da li ga piše čovek ili dnevni zadatak.
Plan tema i status su u [`docs/blog-plan.md`](./blog-plan.md).

## Cilj posta

Da se rangira na Google.rs za jednu glavnu ključnu reč i da čitaoca odvede na stranicu kategorije ili proizvoda.
Google ovakve teme (zdravlje) ocenjuje strože nego ostale. Zato tekst mora da bude tačan, sa izvorima i bez obećanja o lečenju.
Tanak ili prepisan tekst šteti celom sajtu, ne samo tom postu.

## Dužina i struktura

- **Najmanje 900 reči, cilj 1.000–1.400** u telu teksta (bez frontmattera). Duže samo ako tema to zaista traži.
- **Prve 2–3 rečenice direktno odgovaraju na pretragu.** Bez uvoda tipa „U današnjem užurbanom svetu…“.
- Odmah posle uvoda: `> Tekst je informativnog karaktera i ne zamenjuje savet lekara ili farmaceuta.`
- **4–7 H2 podnaslova** (`##`) koji prate ono što ljudi traže (autocomplete). H3 (`###`) za pod-delove. Bez H1 u telu (H1 je `title`).
- Bar jedna **tabela ili numerisana lista** (poređenje biljaka, vrsta krema, koraka).
- Obavezne sekcije, ako tema dozvoljava:
  - **Šta kažu dokazi:** šta je EMA ocenila, šta pokazuju Cochrane pregledi i studije, i koliko su dokazi jaki.
  - **Kome nije namenjeno:** upozorenja, trudnoća, deca, lekovi.
  - **Kada lekaru:** konkretni znaci za pregled.
  - **Gotovi preparati:** kako ih uporediti, sa linkovima na naše stranice.
- Rečenice kratke, pasusi 2–4 rečenice. Srpski, latinica, ekavica. Ti/vi: koristi „vi“.

## Ključne reči (SEO)

- **Jedna glavna ključna reč po postu** iz plana. Ide u: `title`, `seo.title` (na početku), prvu rečenicu, bar jedan H2, `slug`.
- **3–6 sporednih fraza** iz Google autocomplete-a (npr. „najbolji čaj za…“, „…iskustva“, „…prirodni lek“) prirodno u H2 i tekstu.
- Bez nabijanja: glavna fraza 3–6 puta na 1.000 reči.
- `slug`: glavna ključna reč, mala slova, bez dijakritika (`caj-za-parazite`).
- `seo.title`: 45–60 znakova (šema dozvoljava do 70). `seo.description`: 140–160 znakova, sa glavnom frazom i obećanjem koristi.
- **Pre pisanja proveri kanibalizaciju:** ni jedan postojeći vodič ni stranica proizvoda ne sme da cilja istu glavnu frazu (`grep -ril "<fraza>" src/content`).

## Interni linkovi

- **3–6 internih linkova** u telu, sa opisnim anchor tekstom (ne „kliknite ovde“):
  - stranica kategorije: `/<kategorija>/` (npr. `/paraziti-i-detoks/`)
  - naše stranice proizvoda: `/paraziti-i-detoks/parazol/`, `/zglobovi-i-bolovi/nautubone/`, `/zglobovi-i-bolovi/bonecontrol/`
  - stranice ponuda iz kataloga: `/ponude/rs/<slug>/` (spisak slugova: `src/data/products.json`, `country: RS`)
  - drugi vodiči: `/vodici/<slug>/` (samo oni koji već postoje)
- `relatedProducts` u frontmatteru prima samo proizvode iz `src/content/products/` (nautubone, bonecontrol, parazol). Ostale proizvode linkuj u tekstu.
- Kada se objavi novi post iz istog klastera, dodaj link na njega iz 1 starijeg posta (link nazad).

## Izvori

- **Najmanje 3 izvora** u `sources`, samo stvarne stranice koje si otvorio i proverio: EMA (HMPC monografije), Cochrane, PubMed, NICE, WHO, CDC, MedlinePlus, NCCIH, Batut/IZJZ, ALIMS.
- Svaka tvrdnja o dejstvu mora da ima izvor u listi. U tekstu navedi ko je to rekao („EMA navodi…“, „Cochrane pregled iz 2016. …“), sa linkom bar za 1–2 ključna izvora.
- Ne izmišljaj brojeve, studije ni citate. Ako nešto ne možeš da proveriš, ne piši to.

## Pravila sadržaja (obavezno)

- Ne tvrdi da biljka ili proizvod **leči, izleči, uklanja bolest, vraća hrskavicu, snižava pritisak umesto lekova**. Piši „tradicionalno se koristi“, „može da ublaži“, „podrška“.
- Ne savetuj prekid ili zamenu propisane terapije. Kod pritiska, šećera, prostate i srca uvek: „ne prekidajte terapiju bez lekara“.
- Bez izmišljenih iskustava, recenzija, citata kupaca i „lekar preporučuje“.
- Bez lažne hitnosti i popusta („samo danas“, „−50%“) i bez reči „zvanični sajt“.
- Ne piši doziranje za decu i trudnice. Teme o deci i trudnoći preskoči.
- Kod mršavljenja: bez preciznih dijeta, kalorija i obećanja kilograma; laksativi nisu sredstvo za mršavljenje.
- Ne pominji konkurentske brendove (Josif Pančić, DM, Lilly…) u naslovima. U tekstu samo neutralno, ako je potrebno.

## Slika (obavezno)

Svaki vodič ima jednu sliku u `.webp` formatu sa alt tekstom. Ista slika je naslovna (deljenje na mrežama, Article schema) i stoji u tekstu odmah posle napomene.

- **Izvor:** botanička ilustracija sastojka iz kataloga, `public/images/sastav/rs-<proizvod>.webp`. Uzmi proizvod iz kolone „Linkovi“ u planu čiji sastojak najbolje odgovara temi. Šta je na slici piše u `src/data/limitedcharm-details.json` → `items["RS/<proizvod>"].composition` (`name`, `latin`), ali sliku pre izbora i pogledaj.
- Ako u koloni „Linkovi“ nema odgovarajuće slike, uzmi ilustraciju proizvoda iz iste kategorije. Ne koristi slike kupaca (`public/images/hero/`), fotografije ljudi ni slike sa interneta.
- Ako može, uzmi ilustraciju koju još ne koristi nijedan vodič: `grep -rl "izvor: public/images/sastav/rs-<proizvod>.webp" src/content/guides`.
- **Obrada:** širina 1200 px, webp kvalitet 80, fajl `src/content/guides/images/<slug>.webp`:

  ```bash
  node -e "require('sharp')('public/images/sastav/rs-<proizvod>.webp').resize({width:1200}).webp({quality:80}).toFile('src/content/guides/images/<slug>.webp').then(console.log)"
  ```

- **Alt tekst:** jedna rečenica, oko 60–120 znakova, opisuje ono što se stvarno vidi (biljka i njeni delovi). Bez tvrdnji o dejstvu i bez nabijanja ključne reči. Primer: „Botanička ilustracija korena i lista koprive sa isečenim komadićima korena“.
- **Frontmatter:** `heroImage: ./images/<slug>.webp  # izvor: public/images/sastav/rs-<proizvod>.webp` i `heroImageAlt: "<alt>"`.
- **U tekstu:** odmah posle reda sa napomenom („Tekst je informativnog karaktera…“) prazan red, pa `![<isti alt>](./images/<slug>.webp)`.
- `npm test` (`tests/guide-images.test.ts`) proverava da slika postoji, da je `.webp`, da je manja od 400 KB i da alt ima bar 20 znakova.

## Frontmatter (šablon)

```yaml
---
title: "Čaj za parazite: koje biljke se koriste i šta kažu dokazi"
slug: caj-za-parazite
market: RS
description: "Jedna do dve rečenice: šta čitalac dobija iz teksta."
heroImage: ./images/caj-za-parazite.webp   # izvor: public/images/sastav/rs-parazol.webp
heroImageAlt: "Botanička ilustracija vranilove trave (origana) sa cvetovima i usitnjenom biljkom za čaj"
category: paraziti-i-detoks        # slug iz src/content/categories; izostavi ako nijedna ne odgovara
author: { name: Redakcija sajta Moja Zdravica }
publishedAt: 2026-11-24
updatedAt: 2026-11-24
readingMinutes: 6                  # broj reči / 200, zaokruženo
relatedProducts: [parazol]         # samo nautubone, bonecontrol, parazol
sources:
  - title: "Naslov izvora"
    url: https://...
    publisher: European Medicines Agency
faq:                               # 3–5 pitanja iz autocomplete-a, odgovori 2–4 rečenice
  - q: "Pitanje?"
    a: "Odgovor."
seo:
  title: "Čaj za parazite – koje biljke i šta kažu dokazi"
  description: "140–160 znakova sa glavnom frazom."
---
```

- `demo` i `draft` se ne stavljaju (podrazumevano `false`). `faqSchema` ostaje `false`.
- Vrednosti sa dvotačkom ili navodnicima stavi u dvostruke navodnike. Unutar teksta koristi „ovakve“ navodnike.

## Provera pre objave

```bash
npm ci            # samo prvi put
npm test
npm run build
npm run test:seo
```

`npm test` i `npm run build` moraju da prođu. `npm run test:seo` trenutno prijavljuje 10 starih grešaka (kategorije u sitemap-u, Product schema na `/ponude/*/index.html`). Novi post ne sme da poveća taj broj, i nijedna greška ne sme da pominje `vodici/`. Ručno proveri:
- broj reči u telu (najmanje 900),
- da svaki interni link postoji u `dist/client` (stranica postoji),
- da stranica `dist/client/vodici/<slug>/index.html` sadrži `<img` sa popunjenim `alt` (slika iz teksta),
- da nema zabranjenih reči: `izleči`, `garantovano`, `100%`, `zvanični`, `samo danas`, i da se reč „leči“ javlja samo uz lek ili lekara, nikad uz biljku ili proizvod.

## Objava

1. U `docs/blog-plan.md` promeni status objavljenih tema iz `planirano` u `objavljeno` i upiši slug.
2. Commit poruka: `Blog: 3 nova vodiča (YYYY-MM-DD) – <ključna reč 1>, <2>, <3>`.
3. Push na `main`. GitHub Actions automatski pravi staging build.
