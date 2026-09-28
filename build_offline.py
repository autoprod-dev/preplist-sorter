#!/usr/bin/env python3
"""Build the offline, single-file Windows package of Preplist Sorter.

    python3 build_offline.py            # uses ./vendor, downloads anything missing
    python3 build_offline.py --src index.html

Outputs:
    dist/Preplist-Sorter-offline.html   one self-contained HTML file (no network needed)
    dist/Preplist-Sorter-Windows.zip    "Preplist Sorter.html" + "READ ME FIRST.txt"

How the CDN dependencies are replaced:
  * SheetJS xlsx 0.18.5   -> inlined in a classic <script> (same global XLSX as before).
  * pdf.js 5.6.205        -> module + worker source are stored in inert
                             <script type="text/x-inline-module"> blocks, turned into
                             Blob URLs at runtime; the library is loaded with import(blobURL)
                             the worker is converted to a classic script, started as
                             new Worker(blobURL) and passed in via GlobalWorkerOptions.workerPort
                             (Chromium blocks ES-module imports from file:// and module Workers
                             from Blob URLs there; classic Blob Workers are fine).
  * Google Fonts          -> latin-subset woff2 files embedded as base64 @font-face data URIs
                             (also injected into the print-window documents).
Every vendored file is pinned by SHA-256; the build fails if anything doesn't match.
"""
import argparse, base64, hashlib, os, re, sys, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(HERE, "vendor")
DIST = os.path.join(HERE, "dist")

CDN = "https://cdnjs.cloudflare.com/ajax/libs"
LIBS = {
    "xlsx.full.min.js":   (f"{CDN}/xlsx/0.18.5/xlsx.full.min.js",
                           "c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99"),
    "pdf.min.mjs":        (f"{CDN}/pdf.js/5.6.205/pdf.min.mjs",
                           "2221020ea508479dcc1221f36f2731656339230097c69ba1f78802832c0ad685"),
    "pdf.worker.min.mjs": (f"{CDN}/pdf.js/5.6.205/pdf.worker.min.mjs",
                           "51a2fd1ea47f1a9b0814e65e0c336c739c54957795ee774e8f93cb81e8028dd1"),
}
GS = "https://fonts.gstatic.com/s"
# file -> (url, sha256, family, css font-weight)   (Fraunces and Inter are variable fonts)
FONTS = {
    "fonts/fraunces-var-latin.woff2":    (f"{GS}/fraunces/v38/6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0KxC9TeA.woff2",
        "7234ed860a9cc83045413c4faee63c960a8f2d1917adcf728119307d56e0d783", "Fraunces", "500 700"),
    "fonts/inter-var-latin.woff2":       (f"{GS}/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2",
        "3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62", "Inter", "400 700"),
    "fonts/ibmplexmono-400-latin.woff2": (f"{GS}/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n1i8q1w.woff2",
        "08949f728dc52d528e69b1667d15c89a5686a4ee9a296ff90983985f99c380f7", "IBM Plex Mono", "400"),
    "fonts/ibmplexmono-500-latin.woff2": (f"{GS}/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3twJwlBFgg.woff2",
        "01d285447409c8a588692162439a038b8cbd7871309ee20267b0d2d91c6e8e22", "IBM Plex Mono", "500"),
    "fonts/ibmplexmono-600-latin.woff2": (f"{GS}/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3vAOwlBFgg.woff2",
        "0d1f0b8d0722224e32e9f28261bdc86c79115be73444ae5eceb73976a1bcdf83", "IBM Plex Mono", "600"),
}
LATIN_RANGE = ("U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, "
               "U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD")
MAX_FONT_BYTES = 6 * 1024 * 1024  # above this, fall back to system fonts

README = """Preplist Sorter - works offline, no install needed

1. Unzip: right-click "Preplist-Sorter-Windows.zip" and choose "Extract All...", then click Extract.
2. Open the extracted folder and double-click "Preplist Sorter.html" (it opens in Edge or Chrome).
3. Optional: right-click "Preplist Sorter.html" > Send to > Desktop (create shortcut) for a desktop icon.

No internet connection, Python, installer or admin rights are required.
"""

