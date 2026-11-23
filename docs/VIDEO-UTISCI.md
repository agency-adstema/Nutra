# R2 video recenzije — Biljni kompas / Zdravica

## Trenutna konfiguracija

Svi video fajlovi i posteri su na Cloudflare R2, bucket `zdravica-video`.

Jedina konfiguracija je `src/config/video.json`:
- `videoBaseUrl`: `https://pub-a95ebe33417d48d0a699465ca5028b61.r2.dev/Limited%20Charm`
- `bucket`: `zdravica-video`
- `objectPrefix`: `Limited Charm`

Na sajtu `src/config/video.ts` izlaže `VIDEO_BASE_URL` i kodira zasebne delove putanje. Prelazak na `video.zdravica.xx` znači promenu samo polja `videoBaseUrl` u JSON-u.

`src/data/product-videos.json` sadrži 61 snimak za 32 proizvoda, iz `spisak_videa.csv` (UTF-8 BOM, delimiter ;). U javnom HTML-u nema Instagram linkova.

**Nazivi se povezuju isključivo po tačnom nazivu proizvoda**; snimci se ne prenose na proizvode sa sličnim nazivom. Video-snimci postoje u javnim stranicama samo za proizvode za koje imamo sigurno podudaranje.

## Učitavanje (performance)

Video HTML je:

```html
<video src="https://.../Nautubone/Nautubone_1.mp4"
       poster="https://.../Nautubone/Nautubone_1.jpg"
       preload="none" controls playsinline></video>
```

- Nema autoplay-a ni Instagram iframe-ova.
- Video je vertikalan, odnos 9:16, `object-fit: cover`.
- Snimci se učitavaju **tek na play**; poster se može preuzeti ranije.
- Po pokretanju drugog videa, prvi se pauzira.
- Mobilni prikaz: 2 uspravne kartice, horizontalni snap i strelice po 2.
- Desktop: mreža od 4 kolone.

## Pravi nedostajuće postere na svom računaru (Windows PowerShell)

Sa instaliranim Node.js:

```powershell
winget install Gyan.FFmpeg
npx wrangler login
node scripts/make-posters.mjs --dry-run
node scripts/make-posters.mjs
```

Skriptu pokreni iz korena kloniranog `agency-adstema/Nutra` repoa.
Skripta **direktno čita R2 CSV**, za svaki video HEAD proverava poster i video. Kada poster već postoji (HTTP 200), ne dira ga. Za nedostajući poster koristi:

```bash
ffmpeg -y -ss 1 -i "<URL_VIDEA>" -frames:v 1 -vf "scale=480:-2" -q:v 4 poster.jpg
npx wrangler r2 object put "zdravica-video/Limited Charm/Nautubone/Nautubone_1.jpg" --file=poster.jpg --content-type=image/jpeg --cache-control="public, max-age=31536000, immutable" --remote
```

Stvarni MP4 ostaje na R2, a privremeni JPEG briše se nakon izvršavanja.
Ako video vrati 404, ulazi u `missingVideos`; izlaz sadrži broj postojećih, napravljenih, nepostojećih i neuspelih postera.

**Samo povezivanje u GitHubu ne znači da su poster slike otpremljene.**
Bez R2 pristupa skripta se ne može izvršiti iz ovog razgovora.
Da korisnik ne vidi pokvarenu sliku, kad poster nije napravljen, browser i dalje može prikazati praznu podlogu; za kvalitetan UX završiti upload pre VPS objave.

## Pravila sadržaja

Pre ponovnog objavljivanja Instagram snimaka potvrdi pravo korišćenja i verodostojnost iskustva. Nisu automatski potvrđene kupovine Biljnog kompasa. Izbeći medicinske tvrdnje bez dokaza.

## Deploy

GitHub Actions objavljuje statički `gh-pages`; VPS se ažurira zasebno:

```bash
sudo /usr/local/sbin/nutra-update-preview
```
