/* Prepline 4.7.6 — Print as-is includes plated-dish photos from xlsx (and PDF page images). Trial copy only. */
(function (root) {
  'use strict';

  var EXCELJS_SRC = 'vendor/exceljs/exceljs.min.js';
  var excelJsPromise = null;

  function ensureExcelJS() {
    if (root.ExcelJS && root.ExcelJS.Workbook) return Promise.resolve(root.ExcelJS);
    if (excelJsPromise) return excelJsPromise;
    excelJsPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = EXCELJS_SRC;
      s.async = true;
      s.onload = function () {
        if (root.ExcelJS && root.ExcelJS.Workbook) resolve(root.ExcelJS);
        else reject(new Error('ExcelJS loaded but Workbook missing'));
      };
      s.onerror = function () { reject(new Error('Could not load ExcelJS')); };
      document.head.appendChild(s);
    });
    return excelJsPromise;
  }

  function u8ToBase64(u8) {
    var CHUNK = 0x8000;
    var parts = [];
    for (var i = 0; i < u8.length; i += CHUNK) {
      parts.push(String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK)));
    }
    return btoa(parts.join(''));
  }

  function bufferToU8(buf) {
    if (!buf) return null;
    if (buf instanceof Uint8Array) return buf;
    if (buf.buffer) return new Uint8Array(buf.buffer, buf.byteOffset || 0, buf.byteLength || buf.length);
    try { return new Uint8Array(buf); } catch (e) { return null; }
  }

  function mimeForExt(ext) {
    ext = String(ext || 'png').replace(/^\./, '').toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'webp') return 'image/webp';
    return 'image/png';
  }

  function scaleDataUrl(dataUrl, maxW) {
    maxW = maxW || 900;
    return new Promise(function (resolve) {
      try {
        var img = new Image();
        img.onload = function () {
          try {
            var scale = Math.min(1, maxW / (img.naturalWidth || img.width || maxW));
            var w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
            var h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
            var c = document.createElement('canvas');
            c.width = w; c.height = h;
            var ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/jpeg', 0.72));
          } catch (e) { resolve(dataUrl); }
        };
        img.onerror = function () { resolve(dataUrl); };
        img.src = dataUrl;
      } catch (e) { resolve(dataUrl); }
    });
  }

  /** Parse xlsx bytes → { sheetName: [{dataUrl, pageLabel, source}] } */
  async function extractSheetPhotosFromXlsx(u8) {
    var ExcelJS = await ensureExcelJS();
    var wb = new ExcelJS.Workbook();
    var ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    await wb.xlsx.load(ab);
    var bySheet = {};
    var sheets = wb.worksheets || [];
    for (var si = 0; si < sheets.length; si++) {
      var ws = sheets[si];
      var imgs = [];
      try { imgs = ws.getImages() || []; } catch (e) { imgs = []; }
      if (!imgs.length) continue;
      var entries = [];
      for (var ii = 0; ii < imgs.length; ii++) {
        var im = imgs[ii];
        var media = null;
        try { media = wb.getImage(+im.imageId); } catch (e) { media = null; }
        if (!media) continue;
        var raw = bufferToU8(media.buffer);
        if (!raw || !raw.length) continue;
        var mime = mimeForExt(media.extension);
        var dataUrl = 'data:' + mime + ';base64,' + u8ToBase64(raw);
        dataUrl = await scaleDataUrl(dataUrl, 900);
        entries.push({ dataUrl: dataUrl, pageLabel: 'Dish photo', source: 'xlsx' });
      }
      if (entries.length) bySheet[ws.name] = entries;
    }
    return bySheet;
  }

  /** After processWorkbook: map sheet photos onto originalPageImages by dish / srcSheet. */
  async function attachXlsxDishPhotos(u8) {
    if (!u8 || !u8.length) return { sheets: 0, dishes: 0 };
    var bySheet;
    try {
      bySheet = await extractSheetPhotosFromXlsx(u8);
    } catch (e) {
      console.warn('attachXlsxDishPhotos: extract failed', e);
      return { sheets: 0, dishes: 0, error: String(e && e.message || e) };
    }
    var sheetNames = Object.keys(bySheet);
    if (!sheetNames.length) return { sheets: 0, dishes: 0 };

    if (typeof originalPageImages !== 'object' || !originalPageImages) {
      try { originalPageImages = {}; } catch (e) { root.originalPageImages = {}; }
    }

    var dishToSheet = {};
    (typeof ROWS !== 'undefined' ? ROWS : []).forEach(function (r) {
      if (!r || !r.dish) return;
      if (r.srcSheet && !dishToSheet[r.dish]) dishToSheet[r.dish] = r.srcSheet;
    });

    var attached = 0;
    Object.keys(dishToSheet).forEach(function (dish) {
      var photos = bySheet[dishToSheet[dish]];
      if (photos && photos.length) {
        originalPageImages[dish] = photos.slice();
        attached++;
      }
    });
    // Named tabs: dish key often equals sheet name
    sheetNames.forEach(function (sheet) {
      if (!originalPageImages[sheet]) {
        originalPageImages[sheet] = bySheet[sheet].slice();
        attached++;
      }
    });

    try {
      if (typeof saveOnetimeState === 'function') saveOnetimeState();
      else if (typeof saveState === 'function') saveState();
    } catch (e) { /* quota / truncated — ok for session print */ }

    return { sheets: sheetNames.length, dishes: attached };
  }

  function dishPhotoFor(d) {
    if (!d) return null;
    var imgs = null;
    try {
      if (typeof originalPageImages === 'object' && originalPageImages) {
        imgs = originalPageImages[d.name];
        if ((!imgs || !imgs.length) && d.srcSheet) imgs = originalPageImages[d.srcSheet];
        if ((!imgs || !imgs.length) && typeof cleanDishName === 'function') {
          var clean = cleanDishName(d.name);
          imgs = originalPageImages[clean];
          // also scan keys by cleaned match
          if ((!imgs || !imgs.length) && clean) {
            Object.keys(originalPageImages).some(function (k) {
              if (cleanDishName(k) === clean && originalPageImages[k] && originalPageImages[k].length) {
                imgs = originalPageImages[k];
                return true;
              }
              return false;
            });
          }
        }
      }
    } catch (e) { imgs = null; }
    if (!imgs || !imgs.length) return null;
    var first = imgs[0];
    return first && first.dataUrl ? first : null;
  }

  function pbEscLocal(s) {
    if (typeof pbEsc === 'function') return pbEsc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var ASIS_CSS_PHOTOS = [
    '.asis-body{display:flex;gap:14px;align-items:flex-start}',
    '.asis-table-wrap{flex:1;min-width:0}',
    '.asis-photo{flex:0 0 240px;max-width:34%;text-align:center}',
    '.asis-photo img{width:100%;max-height:320px;height:auto;object-fit:contain;border:1px solid #bbb;background:#fafafa}',
    '.asis-photo .ph-lbl{font-size:10px;color:#666;margin-top:4px}',
    '@media print{.asis-photo{flex-basis:220px;max-width:30%}.asis-photo img{max-height:280px}}'
  ].join('');

  function asIsHtmlWithPhotos(dishes) {
    var cats = (typeof PB_CATS !== 'undefined' ? PB_CATS : []);
    var leg = cats.map(function (c) {
      return '<span class="lg" style="background:#' + c.hex + ';color:#' + c.fg + '">' + pbEscLocal(c.label) + '</span>';
    }).join('');
    return dishes.map(function (d) {
      var title = (typeof cleanDishName === 'function' ? cleanDishName(d.name) : d.name);
      var photo = dishPhotoFor(d);
      var rowsHtml = (d.rows || []).filter(function (r) { return String(r.item || '').trim(); }).map(function (r) {
        var c = typeof pbCat === 'function' ? pbCat(r.cat) : null;
        var total = typeof pbTotal === 'function' ? pbTotal(d, r) : '';
        var sec = typeof pbSection === 'function' ? pbSection(r) : (r.section || '');
        var day = r.day ? (typeof dayLabel === 'function' ? dayLabel(r.day) : r.day) : '';
        return '<tr><td class="mk" style="background:' + (c ? '#' + c.hex : '#fff') + '"></td><td>' +
          pbEscLocal(r.item) + '</td><td class="n">' + pbEscLocal(r.qty) + '</td><td>' + pbEscLocal(r.unit) +
          '</td><td class="n">' + pbEscLocal(total) + '</td><td>' + pbEscLocal(sec) + '</td><td>' +
          pbEscLocal(day) + '</td><td class="ref">' + pbEscLocal(r.ref) + '</td></tr>';
      }).join('');
      var photoHtml = photo
        ? '<div class="asis-photo"><img src="' + photo.dataUrl + '" alt="Dish photo"><div class="ph-lbl">' +
          pbEscLocal(photo.pageLabel || 'Dish photo') + '</div></div>'
        : '';
      return '<section class="asis-page"><div class="asis-head"><h1>' + pbEscLocal(title) +
        '</h1><div class="asis-pax">PAX <b>' + pbEscLocal(d.pax) + '</b></div></div>' +
        '<div class="asis-body"><div class="asis-table-wrap"><table class="asis"><thead><tr>' +
        '<th class="mk"></th><th>Item</th><th>Qty per pax</th><th>Unit</th><th>Total needed</th>' +
        '<th>Section</th><th>Prep day</th><th>Ref #</th></tr></thead><tbody>' + rowsHtml +
        '</tbody></table></div>' + photoHtml + '</div>' +
        '<div class="asis-legend">' + leg + '</div>' +
        '<div class="asis-foot">Prepline by Autoprod · printed as-is' +
        (photo ? ' · with dish photo' : '') + '</div></section>';
    }).join('');
  }

  function patchAsIs() {
    if (typeof asIsHtml === 'function') {
      root.__preplineAsIsHtmlOrig = asIsHtml;
      // function decl on window in browser
      try { asIsHtml = asIsHtmlWithPhotos; } catch (e) { root.asIsHtml = asIsHtmlWithPhotos; }
      root.asIsHtml = asIsHtmlWithPhotos;
    }
    if (typeof ASIS_CSS === 'string') {
      try {
        // const may be immutable; printAsIs embeds ASIS_CSS — wrap printAsIs instead
      } catch (e) {}
    }
    if (typeof printAsIs === 'function') {
      var origPrint = printAsIs;
      root.__preplinePrintAsIsOrig = origPrint;
      var wrapped = function (src) {
        var dishes = src === 'builder' ? (typeof pbValid === 'function' ? pbValid() : []) : (typeof asIsModelFromRows === 'function' ? asIsModelFromRows() : []);
        if (!dishes.length) return;
        // enrich dishes with srcSheet from ROWS for photo lookup
        var sheetByDish = {};
        (typeof ROWS !== 'undefined' ? ROWS : []).forEach(function (r) {
          if (r && r.dish && r.srcSheet && !sheetByDish[r.dish]) sheetByDish[r.dish] = r.srcSheet;
        });
        dishes.forEach(function (d) {
          if (!d.srcSheet && sheetByDish[d.name]) d.srcSheet = sheetByDish[d.name];
        });
        var css = (typeof ASIS_CSS === 'string' ? ASIS_CSS : '') + ASIS_CSS_PHOTOS;
        var v = document.getElementById('asisView');
        if (!v) { v = document.createElement('div'); v.id = 'asisView'; document.body.appendChild(v); }
        var htmlBody = asIsHtmlWithPhotos(dishes);
        v.innerHTML = '<div class="asis-bar no-print"><b>Print as-is preview</b>' +
          '<button type="button" class="pb-done" id="asisPrintBtn">🖨 Print</button>' +
          '<button type="button" class="ghost" id="asisCloseBtn">Close</button></div>' +
          '<div class="asis-wrap"><style>' + css.replace('@page{size:A4 landscape;margin:12mm}', '') + '</style>' +
          htmlBody + '</div>';
        v.hidden = false;
        document.body.classList.add('asis-open');
        document.getElementById('asisCloseBtn').onclick = function () {
          v.hidden = true; document.body.classList.remove('asis-open');
        };
        document.getElementById('asisPrintBtn').onclick = function () {
          var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Prep sheet (as-is)</title><style>' +
            css + '</style></head><body>' + htmlBody + '</body></html>';
          root.__lastAsIsPrint = html;
          if (typeof printViaIframe === 'function') printViaIframe(html); else window.print();
        };
      };
      try { printAsIs = wrapped; } catch (e) {}
      root.printAsIs = wrapped;
    }
  }

  root.attachXlsxDishPhotos = attachXlsxDishPhotos;
  root.extractSheetPhotosFromXlsx = extractSheetPhotosFromXlsx;
  root.Prepline476 = { VERSION: '4.7.6', attachXlsxDishPhotos: attachXlsxDishPhotos };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patchAsIs);
  } else {
    patchAsIs();
  }
})(typeof window !== 'undefined' ? window : this);
