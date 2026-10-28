/* Prepline sheet builder / editor (MIT x-spreadsheet + hot-formula-parser).
 * - Build in-app OR open upload
 * - After .xlsx/.xls upload: "Edit before sorting" preserves fills/fonts/text/formulas
 * - After PDF parse: show extracted rows in grid (no PDF binary edit); edits feed parser/print
 */
(function (root) {
  'use strict';

  var grid = null;
  var mode = null; // 'xlsx-edit' | 'pdf-rows' | 'blank'
  var pending = null; // { type, fileName, wb, rows, meta }

  function ensureCss() {
    if (document.getElementById('sbStyles')) return;
    var s = document.createElement('style');
    s.id = 'sbStyles';
    s.textContent = [
      '#sbPanel{position:fixed;inset:0;z-index:9300;background:#EDEAE2;display:none;flex-direction:column}',
      '#sbPanel.open{display:flex}',
      '#sbTop{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 14px;background:#F7F4EC;border-bottom:1px solid #D9D3C4}',
      '#sbTop h2{margin:0;font-family:Fraunces,serif;font-size:18px;flex:1}',
      '#sbTop button{font:inherit;padding:7px 12px;border-radius:8px;border:1px solid #C9C2B0;background:#fff;cursor:pointer}',
      '#sbTop button.primary{background:#1C1E1B;color:#F7F4EC;border-color:#1C1E1B}',
      '#sbHint{font-size:12px;color:#5C5A52;padding:6px 14px}',
      '#sbGrid{flex:1;min-height:0;background:#fff}',
      '#sbChoice{position:fixed;inset:0;z-index:9350;background:rgba(28,30,27,.4);display:none;align-items:center;justify-content:center;padding:20px}',
      '#sbChoice.open{display:flex}',
      '#sbChoice .box{background:#F7F4EC;border-radius:14px;padding:20px;max-width:480px;width:100%;border:1px solid #D9D3C4;box-shadow:0 16px 40px rgba(0,0,0,.2)}',
      '#sbChoice h3{margin:0 0 8px;font-family:Fraunces,serif}',
      '#sbChoice p{font-size:13px;color:#5C5A52;margin:0 0 14px}',
      '#sbChoice button{display:block;width:100%;margin:6px 0;padding:10px 12px;border-radius:8px;border:1px solid #C9C2B0;background:#fff;font:inherit;cursor:pointer;text-align:left}',
      '#sbChoice button.primary{background:#1C1E1B;color:#F7F4EC;border-color:#1C1E1B}',
      '.x-spreadsheet{height:100%!important}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function ensureDom() {
    ensureCss();
    if (!document.getElementById('sbPanel')) {
      var p = document.createElement('div');
      p.id = 'sbPanel';
      p.innerHTML = '<div id="sbTop"><h2 id="sbTitle">Sheet editor</h2>' +
        '<button type="button" class="primary" id="sbSort">Sort / prep list →</button>' +
        '<button type="button" id="sbSaveXlsx">Save .xlsx</button>' +
        '<button type="button" id="sbClose">Close</button></div>' +
        '<div id="sbHint"></div><div id="sbGrid"></div>';
      document.body.appendChild(p);
      document.getElementById('sbClose').onclick = close;
      document.getElementById('sbSort').onclick = feedToParser;
      document.getElementById('sbSaveXlsx').onclick = downloadXlsx;
    }
    if (!document.getElementById('sbChoice')) {
      var c = document.createElement('div');
      c.id = 'sbChoice';
      c.innerHTML = '<div class="box"><h3 id="sbChoiceTitle">Spreadsheet ready</h3><p id="sbChoiceBody"></p>' +
        '<button type="button" class="primary" id="sbEditFirst">✏️ Edit before sorting</button>' +
        '<button type="button" id="sbSortNow">Sort now (skip edit)</button>' +
        '<button type="button" id="sbChoiceCancel">Cancel</button></div>';
      document.body.appendChild(c);
      document.getElementById('sbChoiceCancel').onclick = function () { c.classList.remove('open'); pending = null; };
      document.getElementById('sbEditFirst').onclick = function () { c.classList.remove('open'); openPendingEdit(); };
      document.getElementById('sbSortNow').onclick = function () { c.classList.remove('open'); sortPendingNow(); };
    }
  }

  function formulaEngine() {
    // Prefer hot-formula-parser (MIT). x-spreadsheet also has built-in formula helpers.
    if (root.formulaParser && root.formulaParser.Parser) return new root.formulaParser.Parser();
    if (root.FormulaParser) return new root.FormulaParser();
    return null;
  }

  function destroyGrid() {
    var host = document.getElementById('sbGrid');
    if (host) host.innerHTML = '';
    grid = null;
  }

  function openGrid(rows, opts) {
    ensureDom();
    destroyGrid();
    opts = opts || {};
    mode = opts.mode || 'blank';
    document.getElementById('sbTitle').textContent = opts.title || 'Sheet editor';
    document.getElementById('sbHint').textContent = opts.hint || 'Edit cells, colours and formulas, then Sort / prep list.';
    document.getElementById('sbPanel').classList.add('open');
    document.body.classList.add('sb-open');

    if (typeof root.x_spreadsheet !== 'function') {
      document.getElementById('sbHint').textContent = 'Grid library failed to load.';
      return;
    }

    var cols = opts.cols || 12;
    var rowCount = Math.max(rows.length + 5, 30);
    var dataRows = [];
    for (var r = 0; r < rowCount; r++) {
      var cells = {};
      var src = rows[r] || [];
      for (var c = 0; c < Math.max(cols, src.length); c++) {
        var cell = src[c];
        if (cell == null || cell === '') continue;
        if (typeof cell === 'object') {
          var o = { text: cell.text != null ? String(cell.text) : '' };
          if (cell.formula) o.text = cell.formula.charAt(0) === '=' ? cell.formula : ('=' + cell.formula);
          if (cell.style) o.style = cell.style;
          cells[c] = o;
        } else {
          cells[c] = { text: String(cell) };
        }
      }
      dataRows.push({ cells: cells });
    }

    // style map: x-spreadsheet styles are indexes into styles array
    var styles = opts.styles || [
      {}, // 0
      { bgcolor: '#C6EFCE', color: '#006100' }, // veg-ish
      { bgcolor: '#FFEB9C', color: '#9C5700' },
      { bgcolor: '#FFC7CE', color: '#9C0006' },
      { bgcolor: '#BDD7EE', color: '#1F4E79' },
      { bgcolor: '#E2D5F1', color: '#5B2C6F' },
      { bold: true },
      { italic: true }
    ];

    grid = root.x_spreadsheet('#sbGrid', {
      mode: 'edit',
      showToolbar: true,
      showGrid: true,
      showContextmenu: true,
      view: {
        height: function () { return Math.max(320, window.innerHeight - 110); },
        width: function () { return Math.max(480, window.innerWidth - 8); }
      }
    });
    grid.loadData([{ name: opts.sheetName || 'Prep', styles: styles, rows: dataRows }]);

    // Optional recalculation pass with hot-formula-parser when cell changes
    var parser = formulaEngine();
    if (parser && grid.on) {
      grid.change(function () { /* x-spreadsheet evaluates many formulas itself */ });
    }
  }

  function getAoA() {
    if (!grid) return [];
    var d = grid.getData();
    var sheet = Array.isArray(d) ? d[0] : d;
    if (!sheet) return [];
    var rowsObj = sheet.rows || {};
    var maxR = 0, maxC = 0;
    Object.keys(rowsObj).forEach(function (rk) {
      if (rk === 'len') return;
      var ri = +rk; if (!Number.isFinite(ri)) return;
      maxR = Math.max(maxR, ri);
      var cells = (rowsObj[rk] && rowsObj[rk].cells) || {};
      Object.keys(cells).forEach(function (ck) {
        var ci = +ck; if (Number.isFinite(ci)) maxC = Math.max(maxC, ci);
      });
    });
    var aoa = [];
    for (var r = 0; r <= maxR; r++) {
      var row = [];
      var cells = (rowsObj[r] && rowsObj[r].cells) || {};
      for (var c = 0; c <= maxC; c++) {
        var cell = cells[c];
        if (!cell) { row.push(null); continue; }
        var text = cell.text != null ? cell.text : '';
        // Prefer computed display if present
        if (cell.value != null && String(text).charAt(0) === '=') row.push(cell.value);
        else row.push(text === '' ? null : text);
      }
      aoa.push(row);
    }
    return aoa;
  }

  function getStyledSheetForXlsx() {
    // Build a SheetJS-compatible workbook preserving fills where we can map styles
    if (typeof XLSX === 'undefined') throw new Error('XLSX missing');
    var d = grid.getData();
    var sheet = Array.isArray(d) ? d[0] : d;
    var styles = (sheet && sheet.styles) || [];
    var rowsObj = (sheet && sheet.rows) || {};
    var aoa = getAoA();
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    // Attach minimal cell styles from bgcolor so the SAME colour-legend path can see fills
    Object.keys(rowsObj).forEach(function (rk) {
      if (rk === 'len') return;
      var ri = +rk; if (!Number.isFinite(ri)) return;
      var cells = (rowsObj[rk] && rowsObj[rk].cells) || {};
      Object.keys(cells).forEach(function (ck) {
        var ci = +ck; if (!Number.isFinite(ci)) return;
        var cell = cells[ck];
        var addr = XLSX.utils.encode_cell({ r: ri, c: ci });
        if (!ws[addr]) ws[addr] = { t: 's', v: cell.text || '' };
        // formulas
        var t = String(cell.text || '');
        if (t.charAt(0) === '=') {
          ws[addr].f = t.slice(1);
          if (cell.value != null) ws[addr].v = cell.value;
          ws[addr].t = typeof cell.value === 'number' ? 'n' : 's';
        }
        var st = styles[cell.style];
        if (st && st.bgcolor) {
          var hex = String(st.bgcolor).replace(/^#/, '').toUpperCase();
          if (hex.length === 6) {
            ws[addr].s = ws[addr].s || {};
            ws[addr].s.fgColor = { rgb: 'FF' + hex };
            ws[addr].s.fill = { fgColor: { rgb: 'FF' + hex }, patternType: 'solid' };
          }
        }
        if (st && st.bold) { ws[addr].s = ws[addr].s || {}; ws[addr].s.font = Object.assign({}, ws[addr].s.font || {}, { bold: true }); }
        if (st && st.color) {
          var fc = String(st.color).replace(/^#/, '').toUpperCase();
          ws[addr].s = ws[addr].s || {};
          ws[addr].s.font = Object.assign({}, ws[addr].s.font || {}, { color: { rgb: 'FF' + fc } });
        }
      });
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (sheet && sheet.name) || 'Prep');
    return wb;
  }

  function close() {
    document.getElementById('sbPanel').classList.remove('open');
    document.body.classList.remove('sb-open');
    destroyGrid();
    pending = null;
  }

  function downloadXlsx() {
    try {
      var wb = getStyledSheetForXlsx();
      XLSX.writeFile(wb, (pending && pending.fileName ? pending.fileName.replace(/\.(xlsx|xls|csv)$/i, '') : 'prepline-sheet') + '-edited.xlsx');
    } catch (e) { alert('Save failed: ' + (e.message || e)); }
  }

  function feedToParser() {
    try {
      if (mode === 'pdf-rows') {
        feedPdfRows();
        return;
      }
      var wb = getStyledSheetForXlsx();
      var fname = (pending && pending.fileName) || 'edited.xlsx';
      close();
      // 4.4.3: feed the in-memory styled workbook directly — never rewrite through
      // community SheetJS (that path drops every fill, so colour legend sorting dies).
      if (typeof handleWorkbookObject === 'function') {
        handleWorkbookObject(wb, fname);
      } else if (typeof processWorkbook === 'function') {
        // Last resort: still prefer in-memory process if bridge missing
        try {
          if (typeof ROWS !== 'undefined') root.ROWS = [];
          processWorkbook(wb);
          if (typeof renderApp === 'function') renderApp();
          else if (typeof render === 'function') render();
        } catch (e2) {
          ingestWorkbook(wb, fname);
        }
      } else {
        ingestWorkbook(wb, fname);
      }
    } catch (e) {
      alert('Could not feed sheet to sorter: ' + (e.message || e));
    }
  }

  function ingestWorkbook(wb, name) {
    try {
      var outBytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true });
      var file = new File([outBytes], name || 'edited.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var B = window.__preplineBridge;
      // Prefer original handleFile (same parser path) — bypass edit-before-sorting re-prompt
      if (B && typeof B.handleFileRaw === 'function') {
        // Temporarily call through unbound original if wrapped
        if (_origHandleFile) _origHandleFile(file);
        else B.handleFileRaw(file);
        return;
      }
      if (_origHandleFile) { _origHandleFile(file); return; }
      throw new Error('No handleFile bridge');
    } catch (err) {
      alert('Edited sheet failed: ' + (err && err.message ? err.message : err));
    }
  }

  function feedPdfRows() {
    // Convert structured grid back into ROWS-like items then let existing render path run
    var aoa = getAoA();
    if (!aoa.length) { alert('Nothing to sort'); return; }
    // Expect header: dish | task/item | qty | unit | section | date | pax | prepCat
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
    for (var r = 1; r < aoa.length; r++) {
      var row = aoa[r] || [];
      var item = row[iItem]; if (item == null || String(item).trim() === '') continue;
      var dish = iDish >= 0 && row[iDish] != null ? String(row[iDish]).trim() : 'PDF list';
      var qty = iQty >= 0 ? row[iQty] : '';
      var unit = iUnit >= 0 ? row[iUnit] : '';
      var sec = iSec >= 0 ? row[iSec] : '';
      var cat = iCat >= 0 ? String(row[iCat] || '') : '';
      var pax = iPax >= 0 ? Number(row[iPax]) : NaN;
      if (Number.isFinite(pax) && pax > 0) B.setPax(dish, pax);
      if (iDate >= 0 && row[iDate]) B.setDate(dish, String(row[iDate]));
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

  /** Convert SheetJS workbook → grid rows preserving fills/fonts/formulas */
  function wbToGridRows(wb) {
    var name = wb.SheetNames[0];
    var ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) return { rows: [], styles: [], sheetName: name };
    var range = XLSX.utils.decode_range(ws['!ref']);
    range.e.r = Math.min(range.e.r, 200);
    range.e.c = Math.min(range.e.c, 20);
    var styleIndex = {};
    var styles = [{}];
    function styleFor(cell) {
      if (!cell || !cell.s) return undefined;
      var bg = '';
      var st = cell.s;
      var fg = st.fgColor || (st.fill && st.fill.fgColor) || {};
      if (fg.rgb) bg = '#' + String(fg.rgb).replace(/^FF/i, '').slice(-6);
      var bold = !!(st.font && st.font.bold);
      var color = st.font && st.font.color && st.font.color.rgb ? ('#' + String(st.font.color.rgb).replace(/^FF/i, '').slice(-6)) : '';
      var key = bg + '|' + bold + '|' + color;
      if (styleIndex[key] != null) return styleIndex[key];
      var obj = {};
      if (bg) obj.bgcolor = bg;
      if (bold) obj.bold = true;
      if (color) obj.color = color;
      styles.push(obj);
      styleIndex[key] = styles.length - 1;
      return styles.length - 1;
    }
    var rows = [];
    for (var r = range.s.r; r <= range.e.r; r++) {
      var row = [];
      for (var c = range.s.c; c <= range.e.c; c++) {
        var addr = XLSX.utils.encode_cell({ r: r, c: c });
        var cell = ws[addr];
        if (!cell) { row.push(null); continue; }
        var o = { text: cell.w != null ? cell.w : (cell.v != null ? String(cell.v) : '') };
        if (cell.f) o.formula = '=' + cell.f;
        var si = styleFor(cell);
        if (si != null) o.style = si;
        row.push(o);
      }
      rows.push(row);
    }
    return { rows: rows, styles: styles, sheetName: name };
  }

  function offerEditBeforeSort(file, arrayBuffer) {
    ensureDom();
    var data = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
    var wb = XLSX.read(data, { type: 'array', cellDates: false, sheetStubs: false, cellStyles: true });
    pending = { type: 'xlsx', fileName: file.name, wb: wb, bytes: data };
    document.getElementById('sbChoiceTitle').textContent = 'Spreadsheet ready';
    document.getElementById('sbChoiceBody').textContent = '"' + file.name + '" — edit fills, fonts, wording and formulas in the grid first, or sort straight away. Edited sheet uses the same colour-aware parser.';
    document.getElementById('sbChoice').classList.add('open');
  }

  function openPendingEdit() {
    if (!pending || pending.type !== 'xlsx') return;
    var g = wbToGridRows(pending.wb);
    openGrid(g.rows, {
      mode: 'xlsx-edit',
      title: 'Edit before sorting — ' + pending.fileName,
      hint: 'Colours, fonts, wording and formulas are preserved. Change a fill or formula, then Sort / prep list.',
      styles: g.styles,
      sheetName: g.sheetName,
      cols: 16
    });
  }

  function sortPendingNow() {
    if (!pending) return;
    if (pending.type === 'xlsx') {
      var name = pending.fileName;
      var bytes = pending.bytes;
      var wb = pending.wb;
      pending = null;
      // 4.4.3: use the ORIGINAL upload bytes so community SheetJS write cannot strip fills.
      // Falling back to in-memory wb via handleWorkbookObject (keeps .s) if bytes missing.
      if (bytes) {
        var file = new File([bytes], name || 'upload.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        if (_origHandleFile) { _origHandleFile(file); return; }
        var B = window.__preplineBridge;
        if (B && typeof B.handleFileRaw === 'function') { B.handleFileRaw(file); return; }
      }
      if (typeof handleWorkbookObject === 'function' && wb) {
        handleWorkbookObject(wb, name);
        return;
      }
      ingestWorkbook(wb, name);
    }
  }

  function openBlankTemplate() {
    var styles = [
      {},
      { bgcolor: '#C6EFCE', color: '#006100' },
      { bgcolor: '#FFEB9C', color: '#9C5700' },
      { bgcolor: '#FFC7CE', color: '#9C0006' },
      { bgcolor: '#BDD7EE', color: '#1F4E79' },
      { bold: true }
    ];
    var rows = [
      [{ text: 'Item', style: 5 }, { text: 'Qty/pax', style: 5 }, { text: 'Unit', style: 5 }, { text: 'Section', style: 5 }, { text: 'PAX', style: 5 }, { text: 'Total', style: 5 }],
      [{ text: 'Roasted pumpkin puree', style: 1 }, { text: '0.04' }, { text: 'kg' }, { text: 'Hot' }, { text: '100' }, { text: '=B2*E2', formula: '=B2*E2' }],
      [{ text: 'Micro herbs', style: 2 }, { text: '2' }, { text: 'g' }, { text: 'Garnish' }, { text: '100' }, { text: '=B3*E3', formula: '=B3*E3' }],
      [{ text: 'Chicken breast', style: 3 }, { text: '0.18' }, { text: 'kg' }, { text: 'Hot' }, { text: '100' }, { text: '=B4*E4', formula: '=B4*E4' }],
      [{ text: 'Colour legend', style: 5 }, { text: 'Vegetables', style: 1 }, { text: 'Gels and purees', style: 2 }, { text: 'Poultry', style: 3 }, { text: 'Seafood', style: 4 }]
    ];
    // Put dish title / BAT style header
    var header = [
      [{ text: 'SAMPLE DISH — Garden puree', style: 5 }, null, null, null, { text: 'BAT' }, { text: '28/10/2026' }],
      [{ text: 'PAX' }, { text: '100' }],
      []
    ];
    openGrid(header.concat(rows), {
      mode: 'blank',
      title: 'Build a prep sheet',
      hint: 'Starter template with fills and a Total formula. Edit, then Sort / prep list (same parser as upload).',
      styles: styles,
      sheetName: 'Garden puree',
      cols: 10
    });
    pending = { type: 'xlsx', fileName: 'prepline-starter.xlsx' };
  }

  /** After PDF parse: show structured rows for editing (no PDF binary editing). */
  function offerPdfRowEdit(extractedRows, meta) {
    ensureDom();
    meta = meta || {};
    var header = [
      { text: 'Dish', style: 5 }, { text: 'Item', style: 5 }, { text: 'Qty', style: 5 }, { text: 'Unit', style: 5 },
      { text: 'Section', style: 5 }, { text: 'Date', style: 5 }, { text: 'Pax', style: 5 }, { text: 'Category', style: 5 }
    ];
    var rows = [header].concat((extractedRows || []).map(function (r) {
      return [
        r.dish || r.menu || '',
        r.task || r.item || r.name || '',
        r.qty != null ? r.qty : (r.quantity != null ? r.quantity : ''),
        r.unit || '',
        r.section || '',
        r.date || r.eventDate || '',
        r.pax != null ? r.pax : '',
        r.prepCat || r.category || ''
      ];
    }));
    pending = { type: 'pdf-rows', fileName: meta.name || 'pdf-extract', rows: extractedRows };
    openGrid(rows, {
      mode: 'pdf-rows',
      title: 'Edit PDF extract — ' + (meta.name || 'PDF'),
      hint: 'PDF pages are not edited. Change the extracted rows here; Sort feeds the same prep-list path.',
      styles: [{}, { bgcolor: '#C6EFCE' }, { bgcolor: '#FFEB9C' }, { bgcolor: '#FFC7CE' }, { bgcolor: '#BDD7EE' }, { bold: true }],
      sheetName: 'Extract',
      cols: 8
    });
  }

  // Intercept xlsx uploads: offer edit-before-sorting
  var _origHandleFile = null;
  function installUploadHook() {
    ensureDom();
    if (window.__sbHooked) return;
    window.__sbHooked = true;
    // Wrap handleFile when available
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
          return _origHandleFile(file);
        };
        window.handleFile.__sb = true;
        return;
      }
      if (++tries < 50) setTimeout(wait, 100);
    })();
  }

  function wireBuilderButton() {
    var btn = document.getElementById('openBuilderBtn');
    if (!btn || btn.__sb) return;
    btn.__sb = true;
    // Keep existing builder; add sibling for grid editor
    var gridBtn = document.createElement('button');
    gridBtn.type = 'button';
    gridBtn.className = 'secondary';
    gridBtn.id = 'openSheetGridBtn';
    gridBtn.textContent = '▦ Sheet editor';
    gridBtn.title = 'Excel-style grid (fills, fonts, formulas) — same sorter as upload';
    gridBtn.onclick = openBlankTemplate;
    btn.parentNode.insertBefore(gridBtn, btn.nextSibling);
  }

  root.PreplineSheet = {
    openBlankTemplate: openBlankTemplate,
    offerEditBeforeSort: offerEditBeforeSort,
    offerPdfRowEdit: offerPdfRowEdit,
    openPendingEdit: openPendingEdit,
    close: close,
    getAoA: getAoA,
    ingestWorkbook: ingestWorkbook
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
