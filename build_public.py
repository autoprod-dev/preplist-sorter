#!/usr/bin/env python3
"""Make the PUBLIC page (live site, offline downloads, team edition) from the v3 source.

    python3 build_public.py [SRC=index.html] [DST=public/index.html]

The v3 source keeps the full Pro / Lemon Squeezy TEST-mode layer so it can still build the Pro test
site. The public page has Pro switched off (LICENSE_CONFIG mode 'off'), and this step also leaves
out everything payment-related: the Lemon Squeezy store, product and variant ids, checkout URLs,
the licence API base, plans/prices, test keys and the licence module code itself. In its place
goes a tiny always-free stub with the same names the app calls (AutoprodLicence.isPro() etc.),
so the app behaves exactly as the source does in mode 'off'.
Fails (exit 1) if anything payment-related is left in the output.
"""
import re, sys, os
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'index.html')
DST = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public', 'index.html')
h = open(SRC, encoding='utf-8').read()

def one(pattern, repl, label, flags=re.S):
    global h
    h, n = re.subn(pattern, lambda m: repl, h, count=1, flags=flags)
    if n != 1: sys.exit(f'build_public: {label} not found')

fl = re.search(r"freeLimits: \{[^}]*\}", h)
if not fl: sys.exit('build_public: freeLimits not found')
STUB = """<script>
/* Prepline public build: Pro is switched off and everything is free. No licence, payment or account code is included. */
var LICENSE_CONFIG = {
  mode: 'off',                                   // public build: everything free, no licence UI, no network
  edition: 'web',
  %s,
  storeName: 'Autoprod',
  appName: 'Prepline',
  productName: 'Prepline',
  offlineDownloadUrl: '',
  plans: [],
  upgrade: { features: [] }
};
</script>
<!-- AUTOPROD-LICENCE:BEGIN -->
<script>
/* Always-free stub: same names the app calls, nothing behind them. */
(function () {
  'use strict';
  var C = window.LICENSE_CONFIG || {}, noop = function () {}, toastEl, toastT;
  var api = {
    config: C,
    activate: function () { return Promise.resolve({ ok: false, error: 'Not available.' }); },
    revalidate: function () { return Promise.resolve('free'); },
    deactivate: function () { return Promise.resolve({ ok: true }); },
    isPro: function () { return false; }, status: function () { return 'free'; }, plan: function () { return null; },
    state: function () { return null; }, isTestMode: function () { return false; }, onChange: noop,
    openLicenceDialog: noop, openUpgrade: noop, buy: noop, init: function () { api._inited = true; },
    toast: function (msg) {
      if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'pl-toast no-print'; toastEl.setAttribute('role', 'status'); toastEl.id = 'plToast';
        toastEl.style.cssText = 'position:fixed;left:50%%;bottom:18px;transform:translateX(-50%%);background:#222;color:#fff;padding:11px 16px;border-radius:12px;font:600 14px/1.35 system-ui,sans-serif;z-index:10000;max-width:calc(100%% - 30px)';
        document.body.appendChild(toastEl); }
      toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { toastEl.hidden = true; }, 4200);
    }
  };
  window.AutoprodLicence = api;
})();
</script>
<!-- AUTOPROD-LICENCE:END -->""" % fl.group(0)
one(r"<script>\n/\* =+ LICENSE_CONFIG.*?<!-- AUTOPROD-LICENCE:END -->", STUB, 'licence config + module')
# the (hidden in mode 'off') Upgrade panel's static payment line
one(r'<span class="small" style="font-size:12px;color:var\(--ink-soft\);">Prices in AUD\. Secure checkout by Lemon Squeezy[^<]*</span>', '', 'Upgrade panel payment line')

BAD = re.compile(r"lemon ?squeezy|lemonsqueezy|checkout|api\.lemon|/v1/licenses|485739|1395962|1395968|2179964|2179971|2179974|LAUNCH50|TEST-PRO|testKeys|26141028|bbdeab5d|d69e7ed5|4242 4242", re.I)
left = sorted(set(m.group(0).lower() for m in BAD.finditer(h)))
if left:
    for m in list(BAD.finditer(h))[:10]: print('  left:', h[max(0, m.start()-60):m.end()+40].replace('\n', ' '))
    sys.exit('build_public: payment strings left in the public page: ' + ', '.join(left))
if not re.search(r"var LICENSE_CONFIG = \{\n  mode: 'off',", h): sys.exit('build_public: not mode off')
os.makedirs(os.path.dirname(os.path.abspath(DST)), exist_ok=True)
open(DST, 'w', encoding='utf-8', newline='\n').write(h)
print(f'build_public: wrote {DST} ({len(h):,} chars), Pro off, no payment config')
