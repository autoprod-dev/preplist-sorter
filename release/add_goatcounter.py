#!/usr/bin/env python3
"""Add the GoatCounter visitor counter to an assembled LIVE public set (called by assemble_publish.sh).
    python3 release/add_goatcounter.py <publish-dir>
    python3 release/add_goatcounter.py --print-endpoint
Only the live public site gets it: the source index.html, the test site, the team edition and both offline
Windows zips never contain it. Settings: release/goatcounter.json ("code" is the only value to change).
The snippet is GoatCounter's standard one with the defaults (path, referrer, title, screen width, no cookies)
and allow_local false, so localhost, private-network and file:// copies are never counted. count.js is a
pinned, unmodified copy of https://gc.zgo.at/count.js served from the site itself (vendor/goatcounter/count.js),
so the only request to GoatCounter is the count itself."""
import hashlib, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, 'release', 'goatcounter.json'), encoding='utf-8'))
CODE = CFG['code']
if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,48}[a-z0-9]', CODE): sys.exit(f'add_goatcounter: bad site code {CODE!r}')
ENDPOINT = f'https://{CODE}.goatcounter.com/count'
COUNT_JS_DST = 'vendor/goatcounter/count.js'
SNIPPET = (f'<script data-goatcounter="{ENDPOINT}" data-goatcounter-settings=\'{{"allow_local": false}}\' '
           f'async src="{COUNT_JS_DST}"></script>')
def count_js():
    data = open(os.path.join(ROOT, CFG['count_js']), 'rb').read()
    if hashlib.sha256(data).hexdigest() != CFG['count_js_sha256']: sys.exit('add_goatcounter: count.js does not match the pinned sha256')
    return data
if __name__ == '__main__':
    if sys.argv[1:] == ['--print-endpoint']: print(ENDPOINT); sys.exit(0)
    if len(sys.argv) != 2: sys.exit(__doc__)
    D = sys.argv[1]
    for page in CFG['pages']:
        p = os.path.join(D, page); h = open(p, encoding='utf-8').read()
        if re.search(r'<script[^>]*\bdata-goatcounter\s*=|goatcounter\.com/count|goatcounter/count\.js', h, re.I): sys.exit(f'add_goatcounter: {page} already has a GoatCounter snippet')
        # the page's own closing </body> (index.html also has '</body>' inside print-window template strings)
        m = re.search(r'\n</body>\s*</html>\s*$', h)
        if not m: sys.exit(f'add_goatcounter: {page}: closing </body></html> not found at the end')
        h = h[:m.start()] + '\n' + SNIPPET + h[m.start():]
        open(p, 'w', encoding='utf-8', newline='\n').write(h)
    dst = os.path.join(D, COUNT_JS_DST); os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, 'wb').write(count_js())
    print(f'add_goatcounter: {ENDPOINT} on {", ".join(CFG["pages"])}; {COUNT_JS_DST} (pinned)')
