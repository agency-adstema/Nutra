#!/usr/bin/env python3
"""Kandidat-kadrovi iz video iskustava za hero na početnoj (proizvodi bez „Priče korisnika“).

Za svaki unos sa "video" u src/data/home-hero.json izvlači nekoliko kadrova
(ffmpeg, direktno sa R2 URL-a) u hero-frames-candidates/. Izabrani kadar se
ručno kopira u public/images/price/ i upisuje kao "image" u home-hero.json.
"""
import json
import subprocess
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HERO = json.loads((ROOT / "src/data/home-hero.json").read_text(encoding="utf-8"))
BASE = json.loads((ROOT / "src/config/video.json").read_text(encoding="utf-8"))["videoBaseUrl"].rstrip("/")
OUT = ROOT / "hero-frames-candidates"
OUT.mkdir(exist_ok=True)

for h in HERO:
    file = h.get("video")
    if not file or h.get("image"):
        continue
    url = BASE + "/" + "/".join(urllib.parse.quote(p) for p in file.split("/"))
    stem = Path(file).stem.lower().replace("_", "-")
    for t in (1, 3, 5, 8, 12):
        target = OUT / f"{stem}-t{t}.jpg"
        r = subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(t), "-i", url,
                            "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "3", str(target)])
        print(f"{file} @{t}s → {target.name}: {'ok' if r.returncode == 0 and target.exists() else 'greška'}")
