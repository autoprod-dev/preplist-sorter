#!/usr/bin/env python3
"""Build the offline package of Prepline from index.html (the live page).

    python3 build_offline.py            # uses ./vendor (pinned by SHA-256), downloads anything missing
    python3 build_offline.py --src index.html

Outputs (same file names/URLs as earlier offline packages):
    dist/Preplist-Sorter-Windows.zip    folder "Prepline/":
                                          index.html            open this
                                          lib/xlsx.full.min.js  SheetJS 0.18.5 (unmodified)
                                          lib/pdf.min.js        pdf.js 5.6.205 (source wrapped in a string, see below)
                                          lib/pdf.worker.min.js pdf.js 5.6.205 worker (same)
                                          README.txt, LICENSES/
    dist/Preplist-Sorter-offline.html   the same app as one self-contained file (libraries inlined)

Offline rules:
  * No network at all: the CDN <script>s point at the local lib/ copies, and the Google Fonts
    <link>s are removed; the CSS falls back to system fonts (font stacks rewritten below).
  * Chromium blocks ES-module imports and Workers from file:// URLs, so the pdf.js module and
    worker sources are shipped as JavaScript strings (lib/pdf*.js set window.__preplineLib.*),
    turned into Blob URLs at runtime and loaded with import(blobURL); the worker is converted
    to a classic script (export stripped, import.meta.url -> self.location.href) and handed to
    pdf.js via GlobalWorkerOptions.workerPort. The library code itself is unchanged.
  * The app keeps whatever LICENSE_CONFIG the live index.html has (live: mode 'off').
"""
import argparse, hashlib, json, os, re, sys, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(HERE, "vendor")
DIST = os.path.join(HERE, "dist")
VERSION_FILE = os.path.join(HERE, "VERSION")

CDN = "https://cdnjs.cloudflare.com/ajax/libs"
LIBS = {
    "xlsx.full.min.js":   (f"{CDN}/xlsx/0.18.5/xlsx.full.min.js",
                           "c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99"),
    "pdf.min.mjs":        (f"{CDN}/pdf.js/5.6.205/pdf.min.mjs",
                           "2221020ea508479dcc1221f36f2731656339230097c69ba1f78802832c0ad685"),
    "pdf.worker.min.mjs": (f"{CDN}/pdf.js/5.6.205/pdf.worker.min.mjs",
                           "51a2fd1ea47f1a9b0814e65e0c336c739c54957795ee774e8f93cb81e8028dd1"),
}
LICENSES = {"licenses/pdfjs-LICENSE.txt": "pdfjs-LICENSE.txt", "licenses/sheetjs-LICENSE.txt": "sheetjs-LICENSE.txt"}

SANS = "system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif"
SERIF = "Georgia,Cambria,Times New Roman,serif"
MONO = "ui-monospace,Cascadia Mono,Consolas,Menlo,monospace"

def readme(ver):
    return f"""Prepline v{ver} - offline version, by Autoprod

How to use
1. Unzip the download (Windows: right-click > Extract All... > Extract).
2. Open the "Prepline" folder and double-click index.html.
   It opens in your web browser (Microsoft Edge or Google Chrome recommended).

It works with no internet connection. Nothing is installed and nothing is sent anywhere:
your files are read inside the browser on this computer. Keep the "lib" folder next to
index.html - the app needs it.

Included third-party software (licence texts in the LICENSES folder):
- pdf.js 5.6.205, Mozilla Foundation, Apache License 2.0 (lib/pdf.min.js, lib/pdf.worker.min.js)
- SheetJS Community Edition (xlsx) 0.18.5, SheetJS LLC, Apache License 2.0 (lib/xlsx.full.min.js)
"""

NOTICES = """Third-party notices for Prepline (offline version)

pdf.js 5.6.205
  Copyright Mozilla Foundation. Licensed under the Apache License, Version 2.0.
  https://github.com/mozilla/pdf.js
  Files: lib/pdf.min.js, lib/pdf.worker.min.js. These contain the unmodified pdf.min.mjs and
  pdf.worker.min.mjs from the official 5.6.205 release, stored as JavaScript strings so they can be
  loaded from a file:// page; in the worker copy the final ES-module export statement is removed and
  import.meta.url is replaced by self.location.href so it can run as a classic Web Worker.
  Full licence: pdfjs-LICENSE.txt

SheetJS Community Edition (xlsx) 0.18.5
  Copyright (C) 2013-present SheetJS LLC. Licensed under the Apache License, Version 2.0.
  https://sheetjs.com
  File: lib/xlsx.full.min.js (unmodified).
  Full licence: sheetjs-LICENSE.txt

No fonts are bundled: the offline version uses the fonts already installed on your computer.
"""

