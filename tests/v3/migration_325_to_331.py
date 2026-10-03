# Saved data from the live v3.2.5 page must keep working after the live update to v3.3.1.
# Usage: python3 migration_325_to_331.py OLD_INDEX NEW_INDEX SERVE_DIR PORT
# SERVE_DIR/preplist-sorter/index.html is swapped from OLD to NEW inside one browser profile.
import sys, shutil, json, http.server, threading, functools
from playwright.sync_api import sync_playwright
OLD, NEW, ROOT, PORT = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
S = '/workspace/prepline-v3/tests/v3/samples/'
DST = ROOT + '/preplist-sorter/index.html'; URL = f'http://127.0.0.1:{PORT}/preplist-sorter/index.html'
res = []
def check(n, ok, info=''): ok = bool(ok); res.append(ok); print(('PASS ' if ok else 'FAIL ') + n + (('  | ' + str(info)[:300]) if info != '' else ''))
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
h.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), h); threading.Thread(target=srv.serve_forever, daemon=True).start()
SNAP = """JSON.stringify({rows:ROWS.map(r=>[r.dish,r.task,String(r.qty),r.unit,r.section,r.day||'']), pax:paxByDish, leaders:leaderBySection,
 db:Object.keys(JSON.parse(localStorage.getItem('preplistDishDatabase_v1')||'{}')).sort(), pm: localStorage.getItem('preplinePref_printIncludeMethod_v1')})"""
with sync_playwright() as p:
    for pref in ['yes', 'no', None]:
        prof = f'/tmp/mig325-{pref}'; shutil.rmtree(prof, ignore_errors=True)
        shutil.copy(OLD, DST)
        ctx = p.chromium.launch_persistent_context(prof, headless=True, viewport={'width': 1280, 'height': 900})
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_load_state('networkidle')
        check(f'[{pref}] old live page is v3.2.5', pg.get_attribute('meta[name="prepline-version"]', 'content') == '3.2.5')
        pg.evaluate("setToolMode('database')"); pg.set_input_files('#fileInput', S + 'awkward-tabs.xlsx'); pg.wait_for_timeout(3000)
        pg.evaluate("setToolMode('onetime')"); pg.set_input_files('#fileInput', S + 'sample-recipes.pdf'); pg.wait_for_timeout(4000)
        pg.evaluate("setPax(encName(ROWS[0].dish), '75'); leaderBySection['Vegetables']='Team A'; renderApp()")
        if pref: pg.evaluate(f"localStorage.setItem('preplinePref_printIncludeMethod_v1', '{pref}')")
        pg.wait_for_timeout(1500)
        before = json.loads(pg.evaluate(SNAP)); pg.close()
        shutil.copy(NEW, DST)
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(800)
        after = json.loads(pg.evaluate(SNAP))
        check(f'[{pref}] new live page is v3.3.1 with Pro off', pg.get_attribute('meta[name="prepline-version"]', 'content') == '3.3.1' and pg.evaluate("LICENSE_CONFIG.mode") == 'off')
        check(f'[{pref}] saved list, pax, team leads and recipe database all still there', before == after and len(after['rows']) > 0 and after['db'], (len(before['rows']), len(after['rows']), after['db'][:3]))
        want = (pref == 'yes')
        check(f'[{pref}] "Include method in printout" = {"Yes" if want else "No"} (stored choice kept; nothing stored = No)', pg.evaluate("includeMethodInPrint") == want and after['pm'] == pref)
        check(f'[{pref}] 3.3 features work on the old saved list (allergen chips, order sheet)', pg.locator('#resultsArea .al-chip').count() > 0 and pg.evaluate("orderGroups().length") > 0)
        check(f'[{pref}] no JS errors', not errs, errs)
        ctx.close()
srv.shutdown()
print(f'\n{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
