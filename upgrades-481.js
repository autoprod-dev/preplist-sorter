/* Prepline 4.8.1 — All "original PT" / "View original" references are clickable
 * and open the original (PDF page viewer, or uploaded sheet as-is + dish photo).
 * Print on the original always includes the dish photo when one exists.
 * Trial copy only.
 */
(function (root) {
  'use strict';

  var CSS_ID = 'u481-css';
  var SOURCE = { bytes: null, name: '', sheetNames: [] };

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      'a.u481-orig,button.u481-orig{cursor:pointer;color:var(--ink,#1a1a1a);text-decoration:underline;text-underline-offset:2px;',
      'background:none;border:0;padding:0 2px;font:inherit;font-size:11.5px;font-weight:600;}',
      'a.u481-orig:hover,button.u481-orig:hover{color:var(--veg1,#2f6b3a);}',
      'button.u481-orig.ghost{border:1px solid var(--line,#E3DFD3);border-radius:8px;padding:6px 10px;text-decoration:none;',
      'background:#fff;font-size:12.5px;}',
      '.u481-orig-chip{display:inline-flex;align-items:center;gap:4px;margin-left:6px;vertical-align:middle;}',
      '#u481AsIsOverlay{position:fixed;inset:0;z-index:9600;background:rgba(20,20,20,.55);display:flex;align-items:stretch;justify-content:center;}',
      '#u481AsIsOverlay[hidden]{display:none!important;}',
      '#u481AsIsOverlay .u481-card{background:#e9e9e9;width:min(1100px,96vw);margin:2vh auto;border-radius:12px;display:flex;flex-direction:column;',
      'max-height:96vh;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.35);}',
      '#u481AsIsOverlay .u481-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;',
      'padding:10px 14px;background:#F7F4EA;border-bottom:1px solid #E3DFD3;}',
      '#u481AsIsOverlay .u481-head h3{margin:0;font-size:15px;}',
      '#u481AsIsOverlay .u481-actions{display:flex;gap:8px;flex-wrap:wrap;}',
      '#u481AsIsOverlay .u481-body{overflow:auto;padding:12px;background:#e9e9e9;flex:1;}',
      '#u481AsIsOverlay .u481-hint{font-size:12px;color:#666;margin:0 14px 8px;}'
    ].join('');
    document.head.appendChild(s);
  }

  function clean(d) {
    try {
      if (typeof cleanDishName === 'function') return cleanDishName(d);
    } catch (e) {}
    return String(d == null ? '' : d);
  }

  function enc(d) {
    try {
      if (typeof encName === 'function') return encName(d);
    } catch (e) {}
    return encodeURIComponent(String(d == null ? '' : d));
  }

  function srcSheetOf(dish) {
    var found = '';
    try {
      (typeof ROWS !== 'undefined' ? ROWS : []).some(function (r) {
        if (r && r.dish === dish && r.srcSheet) {
          found = r.srcSheet;
          return true;
        }
        return false;
      });
      if (!found) {
        (typeof ROWS !== 'undefined' ? ROWS : []).some(function (r) {
          if (!r || !r.srcSheet) return false;
          if (r.dish === dish) { found = r.srcSheet; return true; }
          if (clean(r.dish) === clean(dish)) { found = r.srcSheet; return true; }
          return false;
        });
      }
    } catch (e) {}
    return found;
  }

  function imagesFor(dish) {
    var imgs = null;
    var map = null;
    try {
      map = (typeof originalPageImages === 'object' && originalPageImages) ? originalPageImages : null;
    } catch (e) { map = null; }
    if (!map) return null;
    imgs = map[dish];
    if ((!imgs || !imgs.length) && map[clean(dish)]) imgs = map[clean(dish)];
    var sheet = srcSheetOf(dish);
    if ((!imgs || !imgs.length) && sheet && map[sheet]) imgs = map[sheet];
    if ((!imgs || !imgs.length)) {
      var c = clean(dish);
      Object.keys(map).some(function (k) {
        if (clean(k) === c && map[k] && map[k].length) {
          imgs = map[k];
          return true;
        }
        return false;
      });
    }
    return (imgs && imgs.length) ? imgs : null;
  }

  function hasOriginal(dish) {
    if (!dish) return false;
    if (imagesFor(dish)) return true;
    var sheet = srcSheetOf(dish);
    if (sheet && sheet !== 'Pasted list' && sheet !== 'Voice') return true;
    return false;
  }

  function asIsDishModel(dish) {
    var rows = [];
    var pax = '';
    var sheet = srcSheetOf(dish);
    try {
      if (typeof paxByDish !== 'undefined' && paxByDish && paxByDish[dish] != null) pax = paxByDish[dish];
    } catch (e) {}
    try {
      (typeof ROWS !== 'undefined' ? ROWS : []).forEach(function (r) {
        if (!r || r.dish !== dish) return;
        var c = (typeof pbCatForSection === 'function') ? pbCatForSection(r.section) : null;
        rows.push({
          item: r.task,
          qty: r.qty,
          unit: r.unit || '',
          cat: c ? c.k : '',
          section: r.section || '',
          day: r.day || '',
          ref: ''
        });
      });
    } catch (e) {}
    return { name: dish, pax: pax, srcSheet: sheet || '', rows: rows };
  }

  function buildAsIsHtmlForDish(dish) {
    var model = asIsDishModel(dish);
    var dishes = [model];
    if (typeof asIsHtmlWithPhotos === 'function') return asIsHtmlWithPhotos(dishes);
    if (root.asIsHtmlWithPhotos) return root.asIsHtmlWithPhotos(dishes);
    /* Fallback: use patched asIsHtml if 476 wrapped it, else stock */
    try {
      if (typeof asIsHtml === 'function') return asIsHtml(dishes);
    } catch (e) {}
    if (root.asIsHtml) return root.asIsHtml(dishes);
    return '<p>Original layout unavailable.</p>';
  }

  function asIsCss() {
    var base = (typeof ASIS_CSS === 'string' ? ASIS_CSS : '');
    var extra = [
      '.asis-body{display:flex;gap:14px;align-items:flex-start}',
      '.asis-table-wrap{flex:1;min-width:0}',
      '.asis-photo{flex:0 0 240px;max-width:34%;text-align:center}',
      '.asis-photo img{width:100%;max-height:320px;height:auto;object-fit:contain;border:1px solid #bbb;background:#fafafa}',
      '.asis-photo .ph-lbl{font-size:10px;color:#666;margin-top:4px}',
      '@media print{.asis-photo{flex-basis:220px;max-width:30%}.asis-photo img{max-height:280px}}'
    ].join('');
    return base.indexOf('.asis-photo') >= 0 ? base : (base + extra);
  }

  function closeAsIsOriginal() {
    var ov = document.getElementById('u481AsIsOverlay');
    if (ov) ov.hidden = true;
  }

  function openSheetTabIfPossible(dish) {
    var sheet = srcSheetOf(dish) || dish;
    if (!SOURCE.bytes || !SOURCE.bytes.length) {
      if (typeof setStatus === 'function') setStatus('Original spreadsheet bytes are not kept in this session — re-upload to open the sheet tab.', 'err');
      return false;
    }
    try {
      if (root.PreplineSheet && typeof root.PreplineSheet.offerEditBeforeSort === 'function') {
        var file = new File([SOURCE.bytes], SOURCE.name || 'original.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        root.PreplineSheet.offerEditBeforeSort(file, SOURCE.bytes);
        /* Auto-open editor on the matching tab when the choice dialog appears */
        setTimeout(function () {
          try {
            root.__u481WantSheet = sheet;
            root.__u481WantDish = dish;
            var editBtn = document.getElementById('sbEditFirst');
            if (editBtn) editBtn.click();
          } catch (e) {}
        }, 80);
        if (typeof setStatus === 'function') {
          setStatus('Opening original sheet tab "' + sheet + '". Use Print on the as-is original for a photo-ready page.', 'ok');
        }
        return true;
      }
    } catch (e) {
      console.warn('u481 open sheet', e);
    }
    return false;
  }

  function openAsIsOriginal(dish) {
    ensureCss();
    var ov = document.getElementById('u481AsIsOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'u481AsIsOverlay';
      ov.hidden = true;
      ov.innerHTML =
        '<div class="u481-card" role="dialog" aria-modal="true">' +
          '<div class="u481-head">' +
            '<div><h3 id="u481AsIsTitle">Original</h3>' +
            '<div class="meta" id="u481AsIsSub" style="font-size:12px;color:#666;"></div></div>' +
            '<div class="u481-actions">' +
              '<button type="button" class="secondary" id="u481AsIsPrint">🖨 Print original</button>' +
              '<button type="button" class="ghost" id="u481AsIsSheet">▦ Open sheet tab</button>' +
              '<button type="button" class="ghost" id="u481AsIsClose">Close ✕</button>' +
            '</div>' +
          '</div>' +
          '<p class="u481-hint" id="u481AsIsHint">Original uploaded sheet layout. Dish photo included when present.</p>' +
          '<div class="u481-body" id="u481AsIsBody"></div>' +
        '</div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (ev) {
        if (ev.target === ov) closeAsIsOriginal();
      });
      ov.querySelector('#u481AsIsClose').onclick = closeAsIsOriginal;
      ov.querySelector('#u481AsIsPrint').onclick = function () {
        var dishName = ov.dataset.dish || '';
        var htmlBody = buildAsIsHtmlForDish(dishName);
        var css = asIsCss();
        var title = 'Original — ' + clean(dishName);
        var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' +
          String(title).replace(/</g, '&lt;') + '</title><style>' + css + '</style></head><body>' +
          htmlBody + '</body></html>';
        root.__lastAsIsPrint = html;
        root.__lastOriginalPrint = html;
        if (typeof printViaIframe === 'function') printViaIframe(html);
        else window.print();
      };
      ov.querySelector('#u481AsIsSheet').onclick = function () {
        openSheetTabIfPossible(ov.dataset.dish || '');
      };
    }
    var imgs = imagesFor(dish);
    var sheet = srcSheetOf(dish);
    ov.dataset.dish = dish;
    ov.querySelector('#u481AsIsTitle').textContent = 'Original — ' + clean(dish);
    ov.querySelector('#u481AsIsSub').textContent = sheet
      ? ('Source tab: ' + sheet + (imgs && imgs.length ? ' · photo available' : ''))
      : (imgs && imgs.length ? 'Dish photo / page available' : 'Rebuilt from sorted rows');
    var sheetBtn = ov.querySelector('#u481AsIsSheet');
    sheetBtn.style.display = (SOURCE.bytes && sheet) ? '' : 'none';
    var body = ov.querySelector('#u481AsIsBody');
    var css = asIsCss().replace(/@page\{[^}]+\}/g, '');
    body.innerHTML = '<style>' + css + '</style>' + buildAsIsHtmlForDish(dish);
    ov.hidden = false;
  }

  function openOriginalForDish(encDish) {
    var dish = encDish;
    try {
      if (typeof encDish === 'string' && /%/.test(encDish)) dish = decodeURIComponent(encDish);
    } catch (e) { dish = encDish; }
    /* Also accept raw dish names */
    if (!dish) return;

    var imgs = imagesFor(dish);
    var sheet = srcSheetOf(dish);
    var looksLikePdfPage = !!(imgs && imgs.some(function (e) {
      return e && e.source !== 'xlsx' && e.dataUrl;
    }));

    if (looksLikePdfPage || (imgs && imgs.length && !sheet)) {
      /* Use built-in original viewer (PDF pages / page images). */
      try {
        origViewerImages = imgs;
        origViewerIndex = 0;
        origViewerDishClean = clean(dish);
        origViewerDish = dish;
        if (typeof renderOriginalViewer === 'function') renderOriginalViewer();
        var overlay = document.getElementById('origViewerOverlay');
        if (overlay) overlay.classList.remove('hidden');
        ensureViewerPrintLabel();
        return;
      } catch (e) {
        console.warn('u481 viewer', e);
      }
    }

    /* xlsx dish photo-only: still open viewer when photos exist, PLUS as-is with Print+photo.
       Prefer as-is so Print includes the sheet layout and photo together. */
    if (sheet || (imgs && imgs.length)) {
      openAsIsOriginal(dish);
      return;
    }

    if (typeof setStatus === 'function') {
      setStatus('No original page or sheet tab found for "' + clean(dish) + '".', 'err');
    }
  }

  function ensureViewerPrintLabel() {
    var btn = document.querySelector('#origViewerOverlay button.secondary[onclick*="printOriginalViewer"], #origViewerOverlay .orig-viewer-head button.secondary');
    if (btn && !/print/i.test(btn.textContent || '')) btn.textContent = '🖨 Print original';
    else if (btn && !/🖨/.test(btn.textContent || '')) btn.textContent = '🖨 Print original';
  }

  function origLinkHtml(dish, opts) {
    opts = opts || {};
    if (!hasOriginal(dish)) return '';
    var label = opts.label || '📖 View original';
    var cls = opts.button ? 'ghost u481-orig' : 'u481-orig';
    var tag = opts.button ? 'button' : 'button';
    return '<' + tag + ' type="button" class="' + cls + '" data-u481-dish="' + enc(dish) + '" title="Open the original production tool / sheet tab">' +
      label + '</' + tag + '>';
  }

  function origChipHtml(dish) {
    if (!hasOriginal(dish)) return '';
    return '<span class="u481-orig-chip no-print">' + origLinkHtml(dish, { label: '📖 orig. pt' }) + '</span>';
  }

  /* ---- strengthen stock openOriginalViewer lookup ---- */
  function patchOpenOriginalViewer() {
    if (typeof root.openOriginalViewer !== 'function' && typeof openOriginalViewer !== 'function') return;
    var current = typeof openOriginalViewer === 'function' ? openOriginalViewer : root.openOriginalViewer;
    if (current.__u481) return;
    function wrapped(encDish) {
      openOriginalForDish(encDish);
    }
    wrapped.__u481 = true;
    try { openOriginalViewer = wrapped; } catch (e) {}
    root.openOriginalViewer = wrapped;
  }

  /* Print from PDF viewer: keep pages; if this dish also has an xlsx photo, append photo page. */
  function patchPrintOriginalViewer() {
    var current = typeof printOriginalViewer === 'function' ? printOriginalViewer : root.printOriginalViewer;
    if (typeof current !== 'function' || current.__u481) return;
    async function wrapped() {
      var title = origViewerDishClean || 'Original';
      var dish = origViewerDish || '';
      var imgs = (typeof origViewerImages !== 'undefined' && origViewerImages) ? origViewerImages : [];
      var urls = [];
      for (var i = 0; i < imgs.length; i++) {
        var im = imgs[i];
        try {
          if (typeof origComposed === 'function') urls.push(await origComposed(im, dish));
          else urls.push(im.dataUrl);
        } catch (e) {
          urls.push(im.dataUrl);
        }
      }
      var photoOnly = imgs.length && imgs.every(function (e) { return e && e.source === 'xlsx'; });
      if (photoOnly && dish) {
        /* Prefer as-is layout with photo for spreadsheet-sourced originals */
        var htmlBody = buildAsIsHtmlForDish(dish);
        var css = asIsCss();
        var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' +
          String(title).replace(/</g, '&lt;') + '</title><style>' + css + '</style></head><body>' +
          htmlBody + '</body></html>';
        root.__lastOriginalPrint = html;
        if (typeof printViaIframe === 'function') printViaIframe(html);
        else window.print();
        return;
      }
      var imgsHtml = imgs.map(function (im, i) {
        return '<div class="pg"><img src="' + urls[i] + '"><div class="lbl">' +
          String(im.pageLabel || '').replace(/</g, '&lt;') + '</div></div>';
      }).join('');
      /* Append dish photo from xlsx if PDF pages were shown and a separate photo exists */
      try {
        var all = imagesFor(dish) || [];
        var extra = all.filter(function (e) { return e && e.source === 'xlsx' && e.dataUrl; });
        extra.forEach(function (e) {
          imgsHtml += '<div class="pg"><img src="' + e.dataUrl + '"><div class="lbl">Dish photo</div></div>';
        });
      } catch (e2) {}
      var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' +
        String(title).replace(/</g, '&lt;') + '</title><style>' +
        'body{margin:0}.pg{page-break-after:always;display:flex;flex-direction:column;align-items:center;padding:16px 0}' +
        '.pg:last-child{page-break-after:auto}img{max-width:100%;height:auto}.lbl{font:12px sans-serif;color:#555;margin-top:6px}' +
        '</style></head><body>' + imgsHtml + '</body></html>';
      root.__lastOriginalPrint = fullHtml;
      if (typeof printViaIframe === 'function') printViaIframe(fullHtml);
      else window.print();
    }
    wrapped.__u481 = true;
    try { printOriginalViewer = wrapped; } catch (e) {}
    root.printOriginalViewer = wrapped;
  }

  function stashFromUpload(u8, name, sheetNames) {
    try {
      SOURCE.bytes = u8 && u8.length ? new Uint8Array(u8) : null;
      SOURCE.name = name || (SOURCE.name || 'upload.xlsx');
      SOURCE.sheetNames = sheetNames || SOURCE.sheetNames || [];
    } catch (e) {
      SOURCE.bytes = null;
    }
  }

  function patchUploadStash() {
    /* Stash after attachXlsxDishPhotos and on handleFile / handleWorkbookObject */
    if (typeof root.attachXlsxDishPhotos === 'function' && !root.attachXlsxDishPhotos.__u481) {
      var att = root.attachXlsxDishPhotos;
      var wrappedAtt = async function (u8) {
        try {
          stashFromUpload(u8, (document.getElementById('fileTag') || {}).textContent || 'upload.xlsx', []);
        } catch (e) {}
        return att.apply(this, arguments);
      };
      wrappedAtt.__u481 = true;
      root.attachXlsxDishPhotos = wrappedAtt;
      try { attachXlsxDishPhotos = wrappedAtt; } catch (e) {}
    }
    if (typeof root.handleWorkbookObject === 'function' && !root.handleWorkbookObject.__u481) {
      var hwo = root.handleWorkbookObject;
      var wrappedHwo = function (wbObj, fileName, rawBytes) {
        try {
          if (rawBytes) stashFromUpload(rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes), fileName, wbObj && wbObj.SheetNames);
          else if (wbObj && wbObj.SheetNames) SOURCE.sheetNames = wbObj.SheetNames.slice();
        } catch (e) {}
        return hwo.apply(this, arguments);
      };
      wrappedHwo.__u481 = true;
      root.handleWorkbookObject = wrappedHwo;
      try { handleWorkbookObject = wrappedHwo; } catch (e) {}
    }
  }

  function injectLinks() {
    ensureCss();
    var area = document.getElementById('resultsArea');
    if (!area) return;

    /* 1) Dish heads in By dish: ensure View original button uses our handler and appears whenever possible */
    area.querySelectorAll('.dish-block').forEach(function (block) {
      var h3 = block.querySelector('.dish-head h3');
      if (!h3) return;
      var dishClean = (h3.textContent || '').trim();
      var dish = null;
      try {
        (typeof ROWS !== 'undefined' ? ROWS : []).some(function (r) {
          if (r && clean(r.dish) === dishClean) { dish = r.dish; return true; }
          return false;
        });
      } catch (e) {}
      if (!dish) dish = dishClean;
      if (!hasOriginal(dish)) return;
      var actions = block.querySelector('.section-actions');
      if (!actions) return;
      var existing = actions.querySelector('[data-u481-dish], button[onclick*="openOriginalViewer"]');
      if (existing) {
        existing.setAttribute('data-u481-dish', enc(dish));
        existing.classList.add('u481-orig');
        if (existing.getAttribute('onclick')) existing.removeAttribute('onclick');
        existing.onclick = function (ev) {
          ev.preventDefault();
          openOriginalForDish(enc(dish));
        };
        return;
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost u481-orig';
      btn.setAttribute('data-u481-dish', enc(dish));
      btn.textContent = '📖 View original';
      btn.onclick = function (ev) {
        ev.preventDefault();
        openOriginalForDish(enc(dish));
      };
      actions.appendChild(btn);
    });

    /* 2) Dish cells in By day / By section tables — chip next to first dish name cell (screen only) */
    area.querySelectorAll('.section-table-wrap.no-print td.dish, .dish-block .section-table-wrap td.dish').forEach(function (td) {
      if (td.querySelector('.u481-orig-chip')) return;
      if (td.closest('.print-only')) return;
      var raw = (td.childNodes[0] && td.childNodes[0].nodeType === 3)
        ? td.childNodes[0].textContent
        : '';
      if (!raw) {
        /* Fallback: first text-like content before any chip we might add */
        var clone = td.cloneNode(true);
        clone.querySelectorAll('.u481-orig-chip, br, span').forEach(function (n) { n.remove(); });
        raw = (clone.textContent || '');
      }
      raw = String(raw || '').split('\n')[0].trim();
      if (!raw) return;
      var dish = null;
      try {
        (typeof ROWS !== 'undefined' ? ROWS : []).some(function (r) {
          if (r && clean(r.dish) === raw) { dish = r.dish; return true; }
          return false;
        });
      } catch (e) {}
      if (!dish) dish = raw;
      if (!hasOriginal(dish)) return;
      var chip = document.createElement('span');
      chip.className = 'u481-orig-chip no-print';
      chip.innerHTML = origLinkHtml(dish, { label: '📖 orig. pt' });
      var link = chip.querySelector('.u481-orig');
      if (link) {
        link.onclick = function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          openOriginalForDish(enc(dish));
        };
      }
      td.appendChild(chip);
    });

    /* 3) Originals tab heads already have View original — rebind */
    area.querySelectorAll('.orig-page .orig-head button, .orig-tab button').forEach(function (btn) {
      var t = (btn.textContent || '');
      if (!/view original|original pt|print the original/i.test(t)) return;
      if (/print the original/i.test(t)) return; /* keep print-all */
      var head = btn.closest('.orig-page');
      var dishAttr = head && head.querySelector('img.orig-img');
      var dish = null;
      if (dishAttr) {
        try { dish = decodeURIComponent(dishAttr.getAttribute('data-od') || ''); } catch (e) { dish = dishAttr.getAttribute('data-od'); }
      }
      if (!dish) {
        var b = head && head.querySelector('.orig-head b');
        dish = b ? b.textContent : '';
      }
      if (!dish) return;
      btn.classList.add('u481-orig');
      btn.setAttribute('data-u481-dish', enc(dish));
      btn.onclick = function (ev) {
        ev.preventDefault();
        openOriginalForDish(enc(dish));
      };
    });

    /* 4) Source-tab style meta lines: make "Source tab: X" clickable if present */
    area.querySelectorAll('.meta, .staffing-line, td, th').forEach(function (el) {
      if (el.dataset.u481SrcWired) return;
      var tx = el.textContent || '';
      if (!/source tab/i.test(tx)) return;
      /* Skip large containers */
      if ((el.children && el.children.length > 3) || tx.length > 120) return;
      el.dataset.u481SrcWired = '1';
    });
  }

  function wireDelegatedClicks() {
    if (document.body.dataset.u481Click) return;
    document.body.dataset.u481Click = '1';
    document.body.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-u481-dish],.u481-orig');
      if (!t) return;
      var d = t.getAttribute('data-u481-dish');
      if (!d) return;
      ev.preventDefault();
      openOriginalForDish(d);
    });
  }

  function patchRender() {
    var g = root;
    if (typeof g.render !== 'function') return;
    if (g.render.__u481) return;
    var orig = g.render;
    function wrapped() {
      var ret = orig.apply(this, arguments);
      try {
        injectLinks();
        ensureViewerPrintLabel();
      } catch (e) {
        console.warn('u481 inject', e);
      }
      return ret;
    }
    wrapped.__u481 = true;
    /* Keep 480 marker if present by chaining — we wrap whatever is current */
    try { render = wrapped; } catch (e) {}
    g.render = wrapped;
  }

  function patchRenderByDishEnsureButton() {
    /* Broaden the inline condition: after render inject handles missing buttons. */
  }

  root.Prepline481 = {
    VERSION: '4.8.1',
    openOriginalForDish: openOriginalForDish,
    hasOriginal: hasOriginal,
    imagesFor: imagesFor,
    stashSourceXlsx: stashFromUpload,
    getSource: function () { return { name: SOURCE.name, bytes: SOURCE.bytes, sheetNames: SOURCE.sheetNames.slice() }; },
    closeAsIsOriginal: closeAsIsOriginal,
    openAsIsOriginal: openAsIsOriginal
  };
  root.openOriginalForDish = openOriginalForDish;

  function boot() {
    ensureCss();
    patchOpenOriginalViewer();
    patchPrintOriginalViewer();
    patchUploadStash();
    patchRender();
    wireDelegatedClicks();
    try { injectLinks(); } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 0);
  setTimeout(boot, 50);
  setTimeout(boot, 300);
  setTimeout(patchUploadStash, 500);
})(typeof window !== 'undefined' ? window : this);
