#!/usr/bin/env python3
"""Gate before publishing the Prepline Pro LIVE build.
    python3 release/check_live_ready.py <publish-dir> [--zip path/to/Prepline-Pro-Windows.zip] [--allow-placeholders]
Checks: live mode; no TODO_LIVE placeholders (unless --allow-placeholders); no Lemon Squeezy TEST-mode ids or
checkout links; no 'ls-test'; no placeholder support address; legal pages present with no TODO/ABN/DRAFT;
the paid Pro zip/html is NOT in the public publish set; and the anonymity grep (no personal names, workplace,
personal accounts or e-mail addresses other than autoprod.help@gmail.com) over every file, including inside the zip."""
import os, re, sys, zipfile, io
args = [x for x in sys.argv[1:] if not x.startswith('--')]
if not args: sys.exit(__doc__)
D = args[0]; ZIP = None; allow = '--allow-placeholders' in sys.argv
if '--zip' in sys.argv: ZIP = sys.argv[sys.argv.index('--zip') + 1]
fails = []; notes = []
def fail(m): fails.append(m)
ANON = re.compile(r"gerard|payumo|gerardo|snootfood|baxter|\bICC\b|international convention|gerardpayumo", re.I)
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
EMAIL_OK = {'autoprod.help@gmail.com'}
TEST = re.compile(r"1395962|1395968|2179964|2179971|2179974|1395983|2179990|1395989|2179996|26141028-ac72|bbdeab5d-7ff3|d69e7ed5-d47d|b651f763|a60fb931")
VENDOR = re.compile(r"(^|/)vendor/|xlsx\.full\.min\.js$|pdf(\.worker)?\.min\.m?js$")
def scan(name, data):
    try: t = data.decode('utf-8')
    except UnicodeDecodeError: return    # binary (png, woff2, ico): no text to leak
    vendor = bool(VENDOR.search(name))
    if name.endswith('.html'):   # offline single-file builds inline pdf.js / SheetJS: library code, scanned as vendor
        t, n = re.subn(r'<script type="text/x-inline-module" id="pdfjs[\w-]*-src">.*?</script>|<!-- SheetJS xlsx 0\.18\.5 [^>]*inlined for offline use[^>]*-->\s*<script>.*?</script>', '', t, flags=re.S)
        if n: notes.append(f'{name}: {n} inlined vendor library block(s) (pdf.js/SheetJS) skipped')
    for m in ANON.finditer(t):
        ctx = t[max(0, m.start()-50):m.end()+50].replace('\n', ' ')
        # pdf.js handles "ICC" colour profiles (ICCBased); that's library code, not identity
        if vendor and m.group(0).upper() == 'ICC': notes.append(f'{name}: vendor library mentions ICC colour profiles (ok)'); continue
        fail(f'ANONYMITY {name}: {m.group(0)!r} …{ctx}…')
    if not vendor:
        for m in EMAIL.finditer(t):
            e = m.group(0).rstrip('.')
            if e.lower() not in EMAIL_OK and not re.search(r'\.(png|jpg|svg|webp|js|mjs|css|woff2?)$', e) and not e.endswith('@2x'):
                fail(f'EMAIL {name}: {e}')
    if 'autoprod.example' in t: fail(f'{name}: placeholder support address')
    if TEST.search(t): fail(f'{name}: Lemon Squeezy TEST-mode id/link: {TEST.search(t).group(0)}')
    if 'TODO_LIVE' in t: (notes if allow else fails).append(f'{name}: {t.count("TODO_LIVE")} TODO_LIVE placeholder(s)')
files = []
for r, ds, fs in os.walk(D):
    ds[:] = [d for d in ds if d not in ('.git', 'node_modules')]
    for f in fs: files.append(os.path.relpath(os.path.join(r, f), D))
for rel in sorted(files):
    if re.search(r'Prepline-Pro-(Windows\.zip|offline\.html)$', rel): fail(f'PAID FILE in public set: {rel}')
    data = open(os.path.join(D, rel), 'rb').read()
    if rel.endswith('.zip'):
        for zi in zipfile.ZipFile(io.BytesIO(data)).infolist(): scan(f'{rel}!{zi.filename}', zipfile.ZipFile(io.BytesIO(data)).read(zi))
    else: scan(rel, data)
idx = os.path.join(D, 'index.html')
if os.path.exists(idx):
    h = open(idx, encoding='utf-8').read()
    if not re.search(r"mode:\s*['\"]live['\"]", h): fail('index.html: LICENSE_CONFIG not in live mode')
    if re.search(r"mode:\s*['\"]ls-test['\"]", h): fail("index.html: still has mode 'ls-test'")
    for f in ('terms.html', 'privacy.html', 'refunds.html'):
        if f not in h: fail(f'index.html: no link to {f}')
else: fail('no index.html')
for f in ('terms.html', 'privacy.html', 'refunds.html'):
    p = os.path.join(D, f)
    if not os.path.exists(p): fail(f'missing {f}'); continue
    t = open(p, encoding='utf-8').read()
    for m in re.finditer(r'TODO|\bABN\b|DRAFT|NOT LEGAL ADVICE', t): fail(f'{f}: {m.group(0)}')
    if 'autoprod.help@gmail.com' not in t or 'Autoprod' not in t: fail(f'{f}: seller/contact missing')
if ZIP:
    z = zipfile.ZipFile(ZIP)
    for zi in z.infolist(): scan(f'ZIP:{os.path.basename(ZIP)}!{zi.filename}', z.read(zi))
    zh = z.read('Prepline Pro.html').decode('utf-8')
    if not re.search(r"var LICENSE_CONFIG = \{\n  mode: 'live',[^\n]*\n  edition: 'offline-pro',", zh): fail('zip: not live + offline-pro')
print(f'scanned {len(files)} files in {D}' + (f' + {ZIP}' if ZIP else ''))
for n in sorted(set(notes)): print('  note:', n)
if fails:
    print(f'FAIL ({len(fails)}):'); [print('  ', f[:300]) for f in fails]; sys.exit(1)
print('PASS: live mode, no test ids, no placeholders' + (' (placeholders allowed)' if allow else '') + ', legal pages ok, no paid file, anonymity clean')