def fetch(rel, url, sha):
    path = os.path.join(VENDOR, rel)
    if not os.path.exists(path):
        print("downloading", url)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as r, open(path, "wb") as f:
            f.write(r.read())
    data = open(path, "rb").read()
    got = hashlib.sha256(data).hexdigest()
    if got != sha:
        sys.exit(f"SHA-256 mismatch for {rel}: {got} (expected {sha})")
    return data

def safe_js(name, text):
    # Inlined into raw-text <script> blocks: a "</script" or "<!-- ... <script" would end/confuse it.
    if re.search(r"</script", text, re.I):
        sys.exit(f"{name} contains '</script' - cannot inline safely")
    if "<!--" in text and re.search(r"<script", text, re.I):
        sys.exit(f"{name} contains '<!--' and '<script' - cannot inline safely")
    return text

def replace_once(html, old, new, what):
    n = html.count(old)
    if n != 1:
        sys.exit(f"expected exactly one {what} in source, found {n}")
    return html.replace(old, new)

def build(src):
    html = open(src, encoding="utf-8").read()
    xlsx = safe_js("xlsx", fetch("xlsx.full.min.js", *LIBS["xlsx.full.min.js"]).decode("utf-8"))
    pdfm = safe_js("pdf.js", fetch("pdf.min.mjs", *LIBS["pdf.min.mjs"]).decode("utf-8"))
    pdfw = safe_js("pdf.worker", fetch("pdf.worker.min.mjs", *LIBS["pdf.worker.min.mjs"]).decode("utf-8"))
    # Classic-script version of the ES-module worker (see loader comment below).
    tail = "export{WorkerMessageHandler};"
    if not pdfw.rstrip().endswith(tail) or "export{" in pdfw.rstrip()[:-len(tail)]:
        sys.exit("pdf.worker.min.mjs: unexpected export layout - review the classic-worker conversion")
    pdfw = pdfw.rstrip()[:-len(tail)].replace("import.meta.url", "self.location.href")
    if re.search(r"\bimport\.meta\b|^\s*import[\s{*]", pdfw, re.M):
        sys.exit("pdf.worker.min.mjs: module-only syntax remains after conversion")

    fonts = {rel: fetch(rel, url, sha) for rel, (url, sha, _f, _w) in FONTS.items()}
    font_bytes = sum(len(b) for b in fonts.values())
    if font_bytes * 4 // 3 <= MAX_FONT_BYTES:
        rules = []
        for rel, (_u, _s, fam, weight) in FONTS.items():
            b64 = base64.b64encode(fonts[rel]).decode("ascii")
            rules.append(f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{weight};"
                         f"font-display:swap;src:url(data:font/woff2;base64,{b64}) format('woff2');"
                         f"unicode-range:{LATIN_RANGE};}}")
        font_css = "\n".join(rules)
        font_mode = f"embedded ({font_bytes:,} bytes woff2)"
    else:
        font_css = "/* fonts too large to embed - using system fonts */"
        font_mode = "system-font fallback"
    font_style = f'<style id="offline-fonts">\n{font_css}\n</style>'

    # 1) Google Fonts <link>s in <head> -> nothing (embedded @font-face goes before </head>,
    #    AFTER the app's first <style>, because print code copies document.querySelector('style')).
    font_links = re.compile(r'[ \t]*<link rel="preconnect" href="https://fonts\.googleapis\.com">\n'
                            r'[ \t]*<link href="https://fonts\.googleapis\.com/css2\?[^"]*" rel="stylesheet">\n')
    links = font_links.findall(html)
    if len(links) != 3:
        sys.exit(f"expected 3 Google Fonts link blocks (head + 2 print templates), found {len(links)}")
    head_links = links[0]
    html = replace_once(html, head_links, "", "head font links")
    # print-window templates (JS template literals): inject the embedded font <style> instead
    html = font_links.sub("    ${(document.getElementById('offline-fonts')||{}).outerHTML||''}\n", html)

    # the document's own </head> is the only one at the start of a line (the print templates
    # have indented ones); do this before inlining libraries so their text can't interfere.
    html = replace_once(html, "\n</head>\n", "\n" + font_style + "\n</head>\n", "top-level </head>")

    # 2) SheetJS
    html = replace_once(html,
        '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>',
        f"<!-- SheetJS xlsx 0.18.5 (inlined for offline use) -->\n<script>\n{xlsx}\n</script>",
        "xlsx script tag")

    # 3) pdf.js module + worker
    m = re.search(r'<script type="module">\s*\n.*?pdf\.min\.mjs.*?</script>', html, re.S)
    if not m:
        sys.exit("pdf.js module loader block not found")
    loader = f"""<!-- pdf.js 5.6.205 (inlined for offline use; loaded via Blob URLs because
     Chromium blocks ES-module imports from file://) -->
<script type="text/x-inline-module" id="pdfjs-lib-src">
{pdfm}
</script>
<script type="text/x-inline-module" id="pdfjs-worker-src">
{pdfw}
</script>
<script type="module">
  // Pinned to pdf.js 5.6.205 - do not swap for a different build,
  // older builds parse PDF layout differently and will break extraction.
  const blobUrl = id => URL.createObjectURL(new Blob(
    [document.getElementById(id).textContent], {{type: 'text/javascript'}}));
  const pdfjsLib = await import(blobUrl('pdfjs-lib-src'));
  const workerUrl = blobUrl('pdfjs-worker-src');
  // Chromium refuses *module* Workers from Blob URLs on a file:// page (and pdf.js's own
  // wrapper for a "null" origin fails too, dropping to its slow main-thread "fake worker").
  // So the build ships the worker as a classic script (export stripped, import.meta.url ->
  // self.location.href), we start it ourselves and hand pdf.js the port. We wait for the
  // worker's "ready" handshake; if it can't start, load the same code on the main thread
  // (pdf.js then uses its built-in fake worker - slower, but still works).
  const workerOk = await new Promise(resolve => {{
    let w;
    try {{ w = new Worker(workerUrl); }} catch (e) {{ resolve(false); return; }}
    const timer = setTimeout(() => {{ w.terminate(); resolve(false); }}, 8000);
    w.addEventListener('message', function onReady(ev) {{
      if (ev.data && ev.data.action === 'ready') {{
        clearTimeout(timer); w.removeEventListener('message', onReady);
        pdfjsLib.GlobalWorkerOptions.workerPort = w; resolve(true);
      }}
    }});
    w.addEventListener('error', ev => {{ ev.preventDefault(); clearTimeout(timer); w.terminate(); resolve(false); }});
  }});
  if (!workerOk) {{
    console.info('pdf.js: Web Worker unavailable, parsing PDFs on the main thread');
    await new Promise(resolve => {{
      const sc = document.createElement('script');
      sc.src = workerUrl; sc.onload = sc.onerror = resolve;
      document.head.appendChild(sc);
    }});
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  }}
  window.pdfjsWorkerMode = workerOk ? 'worker' : 'main-thread';
  window.pdfjsLib = pdfjsLib;
</script>"""
    html = html[:m.start()] + loader + html[m.end():]

    leftovers = re.findall(r'(?:src|href)="https?://[^"]+"|https://(?:cdnjs|fonts\.g)[^\s"\')]+', html)
    if leftovers:
        sys.exit(f"external references remain: {leftovers[:5]}")

    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, "Preplist-Sorter-offline.html")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    zpath = os.path.join(DIST, "Preplist-Sorter-Windows.zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        stamp = (2026, 1, 1, 0, 0, 0)  # fixed timestamp -> reproducible zip
        for name, data in (("Preplist Sorter.html", html.encode("utf-8")),
                           ("READ ME FIRST.txt", README.replace("\n", "\r\n").encode("utf-8"))):
            zi = zipfile.ZipInfo(name, stamp); zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o644 << 16
            z.writestr(zi, data)
    print(f"fonts: {font_mode}")
    print(f"wrote {out} ({os.path.getsize(out):,} bytes)")
    print(f"wrote {zpath} ({os.path.getsize(zpath):,} bytes)")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.join(HERE, "index.html"))
    build(ap.parse_args().src)
