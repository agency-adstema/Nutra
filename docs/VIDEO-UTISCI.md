# Nutra — video-utisci uz proizvode

Na svakoj stranici proizvoda postoji isti blok **Video utisci**, odmah ispod
dugmeta „Poručite odmah“ u desnom delu hero-sekcije.

- **2 uspravna 9:16 videa istovremeno**, i na mobilnom.
- Strelica **desno** prelazi na sledeća 2 videa (3–4, zatim 5–6 itd.).
- Strelica **levo** se vraća po dva. Na početku/kraju je onemogućena.
- Klik na snimak uključuje HTML5 video, bez automatskog puštanja zvuka.
- Pri prelasku na drugu stranu aktivni video se pauzira.
- Video snimci se dodaju **posebno po GEO i proizvodu**.
- **Bez video fajlova nema izmišljenih recenzija.** U staging verziji prikazuju
  se 2 jasno označena prazna okvira za pregled dizajna; u production okruženju
  bez snimaka sekcija se ne prikazuje.

## Kada preuzmeš Instagram video

Video se može postaviti **samo ako imaš pravo/dozvolu autora** za objavu
na Biljnom kompasu. Sama činjenica da je snimak javan na Instagramu ne znači
da ga slobodno možemo preuzeti i objaviti.

1. Sačuvaj originalni MP4, poželjno vertikalni 9:16.
2. (Preporučeno) pripremi WebP thumbnail/poster iste orijentacije.
3. Odredi GEO i *tačan* proizvod (npr. `RS/nautubone` nije
   `HR/nautubone` niti `RS/hp-nautubone`).
4. Postavi datoteke npr.:
   - `public/videos/products/rs/nautubone/01.mp4`
   - `public/videos/products/rs/nautubone/01.webp`
   - `public/videos/products/rs/nautubone/02.mp4`
   - `public/videos/products/rs/nautubone/02.webp`
5. Uredi `src/data/product-videos.json`:

```json
{
  "RS/nautubone": [
    {
      "title": "Snimak o proizvodu — 1",
      "src": "/videos/products/rs/nautubone/01.mp4",
      "poster": "/videos/products/rs/nautubone/01.webp",
      "consentGranted": true
    },
    {
      "title": "Snimak o proizvodu — 2",
      "src": "/videos/products/rs/nautubone/02.mp4",
      "poster": "/videos/products/rs/nautubone/02.webp",
      "consentGranted": true
    }
  ]
}
```

Ovo je **primer formata**, nije popunjen stvarnim video snimcima.
**Ne dodavati** nijedan red ako dozvola autora nije odobrena.
`verifiedPurchase` nije potreban; snimak nije automatski verifikovana
recenzija kupca.

Za druge GEO koristi `BA/pro-caps` i putanju
`/videos/products/ba/pro-caps/01.mp4`, ili
`HR/cy-relief` i `/videos/products/hr/cy-relief/01.mp4`.

U JSON se unosi samo lokalna MP4 datoteka, bez Instagram iframe linka,
tokena ili identifikatora naloga. Nema automatskog učitavanja sa Instagrama,
niti se posetioci preusmeravaju na drugu prodavnicu.

## Provera pre objave

- Pusti `npm test` i `npm run build:static-preview`.
- Otvori stranicu proizvoda na 393px i na desktopu.
- Proveri da su prve dve kartice vidljive; sledeća strelica radi kad postoje
  najmanje tri video snimka.
- Proveri da `src` i `poster` vode ka stvarnim fajlovima.
- Po prijemu snimaka proveri da nema medicinski neosnovanih tvrdnji u videima.

Za video fajlove veće od ograničenja GitHub upload-a treba prethodno
odrediti video storage/CDN rešenje; ne slati velike fajlove u Git istoriju.
