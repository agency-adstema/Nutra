#!/usr/bin/env python3
"""Import the exact three product package photos from the user-supplied Limited Charm catalog.

Called by GitHub Actions. The source images belong to their respective rights
holders. Use only with rights/permission to reproduce the photos.
The heroImage Markdown references are only changed after ALL downloads validate.
"""
from pathlib import Path
import subprocess
import hashlib

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "src/assets/products"
PRODUCTS = (
    ("nautubone", "https://limitedcharm.com/assets/img/products/rs/nautubone/hero.webp",
     "../../assets/products/nautubone/hero.jpg", "Originalno pakovanje Nautubone gela 100 ml"),
    ("bonecontrol", "https://limitedcharm.com/assets/img/products/rs/bone-control/hero.webp",
     "../../assets/products/bonecontrol/hero.png", "Originalno pakovanje BoneControl gela 100 ml"),
    ("parazol", "https://limitedcharm.com/assets/img/products/rs/parazol/hero.webp",
     "../../assets/products/parazol/hero.png", "Originalno pakovanje Parazol biljnog čaja 50 g"),
)

def main():
    files = []
    for slug, url, old_ref, alt in PRODUCTS:
        target = ASSETS / slug / "hero.webp"
        target.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {slug} from {url}", flush=True)
        subprocess.run([
            "curl", "--fail", "--location", "--silent", "--show-error",
            "--retry", "3", "--connect-timeout", "15", "--max-time", "60",
            "--proto", "=https", "--tlsv1.2",
            "--user-agent", "Mozilla/5.0 (compatible; NutraProductAssetImporter/1.0)",
            "--output", str(target), url,
        ], check=True)
        image = target.read_bytes()
        if not (1000 <= len(image) <= 6_000_000 and image[:4] == b"RIFF" and image[8:12] == b"WEBP"):
            raise ValueError(f"Rejected invalid or oversized WebP source image for {slug}")
        digest = hashlib.sha256(image).hexdigest()
        print(f"{slug}: {len(image)} bytes WebP, sha256={digest}", flush=True)
        files.append((slug, old_ref, alt))

    for slug, old_ref, alt in files:
        path = ROOT / "src/content/products" / f"{slug}.md"
        txt = path.read_text(encoding="utf-8")
        if txt.count("heroImage: ") != 1:
            raise ValueError(f"Missing/duplicate heroImage in {path}")
        new_ref = f"../../assets/products/{slug}/hero.webp"
        if old_ref not in txt and new_ref not in txt:
            raise ValueError(f"Unexpected heroImage reference in {path}")
        txt = txt.replace(old_ref, new_ref, 1)
        lines = txt.splitlines(keepends=True)
        updated = False
        for index, line in enumerate(lines):
            if line.startswith("heroImageAlt: "):
                lines[index] = f"heroImageAlt: {alt}\n"
                updated = True
                break
        if not updated:
            raise ValueError(f"Missing heroImageAlt in {path}")
        path.write_text("".join(lines), encoding="utf-8")

    print("All three verified WebP images and product references prepared.", flush=True)

if __name__ == "__main__":
    main()
