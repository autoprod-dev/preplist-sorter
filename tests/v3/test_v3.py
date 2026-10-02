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
def up(pg, files):
    pg.evaluate("document.getElementById('fileInput').value=''; document.getElementById('statusMsg').textContent=''"); pg.set_input_files('#fileInput', files)
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
    up(pg, S + 'sample-recipes.pdf')
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
    errs.clear(); pg.wait_for_timeout(1000); pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(800)
    txt = pg.inner_text('#resultsArea') if pg.locator('#resultsArea').count() else pg.inner_text('body')
    check('reload: list restored, no blank page, no errors', pg.evaluate('ROWS.length') == 9 and 'Pumpkin' in txt and not errs, errs)
    check('reload: method crops survive reload', len(pg.evaluate('Object.keys(methodCrops)')) == 2)
    # ---------- D. image-only inputs (does anything do OCR / call out?) ----------
    before = {h: set(v) for h, v in ext.items()}
    up(pg, S + 'recipe-screenshot-only.pdf'); st2 = wait_status(pg, 'Could not|Sorted', 30000)
    check('screenshot-only PDF (no text layer): not read, no OCR', 'Could not' in st2, st2)
    up(pg, S + 'recipe-screenshot.png'); pg.wait_for_timeout(2500)
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
    pg.wait_for_timeout(1000); pg.reload(); pg.wait_for_load_state('networkidle')
    check('licence: Pro survives reload', pg.evaluate('AutoprodLicence.isPro()'))
    # append (Pro)
    up(pg, S + 'sample-recipes.pdf'); wait_status(pg, 'Sorted')
    pg.evaluate("document.getElementById('statusMsg').textContent=''"); pg.set_input_files('#appendInput', S + 'sample-recipes.pdf'); st4 = wait_status(pg, 'Appended|Could not', 30000)
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
    # ---------- G. exports: tab names + Source tab ----------
    def src_tabs_xml(path):
        import zipfile, html as _h
        x = zipfile.ZipFile(path).read('xl/workbook.xml').decode('utf-8')
        return [_h.unescape(n) for n in re.findall(r'<sheet\b[^>]*?\bname="([^"]*)"', x)]
    def excel_rule(names):
        out, used = [], set()
        for o in names:
            t = re.sub(r'[\\/?*\[\]:]', '-', o).strip("'")[:31] or 'Sheet'
            if t.lower() == 'history': t = 'History-1'
            f, n = t, 2
            while f.lower() in used: f = t[:31-len(f'-{n}')] + f'-{n}'; n += 1
            used.add(f.lower()); out.append(f)
        return out
    def rows_of(path):
        wb = openpyxl.load_workbook(path); out = []
        for ws in wb.worksheets:
            hdr = None
            for row in ws.iter_rows(values_only=True):
                if row and row[0] == 'Item': hdr = list(row); continue
                if hdr and row and row[0] and len(row) > 6 and row[6] is not None:
                    out.append((ws.title, row[0], row[6]))
        return out, wb
    def check_exports(src_label, expect_tabs, task_src):
        for view, fn in [('dish', f'{src_label}-by-dish.xlsx'), ('section', f'{src_label}-by-section.xlsx'), ('priority', f'{src_label}-by-day.xlsx')]:
            path, n, label = export_view(pg, view, fn); info = xlsx_info(path); exp[fn] = info
            st = pg.inner_text('#statusMsg')
            check(f'{src_label} {view}: own "📊 Export to Excel (editable)" button', n == 1 and label.strip() == '📊 Export to Excel (editable)', label)
            check(f'{src_label} {view}: editable cells, no images, Item + Source tab header', all(v['images'] == 0 and v['header'] and v['header'][6] == 'Source tab' for v in info.values()), list(info))
            rows, wb = rows_of(path)
            bad = [(t, it, sv) for (t, it, sv) in rows if task_src.get(it) != sv]
            check(f'{src_label} {view}: Source tab column = exact original name on every row ({len(rows)} rows)', rows and not bad, bad[:4])
            if view == 'dish':
                check(f'{src_label} by dish: tab names = original names (Excel-forced changes only), same order', src_tabs_xml(path) == expect_tabs, (src_tabs_xml(path), expect_tabs))
                exp_changes = sum(1 for a, b2 in zip(list(dict.fromkeys(task_src.values())), expect_tabs) if a != b2)
                check(f'{src_label} by dish: every forced rename is reported', (exp_changes == 0 and 'changed because Excel requires it' not in st) or (f'{exp_changes} tab name' in st), st[:300])
            else:
                check(f'{src_label} {view}: tabs are section/day names', all(t in [x[:31] for x in pg.evaluate("[...SECTIONS, ...WEEKDAYS, 'Unscheduled']")] for t in src_tabs_xml(path)), src_tabs_xml(path))
        return exp
    exp = {}
    # G1. plain multi-sheet workbook
    up(pg, S + 'sample-multisheet.xlsx'); stx = wait_status(pg, 'Sorted|Could not')
    check('xlsx: multi-sheet workbook sorted', 'Sorted' in stx, stx)
    src = src_tabs_xml(S + 'sample-multisheet.xlsx')
    tsrc = {r[0]: r[1] for r in pg.evaluate('ROWS.map(r=>[r.task, r.srcSheet])')}
    check_exports('multisheet', src, tsrc)
    check('export: Total needed is a live formula (editable)', sum(v['formulas'] for v in exp['multisheet-by-dish.xlsx'].values()) > 0)
    staff = [r[0].value for r in openpyxl.load_workbook(os.path.join(OUT, 'multisheet-by-dish.xlsx'))['Staff Meal'].iter_rows() if r[0].value in ('Chicken Curry', 'Steamed Rice')]
    check('a source tab with two dishes exports as one tab with both', staff == ['Chicken Curry', 'Steamed Rice'], staff)
    # G2. awkward tab names
    up(pg, S + 'awkward-tabs.xlsx'); stx = wait_status(pg, 'Sorted|Could not')
    awk = src_tabs_xml(S + 'awkward-tabs.xlsx')
    got_src = pg.evaluate('[...new Set(ROWS.map(r=>r.srcSheet))]')
    check('awkward xlsx: every original tab name stored exactly on its rows', sorted(got_src) == sorted(awk), got_src)
    tsrc = {r[0]: r[1] for r in pg.evaluate('ROWS.map(r=>[r.task, r.srcSheet])')}
    expect = excel_rule(awk)
    check('awkward: expected Excel-forced changes are only MAINS (case dup) and the 40-char name', [(a, b2) for a, b2 in zip(awk, expect) if a != b2] == [('MAINS', 'MAINS-2'), (awk[3], awk[3][:31])], list(zip(awk, expect)))
    check_exports('awkward', expect, tsrc)
    # round trip: Source tab column restores the exact originals, even renamed ones
    up(pg, os.path.join(OUT, 'awkward-by-section.xlsx')); wait_status(pg, 'Sorted|Could not')
    rt = pg.evaluate('[...new Set(ROWS.map(r=>r.srcSheet))]')
    check('round trip: re-uploading a By section export restores exact original tab names', sorted(rt) == sorted(awk), rt)
    path, _, _ = export_view(pg, 'dish', 'awkward-roundtrip-by-dish.xlsx')
    check('round trip: By dish export after re-upload gives the same tabs', sorted(src_tabs_xml(path)) == sorted(expect), src_tabs_xml(path))
    up(pg, os.path.join(OUT, 'awkward-by-dish.xlsx')); wait_status(pg, 'Sorted|Could not')
    rt2 = {r[0]: r[1] for r in pg.evaluate('ROWS.map(r=>[r.task, r.srcSheet])')}
    check('round trip: re-uploading the By dish export keeps every row\'s original tab', rt2 == tsrc, {k: v for k, v in rt2.items() if tsrc.get(k) != v})
    # sanitiser unit checks
    names = pg.evaluate("""(()=>{const u=new Set(), c=[]; const r=['Mains: Beef [Sat]','mains- beef -sat-',"'Quoted'",'History','A'.repeat(40),'A'.repeat(40),'Tab?/*\\\\x','  keep  spaces ',"Chef's"].map(n=>safeSheetName(n,u,c)); return {r, c:c.length};})()""")
    nm = names['r']
    ok = all(len(n) <= 31 and not re.search(r'[\[\]:*?/\\]', n) for n in nm) and len({n.lower() for n in nm}) == len(nm) and nm[2] == 'Quoted' and nm[3] == 'History-1' and nm[7] == '  keep  spaces ' and nm[8] == "Chef's" and names['c'] == 7
    check('sanitiser: changes only what Excel forces (spaces/apostrophes inside kept), reports each change', ok, names)
    # G3. text PDF: recipe titles as the tab names
    up(pg, S + 'fixes-and-titles.pdf'); stp = wait_status(pg, 'Sorted|Could not', 30000)
    titles = ['Braised Lamb Shoulder: 18 Hour [GF]', "Market Fish's Salsa Verde"]
    check('PDF: source name = recipe title exactly as printed', pg.evaluate('[...new Set(ROWS.map(r=>r.srcSheet))]') == titles, pg.evaluate('[...new Set(ROWS.map(r=>r.srcSheet))]'))
    tsrc = {r[0]: r[1] for r in pg.evaluate('ROWS.map(r=>[r.task, r.srcSheet])')}
    check_exports('pdf', excel_rule(titles), tsrc)
    # ---------- G4. the four fixes ----------
    rws = {r['task']: r for r in pg.evaluate('ROWS')}
    check('fix 1: merged "2.5 Kilograms Chicken thigh" split into qty + name', 'Chicken thigh' in rws and rws['Chicken thigh']['pdfFixedTotal'] == 2.5 and rws['Chicken thigh']['unit'] == 'kg', rws.get('Chicken thigh'))
    check('fix 1: merged "Lemon zest 200 Grams" (name first) split too', 'Lemon zest' in rws and rws['Lemon zest']['pdfFixedTotal'] == 200, rws.get('Lemon zest'))
    check('fix 2: butternut pumpkin (PDF) is Vegetables, not a sauce', rws['Butternut pumpkin']['section'] == 'Vegetables', rws['Butternut pumpkin']['section'])
    pg.evaluate("setView('dish')"); pg.wait_for_timeout(300)
    def row_text(task): return pg.locator(f'#resultsArea tr:has(td:has-text("{task}"))').first.inner_text()
    rw, jus = row_text('Red wine'), row_text('Lamb jus')
    check('fix 3: 1500 Milliliters shows as 1.5 L (never kg)', '1.5 L' in rw and 'kg' not in rw, rw)
    check('fix 3: 2 Liters shows as 2 L (never kg)', '2 L' in jus and 'kg' not in jus, jus)
    check('fix 4: status message says COOKED/finished, not "raw ingredient weights"', 'COOKED' in stp and 'Raw ingredient weights only' not in stp, stp[:200])
    ph = capture_print(pg, "printDish(encodeURIComponent(ROWS[0].dish))")
    check('fix 4: printed banner agrees (COOKED WEIGHT)', 'COOKED WEIGHT' in ph)
    hint_help = pg.evaluate("document.getElementById('helpTab').innerText + ' ' + document.body.innerHTML")
    check('fix 4: help text no longer says PDFs are read for raw ingredients', 'read for its raw ingredients' not in hint_help and 'finished/cooked weights' in hint_help)
    up(pg, S + 'awkward-tabs.xlsx'); wait_status(pg, 'Sorted')
    rws = {r['task']: r for r in pg.evaluate('ROWS')}
    check('fix 2: "Butternut pumpkin roast" (xlsx) is not a sauce', rws['Butternut pumpkin roast']['section'] != 'Sauce, Purees and Gels', rws['Butternut pumpkin roast']['section'])
    pg.evaluate("setView('dish')"); pg.wait_for_timeout(300)
    t1, t2, t3 = row_text('Red wine jus'), row_text('Butternut pumpkin roast'), row_text('Beef fillet portion')
    check('fix 3: xlsx 0.05 L x 80 = 4 L; 0.015 kg x 40 = 600 g; 0.18 kg x 80 = 14.4 kg', '4 L' in t1 and '600 g' in t2 and '14.4 kg' in t3, (t1, t2, t3))
    # ---------- G5. source names survive reload, templates, append ----------
    before_src = pg.evaluate('ROWS.map(r=>r.srcSheet)')
    pg.wait_for_timeout(1000); pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(600)
    after_src = pg.evaluate('ROWS.map(r=>r.srcSheet)'); check('reload: every row keeps its original source name', after_src == before_src, (before_src[:3], after_src[:3]))
    pg.evaluate("AutoprodLicence.activate('TEST-PRO-YEARLY')"); pg.wait_for_timeout(300); pg.evaluate('renderApp()')
    pg.fill('#proTemplateName', 'Awkward test'); pg.click('#proSaveTemplateBtn')
    up(pg, S + 'sample-recipes.pdf'); wait_status(pg, 'Sorted')
    pg.evaluate("loadTemplate(encodeURIComponent('Awkward test'))"); pg.wait_for_timeout(300)
    check('template: loading a saved template keeps original source names', pg.evaluate('ROWS.map(r=>r.srcSheet)') == before_src)
    up(pg, S + 'sample-recipes.pdf'); wait_status(pg, 'Sorted')
    pg.evaluate("document.getElementById('statusMsg').textContent=''"); pg.set_input_files('#appendInput', S + 'fixes-and-titles.pdf'); wait_status(pg, 'Appended|Could not', 30000)
    srcs = pg.evaluate('[...new Set(ROWS.map(r=>r.srcSheet))]')
    check('append PDF: old and new rows keep their own recipe titles', srcs == ['Roast Pumpkin Salad', 'Braised Lamb Shoulder', 'Braised Lamb Shoulder: 18 Hour [GF]', "Market Fish's Salsa Verde"], srcs)
    pg.wait_for_timeout(1000); pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(600)
    check('append + reload: source names and PDF totals survive', pg.evaluate('[...new Set(ROWS.map(r=>r.srcSheet))]') == srcs and pg.evaluate('ROWS.every(r=>r.pdfFixedTotal!==undefined)'))
    pg.evaluate("AutoprodLicence.deactivate()"); pg.wait_for_timeout(300)
    # Source tab column screenshot: render the section export like a sheet
    rows, _ = rows_of(os.path.join(OUT, 'awkward-by-section.xlsx'))
    tbl = ''.join(f'<tr><td>{t}</td><td>{i}</td><td><b>{sv.replace(" ", "&middot;")}</b></td></tr>' for t, i, sv in rows)
    sp = ctx.new_page(); sp.set_viewport_size({'width': 900, 'height': 700})
    sp.set_content(f'<style>body{{font:13px sans-serif;padding:16px}}td,th{{border:1px solid #bbb;padding:4px 8px}}table{{border-collapse:collapse}}</style><h3>awkward-by-section.xlsx, opened with openpyxl (spaces shown as &middot;)</h3><table><tr><th>Tab (sheet)</th><th>Item</th><th>Source tab column</th></tr>{tbl}</table>')
    sp.screenshot(path=f'{SHOTS}/06-export-source-tab-column.png', full_page=True); sp.close()
    # free multi-PDF (limits stay off)
    up(pg, [S + 'sample-recipes.pdf', '/home/box/prototypes/monetise/tests/samples/sample-prep-B.pdf']); st5 = wait_status(pg, 'Sorted|Could not', 30000)
    check('free plan: several PDFs at once still allowed (free limits off)', len(set(pg.evaluate('ROWS.map(r=>r.dish)'))) == 3, st5[:120])
    check('free plan: no "Made with Prepline" footer on free prints', 'Made with Prepline' not in capture_print(pg, "printAllSections()"))
    # ---------- H. phone width ----------
    ctx, _ = new_ctx(b, 390, 844, is_mobile=True, has_touch=True, device_scale_factor=2); pg, errs = page_with_errs(ctx)
    pg.goto(URL); pg.wait_for_load_state('networkidle')
    up(pg, S + 'sample-recipes.pdf'); wait_status(pg, 'Sorted')
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