def fetch(rel, url, sha):
    path = os.path.join(VENDOR, rel)
    if not os.path.exists(path):
        print("downloading", url)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as r, open(path, "wb") as f:
            f.write(r.read())
    data = open(path, "rb").read()
    got = hashlib.sha256(data).hexdigest()
    if got != sha:
        sys.exit(f"SHA-256 mismatch for {rel}: {got} (expected {sha})")
    return data

def safe_js(name, text):
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

LOADER = """<script type="module">
  // pdf.js 5.6.205 (pinned - other builds parse PDF layout differently). Loaded from local
  // copies via Blob URLs, because Chromium blocks ES-module imports and Workers on file://.
  const blobUrl = name => URL.createObjectURL(new Blob([%(GET)s], {type: 'text/javascript'}));
  const pdfjsLib = await import(blobUrl('pdfjs'));
  const workerUrl = blobUrl('pdfjsWorker');
  // Classic worker started by us and handed to pdf.js; wait for its "ready" handshake. If a
  // Worker can't start, load the same code on the main thread (pdf.js "fake worker", slower).
  const workerOk = await new Promise(resolve => {
    let w;
    try { w = new Worker(workerUrl); } catch (e) { resolve(false); return; }
    const timer = setTimeout(() => { w.terminate(); resolve(false); }, 8000);
    w.addEventListener('message', function onReady(ev) {
      if (ev.data && ev.data.action === 'ready') {
        clearTimeout(timer); w.removeEventListener('message', onReady);
        pdfjsLib.GlobalWorkerOptions.workerPort = w; resolve(true);
      }
    });
    w.addEventListener('error', ev => { ev.preventDefault(); clearTimeout(timer); w.terminate(); resolve(false); });
  });
  if (!workerOk) {
    console.info('pdf.js: Web Worker unavailable, parsing PDFs on the main thread');
    await new Promise(resolve => {
      const sc = document.createElement('script');
      sc.src = workerUrl; sc.onload = sc.onerror = resolve;
      document.head.appendChild(sc);
    });
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  window.pdfjsWorkerMode = workerOk ? 'worker' : 'main-thread';
  window.pdfjsLib = pdfjsLib;
</script>"""

def offline_html(html):
    """Common edits: no Google Fonts, system font stacks. Returns html with the CDN tags still in."""
    # 3.3.2: the public page's SEO block (canonical, Open Graph, JSON-LD) is for the website only
    html = re.sub(r'\n<!-- SEO:START.*?<!-- SEO:END -->', '', html, flags=re.S)
    font_links = re.compile(r'[ \t]*<link rel="preconnect" href="https://fonts\.googleapis\.com">\n'
                            r'[ \t]*<link href="https://fonts\.googleapis\.com/css2\?[^"]*" rel="stylesheet">\n')
    n = len(font_links.findall(html))
    if n != 3:
        sys.exit(f"expected 3 Google Fonts link blocks (head + 2 print templates), found {n}")
    html = font_links.sub("", html)
    html = re.sub(r"'IBM Plex Mono',\s*monospace", MONO, html)
    html = re.sub(r"'Inter',\s*sans-serif", SANS, html)
    html = re.sub(r"'Fraunces',\s*(?:sans-)?serif", SERIF, html)
    left = re.findall(r".{20}(?:'Fraunces'|'Inter'|IBM Plex).{20}", html)
    if left:
        sys.exit(f"web-font names remain: {left[:3]}")
    return html

def split_pdf_sources():
    xlsx = fetch("xlsx.full.min.js", *LIBS["xlsx.full.min.js"]).decode("utf-8")
    pdfm = fetch("pdf.min.mjs", *LIBS["pdf.min.mjs"]).decode("utf-8")
    pdfw = fetch("pdf.worker.min.mjs", *LIBS["pdf.worker.min.mjs"]).decode("utf-8")
    tail = "export{WorkerMessageHandler};"
    if not pdfw.rstrip().endswith(tail) or "export{" in pdfw.rstrip()[:-len(tail)]:
        sys.exit("pdf.worker.min.mjs: unexpected export layout - review the classic-worker conversion")
    pdfw = pdfw.rstrip()[:-len(tail)].replace("import.meta.url", "self.location.href")
    if re.search(r"\bimport\.meta\b|^\s*import[\s{*]", pdfw, re.M):
        sys.exit("pdf.worker.min.mjs: module-only syntax remains after conversion")
    return xlsx, pdfm, pdfw

