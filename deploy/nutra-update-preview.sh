#!/usr/bin/env bash
# Automatic STATIC Nutra staging updates from the compiled gh-pages branch.
# Run once with --install to set up /etc/cron.d/nutra-preview-updates.
# This intentionally never edits Nginx and never enables the MonadLead order API.
set -Eeuo pipefail

readonly REPO="https://github.com/agency-adstema/Nutra.git"
readonly DEST="/var/www/nutra-preview"
readonly CRON="/etc/cron.d/nutra-preview-updates"
readonly SELF="/usr/local/sbin/nutra-update-preview"
readonly STAMP=".nutra-deployed-commit"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo ${SELF} [--install]" >&2
  exit 1
fi

for tool in git rsync flock mktemp; do
  command -v "$tool" >/dev/null || { echo "Missing program: $tool" >&2; exit 1; }
done

if [[ ! -f "$DEST/index.html" ]]; then
  echo "SAFE STOP: $DEST/index.html does not exist. Install Nutra staging site first." >&2
  exit 1
fi

if [[ "${1:-}" == "--install" ]]; then
  if [[ "$(realpath "$0")" != "$SELF" ]]; then
    echo "SAFE STOP: save script as $SELF before --install" >&2
    exit 1
  fi
  # Prevent concurrent updates; each cron entry executes the same update script.
  printf '*/5 * * * * root %s >> /var/log/nutra-preview-updates.log 2>&1\n' "$SELF" > "$CRON"
  chmod 0644 "$CRON"
  echo "Enabled automatic Nutra staging updates every 5 minutes."
elif [[ "${1:-}" != "" ]]; then
  echo "Usage: $0 [--install]" >&2
  exit 1
fi

exec 9>"/var/lock/nutra-preview-update.lock"
if ! flock -n 9; then
  echo "Another Nutra update is in progress; skipping."
  exit 0
fi

remote_sha="$(git ls-remote --heads "$REPO" gh-pages | awk '{print $1}')"
if [[ ! "$remote_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Could not read a valid gh-pages commit SHA; leaving existing site unchanged." >&2
  exit 1
fi

current_sha="$(cat "$DEST/$STAMP" 2>/dev/null || true)"
if [[ "$current_sha" == "$remote_sha" ]]; then
  exit 0
fi

tmp="$(mktemp -d /var/www/.nutra-staging-update.XXXXXX)"
trap 'rm -rf -- "$tmp"' EXIT
git clone --quiet --single-branch --depth 1 --branch gh-pages "$REPO" "$tmp/source"
sha="$(git -C "$tmp/source" rev-parse HEAD)"
test "$sha" = "$remote_sha" || {
  echo "gh-pages moved during update; retry on next cron run." >&2
  exit 1
}

mkdir -p "$tmp/next"
rsync -rlt --exclude='.git/' "$tmp/source/" "$tmp/next/"
if [[ ! -s "$tmp/next/index.html" || ! -s "$tmp/next/robots.txt" ]]; then
  echo "SAFE STOP: incomplete static build; keeping existing site." >&2
  exit 1
fi
if ! grep -qi 'noindex' "$tmp/next/index.html"; then
  echo "SAFE STOP: build unexpectedly missing noindex; keeping existing staging site." >&2
  exit 1
fi

printf '%s\n' "$sha" > "$tmp/next/$STAMP"
find "$tmp/next" -type d -exec chmod 755 {} +
find "$tmp/next" -type f -exec chmod 644 {} +

backup="/var/www/.nutra-preview-previous-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mv -- "$DEST" "$backup"
if ! mv -- "$tmp/next" "$DEST"; then
  echo "Deployment failed, rolling back to old site..." >&2
  mv -- "$backup" "$DEST"
  exit 1
fi

echo "$(date -u +%FT%TZ) Deployed Nutra gh-pages commit $sha to $DEST"
echo "Previous version backed up at $backup"
echo "No Nginx changes; no API orders were activated."
