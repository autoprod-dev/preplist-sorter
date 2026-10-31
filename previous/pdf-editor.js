/* Prepline PDF editor — pdf.js viewer + pdf-lib page/annotation tools (MIT, self-hosted).
 * - Add text boxes, highlight, draw/strike
 * - Delete / rotate / reorder pages, merge PDFs, save PDF
 * - Full editable Univer grid of extracted rows → Sort into preplist
 * Inherent limit: original PDF text is not reflowable (glyphs stay where they are;
 *   we add overlays / page ops rather than rewriting flowing text).
 */
(function (root) {
  'use strict';

  var pdfDoc = null; // pdf-lib PDFDocument
  var pdfBytes = null;
  var pdfJsDoc = null;
  var pageIndex = 0; // 0-based
  var tool = 'pan'; // pan | text | highlight | draw | strike
  var strokes = []; // per-page annotation overlays applied on save
  var pendingExtract = null;
  var lastFileName = 'document.pdf';
  var libsPromise = null;
  var drawing = false;
  var currentPath = null;

  function basePath() {
    var path = location.pathname || '/';
    if (path.endsWith('/')) return path;
    return path.replace(/[^/]+$/, '');
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-pe-src="' + src + '"]');
      if (existing) {
        if (existing.getAttribute('data-loaded') === '1') return resolve();
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', function () { reject(new Error('Failed ' + src)); });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.setAttribute('data-pe-src', src);
      s.onload = function () { s.setAttribute('data-loaded', '1'); resolve(); };
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function ensureLibs() {
    if (libsPromise) return libsPromise;
    libsPromise = (async function () {
      if (!root.PDFLib) await loadScript(basePath() + 'vendor/pdf-lib/pdf-lib.min.js');
      if (!root.PDFLib) throw new Error('pdf-lib failed to load');
      // pdf.js may already be on window from index.html
      if (!root.pdfjsLib) {
        // Fallback: dynamic import of local vendor ESM
        try {
          var mod = await import(basePath() + 'vendor/pdf.min.mjs');
          root.pdfjsLib = mod;
          root.pdfjsLib.GlobalWorkerOptions.workerSrc = basePath() + 'vendor/pdf.worker.min.mjs';
        } catch (e) {
          throw new Error('pdf.js not available');
        }
      }
    })();
    return libsPromise;
  }

  function ensureCss() {
    if (document.getElementById('peStyles')) return;
    var s = document.createElement('style');
    s.id = 'peStyles';
    s.textContent = [
      '#pePanel{position:fixed;inset:0;z-index:9400;background:#EDEAE2;display:none;flex-direction:column}',
      '#pePanel.open{display:flex}',
      '#peTop{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 14px;background:#F7F4EC;border-bottom:1px solid #D9D3C4;flex-shrink:0}',
      '#peTop h2{margin:0;font-family:Fraunces,serif;font-size:18px;flex:1;min-width:120px}',
      '#peTop button,#peTools button{font:inherit;padding:7px 10px;border-radius:8px;border:1px solid #C9C2B0;background:#fff;cursor:pointer}',
      '#peTop button.primary{background:#1C1E1B;color:#F7F4EC;border-color:#1C1E1B}',
      '#peTop button.active,#peTools button.active{background:#2F6FED;color:#fff;border-color:#2F6FED}',
      '#peHint{font-size:12px;color:#5C5A52;padding:6px 14px;flex-shrink:0}',
      '#peBody{flex:1;min-height:0;display:flex;gap:0}',
      '#peViewerWrap{flex:1.2;min-width:0;display:flex;flex-direction:column;border-right:1px solid #D9D3C4;background:#C9C2B0}',
      '#peTools{display:flex;gap:6px;flex-wrap:wrap;padding:8px;background:#F7F4EC;border-bottom:1px solid #D9D3C4}',
      '#peCanvasWrap{flex:1;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:16px;position:relative}',
      '#peCanvasWrap canvas{box-shadow:0 8px 24px rgba(0,0,0,.25);background:#fff;max-width:100%;cursor:crosshair}',
      '#peOverlay{position:absolute;left:0;top:0;pointer-events:none}',
      '#peSide{flex:1;min-width:280px;display:flex;flex-direction:column;background:#fff}',
      '#peSideHead{padding:8px 12px;background:#F7F4EC;border-bottom:1px solid #D9D3C4;font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '#peGridHost{flex:1;min-height:0}',
      '#pePageLabel{font-family:IBM Plex Mono,monospace;font-size:12px;margin-left:auto}',
      'body.pe-open{overflow:hidden}',
      '@media (max-width:900px){#peBody{flex-direction:column}#peViewerWrap{flex:none;height:45vh;border-right:none;border-bottom:1px solid #D9D3C4}#peSide{min-height:40vh}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function ensureDom() {
    ensureCss();
    if (document.getElementById('pePanel')) return;
    var p = document.createElement('div');
    p.id = 'pePanel';
    p.innerHTML =
      '<div id="peTop">' +
      '<h2 id="peTitle">PDF editor</h2>' +
      '<button type="button" id="peOpenFile">Open PDF…</button>' +
      '<button type="button" id="peMerge">Merge PDF…</button>' +
      '<button type="button" id="peSave">Save PDF</button>' +
      '<button type="button" class="primary" id="peSort">Sort extract →</button>' +
      '<button type="button" id="peClose">Close</button>' +
      '<input type="file" id="peFileInput" accept=".pdf,application/pdf" hidden>' +
      '<input type="file" id="peMergeInput" accept=".pdf,application/pdf" multiple hidden>' +
      '</div>' +
      '<div id="peHint">Original PDF text is not reflowable — add text boxes, highlights, drawings, or change pages. Edit extracted ingredient rows in the grid (right), then Sort into preplist.</div>' +
      '<div id="peBody">' +
      '  <div id="peViewerWrap">' +
      '    <div id="peTools">' +
      '      <button type="button" data-tool="pan" class="active">Pan</button>' +
      '      <button type="button" data-tool="text">Text</button>' +
      '      <button type="button" data-tool="highlight">Highlight</button>' +
      '      <button type="button" data-tool="draw">Draw</button>' +
      '      <button type="button" data-tool="strike">Strike</button>' +
      '      <button type="button" id="pePrev">◀</button>' +
      '      <button type="button" id="peNext">▶</button>' +
      '      <span id="pePageLabel">—</span>' +
      '      <button type="button" id="peRotL" title="Rotate left">⟲</button>' +
      '      <button type="button" id="peRotR" title="Rotate right">⟳</button>' +
      '      <button type="button" id="peDelPage">Delete page</button>' +
      '      <button type="button" id="peMoveUp">Page ↑</button>' +
      '      <button type="button" id="peMoveDown">Page ↓</button>' +
      '    </div>' +
      '    <div id="peCanvasWrap"><canvas id="peCanvas"></canvas><canvas id="peDraw"></canvas></div>' +
      '  </div>' +
      '  <div id="peSide">' +
      '    <div id="peSideHead"><strong>Extracted rows</strong> <span style="color:#5C5A52">(Univer grid — colour/edit then Sort)</span></div>' +
      '    <div id="peGridHost"></div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(p);

    document.getElementById('peClose').onclick = close;
    document.getElementById('peOpenFile').onclick = function () { document.getElementById('peFileInput').click(); };
    document.getElementById('peMerge').onclick = function () { document.getElementById('peMergeInput').click(); };
    document.getElementById('peFileInput').onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) loadPdfFile(f);
      e.target.value = '';
    };
    document.getElementById('peMergeInput').onchange = function (e) {
      var files = e.target.files;
      if (files && files.length) mergePdfs(files);
      e.target.value = '';
    };
    document.getElementById('peSave').onclick = savePdf;
    document.getElementById('peSort').onclick = sortExtract;
    document.getElementById('pePrev').onclick = function () { goPage(pageIndex - 1); };
    document.getElementById('peNext').onclick = function () { goPage(pageIndex + 1); };
    document.getElementById('peRotL').onclick = function () { rotatePage(-90); };
    document.getElementById('peRotR').onclick = function () { rotatePage(90); };
    document.getElementById('peDelPage').onclick = deletePage;
    document.getElementById('peMoveUp').onclick = function () { movePage(-1); };
    document.getElementById('peMoveDown').onclick = function () { movePage(1); };

    Array.prototype.forEach.call(document.querySelectorAll('#peTools [data-tool]'), function (btn) {
      btn.onclick = function () {
        tool = btn.getAttribute('data-tool');
        Array.prototype.forEach.call(document.querySelectorAll('#peTools [data-tool]'), function (b) {
          b.classList.toggle('active', b === btn);
        });
        var draw = document.getElementById('peDraw');
        if (draw) draw.style.pointerEvents = tool === 'pan' ? 'none' : 'auto';
      };
    });

    wireDrawCanvas();
  }

  function wireDrawCanvas() {
    var draw = document.getElementById('peDraw');
    if (!draw || draw.__peWired) return;
    draw.__peWired = true;
    draw.style.pointerEvents = 'none';
    draw.style.position = 'absolute';

    function pos(ev) {
      var rect = draw.getBoundingClientRect();
      var t = ev.touches && ev.touches[0];
      var x = (t ? t.clientX : ev.clientX) - rect.left;
      var y = (t ? t.clientY : ev.clientY) - rect.top;
      return { x: x, y: y };
    }

    function start(ev) {
      if (tool === 'pan') return;
      ev.preventDefault();
      var p = pos(ev);
      if (tool === 'text') {
        var txt = prompt('Text to place:');
        if (txt) {
          strokes.push({ page: pageIndex, type: 'text', x: p.x, y: p.y, text: txt, scale: draw.__peScale || 1 });
          redrawOverlays();
        }
        return;
      }
      drawing = true;
      currentPath = { page: pageIndex, type: tool, points: [p], scale: draw.__peScale || 1 };
    }
    function move(ev) {
      if (!drawing || !currentPath) return;
      ev.preventDefault();
      currentPath.points.push(pos(ev));
      redrawOverlays(currentPath);
    }
    function end(ev) {
      if (!drawing || !currentPath) return;
      drawing = false;
      if (currentPath.points.length > 1) strokes.push(currentPath);
      currentPath = null;
      redrawOverlays();
    }
    draw.addEventListener('mousedown', start);
    draw.addEventListener('mousemove', move);
    draw.addEventListener('mouseup', end);
    draw.addEventListener('mouseleave', end);
    draw.addEventListener('touchstart', start, { passive: false });
    draw.addEventListener('touchmove', move, { passive: false });
    draw.addEventListener('touchend', end);
  }

  function redrawOverlays(extra) {
    var draw = document.getElementById('peDraw');
    if (!draw) return;
    var ctx = draw.getContext('2d');
    ctx.clearRect(0, 0, draw.width, draw.height);
    var all = strokes.filter(function (s) { return s.page === pageIndex; }).concat(extra ? [extra] : []);
    all.forEach(function (s) {
      if (s.type === 'text') {
        ctx.fillStyle = '#1C1E1B';
        ctx.font = '16px sans-serif';
        ctx.fillText(s.text, s.x, s.y);
        return;
      }
      if (!s.points || !s.points.length) return;
      ctx.beginPath();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (s.type === 'highlight') {
        ctx.strokeStyle = 'rgba(255, 230, 0, 0.45)';
        ctx.lineWidth = 18;
      } else if (s.type === 'strike') {
        ctx.strokeStyle = 'rgba(200, 30, 30, 0.9)';
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = 'rgba(30, 90, 220, 0.9)';
        ctx.lineWidth = 2.5;
      }
      s.points.forEach(function (pt, i) {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    });
  }


  function showPanel() {
    ensureDom();
    var p = document.getElementById('pePanel');
    p.classList.add('open');
    p.removeAttribute('inert');
    delete p.dataset.wmInert;
    document.body.classList.add('pe-open');
  }

  function pdfjsApi() {
    var lib = root.pdfjsLib;
    if (!lib) throw new Error('pdf.js not loaded');
    if (typeof lib.getDocument === 'function') return lib;
    if (lib.default && typeof lib.default.getDocument === 'function') return lib.default;
    throw new Error('pdf.js getDocument missing');
  }

  async function loadPdfBytes(bytes, name) {
    await ensureLibs();
    var src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    pdfBytes = new Uint8Array(src); // own copy
    lastFileName = name || lastFileName || 'document.pdf';
    pdfDoc = await root.PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    var copy = pdfBytes.slice(0);
    pdfJsDoc = await pdfjsApi().getDocument({ data: copy, useSystemFonts: true }).promise;
    pageIndex = 0;
    strokes = [];
    document.getElementById('peTitle').textContent = 'PDF editor — ' + lastFileName;
    await renderPage();
  }

  async function loadPdfFile(file) {
    showPanel();
    document.getElementById('peHint').textContent = 'Loading ' + file.name + '…';
    try {
      var buf = await file.arrayBuffer();
      await loadPdfBytes(buf, file.name);
      document.getElementById('peHint').textContent =
        'Original PDF text is not reflowable — add overlays or change pages. Edit extracted rows on the right when available.';
    } catch (e) {
      document.getElementById('peHint').textContent = 'Could not open PDF: ' + (e && e.message ? e.message : e);
    }
  }

  function stashUpload(file) {
    if (!file) return;
    lastFileName = file.name || lastFileName;
    file.arrayBuffer().then(function (buf) {
      root.__peStashedPdf = { name: file.name, bytes: new Uint8Array(buf) };
    }).catch(function () {});
  }

  async function renderPage() {
    if (!pdfJsDoc) return;
    var n = pdfJsDoc.numPages;
    if (pageIndex < 0) pageIndex = 0;
    if (pageIndex >= n) pageIndex = n - 1;
    document.getElementById('pePageLabel').textContent = 'Page ' + (pageIndex + 1) + ' / ' + n;
    var page = await pdfJsDoc.getPage(pageIndex + 1);
    var scale = 1.35;
    var viewport = page.getViewport({ scale: scale });
    var canvas = document.getElementById('peCanvas');
    var draw = document.getElementById('peDraw');
    var ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    draw.width = viewport.width;
    draw.height = viewport.height;
    draw.__peScale = scale;
    // Position draw overlay over the page canvas
    var wrap = document.getElementById('peCanvasWrap');
    draw.style.left = '';
    draw.style.top = '';
    // Stack draw on top via CSS absolute inside wrap — pin to canvas position after layout
    requestAnimationFrame(function () {
      var cRect = canvas.getBoundingClientRect();
      var wRect = wrap.getBoundingClientRect();
      draw.style.left = (cRect.left - wRect.left + wrap.scrollLeft) + 'px';
      draw.style.top = (cRect.top - wRect.top + wrap.scrollTop) + 'px';
    });
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    redrawOverlays();
  }

  function goPage(i) {
    if (!pdfJsDoc) return;
    pageIndex = Math.max(0, Math.min(pdfJsDoc.numPages - 1, i));
    renderPage();
  }

  async function persistAndReload() {
    pdfBytes = await pdfDoc.save();
    pdfJsDoc = await pdfjsApi().getDocument({ data: pdfBytes.slice(0) }).promise;
    if (pageIndex >= pdfJsDoc.numPages) pageIndex = Math.max(0, pdfJsDoc.numPages - 1);
    await renderPage();
  }

  async function rotatePage(deg) {
    if (!pdfDoc) return;
    var pages = pdfDoc.getPages();
    var page = pages[pageIndex];
    if (!page) return;
    var cur = page.getRotation().angle || 0;
    page.setRotation(root.PDFLib.degrees((cur + deg + 360) % 360));
    strokes = strokes.filter(function (s) { return s.page !== pageIndex; });
    await persistAndReload();
  }

  async function deletePage() {
    if (!pdfDoc) return;
    var count = pdfDoc.getPageCount();
    if (count <= 1) { alert('Cannot delete the only page.'); return; }
    if (!confirm('Delete page ' + (pageIndex + 1) + '?')) return;
    pdfDoc.removePage(pageIndex);
    // Remap strokes
    strokes = strokes.filter(function (s) { return s.page !== pageIndex; }).map(function (s) {
      if (s.page > pageIndex) return Object.assign({}, s, { page: s.page - 1 });
      return s;
    });
    await persistAndReload();
  }

  async function movePage(dir) {
    if (!pdfDoc) return;
    var count = pdfDoc.getPageCount();
    var to = pageIndex + dir;
    if (to < 0 || to >= count) return;
    var [copied] = await pdfDoc.copyPages(pdfDoc, [pageIndex]);
    pdfDoc.removePage(pageIndex);
    pdfDoc.insertPage(to, copied);
    strokes.forEach(function (s) {
      if (s.page === pageIndex) s.page = to;
      else if (dir < 0 && s.page >= to && s.page < pageIndex) s.page += 1;
      else if (dir > 0 && s.page <= to && s.page > pageIndex) s.page -= 1;
    });
    pageIndex = to;
    await persistAndReload();
  }

  async function mergePdfs(fileList) {
    if (!pdfDoc) {
      alert('Open a PDF first, then merge others into it.');
      return;
    }
    await ensureLibs();
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var buf = new Uint8Array(await f.arrayBuffer());
      var other = await root.PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
      var idxs = other.getPageIndices();
      var copied = await pdfDoc.copyPages(other, idxs);
      copied.forEach(function (pg) { pdfDoc.addPage(pg); });
    }
    await persistAndReload();
    document.getElementById('peHint').textContent = 'Merged ' + fileList.length + ' file(s). Total pages: ' + pdfDoc.getPageCount() + '.';
  }

  function applyStrokesToPdf() {
    // Burn vector overlays into PDF pages via pdf-lib drawing API (approx. from canvas coords)
    if (!pdfDoc || !strokes.length) return;
    var pages = pdfDoc.getPages();
    strokes.forEach(function (s) {
      var page = pages[s.page];
      if (!page) return;
      var scale = s.scale || 1.35;
      var { width, height } = page.getSize();
      function toPdf(pt) {
        return { x: pt.x / scale, y: height - pt.y / scale };
      }
      if (s.type === 'text') {
        var p = toPdf({ x: s.x, y: s.y });
        page.drawText(String(s.text || ''), {
          x: p.x,
          y: p.y,
          size: 12,
          color: root.PDFLib.rgb(0.1, 0.1, 0.1)
        });
        return;
      }
      if (!s.points || s.points.length < 2) return;
      var color, thickness;
      if (s.type === 'highlight') {
        color = root.PDFLib.rgb(1, 0.92, 0.2);
        thickness = 10;
      } else if (s.type === 'strike') {
        color = root.PDFLib.rgb(0.8, 0.1, 0.1);
        thickness = 1.5;
      } else {
        color = root.PDFLib.rgb(0.12, 0.35, 0.85);
        thickness = 1.8;
      }
      for (var i = 1; i < s.points.length; i++) {
        var a = toPdf(s.points[i - 1]);
        var b = toPdf(s.points[i]);
        page.drawLine({
          start: a,
          end: b,
          thickness: thickness,
          color: color,
          opacity: s.type === 'highlight' ? 0.45 : 0.95
        });
      }
    });
  }

  async function savePdf() {
    if (!pdfDoc) { alert('No PDF open'); return; }
    try {
      applyStrokesToPdf();
      var bytes = await pdfDoc.save();
      strokes = [];
      pdfBytes = bytes;
      var blob = new Blob([bytes], { type: 'application/pdf' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (lastFileName || 'document').replace(/\.pdf$/i, '') + '-edited.pdf';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      // reload clean view
      pdfJsDoc = await pdfjsApi().getDocument({ data: bytes.slice(0) }).promise;
      await renderPage();
    } catch (e) {
      alert('Save failed: ' + (e && e.message ? e.message : e));
    }
  }

  function mountExtractGrid(rows) {
    var host = document.getElementById('peGridHost');
    if (!host) return;
    host.innerHTML = '';
    pendingExtract = rows || [];
    if (!root.PreplineSheet || typeof root.PreplineSheet.openWithData !== 'function') {
      host.innerHTML = '<div style="padding:16px;color:#5C5A52">Sheet engine not ready.</div>';
      return;
    }
    // Reuse Univer inside the side panel by temporarily swapping sbGrid — cleaner: create dedicated instance
    root.PreplineSheet.ensureLibs().then(function () {
      var data = root.PreplineSheet.pdfRowsToWorkbookData(pendingExtract);
      // Create a nested Univer in peGridHost (separate from sbPanel)
      if (!root.PreplineUniver) throw new Error('Univer missing');
      if (root.__peUniver && root.__peUniver.dispose) {
        try { root.__peUniver.dispose(); } catch (e) {}
      }
      root.__peUniver = root.PreplineUniver.createSheetEditor(host, data);
    }).catch(function (err) {
      host.innerHTML = '<div style="padding:16px">Grid failed: ' + (err && err.message ? err.message : err) + '</div>';
    });
  }

  function sortExtract() {
    // Prefer live Univer snapshot from side panel
    try {
      if (root.__peUniver && root.__peUniver.univerAPI) {
        var wb = root.__peUniver.univerAPI.getActiveWorkbook();
        var snap = wb && (wb.save ? wb.save() : wb.getSnapshot());
        if (snap && root.PreplineSheet) {
          // Use sheet-builder's pdf-rows feed path via temporary mode
          var sheets = snap.sheets || {};
          var order = snap.sheetOrder || Object.keys(sheets);
          var sheet = sheets[order[0]];
          var cellData = (sheet && sheet.cellData) || {};
          var maxR = 0, maxC = 0;
          Object.keys(cellData).forEach(function (rk) {
            var ri = +rk; if (!Number.isFinite(ri)) return;
            maxR = Math.max(maxR, ri);
            Object.keys(cellData[rk] || {}).forEach(function (ck) {
              var ci = +ck; if (Number.isFinite(ci)) maxC = Math.max(maxC, ci);
            });
          });
          var header = [];
          for (var c = 0; c <= maxC; c++) {
            var cell = cellData[0] && cellData[0][c];
            header.push(String(cell && cell.v != null ? cell.v : '').trim().toLowerCase());
          }
          function idx(names) {
            for (var i = 0; i < names.length; i++) {
              var j = header.indexOf(names[i]); if (j >= 0) return j;
            }
            return -1;
          }
          var iDish = idx(['dish', 'dish name', 'menu']); if (iDish < 0) iDish = 0;
          var iItem = idx(['item', 'task', 'ingredient', 'product', 'name']); if (iItem < 0) iItem = 1;
          var iQty = idx(['qty', 'qty/pax', 'quantity']); 
          var iUnit = idx(['unit', 'uom']);
          var iSec = idx(['section', 'team', 'dept']);
          var iDate = idx(['date', 'event date', 'bat']);
          var iPax = idx(['pax', 'covers', 'guests']);
          var iCat = idx(['category', 'prepcat', 'prep cat', 'type']);
          var B = window.__preplineBridge;
          if (!B) { alert('App bridge missing'); return; }
          B.clearList();
          var newRows = [];
          for (var r = 1; r <= maxR; r++) {
            var itemCell = cellData[r] && cellData[r][iItem];
            var item = itemCell && itemCell.v;
            if (item == null || String(item).trim() === '') continue;
            var dish = (iDish >= 0 && cellData[r][iDish] && cellData[r][iDish].v != null) ? String(cellData[r][iDish].v).trim() : 'PDF list';
            var qty = iQty >= 0 && cellData[r][iQty] ? cellData[r][iQty].v : '';
            var unit = iUnit >= 0 && cellData[r][iUnit] ? cellData[r][iUnit].v : '';
            var sec = iSec >= 0 && cellData[r][iSec] ? cellData[r][iSec].v : '';
            var cat = iCat >= 0 && cellData[r][iCat] ? String(cellData[r][iCat].v || '') : '';
            var pax = iPax >= 0 && cellData[r][iPax] ? Number(cellData[r][iPax].v) : NaN;
            if (Number.isFinite(pax) && pax > 0) B.setPax(dish, pax);
            if (iDate >= 0 && cellData[r][iDate] && cellData[r][iDate].v) B.setDate(dish, String(cellData[r][iDate].v));
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
          return;
        }
      }
    } catch (e) {
      alert('Sort failed: ' + (e && e.message ? e.message : e));
    }
  }

  function openFromExtract(extractedRows, meta) {
    showPanel();
    meta = meta || {};
    document.getElementById('peTitle').textContent = 'PDF editor — ' + (meta.name || lastFileName || 'PDF');
    mountExtractGrid(extractedRows);

    var stashed = root.__peStashedPdf;
    if (stashed && stashed.bytes) {
      loadPdfBytes(stashed.bytes, stashed.name || meta.name).catch(function (e) {
        document.getElementById('peHint').textContent =
          'Extract grid ready. PDF preview unavailable (' + (e && e.message ? e.message : e) + '). Open PDF… to load the file for page tools.';
      });
    } else {
      document.getElementById('peHint').textContent =
        'Extracted rows are editable on the right. Original PDF text is not reflowable. Use Open PDF… to load the file for highlights, drawings and page tools.';
    }
  }

  function openBlank() {
    showPanel();
    document.getElementById('peTitle').textContent = 'PDF editor';
    document.getElementById('peHint').textContent =
      'Open a PDF to annotate pages (text, highlight, draw, strike), reorder/rotate/delete pages, merge PDFs, and save. After a production-tool upload, extracted rows also appear here for editing.';
    document.getElementById('peGridHost').innerHTML =
      '<div style="padding:16px;color:#5C5A52;font-size:13px">No extract yet. Upload a production-tool PDF on the main screen, or open a PDF here for page tools only.</div>';
    document.getElementById('peFileInput').click();
  }

  function close() {
    document.getElementById('pePanel').classList.remove('open');
    document.body.classList.remove('pe-open');
    if (root.__peUniver && root.__peUniver.dispose) {
      try { root.__peUniver.dispose(); } catch (e) {}
      root.__peUniver = null;
    }
  }

  root.PreplinePdf = {
    openBlank: openBlank,
    openFromExtract: openFromExtract,
    stashUpload: stashUpload,
    loadPdfFile: loadPdfFile,
    close: close
  };

  document.addEventListener('DOMContentLoaded', ensureDom);
  if (document.readyState !== 'loading') ensureDom();
})(window);
