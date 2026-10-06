# Headless Chromium tests for the Prepline v3.3.0 features (test site build):
# allergens, order sheet, cost, sample menu, team share, feedback, installable app (PWA).
# Usage: python3 test_v33.py URL [shots_dir] [out_dir] [--expect-version X]
#          [--pwa] [--live-url URL] [--update-url URL --update-dir DIR] [--offline] [--team]
#   URL          the app's index.html
#   --pwa        check the installable-app part (URL must be under /prepline-test/ over http(s))
#   --live-url   a page on the same origin that must NOT be controlled by a service worker
#   --update-*   a served copy whose sw.js this script may edit, to test the update prompt (local only)
#   --offline    file:// build: block ALL network; any request attempt fails the run
#   --team       team build: every tool unlocked, no licence UI
import sys, os, json, re, base64, zlib, shutil, subprocess, time
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright
import openpyxl

def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default
URL = sys.argv[1]
SHOTS = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else '/workspace/prepline-v2-shots/v3.3.0'
OUT = sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else '/workspace/prepline-v33-test-out'
EXPECT_VER = arg('--expect-version'); PWA = '--pwa' in sys.argv
LIVE_URL = arg('--live-url'); UPD_URL = arg('--update-url'); UPD_DIR = arg('--update-dir')
OFFLINE = '--offline' in sys.argv or '--team' in sys.argv; SITEONLY = '--team-site' in sys.argv; TEAM = '--team' in sys.argv or SITEONLY
LIVE_SHARE = arg('--share-base', 'https://autoprod-dev.github.io/preplist-sorter/')   # where a file:// copy's share links point
SITE_HOST = urlparse(URL).hostname
net_attempts = []
S = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'samples') + '/'
os.makedirs(SHOTS, exist_ok=True); os.makedirs(OUT, exist_ok=True)
results = []; measures = {}
def check(name, ok, info=''):
    results.append({'test': name, 'ok': bool(ok), 'info': str(info)[:600]}); print(('PASS ' if ok else 'FAIL ') + name + ('  | ' + str(info)[:300] if info else ''))
def new_ctx(b, w=1280, h=900, **kw):
    ctx = b.new_context(viewport={'width': w, 'height': h}, accept_downloads=True, **kw)
    ctx.route(re.compile(r'.*lemonsqueezy\.com/checkout.*'), lambda route: route.abort())
    if SITEONLY:   # corporate-network simulation: every outside domain blocked, any attempt fails the run
        ctx.route(lambda u: urlparse(u).scheme in ('http', 'https', 'ws', 'wss') and urlparse(u).hostname != SITE_HOST, lambda route: (net_attempts.append('BLOCKED ' + route.request.url[:140]), route.abort()))
    if OFFLINE:
        ctx.set_offline(True)
        ctx.on('request', lambda r: None if r.url.startswith(('file:', 'data:', 'blob:')) else net_attempts.append(r.url[:140]))
        ctx.route(re.compile(r'^(https?|wss?|ftp)://.*'), lambda route: (net_attempts.append('ROUTED ' + route.request.url[:140]), route.abort()))
    return ctx
def page_with_errs(ctx):
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append('console: ' + m.text[:200]))
    return pg, errs
def go(pg, url=URL):
    pg.goto(url); pg.wait_for_load_state('networkidle')
def up(pg, files):
    pg.evaluate("document.getElementById('fileInput').value=''; document.getElementById('statusMsg').textContent=''"); pg.set_input_files('#fileInput', files)
def wait_status(pg, pat, t=20000):
    pg.wait_for_function("p => new RegExp(p).test(document.getElementById('statusMsg').textContent)", arg=pat, timeout=t)
def capture_print(pg, fn_js):
    pg.evaluate("window.__prints=[]; window.printViaIframe = h => window.__prints.push(h);")
    pg.evaluate(fn_js); pg.wait_for_function("window.__prints.length>0", timeout=10000)
    return pg.evaluate("window.__prints[window.__prints.length-1]")
def nostyle(h): return re.sub(r'<style.*?</style>', '', h, flags=re.S)
def export_view(pg, view, fname):
    pg.evaluate(f"setView('{view}')"); pg.wait_for_timeout(300)
    with pg.expect_download() as dl: pg.locator('button:has-text("📊 Export to Excel (editable)")').first.click()
    path = os.path.join(OUT, fname); dl.value.save_as(path); return path
def load_sample(pg):
    pg.click('#sampleMenuBtn'); pg.wait_for_function("activeRows().length>0", timeout=10000); pg.wait_for_timeout(200)
HAVE_LO = bool(shutil.which('soffice'))
def recalc(paths, tag):
    d = os.path.join(OUT, 'lo-' + tag); os.makedirs(d, exist_ok=True)
    subprocess.run(['soffice', '--headless', '--norestore', '--convert-to', 'xlsx', '--outdir', d] + paths, capture_output=True, timeout=300)
    return {p: openpyxl.load_workbook(os.path.join(d, os.path.basename(p)), data_only=True) for p in paths}
def blocks(ws):
    """Dish blocks of a main export: [{title_row, pax_row, hdr_row, rows:[r...]}]"""
    out, cur = [], None
    for r in range(1, ws.max_row + 1):
        a = ws.cell(r, 1).value
        if a == 'PAX':
            cur = {'pax_row': r, 'title_row': r - 1, 'rows': []}; out.append(cur)
        elif a == 'Item' and cur is not None: cur['hdr_row'] = r
        elif cur is not None and 'hdr_row' in cur and a not in (None, ''): cur['rows'].append(r)
    return out
def close(a, b, tol=0.006): return isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) <= tol

