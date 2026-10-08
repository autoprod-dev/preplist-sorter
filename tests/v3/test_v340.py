#!/usr/bin/env python3
# Prepline 3.4.0: first-visit welcome box (name + position) and the sign-up queue.
# Usage: python3 test_v340.py URL [--skip-url URL_OF_ALLOW_SKIP_BUILD] [--other-url URL_ON_ANOTHER_PATH] [--file PATH]
#        [--shots DIR] [--expect-version 3.4.0] [--real]   (--real: don't mock the endpoint; never used by default)
# The Apps Script endpoint is ALWAYS intercepted (mocked) unless --real, so tests never write to the Sheet.
import sys, json, re, time, os
from playwright.sync_api import sync_playwright
def arg(n, d=None): return sys.argv[sys.argv.index(n)+1] if n in sys.argv else d
URL = sys.argv[1]; SKIP_URL = arg('--skip-url'); OTHER_URL = arg('--other-url'); FILE = arg('--file')
SHOTS = arg('--shots'); EXPECT = arg('--expect-version', '3.4.0')
if SHOTS: os.makedirs(SHOTS, exist_ok=True)
ok_n = 0; bad = []
def check(name, cond, extra=''):
    global ok_n
    if cond: ok_n += 1; print('PASS', name)
    else: bad.append(name); print('FAIL', name, ' |', extra)
EP = re.compile(r'https://script\.google(usercontent)?\.com/.*')

class Mock:
    def __init__(self, ctx, mode='ok'):
        self.mode = mode; self.calls = []
        ctx.route(EP, self.handle)
    def handle(self, route):
        req = route.request
        self.calls.append({'url': req.url, 'body': req.post_data, 'ct': req.headers.get('content-type', ''), 't': time.time()})
        if self.mode == 'fail': return route.abort('internetdisconnected')
        payload = {'ok': True} if self.mode == 'ok' else {'ok': False, 'code': self.mode}
        route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps(payload))

def box(pg): return pg.locator('#welcomeModal')
def visible(pg): return box(pg).count() > 0 and box(pg).is_visible()
def ls(pg, k): return pg.evaluate(f"localStorage.getItem('{k}')")
QK, DK = 'prepline.signupQueue.v1', 'prepline.signup.v1'