def check_no_remote(html, what):
    left = re.findall(r'(?:src|href)="https?://[^"]+"|https://(?:cdnjs|fonts\.g)[^\s"\')]+', html)
    if left:
        sys.exit(f"{what}: external references remain: {left[:5]}")

def build(src):
    ver = open(VERSION_FILE).read().strip()
    html = open(src, encoding="utf-8").read()
    m = re.search(r'<meta name="prepline-version" content="([^"]+)">', html)
    if not m or m.group(1) != ver:
        sys.exit(f"index.html version {m and m.group(1)} != VERSION {ver}")
    html = offline_html(html)
    xlsx, pdfm, pdfw = split_pdf_sources()
    xlsx_tag = '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>'
    mod = re.search(r'<script type="module">\s*\n.*?pdf\.min\.mjs.*?</script>', html, re.S)
    if not mod:
        sys.exit("pdf.js module loader block not found")

    # A) folder package: index.html + lib/
    pkg = html[:mod.start()] + (
        '<!-- pdf.js 5.6.205: local copies (see LICENSES/THIRD-PARTY-NOTICES.txt) -->\n'
        '<script src="lib/pdf.min.js"></script>\n<script src="lib/pdf.worker.min.js"></script>\n'
        + LOADER % {"GET": "window.__preplineLib[name]"}) + html[mod.end():]
    pkg = replace_once(pkg, xlsx_tag, '<script src="lib/xlsx.full.min.js"></script>', "xlsx script tag")
    check_no_remote(pkg, "package index.html")
    def wrap(key, text, desc):
        return ("/*! " + desc + " - Apache License 2.0, see LICENSES/. Unmodified library source stored as a\n"
                " * string so Prepline can load it from a file:// page (browsers block module imports there). */\n"
                "window.__preplineLib = window.__preplineLib || {};\n"
                f"window.__preplineLib.{key} = " + json.dumps(text, ensure_ascii=True) + ";\n")
    files = [
        ("Prepline/index.html", pkg),
        ("Prepline/lib/xlsx.full.min.js", xlsx),
        ("Prepline/lib/pdf.min.js", wrap("pdfjs", pdfm, "pdf.js 5.6.205 (pdf.min.mjs), (c) Mozilla Foundation")),
        ("Prepline/lib/pdf.worker.min.js", wrap("pdfjsWorker", pdfw,
            "pdf.js 5.6.205 worker (pdf.worker.min.mjs as a classic script), (c) Mozilla Foundation")),
        ("Prepline/README.txt", readme(ver).replace("\n", "\r\n")),
        ("Prepline/LICENSES/THIRD-PARTY-NOTICES.txt", NOTICES.replace("\n", "\r\n")),
    ] + [(f"Prepline/LICENSES/{dst}", open(os.path.join(VENDOR, rel), encoding="utf-8").read())
         for rel, dst in LICENSES.items()]

    # B) single self-contained file (same app, libraries inlined)
    one = html[:mod.start()] + (
        '<!-- pdf.js 5.6.205 (Mozilla, Apache-2.0), inlined for offline use -->\n'
        f'<script type="text/x-inline-module" id="pdfjs-src">\n{safe_js("pdf.js", pdfm)}\n</script>\n'
        f'<script type="text/x-inline-module" id="pdfjsWorker-src">\n{safe_js("pdf.worker", pdfw)}\n</script>\n'
        + LOADER % {"GET": "document.getElementById(name + '-src').textContent"}) + html[mod.end():]
    one = replace_once(one, xlsx_tag,
        f"<!-- SheetJS xlsx 0.18.5 (Apache-2.0), inlined for offline use -->\n<script>\n{safe_js('xlsx', xlsx)}\n</script>",
        "xlsx script tag")
    check_no_remote(one, "single-file html")

    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, "Preplist-Sorter-offline.html")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(one)
    zpath = os.path.join(DIST, "Preplist-Sorter-Windows.zip")
    stamp = (2026, 1, 1, 0, 0, 0)  # fixed timestamp -> reproducible zip
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for d in ("Prepline/", "Prepline/lib/", "Prepline/LICENSES/"):
            zi = zipfile.ZipInfo(d, stamp); zi.external_attr = (0o40755 << 16) | 0x10; z.writestr(zi, b"")
        for name, text in files:
            zi = zipfile.ZipInfo(name, stamp); zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o644 << 16
            z.writestr(zi, text.encode("utf-8"))
    print(f"Prepline v{ver}: wrote {out} ({os.path.getsize(out):,} bytes)")
    print(f"Prepline v{ver}: wrote {zpath} ({os.path.getsize(zpath):,} bytes)")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.join(HERE, "index.html"))
    build(ap.parse_args().src)
