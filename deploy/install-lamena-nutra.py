#!/usr/bin/env python3
"""One-command, rollback-safe setup of the EXISTING Nutra staging build at lamena.io/nutra/.

Run as root on the lamena.io VPS. This does NOT enable COD orders and does not
touch /astro/ or other routes. Aborts if the active HTTPS vhost isn't unambiguous.
"""
import datetime
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

DOMAIN = "lamena.io"
ROOT = Path("/var/www")
DEST = ROOT / "nutra-preview"
REPO = "https://github.com/agency-adstema/Nutra.git"

LOCATION = """
    # NUTRA_PREVIEW_BEGIN — isolated static demo, no API
    location = /nutra {
        return 308 /nutra/;
    }
    location ^~ /nutra/ {
        alias /var/www/nutra-preview/;
        index index.html;
        try_files $uri $uri/ =404;
        add_header X-Robots-Tag "noindex, nofollow" always;
        limit_except GET HEAD { deny all; }
    }
    # NUTRA_PREVIEW_END
"""

def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)

def vhost_candidates():
    dump = run("nginx", "-T", capture_output=True).stdout
    included = list(dict.fromkeys(re.findall(r"(?m)^# configuration file (.+?):\s*$", dump)))
    found = []
    for f in included:
        path = Path(f)
        if not path.is_file() or not str(path).startswith("/etc/nginx/"):
            continue
        source = path.read_text()
        for m in re.finditer(r"(?m)^[ \t]*server\s*\{", source):
            depth = 1
            end = None
            for i in range(m.end(), len(source)):
                if source[i] == "{":
                    depth += 1
                elif source[i] == "}":
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            if end is None:
                continue
            block = source[m.end():end]
            names = re.findall(r"(?m)^\s*server_name\s+([^;]+);", block)
            names = [name for group in names for name in group.split()]
            listen_https = re.search(r"(?m)^\s*listen\s+[^;\n]*\b443\b", block)
            if DOMAIN in names and listen_https:
                found.append((path.resolve(), m.end(), source, block))
    unique = {}
    for f, offset, source, block in found:
        unique[(f,offset)] = (f,offset,source,block)
    return list(unique.values())

def atomic_text(path, content):
    tmp = path.with_name(path.name + ".nutra-writing")
    stat = path.stat()
    try:
        tmp.write_text(content)
        os.chmod(tmp, stat.st_mode)
        os.chown(tmp, stat.st_uid, stat.st_gid)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)

def main():
    if os.geteuid() != 0:
        sys.exit("Error: run as root, e.g. sudo python3 deploy/install-lamena-nutra.py")
    for cmd in ("nginx", "git", "systemctl"):
        if not shutil.which(cmd):
            sys.exit(f"Missing required command: {cmd}")

    hits = vhost_candidates()
    if len(hits) != 1:
        sys.exit(f"SAFE STOP: expected exactly one active HTTPS vhost for {DOMAIN}; found {len(hits)}. No changes made.")
    conf, offset, source, block = hits[0]
    if "NUTRA_PREVIEW_BEGIN" in source or re.search(r"\blocation\s+(?:(?:=|\^~|~\*?)\s+)?/nutra(?:[\s/{;]|$)", block):
        sys.exit(f"SAFE STOP: /nutra route already exists in {conf}. No changes made.")
    if DEST.is_symlink():
        sys.exit(f"SAFE STOP: {DEST} is a symlink. No changes made.")
    if not (conf.is_file() and ROOT.is_dir()):
        sys.exit("SAFE STOP: missing expected Nginx config or /var/www")

    stamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    backup_conf = conf.with_name(conf.name + f".before-nutra-{stamp}")
    old_dest = ROOT / f".nutra-preview-backup-{stamp}"
    tmpdir = Path(tempfile.mkdtemp(prefix="nutra-install-"))
    new_dest = ROOT / f".nutra-preview-next-{stamp}"
    conf_modified = False
    dest_swapped = False
    had_previous = DEST.exists()
    try:
        print("Fetching the already built gh-pages staging site...")
        run("git", "clone", "--quiet", "--depth=1", "--single-branch", "--branch", "gh-pages", REPO, str(tmpdir / "site"))
        if not (tmpdir / "site/index.html").is_file():
            raise RuntimeError("gh-pages branch has no index.html")
        shutil.copytree(tmpdir / "site", new_dest, ignore=shutil.ignore_patterns(".git"))
        os.chmod(new_dest, 0o755)

        shutil.copy2(conf, backup_conf)
        print(f"Nginx backup: {backup_conf}")
        atomic_text(conf, source[:offset] + LOCATION + source[offset:])
        conf_modified = True

        if had_previous:
            os.replace(DEST, old_dest)
        os.replace(new_dest, DEST)
        dest_swapped = True

        print("Checking Nginx configuration...")
        run("nginx", "-t")
        run("systemctl", "reload", "nginx")
        print("\nSUCCESS: static Nutra preview deployed to https://lamena.io/nutra/")
        print("NOTE: staging/noindex is on. MonadLead API orders remain disabled.")
        print("Check both https://lamena.io/ and https://lamena.io/astro/ afterward.")
        print(f"Backup nginx config: {backup_conf}")
        if had_previous:
            print(f"Previous preview backup: {old_dest}")
    except Exception as e:
        print(f"ERROR: {e}; restoring earlier configuration...", file=sys.stderr)
        if conf_modified:
            shutil.copy2(backup_conf, conf)
        if dest_swapped:
            if DEST.exists():
                shutil.rmtree(DEST)
            if had_previous and old_dest.exists():
                os.replace(old_dest, DEST)
        elif had_previous and old_dest.exists() and not DEST.exists():
            os.replace(old_dest, DEST)
        if conf_modified:
            try:
                run("nginx", "-t")
                run("systemctl", "reload", "nginx")
            except Exception as restore_err:
                print(f"WARNING: rollback reload failed: {restore_err}", file=sys.stderr)
        raise SystemExit(1)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
        if new_dest.exists():
            shutil.rmtree(new_dest, ignore_errors=True)

if __name__ == "__main__":
    main()
