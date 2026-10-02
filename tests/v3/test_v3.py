# Headless Chromium tests for Prepline v3 (Gerard's 2026-10-02 baseline + Prepline/Pro layer + tweaks).
# Usage: python3 test_v3.py URL [shots_dir] [out_dir] [--expect-version X]
import sys, os, json, re, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
import openpyxl
URL = sys.argv[1]
SHOTS = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else '/workspace/prepline-v2-shots'
OUT = sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else '/workspace/prepline-v3-test-out'
EXPECT_VER = sys.argv[sys.argv.index('--expect-version')+1] if '--expect-version' in sys.argv else None
S = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'samples') + '/'
os.makedirs(SHOTS, exist_ok=True); os.makedirs(OUT, exist_ok=True)
results = []; ext = {}
def check(name, ok, info=''):
    results.append({'test': name, 'ok': bool(ok), 'info': str(info)[:600]}); print(('PASS ' if ok else 'FAIL ') + name + ('  | ' + str(info)[:300] if info else ''))
def track(ctx):
    def on_req(r):
        h = urlparse(r.url).hostname or ''
        if h not in ('localhost', '127.0.0.1') and not r.url.startswith(('data:', 'blob:')):
            ext.setdefault(h, set()).add(r.method + ' ' + r.url.split('?')[0][:140])
    ctx.on('request', on_req)
def new_ctx(b, w=1280, h=900, **kw):
    ctx = b.new_context(viewport={'width': w, 'height': h}, accept_downloads=True, **kw); track(ctx)
    ls = []
    ctx.route(re.compile(r'.*lemonsqueezy\.com/checkout.*'), lambda route: (ls.append(route.request.url), route.abort()))
    return ctx, ls
def page_with_errs(ctx):
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append('console: ' + m.text[:200]))
    return pg, errs
def wait_status(pg, pat, t=20000):
    pg.wait_for_function("p => new RegExp(p).test(document.getElementById('statusMsg').textContent)", arg=pat, timeout=t)
    return pg.inner_text('#statusMsg')
def capture_print(pg, fn_js):
    pg.evaluate("window.__prints=[]; window.printViaIframe = h => window.__prints.push(h);")
    pg.evaluate(fn_js); pg.wait_for_function("window.__prints.length>0", timeout=10000)
    return pg.evaluate("window.__prints[window.__prints.length-1]")
def export_view(pg, view, fname):
    pg.evaluate(f"setView('{view}')"); pg.wait_for_timeout(300)
    btn = pg.locator('button:has-text("📊 Export to Excel (editable)")')
    n = btn.count()
    with pg.expect_download() as dl: btn.first.click()
    path = os.path.join(OUT, fname); dl.value.save_as(path)
    return path, n, btn.first.inner_text()
def xlsx_info(path):
    wb = openpyxl.load_workbook(path)
    info = {}
    for ws in wb.worksheets:
        vals = [[c.value for c in row] for row in ws.iter_rows()]
        info[ws.title] = {'images': len(getattr(ws, '_images', [])), 'rows': ws.max_row,
                          'first': vals[0][0] if vals else None,
                          'formulas': sum(1 for row in vals for v in row if isinstance(v, str) and v.startswith('=')),
                          'header': next((r for r in vals if r and r[0] == 'Item'), None)}
    return info