with sync_playwright() as p:
    ch = p.chromium.launch(); wk = p.webkit.launch(); ff = p.firefox.launch()
    # ---------- shows, version, layout at 320 / 390 / landscape ----------
    for eng, dev, label in [(wk, 'iPhone SE', '320'), (ch, 'Pixel 5', '390'), (wk, 'iPhone 13', '390-ios'), (ff, None, 'firefox-390')]:
        ctx = eng.new_context(**(p.devices[dev] if dev else {'viewport': {'width': 390, 'height': 844}, 'has_touch': True}))
        Mock(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_selector('#welcomeModal', timeout=8000); pg.wait_for_timeout(300)
        if label == '320': check('version ' + EXPECT, pg.evaluate("document.querySelector('meta[name=prepline-version]').content") == EXPECT)
        W = pg.evaluate('innerWidth'); sw = pg.evaluate('document.documentElement.scrollWidth')
        card = pg.locator('.wm-card').bounding_box(); btn = pg.locator('#wmStart').bounding_box()
        check(f'{label}: box shows on first visit', visible(pg))
        check(f'{label}: no horizontal scroll (scrollWidth {sw} vs {W})', sw <= W, (sw, W))
        check(f'{label}: card inside the screen', card['x'] >= 0 and card['x'] + card['width'] <= W + 0.5, card)
        check(f'{label}: name field focused', pg.evaluate("document.activeElement && document.activeElement.id") == 'wmName')
        small = pg.evaluate("""[...document.querySelectorAll('#welcomeModal .wm-pos label, #wmStart, #wmName')].map(e=>e.getBoundingClientRect()).filter(r=>r.height<40).length""")
        check(f'{label}: position buttons, name field and Start at least 40px tall', small == 0, small)
        check(f'{label}: no page errors', not errs, errs[:2])
        if SHOTS and label in ('320', '390'):
            pg.screenshot(path=f'{SHOTS}/form-{label}.png')
        ctx.close()
    ctx = wk.new_context(**p.devices['iPhone 13 landscape']); Mock(ctx); pg = ctx.new_page(); pg.goto(URL); pg.wait_for_selector('#welcomeModal')
    pg.locator('#wmStart').scroll_into_view_if_needed(); bb = pg.locator('#wmStart').bounding_box(); H = pg.evaluate('innerHeight')
    check(f'landscape (iPhone 13): Start button reachable (y {round(bb["y"])}, h {H})', bb['y'] >= 0 and bb['y'] + bb['height'] <= H + 1)
    check('landscape: no horizontal scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    ctx.close()

    # ---------- validation, Other, Enter submits, payload, shows once ----------
    ctx = ch.new_context(**p.devices['Pixel 5']); m = Mock(ctx); pg = ctx.new_page(); pg.goto(URL); pg.wait_for_selector('#welcomeModal')
    check('ALLOW_SKIP off: no "Skip for now"', pg.locator('#wmSkip').count() == 0)
    pg.keyboard.press('Escape'); check('ALLOW_SKIP off: Escape does not close', visible(pg))
    check('under-form note text', "So the maker can see who's trying Prepline. Only your name, role, the date and your rough location (from your device's time zone) are saved. Privacy" in pg.locator('.wm-note').inner_text())
    check('Privacy link points to privacy.html', pg.locator('.wm-note a').get_attribute('href') == 'privacy.html')
    check('background is inert while open', pg.evaluate("!!document.querySelector('#sampleMenuBtn').closest('[inert]')"))
    # Tab focus trap
    inside = []
    for i in range(14): pg.keyboard.press('Tab'); inside.append(pg.evaluate("document.getElementById('welcomeModal').contains(document.activeElement)"))
    check('focus trap: Tab stays inside the box', all(inside), inside)
    pg.locator('#wmName').focus(); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    check('empty submit: name error shown', 'Please enter your name' in pg.locator('#wmNameErr').inner_text() and pg.locator('#wmName').get_attribute('aria-invalid') == 'true')
    if SHOTS: pg.screenshot(path=f'{SHOTS}/validation-error.png')
    pg.locator('#wmName').fill('B' * 45)
    check('name field stops at 40 characters (maxlength)', len(pg.locator('#wmName').input_value()) == 40)
    for val, msg in [('A', '2 to 40'), ('Sam 2', 'letters'), ('=cmd', 'letters'), ('🍳🍳', 'letters')]:
        pg.locator('#wmName').fill(val); pg.keyboard.press('Enter'); pg.wait_for_timeout(80)
        check(f'name {val[:12]!r} rejected', msg in pg.locator('#wmNameErr').inner_text() and visible(pg), pg.locator('#wmNameErr').inner_text())
    pg.locator('#wmName').fill('Zoë O’Brien-Núñez'); pg.keyboard.press('Enter'); pg.wait_for_timeout(80)
    check('accented name + curly apostrophe accepted; position error shown', pg.locator('#wmNameErr').inner_text() == '' and 'choose your position' in pg.locator('#wmPosErr').inner_text())
    check('Other text field hidden until Other chosen', pg.locator('#wmOtherWrap').is_hidden())
    pg.locator('.wm-pos label', has_text='Other').click()
    check('Other shows the text field and focuses it', pg.locator('#wmOther').is_visible() and pg.evaluate("document.activeElement.id") == 'wmOther')
    if SHOTS: pg.screenshot(path=f'{SHOTS}/other-open.png')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(80)
    check('Other empty rejected', 'Please enter your position' in pg.locator('#wmOtherErr').inner_text())
    pg.locator('#wmOther').fill('Q'); pg.keyboard.press('Enter'); pg.wait_for_timeout(80)
    check('Other 1 char rejected', '2 to 30' in pg.locator('#wmOtherErr').inner_text())
    pg.locator('#wmOther').fill('Q' * 31 if False else 'QA test 2'); pg.keyboard.press('Enter'); pg.wait_for_timeout(80)
    check('Other with digits rejected', 'letters' in pg.locator('#wmOtherErr').inner_text())
    check('nothing sent while invalid', len(m.calls) == 0)
    pg.locator('#wmOther').fill('  Pastry   lead '); t0 = time.time(); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
    check('valid submit (Enter): box closes at once', not visible(pg) and pg.evaluate("!document.querySelector('[inert]')"))
    check('remembered in localStorage', bool(ls(pg, DK)))
    pg.wait_for_timeout(2200)
    check('sent once, in the background', len(m.calls) == 1, len(m.calls))
    c = m.calls[0]; b = json.loads(c['body'])
    check('POST is text/plain (no CORS preflight)', c['ct'].startswith('text/plain'))
    SITE = 'live' if '/preplist-sorter/' in URL else 'test'
    check(f'URL ends with ?site={SITE}', c['url'].endswith('/exec?site=' + SITE), c['url'])
    check('payload has only v,name,position,other,ms,hp + tz,lang,loc (3.4.1 approx location)', set(b) == {'v', 'name', 'position', 'other', 'ms', 'hp', 'tz', 'lang', 'loc'}, b)
    check('payload values cleaned', b['name'] == "Zoë O'Brien-Núñez" and b['position'] == 'Other' and b['other'] == 'Pastry lead' and b['hp'] == '', b)
    check('no device / version / source / user agent sent', not re.search(r'Mozilla|iPhone|Android|3\.4\.0|device|version|source', c['body']), c['body'])
    check('ms >= 1500 when sent', b['ms'] >= 1500, b['ms'])
    check('queue cleared after {ok:true}', ls(pg, QK) is None)
    pg.reload(); pg.wait_for_timeout(1500)
    check('shows once: not shown after reload', box(pg).count() == 0)
    check('no extra request after reload', len(m.calls) == 1)
    ctx.close()

    # ---------- offline queue + retry (once per load, max 5) ----------
    ctx = ch.new_context(viewport={'width': 1280, 'height': 900}); m = Mock(ctx, 'fail'); pg = ctx.new_page(); pg.goto(URL); pg.wait_for_selector('#welcomeModal')
    pg.locator('#wmName').fill('Net Fail'); pg.locator('.wm-pos label', has_text='Cook').click(); pg.locator('#wmStart').click(); pg.wait_for_timeout(2600)
    q = json.loads(ls(pg, QK) or 'null')
    check('network down: app opens anyway, entry queued (tries 1)', not visible(pg) and q and q['tries'] == 1, q)
    for n in range(2, 6):
        before = len(m.calls); pg.reload(); pg.wait_for_timeout(3600)
        q = json.loads(ls(pg, QK) or 'null')
        check(f'load {n}: exactly one retry this load', len(m.calls) == before + 1, len(m.calls) - before)
        if n < 5: check(f'load {n}: still queued (tries {n})', q and q['tries'] == n, q)
    check('after 5 failed tries the entry is dropped', ls(pg, QK) is None)
    before = len(m.calls); pg.reload(); pg.wait_for_timeout(3200)
    check('no more retries after dropping', len(m.calls) == before and box(pg).count() == 0)
    ctx.close()
    ctx = ch.new_context(); m = Mock(ctx, 'fail'); pg = ctx.new_page(); pg.goto(URL); pg.wait_for_selector('#welcomeModal')
    pg.locator('#wmName').fill('Late Net'); pg.locator('.wm-pos label', has_text='Cook').click(); pg.locator('#wmStart').click(); pg.wait_for_timeout(2600)
    m.mode = 'busy'; pg.reload(); pg.wait_for_timeout(3600)
    check('busy reply: kept for a later retry', json.loads(ls(pg, QK) or 'null')['tries'] == 2)
    m.mode = 'ok'; pg.reload(); pg.wait_for_timeout(3600)
    check('network back: retry succeeds and queue clears', ls(pg, QK) is None and len(m.calls) == 3)
    ctx.close()
    ctx = ch.new_context(); m = Mock(ctx, 'invalid'); pg = ctx.new_page(); pg.goto(URL); pg.wait_for_selector('#welcomeModal')
    pg.locator('#wmName').fill('Bad Data'); pg.locator('.wm-pos label', has_text='Cook').click(); pg.locator('#wmStart').click(); pg.wait_for_timeout(2600)
    check('server rejected (invalid): dropped, not retried', ls(pg, QK) is None)
    ctx.close()

    # ---------- quick submit (autofill + tap in under 1.5 s) ----------
    ctx = ch.new_context(); m = Mock(ctx); pg = ctx.new_page(); pg.goto(URL); pg.wait_for_selector('#welcomeModal')
    pg.evaluate("document.getElementById('wmName').value='Quick Tap'; document.querySelector('input[name=wmPos][value=Cook]').checked=true; document.getElementById('wmForm').requestSubmit()")
    pg.wait_for_timeout(2500)
    check('quick submit (<1.5 s): sent after 1.5 s with ms >= 1500 (server would accept)', m.calls and json.loads(m.calls[0]['body'])['ms'] >= 1500 and m.calls[0]['t'] > 0, m.calls and m.calls[0]['body'])
    ctx.close()

    # ---------- honeypot ----------
    ctx = ch.new_context(); m = Mock(ctx); pg = ctx.new_page(); pg.goto(URL); pg.wait_for_selector('#welcomeModal')
    check('honeypot field hidden from people and screen readers', pg.locator('.wm-hp').get_attribute('aria-hidden') == 'true' and pg.locator('#wmWebsite').get_attribute('tabindex') == '-1')
    pg.evaluate("document.getElementById('wmWebsite').value='http://spam.example'")
    pg.locator('#wmName').fill('Bot Name'); pg.locator('.wm-pos label', has_text='Cook').click(); pg.locator('#wmStart').click(); pg.wait_for_timeout(2400)
    check('honeypot value is sent (server drops it silently)', m.calls and json.loads(m.calls[0]['body'])['hp'] == 'http://spam.example')
    ctx.close()

    # ---------- sample menu loads behind it; survey prompt waits ----------
    ctx = ch.new_context(); Mock(ctx); pg = ctx.new_page(); pg.goto(URL); pg.wait_for_selector('#welcomeModal')
    pg.evaluate('loadSampleMenu()'); pg.wait_for_function('ROWS.length > 0', timeout=8000); pg.wait_for_timeout(3500)
    check('sample menu loads behind the box', pg.evaluate('ROWS.length') > 20 and visible(pg))
    check('survey prompt does not pop over the box', pg.locator('#surveyToast').count() == 0)
    # print while the box is open
    pg.emulate_media(media='print'); check('print media: box hidden', not box(pg).is_visible()); pg.emulate_media(media='screen')
    html = pg.evaluate("""() => new Promise(res => { const o = window.print; window.print = ()=>{}; const mo = new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.tagName === 'IFRAME') setTimeout(()=>{ try{ res(n.contentDocument.documentElement.outerHTML) }catch(e){ res('ERR') } }, 400) }); mo.observe(document.body, {childList:true, subtree:true}); printAllSections(); setTimeout(()=>res('TIMEOUT'), 5000); })""")
    check('print document never contains the box', html not in ('ERR', 'TIMEOUT') and 'wmForm' not in html and 'Welcome to Prepline' not in html, html[:80])
    pg.locator('#wmName').fill('Sam Lee'); pg.locator('.wm-pos label', has_text='Sous Chef').click(); pg.locator('#wmStart').click()
    pg.wait_for_timeout(4500)
    check('survey prompt appears after the box is done', pg.locator('#surveyToast').count() == 1)
    # share view: build a real share link, open it in a fresh device
    link = pg.evaluate("(async()=>{const l = await shareLinksFor(ROWS[0].section); const x = Array.isArray(l) ? l[0] : l; return typeof x === 'string' ? x : (x.whole || (x.parts && x.parts[0]) || x.url || '');})()")
    ctx.close()
    ctx = ch.new_context(**p.devices['Pixel 5']); m = Mock(ctx); pg = ctx.new_page()
    share = URL.split('#')[0] + '#s=' + link.split('#s=', 1)[1] if '#s=' in link else None
    if share:
        pg.goto(share); pg.wait_for_timeout(2500)
        check('shared phone view (#s= link): no box', box(pg).count() == 0 and pg.evaluate("document.body.classList.contains('shared-mode')"))
    else: check('shared phone view: got a real share link', False, link[:100])
    ctx.close()

    # ---------- never on file://, other paths ----------
    if FILE:
        ctx = ch.new_context(); m = Mock(ctx); pg = ctx.new_page(); pg.goto('file://' + FILE); pg.wait_for_timeout(2000)
        check('file:// copy: no box, no request', box(pg).count() == 0 and not m.calls); ctx.close()
    if OTHER_URL:
        ctx = ch.new_context(); m = Mock(ctx); pg = ctx.new_page(); pg.goto(OTHER_URL); pg.wait_for_timeout(2000)
        check('other site path (e.g. team): no box', box(pg).count() == 0); ctx.close()

    # ---------- ALLOW_SKIP build ----------
    if SKIP_URL:
        ctx = ch.new_context(**p.devices['Pixel 5']); m = Mock(ctx); pg = ctx.new_page(); pg.goto(SKIP_URL); pg.wait_for_selector('#welcomeModal')
        check('ALLOW_SKIP on: "Skip for now" shown', pg.locator('#wmSkip').is_visible() and pg.locator('#wmSkip').inner_text() == 'Skip for now')
        if SHOTS: pg.screenshot(path=f'{SHOTS}/allow-skip.png')
        pg.locator('#wmSkip').click(); pg.wait_for_timeout(200)
        check('skip: box closes, nothing saved or sent', box(pg).count() == 0 and ls(pg, DK) is None and ls(pg, QK) is None and not m.calls)
        pg.reload(); pg.wait_for_timeout(1500)
        check('skip: not asked again in the same session', box(pg).count() == 0)
        pg2 = ctx.new_page(); pg2.goto(SKIP_URL); pg2.wait_for_timeout(1500)
        check('skip: asked again next visit (new tab)', box(pg2).count() == 1)
        pg2.keyboard.press('Escape'); pg2.wait_for_timeout(150)
        check('ALLOW_SKIP on: Escape skips', box(pg2).count() == 0)
        ctx.close()

    # ---------- privacy texts ----------
    ctx = ch.new_context(); Mock(ctx); pg = ctx.new_page()
    pg.goto(URL.split('#')[0].rstrip('/') + '/privacy.html'); t = pg.inner_text('body')
    check('privacy.html: name and role section', "When you first open Prepline we ask your name and role. These, with the date and time, are saved to a private Google Sheet run by Autoprod so the maker can see who's trying it. Not used for marketing, not shared or sold. To have yours removed, email autoprod.help@gmail.com." in t)
    check('privacy.html: recipes stay on device still first', t.find('Your recipes and lists stay on your device') < t.find('Your name and role'))
    check('privacy.html: no "No accounts, no tracking" / device type', 'No accounts, no tracking' not in t and 'device type' not in t.lower())
    check('privacy.html: last updated 08/10/2026', 'Last updated 08/10/2026' in t)
    check('privacy.html: approximate location from time zone + language, no IP, no precise location', 'We also record your approximate country or region' in t and 'time zone and language settings' in t and "We don't record your IP address and we never ask for or use your precise location." in t)
    if SHOTS:
        el = pg.locator('h2', has_text='Your name and role'); el.scroll_into_view_if_needed()
        pg.set_viewport_size({'width': 760, 'height': 820}); pg.screenshot(path=f'{SHOTS}/privacy-section.png', full_page=True)
    pg.goto(URL); pg.evaluate("localStorage.setItem('prepline.signup.v1','{}')"); pg.reload(); pg.wait_for_timeout(500)
    li = pg.evaluate('privacyListHtml()')
    check('in-app privacy: name and role item, no "No accounts, no tracking"', 'we ask your name and role' in li and 'No accounts, no tracking' not in li and '08/10/2026' in li and 'approximate country or region' in li and 'no IP address and no precise location' in li)
    ctx.close()
    # ---------- client/server validation parity ----------
    ctx = ch.new_context(); Mock(ctx); pg = ctx.new_page(); pg.goto(URL)
    cases = ['Sam', 'Zoë', "O'Neil", 'Liam O’Brien', 'A', 'Sam 2', '-Sam', "-- .'", 'B' * 40, 'B' * 41, '=x', '@x', 'Sam\tLee']
    client = pg.evaluate("cs => cs.map(c => { const s = signupClean(c); return signupTextError(s, 2, 40, 'name') === '' })", cases)
    import subprocess
    server = json.loads(subprocess.run(['node', '-e', "const m=require('/workspace/prepline-signups/gas/Code.gs');const cs=JSON.parse(process.argv[1]);console.log(JSON.stringify(cs.map(c=>m.validText_(m.cleanText_(c),2,40))))", json.dumps(cases)], capture_output=True, text=True).stdout or '[]') if os.path.exists('/workspace/prepline-signups/gas/Code.gs') else client
    check('client and server name rules agree', client == server, list(zip(cases, client, server)))
    ctx.close()
    ch.close(); wk.close(); ff.close()
print(f'{ok_n}/{ok_n + len(bad)} passed')
sys.exit(1 if bad else 0)
