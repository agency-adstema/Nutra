#!/usr/bin/env bash
# Run on the lamena.io VPS (Ubuntu/Nginx). Publish the pre-built GH Pages preview
# to a dedicated /var/www/nutra-preview directory. Does NOT alter the main site.
set -euo pipefail

REPO_URL="https://github.com/agency-adstema/Nutra.git"
DEST="/var/www/nutra-preview"
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Pokrenite: sudo bash deploy/deploy-nutra-preview.sh" >&2
  exit 1
fi

for cmd in git rsync mktemp; do
  command -v "$cmd" >/dev/null || { echo "Missing command: $cmd" >&2; exit 1; }
done

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
git clone --depth=1 --single-branch --branch gh-pages "$REPO_URL" "$tmp/repo"
test -s "$tmp/repo/index.html" || { echo "No GH Pages index.html found" >&2; exit 1; }
install -d -m 0755 "$DEST"
rsync -rlt --delete --exclude='.git/' "$tmp/repo/" "$DEST/"
find "$DEST" -type d -exec chmod 755 {} +
find "$DEST" -type f -exec chmod 644 {} +

echo "Staging Nutra content deployed to: $DEST"
echo "NOTE: To publish /nutra/ add the nginx location block from deploy/nginx-nutra-preview.conf"
echo "Then run: sudo nginx -t && sudo systemctl reload nginx"
