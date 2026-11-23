#!/usr/bin/env python3
"""Uvoz sekcije „Sastav“ i komentara kupaca sa Limited Charm stranica proizvoda.

Pokreće ga GitHub Actions (.github/workflows/import-limitedcharm-details.yml).
Za svaki proizvod sa našeg sajta (src/data/products.json + RS stranice proizvoda)
otvara https://limitedcharm.com/<geo>/proizvod/<slug> i upisuje u
src/data/limitedcharm-details.json:
  - composition: naslov, aktivni sastojak, INCI lista, oznake, slika sastojka
  - reviews: prikazana ocena, broj recenzija i komentari (tekst, inicijali, ocena)
  - pricing: pakovanja 1/2/3 sa starom i novom cenom i besplatnom dostavom
Slike sastojaka čuva u public/images/sastav/<geo>-<slug>.webp.
Naš slug se povezuje sa Limited Charm slugom preko ALIASES, pa istog sluga,
pa poređenjem bez crtica sa listom /<geo>/svi-proizvodi (npr. goslim ↔ go-slim).

Podaci su tvrdnje prodavca. Sajt ih prikazuje sa oznakom izvora i ne ubacuje
ih u JSON-LD. Proizvod bez neke sekcije se preskače, ništa se ne izmišlja.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = ROOT / "src" / "data" / "products.json"
OUT = ROOT / "src" / "data" / "limitedcharm-details.json"
IMG_DIR = ROOT / "public" / "images" / "sastav"
BASE = "https://limitedcharm.com"
UA = "Mozilla/5.0 (compatible; NutraDetailsImporter/1.0)"

# Naši slugovi koji se razlikuju od Limited Charm slugova
ALIASES = {"dia-drops": "diadrops", "mikoherb": "miko-herb", "bonecontrol": "bone-control"}
# Stranice proizvoda (src/content/products) — sve su za RS
CONTENT_PRODUCTS = [("RS", "nautubone"), ("RS", "bonecontrol"), ("RS", "parazol")]


def text(el) -> str:
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip() if el else ""


def num(s: str) -> float | None:
    m = re.search(r"\d+(?:[.,]\d+)?", s or "")
    return float(m.group(0).replace(",", ".")) if m else None


def fetch(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "sr,hr,bs;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.read(12 * 1024 * 1024)
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} {url}")
    except Exception as e:  # noqa: BLE001
        print(f"  greška {url}: {e}")
    return None


PRICE_RE = re.compile(
    r"\b([123])\s+Pak(?:ovanj|iranj)\w*\s+([\d.,]+)\s*(RSD|KM|€|EUR)\s+([\d.,]+)\s*(?:RSD|KM|€|EUR)",
    re.IGNORECASE,
)


def amount(s: str) -> float:
    s = s.strip()
    if "," in s:  # 78,00 / 1.234,50
        s = s.replace(".", "").replace(",", ".")
    else:  # 5.500
        s = s.replace(".", "")
    return float(s)


def parse_pricing(soup) -> dict | None:
    """Pakovanja sa LC stranice: „1 Pakovanje 5.500 RSD 3.700 RSD … 2 Pakovanja …“."""
    page = text(soup.body or soup)
    tiers = {}
    for m in PRICE_RE.finditer(page):
        q = int(m.group(1))
        old, new = amount(m.group(2)), amount(m.group(4))
        if q not in tiers and 0 < new < old:
            tiers[q] = {"quantity": q, "oldPrice": old, "price": new}
    if 1 not in tiers or len(tiers) < 2:
        return None
    return {
        "tiers": [tiers[q] for q in sorted(tiers)],
        "freeDelivery": bool(re.search(r"Besplatna dostava", page, re.IGNORECASE)),
    }


def lc_catalog(geo: str) -> dict[str, str]:
    raw = fetch(f"{BASE}/{geo.lower()}/svi-proizvodi")
    slugs = set(re.findall(rf"/{geo.lower()}/proizvod/([a-z0-9-]+)", raw.decode("utf-8", "replace"))) if raw else set()
    return {s.replace("-", ""): s for s in slugs}


def parse(html: str) -> tuple[dict | None, dict | None, str | None]:
    soup = BeautifulSoup(html, "html.parser")

    composition = None
    img_src = None
    img = soup.select_one('section img[src*="/assets/img/ingredients/"]')
    sec = img.find_parent("section") if img else None
    card = sec.select_one("div.rounded-2xl.bg-white") if sec else None
    if sec and card:
        ps = card.find_all("p", recursive=False)
        latin = next((p for p in ps if "italic" in (p.get("class") or [])), None)
        inci = next((p for p in ps if "italic" not in (p.get("class") or [])), None)
        label = card.find("div", recursive=False)
        composition = {
            "eyebrow": text(sec.find("p")) or "Sastav",
            "title": text(sec.find("h2")),
            "label": text(label) or "Aktivni sastojak",
            "name": text(card.find("h3")),
            "latin": text(latin) or None,
            "inci": text(inci),
            "tags": [text(t) for t in card.select("span.rounded-full") if text(t)],
            "imageAlt": img.get("alt") or None,
        }
        img_src = img.get("src")
        if not (composition["title"] and composition["name"] and composition["inci"]):
            composition = None

    reviews = None
    rs = soup.select_one("section#recenzije")
    if rs:
        big = rs.select_one(".text-5xl")
        count_el = big.parent.select_one(".text-sm") if big and big.parent else None
        items = []
        for c in rs.select("div.rounded-2xl.border.bg-white"):
            p, who = c.find("p"), c.select_one(".text-sm.font-bold")
            if not (p and who):
                continue
            body = text(p).strip('"„“”«» ')
            sc = num(text(c.select_one("span.text-xs"))) or 5.0
            if body:
                items.append({"text": body, "initials": text(who)[:6], "score": sc})
        score, count = num(text(big)), num(text(count_el))
        if items:
            reviews = {
                "score": score,
                "count": int(count) if count else None,
                "items": items,
            }

    return composition, reviews, img_src, parse_pricing(soup)


def main() -> int:
    products = json.loads(PRODUCTS.read_text(encoding="utf-8"))
    keys = [(p["country"], p["slug"]) for p in products] + CONTENT_PRODUCTS
    seen, out = set(), {}
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    catalogs = {g: lc_catalog(g) for g in ("RS", "BA", "HR")}

    for geo, slug in keys:
        key = f"{geo}/{slug}"
        if key in seen:
            continue
        seen.add(key)
        src_slug = ALIASES.get(slug) or catalogs.get(geo, {}).get(slug.replace("-", "")) or slug
        url = f"{BASE}/{geo.lower()}/proizvod/{src_slug}"
        print(f"{key} ← {url}")
        raw = fetch(url)
        if not raw:
            continue
        composition, reviews, img_src, pricing = parse(raw.decode("utf-8", "replace"))
        if not composition and not reviews and not pricing:
            print("  nema sekcije Sastav, komentara ni cena — preskačem")
            continue

        if composition and img_src:
            data = fetch(BASE + img_src if img_src.startswith("/") else img_src)
            if data and data[:4] == b"RIFF" and data[8:12] == b"WEBP" and 1000 < len(data) < 6_000_000:
                name = f"{geo.lower()}-{slug}.webp"
                (IMG_DIR / name).write_bytes(data)
                composition["image"] = f"/images/sastav/{name}"
            else:
                print("  slika sastojka nije preuzeta")

        out[key] = {"sourceUrl": url, "composition": composition, "reviews": reviews, "pricing": pricing}
        print(f"  sastav={'da' if composition else 'ne'} komentari={len(reviews['items']) if reviews else 0} pakovanja={len(pricing['tiers']) if pricing else 0}")

    if not out:
        print("Ništa nije uvezeno — prekidam bez izmene fajla.")
        return 1
    payload = {"sourceName": "Limited Charm", "checkedAt": date.today().isoformat(), "items": out}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Upisano {len(out)} proizvoda u {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
