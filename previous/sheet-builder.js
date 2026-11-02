/* Prepline full sheet editor — Univer OSS (Apache-2.0, self-hosted) + LuckyExcel MIT.
 * Replaces the limited x-spreadsheet grid.
 * - Open uploaded xlsx/xls/csv with tabs, fills, merges, fonts, borders, formulas
 * - Edit, insert/delete rows/cols/sheets, sort/filter, find/replace, undo/redo, freeze
 * - Export .xlsx preserving fills; Sort into preplist feeds handleWorkbookObject / parser
 * - New blank sheet; mobile-usable height
 * - PDF extracted rows also open here (see pdf-editor.js for binary PDF tools)
 */
(function (root) {
  'use strict';

  var editor = null; // { univer, univerAPI, dispose }
  var mode = null; // 'xlsx-edit' | 'pdf-rows' | 'blank'
  var pending = null;
  var libsPromise = null;
  var _origHandleFile = null;

  function ensureCss() {
    if (document.getElementById('sbStyles')) return;
    var s = document.createElement('style');
    s.id = 'sbStyles';
    s.textContent = [
      '#sbPanel{position:fixed;inset:0;z-index:9300;background:#EDEAE2;display:none;flex-direction:column}',
      '#sbPanel.open{display:flex}',
      '#sbTop{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 14px;background:#F7F4EC;border-bottom:1px solid #D9D3C4;flex-shrink:0}',
      '#sbTop h2{margin:0;font-family:Fraunces,serif;font-size:18px;flex:1;min-width:140px}',
      '#sbTop button{font:inherit;padding:7px 12px;border-radius:8px;border:1px solid #C9C2B0;background:#fff;cursor:pointer}',
      '#sbTop button.primary{background:#1C1E1B;color:#F7F4EC;border-color:#1C1E1B}',
      '#sbTop button:disabled{opacity:.5;cursor:wait}',
      '#sbHint{font-size:12px;color:#5C5A52;padding:6px 14px;flex-shrink:0}',
      '#sbGrid{flex:1;min-height:0;background:#fff;position:relative}',
      '#sbGrid .univer-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#fff;color:#5C5A52;font-size:14px;z-index:2}',
      '#sbChoice{position:fixed;inset:0;z-index:9350;background:rgba(28,30,27,.4);display:none;align-items:center;justify-content:center;padding:20px}',
      '#sbChoice.open{display:flex}',
      '#sbChoice .box{background:#F7F4EC;border-radius:14px;padding:20px;max-width:520px;width:100%;border:1px solid #D9D3C4;box-shadow:0 16px 40px rgba(0,0,0,.2)}',
      '#sbChoice h3{margin:0 0 8px;font-family:Fraunces,serif}',
      '#sbChoice p{font-size:13px;color:#5C5A52;margin:0 0 14px}',
      '#sbChoice button{display:block;width:100%;margin:6px 0;padding:10px 12px;border-radius:8px;border:1px solid #C9C2B0;background:#fff;font:inherit;cursor:pointer;text-align:left}',
      '#sbChoice button.primary{background:#1C1E1B;color:#F7F4EC;border-color:#1C1E1B}',
      'body.sb-open{overflow:hidden}',
      '@media (max-width:720px){#sbTop{padding:8px}#sbTop h2{font-size:15px}#sbTop button{padding:8px 10px;font-size:13px}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function ensureDom() {
    ensureCss();
    if (!document.getElementById('sbPanel')) {
      var p = document.createElement('div');
      p.id = 'sbPanel';
      p.innerHTML = '<div id="sbTop"><h2 id="sbTitle">Sheet editor</h2>' +
        '<button type="button" id="sbOpen">Open…</button>' +
        '<button type="button" class="primary" id="sbSort">Sort into preplist →</button>' +
        '<button type="button" id="sbSaveXlsx">Save .xlsx</button>' +
        '<button type="button" id="sbClose">Close</button>' +
        '<input type="file" id="sbFileInput" accept=".xlsx,.xls,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden></div>' +
        '<div id="sbHint"></div><div id="sbGrid"><div class="univer-loading">Loading spreadsheet engine…</div></div>';
      document.body.appendChild(p);
      document.getElementById('sbClose').onclick = close;
      document.getElementById('sbSort').onclick = feedToParser;
      document.getElementById('sbSaveXlsx').onclick = downloadXlsx;
      document.getElementById('sbOpen').onclick = function () { document.getElementById('sbFileInput').click(); };
      document.getElementById('sbFileInput').onchange = function (e) {
        var f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        pending = { type: 'xlsx', fileName: f.name, file: f };
        var reader = new FileReader();
        reader.onload = function (ev) {
          pending.bytes = ev.target.result;
          openPendingEdit();
        };
        reader.readAsArrayBuffer(f);
      };
    }
    if (!document.getElementById('sbChoice')) {
      var c = document.createElement('div');
      c.id = 'sbChoice';
      c.innerHTML = '<div class="box"><h3 id="sbChoiceTitle">Spreadsheet ready</h3><p id="sbChoiceBody"></p>' +
        '<button type="button" class="primary" id="sbEditFirst">✏️ Edit in full spreadsheet</button>' +
        '<button type="button" id="sbSortNow">Sort now (skip edit)</button>' +
        '<button type="button" id="sbChoiceCancel">Cancel</button></div>';
      document.body.appendChild(c);
      document.getElementById('sbChoiceCancel').onclick = function () { c.classList.remove('open'); pending = null; };
      document.getElementById('sbEditFirst').onclick = function () { c.classList.remove('open'); openPendingEdit(); };
      document.getElementById('sbSortNow').onclick = function () { c.classList.remove('open'); sortPendingNow(); };
    }
  }

  function scriptBase() {
    // Resolve relative to this page (works on /prepline-trial-preview/ and local file serves)
    var base = document.querySelector('base');
    if (base && base.href) return base.href.replace(/\/?$/, '/');
    var path = location.pathname || '/';
    if (path.endsWith('/')) return path;
    return path.replace(/[^/]+$/, '');
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-sb-src="' + src + '"]');
      if (existing) {
        if (existing.getAttribute('data-loaded') === '1') return resolve();
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', function () { reject(new Error('Failed ' + src)); });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.setAttribute('data-sb-src', src);
      s.onload = function () { s.setAttribute('data-loaded', '1'); resolve(); };
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function loadCss(href) {
    if (document.querySelector('link[data-sb-href="' + href + '"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.setAttribute('data-sb-href', href);
    document.head.appendChild(l);
  }

  function ensureLibs() {
    if (libsPromise) return libsPromise;
    var base = scriptBase();
    loadCss(base + 'vendor/univer/prepline-univer.css');
    libsPromise = loadScript(base + 'vendor/luckyexcel/luckyexcel.umd.js')
      .then(function () { return loadScript(base + 'vendor/univer/prepline-univer.js'); })
      .then(function () {
        if (!root.PreplineUniver || typeof root.PreplineUniver.createSheetEditor !== 'function') {
          throw new Error('Univer bundle missing createSheetEditor');
        }
        if (!root.LuckyExcel) throw new Error('LuckyExcel missing');
      });
    return libsPromise;
  }

  function destroyEditor() {
    var host = document.getElementById('sbGrid');
    var ed = editor;
    editor = null;
    // Detach host content first so Univer's dispose cannot hit a removeChild race
    if (host) {
      try { while (host.firstChild) host.removeChild(host.firstChild); } catch (e0) { host.innerHTML = ''; }
    }
    if (ed && typeof ed.dispose === 'function') {
      try { ed.dispose(); } catch (e) {}
    }
    if (host) host.innerHTML = '<div class="univer-loading">Loading spreadsheet engine…</div>';
  }

  function setBusy(busy, msg) {
    ['sbSort', 'sbSaveXlsx', 'sbClose'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.disabled = !!busy;
    });
    var hint = document.getElementById('sbHint');
    if (hint && msg) hint.textContent = msg;
  }

  function blankWorkbookData() {
    return {
      id: 'prepline-blank',
      name: 'Prep sheet',
      appVersion: '0.10.10',
      sheets: {
        'sheet-1': {
          id: 'sheet-1',
          name: 'Prep',
          rowCount: 100,
          columnCount: 20,
          cellData: {
            0: {
              0: { v: 'SAMPLE DISH — Garden puree', s: { bl: 1 } },
              4: { v: 'BAT' },
              5: { v: '11/11/2026' }
            },
            1: { 0: { v: 'PAX' }, 1: { v: 100, t: 2 } },
            3: {
              0: { v: 'Item', s: { bl: 1 } },
              1: { v: 'Qty/pax', s: { bl: 1 } },
              2: { v: 'Unit', s: { bl: 1 } },
              3: { v: 'Section', s: { bl: 1 } },
              4: { v: 'PAX', s: { bl: 1 } },
              5: { v: 'Total', s: { bl: 1 } }
            },
            4: {
              0: { v: 'Roasted pumpkin puree', s: { bg: { rgb: '#C6EFCE' } } },
              1: { v: 0.04, t: 2 },
              2: { v: 'kg' },
              3: { v: 'Hot' },
              4: { v: 100, t: 2 },
              5: { v: 4, t: 2 }
            },
            5: {
              0: { v: 'Chicken breast', s: { bg: { rgb: '#FFC7CE' } } },
              1: { v: 0.18, t: 2 },
              2: { v: 'kg' },
              3: { v: 'Hot' },
              4: { v: 100, t: 2 },
              5: { v: 18, t: 2 }
            },
            6: {
              0: { v: 'Micro herbs', s: { bg: { rgb: '#FCE4D6' } } },
              1: { v: 2, t: 2 },
              2: { v: 'g' },
              3: { v: 'Garnish' },
              4: { v: 100, t: 2 },
              5: { v: 200, t: 2 }
            },
            7: {
              0: { v: 'Potato puree', s: { bg: { rgb: '#FFEB9C' } } },
              1: { v: 0.08, t: 2 },
              2: { v: 'kg' },
              3: { v: 'Hot' },
              4: { v: 100, t: 2 },
              5: { v: 8, t: 2 }
            },
            10: {
              0: { v: 'Colour legend', s: { bl: 1 } },
              1: { v: 'Vege', s: { bg: { rgb: '#C6EFCE' } } },
              2: { v: 'Protein', s: { bg: { rgb: '#FFC7CE' } } },
              3: { v: 'Starch', s: { bg: { rgb: '#FFEB9C' } } },
              4: { v: 'Garnish', s: { bg: { rgb: '#FCE4D6' } } },
              5: { v: 'Sauce/gels', s: { bg: { rgb: '#BDD7EE' } } }
            }
          }
        }
      },
      sheetOrder: ['sheet-1']
    };
  }

  function pdfRowsToWorkbookData(extractedRows) {
    var cellData = {
      0: {
        0: { v: 'Dish', s: { bl: 1 } },
        1: { v: 'Item', s: { bl: 1 } },
        2: { v: 'Qty', s: { bl: 1 } },
        3: { v: 'Unit', s: { bl: 1 } },
        4: { v: 'Section', s: { bl: 1 } },
        5: { v: 'Date', s: { bl: 1 } },
        6: { v: 'Pax', s: { bl: 1 } },
        7: { v: 'Category', s: { bl: 1 } }
      }
    };
    (extractedRows || []).forEach(function (r, i) {
      var row = i + 1;
      cellData[row] = {
        0: { v: r.dish || r.menu || '' },
        1: { v: r.task || r.item || r.name || '' },
        2: { v: r.qty != null ? r.qty : (r.quantity != null ? r.quantity : '') },
        3: { v: r.unit || '' },
        4: { v: r.section || '' },
        5: { v: r.date || r.eventDate || '' },
        6: { v: r.pax != null ? r.pax : '' },
        7: { v: r.prepCat || r.category || '' }
      };
    });
    return {
      id: 'prepline-pdf-rows',
      name: 'PDF extract',
      appVersion: '0.10.10',
      sheets: {
        'sheet-1': {
          id: 'sheet-1',
          name: 'Extract',
          rowCount: Math.max(80, (extractedRows || []).length + 20),
          columnCount: 12,
          cellData: cellData
        }
      },
      sheetOrder: ['sheet-1']
    };
  }

  function fileToUniverData(fileOrBuffer, fileName) {
    return new Promise(function (resolve, reject) {
      var Lucky = root.LuckyExcel;
      if (!Lucky || typeof Lucky.transformExcelToUniver !== 'function') {
        reject(new Error('LuckyExcel.transformExcelToUniver missing'));
        return;
      }
      var file = fileOrBuffer;
      if (!(file instanceof File) && !(file instanceof Blob)) {
        file = new File([fileOrBuffer], fileName || 'sheet.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
      } else if (file instanceof Blob && !(file instanceof File)) {
        file = new File([file], fileName || 'sheet.xlsx', { type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }
      // CSV: LuckyExcel may support transformCsvToUniver
      var name = (file.name || fileName || '').toLowerCase();
      if (name.endsWith('.csv') && typeof Lucky.transformCsvToUniver === 'function') {
        Lucky.transformCsvToUniver(file, function (data) { resolve(data); }, function (err) { reject(err || new Error('CSV import failed')); });
        return;
      }
      Lucky.transformExcelToUniver(
        file,
        function (data) { resolve(data); },
        function (err) { reject(err || new Error('Excel import failed')); }
      );
    });
  }

  function getSnapshot() {
    if (!editor || !editor.univerAPI) throw new Error('Editor not open');
    var wb = editor.univerAPI.getActiveWorkbook && editor.univerAPI.getActiveWorkbook();
    if (!wb) throw new Error('No active workbook');
    if (typeof wb.save === 'function') return wb.save();
    if (typeof wb.getSnapshot === 'function') return wb.getSnapshot();
    throw new Error('Workbook snapshot API missing');
  }

  function snapshotToXlsxBuffer(snapshot, fileName) {
    return new Promise(function (resolve, reject) {
      var Lucky = root.LuckyExcel;
      if (!Lucky || typeof Lucky.transformUniverToExcel !== 'function') {
        reject(new Error('LuckyExcel.transformUniverToExcel missing'));
        return;
      }
      Lucky.transformUniverToExcel({
        snapshot: snapshot,
        fileName: fileName || 'prepline-edited.xlsx',
        getBuffer: true,
        success: function (buf) { resolve(buf); },
        error: function (err) { reject(err || new Error('Excel export failed')); }
      });
    });
  }

  function openWithData(workbookData, opts) {
    ensureDom();
    destroyEditor();
    opts = opts || {};
    mode = opts.mode || 'blank';
    document.getElementById('sbTitle').textContent = opts.title || 'Sheet editor';
    document.getElementById('sbHint').textContent = opts.hint ||
      'Full spreadsheet: fills, fonts, formulas, freeze, filter, find/replace, multi-sheet. Edit then Sort into preplist (colour legend preserved).';
    var panel = document.getElementById('sbPanel');
    panel.classList.add('open');
    panel.removeAttribute('inert');
    delete panel.dataset.wmInert;
    document.body.classList.add('sb-open');
    var host = document.getElementById('sbGrid');
    host.innerHTML = '<div class="univer-loading">Starting spreadsheet…</div>';

    return ensureLibs().then(function () {
      host.innerHTML = '';
      editor = root.PreplineUniver.createSheetEditor(host, workbookData || {});
      setBusy(false, opts.hint || document.getElementById('sbHint').textContent);
      return editor;
    }).catch(function (err) {
      host.innerHTML = '<div class="univer-loading">Could not start spreadsheet: ' +
        (err && err.message ? err.message : err) + '</div>';
      throw err;
    });
  }

  function close() {
    document.getElementById('sbPanel').classList.remove('open');
    document.body.classList.remove('sb-open');
    destroyEditor();
    pending = null;
  }

  function downloadXlsx() {
    setBusy(true, 'Building .xlsx…');
    Promise.resolve()
      .then(function () { return getSnapshot(); })
      .then(function (snap) {
        var name = (pending && pending.fileName ? pending.fileName.replace(/\.(xlsx|xls|csv)$/i, '') : 'prepline-sheet') + '-edited.xlsx';
        return snapshotToXlsxBuffer(snap, name).then(function (buf) {
          var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = name;
          document.body.appendChild(a);
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        });
      })
      .catch(function (e) { alert('Save failed: ' + (e && e.message ? e.message : e)); })
      .then(function () { setBusy(false); });
  }

  function ingestBuffer(buf, name) {
    var file = new File([buf], name || 'edited.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    // Prefer style-preserving in-memory path
    if (typeof root.handleWorkbookObject === 'function' && typeof XLSX !== 'undefined') {
      try {
        var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        var wb = XLSX.read(u8, { type: 'array', cellDates: false, sheetStubs: false, cellStyles: true });
        root.handleWorkbookObject(wb, name || 'edited.xlsx', u8);
        return;
      } catch (e1) { /* fall through */ }
    }
    if (_origHandleFile) { _origHandleFile(file); return; }
    var B = window.__preplineBridge;
    if (B && typeof B.handleFileRaw === 'function') { B.handleFileRaw(file); return; }
    throw new Error('No handleFile bridge');
  }

  function feedPdfRowsFromSnapshot(snapshot) {
    // Read first sheet cellData into AOA
    var sheets = snapshot.sheets || {};
    var order = snapshot.sheetOrder || Object.keys(sheets);
    var sheet = sheets[order[0]];
    if (!sheet) throw new Error('No sheet');
    var cellData = sheet.cellData || {};
    var maxR = 0, maxC = 0;
    Object.keys(cellData).forEach(function (rk) {
      var ri = +rk; if (!Number.isFinite(ri)) return;
      maxR = Math.max(maxR, ri);
      Object.keys(cellData[rk] || {}).forEach(function (ck) {
        var ci = +ck; if (Number.isFinite(ci)) maxC = Math.max(maxC, ci);
      });
    });
    var aoa = [];
    for (var r = 0; r <= maxR; r++) {
      var row = [];
      for (var c = 0; c <= maxC; c++) {
        var cell = cellData[r] && cellData[r][c];
        if (!cell) { row.push(null); continue; }
        var v = cell.v;
        if (v == null && cell.f) v = cell.f;
        row.push(v == null ? null : v);
      }
      aoa.push(row);
    }
    if (!aoa.length) { alert('Nothing to sort'); return; }
    var header = (aoa[0] || []).map(function (h) { return String(h || '').trim().toLowerCase(); });
    function idx(names) {
      for (var i = 0; i < names.length; i++) {
        var j = header.indexOf(names[i]); if (j >= 0) return j;
      }
      return -1;
    }
    var iDish = idx(['dish', 'dish name', 'menu']);
    var iItem = idx(['item', 'task', 'ingredient', 'product', 'name']);
    var iQty = idx(['qty', 'qty/pax', 'quantity', 'qty per person']);
    var iUnit = idx(['unit', 'uom']);
    var iSec = idx(['section', 'team', 'dept']);
    var iDate = idx(['date', 'event date', 'bat']);
    var iPax = idx(['pax', 'covers', 'guests']);
    var iCat = idx(['category', 'prepcat', 'prep cat', 'type']);
    if (iItem < 0) iItem = 1;
    if (iDish < 0) iDish = 0;

    var B = window.__preplineBridge;
    if (!B) { alert('App bridge missing'); return; }
    B.clearList();
    var newRows = [];
    for (var rr = 1; rr < aoa.length; rr++) {
      var rowv = aoa[rr] || [];
      var item = rowv[iItem]; if (item == null || String(item).trim() === '') continue;
      var dish = iDish >= 0 && rowv[iDish] != null ? String(rowv[iDish]).trim() : 'PDF list';
      var qty = iQty >= 0 ? rowv[iQty] : '';
      var unit = iUnit >= 0 ? rowv[iUnit] : '';
      var sec = iSec >= 0 ? rowv[iSec] : '';
      var cat = iCat >= 0 ? String(rowv[iCat] || '') : '';
      var pax = iPax >= 0 ? Number(rowv[iPax]) : NaN;
      if (Number.isFinite(pax) && pax > 0) B.setPax(dish, pax);
      if (iDate >= 0 && rowv[iDate]) B.setDate(dish, String(rowv[iDate]));
      var pinf = B.prepInfoFor(String(item), null, sec);
      newRows.push({
        dish: dish, task: String(item), qty: qty, unit: unit, section: sec || '',
        prepCat: cat || pinf.prepCat || '', leadDays: pinf.leadDays, prepSrc: pinf.prepSrc || 'edit',
        day: '', stageNum: null, srcType: 'pdf-edit'
      });
    }
    B.setRows(newRows);
    close();
    B.setStatus('Updated ' + newRows.length + ' rows from edited PDF extract.', 'ok');
    B.render();
    B.showOutput('upload');
  }

  function feedToParser() {
    setBusy(true, 'Preparing workbook for sorter…');
    Promise.resolve()
      .then(function () { return getSnapshot(); })
      .then(function (snap) {
        if (mode === 'pdf-rows') {
          feedPdfRowsFromSnapshot(snap);
          return;
        }
        var name = (pending && pending.fileName) || 'edited.xlsx';
        if (!/\.xlsx?$/i.test(name)) name = name.replace(/\.[^.]+$/, '') + '.xlsx';
        return snapshotToXlsxBuffer(snap, name).then(function (buf) {
          close();
          ingestBuffer(buf, name);
        });
      })
      .catch(function (e) {
        alert('Could not feed sheet to sorter: ' + (e && e.message ? e.message : e));
        setBusy(false);
      });
  }

  function offerEditBeforeSort(file, arrayBuffer) {
    ensureDom();
    pending = {
      type: 'xlsx',
      fileName: file.name,
      bytes: arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer),
      file: file
    };
    document.getElementById('sbChoiceTitle').textContent = 'Spreadsheet ready';
    document.getElementById('sbChoiceBody').textContent =
      '"' + file.name + '" — open the full spreadsheet editor (colours, fonts, formulas, freeze, filter, find/replace, every tab) or sort straight away. Edited fills still drive the colour legend.';
    document.getElementById('sbChoice').classList.add('open');
  }

  function openPendingEdit() {
    if (!pending || pending.type !== 'xlsx') return;
    var fileName = pending.fileName;
    var bytes = pending.bytes;
    var file = pending.file || new File([bytes], fileName, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    ensureDom();
    var panel2 = document.getElementById('sbPanel');
    panel2.classList.add('open');
    panel2.removeAttribute('inert');
    delete panel2.dataset.wmInert;
    document.body.classList.add('sb-open');
    document.getElementById('sbTitle').textContent = 'Edit — ' + fileName;
    document.getElementById('sbHint').textContent = 'Loading workbook…';
    document.getElementById('sbGrid').innerHTML = '<div class="univer-loading">Importing spreadsheet (fills preserved)…</div>';
    mode = 'xlsx-edit';
    ensureLibs()
      .then(function () { return fileToUniverData(file, fileName); })
      .then(function (data) {
        return openWithData(data, {
          mode: 'xlsx-edit',
          title: 'Edit — ' + fileName,
          hint: 'All tabs, fills, fonts, formulas. Change a fill or formula, then Sort into preplist (colour legend preserved).'
        });
      })
      .catch(function (err) {
        document.getElementById('sbHint').textContent = 'Import failed: ' + (err && err.message ? err.message : err);
        document.getElementById('sbGrid').innerHTML =
          '<div class="univer-loading">Could not import. Try Sort now from the upload prompt, or a different file.<br>' +
          (err && err.message ? err.message : '') + '</div>';
      });
  }

  function sortPendingNow() {
    if (!pending) return;
    if (pending.type === 'xlsx') {
      var name = pending.fileName;
      var bytes = pending.bytes;
      pending = null;
      try { ingestBuffer(bytes, name); }
      catch (e) {
        if (_origHandleFile && pending === null) {
          _origHandleFile(new File([bytes], name));
        } else {
          alert('Sort failed: ' + (e && e.message ? e.message : e));
        }
      }
    }
  }

  function openBlankTemplate() {
    pending = { type: 'xlsx', fileName: 'prepline-starter.xlsx' };
    openWithData(blankWorkbookData(), {
      mode: 'blank',
      title: 'Build a prep sheet',
      hint: 'Starter template with fills and plain Total values (qty×pax). Edit freely (add sheets, freeze, filter), then Sort into preplist.'
    }).catch(function () {});
  }

  function offerPdfRowEdit(extractedRows, meta) {
    meta = meta || {};
    // If PDF binary editor is available, prefer the combined panel
    if (root.PreplinePdf && typeof root.PreplinePdf.openFromExtract === 'function') {
      root.PreplinePdf.openFromExtract(extractedRows, meta);
      return;
    }
    pending = { type: 'pdf-rows', fileName: meta.name || 'pdf-extract', rows: extractedRows };
    openWithData(pdfRowsToWorkbookData(extractedRows), {
      mode: 'pdf-rows',
      title: 'Edit PDF extract — ' + (meta.name || 'PDF'),
      hint: 'Original PDF text is not reflowable — edit the extracted rows here. Use PDF tools (when open) for highlights/pages. Sort feeds the prep-list path.'
    }).catch(function () {});
  }

  function installUploadHook() {
    ensureDom();
    if (window.__sbHooked) return;
    window.__sbHooked = true;
    var tries = 0;
    (function wait() {
      if (typeof window.handleFile === 'function' && !window.handleFile.__sb) {
        _origHandleFile = window.handleFile;
        window.handleFile = function (file) {
          var n = (file && file.name || '').toLowerCase();
          if (/\.xlsx?$|\.xlsm$|\.csv$/.test(n)) {
            var reader = new FileReader();
            reader.onload = function (ev) {
              try { offerEditBeforeSort(file, ev.target.result); }
              catch (e) { _origHandleFile(file); }
            };
            reader.onerror = function () { _origHandleFile(file); };
            reader.readAsArrayBuffer(file);
            return;
          }
          // Stash PDF bytes for the PDF editor
          if (/\.pdf$/.test(n) && root.PreplinePdf && typeof root.PreplinePdf.stashUpload === 'function') {
            try { root.PreplinePdf.stashUpload(file); } catch (e2) {}
          }
          return _origHandleFile(file);
        };
        window.handleFile.__sb = true;
        return;
      }
      if (++tries < 80) setTimeout(wait, 100);
    })();
  }

  function wireBuilderButton() {
    var btn = document.getElementById('openBuilderBtn');
    if (!btn || btn.__sb) return;
    btn.__sb = true;
    var gridBtn = document.createElement('button');
    gridBtn.type = 'button';
    gridBtn.className = 'secondary';
    gridBtn.id = 'openSheetGridBtn';
    gridBtn.textContent = '▦ Full sheet editor';
    gridBtn.title = 'Excel-style editor (Univer): fills, fonts, formulas, freeze, filter, find/replace — same sorter as upload';
    gridBtn.onclick = openBlankTemplate;
    btn.parentNode.insertBefore(gridBtn, btn.nextSibling);

    var pdfBtn = document.createElement('button');
    pdfBtn.type = 'button';
    pdfBtn.className = 'secondary';
    pdfBtn.id = 'openPdfEditorBtn';
    pdfBtn.textContent = '📄 PDF editor';
    pdfBtn.title = 'Edit a PDF (text, highlight, pages) and its extracted prep rows';
    pdfBtn.onclick = function () {
      if (root.PreplinePdf && typeof root.PreplinePdf.openBlank === 'function') root.PreplinePdf.openBlank();
      else alert('PDF editor still loading — try again in a moment.');
    };
    gridBtn.parentNode.insertBefore(pdfBtn, gridBtn.nextSibling);
  }

  root.PreplineSheet = {
    openBlankTemplate: openBlankTemplate,
    offerEditBeforeSort: offerEditBeforeSort,
    offerPdfRowEdit: offerPdfRowEdit,
    openPendingEdit: openPendingEdit,
    openWithData: openWithData,
    pdfRowsToWorkbookData: pdfRowsToWorkbookData,
    close: close,
    ensureLibs: ensureLibs,
    ingestBuffer: ingestBuffer,
    getSnapshot: function () { return editor ? getSnapshot() : null; },
    getPendingBytes: function () { return pending && pending.bytes ? pending.bytes : null; },
    getPending: function () { return pending; },
    _getEditor: function () { return editor; }
  };

  document.addEventListener('DOMContentLoaded', function () {
    ensureDom();
    installUploadHook();
    wireBuilderButton();
  });
  if (document.readyState !== 'loading') {
    ensureDom();
    installUploadHook();
    wireBuilderButton();
  }
})(window);