with sync_playwright() as p:
    b = p.chromium.launch()
    # ================= 0. load, version, storage keys =================
    ctx = new_ctx(b); pg, errs = page_with_errs(ctx); go(pg)
    ver = pg.get_attribute('meta[name="prepline-version"]', 'content')
    check(f'version meta is {EXPECT_VER}', EXPECT_VER is None or ver == EXPECT_VER, ver)
    check('footer shows the same version', ('Prepline v' + ver) in pg.inner_text('#appVersion'), pg.inner_text('#appVersion'))
    # an existing saved list (v3.2.5 style) must still restore with the new code
    up(pg, S + 'sample-multisheet.xlsx'); wait_status(pg, 'Sorted'); n_rows = pg.evaluate('ROWS.length'); pg.wait_for_timeout(1500)
    keys0 = set(pg.evaluate('Object.keys(localStorage)'))
    pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(500)
    check('existing saved list still restores after a reload (no new code breaks the saved session)', pg.evaluate('ROWS.length') == n_rows and n_rows > 0, (n_rows, pg.evaluate('ROWS.length')))
    check('existing keys untouched: session and print-method keys as before, no ingredient key until a feature is used', 'preplistOnetimeSession_v1' in keys0 and 'preplineIngredientInfo_v1' not in keys0, sorted(keys0))
    check('defaults kept: "Include method in printout" is No; Pro enforcement off (no limits applied)', pg.evaluate("includeMethodInPrint===false") and pg.evaluate("!(LICENSE_CONFIG.freeLimits && Object.values(LICENSE_CONFIG.freeLimits).some(v=>v===true))"), pg.evaluate("JSON.stringify(LICENSE_CONFIG.freeLimits||{})"))
    ctx.close()

    # ================= 1. instant demo =================
    ctx = new_ctx(b); pg, errs = page_with_errs(ctx); go(pg)
    check('demo: "Try with sample menu" button is visible on a fresh page, no upload needed', pg.is_visible('#sampleMenuBtn') and 'sample menu' in pg.inner_text('#sampleMenuBtn').lower(), pg.inner_text('#sampleMenuBtn'))
    t0 = time.time(); load_sample(pg); dt = time.time() - t0
    info = pg.evaluate("({rows: activeRows().length, dishes: [...new Set(ROWS.map(r=>r.dish))], days: [...new Set(activeRows().map(r=>r.day))], secs: [...new Set(ROWS.map(r=>r.section))], pax: Object.values(paxByDish)})")
    check('demo: loads in seconds with several dishes, sections, days and pax', info['rows'] >= 25 and len(info['dishes']) == 5 and len(info['days']) >= 3 and len(info['secs']) >= 3 and all(isinstance(x, (int, float)) and x > 0 for x in info['pax']) and dt < 5, (info, round(dt, 2)))
    check('demo: every dish name says "Sample:" (made-up data)', all(d.startswith('Sample:') for d in info['dishes']), info['dishes'])
    ban = pg.inner_text('#sampleBanner')
    check('demo: clear SAMPLE DATA banner with a Clear sample button', 'SAMPLE DATA' in ban and pg.is_visible('#clearSampleBtn'), ban)
    check('demo: allergens, suppliers and prices come with it', pg.evaluate("Object.values(INGINFO.items).filter(e=>e.smp&&e.sup).length") >= 15 and pg.evaluate("anyPrices()") and pg.locator('#resultsArea .al-chip').count() > 5)
    ph = capture_print(pg, "printAllSections()")
    check('demo: printouts are marked SAMPLE DATA', 'SAMPLE DATA' in nostyle(ph))
    check('demo: no personal names in sample data (role labels only)', not re.search(r'\b(Gerard|Payumo|Percy)\b', json.dumps(pg.evaluate("[SAMPLE_MENU, SAMPLE_LEADERS, SAMPLE_SUP]"))))
    pg.screenshot(path=f'{SHOTS}/01-sample-menu-desktop.png', full_page=False)
    # user's own info is never overwritten by the sample, and survives Clear sample
    pg.evaluate("setIngSupplier(encodeURIComponent('Garlic'), 'My Veg Supplier')")
    pg.click('#clearSampleBtn'); pg.wait_for_timeout(300)
    after = pg.evaluate("({rows: ROWS.length, smp: Object.values(INGINFO.items).filter(e=>e.smp).length, garlic: (INGINFO.items['garlic']||{}).sup, banner: !!document.getElementById('sampleBanner'), btn: !!document.getElementById('sampleMenuBtn')})")
    check('demo: Clear sample empties the list and removes only sample-seeded info (a supplier the user typed stays)', after == {'rows': 0, 'smp': 0, 'garlic': 'My Veg Supplier', 'banner': False, 'btn': True}, after)
    load_sample(pg)
    check('demo: reloading the sample does not overwrite the user\'s own entry', pg.evaluate("INGINFO.items['garlic'].sup") == 'My Veg Supplier')
    pg.click('#clearSampleBtn'); pg.wait_for_timeout(200)
    check('demo: no JS errors', not errs, errs)
    ctx.close()

    # ================= 2. allergens =================
    ctx = new_ctx(b); pg, errs = page_with_errs(ctx); go(pg)
    cases = {'Butternut pumpkin': [], 'Peanut butter': ['peanuts'], 'Coconut milk': [], 'Eggplant': [], 'Oyster mushrooms': [], 'Nutmeg': [],
             'Water chestnut': [], 'Rice flour': [], 'Prawn cutlets': ['crustacea'], 'Squid tubes': ['molluscs'], 'Linguine': ['gluten'],
             'Gruyere cheese': ['dairy'], 'Almond flakes': ['treenuts'], 'Sesame seeds': ['sesame'], 'Soy sauce': ['gluten', 'soy'],
             'Mayonnaise': ['egg'], 'Hummus': ['sesame'], 'Barramundi fillet': ['fish'], 'Lupin': ['lupin'], 'Thickened cream': ['dairy'], 'Eggs': ['egg']}
    got = pg.evaluate("c => Object.fromEntries(Object.keys(c).map(k=>[k, alSuggest(k)]))", cases)
    bad = {k: (got[k], v) for k, v in cases.items() if sorted(got[k]) != sorted(v)}
    check(f'allergens: keyword suggestions right for {len(cases)} names incl. exclusions (butternut, peanut butter, coconut milk, eggplant, oyster mushroom, nutmeg)', not bad, bad)
    check('allergens: all 11 standard tags exist (gluten, dairy, egg, tree nuts, peanuts, sesame, soy, fish, crustacea, molluscs, lupin)', pg.evaluate("ALLERGENS.map(a=>a.id).join(',')") == 'gluten,dairy,egg,treenuts,peanuts,sesame,soy,fish,crustacea,molluscs,lupin')
    load_sample(pg)
    for v in ['dish', 'section', 'priority', 'order']:
        pg.evaluate(f"setView('{v}')"); pg.wait_for_timeout(150)
        n_conf = pg.locator('#resultsArea .no-print .al-chip:not(.sug)').count() + pg.locator('#resultsArea .al-chip:not(.sug)').count()
        n_sug = pg.locator('#resultsArea .al-chip.sug').count()
        check(f'allergens: chips show in the {v} view (confirmed and "?" suggestions)', n_conf > 0 and n_sug > 0, (n_conf, n_sug))
    pg.evaluate("setView('dish')"); pg.wait_for_timeout(150)
    check('allergens: dish heads show an allergen line', pg.locator('#resultsArea .al-line').count() >= 5)
    prints = {'dish sheet': capture_print(pg, "printDish(encodeURIComponent(ROWS[0].dish))")}
    # the section / prep day that holds an unchecked suggestion (Almond flakes → tree nuts?)
    pg.evaluate("setView('section')"); prints['section handout'] = capture_print(pg, "printSection(ROWS.find(r=>r.task==='Almond flakes').section)")
    pg.evaluate("setView('priority')"); prints['prep-day handout'] = capture_print(pg, "printPriority([...document.querySelectorAll('[id^=print-priority-]')].find(e=>e.textContent.includes('Almond flakes')).id.replace('print-priority-',''))")
    prints['all sections'] = capture_print(pg, 'printAllSections()'); prints['all days'] = capture_print(pg, 'printAllDays()')
    pg.evaluate("setView('dish')")
    pr = {k: ['al-chip' in nostyle(h), 'automatic suggestions' in nostyle(h)] for k, h in prints.items()}
    check('allergens: every printout (dish, section, prep day, both one-page-complete) has tags and the check-suggestions disclaimer', all(all(v) for v in pr.values()), pr)
    # panel, disclaimer, confirm, edit, custom tags, persistence
    pg.evaluate("setIngPanelOpen(true)"); pg.wait_for_timeout(150)
    disc = pg.inner_text('#ingPanelWrap .al-disclaimer')
    check('allergens: Ingredients panel shows a clear disclaimer that suggestions must be checked', 'suggestions' in disc and 'Check' in disc and 'does not guarantee' in disc, disc)
    enc = pg.evaluate("encodeURIComponent('Gruyere cheese')")
    check('allergens: an unchecked ingredient shows a suggestion (Gruyere → dairy, not confirmed)', pg.evaluate("JSON.stringify(alForTask('Gruyere cheese'))") == '{"tags":["dairy"],"confirmed":false}')
    pg.click('#ingPanelWrap tr[data-ing="gruyere cheese"] button:has-text("Confirm")'); pg.wait_for_timeout(150)
    check('allergens: Confirm stores the tags as checked', pg.evaluate("JSON.stringify(alForTask('Gruyere cheese'))") == '{"tags":["dairy"],"confirmed":true}')
    pg.click('#ingPanelWrap tr[data-ing="feta"] button:has-text("Edit")'); pg.wait_for_timeout(150)
    pg.check('#alEditor input[value="egg"]'); pg.fill('#alEditor input[type=text]', 'Sulphites, celery'); pg.click('#alEditor button:has-text("Save")'); pg.wait_for_timeout(150)
    check('allergens: editor adds a standard tag and custom tags (Feta → dairy, egg, Sulphites, celery)', pg.evaluate("JSON.stringify(alForTask('Feta'))") == '{"tags":["dairy","egg","Sulphites","celery"],"confirmed":true}', pg.evaluate("JSON.stringify(alForTask('Feta'))"))
    pg.evaluate("setDishTags(encodeURIComponent('Sample: Chocolate Tart'), 'may contain nuts')")
    check('allergens: dish-level custom tag shows on the dish', 'may contain nuts' in pg.inner_text('#resultsArea'))
    pg.wait_for_timeout(1500); pg.reload(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(300)
    check('allergens: confirmed tags survive a reload (own key preplineIngredientInfo_v1)', pg.evaluate("JSON.stringify(alForTask('Feta'))") == '{"tags":["dairy","egg","Sulphites","celery"],"confirmed":true}' and 'Sulphites' in (pg.evaluate("localStorage.getItem('preplineIngredientInfo_v1')") or ''))
    # Excel: Allergens column in all three exports
    files = [export_view(pg, v, f'al-{v}.xlsx') for v in ['dish', 'section', 'priority']]
    colok = []
    for f in files:
        wb = openpyxl.load_workbook(f); found = {}
        for ws in wb.worksheets:
            for bl in blocks(ws):
                hdr = [ws.cell(bl['hdr_row'], c).value for c in range(1, 15)]
                if hdr[8] != 'Allergens': found['badhdr'] = hdr; continue
                for r in bl['rows']: found[ws.cell(r, 1).value] = ws.cell(r, 9).value
        colok.append(found)
    want = {'Feta': 'Dairy, Egg, Sulphites, celery', 'Gruyere cheese': 'Dairy', 'Prawn cutlets': 'Shellfish (crustacea)', 'Chicken supreme': 'None', 'Almond flakes': 'Suggested (check): Tree nuts'}
    check('allergens: all 3 Excel exports have an Allergens column (col I) with checked, "None" and "Suggested (check)" values', all(all(fo.get(k) == v for k, v in want.items()) and 'badhdr' not in fo for fo in colok), [{k: fo.get(k) for k in want} for fo in colok])
    hdr_ok = []
    for f in files:
        ws = openpyxl.load_workbook(f).worksheets[0]; bl = blocks(ws)[0]
        hdr_ok.append([ws.cell(bl['hdr_row'], c).value for c in range(1, 9)])
    check('existing export layout unchanged in columns A–H (Item … Source tab); new columns only after', all(h == ['Item', 'Quantity per pax', 'Unit', 'PAX (this row)', 'Total needed', 'Section', 'Prep day', 'Source tab'] for h in hdr_ok), hdr_ok)
    # recipe database round trip
    rt = pg.evaluate("""(()=>{ commitRowsToDatabase(); const json = JSON.stringify(dishDatabase);
        const back = sanitizeDatabase(JSON.parse(json)).db;
        const feta = Object.values(back).flatMap(d=>d.items).find(i=>i.task==='Feta');
        const tart = back['Sample: Chocolate Tart'];
        // new device: no ingredient info, only the imported database
        const saved = INGINFO; INGINFO = {v:1, items:{}, dishAl:{}}; dishDatabase = back; _dbAlIdx = null;
        const r = {feta: feta && feta.al, tart: tart && tart.al, fromDb: alForTask('Feta')};
        INGINFO = saved; return r; })()""")
    check('allergens: remembered in the recipe database (item and dish tags) and survive export/import on a new device', rt['feta'] == ['dairy', 'egg', 'Sulphites', 'celery'] and rt['tart'] == ['may contain nuts'] and rt['fromDb'] == {'tags': ['dairy', 'egg', 'Sulphites', 'celery'], 'confirmed': True}, rt)
    pg.evaluate("dishDatabase={}; saveDatabase(); setToolMode('onetime')")
    check('allergens: tag text is sanitised (no HTML)', pg.evaluate("cleanTag('<img src=x onerror=alert(1)>')").find('<') == -1)
    check('allergens: no JS errors', not errs, errs)
    ctx.close()

    # ================= 3. order sheet =================
    ctx = new_ctx(b); pg, errs = page_with_errs(ctx); go(pg); load_sample(pg)
    pg.click('#orderViewBtn'); pg.wait_for_timeout(300)
    g = pg.evaluate("orderGroups().map(g=>({s:g.supplier, l:g.lines.map(L=>({t:L.task, need:L.need, order:L.order&&{n:L.order.n,u:L.order.u}, d:L.dishes.length}))}))")
    sups = [x['s'] for x in g]
    check('order: grouped by supplier, alphabetical, "no supplier" group last', sups[:-1] == sorted(sups[:-1]) and sups[-1] == '' and len(sups) == 5, sups)
    line = {l['t']: l for x in g for l in x['l']}
    check('order: same ingredient across dishes is added up (Butter 0.8 + 0.9 = 1.7 kg, Garlic 400 g + 240 g = 640 g, ordered as 0.7 kg because it is priced per kg)',
          line['Butter']['need'] == {'n': 1.7, 'u': 'kg'} and line['Butter']['d'] == 2 and line['Garlic']['need'] == {'n': 640, 'u': 'g'} and line['Garlic']['order'] == {'n': 0.7, 'u': 'kg'}, (line['Butter'], line['Garlic']))
    check('order: units roll up (14.4 kg chicken, 3.2 L + 3.5 L cream = 6.7 L) and counts stay counts (35 eggs, 2 bunch parsley)',
          line['Chicken supreme']['need'] == {'n': 14.4, 'u': 'kg'} and line['Thickened cream']['need'] == {'n': 6.7, 'u': 'L'} and line['Eggs']['order'] == {'n': 35, 'u': 'each'} and line['Parsley']['order']['u'] == 'bunch', (line['Chicken supreme'], line['Thickened cream'], line['Eggs'], line['Parsley']))
    rnd = pg.evaluate("[roundUpOrder(0.64,'kg'), roundUpOrder(12.2,'kg'), roundUpOrder(45,'g'), roundUpOrder(120,'g'), roundUpOrder(2.2,'each'), roundUpOrder(0.3,'each'), roundUpOrder(1.7,'kg')]")
    check('order: order qty rounds up sensibly (0.1 kg, 0.5 kg ≥ 10 kg, 10 g, 50 g ≥ 100 g, whole units)', rnd == [0.7, 12.5, 50, 150, 3, 0.5, 1.7], rnd)
    un = next(x for x in g if x['s'] == '')
    check('order: unassigned items listed (4 sample sub-recipes with no supplier)', sorted(l['t'] for l in un['l']) == ['Balsamic dressing', 'Lemon butter sauce', 'Sweet pastry', 'Thyme jus'] and 'No supplier yet' in pg.inner_text('#resultsArea'), [l['t'] for l in un['l']])
    pg.fill('#resultsArea input.sup-input >> nth=0', 'House Kitchen'); pg.keyboard.press('Tab'); pg.wait_for_timeout(250)
    check('order: assigning a supplier on the order sheet moves the item and is remembered', 'House Kitchen' in pg.evaluate("orderGroups().map(g=>g.supplier)") and pg.evaluate("knownSuppliers().includes('House Kitchen')"))
    pg.wait_for_timeout(1500); pg.reload(); pg.wait_for_load_state('networkidle')
    check('order: suppliers remembered across reloads/lists, view stays on the order sheet', pg.evaluate("knownSuppliers().includes('House Kitchen') && viewMode==='order'"), pg.evaluate("viewMode"))
    pg.screenshot(path=f'{SHOTS}/02-order-sheet-desktop.png', full_page=False)
    hs = capture_print(pg, "openPrintWindow([...document.querySelectorAll('[id^=print-order-]')][0].id)")
    ha = capture_print(pg, "printAllOfView('order', 'order-sheets.html')")
    check('order: printable per supplier and all at once (headings, order qty, tick column)', 'Order sheet' in nostyle(hs) and '<table' in hs and nostyle(ha).count('Order sheet —') == len(pg.evaluate("orderGroups()")), (nostyle(ha).count('Order sheet —')))
    with pg.expect_download() as dl: pg.click('button[data-export="exportOrderToXlsx"]')
    of = os.path.join(OUT, 'order.xlsx'); dl.value.save_as(of)
    wb = openpyxl.load_workbook(of)
    tabs = wb.sheetnames
    ws = wb['Sample Dairy Supplies']; hdr = [ws.cell(4, c).value for c in range(1, 11)]
    rows = {ws.cell(r, 1).value: [ws.cell(r, c).value for c in range(1, 11)] for r in range(5, ws.max_row + 1) if ws.cell(r, 1).value}
    check('order Excel: one tab per supplier plus "No supplier yet"', 'No supplier yet' in tabs and 'Sample Produce Co.' in tabs and len(tabs) == len(pg.evaluate("orderGroups()")), tabs)
    check('order Excel: columns Item | Needed | Unit | Order qty | Order unit | Supplier | Used in | Price | Price per | Est. cost', hdr == ['Item', 'Needed', 'Unit', 'Order qty', 'Order unit', 'Supplier', 'Used in', 'Price', 'Price per', 'Est. cost'], hdr)
    check('order Excel: Order qty is a plain editable number; Est. cost is a formula', rows['Butter'][3] == 1.7 and isinstance(rows['Butter'][3], (int, float)) and str(rows['Butter'][9]).startswith('='), rows['Butter'])
    if HAVE_LO:
        ws['D' + str(next(r for r in range(5, ws.max_row + 1) if ws.cell(r, 1).value == 'Butter'))] = 3
        of2 = os.path.join(OUT, 'order-edited.xlsx'); wb.save(of2)
        rc = recalc([of2], 'order')[of2]['Sample Dairy Supplies']
        vals = {rc.cell(r, 1).value: rc.cell(r, 10).value for r in range(5, rc.max_row + 1)}
        check('order Excel (LibreOffice recalc): editing Order qty recalculates Est. cost (Butter 3 kg x $12 = $36) and the total', close(vals.get('Butter'), 36) and isinstance(vals.get('Total est. cost') or rc.cell(rc.max_row, 10).value, (int, float)), vals)
    check('order: no JS errors', not errs, errs)
    ctx.close()

    # ================= 4. cost =================
    ctx = new_ctx(b); pg, errs = page_with_errs(ctx); go(pg); load_sample(pg)
    exp = pg.evaluate("""(()=>{ let tot=0; const per={}; SAMPLE_MENU.forEach(d=>{ let c=0; d.items.forEach(it=>{ if (it[4]==null) return; c += it[1]*d.pax*it[4]; }); per[d.dish]=c; tot+=c; }); return {tot, per}; })()""")
    app = pg.evaluate("(()=>{ const per={}; [...new Set(ROWS.map(r=>r.dish))].forEach(d=>per[d]=costOfRows(activeRows().filter(r=>r.dish===d))); return {all: costOfRows(activeRows()), per}; })()")
    check('cost: list total = sum of qty x pax x price, computed independently from the sample data', close(app['all']['cost'], round(exp['tot'], 2), 0.011), (app['all'], exp['tot']))
    check('cost: each dish cost matches', all(close(app['per'][d]['cost'], round(v, 2), 0.011) for d, v in exp['per'].items()), {d: (app['per'][d]['cost'], round(v, 2)) for d, v in exp['per'].items()})
    check('cost: missing prices flagged (4 sub-recipes) on dish heads and the summary', app['all']['missing'] == 4 and 'missing price' in pg.inner_text('#costSummary') and pg.locator('#resultsArea .cost-miss').count() >= 4, app['all'])
    dl_txt = pg.locator('#resultsArea .cost-line').first.inner_text()
    check('cost: dish head shows cost and cost per pax', 'Cost:' in dl_txt and 'per pax' in dl_txt, dl_txt)
    mm = pg.evaluate("(()=>{ setIngPer(encodeURIComponent('Parsley'), 'kg'); const c = costOfRow(ROWS.find(r=>r.task==='Parsley')); setIngPer(encodeURIComponent('Parsley'), 'each'); return c; })()")
    check('cost: a price unit that does not fit (per kg, item in bunches) is flagged, never guessed', mm.get('status') == 'mismatch', mm)
    check('cost: price input rejects text', pg.evaluate("parsePrice('abc').ok===false && parsePrice('$12.50').n===12.5 && parsePrice('').n===undefined"))
    # Excel: cost columns as formulas, recalculated with LibreOffice
    files = [export_view(pg, v, f'cost-{v}.xlsx') for v in ['dish', 'section', 'priority']]
    wb = openpyxl.load_workbook(files[0]); fws = None
    for ws in wb.worksheets:
        bl = blocks(ws)
        if bl and [ws.cell(bl[0]['hdr_row'], c).value for c in range(11, 15)] == ['Price', 'Price per', 'Price units per Unit', 'Cost']: fws = ws; break
    check('cost Excel: Price | Price per | Price units per Unit | Cost columns (K–N) in the exports', fws is not None)
    allf = []
    for f in files:
        w = openpyxl.load_workbook(f)
        for ws in w.worksheets:
            for bl in blocks(ws):
                allf.append((str(ws.cell(bl['pax_row'], 14).value).startswith('=SUM(N'), str(ws.cell(bl['title_row'], 14).value).startswith('=IF(ISNUMBER(B')))
    check('cost Excel: every dish block in all 3 exports has a dish cost SUM and a cost-per-pax formula', allf and all(a and b2 for a, b2 in allf), allf[:6])
    if HAVE_LO:
        rcs = recalc(files, 'cost'); ok_rows = []; bad = []
        dishcost = {}
        for f in files:
            for ws in rcs[f].worksheets:
                for bl in blocks(ws):
                    for r in bl['rows']:
                        item = ws.cell(r, 1).value; e = ws.cell(r, 5).value; k = ws.cell(r, 11).value; m = ws.cell(r, 13).value; n = ws.cell(r, 14).value
                        if isinstance(k, (int, float)) and isinstance(m, (int, float)) and isinstance(e, (int, float)):
                            (ok_rows if close(n, e * m * k, 1e-6) else bad).append((item, e, m, k, n))
                    if f == files[0]: dishcost[ws.title] = (ws.cell(bl['pax_row'], 14).value, ws.cell(bl['title_row'], 14).value, ws.cell(bl['pax_row'], 2).value)
        check('cost Excel (LibreOffice recalc): Cost = Total x unit factor x price on every priced row of all 3 exports', ok_rows and not bad, (len(ok_rows), bad[:3]))
        appd = pg.evaluate("(()=>{ const o={}; [...new Set(activeRows().map(r=>r.dish))].forEach(d=>{ o[srcName(activeRows().find(r=>r.dish===d)).replace(/:/g,'-').slice(0,31)]=[costOfRows(activeRows().filter(r=>r.dish===d)).cost, paxByDish[d]]; }); return o; })()")
        mt = {t: (v, appd.get(t)) for t, v in dishcost.items()}
        check('cost Excel (LibreOffice recalc): dish cost and cost per pax match the app', all(t in appd and close(v[0], appd[t][0], 0.011) and close(v[1], appd[t][0] / appd[t][1], 0.001) for t, v in dishcost.items()), mt)
        # edit PAX in Excel and recalc
        w = openpyxl.load_workbook(files[0]); ws = w[list(dishcost)[0]]; bl = blocks(ws)[0]
        old = dishcost[ws.title]; ws.cell(bl['pax_row'], 2).value = old[2] * 2
        f2 = os.path.join(OUT, 'cost-dish-pax-edited.xlsx'); w.save(f2)
        r2 = recalc([f2], 'cost2')[f2][ws.title]
        newc, newpp = r2.cell(bl['pax_row'], 14).value, r2.cell(bl['title_row'], 14).value
        check('cost Excel (LibreOffice recalc): doubling PAX doubles the dish cost; cost per pax stays the same', close(newc, old[0] * 2, 0.02) and close(newpp, old[1], 0.001), (old, newc, newpp))
    pg.evaluate("setIngPanelOpen(true)"); pg.wait_for_timeout(100)
    pg.fill('#ingPanelWrap tr[data-ing="thyme jus"] input.price-input', '9'); pg.keyboard.press('Tab'); pg.wait_for_timeout(200)
    check('cost: entering a price in the panel updates the total and the missing count, per L by default for a volume item', pg.evaluate("costOfRows(activeRows()).missing") == 3 and pg.evaluate("INGINFO.items['thyme jus'].per") == 'L', pg.evaluate("JSON.stringify(INGINFO.items['thyme jus'])"))
    pg.wait_for_timeout(1500); pg.reload(); pg.wait_for_load_state('networkidle')
    check('cost: prices remembered after reload', pg.evaluate("INGINFO.items['thyme jus'].price") == 9)
    check('cost: no JS errors', not errs, errs)
    ctx.close()

    # ================= 5. team share =================
    ctx = new_ctx(b); ctx.grant_permissions(['clipboard-read', 'clipboard-write']); pg, errs = page_with_errs(ctx); go(pg); load_sample(pg)
    pg.evaluate("setView('section')"); pg.wait_for_timeout(200)
    nbtn = pg.locator('#resultsArea .share-btn').count()
    check('share: a "Share to phone" button on every section in By team section', nbtn == len(pg.evaluate("[...new Set(activeRows().map(r=>r.section))]")), nbtn)
    pg.locator('#resultsArea .share-btn').first.click(); pg.wait_for_selector('#shareModal figure.share-qr', timeout=10000)
    link = pg.input_value('#shareLinkInput'); sec = pg.evaluate("[...new Set(activeRows().map(r=>r.section))]")
    want_base = LIVE_SHARE if URL.startswith('file:') else URL.split('#')[0]
    check('share: link points at ' + ('the live site (file:// copy)' if URL.startswith('file:') else 'this page') + ' with the list in the #hash (never sent to a server)', link.startswith(want_base) and '#s=z' in link, link[:120])
    tok = link.split('#s=')[1]
    raw = zlib.decompress(base64.urlsafe_b64decode(tok[1:] + '=' * (-len(tok[1:]) % 4)), -15)
    data = json.loads(raw)
    check('share: hash decodes (deflate-raw + base64url) to the section list: name, lead, dishes, pax, qty, day, allergen tags', data['v'] == 1 and data['k'] == 'sec' and len(data['r']) > 0 and all(len(r) == 5 for r in data['r']) and data.get('smp') == 1, {k: data[k] for k in ['n', 'l', 'ds', 'dp']})
    measures['sample section'] = {'section': data['n'], 'rows': len(data['r']), 'json_bytes': len(raw), 'link_chars': len(link), 'ratio': round(len(raw) / len(tok), 2)}
    qinfo = pg.evaluate("[...document.querySelectorAll('#shareModal figure.share-qr')].map(f=>[+f.dataset.version, +f.dataset.chars])")
    check('share: QR code drawn locally as SVG (bundled library), no QR web service', pg.locator('#shareModal svg.qr-svg').count() >= 1 and pg.evaluate("typeof qrcode==='function'"), qinfo)
    try:
        import cv2, numpy as np
        pg.set_viewport_size({'width': 1280, 'height': 1400})
        # draw the on-screen SVG at a whole number of pixels per module so the camera-style decoder sees crisp modules
        pg.evaluate("(()=>{const s=document.querySelector('#shareModal svg.qr-svg'); const n=+s.getAttribute('viewBox').split(' ')[2]; s.style.width=s.style.height=(n*5)+'px'; s.style.maxWidth='none';})()")
        png = pg.locator('#shareModal svg.qr-svg').first.screenshot(path=os.path.join(OUT, 'qr.png'))
        img = cv2.imread(os.path.join(OUT, 'qr.png')); img = cv2.copyMakeBorder(img, 40, 40, 40, 40, cv2.BORDER_CONSTANT, value=(255, 255, 255))
        txt = ''
        raw = cv2.imread(os.path.join(OUT, 'qr.png'))
        for sc in (1, 1.25, 1.5, 2, 3):   # OpenCV's detector is picky about module size and quiet zone; try a few scales
            for im2 in (cv2.copyMakeBorder(cv2.resize(raw, None, fx=sc, fy=sc, interpolation=cv2.INTER_NEAREST), 40, 40, 40, 40, cv2.BORDER_CONSTANT, value=(255, 255, 255)),
                        cv2.resize(img, None, fx=sc, fy=sc, interpolation=cv2.INTER_NEAREST)):
                txt, _, _ = cv2.QRCodeDetector().detectAndDecode(im2)
                if txt: break
            if txt: break
        check('share: the QR code scans (OpenCV) to exactly the share link', txt == link, (len(txt), len(link)))
    except ImportError:
        check('share: QR decode skipped (no OpenCV) — info only', True, 'opencv not installed')
    pg.click('#shareModal button:has-text("Copy link")'); pg.wait_for_timeout(300)
    check('share: Copy link copies the link', pg.evaluate("navigator.clipboard.readText()") == link)
    pg.screenshot(path=f'{SHOTS}/03-share-qr-desktop.png', full_page=False)
    pg.evaluate("closeShareModal()")
    # size limits: measure link length for growing lists of realistic rows
    meas = pg.evaluate("""async()=>{
        // realistic, non-repeating rows: seeded pseudo-random prep tasks, quantities, dishes and days
        let seed = 12345; const rnd = n => { seed = (seed*1103515245 + 12345) % 2147483648; return seed % n; };
        const verbs = ['Brunoise','Julienne','Roast','Pickle','Char','Confit','Blanch','Shave','Smoke','Whip','Dice','Slice','Pick','Toast','Puree','Reduce','Marinate','Portion','Grate','Segment'];
        const items = ['carrot','shallot','fennel','celeriac','beetroot','leek','zucchini','red capsicum','kale','radish','brown onion','garlic','ginger','long red chilli','coriander','flat parsley','dill','chives','lemon','lime','orange','pumpkin','sweet potato','eggplant','cauliflower','broccolini','asparagus','peas','broad beans','kipfler potato','mushrooms','tomato','cucumber','apple','pear','rhubarb','strawberries','chicken thigh','lamb shoulder','pork belly','beef cheek','snapper','prawns','mussels','tofu','chickpeas','lentils','rice','polenta','quinoa'];
        const extras = ['','',' for garnish',' (fine)',' 1 cm',' wedges',' to order',' for sauce',' skin on',' peeled'];
        const units = ['kg','kg','kg','g','L','ml','each','bunch'];
        const mk = n => { const rows=[]; for(let i=0;i<n;i++) rows.push({dish:rnd(14), task: verbs[rnd(20)]+' '+items[rnd(50)]+extras[rnd(10)], unit: units[rnd(8)], qty: (rnd(4000)+5)/100, day: rnd(7)}); return rows; };
        const out = [];
        for (const n of [5,10,20,30,40,50,60,80,100,125,150,200,300]){
            const rows = mk(n);
            const p = {v:1,k:'sec',n:'Vegetables',l:'Commis',d:'2026-10-03', ds:Array.from({length:14},(_, i)=>'Dish number '+(i+1)+' with a longer name'), dp:Array(14).fill(80),
              r: rows.map(r=>[r.dish, r.task, r.qty+' '+r.unit, r.day, rnd(5)===0 ? 'GLU DAI?' : ''])};
            const tok = await packShare(p); const link = location.origin+location.pathname+'#s='+tok;
            let ver = null; try { ver = qrSvg(link).version; } catch(e){ ver = 'too big'; }
            out.push({rows:n, json: JSON.stringify(p).length, link: link.length, qrVersion: ver});
        }
        return out; }""")
    measures['growth'] = meas
    one = [m for m in meas if m['link'] <= 2953]; maxrows = max(m['rows'] for m in one)
    measures['max_rows_one_qr_approx'] = maxrows
    check('share limits: measured link length grows with rows; QR at low error correction fits links up to 2,953 chars', all(meas[i]['link'] < meas[i + 1]['link'] for i in range(len(meas) - 1)) and all(m['qrVersion'] != 'too big' for m in one) and all(m['qrVersion'] == 'too big' for m in meas if m['link'] > 2953), meas)
    edge = pg.evaluate("(()=>{ const ok=[], bad=[]; const base=location.origin+'/'; for (const n of [2940, 2953, 2954, 3200]){ const s=base+'#s=z'+'A'.repeat(n-base.length-4); try{ ok.push([n, qrSvg(s).version]); }catch(e){ bad.push(n); } } return {ok, bad}; })()")
    measures['qr_capacity_edge'] = edge
    check('share limits: QR capacity edge measured — 2,953 chars fit (version 40-L), 2,954 do not', [x[0] for x in edge['ok']] == [2940, 2953] and edge['ok'][1][1] == 40 and edge['bad'] == [2954, 3200], edge)
    # split and too-big paths: synthetic big section via ROWS
    sp = pg.evaluate("""async()=>{
        const words = ['Brunoise','Julienne','Roast','Pickled','Charred','Confit','Blanched','Shaved','Smoked','Whipped'];
        const items = ['carrot','shallot','fennel','celeriac','beetroot','leek','zucchini','capsicum','kale','radish','onion','garlic','ginger','chilli','herbs'];
        let seed = 777; const rnd = n => { seed = (seed*1103515245 + 12345) % 2147483648; return seed % n; };
        const add = (n, sec) => { for (let i=0;i<n;i++) ROWS.push({...ROWS[0], dish: ROWS[rnd(ROWS.length>31?31:ROWS.length)].dish, task: words[rnd(10)]+' '+items[rnd(15)]+' batch '+rnd(1000), section: sec, qty: (rnd(900)+1)/1000}); };
        add(320, 'Big Jobs');
        const r1 = await shareLinksFor('Big Jobs');
        add(4000, 'Box off');
        const r2 = await shareLinksFor('Box off');
        const parts = await Promise.all(r1.parts.map(async l=>unpackShare(l.split('#s=')[1])));
        return {split: {rows: r1.rows, whole: r1.whole.length, n: r1.parts.length, lens: r1.parts.map(l=>l.length), split: r1.split, ok: r1.qrOk, labels: parts.map(x=>x.p), rowsBack: parts.reduce((s,x)=>s+x.r.length,0)},
                tooBig: {rows: r2.rows, whole: r2.whole.length, ok: r2.qrOk, n: r2.parts.length}}; }""")
    measures['split_example'] = sp['split']; measures['too_big_example'] = sp['tooBig']
    s1 = sp['split']
    check('share: a list too big for one QR is split into parts, each ≤ 2,953 chars, labelled Part i of N, all rows kept', s1['split'] and s1['ok'] and s1['n'] >= 2 and all(l <= 2953 for l in s1['lens']) and s1['labels'] == [[i + 1, s1['n']] for i in range(s1['n'])] and s1['rowsBack'] == s1['rows'], s1)
    check('share: a list too big even for 8 parts offers copy-link only (warning, no QR)', not sp['tooBig']['ok'], sp['tooBig'])
    pg.evaluate("openShareSection('Box off')"); pg.wait_for_selector('#shareTooBig', timeout=20000)
    check('share: the too-big dialog says so and still offers Copy link', 'too big for QR' in pg.inner_text('#shareTooBig') and pg.is_visible('#shareModal button:has-text("Copy link")') and pg.locator('#shareModal figure.share-qr').count() == 0)
    pg.evaluate("closeShareModal()"); pg.evaluate("openShareSection('Big Jobs')"); pg.wait_for_selector('#shareModal figure.share-qr', timeout=20000)
    check('share: split dialog shows one QR per part with "Part i of N"', pg.locator('#shareModal figure.share-qr').count() == s1['n'] and 'Part 1 of' in pg.inner_text('#shareModal'))
    pg.evaluate("closeShareModal()")
    check('share: no JS errors', not errs, errs)
    ctx.close()
    # phone, nothing stored, link opened cold
    ctx = new_ctx(b, 390, 844, is_mobile=True, has_touch=True, device_scale_factor=2); pg, errs = page_with_errs(ctx)
    pg.add_init_script("window.__lsWrites=[]; const _si=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){ window.__lsWrites.push(k); return _si.call(this,k,v); };")
    open_url = (URL.split('#')[0] + '#s=' + tok) if URL.startswith('file:') else link
    go(pg, open_url); pg.wait_for_selector('#sharedView .sv-table', timeout=10000)
    sv = pg.evaluate("({rows: document.querySelectorAll('#sharedView .sv-table tr').length, h1: document.querySelector('#sharedView h1').innerText, sw: document.documentElement.scrollWidth, mode: document.body.classList.contains('shared-mode'), sample: !!document.querySelector('#sharedView .sv-sample'), chips: document.querySelectorAll('#sharedView .al-chip').length, writes: window.__lsWrites, ls: Object.keys(localStorage)})")
    check('share phone view: opens read-only on a 390px phone with nothing stored, all rows, no sideways scroll', sv['rows'] == len(data['r']) and sv['h1'] == data['n'] and sv['sw'] <= 390 and sv['mode'] and sv['sample'], sv)
    check('share phone view: writes nothing to storage', not [k for k in sv['writes'] if k not in ('plTest', 'prepline.signup.v1')] and not [k for k in sv['ls'] if k != 'prepline.signup.v1'], (sv['writes'], sv['ls']))
    pg.locator('#sharedView .sv-tick input').first.tap()
    check('share phone view: tasks can be ticked on the phone (in memory only)', pg.locator('#sharedView .sv-tick input:checked').count() == 1 and not pg.evaluate("window.__lsWrites.length"))
    pg.screenshot(path=f'{SHOTS}/04-share-phone-view-390.png', full_page=False)
    go(pg, open_url[:-25])
    pg.wait_for_selector('#sharedView', timeout=10000); pg.wait_for_timeout(500)
    check('share phone view: a cut-off link shows a friendly "can\'t be opened" message', "can't be opened" in pg.inner_text('#sharedView'))
    check('share phone view: no JS errors', not errs, errs)
    ctx.close()

    # ================= 6. feedback =================
    ctx = new_ctx(b); ctx.grant_permissions(['clipboard-read', 'clipboard-write']); pg, errs = page_with_errs(ctx); go(pg); load_sample(pg)
    html_all = pg.content()
    app_js = pg.evaluate("[...document.scripts].filter(s=>s.textContent.includes('function openFeedback')||s.textContent.includes('LICENSE_CONFIG = {')).map(s=>s.textContent).join('\\n')")
    mailtos = pg.eval_on_selector_all('a[href^="mailto:"]', 'as=>as.map(a=>a.getAttribute("href"))')
    check('feedback: the only address is the public Autoprod one (autoprod.help@gmail.com) via SUPPORT_EMAIL; header "Email us" mailto next to Feedback; no placeholder address', 'autoprod.example' not in html_all and pg.evaluate("SUPPORT_EMAIL") == 'autoprod.help@gmail.com' and len(mailtos) == 1 and mailtos[0].startswith('mailto:autoprod.help@gmail.com?subject=') and pg.evaluate("document.getElementById('feedbackBtn').nextElementSibling.id") == 'contactLink' and set(re.findall(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}', re.sub(r'<script[^>]*src=[^>]*>', '', nostyle(html_all)))) <= {'autoprod.help@gmail.com'}, mailtos)
    pg.click('#feedbackBtn'); pg.wait_for_selector('#feedbackModal')
    mtxt = pg.inner_text('#feedbackModal')
    check('feedback: "Copy feedback text" stays the main action, plus "Email feedback"; the "whoever shared Prepline with you" note and the address are shown', pg.locator('#feedbackModal button:has-text("Copy feedback text")').count() == 1 and pg.locator('#fbMailBtn').count() == 1 and 'whoever shared Prepline with you' in mtxt and 'autoprod.help@gmail.com' in mtxt, mtxt[:260])
    check('feedback: "Include my current list" is unticked by default', not pg.is_checked('#fbIncludeList'))
    pg.fill('#fbText', 'Order sheet idea')
    pg.click('#fbCopyBtn'); pg.wait_for_timeout(300); clip = pg.evaluate("navigator.clipboard.readText()")
    ed = 'team build' if TEAM else None
    check('feedback: copied text has the message, app version, edition, browser and screen; no address', 'Order sheet idea' in clip and f'Prepline v{ver}' in clip and 'Browser:' in clip and 'Screen:' in clip and '@' not in clip.split('Browser:')[0] and (ed is None or ed in clip) and 'Copied' in pg.inner_text('#fbStatus'), clip[:220])
    check('feedback: no list data unless ticked', not any(x in clip for x in ['Sample:', 'Chicken supreme', 'Barramundi']), clip)
    pg.check('#fbIncludeList'); pg.click('#fbCopyBtn'); pg.wait_for_timeout(300); clip = pg.evaluate("navigator.clipboard.readText()")
    check('feedback: ticking "Include my current list" adds the list to the copied text', 'Chicken supreme' in clip and 'Sample: Roast Chicken' in clip)
    pg.evaluate("Object.defineProperty(navigator, 'clipboard', {value: {writeText: () => Promise.reject(new Error('blocked'))}, configurable: true})")
    pg.click('#fbCopyBtn'); pg.wait_for_timeout(300)
    pv = pg.evaluate("(()=>{const t=document.getElementById('fbPreview'); return [t.style.display, t.value.includes('Order sheet idea'), t.selectionEnd - t.selectionStart === t.value.length]})()")
    check('feedback: if the clipboard is blocked, the text is shown and selected to copy by hand', pv == ['block', True, True] and 'Ctrl+C' in pg.inner_text('#fbStatus'), pv)
    mt = pg.evaluate("supportMailto('Prepline feedback', feedbackBody())")
    from urllib.parse import unquote as _uq
    check('feedback: Email feedback builds mailto:autoprod.help@gmail.com with subject + the same text (version, browser, message)', mt.startswith('mailto:autoprod.help@gmail.com?subject=Prepline%20feedback&body=') and 'Order sheet idea' in _uq(mt) and f'Prepline v{ver}' in _uq(mt), mt[:160])
    long = pg.evaluate("supportMailto('x', 'y'.repeat(5000))")
    check('feedback: very long text is cut short in the mailto with a note to use Copy', len(_uq(long)) < 2100 and 'cut short' in _uq(long))
    pg.set_viewport_size({'width': 390, 'height': 800}); pg.wait_for_timeout(200)
    fbx = pg.evaluate("(()=>{const r=document.querySelector('#feedbackModal .share-card').getBoundingClientRect(); return [r.left>=0, r.right<=390, document.documentElement.scrollWidth];})()")
    check('feedback: dialog fits a 390px phone', fbx[0] and fbx[1] and fbx[2] <= 390, fbx)
    help_txt = pg.evaluate("document.getElementById('helpTab').innerText")
    check('feedback: Help text describes copying and names only the public address', set(re.findall(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}', help_txt)) <= {'autoprod.help@gmail.com'} and 'autoprod.help@gmail.com' in help_txt and 'whoever shared Prepline with you' in help_txt)
    check('feedback: no JS errors', not errs, errs)
    ctx.close()

    # ================= 7. installable app (PWA) =================
    u = urlparse(URL)
    if not PWA:
        ctx = new_ctx(b); pg, errs = page_with_errs(ctx); go(pg); pg.wait_for_timeout(800)
        st = pg.evaluate("(async()=>{ try{ return navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0; }catch(e){ return 0; } })()")
        check('PWA: skipped silently here (' + (urlparse(URL).scheme == 'file' and 'file://' or 'not a site path') + '): no manifest link, no service worker, no errors', st == 0 and not pg.evaluate("!!document.querySelector('link[rel=manifest]')") and not pg.evaluate("!!(navigator.serviceWorker && navigator.serviceWorker.controller)") and not errs, (st, errs))
        ctx.close()
    else:
        base = URL.rsplit('/', 1)[0] + '/'
        ctx = new_ctx(b); pg, errs = page_with_errs(ctx); go(pg)
        reg = pg.evaluate("""async()=>{const r=await navigator.serviceWorker.ready;
            if (r.active && r.active.state!=='activated') await new Promise(res=>{ r.active.addEventListener('statechange', ()=>{ if (r.active.state==='activated') res(); }); setTimeout(res, 10000); });
            return {scope:r.scope, state:r.active&&r.active.state, script:r.active&&r.active.scriptURL}}""")
        SC = urlparse(base).path
        check(f'PWA: service worker active, scope exactly {SC}', reg['state'] == 'activated' and urlparse(reg['scope']).path == SC and reg['script'].endswith(SC + 'sw.js'), reg)
        pg.reload(); pg.wait_for_load_state('networkidle')
        check('PWA: page is controlled after a reload', pg.evaluate("!!navigator.serviceWorker.controller"))
        cdp = ctx.new_cdp_session(pg)
        inst = cdp.send('Page.getInstallabilityErrors'); man = cdp.send('Page.getAppManifest')
        check('PWA: Chromium installability errors: none', inst.get('installabilityErrors') == [], inst)
        check('PWA: manifest parses with no errors', man.get('errors') == [] and man.get('url', '').endswith(SC + 'manifest.webmanifest'), man.get('errors'))
        mj = json.loads(pg.evaluate(f"fetch('{base}manifest.webmanifest').then(r=>r.text())"))
        sizes = {(i['sizes'], i.get('purpose', 'any')) for i in mj['icons']}
        from urllib.parse import urljoin
        murl = base + 'manifest.webmanifest'
        check(f'PWA: manifest fields: name, short_name, start_url and scope resolving to {SC}, standalone, theme colour, 192/512 + maskable icons',
              mj['short_name'] == 'Prepline' and urlparse(urljoin(murl, mj['scope'])).path == SC and urlparse(urljoin(murl, mj['start_url'])).path.startswith(SC) and mj['display'] == 'standalone' and mj['theme_color'] and {('192x192', 'any'), ('512x512', 'any'), ('512x512', 'maskable')} <= sizes, mj)
        app_m = man.get('manifest') or {}
        check('PWA: name says (TEST) only on the test site', ('(TEST)' in mj['name']) == (SC == '/prepline-test/'), mj['name'])
        icons_ok = pg.evaluate(f"Promise.all({json.dumps([i['src'] for i in mj['icons']] + ['icons/apple-touch-icon.png'])}.map(s=>fetch('{base}'+s).then(r=>r.ok && r.headers.get('content-type').includes('png'))))")
        check('PWA: all icons load (incl. apple-touch-icon)', all(icons_ok), icons_ok)
        ios = pg.evaluate("['apple-mobile-web-app-capable','apple-mobile-web-app-title','theme-color'].map(n=>!!document.querySelector('meta[name='+n+']')).concat([!!document.querySelector('link[rel=apple-touch-icon]')])")
        check('PWA: iOS add-to-home-screen tags present (apple-mobile-web-app-capable, title, touch icon)', all(ios), ios)
        swv = pg.evaluate("""()=>new Promise(r=>{const c=new MessageChannel(); c.port1.onmessage=e=>r(e.data); navigator.serviceWorker.controller.postMessage({type:'GET_VERSION'},[c.port2])})""")
        check('PWA: cache named after this site\'s scope and the app version (never shared with the other site)', swv == {'version': ver, 'cache': f'prepline:{SC}{ver}'}, swv)
        cached = pg.evaluate(f"caches.open('prepline:{SC}{ver}').then(c=>c.keys()).then(k=>k.map(r=>r.url))")
        if SITEONLY:
            check('PWA: app and same-site libraries cached (index, lib/xlsx, lib/pdf.js + worker), nothing from a CDN', any(x.endswith(SC + 'index.html') for x in cached) and sum(SC + 'lib/' in x for x in cached) == 3 and all(urlparse(x).hostname == SITE_HOST for x in cached), [x.split('/')[-1] for x in cached])
        else:
            check('PWA: app and CDN libraries cached (index, xlsx, pdf.js + worker)', any(x.endswith(SC + 'index.html') for x in cached) and sum('cdnjs.cloudflare.com' in x for x in cached) == 3, [x.split('/')[-1] for x in cached])
        ctx.set_offline(True)
        pg.reload(); pg.wait_for_load_state('load'); pg.wait_for_timeout(1200)
        off = pg.evaluate("({ver: document.querySelector('meta[name=prepline-version]').content, xlsx: typeof XLSX, pdf: typeof window.pdfjsLib})")
        load_sample(pg)
        check('PWA: offline reload works (page, xlsx and pdf.js from cache; sample menu loads)', off == {'ver': ver, 'xlsx': 'object', 'pdf': 'object'} and pg.evaluate("activeRows().length") > 0, off)
        try:
            with pg.expect_download(timeout=10000) as dl: pg.evaluate("setView('dish')"); pg.locator('button:has-text("📊 Export to Excel (editable)")').first.click()
            check('PWA: Excel export works offline', dl.value.suggested_filename.endswith('.xlsx'))
        except Exception as e:
            check('PWA: Excel export works offline', False, e)
        ctx.set_offline(False)
        if LIVE_URL:
            p2 = ctx.new_page(); p2.goto(LIVE_URL); p2.wait_for_load_state('networkidle'); p2.wait_for_timeout(800)
            OP = urlparse(LIVE_URL).path.rsplit('/', 1)[0] + '/' if not LIVE_URL.endswith('/') else urlparse(LIVE_URL).path
            p2.wait_for_timeout(1500)
            lv = p2.evaluate("(async()=>{ const r = await navigator.serviceWorker.getRegistration(location.href); const c = navigator.serviceWorker.controller; return {ctrl: c ? new URL(c.scriptURL).pathname : null, reg: r ? new URL(r.scope).pathname : null, manifest: (document.querySelector('link[rel=manifest]')||{}).href || null}; })()")
            ok_other = (lv['ctrl'] in (None, OP + 'sw.js')) and (lv['reg'] in (None, OP)) and (lv['manifest'] is None or urlparse(lv['manifest']).path == OP + 'manifest.webmanifest')
            check(f'PWA: this site\'s service worker never controls the other site ({OP}); anything there is its own', ok_other and not (lv['ctrl'] or '').startswith(SC), lv)
            back = pg.evaluate("(async()=>{ const r = await navigator.serviceWorker.getRegistration(location.href); return {scope: r && new URL(r.scope).pathname, caches: await caches.keys()}; })()")
            check(f'PWA: after visiting the other site, this site\'s worker and cache are still there (no clash)', back['scope'] == SC and f'prepline:{SC}{ver}' in back['caches'], back)
            p2.close()
        check('PWA: no JS errors', not errs, errs)
        ctx.close()
        if UPD_URL and UPD_DIR:
            ctx = new_ctx(b); pg, errs = page_with_errs(ctx); go(pg, UPD_URL)
            pg.evaluate("navigator.serviceWorker.ready"); pg.reload(); pg.wait_for_load_state('networkidle')
            swp = os.path.join(UPD_DIR, 'sw.js'); orig = open(swp).read(); ip = os.path.join(UPD_DIR, 'index.html'); iorig = open(ip).read()
            try:
                open(ip, 'w').write(iorig.replace('<title>', '<title>NEWINDEX ', 1))
                pg.reload(); pg.wait_for_load_state('networkidle')
                check('PWA: never a stale index: online reload gets the new index.html straight away (network first)', pg.title().startswith('NEWINDEX'), pg.title())
                open(swp, 'w').write(orig.replace(f"const VERSION = '{ver}'", f"const VERSION = '{ver}-next'"))
                pg.evaluate("window.__pwaReg.update()"); pg.wait_for_selector('#pwaUpdateBar', timeout=15000)
                check('PWA: a new version shows "update available — Reload" and waits (old worker keeps control)', 'new version' in pg.inner_text('#pwaUpdateBar') and pg.evaluate("!!window.__pwaReg.waiting"))
                pg.evaluate("window.__mark=1")
                with pg.expect_navigation(timeout=15000): pg.click('#pwaReloadBtn')
                pg.wait_for_load_state('networkidle')
                ks = pg.evaluate("caches.keys()")
                check('PWA: Reload activates the new worker, reloads once, old cache deleted', pg.evaluate("window.__mark===undefined") and ks == [f'prepline:{urlparse(UPD_URL).path.rsplit("/", 1)[0]}/{ver}-next'], ks)
                ctx.set_offline(True); pg.reload(); pg.wait_for_load_state('load')
                check('PWA: offline after the update serves the newest cached index', pg.title().startswith('NEWINDEX'), pg.title())
                ctx.set_offline(False)
            finally:
                open(swp, 'w').write(orig); open(ip, 'w').write(iorig)
            ctx.close()
    # phone layout with new features
    ctx = new_ctx(b, 390, 844, is_mobile=True, has_touch=True, device_scale_factor=2); pg, errs = page_with_errs(ctx); go(pg); load_sample(pg)
    widths = {}
    for v in ['dish', 'section', 'priority', 'order']:
        pg.evaluate(f"setView('{v}')"); pg.wait_for_timeout(150); widths[v] = pg.evaluate("document.documentElement.scrollWidth")
    pg.evaluate("setIngPanelOpen(true)"); pg.wait_for_timeout(150); widths['panel'] = pg.evaluate("document.documentElement.scrollWidth")
    check('phone 390px: all views incl. order sheet and Ingredients panel load with no page-level sideways scroll', all(w <= 390 for w in widths.values()), widths)
    pg.evaluate("setView('order')"); pg.wait_for_timeout(150); pg.screenshot(path=f'{SHOTS}/05-order-sheet-phone-390.png')
    check('phone 390px: no JS errors', not errs, errs)
    ctx.close()
    b.close()

if SITEONLY:
    results.append({'test': 'team site: zero requests to any other domain (all outside domains blocked)', 'ok': not net_attempts, 'info': str(net_attempts[:5])})
    print(('PASS' if not net_attempts else 'FAIL') + ' team site: zero requests to any other domain', net_attempts[:5])
if OFFLINE:
    results.append({'test': 'offline: zero network requests (all network blocked)', 'ok': not net_attempts, 'info': str(net_attempts[:5])})
    print(('PASS' if not net_attempts else 'FAIL') + ' offline: zero network requests (all network blocked)', net_attempts[:5])
json.dump({'url': URL, 'version': ver, 'results': results, 'measures': measures}, open(os.path.join(OUT, 'results-v33.json'), 'w'), indent=1)
print('\nMEASURES:', json.dumps(measures, indent=1))
fails = [r for r in results if not r['ok']]
print(f'\n{len(results)-len(fails)}/{len(results)} passed')
sys.exit(1 if fails else 0)