with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------- A. load ----------
    ctx, ls = new_ctx(b); pg, errs = page_with_errs(ctx)
    pg.goto(URL); pg.wait_for_load_state('networkidle')
    ver = pg.get_attribute('meta[name="prepline-version"]', 'content')
    check('load: title is Prepline', pg.title().startswith('Prepline'), pg.title())
    check('load: version string present' + (f' = {EXPECT_VER}' if EXPECT_VER else ''), ver and (not EXPECT_VER or ver == EXPECT_VER) and ('v' + ver) in pg.inner_text('#appVersion'), ver)
    check('load: TEST MODE badge visible', pg.is_visible('#plTestBadge') and 'TEST MODE' in pg.inner_text('#plTestBadge'), pg.inner_text('#plTestBadge'))
    check('load: Upgrade + Enter licence key buttons', pg.is_visible('#proUpgradeBtn') and pg.is_visible('#licenceKeyBtn'))
    check('load: no JS errors', not errs, errs)
    pg.screenshot(path=f'{SHOTS}/00-load-desktop.png')
    # ---------- B. PDF sort + method capture ----------
    pg.set_input_files('#fileInput', S + 'sample-recipes.pdf')
    st = wait_status(pg, 'Sorted|Could not')
    rows = pg.evaluate('ROWS.length'); crops = pg.evaluate('Object.fromEntries(Object.entries(methodCrops).map(([k,v])=>[k,v.length]))')
    secs = pg.evaluate('[...new Set(ROWS.map(r=>r.section))]')
    check('PDF: prep list sorted (9 items, 2 dishes)', rows == 9 and 'Sorted' in st, st)
    check('PDF: items split into sections', len(secs) >= 2, secs)
    check('PDF: method crop captured for each dish', len(crops) == 2 and all(v >= 1 for v in crops.values()), crops)
    check('PDF: "View original" button per dish', pg.locator('button:has-text("View original")').count() == 2)
    pg.evaluate("setView('dish')"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('#resultsArea .viewtoggle').scrollIntoView()"); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{SHOTS}/01-prep-list-by-dish-desktop.png', full_page=False)
    html = capture_print(pg, "printDish(encodeURIComponent(Object.keys(methodCrops)[0]))")
    check('method: printed dish sheet has the Method crop below the prep list', 'Method reference' in html and 'data:image/jpeg' in html and html.index('Method reference') > html.index('<table'), len(html))
    pp = ctx.new_page(); pp.set_viewport_size({'width': 900, 'height': 1200}); pp.set_content(html); pp.emulate_media(media='print'); pp.wait_for_timeout(800)
    pp.screenshot(path=f'{SHOTS}/02-method-captured-below-prep-list.png', full_page=True); pp.close()
    for fn, lbl in [('printAllSections()', 'sections'), ('printAllDays()', 'days')]:
        h = capture_print(pg, fn); check(f'print all {lbl}: builds with method crops', 'Method reference' in h, len(h))
    labels = pg.locator('button:has-text("Print all")').all_inner_texts()
    check('tweak 1: print button labels', labels == ['🖨️ Print all sections (one page complete)', '🖨️ Print all prep days (one page complete)'], labels)
    # ---------- C. reload ----------
    errs.clear(); pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(800)
    txt = pg.inner_text('#resultsArea') if pg.locator('#resultsArea').count() else pg.inner_text('body')
    check('reload: list restored, no blank page, no errors', pg.evaluate('ROWS.length') == 9 and 'Pumpkin' in txt and not errs, errs)
    check('reload: method crops survive reload', len(pg.evaluate('Object.keys(methodCrops)')) == 2)
    # ---------- D. image-only inputs (does anything do OCR / call out?) ----------
    before = {h: set(v) for h, v in ext.items()}
    pg.set_input_files('#fileInput', S + 'recipe-screenshot-only.pdf'); st2 = wait_status(pg, 'Could not|Sorted', 30000)
    check('screenshot-only PDF (no text layer): not read, no OCR', 'Could not' in st2, st2)
    pg.set_input_files('#fileInput', S + 'recipe-screenshot.png'); pg.wait_for_timeout(2500)
    st3 = pg.inner_text('#statusMsg')
    check('PNG screenshot upload: not supported (accept=.xlsx,.xls,.pdf)', pg.get_attribute('#fileInput', 'accept') == '.xlsx,.xls,.pdf' and 'Sorted' not in st3, st3)
    newreq = {h: v - before.get(h, set()) for h, v in ext.items() if v - before.get(h, set())}
    check('image inputs: no new outside requests', not newreq, newreq)
    # ---------- E. licence ----------
    pg.click('#licenceKeyBtn'); pg.fill('#plKey', 'NOT-A-KEY'); pg.click('#plActivate'); pg.wait_for_timeout(1500)
    check('licence: made-up key refused', 'pl-msg err' in (pg.get_attribute('#plLicMsg', 'class') or ''), pg.inner_text('#plLicMsg'))
    pg.fill('#plKey', 'TEST-PRO-YEARLY'); pg.click('#plActivate'); pg.wait_for_timeout(800)
    check('licence: TEST-PRO-YEARLY unlocks Pro', pg.evaluate('AutoprodLicence.isPro()') and 'Pro' in pg.inner_text('#plTestBadge'), pg.inner_text('#plTestBadge'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    check('licence: Pro panel shows (templates, stations, kitchens)', 'Saved templates' in pg.inner_text('#proPanel') and not pg.is_visible('#licenceKeyBtn'))
    pg.screenshot(path=f'{SHOTS}/03-pro-unlocked-desktop.png')
    pg.reload(); pg.wait_for_load_state('networkidle')
    check('licence: Pro survives reload', pg.evaluate('AutoprodLicence.isPro()'))
    # append (Pro)
    pg.set_input_files('#fileInput', S + 'sample-recipes.pdf'); wait_status(pg, 'Sorted')
    pg.set_input_files('#appendInput', S + 'sample-recipes.pdf'); st4 = wait_status(pg, 'Appended|Could not', 30000)
    check('Pro: append another PDF keeps list + method crops', 'Appended' in st4 and pg.evaluate('ROWS.length') == 18 and len(pg.evaluate('Object.keys(methodCrops)')) == 4, st4[:160])
    for k in ['TEST-PRO-MONTHLY', 'TEST-PRO-LIFETIME']:
        r = pg.evaluate(f"AutoprodLicence.deactivate().then(()=>AutoprodLicence.activate('{k}')).then(r=>r.ok && AutoprodLicence.plan())")
        check(f'licence: {k} unlocks', r in ('monthly', 'lifetime'), r)
    pg.evaluate('AutoprodLicence.deactivate()'); pg.wait_for_timeout(300)
    check('licence: deactivate returns to free', not pg.evaluate('AutoprodLicence.isPro()'))
    # ---------- F. checkout links ----------
    want = {'monthly': 'https://autoprod-dev.lemonsqueezy.com/checkout/buy/26141028-ac72-45a5-95d5-07ebf96e9a2e?enabled=2179964',
            'yearly': 'https://autoprod-dev.lemonsqueezy.com/checkout/buy/bbdeab5d-7ff3-48e8-88d1-5d0fec3c620c?enabled=2179971',
            'lifetime': 'https://autoprod-dev.lemonsqueezy.com/checkout/buy/d69e7ed5-d47d-40af-8d17-a7e599a89314?checkout%5Bdiscount_code%5D=LAUNCH50'}
    pg.click('#proUpgradeBtn'); pg.wait_for_timeout(300)
    got = {}
    for plan in ['monthly', 'yearly', 'lifetime']:
        with ctx.expect_page() as pop: pg.click(f'#plUpgradeDialog [data-plan="{plan}"]')
        pop.value.wait_for_timeout(500); got[plan] = ls[-1] if ls else None; pop.value.close()
    for plan in want: check(f'checkout: Buy {plan} opens the test-mode LS checkout', got[plan] == want[plan], got[plan])
    check('checkout: page stays on the app', pg.url.startswith(URL.split('#')[0].rsplit('/', 1)[0]))
    pg.keyboard.press('Escape')
    # ---------- G. exports ----------
    exp = {}
    pg.set_input_files('#fileInput', S + 'sample-multisheet.xlsx'); stx = wait_status(pg, 'Sorted|Could not')
    check('xlsx: multi-sheet workbook sorted', 'Sorted' in stx, stx)
    src_tabs = openpyxl.load_workbook(S + 'sample-multisheet.xlsx').sheetnames
    for view, fn in [('dish', 'xlsx-by-dish.xlsx'), ('section', 'xlsx-by-section.xlsx'), ('priority', 'xlsx-by-day.xlsx')]:
        path, n, label = export_view(pg, view, fn); info = xlsx_info(path); exp[fn] = info
        check(f'tweak 2: {view} view has its own "📊 Export to Excel (editable)" button', n == 1 and label.strip() == '📊 Export to Excel (editable)', label)
        check(f'export {fn}: editable cells, no images, Item header', all(v['images'] == 0 and v['header'] for v in info.values()), {k: (v['rows'], v['formulas']) for k, v in info.items()})
    check('tweak 3: By dish tabs = imported workbook tabs (same names, same order)', list(exp['xlsx-by-dish.xlsx']) == src_tabs, (list(exp['xlsx-by-dish.xlsx']), src_tabs))
    wbd = openpyxl.load_workbook(os.path.join(OUT, 'xlsx-by-dish.xlsx'))
    staff = [r[0].value for r in wbd['Staff Meal'].iter_rows() if r[0].value in ('Chicken Curry', 'Steamed Rice')]
    check('tweak 3: a source tab with two dishes exports as one tab with both', staff == ['Chicken Curry', 'Steamed Rice'], staff)
    check('export: Total needed is a live formula (editable)', sum(v['formulas'] for v in exp['xlsx-by-dish.xlsx'].values()) > 0)
    check('export: section/day views use section/day tab names', set(exp['xlsx-by-section.xlsx']) <= set(x[:31].strip() for x in pg.evaluate('SECTIONS')) and set(exp['xlsx-by-day.xlsx']) <= set(pg.evaluate("[...WEEKDAYS,'Unscheduled']")), (list(exp['xlsx-by-section.xlsx']), list(exp['xlsx-by-day.xlsx'])))
    # round trip
    pg.set_input_files('#fileInput', os.path.join(OUT, 'xlsx-by-dish.xlsx')); wait_status(pg, 'Sorted|Could not')
    dishes_rt = pg.evaluate('[...new Set(ROWS.map(r=>r.dish))]')
    check('round trip: re-uploaded By dish export gives the same dishes', sorted(dishes_rt) == sorted(['Beef Fillet Sat', 'Tuna Tartare Canapé', 'Pavlova (GF) - Sunday Lunch Mkt', 'Chicken Curry', 'Steamed Rice']), dishes_rt)
    path, _, _ = export_view(pg, 'dish', 'xlsx-by-dish-roundtrip.xlsx')
    check('round trip: second export keeps the same tab names', openpyxl.load_workbook(path).sheetnames == src_tabs, openpyxl.load_workbook(path).sheetnames)
    # sanitiser
    names = pg.evaluate("""(()=>{const u=new Set(); return ['Mains: Beef [Sat]','mains- beef -sat-',"'Quoted'",'History','A'.repeat(40),'A'.repeat(40),'Tab?/*\\\\x'].map(n=>safeSheetName(n,u));})()""")
    ok = all(len(n) <= 31 and not re.search(r'[\[\]:*?/\\]', n) for n in names) and len({n.lower() for n in names}) == len(names) and names[2] == 'Quoted' and names[3] != 'History'
    check('sheet-name sanitiser: 31 chars, no []:*?/\\, unique (case-insensitive), no History/apostrophes', ok, names)
    # PDF exports
    pg.set_input_files('#fileInput', S + 'sample-recipes.pdf'); wait_status(pg, 'Sorted')
    for view, fn in [('dish', 'pdf-by-dish.xlsx'), ('section', 'pdf-by-section.xlsx'), ('priority', 'pdf-by-day.xlsx')]:
        path, n, label = export_view(pg, view, fn); info = xlsx_info(path); exp[fn] = info
        check(f'export {fn}: tabs + editable cells', info and all(v['images'] == 0 for v in info.values()), list(info))
    # free multi-PDF (Gerard behaviour kept)
    pg.set_input_files('#fileInput', [S + 'sample-recipes.pdf', '/home/box/prototypes/monetise/tests/samples/sample-prep-B.pdf']); st5 = wait_status(pg, 'Sorted|Could not', 30000)
    check('free plan: several PDFs at once still allowed (Gerard behaviour)', len(set(pg.evaluate('ROWS.map(r=>r.dish)'))) == 3, st5[:120])
    ctx.close()
    # ---------- H. phone width ----------
    ctx, _ = new_ctx(b, 390, 844, is_mobile=True, has_touch=True, device_scale_factor=2); pg, errs = page_with_errs(ctx)
    pg.goto(URL); pg.wait_for_load_state('networkidle')
    pg.set_input_files('#fileInput', S + 'sample-recipes.pdf'); wait_status(pg, 'Sorted')
    sw = pg.evaluate('document.documentElement.scrollWidth')
    check('phone 390px: loads, sorts, no JS errors', not errs and pg.evaluate('ROWS.length') == 9, errs)
    check('phone 390px: version string visible in page', pg.get_attribute('meta[name="prepline-version"]', 'content') == ver)
    pg.screenshot(path=f'{SHOTS}/04-phone-390.png', full_page=False)
    results.append({'test': 'phone scrollWidth (info)', 'ok': True, 'info': sw})
    ctx.close(); b.close()

print('\nEXTERNAL REQUESTS:')
for h in sorted(ext):
    print(' ', h); [print('    ', u) for u in sorted(ext[h])]
bad = [h for h in ext if re.search(r'anthropic|openai|claude|generativelanguage|vision|ocr|tesseract|azure|aws|huggingface', h)]
check('network: no AI/OCR service hosts contacted', not bad, bad)
json.dump({'url': URL, 'version': ver, 'results': results, 'external': {h: sorted(v) for h, v in ext.items()}}, open(os.path.join(OUT, 'results.json'), 'w'), indent=1)
fails = [r for r in results if not r['ok']]
print(f'\n{len(results)-len(fails)}/{len(results)} passed')
sys.exit(1 if fails else 0)
