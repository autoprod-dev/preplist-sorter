# Prepline 3.3.4 (test site): phone fixes found by the mobile check.
#  - 320px phones: no horizontal overflow (summary table scrolls inside its box), survey prompt reachable
#  - touch screens: checkboxes / footer links big enough to tap
#  - local (not UTC) dates in Excel file names and share links
# Usage: python3 test_v334.py URL [--expect-version 3.3.4]
import sys, re, os
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; EXPECT = sys.argv[sys.argv.index('--expect-version')+1] if '--expect-version' in sys.argv else '3.3.4'
OUT = '/tmp/test_v334'; os.makedirs(OUT, exist_ok=True)
results = []
def check(n, ok, info=''): results.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n + ('  | ' + str(info)[:300] if info and not ok else ''))
OVER = "(()=>{const W=document.documentElement.clientWidth; return [document.documentElement.scrollWidth, W];})()"
with sync_playwright() as p:
    for dev, eng in [('Galaxy S9+', 'chromium'), ('iPhone SE', 'webkit'), ('Pixel 5', 'chromium')]:
        b = getattr(p, eng).launch(); d = dict(p.devices[dev]); d.pop('default_browser_type', None)
        ctx = b.new_context(**d, accept_downloads=True, timezone_id='Australia/Sydney', locale='en-US')
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.clock.set_fixed_time('2026-10-05T07:30:00+11:00')   # 4 Oct in UTC, 5 Oct in Sydney
        pg.goto(URL); pg.wait_for_load_state('networkidle')
        check(f'{dev}: version {EXPECT}', pg.evaluate("document.querySelector('meta[name=prepline-version]').content") == EXPECT)
        pg.locator('#sampleMenuBtn').tap(); pg.wait_for_function('ROWS.length>0'); pg.wait_for_selector('#surveyToast', timeout=8000)
        sw, W = pg.evaluate(OVER)
        check(f'{dev}: no horizontal overflow with the sample menu loaded ({W}px)', sw <= W + 1, (sw, W))
        try:
            pg.locator('#surveyToast .st-no').tap(timeout=5000); ok = pg.locator('#surveyToast').count() == 0
        except Exception as e: ok = False
        check(f'{dev}: survey prompt "No thanks" is on screen and tappable', ok)
        for v in ['dish', 'section', 'priority', 'order']:
            pg.evaluate(f"setView('{v}')"); pg.wait_for_timeout(250); sw, W = pg.evaluate(OVER)
            check(f'{dev}: {v} view fits the screen width', sw <= W + 1, (sw, W))
        sizes = pg.evaluate("[...document.querySelectorAll('#preplistTab input[type=checkbox]')].filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect(); return Math.min(r.width, r.height);})")
        check(f'{dev}: checkboxes at least 24px ({len(sizes)} visible)', sizes and min(sizes) >= 23.5, sorted(set(round(s) for s in sizes))[:5])
        fl = pg.evaluate("[...document.querySelectorAll('.footer-links a')].map(a=>Math.round(a.getBoundingClientRect().height))")
        check(f'{dev}: footer links at least 24px tall', fl and min(fl) >= 24, fl)
        if dev == 'Pixel 5':
            pg.evaluate("setView('dish')"); pg.wait_for_timeout(250)
            with pg.expect_download() as dl: pg.locator('[data-export="exportDishesToXlsx"]').first.tap()
            check('Excel file name uses the Sydney date (2026-10-05), not UTC', '2026-10-05' in dl.value.suggested_filename, dl.value.suggested_filename)
            pg.evaluate("setView('order')"); pg.wait_for_timeout(250)
            with pg.expect_download() as dl: pg.locator('[onclick="exportOrderToXlsx()"]').first.tap()
            check('order sheet file name uses the Sydney date', dl.value.suggested_filename == 'Order_Sheet_2026-10-05.xlsx', dl.value.suggested_filename)
            check('share link date is the Sydney date', pg.evaluate("localYMD()") == '2026-10-05')
            check('a saved ISO timestamp is shown in local time (dd/mm/yyyy)', pg.evaluate("fmtDMY('2026-10-04T21:00:00.000Z')") == '05/10/2026' and pg.evaluate("fmtDMY('2026-10-04')") == '04/10/2026')
            pg.evaluate("setView('section')"); pg.wait_for_timeout(250)
            pg.screenshot(path=f'{OUT}/pixel5-section.png')
        check(f'{dev}: no page errors', not errs, errs[:2])
        b.close()
    # desktop (fine pointer, wide): checkbox size unchanged
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 900}); pg.goto(URL); pg.wait_for_load_state('networkidle')
    pg.click('#sampleMenuBtn'); pg.wait_for_function('ROWS.length>0'); pg.wait_for_timeout(300)
    s = pg.evaluate("Math.round(document.querySelector('#preplistTab input.rowcheck, #preplistTab input[type=checkbox]').getBoundingClientRect().width)")
    check('desktop: checkboxes keep their normal size', s <= 16, s)
    b.close()
print(f'{sum(results)}/{len(results)} passed'); sys.exit(0 if all(results) else 1)
