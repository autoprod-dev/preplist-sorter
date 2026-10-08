#!/usr/bin/env python3
# Prepline 3.4.1 (test 3.4.3, Pro 3.5.0): welcome box sends an APPROXIMATE location worked out on the device from the
# browser's time zone + language. No new field, no IP lookup, no navigator.geolocation.
# Usage: python3 test_v341_geo.py URL   (the Apps Script endpoint is always mocked here; nothing reaches the Sheet)
import sys, json, re, time
from playwright.sync_api import sync_playwright
URL = sys.argv[1]
ok_n = 0; bad = []
def check(name, cond, extra=''):
    global ok_n
    if cond: ok_n += 1; print('PASS', name)
    else: bad.append(name); print('FAIL', name, ' |', extra)
EP = re.compile(r'https://script\.google(usercontent)?\.com/.*')
GEO_SPY = """(() => { window.__geoCalls = 0; try { const g = navigator.geolocation; if (g) { for (const k of ['getCurrentPosition','watchPosition']) { const o = g[k]; g[k] = function(){ window.__geoCalls++; return o && o.apply(g, arguments); }; } } } catch(e){} })()"""
WK_STUB = """(() => { window.__stubBodies = []; const of = window.fetch;
  window.fetch = function (u, o) { if (/script\\.google(usercontent)?\\.com/.test(String(u))) { window.__stubBodies.push(o && o.body);
    return Promise.resolve(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })); } return of.apply(this, arguments); }; })()"""
def run(eng, tz, loc_, expect_tz, expect_lang, expect_loc, label, devices=None):
    kw = dict(timezone_id=tz, locale=loc_) if tz else dict(locale=loc_)
    ctx = eng.new_context(**kw); calls = []; others = []
    def h(route):
        calls.append(route.request.post_data)
        route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body='{"ok":true}')
    ctx.route(EP, h)
    ctx.add_init_script(GEO_SPY)
    if eng.browser_type.name == 'webkit':
        # Playwright's WebKit does NOT route keepalive fetches: they go to the real endpoint. Stub fetch for it in the page.
        ctx.add_init_script(WK_STUB)
    pg = ctx.new_page(); errs = []; cons = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and cons.append(m.text))
    pg.on('request', lambda r: others.append(r.url))
    pg.goto(URL); pg.wait_for_selector('#welcomeModal', timeout=10000)
    check(f'{label}: no new form field (still name, 6 positions, hidden Other, honeypot)', pg.locator('#welcomeModal input').count() == 1 + 6 + 1 + 1, pg.locator('#welcomeModal input').count())
    pg.fill('#wmName', 'TEST Geo'); pg.locator('#welcomeModal .wm-pos label').filter(has_text=re.compile(r'^\s*Cook\s*$')).click(); pg.wait_for_timeout(1700); pg.click('#wmStart'); pg.wait_for_timeout(1500)
    if eng.browser_type.name == 'webkit':
        calls[:] = pg.evaluate('window.__stubBodies || []')
        check(f'{label}: sent once (WebKit, in-page fetch stub)', len(calls) == 1, len(calls))
    else:
        check(f'{label}: sent once', len(calls) == 1, len(calls))
    b = json.loads(calls[0]) if calls else {}
    check(f'{label}: tz {expect_tz}', b.get('tz') == expect_tz, b)
    check(f'{label}: lang {expect_lang}', b.get('lang') == expect_lang, b)
    check(f'{label}: loc {expect_loc}', b.get('loc') == expect_loc, b)
    check(f'{label}: navigator.geolocation never called', pg.evaluate('window.__geoCalls') == 0)
    check(f'{label}: no IP-lookup / extra network calls', not [u for u in others if re.search(r'ipapi|ipinfo|ip-api|geoip|ipify|geolocation|ipgeo|freegeoip|ipdata', u, re.I)], [u for u in others if 'ip' in u][:3])
    check(f'{label}: no page errors / console errors', not errs and not [c for c in cons if 'favicon' not in c], (errs + cons)[:3])
    ctx.close()
    return b
with sync_playwright() as p:
    ch = p.chromium.launch(); wk = p.webkit.launch(); ff = p.firefox.launch()
    run(ch, 'Australia/Sydney', 'en-AU', 'Australia/Sydney', 'en-AU', 'Australia (Sydney time)', 'chromium Sydney')
    run(ch, 'Asia/Manila', 'en-PH', 'Asia/Manila', 'en-PH', 'Philippines (Manila time)', 'chromium Manila')
    run(ch, 'Pacific/Auckland', 'en-NZ', 'Pacific/Auckland', 'en-NZ', 'New Zealand (Auckland time)', 'chromium Auckland')
    run(ch, 'Europe/London', 'en-GB', 'Europe/London', 'en-GB', 'United Kingdom (London time)', 'chromium London')
    run(ch, 'Asia/Dubai', 'ar-AE', 'Asia/Dubai', 'ar-AE', 'United Arab Emirates (Dubai time)', 'chromium Dubai')
    run(ch, 'Pacific/Fiji', 'en-FJ', 'Pacific/Fiji', 'en-FJ', 'Fiji', 'chromium Fiji')
    run(ch, 'America/New_York', 'en-US', 'America/New_York', 'en-US', 'United States (New York time)', 'chromium New York')
    run(ch, 'UTC', 'en-PH', 'UTC', 'en-PH', 'Philippines (from language)', 'chromium UTC falls back to language')
    run(ch, 'UTC', 'en', 'UTC', 'en', 'Unknown', 'chromium UTC + plain en -> Unknown')
    run(wk, 'Australia/Perth', 'en-AU', 'Australia/Perth', 'en-AU', 'Australia (Perth time)', 'webkit Perth')
    run(ff, 'Asia/Kolkata', 'en-IN', 'Asia/Kolkata', 'en-IN', 'India (Kolkata time)', 'firefox Kolkata')
    # pure function: old names browsers may report
    ctx = ch.new_context(); ctx.route(EP, lambda r: r.abort()); pg = ctx.new_page(); pg.goto(URL)
    m = pg.evaluate("""() => { const I = signupTzIndex(); const f = z => I.zones[I.alias[z] || z] || null;
      return ['Asia/Calcutta','Asia/Saigon','Europe/Kiev','Australia/ACT','Pacific/Truk','America/Buenos_Aires','Pacific/Port_Moresby','Pacific/Apia','Pacific/Tongatapu','Pacific/Noumea','Pacific/Guam','Pacific/Honolulu','Pacific/Efate','Pacific/Guadalcanal','Pacific/Tarawa','Asia/Riyadh','Asia/Jerusalem','Asia/Tehran','Asia/Qatar','Asia/Tokyo','Asia/Seoul','Asia/Shanghai','Asia/Jakarta','Asia/Ho_Chi_Minh','Europe/Berlin','America/Sao_Paulo','America/Toronto','Africa/Lagos'].map(z => [z, f(z)]); }""")
    check('table covers AU/NZ/Asia/Europe/Americas/Pacific/Middle East + old names', all(c for _, c in m), [z for z, c in m if not c])
    ctx.close(); ch.close(); wk.close(); ff.close()
print(f'{ok_n}/{ok_n + len(bad)} passed')
sys.exit(1 if bad else 0)
