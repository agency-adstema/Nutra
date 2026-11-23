#!/usr/bin/env python3
"""Uvoz sekcije „Sastav“ i komentara kupaca sa Limited Charm stranica proizvoda.

Pokreće ga GitHub Actions (.github/workflows/import-limitedcharm-details.yml).
Za svaki proizvod sa našeg sajta (src/data/products.json + RS stranice proizvoda)
otvara https://limitedcharm.com/<geo>/proizvod/<slug> i upisuje u
src/data/limitedcharm-details.json:
  - composition: naslov, aktivni sastojak, INCI lista, oznake, slika sastojka
  - reviews: prikazana ocena, broj recenzija i komentari (tekst, inicijali, ocena)
  - story: „Priča korisnika“ (citat, ime, video na YouTube-u, slika)
Slike sastojaka čuva u public/images/sastav/<geo>-<slug>.webp,
slike priča u public/images/price/<geo>-<slug>.jpg.
Priče se uvoze i za ključeve iz src/data/home-hero.json (hero na početnoj).

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
STORY_DIR = ROOT / "public" / "images" / "price"
HERO = ROOT / "src" / "data" / "home-hero.json"
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


def parse_story(soup) -> dict | None:
    sec = soup.select_one("section#video-testimonial")
    if not sec:
        return None
    img = sec.find("img")
    src = img.get("src", "") if img else ""
    yt = re.search(r"/vi/([A-Za-z0-9_-]{6,20})/", src)
    head = sec.find(["h2", "h3"])
    panel = head.parent if head else None
    if not (panel and yt):
        return None
    ps = panel.find_all("p", recursive=False)
    eyebrow = text(ps[0]) if ps else ""
    story_text = text(ps[1]) if len(ps) > 1 else ""
    name_el = panel.select_one("span.font-semibold")
    name = text(name_el)
    if "·" in name:  # „Verifikovana izjava · Božica P., Subotica“ → „Božica P., Subotica“
        name = name.split("·", 1)[1].strip()
    quote = text(panel.find("blockquote")).strip('"„“” ')
    return {
        "eyebrow": eyebrow,
        "headline": text(head).strip('"„“” '),
        "text": story_text,
        "name": name or None,
        "quote": quote or None,
        "youtubeId": yt.group(1),
        "thumbnail": src,
    }


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

    return composition, reviews, img_src, parse_story(soup)


def main() -> int:
    products = json.loads(PRODUCTS.read_text(encoding="utf-8"))
    keys = [(p["country"], p["slug"]) for p in products] + CONTENT_PRODUCTS
    if HERO.exists():
        for h in json.loads(HERO.read_text(encoding="utf-8")):
            if h.get("story"):
                geo, slug = h["story"].split("/", 1)
                keys.append((geo, slug))
    seen, out = set(), {}
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    STORY_DIR.mkdir(parents=True, exist_ok=True)

    for geo, slug in keys:
        key = f"{geo}/{slug}"
        if key in seen:
            continue
        seen.add(key)
        src_slug = ALIASES.get(slug, slug)
        url = f"{BASE}/{geo.lower()}/proizvod/{src_slug}"
        print(f"{key} ← {url}")
        raw = fetch(url)
        if not raw:
            continue
        composition, reviews, img_src, story = parse(raw.decode("utf-8", "replace"))
        if not composition and not reviews and not story:
            print("  nema sekcije Sastav, komentara ni priče — preskačem")
            continue

        if story:
            thumb = fetch(story.pop("thumbnail"))
            if thumb and thumb[:3] == b"\xff\xd8\xff" and 5000 < len(thumb) < 6_000_000:
                name = f"{geo.lower()}-{slug}.jpg"
                (STORY_DIR / name).write_bytes(thumb)
                story["image"] = f"/images/price/{name}"
            else:
                print("  slika priče nije preuzeta")

        if composition and img_src:
            data = fetch(BASE + img_src if img_src.startswith("/") else img_src)
            if data and data[:4] == b"RIFF" and data[8:12] == b"WEBP" and 1000 < len(data) < 6_000_000:
                name = f"{geo.lower()}-{slug}.webp"
                (IMG_DIR / name).write_bytes(data)
                composition["image"] = f"/images/sastav/{name}"
            else:
                print("  slika sastojka nije preuzeta")

        out[key] = {"sourceUrl": url, "composition": composition, "reviews": reviews, "story": story}
        print(f"  sastav={'da' if composition else 'ne'} komentari={len(reviews['items']) if reviews else 0} priča={'da' if story else 'ne'}")

    if not out:
        print("Ništa nije uvezeno — prekidam bez izmene fajla.")
        return 1
    payload = {"sourceName": "Limited Charm", "checkedAt": date.today().isoformat(), "items": out}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Upisano {len(out)} proizvoda u {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
