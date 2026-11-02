/* Prepline 4.8.5 — Full spreadsheet editor carries dish photos from the uploaded xlsx.
 * Trial copy only. ExcelJS getImages (position + size) on open; overlay in Univer editor
 * (LuckyExcel drops drawings); re-addImage on Save .xlsx / Sort into preplist; Print includes photo.
 */
(function (root) {
  'use strict';

  var EXCELJS_SRC = 'vendor/exceljs/exceljs.min.js';
  var excelJsPromise = null;
  var editorPhotos = null; // { bySheet: { name: [photo,...] }, pollTimer, activeSheet }
  var _patched = false;

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
    maxW = maxW || 720;
    return new Promise(function (resolve) {
      try {
        var img = new Image();
        img.onload = function () {
          try {
            var nw = img.naturalWidth || img.width || maxW;
            var nh = img.naturalHeight || img.height || maxW;
            var scale = Math.min(1, maxW / nw);
            var w = Math.max(1, Math.round(nw * scale));
            var h = Math.max(1, Math.round(nh * scale));
            var c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve({ dataUrl: c.toDataURL('image/jpeg', 0.78), dispW: w, dispH: h });
          } catch (e) { resolve({ dataUrl: dataUrl, dispW: 0, dispH: 0 }); }
        };
        img.onerror = function () { resolve({ dataUrl: dataUrl, dispW: 0, dispH: 0 }); };
        img.src = dataUrl;
      } catch (e) { resolve({ dataUrl: dataUrl, dispW: 0, dispH: 0 }); }
    });
  }

  /** Full-fidelity sheet photos with original anchor + size (for editor overlay + re-embed). */
  async function extractSheetPhotosWithLayout(u8) {
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
        try { media = wb.getImage(+im.imageId); } catch (e2) { media = null; }
        if (!media) continue;
        var raw = bufferToU8(media.buffer);
        if (!raw || !raw.length) continue;
        var extName = String(media.extension || 'jpeg').replace(/^\./, '').toLowerCase();
        if (extName === 'jpg') extName = 'jpeg';
        var mime = mimeForExt(extName);
        var base64 = u8ToBase64(raw);
        var fullDataUrl = 'data:' + mime + ';base64,' + base64;
        var tl = (im.range && im.range.tl) || {};
        var br = (im.range && im.range.br) || null;
        var ext = (im.range && im.range.ext) || {};
        var tlCol = (typeof tl.col === 'number') ? tl.col
          : (typeof tl.nativeCol === 'number' ? tl.nativeCol : 0);
        var tlRow = (typeof tl.row === 'number') ? tl.row
          : (typeof tl.nativeRow === 'number' ? tl.nativeRow : 0);
        var width = (ext && ext.width) ? Number(ext.width) : 220;
        var height = (ext && ext.height) ? Number(ext.height) : 280;
        var scaled = await scaleDataUrl(fullDataUrl, 720);
        entries.push({
          base64: base64,
          extension: extName,
          dataUrl: scaled.dataUrl || fullDataUrl,
          fullDataUrl: fullDataUrl,
          tlCol: tlCol,
          tlRow: tlRow,
          brCol: br && typeof br.col === 'number' ? br.col : null,
          brRow: br && typeof br.row === 'number' ? br.row : null,
          width: width,
          height: height,
          editAs: (im.range && im.range.editAs) || 'oneCell',
          pageLabel: 'Dish photo'
        });
      }
      if (entries.length) bySheet[ws.name] = entries;
    }
    return bySheet;
  }

  function ensureOverlayCss() {
    if (document.getElementById('sbPhoto485Styles')) return;
    var s = document.createElement('style');
    s.id = 'sbPhoto485Styles';
    s.textContent = [
      '#sbPhotoOverlay{position:absolute;z-index:5;pointer-events:none;display:none;',
      'right:10px;top:48px;max-width:min(42%,520px);max-height:calc(100% - 64px);',
      'background:rgba(247,244,236,.92);border:1px solid #C9C2B0;border-radius:10px;',
      'box-shadow:0 8px 24px rgba(0,0,0,.14);padding:8px 8px 6px;text-align:center}',
      '#sbPhotoOverlay.open{display:block}',
      '#sbPhotoOverlay img{display:block;max-width:100%;max-height:calc(100vh - 180px);',
      'width:auto;height:auto;object-fit:contain;margin:0 auto;border:1px solid #ddd;background:#fff}',
      '#sbPhotoOverlay .sb-ph-meta{font-size:10px;color:#5C5A52;margin-top:4px;line-height:1.3}',
      '#sbPhotoOverlay .sb-ph-badge{font-size:10px;font-weight:600;color:#1C1E1B;margin-bottom:4px}',
      '#sbGrid{position:relative}',
      '@media print{#sbPhotoOverlay{display:none!important}}'
    ].join('');
    document.head.appendChild(s);
  }

  function ensureOverlayDom() {
    ensureOverlayCss();
    var grid = document.getElementById('sbGrid');
    if (!grid) return null;
    var el = document.getElementById('sbPhotoOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sbPhotoOverlay';
      el.innerHTML = '<div class="sb-ph-badge">Dish photo</div><img alt="Dish photo"><div class="sb-ph-meta"></div>';
      grid.appendChild(el);
    }
    return el;
  }

  function clearEditorPhotos() {
    if (editorPhotos && editorPhotos.pollTimer) {
      try { clearInterval(editorPhotos.pollTimer); } catch (e) {}
    }
    editorPhotos = null;
    var el = document.getElementById('sbPhotoOverlay');
    if (el) {
      el.classList.remove('open');
      var img = el.querySelector('img');
      if (img) { img.removeAttribute('src'); img.style.width = ''; img.style.height = ''; }
    }
  }

  function getActiveSheetName() {
    try {
      var ed = root.PreplineSheet && root.PreplineSheet._getEditor && root.PreplineSheet._getEditor();
      if (!ed || !ed.univerAPI) return null;
      var wb = ed.univerAPI.getActiveWorkbook && ed.univerAPI.getActiveWorkbook();
      if (!wb) return null;
      var sheet = wb.getActiveSheet && wb.getActiveSheet();
      if (!sheet) return null;
      if (typeof sheet.getSheetName === 'function') return sheet.getSheetName();
      if (typeof sheet.getName === 'function') return sheet.getName();
      return null;
    } catch (e) { return null; }
  }

  function listSheetNamesFromEditor() {
    try {
      var ed = root.PreplineSheet && root.PreplineSheet._getEditor && root.PreplineSheet._getEditor();
      var wb = ed && ed.univerAPI && ed.univerAPI.getActiveWorkbook && ed.univerAPI.getActiveWorkbook();
      if (!wb || typeof wb.getSheets !== 'function') return [];
      return (wb.getSheets() || []).map(function (sh) {
        try {
          if (typeof sh.getSheetName === 'function') return sh.getSheetName();
          if (typeof sh.getName === 'function') return sh.getName();
        } catch (e) {}
        return null;
      }).filter(Boolean);
    } catch (e) { return []; }
  }

  function positionOverlay(el, photo) {
    /* Approximate original anchor: photos sit mid/right of the sheet. Prefer top from row. */
    var row = Math.max(0, Number(photo.tlRow) || 0);
    var topPx = Math.min(Math.max(36, Math.round(row * 18) + 8), 220);
    el.style.top = topPx + 'px';
    el.style.right = '10px';
    el.style.left = 'auto';
    /* Preserve original aspect; cap display to original pixel size when smaller than overlay max */
    var img = el.querySelector('img');
    if (img && photo.width && photo.height) {
      var maxW = Math.min(photo.width, 520);
      var maxH = Math.min(photo.height, Math.max(240, window.innerHeight - 180));
      var scale = Math.min(1, maxW / photo.width, maxH / photo.height);
      img.style.width = Math.round(photo.width * scale) + 'px';
      img.style.height = Math.round(photo.height * scale) + 'px';
      img.style.maxWidth = '100%';
      img.style.maxHeight = 'calc(100vh - 180px)';
    }
  }

  function showPhotoForSheet(sheetName) {
    var el = ensureOverlayDom();
    if (!el || !editorPhotos || !editorPhotos.bySheet) return;
    var photos = null;
    if (sheetName && editorPhotos.bySheet[sheetName]) photos = editorPhotos.bySheet[sheetName];
    if ((!photos || !photos.length) && sheetName) {
      /* Soft match: trimmed / case-insensitive */
      var keys = Object.keys(editorPhotos.bySheet);
      for (var i = 0; i < keys.length; i++) {
        if (String(keys[i]).trim().toLowerCase() === String(sheetName).trim().toLowerCase()) {
          photos = editorPhotos.bySheet[keys[i]];
          break;
        }
      }
    }
    if (!photos || !photos.length) {
      el.classList.remove('open');
      return;
    }
    var photo = photos[0];
    var img = el.querySelector('img');
    var meta = el.querySelector('.sb-ph-meta');
    if (img) img.src = photo.dataUrl || photo.fullDataUrl;
    if (meta) {
      meta.textContent = (sheetName || '') + ' · ' +
        Math.round(photo.width) + '×' + Math.round(photo.height) + 'px · row ' +
        (Math.round((photo.tlRow || 0) * 10) / 10) + ' (from upload)';
    }
    positionOverlay(el, photo);
    el.classList.add('open');
    editorPhotos.activeSheet = sheetName;
  }

  function startPhotoPolling() {
    if (!editorPhotos) return;
    if (editorPhotos.pollTimer) clearInterval(editorPhotos.pollTimer);
    editorPhotos.pollTimer = setInterval(function () {
      if (!document.getElementById('sbPanel') || !document.getElementById('sbPanel').classList.contains('open')) {
        clearEditorPhotos();
        return;
      }
      var name = getActiveSheetName();
      if (name && name !== editorPhotos.activeSheet) showPhotoForSheet(name);
      else if (name) showPhotoForSheet(name);
    }, 450);
    /* First paint shortly after Univer mounts sheets */
    setTimeout(function () {
      var name = getActiveSheetName();
      var keys = editorPhotos && editorPhotos.bySheet ? Object.keys(editorPhotos.bySheet) : [];
      showPhotoForSheet(name || keys[0] || '');
    }, 600);
    setTimeout(function () {
      var name = getActiveSheetName();
      if (name) showPhotoForSheet(name);
    }, 1600);
  }

  async function loadPhotosFromBytes(bytes) {
    if (!bytes) return { sheets: 0, photos: 0 };
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var bySheet;
    try {
      bySheet = await extractSheetPhotosWithLayout(u8);
    } catch (e) {
      console.warn('4.8.5 photo extract failed', e);
      return { sheets: 0, photos: 0, error: String(e && e.message || e) };
    }
    var keys = Object.keys(bySheet);
    var n = 0;
    keys.forEach(function (k) { n += bySheet[k].length; });
    editorPhotos = { bySheet: bySheet, pollTimer: null, activeSheet: null };
    root.__prepline485EditorPhotos = bySheet;
    return { sheets: keys.length, photos: n };
  }

  async function reembedPhotosIntoBuffer(buf) {
    if (!editorPhotos || !editorPhotos.bySheet) return { buffer: buf, photos: 0 };
    var bySheet = editorPhotos.bySheet;
    var keys = Object.keys(bySheet);
    if (!keys.length) return { buffer: buf, photos: 0 };
    var ExcelJS = await ensureExcelJS();
    var wb = new ExcelJS.Workbook();
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    await wb.xlsx.load(ab);
    var photoCount = 0;
    var lowerMap = {};
    keys.forEach(function (k) { lowerMap[k.trim().toLowerCase()] = k; });

    (wb.worksheets || []).forEach(function (ws) {
      var srcKey = bySheet[ws.name] ? ws.name : lowerMap[String(ws.name || '').trim().toLowerCase()];
      var photos = srcKey ? bySheet[srcKey] : null;
      if (!photos || !photos.length) return;
      photos.forEach(function (ph) {
        try {
          var imageId = wb.addImage({ base64: ph.base64, extension: ph.extension || 'jpeg' });
          var spec = {
            tl: { col: ph.tlCol, row: ph.tlRow },
            ext: { width: ph.width, height: ph.height }
          };
          if (ph.editAs) spec.editAs = ph.editAs;
          ws.addImage(imageId, spec);
          photoCount++;
        } catch (e) {
          console.warn('4.8.5 addImage skip', ws.name, e);
        }
      });
    });
    var out = await wb.xlsx.writeBuffer();
    return { buffer: out, photos: photoCount };
  }

  function downloadBuf(buf, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 2000);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function snapshotSheetToAoa(snapshot, sheetName) {
    var sheets = snapshot.sheets || {};
    var order = snapshot.sheetOrder || Object.keys(sheets);
    var sheet = null;
    var sid = null;
    for (var i = 0; i < order.length; i++) {
      var id = order[i];
      var sh = sheets[id];
      if (!sh) continue;
      if (!sheetName || sh.name === sheetName) { sheet = sh; sid = id; break; }
    }
    if (!sheet) {
      sid = order[0];
      sheet = sheets[sid];
    }
    if (!sheet) return { name: sheetName || 'Sheet', aoa: [] };
    var cellData = sheet.cellData || {};
    var maxR = 0, maxC = 0;
    Object.keys(cellData).forEach(function (rk) {
      var ri = +rk; if (!Number.isFinite(ri)) return;
      maxR = Math.max(maxR, ri);
      Object.keys(cellData[rk] || {}).forEach(function (ck) {
        var ci = +ck; if (Number.isFinite(ci)) maxC = Math.max(maxC, ci);
      });
    });
    maxR = Math.min(maxR, 80);
    maxC = Math.min(maxC, 16);
    var aoa = [];
    for (var r = 0; r <= maxR; r++) {
      var row = [];
      for (var c = 0; c <= maxC; c++) {
        var cell = cellData[r] && cellData[r][c];
        if (!cell) { row.push(''); continue; }
        var v = cell.v;
        if (v == null && cell.f) v = cell.f;
        row.push(v == null ? '' : v);
      }
      aoa.push(row);
    }
    return { name: sheet.name || sheetName || 'Sheet', aoa: aoa };
  }

  function printActiveSheetWithPhoto() {
    try {
      var snap = root.PreplineSheet && root.PreplineSheet.getSnapshot && root.PreplineSheet.getSnapshot();
      if (!snap) { alert('Open a spreadsheet first.'); return; }
      var sheetName = getActiveSheetName() || '';
      var pack = snapshotSheetToAoa(snap, sheetName);
      var photos = editorPhotos && editorPhotos.bySheet &&
        (editorPhotos.bySheet[pack.name] || editorPhotos.bySheet[sheetName]);
      if ((!photos || !photos.length) && editorPhotos && editorPhotos.bySheet) {
        var lk = Object.keys(editorPhotos.bySheet);
        for (var i = 0; i < lk.length; i++) {
          if (String(lk[i]).trim().toLowerCase() === String(pack.name || sheetName).trim().toLowerCase()) {
            photos = editorPhotos.bySheet[lk[i]];
            break;
          }
        }
      }
      var photo = photos && photos[0];
      var rowsHtml = pack.aoa.map(function (row) {
        return '<tr>' + row.map(function (c) {
          return '<td>' + esc(c) + '</td>';
        }).join('') + '</tr>';
      }).join('');
      var photoHtml = photo
        ? '<div class="ph"><img src="' + (photo.fullDataUrl || photo.dataUrl) + '" style="width:' +
          Math.min(photo.width || 400, 420) + 'px;height:auto;max-height:560px;object-fit:contain" alt="Dish photo">' +
          '<div class="lbl">' + esc(photo.pageLabel || 'Dish photo') + ' · ' +
          Math.round(photo.width) + '×' + Math.round(photo.height) + 'px</div></div>'
        : '<div class="ph muted">No dish photo on this tab</div>';
      var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(pack.name) +
        '</title><style>body{font:12px/1.35 Calibri,Arial,sans-serif;margin:16px;color:#111}' +
        'h1{font:700 18px Fraunces,Georgia,serif;margin:0 0 8px}' +
        '.wrap{display:flex;gap:16px;align-items:flex-start}' +
        'table{border-collapse:collapse;flex:1;min-width:0}td{border:1px solid #ccc;padding:3px 6px;vertical-align:top}' +
        '.ph{flex:0 0 auto;text-align:center}.ph img{border:1px solid #bbb;background:#fafafa}' +
        '.lbl{font-size:10px;color:#666;margin-top:4px}.muted{color:#888;font-size:12px}' +
        '@media print{body{margin:8px}}</style></head><body>' +
        '<h1>' + esc(pack.name) + '</h1>' +
        '<div class="wrap"><table>' + rowsHtml + '</table>' + photoHtml + '</div>' +
        '<script>onload=function(){setTimeout(function(){print()},200)}<\/script></body></html>';
      var w = window.open('', '_blank');
      if (!w) { alert('Allow pop-ups to print.'); return; }
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e) {
      alert('Print failed: ' + (e && e.message ? e.message : e));
    }
  }

  function setHintPhotos(stats) {
    var hint = document.getElementById('sbHint');
    if (!hint) return;
    if (stats && stats.photos > 0) {
      hint.textContent = 'All tabs, fills, fonts, formulas + ' + stats.photos +
        ' dish photo(s) from upload on ' + stats.sheets +
        ' tab(s). Photo follows the active sheet. Save / Sort keep the images. Print includes the photo.';
    }
  }

  function wireExtraButtons() {
    var top = document.getElementById('sbTop');
    if (!top) return;
    if (!document.getElementById('sbPrintPhoto')) {
      var printBtn = document.createElement('button');
      printBtn.type = 'button';
      printBtn.id = 'sbPrintPhoto';
      printBtn.textContent = '🖨 Print';
      printBtn.title = 'Print the active sheet with its dish photo';
      printBtn.onclick = printActiveSheetWithPhoto;
      var saveBtn = document.getElementById('sbSaveXlsx');
      if (saveBtn && saveBtn.parentNode) saveBtn.parentNode.insertBefore(printBtn, saveBtn.nextSibling);
      else top.appendChild(printBtn);
    }
  }

  function patchSaveButton() {
    var btn = document.getElementById('sbSaveXlsx');
    if (!btn || btn.__prepline485) return;
    btn.__prepline485 = true;
    btn.onclick = function () {
      var hint = document.getElementById('sbHint');
      if (hint) hint.textContent = 'Building .xlsx (re-embedding dish photos)…';
      ['sbSort', 'sbSaveXlsx', 'sbClose', 'sbPrintPhoto'].forEach(function (id) {
        var el = document.getElementById(id); if (el) el.disabled = true;
      });
      Promise.resolve()
        .then(function () {
          if (!root.PreplineSheet || typeof root.PreplineSheet.getSnapshot !== 'function') {
            throw new Error('Editor not open');
          }
          return root.PreplineSheet.getSnapshot();
        })
        .then(function (snap) {
          return new Promise(function (resolve, reject) {
            var Lucky = root.LuckyExcel;
            if (!Lucky || typeof Lucky.transformUniverToExcel !== 'function') {
              reject(new Error('LuckyExcel.transformUniverToExcel missing'));
              return;
            }
            var name = 'prepline-sheet-edited.xlsx';
            try {
              var pendingName = (document.getElementById('sbTitle') || {}).textContent || '';
              var m = pendingName.match(/^Edit — (.+)$/);
              if (m) name = m[1].replace(/\.(xlsx|xls|csv)$/i, '') + '-edited.xlsx';
            } catch (e0) {}
            Lucky.transformUniverToExcel({
              snapshot: snap,
              fileName: name,
              getBuffer: true,
              success: function (buf) { resolve({ buf: buf, name: name }); },
              error: function (err) { reject(err || new Error('Excel export failed')); }
            });
          });
        })
        .then(function (pack) {
          return reembedPhotosIntoBuffer(pack.buf).then(function (r) {
            downloadBuf(r.buffer, pack.name);
            root.__lastEditorXlsx485 = { photos: r.photos, name: pack.name };
            if (hint) {
              hint.textContent = r.photos
                ? ('Saved .xlsx with ' + r.photos + ' dish photo(s) re-embedded.')
                : 'Saved .xlsx (no dish photos on these tabs).';
            }
          });
        })
        .catch(function (e) { alert('Save failed: ' + (e && e.message ? e.message : e)); })
        .then(function () {
          ['sbSort', 'sbSaveXlsx', 'sbClose', 'sbPrintPhoto'].forEach(function (id) {
            var el = document.getElementById(id); if (el) el.disabled = false;
          });
        });
    };
  }

  function patchSortButton() {
    var btn = document.getElementById('sbSort');
    if (!btn || btn.__prepline485) return;
    btn.__prepline485 = true;
    var prev = btn.onclick;
    btn.onclick = function (ev) {
      /* Intercept Sort: export → re-embed photos → ingest (so sorter still gets dish photos). */
      var hint = document.getElementById('sbHint');
      if (hint) hint.textContent = 'Preparing workbook for sorter (keeping dish photos)…';
      ['sbSort', 'sbSaveXlsx', 'sbClose', 'sbPrintPhoto'].forEach(function (id) {
        var el = document.getElementById(id); if (el) el.disabled = true;
      });
      Promise.resolve()
        .then(function () {
          var ed = root.PreplineSheet && root.PreplineSheet._getEditor && root.PreplineSheet._getEditor();
          if (!ed) throw new Error('Editor not open');
          /* Detect pdf-rows mode via hint/title is fragile — fall back to original handler when no photos */
          if (!editorPhotos || !Object.keys(editorPhotos.bySheet || {}).length) {
            if (typeof prev === 'function') return prev.call(btn, ev);
            throw new Error('Nothing to sort');
          }
          return root.PreplineSheet.getSnapshot();
        })
        .then(function (snap) {
          if (!snap || snap === undefined) return null;
          return new Promise(function (resolve, reject) {
            var Lucky = root.LuckyExcel;
            if (!Lucky || typeof Lucky.transformUniverToExcel !== 'function') {
              reject(new Error('LuckyExcel.transformUniverToExcel missing'));
              return;
            }
            var name = 'edited.xlsx';
            try {
              var t = (document.getElementById('sbTitle') || {}).textContent || '';
              var m = t.match(/^Edit — (.+)$/);
              if (m) name = m[1];
              if (!/\.xlsx?$/i.test(name)) name = name.replace(/\.[^.]+$/, '') + '.xlsx';
            } catch (e0) {}
            Lucky.transformUniverToExcel({
              snapshot: snap,
              fileName: name,
              getBuffer: true,
              success: function (buf) { resolve({ buf: buf, name: name }); },
              error: function (err) { reject(err || new Error('Excel export failed')); }
            });
          });
        })
        .then(function (pack) {
          if (!pack) return;
          return reembedPhotosIntoBuffer(pack.buf).then(function (r) {
            root.__lastEditorXlsx485 = { photos: r.photos, name: pack.name, via: 'sort' };
            if (root.PreplineSheet && typeof root.PreplineSheet.close === 'function') {
              root.PreplineSheet.close();
            }
            clearEditorPhotos();
            if (root.PreplineSheet && typeof root.PreplineSheet.ingestBuffer === 'function') {
              root.PreplineSheet.ingestBuffer(r.buffer, pack.name);
            } else {
              throw new Error('ingestBuffer missing');
            }
          });
        })
        .catch(function (e) {
          if (e && /Nothing to sort|Editor not open/i.test(String(e.message || e))) return;
          alert('Could not feed sheet to sorter: ' + (e && e.message ? e.message : e));
          ['sbSort', 'sbSaveXlsx', 'sbClose', 'sbPrintPhoto'].forEach(function (id) {
            var el = document.getElementById(id); if (el) el.disabled = false;
          });
        });
    };
  }


  function resolvePendingBytes(fallback) {
    var b = root.__prepline485PendingBytes || fallback || null;
    try {
      if ((!b || !b.length) && root.PreplineSheet && typeof root.PreplineSheet.getPendingBytes === 'function') {
        b = root.PreplineSheet.getPendingBytes();
      }
      if (b && !(b instanceof Uint8Array)) b = new Uint8Array(b);
      if (b && b.length) root.__prepline485PendingBytes = b;
    } catch (e) {}
    return b;
  }

  var _afterOpenToken = 0;
  function afterEditorOpen(bytes) {
    wireExtraButtons();
    patchSaveButton();
    patchSortButton();
    var token = ++_afterOpenToken;
    return loadPhotosFromBytes(bytes).then(function (stats) {
      if (token !== _afterOpenToken) return stats;
      setHintPhotos(stats);
      if (stats.photos > 0) startPhotoPolling();
      else clearEditorPhotos();
      root.__prepline485LastLoad = stats;
      return stats;
    });
  }

  function patchOpenPendingEdit() {
    if (!root.PreplineSheet || typeof root.PreplineSheet.openPendingEdit !== 'function') return;
    if (root.PreplineSheet.openPendingEdit.__prepline485) return;
    var orig = root.PreplineSheet.openPendingEdit;
    var wrapped = function () {
      /* Capture pending bytes before open clears/uses them */
      var bytes = null;
      try {
        var choice = document.getElementById('sbChoice');
        /* pending is closed over in sheet-builder; read from file input path via hook below */
        bytes = root.__prepline485PendingBytes || null;
      } catch (e) {}
      orig.apply(this, arguments);
      /* Poll until editor exists, then attach photos */
      var tries = 0;
      (function waitEd() {
        var ed = root.PreplineSheet._getEditor && root.PreplineSheet._getEditor();
        var panelOpen = document.getElementById('sbPanel') && document.getElementById('sbPanel').classList.contains('open');
        if (ed && panelOpen) {
          var b = resolvePendingBytes(bytes);
          afterEditorOpen(b).catch(function (e) { console.warn('4.8.5 after open', e); });
          return;
        }
        if (++tries < 80) setTimeout(waitEd, 150);
      })();
    };
    wrapped.__prepline485 = true;
    root.PreplineSheet.openPendingEdit = wrapped;
  }

  function patchOfferEditBeforeSort() {
    if (!root.PreplineSheet || typeof root.PreplineSheet.offerEditBeforeSort !== 'function') return;
    if (root.PreplineSheet.offerEditBeforeSort.__prepline485) return;
    var orig = root.PreplineSheet.offerEditBeforeSort;
    var wrapped = function (file, arrayBuffer) {
      try {
        root.__prepline485PendingBytes = arrayBuffer instanceof Uint8Array
          ? arrayBuffer
          : new Uint8Array(arrayBuffer);
      } catch (e) { root.__prepline485PendingBytes = null; }
      return orig.apply(this, arguments);
    };
    wrapped.__prepline485 = true;
    root.PreplineSheet.offerEditBeforeSort = wrapped;
  }

  function patchSbEditFirstClick() {
    var btn = document.getElementById('sbEditFirst');
    if (!btn || btn.__prepline485) return;
    btn.__prepline485 = true;
    var prev = btn.onclick;
    btn.onclick = function (ev) {
      if (typeof prev === 'function') prev.call(btn, ev);
      var tries = 0;
      (function waitEd() {
        var ed = root.PreplineSheet && root.PreplineSheet._getEditor && root.PreplineSheet._getEditor();
        if (ed && document.getElementById('sbPanel') && document.getElementById('sbPanel').classList.contains('open')) {
          afterEditorOpen(resolvePendingBytes(null)).catch(function () {});
          return;
        }
        if (++tries < 100) setTimeout(waitEd, 150);
      })();
    };
  }

  function patchClose() {
    if (!root.PreplineSheet || typeof root.PreplineSheet.close !== 'function') return;
    if (root.PreplineSheet.close.__prepline485) return;
    var orig = root.PreplineSheet.close;
    var wrapped = function () {
      clearEditorPhotos();
      return orig.apply(this, arguments);
    };
    wrapped.__prepline485 = true;
    root.PreplineSheet.close = wrapped;
    var closeBtn = document.getElementById('sbClose');
    if (closeBtn && !closeBtn.__prepline485) {
      closeBtn.__prepline485 = true;
      var prev = closeBtn.onclick;
      closeBtn.onclick = function (ev) {
        clearEditorPhotos();
        if (typeof prev === 'function') prev.call(closeBtn, ev);
      };
    }
  }

  function patchFileOpenInsideEditor() {
    var input = document.getElementById('sbFileInput');
    if (!input || input.__prepline485) return;
    input.__prepline485 = true;
    input.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          root.__prepline485PendingBytes = new Uint8Array(ev.target.result);
        } catch (err) {}
        var tries = 0;
        (function waitEd() {
          var ed = root.PreplineSheet && root.PreplineSheet._getEditor && root.PreplineSheet._getEditor();
          if (ed) {
            afterEditorOpen(resolvePendingBytes(null)).catch(function () {});
            return;
          }
          if (++tries < 80) setTimeout(waitEd, 200);
        })();
      };
      reader.readAsArrayBuffer(f);
    });
  }


  function patchHandleFileStash() {
    if (window.handleFile && window.handleFile.__sb && !window.handleFile.__prepline485stash) {
      var inner = window.handleFile;
      var wrapped = function (file) {
        try {
          var n = (file && file.name || '').toLowerCase();
          if (/\.xlsx?$|\.xlsm$/.test(n)) {
            var reader = new FileReader();
            reader.onload = function (ev) {
              try { root.__prepline485PendingBytes = new Uint8Array(ev.target.result); } catch (e1) {}
            };
            try { reader.readAsArrayBuffer(file); } catch (e2) {}
          }
        } catch (e0) {}
        return inner.apply(this, arguments);
      };
      wrapped.__sb = true;
      wrapped.__prepline485stash = true;
      window.handleFile = wrapped;
      return true;
    }
    return false;
  }

  function boot() {
    patchHandleFileStash();
    if (_patched) {
      wireExtraButtons();
      patchSaveButton();
      patchSortButton();
      patchSbEditFirstClick();
      patchClose();
      patchFileOpenInsideEditor();
      return;
    }
    patchOfferEditBeforeSort();
    patchOpenPendingEdit();
    patchSbEditFirstClick();
    patchClose();
    wireExtraButtons();
    patchSaveButton();
    patchSortButton();
    patchFileOpenInsideEditor();
    _patched = true;
    // handleFile sb-hook may install slightly later
    var tries = 0;
    (function retryStash() {
      if (patchHandleFileStash()) return;
      if (++tries < 100) setTimeout(retryStash, 100);
    })();
  }

  root.Prepline485 = {
    VERSION: '4.8.5',
    extractSheetPhotosWithLayout: extractSheetPhotosWithLayout,
    reembedPhotosIntoBuffer: reembedPhotosIntoBuffer,
    getEditorPhotos: function () { return editorPhotos && editorPhotos.bySheet; },
    showPhotoForSheet: showPhotoForSheet,
    printActiveSheetWithPhoto: printActiveSheetWithPhoto
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 0);
  setTimeout(boot, 50);
  setTimeout(boot, 250);
  setTimeout(boot, 1000);
})(typeof window !== 'undefined' ? window : this);
