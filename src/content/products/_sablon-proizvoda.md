---
# =====================================================================
#  ŠABLON PROIZVODA — kopirajte ovaj fajl u novi-proizvod.md
#  Fajlovi koji počinju donjom crtom (_) se NE objavljuju.
#  Posle čuvanja: `npm run build` proverava sva polja (greška = jasna poruka).
# =====================================================================

# --- Osnovno -----------------------------------------------------------
name: Naziv proizvoda                # kako se proizvod zove
slug: naziv-proizvoda                # URL: /<kategorija>/<slug>/ (mala slova, cifre, crtice)
category: zglobovi-i-bolovi          # slug postojeće kategorije iz src/content/categories/
market: RS                           # RS | BA | ME | XK
productType: Gel za zglobove         # kratka oznaka iznad naslova
h1: Naziv proizvoda gel              # H1 (opciono; podrazumevano = name)
shortDescription: Jedna rečenica za kartice i hero (do 160 karaktera).
intro: Kratak opis za sekciju „Šta je …?“ — 2–4 rečenice, bez zdravstvenih obećanja.
highlights:                          # najviše 3; ikonice: leaf, plant, drop, flower, capsule, truck, hand, shield, clock, root, seed, box
  - { icon: leaf, label: Spoljna upotreba }
  - { icon: plant, label: Glavni sastojak }
  - { icon: truck, label: Plaćanje pouzećem }
featured: false                      # true = prikaz na početnoj (max 6)
sortOrder: 100                       # redosled prikaza (manji = ranije)
draft: true                          # true = ne objavljuje se
demo: false                          # true = prikazuje DEMO oznaku; produkcijska provera pada
publishedAt: 2026-01-01
updatedAt: 2026-01-01

# --- Slike i vizuelna tema --------------------------------------------
heroImage: ../../assets/products/naziv-proizvoda/hero.jpg   # min. 1200 px širine
heroImageAlt: Opis slike za slabovide i Google
# gallery:
#   - { src: ../../assets/products/naziv-proizvoda/2.jpg, alt: Pakovanje sa zadnje strane }
# brandLogo: ../../assets/products/naziv-proizvoda/logo.png
themePrimary: "#1f5a2c"              # glavna boja (dugmad, naslovi) — mora imati kontrast sa belim tekstom
themeSecondary: "#e6efd9"            # svetla pozadina kartica
themeBackground: "#f8f4e9"           # pozadina stranice
themeAccent: "#6a9a3f"               # akcenat (ikonice, linije)

# --- Sadržaj (samo proverljive informacije) ---------------------------
ingredients:
  - { name: Sastojak, latin: Latinski naziv, description: Šta piše na deklaraciji / u izvoru., icon: leaf }
ingredientsNote: Sastav prema deklaraciji proizvođača (datum provere).
usage:
  - Korak 1
  - Korak 2
notFor:
  - Kome proizvod nije namenjen
warnings:
  - Upozorenje sa deklaracije
# comparison:
#   intro: Kratko objašnjenje
#   columns: ["Ovaj proizvod", "Alternativa 1", "Alternativa 2"]
#   rows:
#     - { label: Vrsta proizvoda, values: ["…", "…", "…"] }
faq:
  - { q: "Naziv proizvoda cena?", a: "Odgovor bez izmišljenih podataka." }
faqSchema: false                     # true samo ako FAQ ispunjava Google smernice
sources:
  - { title: Naziv izvora, url: "https://…", publisher: Izdavač }

# --- Cene i pakovanja -------------------------------------------------
currency: RSD
priceStatus: unknown                 # verified (prikazuje se + Product schema) | demo (sa oznakom) | unknown (ne prikazuje se)
# priceCheckedAt: 2026-01-01         # obavezno uz verified
# priceSource: Sajt prodavca / potvrda od mreže
packages:
  - { id: 1-komad, label: 1 komad, quantity: 1, price: 3700, default: true }
  # - { id: 2-komada, label: 2 komada, quantity: 2, price: 5850, offerId: "OPCIONO_POSEBAN_OFFER" }

# --- Porudžbine (MonadLead) -------------------------------------------
offerId: "UNETI_OFFER_ID"            # offer_id iz MonadLead naloga (ili env OFFER_ID_<SLUG>)
countryCode: RS
orderEnabled: true

# --- Video iskustva (samo autentični snimci uz dozvolu) ---------------
videoSectionTitle: Video iskustva kupaca
videos: []
#  - type: instagram                  # instagram | hosted
#    url: https://www.instagram.com/reel/XXXX/
#    thumbnail: ../../assets/videos/naziv-proizvoda-1.jpg
#    title: Naslov snimka
#    author: "@korisnik"              # prikazuje se samo uz authorConsent: true
#    authorConsent: true
#    description: Kratak opis
#    sourceUrl: https://www.instagram.com/reel/XXXX/
#    permission: { granted: true, date: 2026-01-01, reference: "DM od 01.01.2026." }
#    verifiedPurchase: true           # samo ako je potvrđena kupovina i upotreba
#  - type: hosted
#    src: /videos/naziv-proizvoda/1.mp4   # fajl u public/videos/
#    thumbnail: ../../assets/videos/naziv-proizvoda-2.jpg
#    title: Naslov
#    permission: { granted: true, reference: "Pisana saglasnost" }

related: []                          # slugovi srodnih proizvoda
seo:
  title: Naziv proizvoda – cena, sastav, upotreba i iskustva   # do 70 karaktera
  description: Opis za Google (50–170 karaktera), prirodan, bez nabrajanja ključnih reči.
---

### Detaljniji tekst

Ovde ide duži informativni tekst (Markdown). Koristite ### podnaslove.
