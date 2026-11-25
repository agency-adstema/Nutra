#!/usr/bin/env python3
"""
/nutra/api – mala admin stranica za slanje stare baze na MonadLead.

  * jednom učitaš Excel (sheet "Za slanje"),
  * stranica sama šalje N ordera svaki dan u zadato vreme (podrazumevano 50 u 09:00, Europe/Belgrade),
  * dugme za ručno slanje / test od 1 ordera,
  * sve se beleži u isti Excel (Status, order_id, datum + sheet "Dnevnik slanja"), koji se skida sa stranice.

Pokretanje (vidi deploy/bulk-orders/README.md):
  BULK_ADMIN_PASSWORD=... MONADLEAD_API_KEY_CATALOG=... python3 app.py
Samo Python 3.9+ i openpyxl.
"""
import base64, hmac, html, json, os, shutil, sys, threading, time, traceback
from datetime import datetime, timedelta
from email.parser import BytesParser
from email.policy import default as email_policy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

from openpyxl import load_workbook

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import posalji_ordere as po  # noqa: E402

BASE = os.environ.get('BULK_BASE', '/nutra/api').rstrip('/')
HOST = os.environ.get('BULK_HOST', '127.0.0.1')
PORT = int(os.environ.get('BULK_PORT', '8790'))
DATA = os.environ.get('BULK_DATA_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data'))
USER = os.environ.get('BULK_ADMIN_USER', 'admin')
PASSWORD = os.environ.get('BULK_ADMIN_PASSWORD', '')
TZ = ZoneInfo(os.environ.get('BULK_TZ', 'Europe/Belgrade'))
KEY_VAR = os.environ.get('BULK_KEY_VAR', 'MONADLEAD_API_KEY_CATALOG')
ENV_FILE = os.environ.get('BULK_ENV_FILE', '/etc/nutra/backend.env')
PAUSE = float(os.environ.get('BULK_PAUSE', '2'))
MAX_UPLOAD = 25 * 1024 * 1024
LIST = os.path.join(DATA, 'lista.xlsx')
STATE = os.path.join(DATA, 'state.json')
AUTO_WINDOW_H = 3  # automatsko slanje samo u prva 3 sata posle zadatog vremena

lock = threading.Lock()
flash = []
job = {'running': False, 'source': None, 'started': None, 'lines': [], 'result': None}


# ---------------- state ----------------
def load_state():
    st = {'auto': False, 'daily_limit': 50, 'send_time': '09:00', 'last_auto_date': None, 'uploaded': None,
          'file_name': None}
    try:
        st.update(json.load(open(STATE, encoding='utf-8')))
    except (OSError, ValueError):
        pass
    return st


