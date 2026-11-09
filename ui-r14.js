/* Prepline 4.8.35-r14 — modern workspace theme, sticky action bar, loading logo.
 * Screen-only: every rule here sits inside @media screen so printouts are unchanged.
 * Never renames/removes IDs other scripts use; Show/Hide + step numbers stay owned
 * by upgrades-4840.js (this file only reads window.__preplineStepList and clicks
 * the existing toggle buttons).
 */
(function (root) {
  'use strict';
  if (root.PreplineUiR14) return;
  var doc = root.document;
  var CSS_ID = 'plR14Css';

  /* ---------------- theme ---------------- */
  var CSS = [
    '@media screen{',
    ':root{--r14-bg1:#F4F1EA;--r14-bg2:#E9E4D8;--r14-card:#FFFFFF;--r14-ink:#1C1E1B;--r14-soft:#5C5F58;--r14-line:#E2DCCD;',
    '--r14-accent:#8A6A3D;--r14-accent-d:#6B4F28;--r14-accent-l:#F4EAD8;--r14-ring:rgba(138,106,61,.28);--r14-r:14px;',
    '--r14-sh1:0 1px 2px rgba(28,30,27,.06),0 1px 1px rgba(28,30,27,.04);--r14-sh2:0 8px 24px rgba(28,30,27,.08),0 2px 6px rgba(28,30,27,.05)}',
    'html,body{background:var(--r14-bg1)}',
    'body{background:radial-gradient(900px 420px at 0% 0%,rgba(138,106,61,.10),transparent 60%),radial-gradient(900px 520px at 100% 0%,rgba(47,111,107,.08),transparent 60%),linear-gradient(180deg,var(--r14-bg1) 0%,var(--r14-bg2) 100%) fixed!important}',
    '#preplistTab{background:transparent!important}',
    /* sticky top bar */
    '.shell-masthead{position:sticky;top:0;z-index:1200;padding:10px 22px!important;background:rgba(28,30,27,.94)!important;-webkit-backdrop-filter:saturate(1.4) blur(10px);backdrop-filter:saturate(1.4) blur(10px);box-shadow:0 6px 22px rgba(0,0,0,.18);row-gap:8px!important}',
    '.shell-masthead .shell-brand{display:flex;align-items:center;gap:10px}',
    '.shell-masthead .shell-brand .r14-mark{width:28px;height:28px;flex:0 0 28px;border-radius:7px;box-shadow:0 0 0 1px rgba(255,255,255,.12)}',
    '.shell-tabs{flex-wrap:wrap}',
    '.shell-tab-btn{border-radius:10px!important;padding:8px 14px!important;font-size:12.5px!important;transition:background .15s,border-color .15s,transform .1s!important}',
    '.shell-tab-btn:focus-visible{outline:2px solid #E7C98F;outline-offset:2px}',
    '.shell-tab-btn:active{transform:translateY(1px)!important}',
    '#plActionBar{flex:1 1 100%;display:none;align-items:center;gap:8px;flex-wrap:wrap;padding-top:8px;border-top:1px solid rgba(255,255,255,.10)}',
    'body.r14-preplist #plActionBar{display:flex}',
    '#plActionBar .r14-act{font:700 12.5px/1 Inter,system-ui,sans-serif;padding:9px 13px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.06);color:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:background .15s,border-color .15s,transform .1s;white-space:nowrap}',
    '#plActionBar .r14-act:hover{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.4)}',
    '#plActionBar .r14-act:active{transform:translateY(1px)}',
    '#plActionBar .r14-act:focus-visible{outline:2px solid #E7C98F;outline-offset:2px}',
    '#plActionBar .r14-act.primary{background:#8A6A3D;border-color:#8A6A3D}',
    '#plActionBar .r14-act.primary:hover{background:#9C7A49}',
    '#plActionBar .r14-act[hidden]{display:none!important}',
    '#plActionBar .r14-sep{flex:1 1 auto}',
    '#plActionBar select{font:600 12.5px Inter,system-ui,sans-serif;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:#2A2C28;color:#fff;max-width:260px;cursor:pointer}',
    '#plActionBar .r14-session{font:600 11.5px Inter,system-ui,sans-serif;color:#CFC6B4;display:inline-flex;align-items:center;gap:6px}',
    '#plActionBar .r14-session::before{content:"";width:8px;height:8px;border-radius:50%;background:#7BC48A;box-shadow:0 0 0 3px rgba(123,196,138,.18)}',
    /* layout + cards */
    '#preplistTab .wrap{max-width:1240px!important;padding:26px 22px 96px!important}',
    '#preplistTab .masthead{background:var(--r14-card);border:1px solid var(--r14-line);border-radius:var(--r14-r);padding:20px 24px!important;box-shadow:var(--r14-sh1);margin-bottom:20px!important}',
    '#preplistTab .masthead::after{left:24px!important;right:24px!important;bottom:-1px!important;height:3px!important}',
    '#preplistTab .masthead h1::before{content:""!important}',
    '#preplistTab .panel{background:var(--r14-card)!important;border:1px solid var(--r14-line)!important;border-radius:var(--r14-r)!important;box-shadow:var(--r14-sh1)!important;transition:box-shadow .18s,border-color .18s,transform .18s!important}',
    '#preplistTab .panel:hover{box-shadow:var(--r14-sh2)!important;border-color:#D9CFB9!important}',
    '#preplistTab .u4821-wrap,#preplistTab .u4827-wrap,#preplistTab #u4835Filters{border-radius:var(--r14-r)!important}',
    '#preplistTab #u4835LoadBar,#preplistTab [data-u4840-id].u4821-wrap,#preplistTab [data-u4840-id].u4827-wrap,#preplistTab #u4835Filters[data-u4840-id]{background:var(--r14-card)!important;border:1px solid var(--r14-line)!important;box-shadow:var(--r14-sh1)!important;padding:12px 16px!important;transition:box-shadow .18s,border-color .18s!important}',
    '#preplistTab [data-u4840-id].u4821-wrap:hover,#preplistTab [data-u4840-id].u4827-wrap:hover,#preplistTab #u4835Filters[data-u4840-id]:hover{box-shadow:var(--r14-sh2)!important;border-color:#D9CFB9!important}',
    '#preplistTab .u480-settings-bar button,#preplistTab #u4835LoadBar button{min-width:68px}',
    '#preplistTab .u480-settings-bar,#preplistTab #u4835LoadBar{border-radius:12px}',
    '#preplistTab [data-u4840-id]{scroll-margin-top:140px}',
    '#preplistTab [data-u4840-id] h2{letter-spacing:-.01em}',
    '#preplistTab [data-u4840-id].r14-flash{box-shadow:0 0 0 3px var(--r14-ring),var(--r14-sh2)!important;transition:box-shadow .3s}',
    '#preplistTab .dropzone{border-radius:14px!important;border:2px dashed #D3C8B0!important;background:linear-gradient(180deg,#FFFDF8,#FBF7EE)!important;padding:34px 24px!important;transition:border-color .15s,background .15s,transform .15s!important}',
    '#preplistTab .dropzone:hover{border-color:var(--r14-accent)!important;background:var(--r14-accent-l)!important}',
    '#preplistTab .dropzone .big::before{content:"\\2B06\\FE0F";display:block;font-size:26px;margin-bottom:6px}',
    /* consistent buttons */
    '#preplistTab button{border-radius:10px!important;transition:background .15s,border-color .15s,box-shadow .15s,transform .1s,filter .15s!important}',
    '#preplistTab button:focus-visible{outline:2px solid var(--r14-accent);outline-offset:2px}',
    '#preplistTab button.secondary{background:#fff!important}',
    '#preplistTab button.secondary:hover{background:var(--r14-accent-l)!important}',
    '#preplistTab input[type=text],#preplistTab input[type=date],#preplistTab input[type=number],#preplistTab select,#preplistTab textarea{border-radius:10px}',
    '#preplistTab input:focus-visible,#preplistTab select:focus-visible,#preplistTab textarea:focus-visible{outline:none;border-color:var(--r14-accent)!important;box-shadow:0 0 0 3px var(--r14-ring)!important}',
    '#preplistTab .sumcard{border-radius:12px!important}',
    '#preplistTab table tbody tr{transition:background .12s}',
    '#preplistTab table tbody tr:hover{background:rgba(138,106,61,.05)}',
    '#preplistTab .status{border-radius:10px}',
    '#preplistTab .status.ok,#preplistTab .status.warn,#preplistTab .status.err{padding:10px 12px;background:#F7F4EC}',
    '#preplistTab .status.ok{background:#EEF6EF}',
    '#preplistTab .status.err{background:#FBEDEA}',
    '@media (max-width:760px){',
    '.shell-masthead{padding:8px 12px!important}',
    '.shell-tabs{flex-wrap:nowrap!important;overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;scrollbar-width:none;padding-bottom:2px}',
    '.shell-tabs::-webkit-scrollbar{display:none}',
    '.shell-tab-btn{flex:0 0 auto;padding:7px 11px!important;font-size:12px!important}',
    '#plActionBar{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding-top:6px}',
    '#plActionBar::-webkit-scrollbar{display:none}',
    '#plActionBar .r14-act{padding:8px 10px;font-size:12px}',
    '#plActionBar .r14-session,#plActionBar .r14-sep{display:none}',
    '#plActionBar select{max-width:140px;flex:0 0 auto}',
    '#preplistTab .wrap{padding:16px 12px 90px!important}',
    '#preplistTab .masthead{padding:16px!important}',
    '#preplistTab .panel{padding:16px!important}',
    '#preplistTab [data-u4840-id]{scroll-margin-top:120px}',
    '}',
    '}',
    /* loader overlay (screen only; never printed) */
    '@media print{#plLoader,#plActionBar{display:none!important}}'
  ].join('\n');

  function ensureCss() {
    if (doc.getElementById(CSS_ID)) return;
    var s = doc.createElement('style');
    s.id = CSS_ID;
    s.textContent = CSS;
    doc.head.appendChild(s);
  }

  /* ---------------- loader ---------------- */
  var LOGO_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true" class="pl-logo"><rect width="64" height="64" rx="14" fill="#1C1E1B"/>' +
    '<rect class="pl-b b1" x="12" y="13" width="9" height="9" rx="1.6" fill="#A57E45"/><path class="pl-t t1" d="M14.2 17.6l2.2 2.2 3.6-4" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<rect class="pl-l l1" x="26" y="16" width="27" height="3.4" rx="1.7" fill="#F6F1E7"/>' +
    '<rect class="pl-b b2" x="12" y="27.5" width="9" height="9" rx="1.6" fill="#A57E45"/><path class="pl-t t2" d="M14.2 32.1l2.2 2.2 3.6-4" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<rect class="pl-l l2" x="26" y="30.5" width="27" height="3.4" rx="1.7" fill="#F6F1E7"/>' +
    '<rect x="12.8" y="42.8" width="7.4" height="7.4" rx="1.2" fill="none" stroke="#A57E45" stroke-width="1.6"/><path class="pl-t t3" d="M14.2 46.6l2.2 2.2 3.6-4" fill="none" stroke="#A57E45" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<rect class="pl-l l3" x="26" y="45" width="27" height="3.4" rx="1.7" fill="#8A6A3D"/></svg>';

  var depth = 0, shownAt = 0, hideTimer = null, failsafe = null;
  var log = root.__plLoaderLog = root.__plLoaderLog || [];

  function el() { return doc.getElementById('plLoader'); }
  function ensureLoaderDom() {
    var L = el();
    if (L) return L;
    L = doc.createElement('div');
    L.id = 'plLoader';
    L.className = 'pl-loader';
    L.setAttribute('role', 'status');
    L.setAttribute('aria-live', 'polite');
    L.innerHTML = '<div class="pl-loader-card">' + LOGO_SVG + '<div class="pl-loader-word">Prepline</div><div class="pl-loader-msg" id="plLoaderMsg">Loading…</div><div class="pl-loader-bar"><i></i></div></div>';
    doc.body.appendChild(L);
    return L;
  }
  /* Anything that asks the user to choose (spreadsheet choice, editors, output
   * choice, original viewer, dialogs) must never sit under the loader. */
  var INTERACTIVE = '#sbChoice.open,#sbPanel.open,#pePanel.open,#pbPanel:not([hidden]),#outputChoice:not([hidden]),' +
    '#origViewerOverlay:not(.hidden),dialog[open],#welcomeModal,.wm-overlay,#asisView:not([hidden])';
  function openInteractive() {
    var out = [];
    try {
      doc.querySelectorAll(INTERACTIVE).forEach(function (e) {
        var st = root.getComputedStyle(e);
        if (st.display !== 'none' && st.visibility !== 'hidden' && (e.offsetWidth || e.offsetHeight)) out.push(e);
      });
    } catch (e) {}
    return out;
  }
  var baseline = [], watch = null;
  function startWatch() {
    baseline = openInteractive();
    clearInterval(watch);
    watch = setInterval(function () {
      if (!isOn()) { clearInterval(watch); watch = null; return; }
      var now = openInteractive();
      for (var i = 0; i < now.length; i++) {
        if (baseline.indexOf(now[i]) < 0) { log.push({ at: Date.now(), msg: 'yield to ' + (now[i].id || now[i].className) }); depth = 0; reallyHide(); clearInterval(watch); watch = null; return; }
      }
    }, 150);
  }
  function show(msg, soft) {
    var L = ensureLoaderDom();
    /* soft: let the in-flight click land on the button underneath */
    if (soft) { L.classList.add('pl-soft'); setTimeout(function () { L.classList.remove('pl-soft'); }, 600); }
    if (!isOn()) startWatch();
    depth++;
    clearTimeout(hideTimer);
    var m = doc.getElementById('plLoaderMsg');
    if (m) m.textContent = msg || 'Working…';
    if (!L.classList.contains('on')) shownAt = Date.now();
    L.classList.add('on');
    L.setAttribute('aria-hidden', 'false');
    doc.documentElement.classList.add('pl-busy');
    log.push({ at: Date.now(), msg: msg || '' });
    clearTimeout(failsafe);
    failsafe = setTimeout(function () { depth = 0; reallyHide(); }, 120000);
  }
  function reallyHide() {
    var L = el();
    if (!L) return;
    L.classList.remove('on');
    L.setAttribute('aria-hidden', 'true');
    doc.documentElement.classList.remove('pl-busy');
  }
  function hide(force) {
    depth = force ? 0 : Math.max(0, depth - 1);
    if (depth > 0) return;
    clearTimeout(hideTimer);
    var wait = Math.max(0, 350 - (Date.now() - shownAt));
    hideTimer = setTimeout(function () { if (depth === 0) reallyHide(); }, wait);
  }
  function isOn() { var L = el(); return !!(L && L.classList.contains('on')); }

  /* Wrap a global function. Async ones keep the loader up until they settle.
   * Sync ones (exports / print windows) flash it briefly afterwards — never
   * deferred, so print/download user-activation is preserved. */
  function wrap(name, msg, mode) {
    var fn = root[name];
    if (typeof fn !== 'function' || fn.__r14) return false;
    var w = function () {
      show(typeof msg === 'function' ? msg.apply(null, arguments) : msg);
      var r;
      try { r = fn.apply(this, arguments); }
      catch (e) { hide(); throw e; }
      if (r && typeof r.then === 'function') {
        return r.then(function (v) { hide(); return v; }, function (e) { hide(); throw e; });
      }
      if (mode === 'status') waitForStatus(); else hide();
      return r;
    };
    w.__r14 = true; w.__orig = fn;
    try { root[name] = w; } catch (e) { return false; }
    return root[name] === w;
  }
  /* handleFile reads with FileReader (no promise) — keep the loader up until the
   * status line changes, the list re-renders, or 60 s pass. */
  function waitForStatus() {
    var st = doc.getElementById('statusMsg');
    var before = st ? st.textContent : '';
    var done = false;
    var t0 = Date.now();
    function finish() { if (done) return; done = true; if (mo) mo.disconnect(); hide(); }
    var mo = null;
    if (st && root.MutationObserver) {
      mo = new MutationObserver(function () { if (st.textContent !== before) setTimeout(finish, 60); });
      mo.observe(st, { childList: true, characterData: true, subtree: true });
    }
    (function poll() {
      if (done) return;
      if (Date.now() - t0 > 60000) return finish();
      setTimeout(poll, 400);
    })();
  }

  var WRAPS = [
    ['handlePdfFiles', function (files) { var n = files && files.length; return 'Reading ' + (n > 1 ? n + ' PDFs' : 'PDF') + ' — production tools & purchase orders…'; }],
    ['handleFile', 'Reading workbook and sorting…', 'status'],
    ['sortWithPrepline', 'Sorting your prep sheet…', 'status'],
    ['printOriginalsAll', 'Preparing Original PTs for print…'],
    ['printOriginalsWithRefFilled', 'Filling Ref # and preparing print…'],
    ['printOriginalViewer', 'Preparing print…'],
    ['printAllOfView', 'Preparing print…'],
    ['openPrintWindow', 'Preparing print…'],
    ['printReadyHtml', 'Preparing print…'],
    ['exportDishesToXlsx', 'Building Excel export…'],
    ['exportSectionsToXlsx', 'Building Excel export…'],
    ['exportDaysToXlsx', 'Building Excel export…'],
    ['exportOrderToXlsx', 'Building order export…'],
    ['exportOrganisedXlsx47', 'Building Excel export…'],
    ['exportOrganisedPdf47', 'Building PDF export…'],
    ['exportPlanPdf47', 'Building PDF export…'],
    ['exportA3CalendarXlsx4820', 'Building Excel export…'],
    ['exportA3CalendarPdf4820', 'Building PDF export…']
  ];
  var wrapped = [];
  function wrapAll() {
    WRAPS.forEach(function (w) { if (wrap(w[0], w[1], w[2])) wrapped.push(w[0]); });
  }

  /* Paste "Sort" button: sync, but show the logo while it runs. */
  function bindPaste() {
    var b = doc.getElementById('parsePasteBtn');
    if (!b || b.__r14) return;
    b.__r14 = true;
    b.addEventListener('click', function () {
      var box = doc.getElementById('pasteBox');
      if (box && box.value.trim()) { show('Sorting pasted rows…'); setTimeout(function () { hide(); }, 0); }
    }, true);
  }

  /* "Sort now" in the spreadsheet prompt / "Sort extract" in the PDF editor run
   * synchronously on click; showing on pointerdown lets the logo paint first. */
  function bindSortButtons() {
    if (doc.__r14SortBound) return;
    doc.__r14SortBound = true;
    doc.addEventListener('pointerdown', function (ev) {
      var t = ev.target && ev.target.closest && ev.target.closest('#sbSortNow,#peSort,#sbSortBtn');
      if (!t || ev.button > 0) return;
      show('Sorting your preplist…', true);
      waitForStatus();
    }, true);
  }

  /* ---------------- sticky action bar ---------------- */
  function hasRows() {
    try { var b = root.__preplineBridge; return !!(b && b.getRows && (b.getRows() || []).length); } catch (e) { return false; }
  }
  function hasOriginals() {
    return !!(doc.getElementById('origViewBtn') || doc.getElementById('printOrigWithRefBtn'));
  }
  function call(name) {
    var f = root[name];
    if (typeof f === 'function') { try { return f(); } catch (e) { console.warn('[Prepline r14]', name, e); } }
  }
  function buildBar() {
    var head = doc.querySelector('.shell-masthead');
    if (!head) return null;
    var brand = head.querySelector('.shell-brand');
    if (brand && !brand.querySelector('.r14-mark')) {
      var mark = doc.createElement('span');
      mark.className = 'r14-mark';
      mark.innerHTML = LOGO_SVG.replace('class="pl-logo"', 'class="pl-logo" width="28" height="28"');
      brand.insertBefore(mark, brand.firstChild);
    }
    var bar = doc.getElementById('plActionBar');
    if (bar) return bar;
    bar = doc.createElement('div');
    bar.id = 'plActionBar';
    bar.className = 'no-print';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Quick actions');
    bar.innerHTML =
      '<button type="button" class="r14-act primary" id="r14Upload" title="Upload preplist, production tools or purchase orders">⬆ Upload files</button>' +
      '<select id="r14Jump" aria-label="Jump to step" title="Jump to a step"><option value="">Jump to step…</option></select>' +
      '<button type="button" class="r14-act" id="r14PrintOrig" hidden title="Print the uploaded Original production tools">🖨 Original PTs</button>' +
      '<button type="button" class="r14-act" id="r14PrintRef" hidden title="Print Original Production tools with REF# filled up">🖨 PTs + Ref #</button>' +
      '<button type="button" class="r14-act" id="r14Export" hidden title="Export the sorted list to Excel (by dish)">⬇ Excel</button>' +
      '<button type="button" class="r14-act" id="r14Top" title="Back to top">↑ Top</button>' +
      '<span class="r14-sep"></span>' +
      '<span class="r14-session" title="Uploaded files are used for this session only and are never saved to this browser">Session only · files not saved</span>';
    head.appendChild(bar);
    doc.getElementById('r14Upload').addEventListener('click', function () {
      if (typeof root.switchShellTab === 'function') { try { root.switchShellTab('preplist'); } catch (e) {} }
      var inp = doc.getElementById('fileInput');
      if (inp) inp.click();
    });
    doc.getElementById('r14PrintOrig').addEventListener('click', function () { call('printOriginalsAll'); });
    doc.getElementById('r14PrintRef').addEventListener('click', function () { call('printOriginalsWithRefFilled'); });
    doc.getElementById('r14Export').addEventListener('click', function () { call('exportDishesToXlsx'); });
    doc.getElementById('r14Top').addEventListener('click', function () { root.scrollTo({ top: 0, behavior: 'smooth' }); });
    doc.getElementById('r14Jump').addEventListener('change', function () {
      var id = this.value; this.value = '';
      if (id) jumpTo(id);
    });
    return bar;
  }
  function jumpTo(id) {
    var w = doc.querySelector('[data-u4840-id="' + id + '"]');
    if (!w) return;
    var list = root.__preplineStepList || [];
    var row = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) row = list[i];
    if (row && !row.open) {
      var btn = doc.querySelector('[data-u4840-toggle="' + id + '"]');
      if (btn && /show/i.test(btn.textContent || '')) btn.click();
    }
    var target = id === 'load' ? (doc.getElementById('u4835LoadBar') || doc.getElementById('dbPanel') || w) : w;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    w.classList.add('r14-flash');
    setTimeout(function () { w.classList.remove('r14-flash'); }, 1200);
  }
  var lastJumpKey = '';
  function refreshBar() {
    var bar = buildBar();
    if (!bar) return;
    var tabOn = !!doc.querySelector('#preplistTab.active');
    doc.body.classList.toggle('r14-preplist', tabOn);
    var rows = hasRows(), orig = hasOriginals();
    doc.getElementById('r14PrintOrig').hidden = !orig;
    doc.getElementById('r14PrintRef').hidden = !orig;
    doc.getElementById('r14Export').hidden = !rows;
    var list = root.__preplineStepList || [];
    var key = list.map(function (r) { return r.n + r.id; }).join('|');
    if (key !== lastJumpKey) {
      lastJumpKey = key;
      var sel = doc.getElementById('r14Jump');
      sel.innerHTML = '<option value="">Jump to step…</option>' + list.map(function (r) {
        return '<option value="' + r.id + '">' + r.n + ' · ' + String(r.label).replace(/[<&]/g, '') + '</option>';
      }).join('');
      sel.hidden = list.length < 2;
    }
  }

  /* ---------------- boot ---------------- */
  function ready() {
    ensureCss();
    wrapAll();
    bindPaste();
    bindSortButtons();
    refreshBar();
    setInterval(refreshBar, 700);
    /* Page-load loader: hide once the app and pdf.js are ready (or after 15 s). */
    var t0 = Date.now();
    (function waitReady() {
      var ok = root.__preplineBridge && (root.pdfjsLib || Date.now() - t0 > 6000);
      if (ok || Date.now() - t0 > 15000) { doc.documentElement.classList.remove('pl-booting'); hide(true); return; }
      setTimeout(waitReady, 120);
    })();
  }
  /* The boot overlay is in the HTML already (on). Count it as one show. */
  if (doc.getElementById('plLoader') && doc.getElementById('plLoader').classList.contains('on')) { depth = 1; shownAt = Date.now(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ready); else ready();

  root.PreplineUiR14 = { show: show, hide: hide, isOn: isOn, wrapped: wrapped, jumpTo: jumpTo, refresh: refreshBar };
})(window);
