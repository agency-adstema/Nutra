#!/usr/bin/env python3
"""
Šalje ordere iz Excel liste (sheet "Za slanje") na MonadLead API i beleži svaki u isti Excel.

Koristi ga web stranica /nutra/api (app.py), a može i iz komandne linije:
  Test (1 order na Pro Drops):   python3 posalji_ordere.py --file lista.xlsx --limit 1 --offer "Pro Drops"
  Dnevno (50 ordera):            python3 posalji_ordere.py --file lista.xlsx --limit 50
  Probno bez slanja:             python3 posalji_ordere.py --file lista.xlsx --limit 50 --dry-run

Ključ: MONADLEAD_API_KEY_CATALOG (okruženje ili .env). Ključ se nikad ne upisuje u Excel ni u log.

U Excelu:
  "Za slanje"      – Status (Za slanje → Poslato / Greška), MonadLead order_id, Datum slanja
  "Dnevnik slanja" – jedan red po pokušaju
Šalju se samo redovi sa Status = "Za slanje", pa ponovno pokretanje nikad ne šalje isti red dvaput.
"""
import argparse, json, os, sys, time, urllib.request, urllib.error
from datetime import datetime
from zoneinfo import ZoneInfo
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

API_URL = os.environ.get('MONADLEAD_API_URL') or 'https://api.monadlead.com/api/v1/orders/create/'
SHEET, LOG = 'Za slanje', 'Dnevnik slanja'
# MonadLead u praksi traži base_url i referrer (u formatu https://domen)
BASE_URL = os.environ.get('BULK_BASE_URL') or 'https://lamena.io'
REFERRER = os.environ.get('BULK_REFERRER') or 'https://lamena.io/nutra/'
TZ = ZoneInfo(os.environ.get('BULK_TZ', 'Europe/Belgrade'))


def local_now():
    return datetime.now(TZ).replace(tzinfo=None)
REQUIRED = ['#', 'Offer', 'offer_id', 'Ime i prezime', 'Telefon', 'Status', 'MonadLead order_id', 'Datum slanja']
LOG_HEAD = ['Datum i vreme', '#', 'Offer', 'offer_id', 'Ime i prezime', 'Telefon', 'sub_1', 'sub_2',
            'Rezultat', 'HTTP', 'MonadLead order_id', 'Greška', 'Pokrenuto']