def save_state(st):
    tmp = STATE + '.tmp'
    json.dump(st, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    os.replace(tmp, STATE)


def now():
    return datetime.now(TZ)


# ---------------- jobs ----------------
def start_job(limit, offer, dry_run, source):
    if not os.path.exists(LIST):
        return 'Prvo učitaj Excel listu.'
    key = None if dry_run else po.load_key(ENV_FILE, KEY_VAR)
    if not dry_run and not key:
        return f'Na serveru nema API ključa ({KEY_VAR}).'
    if not lock.acquire(blocking=False):
        return 'Slanje je već u toku.'
    job.update(running=True, source=source, started=now().strftime('%d.%m.%Y %H:%M:%S'), lines=[], result=None)

    def work():
        try:
            res = po.run_batch(LIST, limit, offer, key, dry_run, PAUSE, source=source,
                               echo=lambda s: job['lines'].append(s))
            job['result'] = res
        except Exception as e:  # never leak the key
            job['lines'].append(f'Greška: {type(e).__name__}: {e}')
            traceback.print_exc()
        finally:
            job['running'] = False
            lock.release()
    threading.Thread(target=work, daemon=True).start()
    return None


def scheduler():
    while True:
        try:
            st = load_state()
            if st['auto'] and os.path.exists(LIST):
                t = now()
                hh, mm = map(int, st['send_time'].split(':'))
                start = t.replace(hour=hh, minute=mm, second=0, microsecond=0)
                today = t.strftime('%Y-%m-%d')
                if start <= t < start + timedelta(hours=AUTO_WINDOW_H) and st.get('last_auto_date') != today \
                        and not job['running']:
                    st['last_auto_date'] = today
                    save_state(st)
                    err = start_job(int(st['daily_limit']), None, False, 'automatski')
                    if err:
                        print(f'[auto] {err}', flush=True)
        except Exception:
            traceback.print_exc()
        time.sleep(20)


# ---------------- upload ----------------
def merge_upload(new_path):
    """Nova lista zamenjuje staru, ali: ko je već poslat (telefon + offer) dobija Status 'Duplikat',
    prazan Status postaje 'Za slanje', a stari dnevnik se prenosi u novi fajl."""
    sent, old_log = set(), []
    if os.path.exists(LIST):
        ow = load_workbook(LIST, read_only=True)
        rows = ow[po.SHEET].iter_rows(values_only=True)
        h = list(next(rows))
        it, io, ist = h.index('Telefon'), h.index('Offer'), h.index('Status')
        for r in rows:
            if r and r[ist] == 'Poslato':
                sent.add((str(r[it]), r[io]))
        if po.LOG in ow.sheetnames:
            lr = list(ow[po.LOG].iter_rows(values_only=True))
            old_log = lr[1:]
            lh = list(lr[0]) if lr else []
            if 'Telefon' in lh and 'Offer' in lh and 'Rezultat' in lh:
                for r in old_log:
                    if r[lh.index('Rezultat')] == 'Poslato':
                        sent.add((str(r[lh.index('Telefon')]), r[lh.index('Offer')]))
    wb = load_workbook(new_path)
    ws = wb[po.SHEET]
    col = {ws.cell(1, j).value: j for j in range(1, ws.max_column + 1)}
    dup = todo = 0
    for r in range(2, ws.max_row + 1):
        if not ws.cell(r, col['Telefon']).value:
            continue
        stc = ws.cell(r, col['Status'])
        if not stc.value:
            stc.value = 'Za slanje'
        key = (str(ws.cell(r, col['Telefon']).value), ws.cell(r, col['Offer']).value)
        if stc.value == 'Za slanje' and key in sent:
            stc.value = 'Duplikat'; dup += 1
        elif stc.value == 'Za slanje':
            todo += 1
    if old_log and po.LOG not in wb.sheetnames:
        lg = wb.create_sheet(po.LOG)
        lg.append(po.LOG_HEAD)
        for r in old_log:
            lg.append(list(r))
    wb.save(new_path)
    return todo, dup


# ---------------- HTML ----------------
CSS = """
body{font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f6f7f9;color:#1d2330}
main{max-width:1060px;margin:0 auto;padding:24px 18px 60px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:0 0 12px}
.sub{color:#5b6475;margin:0 0 20px}.card{background:#fff;border:1px solid #e3e6ec;border-radius:10px;padding:18px;margin:0 0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:7px 9px;border-bottom:1px solid #eceef2;text-align:left}
th{background:#f1f3f6;font-weight:600}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.btn{display:inline-block;background:#1f4e78;color:#fff;border:0;border-radius:7px;padding:9px 14px;font:inherit;cursor:pointer;text-decoration:none}
.btn.sec{background:#fff;color:#1f4e78;border:1px solid #1f4e78}.btn.warn{background:#c65911}
label{display:block;margin:0 0 10px}input,select{font:inherit;padding:7px;border:1px solid #c9ced8;border-radius:6px}
.pill{display:inline-block;padding:2px 9px;border-radius:99px;font-size:13px;font-weight:600}
.on{background:#e3f4e8;color:#1b6b34}.off{background:#f4e6e3;color:#8a2c17}
.msg{padding:10px 14px;border-radius:8px;margin:0 0 16px}.ok{background:#e3f4e8}.err{background:#fbe5e1}
pre{background:#11161f;color:#d9e1ee;padding:12px;border-radius:8px;overflow:auto;font-size:13px;max-height:260px}
.small{font-size:13px;color:#5b6475}.bad{color:#a5281b}
"""


def esc(v):
    return html.escape('' if v is None else str(v))


def page(msg=None, kind='ok'):
    st = load_state()
    has = os.path.exists(LIST)
    try:
        per, log = po.summary(LIST) if has else ({}, [])
    except Exception:  # fajl se upravo upisuje
        per, log = {}, []
    totals = {k: sum(d[k] for d in per.values()) for k in ('Za slanje', 'Poslato', 'Greška', 'ostalo')}
    refresh = '<meta http-equiv="refresh" content="5">' if job['running'] else ''
    t = now()
    hh, mm = map(int, st['send_time'].split(':'))
    nxt = t.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if st.get('last_auto_date') == t.strftime('%Y-%m-%d') or t >= nxt + timedelta(hours=AUTO_WINDOW_H):
        nxt += timedelta(days=1)
    days_left = -(-totals['Za slanje'] // max(int(st['daily_limit']), 1)) if totals['Za slanje'] else 0
    offers = sorted(per)
    rows = ''.join(f"<tr><td>{esc(o)}</td><td class=n>{per[o]['Za slanje']:,}</td><td class=n>{per[o]['Poslato']:,}</td>"
                   f"<td class=n>{per[o]['Greška']:,}</td><td class=n>{per[o]['ostalo']:,}</td></tr>" for o in offers)
    rows += (f"<tr><th>Ukupno</th><th class=n>{totals['Za slanje']:,}</th><th class=n>{totals['Poslato']:,}</th>"
             f"<th class=n>{totals['Greška']:,}</th><th class=n>{totals['ostalo']:,}</th></tr>") if offers else ''
    opt = ''.join(f'<option>{esc(o)}</option>' for o in offers)
    logrows = ''.join(
        '<tr>' + ''.join(f'<td>{esc(c)}</td>' for c in (r[0], r[2], r[4], r[5], r[8], r[10])) +
        f'<td class="small{" bad" if r[8] != "Poslato" else ""}">{esc(r[11])}</td><td class=small>{esc(r[12] if len(r) > 12 else "")}</td></tr>'
        for r in log[:100])
    m = f'<div class="msg {kind}">{esc(msg)}</div>' if msg else ''
    run = ''
    if job['running'] or job['lines']:
        run = (f"<div class=card><h2>{'Slanje u toku…' if job['running'] else 'Poslednje slanje'} "
               f"<span class=small>({esc(job['source'])}, {esc(job['started'])})</span></h2>"
               f"<pre>{esc(chr(10).join(job['lines'][-80:]))}</pre></div>")
    keyok = bool(po.load_key(ENV_FILE, KEY_VAR))
    return f"""<!doctype html><html lang=sr><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<meta name=robots content="noindex,nofollow">{refresh}<title>Slanje baze – MonadLead</title><style>{CSS}</style></head><body><main>
<h1>Slanje baze na MonadLead – Srbija</h1>
<p class=sub>Lista: <b>{esc(st.get('file_name') or '—')}</b>{(' · učitana ' + esc(st['uploaded'])) if st.get('uploaded') else ''}
 · API ključ: {'<span class="pill on">postoji</span>' if keyok else '<span class="pill off">nema</span>'}</p>
{m}{run}
<div class=grid>
 <div class=card><h2>Automatsko slanje</h2>
  <p>{'<span class="pill on">UKLJUČENO</span>' if st['auto'] else '<span class="pill off">ISKLJUČENO</span>'}
   &nbsp;{int(st['daily_limit'])} ordera svaki dan u {esc(st['send_time'])}</p>
  <p class=small>Sledeće: {nxt:%d.%m.%Y %H:%M} · poslednje automatsko: {esc(st.get('last_auto_date') or '—')}
   · ostalo za slanje ≈ {days_left} dana</p>
  <form method=post action="{BASE}/auto">
   <label>Ordera dnevno <input name=daily_limit type=number min=1 max=1000 value="{int(st['daily_limit'])}" style="width:90px"></label>
   <label>Vreme (Beograd) <input name=send_time type=time value="{esc(st['send_time'])}"></label>
   <button class=btn name=auto value=1>Uključi / sačuvaj</button>
   <button class="btn sec" name=auto value=0>Isključi</button>
  </form></div>
 <div class=card><h2>Ručno slanje</h2>
  <form method=post action="{BASE}/send">
   <label>Koliko <input name=limit type=number min=1 max=500 value=50 style="width:90px"></label>
   <label>Offer <select name=offer><option value="">Svi (srazmerno)</option>{opt}</select></label>
   <label><input type=checkbox name=dry_run value=1> Probno (ne šalje, samo pokaže koje bi poslao)</label>
   <button class="btn warn" {'disabled' if job['running'] or not has else ''}>Pošalji sad</button>
  </form>
  <form method=post action="{BASE}/send" style="margin-top:10px">
   <input type=hidden name=limit value=1><input type=hidden name=offer value="Pro Drops">
   <button class="btn sec" {'disabled' if job['running'] or not has else ''}>Test: 1 order na Pro Drops</button>
  </form></div>
</div>
<div class=card><h2>Stanje liste</h2>{'<table><tr><th>Offer</th><th class=n>Za slanje</th><th class=n>Poslato</th><th class=n>Greška</th><th class=n>Ostalo</th></tr>' + rows + '</table>' if has else '<p>Još nema liste.</p>'}
 <p style="margin-top:14px"><a class="btn sec" href="{BASE}/download">Preuzmi Excel sa beleškama</a>
 {f'<form method=post action="{BASE}/retry" style="display:inline"><button class="btn sec">Vrati greške u &quot;Za slanje&quot; ({totals["Greška"]})</button></form>' if totals['Greška'] and not job['running'] else ''}</p></div>
<div class=card><h2>Učitaj Excel listu</h2>
 <form method=post action="{BASE}/upload" enctype="multipart/form-data">
  <input type=file name=file accept=".xlsx" required> <button class=btn>Učitaj</button>
 </form>
 <p class=small>Fajl mora imati sheet "Za slanje" (kao Za_slanje_MonadLead_RS.xlsx). Nova lista zamenjuje staru; stara ostaje kao backup na serveru.
 Ko je već poslat (isti telefon + offer) dobija status "Duplikat" i neće biti poslat ponovo.</p></div>
<div class=card><h2>Dnevnik slanja <span class=small>(poslednjih 100)</span></h2>
 {'<table><tr><th>Vreme</th><th>Offer</th><th>Ime</th><th>Telefon</th><th>Rezultat</th><th>order_id</th><th>Greška</th><th>Pokrenuto</th></tr>' + logrows + '</table>' if logrows else '<p>Još ništa nije poslato.</p>'}</div>
</main></body></html>"""


# ---------------- HTTP ----------------
class H(BaseHTTPRequestHandler):
    server_version = 'nutra-bulk'

    def log_message(self, fmt, *a):  # bez query stringova i tela u logu
        sys.stderr.write(f'{self.address_string()} {self.command} {urlsplit(self.path).path} {a[1] if len(a) > 1 else ""}\n')

    def _auth(self):
        h = self.headers.get('Authorization', '')
        if h.startswith('Basic '):
            try:
                u, _, p = base64.b64decode(h[6:]).decode('utf-8').partition(':')
                if hmac.compare_digest(u, USER) and hmac.compare_digest(p, PASSWORD):
                    return True
            except Exception:
                pass
        self.send_response(401)
        self.send_header('WWW-Authenticate', 'Basic realm="nutra-api", charset="UTF-8"')
        self.send_header('Content-Length', '0')
        self.end_headers()
        return False

    def _same_origin(self):
        src = self.headers.get('Origin') or self.headers.get('Referer') or ''
        host = self.headers.get('X-Forwarded-Host') or self.headers.get('Host') or ''
        return bool(src) and urlsplit(src).netloc == host

    def _send(self, code, body, ctype='text/html; charset=utf-8', extra=None):
        b = body if isinstance(body, bytes) else body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Robots-Tag', 'noindex, nofollow')
        self.send_header('X-Frame-Options', 'DENY')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(b)

    def _route(self):
        p = urlsplit(self.path).path.rstrip('/')
        if not (p == BASE or p.startswith(BASE + '/')):
            return None
        return p[len(BASE):] or '/'

    def _redirect(self, msg=None, kind='ok'):
        flash[:] = [(msg, kind)] if msg else []
        self.send_response(303)
        self.send_header('Location', BASE + '/')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        r = self._route()
        if r is None:
            return self._send(404, 'Not found', 'text/plain')
        if not self._auth():
            return
        if r == '/':
            msg, kind = flash.pop() if flash else (None, 'ok')
            return self._send(200, page(msg, kind))
        if r == '/download':
            if not os.path.exists(LIST):
                return self._send(404, 'Nema liste', 'text/plain')
            with lock if not job['running'] else _nolock():
                data = open(LIST, 'rb').read()
            fn = f"slanje_{now():%Y-%m-%d_%H%M}.xlsx"
            return self._send(200, data, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                              {'Content-Disposition': f'attachment; filename="{fn}"'})
        if r == '/status.json':
            st = load_state()
            try:
                per = po.summary(LIST)[0] if os.path.exists(LIST) else {}
            except Exception:  # fajl se upravo upisuje
                per = None
            return self._send(200, json.dumps({'running': job['running'], 'auto': st['auto'], 'per_offer': per},
                                              ensure_ascii=False), 'application/json')
        # npr. osvežen /send posle slanja – vrati na glavnu stranu
        self.send_response(303); self.send_header('Location', BASE + '/'); self.send_header('Content-Length', '0'); self.end_headers()

    def do_POST(self):
        r = self._route()
        if r is None:
            return self._send(404, 'Not found', 'text/plain')
        if not self._auth():
            return
        if not self._same_origin():
            return self._send(403, 'Zabranjeno (origin)', 'text/plain')
        n = int(self.headers.get('Content-Length') or 0)
        if n > MAX_UPLOAD:
            return self._send(413, 'Fajl je prevelik', 'text/plain')
        body = self.rfile.read(n)
        if r == '/upload':
            return self._upload(body)
        f = {k: v[0] for k, v in parse_qs(body.decode('utf-8')).items()}
        if r == '/send':
            try:
                limit = max(1, min(500, int(f.get('limit') or 50)))
            except ValueError:
                return self._redirect('Neispravan broj.', 'err')
            dry = f.get('dry_run') == '1'
            err = start_job(limit, f.get('offer') or None, dry, 'probno' if dry else 'ručno')
            return self._redirect(err or f'Pokrenuto slanje: {limit}' + (' (probno)' if dry else ''), 'err' if err else 'ok')
        if r == '/retry':
            if job['running'] or not os.path.exists(LIST):
                return self._redirect('Ne može sada (slanje u toku ili nema liste).', 'err')
            with lock:
                n = po.reset_errors(LIST)
            return self._redirect(f'Vraćeno u "Za slanje": {n}')
        if r == '/auto':
            st = load_state()
            try:
                st['daily_limit'] = max(1, min(1000, int(f.get('daily_limit') or st['daily_limit'])))
                tm = f.get('send_time') or st['send_time']
                datetime.strptime(tm, '%H:%M')
                st['send_time'] = tm
            except ValueError:
                return self._redirect('Neispravan broj ili vreme.', 'err')
            st['auto'] = f.get('auto') == '1'
            if st['auto'] and not po.load_key(ENV_FILE, KEY_VAR):
                return self._redirect(f'Na serveru nema API ključa ({KEY_VAR}); automatsko slanje nije uključeno.', 'err')
            save_state(st)
            return self._redirect('Automatsko slanje ' + (f"uključeno: {st['daily_limit']} dnevno u {st['send_time']}."
                                                          if st['auto'] else 'isključeno.'))
        return self._send(404, 'Not found', 'text/plain')

    def _upload(self, body):
        ctype = self.headers.get('Content-Type', '')
        if 'multipart/form-data' not in ctype:
            return self._redirect('Pogrešan format zahteva.', 'err')
        msg = BytesParser(policy=email_policy).parsebytes(b'Content-Type: ' + ctype.encode() + b'\r\n\r\n' + body)
        part = next((p for p in msg.iter_parts() if p.get_param('name', header='content-disposition') == 'file'), None)
        data = part.get_payload(decode=True) if part else None
        if not data:
            return self._redirect('Nije izabran fajl.', 'err')
        if job['running']:
            return self._redirect('Slanje je u toku – učitaj kad se završi.', 'err')
        tmp = os.path.join(DATA, 'upload.tmp.xlsx')
        open(tmp, 'wb').write(data)
        err = po.check_workbook(tmp)
        if err:
            os.remove(tmp)
            return self._redirect(err, 'err')
        with lock:
            todo, dup = merge_upload(tmp)
            if os.path.exists(LIST):
                shutil.copy2(LIST, os.path.join(DATA, f'backup_{now():%Y%m%d_%H%M%S}.xlsx'))
            os.replace(tmp, LIST)
        st = load_state()
        st['uploaded'] = now().strftime('%d.%m.%Y %H:%M')
        st['file_name'] = os.path.basename(part.get_filename() or 'lista.xlsx')
        save_state(st)
        return self._redirect(f'Lista učitana: {todo:,} za slanje' + (f', {dup:,} već poslatih označeno kao Duplikat.' if dup else '.'))


class _nolock:
    def __enter__(self): return self
    def __exit__(self, *a): return False


def main():
    if not PASSWORD:
        sys.exit('Postavi BULK_ADMIN_PASSWORD (lozinka za stranicu).')
    os.makedirs(DATA, exist_ok=True)
    threading.Thread(target=scheduler, daemon=True).start()
    print(f'nutra-bulk na http://{HOST}:{PORT}{BASE}/  (podaci: {DATA})', flush=True)
    ThreadingHTTPServer((HOST, PORT), H).serve_forever()


if __name__ == '__main__':
    main()
