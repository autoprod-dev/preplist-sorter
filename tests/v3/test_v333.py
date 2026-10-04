# Headless Chromium checks for Prepline 3.3.3: Report a problem, privacy link/page, dd/mm/yyyy dates,
# print fixes, and (public/team builds) no payment config in the page.
# Usage: python3 test_v333.py URL [--edition web|offline|team] [--public] [--test-build] [--browser-channel msedge]
import sys, re, json
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright
def arg(n, d=None): return sys.argv[sys.argv.index(n)+1] if n in sys.argv else d
URL = sys.argv[1]; EDITION = arg('--edition', 'web'); PUBLIC = '--public' in sys.argv or EDITION in ('offline', 'team')
TESTBUILD = '--test-build' in sys.argv; CHANNEL = arg('--browser-channel'); EXPECT = arg('--expect-version', '3.3.3')
FILE = URL.startswith('file:'); HOST = urlparse(URL).hostname
results = []
def check(name, ok, info=''):
    results.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name + ('  | ' + str(info)[:300] if info and not ok else ''))
BAD = re.compile(r"lemon ?squeezy|lemonsqueezy|checkout|/v1/licenses|485739|1395962|1395968|2179964|2179971|2179974|LAUNCH50|TEST-PRO", re.I)
with sync_playwright() as p:
    b = p.chromium.launch(channel=CHANNEL) if CHANNEL else p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 900}, locale='en-US', timezone_id='Australia/Sydney')
    reqs = []
    ctx.on('request', lambda r: reqs.append(r.url))
    if EDITION in ('offline', 'team') and FILE:
        ctx.route(re.compile(r'^(https?|wss?)://.*'), lambda route: (reqs.append('BLOCKED ' + route.request.url), route.abort()))
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_load_state('networkidle')
    check('version ' + EXPECT, pg.evaluate("document.querySelector('meta[name=prepline-version]').content") == EXPECT and ('v' + EXPECT) in pg.inner_text('#appVersion'))
    src = pg.content() if FILE else pg.evaluate("fetch(location.href, {cache:'no-store'}).then(r=>r.text())")
    if PUBLIC:
        left = sorted(set(m.group(0) for m in BAD.finditer(src)))
        check('public page: no Lemon Squeezy / checkout / store / variant ids / API base in the HTML', not left, left)
        check('public page: Pro off, no PRO pills/labels shown', pg.evaluate("LICENSE_CONFIG.mode") == 'off' and pg.evaluate("[...document.querySelectorAll('.pro-pill,.pro-tag')].filter(e=>e.offsetParent && /\\bpro\\b/i.test(e.textContent)).length") == 0)
    if TESTBUILD:
        check('test build keeps the Lemon Squeezy test config (so the Pro test site still works)', pg.evaluate("!!(LICENSE_CONFIG.checkout && LICENSE_CONFIG.lemonSqueezy && LICENSE_CONFIG.lemonSqueezy.storeId)"))
    # ---------- Report a problem ----------
    btn = pg.locator('#reportBtn')
    check('Report a problem button visible in the top bar next to Feedback / Email us', btn.is_visible() and 'Report a problem' in btn.inner_text()
          and pg.evaluate("(()=>{const f=document.getElementById('feedbackBtn').getBoundingClientRect(), r=document.getElementById('reportBtn').getBoundingClientRect(); return Math.abs(f.top-r.top)<40;})()"))
    pg.click('#sampleMenuBtn'); pg.wait_for_function('ROWS.length>0'); pg.wait_for_timeout(600)
    pg.evaluate("document.getElementById('surveyToast') && document.getElementById('surveyToast').remove()")
    pg.evaluate("setView('section')"); pg.wait_for_timeout(200)
    n0 = len(reqs)
    btn.click(); pg.wait_for_selector('#reportModal')
    auto = pg.inner_text('#rpAuto')
    check('report: auto info shows version, view, browser/OS, screen, edition and date', all(k in auto for k in ['Prepline v' + EXPECT, 'By team section', 'Browser:', 'Screen:', f'({EDITION} edition)', 'Date:']) and re.search(r'Date: \d{2}/\d{2}/\d{4}', auto), auto)
    check('report: include-list box is off by default', pg.evaluate("document.getElementById('rpIncludeList').checked === false"))
    pg.evaluate("window.__lastReportMailto = null"); pg.click('#rpMailBtn'); pg.wait_for_timeout(200)
    check('report: description is required (no email opened, message shown)', pg.evaluate("window.__lastReportMailto") is None and 'describe the problem' in pg.inner_text('#rpStatus'))
    pg.fill('#rpDesc', 'The prep day print cut off a row'); pg.fill('#rpDoing', 'Printing all prep days')
    pg.click('#rpMailBtn'); pg.wait_for_timeout(300)
    url = pg.evaluate("window.__lastReportMailto") or ''
    body = unquote(url.split('&body=', 1)[1]) if '&body=' in url else ''
    subj = unquote(url.split('subject=', 1)[1].split('&', 1)[0]) if 'subject=' in url else ''
    check('report: mailto to autoprod.help@gmail.com with subject "Prepline problem report v' + EXPECT + '"', url.startswith('mailto:autoprod.help@gmail.com?') and subj == 'Prepline problem report v' + EXPECT, (url[:120], subj))
    check('report: body has the description, what I was doing and the auto info', 'The prep day print cut off a row' in body and 'Printing all prep days' in body and 'Browser:' in body and f'({EDITION} edition)' in body, body[:300])
    check('report: no recipe data unless ticked (no dish names in the body)', 'Roast Chicken' not in body and 'My current list' not in body, body[:400])
    pg.check('#rpIncludeList'); pg.click('#rpMailBtn'); pg.wait_for_timeout(200)
    b2 = unquote((pg.evaluate("window.__lastReportMailto") or '').split('&body=', 1)[-1])
    check('report: ticking the box adds the list', 'My current list' in b2 and 'Roast Chicken' in b2, b2[-200:])
    check('report: body capped at about 1,800 characters', len(b2) <= 1800, len(b2))
    pg.fill('#rpDesc', 'x' * 2600); pg.click('#rpMailBtn'); pg.wait_for_timeout(200)
    b3 = unquote((pg.evaluate("window.__lastReportMailto") or '').split('&body=', 1)[-1])
    check('report: a very long report is cut to 1,800 characters with a note', len(b3) <= 1800 and 'Copy report' in b3, len(b3))
    pg.fill('#rpDesc', 'Copy test'); pg.uncheck('#rpIncludeList'); pg.evaluate("window.__lastReportCopy=null"); pg.click('#rpCopyBtn'); pg.wait_for_timeout(300)
    cp = pg.evaluate("window.__lastReportCopy") or ''
    check('report: Copy report gives the full report text with the subject', cp.startswith('Subject: Prepline problem report v' + EXPECT) and 'Copy test' in cp and 'Browser:' in cp, cp[:200])
    newreq = [u for u in reqs[n0:] if not u.startswith(('data:', 'blob:', 'mailto:'))]
    check('report: no network request while reporting', not newreq, newreq[:3])
    pg.evaluate("closeReport()")
    check('footer: Report a problem link', pg.locator('#footerReportLink').is_visible())
    # ---------- privacy ----------
    pl = pg.locator('#privacyLink')
    check('footer: Privacy link visible, points to privacy.html', pl.is_visible() and pl.get_attribute('href') == 'privacy.html')
    if FILE:
        pl.click(); pg.wait_for_timeout(300)
        t = pg.inner_text('#privacyModal') if pg.locator('#privacyModal').count() else ''
        check('privacy (file://): opens in the app, no page fetched', 'stay on your device' in t and 'autoprod.help@gmail.com' in t and len(ctx.pages) == 1, t[:200])
        pg.evaluate("closePrivacy()")
    else:
        with ctx.expect_page() as np: pl.click()
        pp = np.value; pp.wait_for_load_state()
        r = pp.evaluate("fetch(location.href,{cache:'no-store'}).then(r=>r.status)")
        txt = pp.inner_text('body')
        check('privacy page: 200 and covers device-only data, no tracking, optional survey/feedback, optional email, contact, date',
              r == 200 and all(k in txt for k in ['stay on your device', 'No accounts, no tracking', 'autoprod.help@gmail.com', 'email field is optional', 'Last updated 04/10/2026']), (r, txt[:200]))
        noidx = pp.locator('meta[name=robots]').count()
        check('privacy page: noindex ' + ('present (team/test)' if EDITION == 'team' or TESTBUILD else 'absent (public)'), (noidx > 0) == (EDITION == 'team' or TESTBUILD))
        pp.close()
    # ---------- dates ----------
    stamp = pg.evaluate("fmtDateTime(new Date(2026,9,4,22,5))")
    check('dates: dd/mm/yyyy in an en-US browser (fmtDateTime)', stamp == 'Sun 04/10/2026 at 10:05 pm', stamp)
    pg.evaluate("window.__prints=[]; window.printViaIframe = h => window.__prints.push(h);")
    pg.evaluate("setView('order')"); pg.wait_for_timeout(300)
    pg.evaluate("printAllOfView('order', 'order-sheets.html')"); pg.wait_for_function("window.__prints.filter(Boolean).length>0")
    oh = pg.evaluate("window.__prints.filter(Boolean).pop()")
    import datetime; today = datetime.date.today().strftime('%d/%m/%Y')
    check('dates: order sheet "printed dd/mm/yyyy"', ('printed ' + today) in oh, re.findall(r'printed [^<]{0,14}', oh)[:1])
    # ---------- print fixes ----------
    q = ctx.new_page(); q.set_content(oh); q.emulate_media(media='print'); q.wait_for_timeout(200)
    f = q.evaluate("(()=>{const d=document.querySelector('.print-only td.dish'); return [d?parseFloat(getComputedStyle(d).fontSize):0, getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor];})()")
    check('print: Used in / Dishes column is about 8pt or more (>= 10.6px)', f[0] >= 10.6, f)
    check('print: html and body background white', f[1] in ('rgb(255, 255, 255)',) and f[2] == 'rgb(255, 255, 255)', f)
    q.close()
    pg.evaluate("window.__prints=[]"); pg.evaluate("setView('priority')"); pg.wait_for_timeout(300)
    pg.evaluate("printAllDays()"); pg.wait_for_function("window.__prints.filter(Boolean).length>0")
    dh = pg.evaluate("window.__prints.filter(Boolean).pop()")
    q = ctx.new_page(); q.set_content(dh); q.emulate_media(media='print'); q.wait_for_timeout(200)
    lines = q.evaluate("[...document.querySelectorAll('.print-only td.pf-lead, .print-only td.pf-section')].map(td=>Math.round(td.getBoundingClientRect().height / parseFloat(getComputedStyle(td).lineHeight || 13)))")
    lh = q.evaluate("[...document.querySelectorAll('.print-only td.pf-lead, .print-only td.pf-section')].map(td=>{const r=document.createRange(); r.selectNodeContents(td); return r.getClientRects().length;})")
    check('print: prep-day Section / Lead never wrap to 3 lines', lh and max(lh) <= 2, (max(lh) if lh else None, len(lh)))
    q.close()
    check('no page errors', not errs, errs[:3])
    b.close()
print(f'{sum(results)}/{len(results)} passed'); sys.exit(0 if all(results) else 1)