def load_key(env_file=None, var='MONADLEAD_API_KEY_CATALOG'):
    if os.environ.get(var):
        return os.environ[var]
    if env_file and os.path.exists(env_file):
        for line in open(env_file, encoding='utf-8'):
            line = line.strip()
            if line.startswith(var + '='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    return None


def send(payload, timeout=15):
    req = urllib.request.Request(API_URL, data=json.dumps(payload).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'Accept': 'application/json',
                                          'User-Agent': 'MojaZdravica-bulk/1.0 (+https://lamena.io/nutra/)'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, text = r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        status, text = e.code, e.read().decode('utf-8', 'replace')
    except Exception as e:  # network / timeout
        return False, None, None, type(e).__name__
    try:
        body = json.loads(text) if text else {}
    except ValueError:
        body = {}
    b = body if isinstance(body, dict) else {}
    nested = [x for x in (b.get('data'), b.get('result'), b.get('body')) if isinstance(x, dict)]
    oid = b.get('order_id') or next((x.get('order_id') for x in nested if x.get('order_id')), None)
    if not oid and isinstance(b.get('order'), dict):
        oid = b['order'].get('id')
    failed = b.get('type') == 'error' or b.get('success') is False or b.get('status') in ('error', False) or b.get('error')
    if status in (200, 201) and oid and not failed:
        return True, status, str(oid), None
    err = ' '.join(f'{k}:{b[k]}' for k in ('message', 'error', 'errors', 'detail', 'reason', 'field') if k in b) or text[:200]
    return False, status, None, err[:300]


def check_workbook(path):
    """Vraća None ako je fajl ispravan, inače opis greške."""
    try:
        wb = load_workbook(path, read_only=True)
    except Exception as e:
        return f'Fajl nije ispravan Excel ({type(e).__name__}).'
    if SHEET not in wb.sheetnames:
        return f'U fajlu nema sheeta "{SHEET}".'
    head = [c.value for c in next(wb[SHEET].iter_rows(min_row=1, max_row=1))]
    missing = [h for h in REQUIRED if h not in head]
    return f'Nedostaju kolone: {", ".join(missing)}' if missing else None


def summary(path):
    """Broj redova po offeru i statusu + poslednjih N iz dnevnika (read-only)."""
    wb = load_workbook(path, read_only=True)
    ws = wb[SHEET]
    rows = ws.iter_rows(values_only=True)
    head = list(next(rows))
    io, ist = head.index('Offer'), head.index('Status')
    per = {}
    for r in rows:
        if not r or r[io] is None:
            continue
        d = per.setdefault(r[io], {'Za slanje': 0, 'Poslato': 0, 'Greška': 0, 'ostalo': 0})
        st = r[ist] or 'Za slanje'
        d[st if st in d else 'ostalo'] += 1
    log = []
    if LOG in wb.sheetnames:
        lr = list(wb[LOG].iter_rows(values_only=True))[1:]
        log = lr[-200:][::-1]
    return per, log


def pick_rows(ws, col, limit, offer):
    """Sledeći redovi sa Status 'Za slanje'. Bez offera: dnevni broj se deli na offere srazmerno onome što je ostalo."""
    pending = {}
    for r in range(2, ws.max_row + 1):
        if ws.cell(r, col['Status']).value == 'Za slanje' and ws.cell(r, col['Telefon']).value \
                and ws.cell(r, col['Ime i prezime']).value:
            o = ws.cell(r, col['Offer']).value
            if offer and o != offer:
                continue
            pending.setdefault(o, []).append(r)
    total = sum(len(v) for v in pending.values())
    if not total:
        return []
    quota = {o: int(limit * len(v) / total) for o, v in pending.items()}
    for o in sorted(pending, key=lambda o: -len(pending[o])):
        if sum(quota.values()) >= min(limit, total):
            break
        if quota[o] < len(pending[o]):
            quota[o] += 1
    rows = [r for o, v in pending.items() for r in v[:quota[o]]]
    return sorted(rows)[:limit]


def reset_errors(path):
    """Vraća redove sa Status 'Greška' na 'Za slanje' (dnevnik ostaje). Vraća broj."""
    wb = load_workbook(path)
    ws = wb[SHEET]
    col = {ws.cell(1, j).value: j for j in range(1, ws.max_column + 1)}
    n = 0
    for r in range(2, ws.max_row + 1):
        if ws.cell(r, col['Status']).value == 'Greška':
            ws.cell(r, col['Status'], 'Za slanje'); ws.cell(r, col['Datum slanja'], None); n += 1
    if n:
        wb.save(path)
    return n


def run_batch(path, limit, offer=None, key=None, dry_run=False, pause=2.0, source='ručno', echo=print):
    """Pošalje do `limit` ordera i upiše rezultate u Excel. Vraća dict sa brojem poslatih i grešaka."""
    if not dry_run and not key:
        raise RuntimeError('Nema MonadLead API ključa (MONADLEAD_API_KEY_CATALOG).')
    wb = load_workbook(path)
    ws = wb[SHEET]
    col = {ws.cell(1, j).value: j for j in range(1, ws.max_column + 1)}
    if LOG not in wb.sheetnames:
        lg = wb.create_sheet(LOG)
        for j, h in enumerate(LOG_HEAD, 1):
            c = lg.cell(1, j, h); c.font = Font(name='Arial', bold=True, color='FFFFFF')
            c.fill = PatternFill('solid', start_color='1F4E78')
        for j, w in enumerate([18, 7, 12, 9, 26, 16, 20, 12, 10, 7, 18, 40, 10], 1):
            lg.column_dimensions[get_column_letter(j)].width = w
        lg.freeze_panes = 'A2'
    lg = wb[LOG]
    rows = pick_rows(ws, col, limit, offer)
    echo(f'{local_now():%Y-%m-%d %H:%M} – za slanje: {len(rows)}' + (' (dry-run)' if dry_run else ''))
    ok = bad = 0
    for r in rows:
        v = lambda h: ws.cell(r, col[h]).value if h in col else None
        payload = {'api_key': key or 'DRY-RUN', 'name': str(v('Ime i prezime')).strip(),
                   'phone': str(v('Telefon')).strip(), 'offer_id': str(v('offer_id')),
                   'country_code': v('country_code') or 'RS', 'base_url': BASE_URL, 'referrer': REFERRER}
        for s in ('sub_1', 'sub_2'):
            if v(s):
                payload[s] = str(v(s))
        if dry_run:
            success, status, oid, err = True, None, None, None
        else:
            success, status, oid, err = send(payload)
            now = local_now()
            ws.cell(r, col['Status'], 'Poslato' if success else 'Greška')
            if oid:
                ws.cell(r, col['MonadLead order_id'], oid)
            c = ws.cell(r, col['Datum slanja'], now); c.number_format = 'DD.MM.YYYY'
            lg.append([now.strftime('%d.%m.%Y %H:%M:%S'), v('#'), v('Offer'), v('offer_id'), v('Ime i prezime'),
                       v('Telefon'), v('sub_1'), v('sub_2'), 'Poslato' if success else 'Greška', status, oid, err, source])
            wb.save(path)  # posle svakog ordera, da prekid ne izgubi zapis
        ok += bool(success); bad += (not success)
        tel = str(v('Telefon'))
        echo(f"  #{v('#')} {v('Offer')} {tel[:7]}*** → " + (f'OK {oid}' if success else f'GREŠKA {status} {err}'))
        if not success and status in (401, 403):
            echo('MonadLead je odbio zahtev (401/403) – prekidam; ostali redovi ostaju "Za slanje".')
            break
        if not dry_run:
            time.sleep(pause)
    echo(f'Gotovo: poslato {ok}, greška {bad}')
    return {'sent': ok, 'failed': bad, 'picked': len(rows)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--file', default='Za_slanje_MonadLead_RS.xlsx')
    ap.add_argument('--limit', type=int, default=50)
    ap.add_argument('--offer', help='samo jedan offer, npr. "Pro Drops"')
    ap.add_argument('--env-file', default='.env')
    ap.add_argument('--key-var', default='MONADLEAD_API_KEY_CATALOG')
    ap.add_argument('--pause', type=float, default=2.0)
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    err = check_workbook(a.file)
    if err:
        sys.exit(err)
    key = None if a.dry_run else load_key(a.env_file, a.key_var)
    if not a.dry_run and not key:
        sys.exit(f'Nema API ključa: postavi {a.key_var} u okruženje ili u {a.env_file}')
    run_batch(a.file, a.limit, a.offer, key, a.dry_run, a.pause, source='cli')


if __name__ == '__main__':
    main()
