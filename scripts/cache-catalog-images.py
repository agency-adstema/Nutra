#!/usr/bin/env python3
"""Cache approved partner product images into the generated static Nutra build.

Images come ONLY from the exact api.monadlead.com URLs supplied by the user
in products.json. Files are validated as images and stored in public/ so a
successful Astro static build includes them, without hotlink dependency.
If one remote image fails, the page uses the original HTTPS URL as fallback.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import re
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data" / "offer-details.json"
MANIFEST = ROOT / "src" / "data" / "catalog-image-manifest.json"
DEST = ROOT / "public" / "catalog-products"
URL = re.compile(r"^https://api\.monadlead\.com/storage/offers/images/[A-Za-z0-9_-]+\.(png|jpe?g|webp)$")
MAX_BYTES = 8 * 1024 * 1024

def load_one(p):
    url = p.get("imageUrl")
    if not url:
        return None, "no-image"
    match = URL.fullmatch(url)
    if not match:
        return None, "invalid-url"
    ext = match.group(1).lower()
    filename = f"{p['country'].lower()}-{p['slug']}.{ext}"
    target = DEST / filename
    request = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; NutraCatalog/1.0)",
        "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8",
    })
    try:
        with urllib.request.urlopen(request, timeout=20) as res:
            if res.status != 200:
                return None, f"status={res.status}"
            data = res.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES or len(data) < 1000:
                return None, "image-size"
            valid = (
                ext == "png" and data.startswith(b"\x89PNG\r\n\x1a\n")
                or ext in ("jpg", "jpeg") and data.startswith(b"\xff\xd8\xff")
                or ext == "webp" and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
            )
            if not valid:
                return None, "invalid-image-magic"
            target.write_bytes(data)
            return (f"{p['country']}/{p['slug']}", f"/catalog-products/{filename}"), ""
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
        return None, type(exc).__name__

def main():
    # Keep products.json source history intact but never publish excluded HP
    # Beauty Derm images for RS, BA or HR on the static storefront.
    items = [p for p in json.loads(DATA.read_text(encoding="utf-8"))
             if p.get("slug") != "hp-beauty-derm"]
    DEST.mkdir(parents=True, exist_ok=True)
    manifest = {}
    skipped = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(load_one, p): p for p in items}
        for future in as_completed(futures):
            p = futures[future]
            try:
                pair, reason = future.result()
            except Exception as e:
                pair, reason = None, type(e).__name__
            if pair:
                manifest[pair[0]] = pair[1]
            elif p.get("imageUrl"):
                skipped.append(f"{p['country']}/{p['slug']}:{reason}")
    MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Cached {len(manifest)} / {sum(bool(p.get('imageUrl')) for p in items)} supplied images")
    if skipped:
        print("Remote fallback for: " + ", ".join(sorted(skipped)))
    # The site remains usable on an image server outage: the source URLs
    # still exist in offer-details.json for browser fallback.

if __name__ == "__main__":
    main()
