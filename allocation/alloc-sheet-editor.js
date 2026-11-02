/* Allocation bespoke Excel-like editor bridge (Univer via PreplineSheet).
 * Opens Paula-legend starter, legend quick picks, insert photo, A4 landscape print,
 * saves sheet into prep-list bespokeSheets. Trial only.
 */
(function (root) {
  'use strict';

  var LEGEND = [
    { key: 'sauce', label: 'Sauce', rgb: '#4A86E8', xrgb: 'FF4A86E8' },
    { key: 'vege', label: 'Vege', rgb: '#00FF00', xrgb: 'FF00FF00' },
    { key: 'garnish', label: 'Garnish', rgb: '#FF9900', xrgb: 'FFFF9900' },
    { key: 'starch', label: 'Starch', rgb: '#FFFF00', xrgb: 'FFFFFF00' },
    { key: 'protein', label: 'Protein', rgb: '#FF0000', xrgb: 'FFFF0000' }
  ];

  function status(msg, isErr) {
    var el = document.getElementById('prepMatchStatus') || document.getElementById('woStatus');
    if (el) {
      el.textContent = msg || '';
      el.style.color = isErr ? '#a00' : '';
    }
  }

  var _blankTemplatePromise = null;
  function blankTemplateUrl() {
    var base = (root.__PREPLINE_VENDOR_BASE__ || '../').replace(/\/?$/, '/');
    return base + 'allocation/templates/bespoke-blank-plated.xlsx';
  }
  function loadBlankTemplateBytes() {
    if (_blankTemplatePromise) return _blankTemplatePromise;
    _blankTemplatePromise = fetch(blankTemplateUrl(), { cache: 'force-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('Blank master template HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then(function (ab) { return new Uint8Array(ab); })
      .catch(function (err) {
        _blankTemplatePromise = null;
        throw err;
      });
    return _blankTemplatePromise;
  }

  function patchBlankTemplateWs(ws, meta) {
    var dish = meta.dish || 'Bespoke dish';
    var eventLabel = meta.eventLabel || 'Event';
    var pax = meta.pax != null ? meta.pax : 100;
    function keepStyle(addr, cell) {
      var prev = ws[addr] || {};
      cell.s = prev.s || cell.s;
      ws[addr] = cell;
    }
    keepStyle('B1', { t: 's', v: dish });
    keepStyle('B2', { t: 's', v: eventLabel });
    keepStyle('C2', { t: 'n', v: Number(pax) || 0 });
    if (!ws['D2']) keepStyle('D2', { t: 's', v: 'pax' });
    // Ensure blank data rows keep total formulas (=pax * per person)
    var ref = ws['!ref'] || 'A1:L18';
    var maxR = 18;
    try {
      var m = /:([A-Z]+)(\d+)/.exec(ref);
      if (m) maxR = Math.max(4, parseInt(m[2], 10));
    } catch (e0) {}
    for (var r = 4; r <= maxR; r++) {
      var e = ws['E' + r];
      if (!e) {
        ws['E' + r] = { t: 'n', f: '=$C$2*C' + r, v: 0 };
      } else if (!e.f) {
        e.f = '=$C$2*C' + r;
        e.t = 'n';
        if (e.v == null) e.v = 0;
      }
      // Clear any leftover values in item/pp/unit if template had placeholders
      ['B', 'C', 'D', 'F', 'G'].forEach(function (col) {
        if (!ws[col + r]) return;
        // leave formulas alone; only clear display leftovers on C when empty string wanted
      });
    }
    if (root.AllocPrepList && root.AllocPrepList.applySamplePrintSetup) {
      root.AllocPrepList.applySamplePrintSetup(ws);
    }
    return ws;
  }

  function buildStarterBuffer(meta) {
    if (!root.AllocPrepList) throw new Error('AllocPrepList missing');
    var X = root.XLSX;
    if (!X) throw new Error('XLSX missing');
    var dish = meta.dish || 'Bespoke dish';
    var date = meta.date || '';
    var meal = meta.meal || 'Dinner';
    var acronym = meta.acronym || (root.AllocPrepList.eventAcronym
      ? root.AllocPrepList.eventAcronym(meta.event || dish, meal)
      : 'EVT');
    var eventLabel = date && root.AllocPrepList.fmtEventLabel
      ? root.AllocPrepList.fmtEventLabel(date, meal, acronym)
      : (meal + ' (' + acronym + ')');
    var pax = meta.pax != null ? meta.pax : 100;
    var key = dish.replace(/textures of\s+/i, '').split(/\s+/).slice(0, 2).join(' ').slice(0, 14) || 'Bespoke';
    var tab = date && root.AllocPrepList.tabName
      ? root.AllocPrepList.tabName(date, 'M', key, acronym)
      : (key + ' - ' + acronym).slice(0, 31);

    function fromBlankPaula() {
      // Structural SheetJS blank (no private ingredient content)
      var ws = root.AllocPrepList.blankPaulaLegendSheet({
        dish: dish,
        eventLabel: eventLabel,
        pax: pax,
        rows: meta.rows || [], // blank unless caller supplies
        blankRows: 15
      });
      var wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, tab.slice(0, 31));
      var buf = root.AllocPrepList.writePrepXlsx
        ? root.AllocPrepList.writePrepXlsx(wb, X)
        : X.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true });
      return {
        buffer: buf instanceof Uint8Array ? buf : new Uint8Array(buf),
        tab: tab,
        dish: dish,
        date: date,
        event: meta.event || dish,
        meal: meal,
        pax: pax,
        acronym: acronym,
        eventLabel: eventLabel
      };
    }

    // Prefer exact OOXML blank cloned from master structure (public sanitised template)
    return loadBlankTemplateBytes()
      .then(function (tpl) {
        var wb = X.read(tpl, { type: 'array', cellStyles: true, cellFormula: true });
        var name0 = wb.SheetNames[0];
        var ws = wb.Sheets[name0];
        patchBlankTemplateWs(ws, { dish: dish, eventLabel: eventLabel, pax: pax });
        // Rename sheet
        wb.SheetNames[0] = tab.slice(0, 31);
        wb.Sheets[tab.slice(0, 31)] = ws;
        if (name0 !== tab.slice(0, 31)) delete wb.Sheets[name0];
        var buf = root.AllocPrepList.writePrepXlsx
          ? root.AllocPrepList.writePrepXlsx(wb, X)
          : X.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true });
        return {
          buffer: buf instanceof Uint8Array ? buf : new Uint8Array(buf),
          tab: tab,
          dish: dish,
          date: date,
          event: meta.event || dish,
          meal: meal,
          pax: pax,
          acronym: acronym,
          eventLabel: eventLabel
        };
      })
      .catch(function (err) {
        console.warn('Blank master template load failed, using SheetJS structural blank', err);
        return fromBlankPaula();
      });
  }

  function sheetFromBuffer(buf, preferName) {
    var X = root.XLSX;
    var wb = X.read(buf, { type: 'array', cellStyles: true });
    var name = preferName && wb.SheetNames.indexOf(preferName) >= 0
      ? preferName
      : wb.SheetNames[0];
    return { name: name, ws: wb.Sheets[name], workbook: wb };
  }

  function ensureLegendToolbar() {
    var top = document.getElementById('sbTop');
    if (!top || document.getElementById('sbLegendPicks')) return;
    var wrap = document.createElement('div');
    wrap.id = 'sbLegendPicks';
    wrap.style.cssText = 'display:flex;gap:4px;align-items:center;flex-wrap:wrap';
    wrap.innerHTML = '<span style="font-size:12px;color:#5C5A52">Legend fill:</span>';
    LEGEND.forEach(function (L) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = L.label;
      b.title = 'Apply ' + L.label + ' fill to selection (and col A marker)';
      b.style.cssText = 'padding:5px 8px;border-radius:6px;border:1px solid #C9C2B0;background:' +
        L.rgb + ';color:#111;font:inherit;cursor:pointer;font-size:12px';
      b.onclick = function () { applyLegendFill(L); };
      wrap.appendChild(b);
    });
    var imgBtn = document.createElement('button');
    imgBtn.type = 'button';
    imgBtn.id = 'sbInsertPhoto';
    imgBtn.textContent = '📷 Insert photo';
    imgBtn.title = 'Insert a dish photo (kept on Save / Add to prep list)';
    imgBtn.onclick = insertPhoto;
    wrap.appendChild(imgBtn);
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.id = 'sbInsertPhotoInput';
    inp.hidden = true;
    wrap.appendChild(inp);
    top.appendChild(wrap);
  }

  function getFacadeRange() {
    try {
      var ed = root.PreplineSheet && root.PreplineSheet._getEditor && root.PreplineSheet._getEditor();
      if (!ed || !ed.univerAPI) return null;
      var wb = ed.univerAPI.getActiveWorkbook && ed.univerAPI.getActiveWorkbook();
      if (!wb) return null;
      var sheet = wb.getActiveSheet && wb.getActiveSheet();
      if (!sheet) return null;
      var sel = sheet.getSelection && sheet.getSelection();
      var range = sel && sel.getActiveRange && sel.getActiveRange();
      if (range) return { sheet: sheet, range: range, api: ed.univerAPI };
      // fallback A1
      if (sheet.getRange) return { sheet: sheet, range: sheet.getRange(0, 0), api: ed.univerAPI };
    } catch (e) {}
    return null;
  }

  function applyLegendFill(L) {
    var pack = getFacadeRange();
    if (!pack || !pack.range) {
      alert('Select cells in the grid, then tap a legend colour.');
      return;
    }
    try {
      if (typeof pack.range.setBackground === 'function') {
        pack.range.setBackground(L.rgb);
      } else if (typeof pack.range.setBackgroundColor === 'function') {
        pack.range.setBackgroundColor(L.rgb);
      } else {
        alert('Fill API unavailable in this build — use the toolbar paint bucket.');
        return;
      }
      // Also paint column A marker on the same rows when possible
      try {
        var a1 = pack.range.getA1 || pack.range.getRange || null;
        // Best-effort: get start/end row
        var start = pack.range.getRow ? pack.range.getRow() : 0;
        var end = pack.range.getLastRow ? pack.range.getLastRow() : start;
        var n = Math.max(0, end - start) + 1;
        if (pack.sheet.getRange && n > 0 && n < 200) {
          var marker = pack.sheet.getRange(start, 0, n, 1);
          if (marker && marker.setBackground) marker.setBackground(L.rgb);
        }
      } catch (e2) {}
      var hint = document.getElementById('sbHint');
      if (hint) hint.textContent = 'Applied ' + L.label + ' fill (' + L.rgb + ').';
    } catch (e) {
      alert('Could not apply fill: ' + (e && e.message ? e.message : e));
    }
  }

  function insertPhoto() {
    var inp = document.getElementById('sbInsertPhotoInput');
    if (!inp) return;
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      inp.value = '';
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        var base64 = String(dataUrl).split(',')[1] || '';
        var ext = (f.name.split('.').pop() || 'png').toLowerCase().replace(/jpeg/, 'jpg');
        if (ext === 'jpg') ext = 'jpeg';
        stashPhoto({
          dataUrl: dataUrl,
          fullDataUrl: dataUrl,
          base64: base64,
          extension: ext === 'jpeg' ? 'jpeg' : (ext === 'png' ? 'png' : 'png'),
          width: 420,
          height: 420,
          tlRow: 0.2,
          tlCol: 7,
          brRow: 12,
          brCol: 11,
          pageLabel: 'Dish photo'
        });
      };
      reader.readAsDataURL(f);
    };
    inp.click();
  }

  function stashPhoto(ph) {
    // Store in Prepline485 editorPhotos shape so Save / Add re-embeds
    var sheetName = '';
    try {
      var ed = root.PreplineSheet._getEditor();
      var wb = ed && ed.univerAPI && ed.univerAPI.getActiveWorkbook();
      var sh = wb && wb.getActiveSheet && wb.getActiveSheet();
      sheetName = (sh && sh.getSheetName && sh.getSheetName()) || (sh && sh.getName && sh.getName()) || '';
    } catch (e) {}
    if (!sheetName) {
      var pending = root.PreplineSheet.getPending && root.PreplineSheet.getPending();
      sheetName = (pending && pending.meta && pending.meta.tab) || 'Prep';
    }
    if (!root.__allocEditorPhotos) root.__allocEditorPhotos = { bySheet: {} };
    root.__allocEditorPhotos.bySheet[sheetName] = [ph];
    // Hook into 485 store if present
    try {
      if (root.Prepline485 && root.Prepline485.getEditorPhotos) {
        /* mutate via afterOpen path — inject synthetic bytes later on export */
      }
    } catch (e2) {}
    // Visual overlay (reuse 485 DOM if available)
    var grid = document.getElementById('sbGrid');
    if (grid) {
      var el = document.getElementById('sbPhotoOverlay');
      if (!el) {
        el = document.createElement('div');
        el.id = 'sbPhotoOverlay';
        el.style.cssText = 'position:absolute;top:48px;right:16px;z-index:5;background:#fff;border:1px solid #bbb;padding:6px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.15)';
        el.innerHTML = '<div class="sb-ph-badge" style="font-size:11px;color:#666;margin-bottom:4px">Dish photo</div><img alt="Dish photo" style="max-width:220px;max-height:220px;display:block">';
        grid.appendChild(el);
      }
      var img = el.querySelector('img');
      if (img) img.src = ph.dataUrl;
    }
    // Monkey-patch reembed to include our photo if 485 has empty store
    ensureReembedHook(sheetName, ph);
    var hint = document.getElementById('sbHint');
    if (hint) hint.textContent = 'Photo added — will embed when you Save or Add to prep list.';
  }

  function ensureReembedHook(sheetName, ph) {
    if (!root.Prepline485 || typeof root.Prepline485.reembedPhotosIntoBuffer !== 'function') return;
    if (root.Prepline485.reembedPhotosIntoBuffer.__allocHook) return;
    var orig = root.Prepline485.reembedPhotosIntoBuffer;
    var wrapped = function (buf) {
      try {
        var store = root.__allocEditorPhotos && root.__allocEditorPhotos.bySheet;
        if (store && Object.keys(store).length) {
          // Temporarily expose via getEditorPhotos mutation — call ExcelJS ourselves if 485 store empty
          var existing = root.Prepline485.getEditorPhotos && root.Prepline485.getEditorPhotos();
          if (!existing || !Object.keys(existing).length) {
            return embedPhotosExcelJS(buf, store);
          }
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    wrapped.__allocHook = true;
    root.Prepline485.reembedPhotosIntoBuffer = wrapped;
  }

  function embedPhotosExcelJS(buf, bySheet) {
    return Promise.resolve().then(function () {
      if (!root.ExcelJS || !root.ExcelJS.Workbook) {
        return { buffer: buf, photos: 0 };
      }
      var wb = new root.ExcelJS.Workbook();
      return wb.xlsx.load(buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
        .then(function () {
          var n = 0;
          wb.eachSheet(function (ws) {
            var photos = bySheet[ws.name];
            if (!photos) {
              var keys = Object.keys(bySheet);
              for (var i = 0; i < keys.length; i++) {
                if (String(keys[i]).toLowerCase() === String(ws.name).toLowerCase()) {
                  photos = bySheet[keys[i]]; break;
                }
              }
            }
            if (!photos || !photos.length) {
              // fallback first photo onto first sheet
              var any = Object.keys(bySheet)[0];
              if (any) photos = bySheet[any];
            }
            (photos || []).forEach(function (ph) {
              try {
                var id = wb.addImage({ base64: ph.base64, extension: ph.extension || 'jpeg' });
                ws.addImage(id, {
                  tl: { col: ph.tlCol || 7, row: ph.tlRow || 0.2 },
                  ext: { width: ph.width || 400, height: ph.height || 400 }
                });
                n++;
              } catch (e) {}
            });
          });
          return wb.xlsx.writeBuffer().then(function (out) {
            return { buffer: out, photos: n };
          });
        });
    }).catch(function () { return { buffer: buf, photos: 0 }; });
  }

  function patchPrintA4Landscape() {
    if (!root.Prepline485 || typeof root.Prepline485.printActiveSheetWithPhoto !== 'function') return;
    if (root.Prepline485.printActiveSheetWithPhoto.__a4) return;
    var orig = root.Prepline485.printActiveSheetWithPhoto;
    var wrapped = function () {
      // Prefer A4 landscape wrapper
      try {
        var snap = root.PreplineSheet.getSnapshot();
        if (!snap) return orig();
        // Monkey: call orig but first patch window.open document — simpler: own print
        var ed = root.PreplineSheet._getEditor();
        var sheetName = '';
        try {
          var sh = ed.univerAPI.getActiveWorkbook().getActiveSheet();
          sheetName = sh.getSheetName ? sh.getSheetName() : (sh.getName ? sh.getName() : '');
        } catch (e0) {}
        // Use 485 AOA via print — wrap by intercepting open
        var _open = window.open;
        window.open = function () {
          var w = _open.apply(window, arguments);
          if (w) {
            var _write = w.document.write.bind(w.document);
            w.document.write = function (html) {
              if (typeof html === 'string' && html.indexOf('@media print') >= 0) {
                html = html.replace(
                  '@media print{body{margin:8px}}',
                  '@page{size:A4 landscape;margin:10mm}@media print{body{margin:8px}table{font-size:11px}}'
                );
              }
              return _write(html);
            };
          }
          window.open = _open;
          return w;
        };
        return orig();
      } catch (e) {
        return orig();
      }
    };
    wrapped.__a4 = true;
    root.Prepline485.printActiveSheetWithPhoto = wrapped;
  }

  function openFromForm() {
    var dish = (document.getElementById('bespokeDish') && document.getElementById('bespokeDish').value || '').trim() || 'Bespoke dish';
    var date = (document.getElementById('bespokeDate') && document.getElementById('bespokeDate').value) || '';
    var event = (document.getElementById('bespokeEvent') && document.getElementById('bespokeEvent').value || '').trim() || dish;
    var meal = (document.getElementById('bespokeMeal') && document.getElementById('bespokeMeal').value) || 'Dinner';
    var pax = Math.max(1, +((document.getElementById('bespokePax') && document.getElementById('bespokePax').value) || 100));
    openEditor({ dish: dish, date: date, event: event, meal: meal, pax: pax });
  }

  function openEditor(meta) {
    if (!root.PreplineSheet || typeof root.PreplineSheet.openAllocBespoke !== 'function') {
      status('Sheet editor not loaded — refresh the page.', true);
      return;
    }
    status('Building blank master-layout sheet…');
    Promise.resolve()
      .then(function () { return buildStarterBuffer(meta); })
      .then(function (pack) {
        var fullMeta = {
          dish: pack.dish,
          date: pack.date,
          event: pack.event,
          meal: pack.meal,
          pax: pack.pax,
          acronym: pack.acronym,
          tab: pack.tab,
          eventLabel: pack.eventLabel,
          fileName: pack.tab
        };
        ensureLegendToolbar();
        patchPrintA4Landscape();
        return root.PreplineSheet.openAllocBespoke(pack.buffer, fullMeta, function (buf, m) {
          return onAddToPrep(buf, m || fullMeta);
        }).then(function () {
          ensureLegendToolbar();
          patchPrintA4Landscape();
          if (!root.ExcelJS) {
            var s = document.createElement('script');
            s.src = (root.__PREPLINE_VENDOR_BASE__ || '../') + 'vendor/exceljs/exceljs.min.js';
            document.head.appendChild(s);
          }
          status('Editor open — blank master layout ready. Type items; totals compute from pax.');
        });
      })
      .catch(function (err) {
        status('Editor failed: ' + (err && err.message ? err.message : err), true);
      });
  }

  function onAddToPrep(buf, meta) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    // Prefer alloc photos re-embed
    var chain = Promise.resolve(u8);
    if (root.__allocEditorPhotos && Object.keys(root.__allocEditorPhotos.bySheet || {}).length) {
      chain = embedPhotosExcelJS(u8, root.__allocEditorPhotos.bySheet).then(function (r) {
        return r.buffer instanceof Uint8Array ? r.buffer : new Uint8Array(r.buffer);
      });
    } else if (root.Prepline485 && root.Prepline485.reembedPhotosIntoBuffer) {
      chain = root.Prepline485.reembedPhotosIntoBuffer(u8).then(function (r) {
        var b = r.buffer || u8;
        return b instanceof Uint8Array ? b : new Uint8Array(b);
      });
    }
    return chain.then(function (finalBuf) {
      var parsed = sheetFromBuffer(finalBuf, meta.tab);
      var entry = {
        tab: (parsed.name || meta.tab || 'Bespoke').slice(0, 31),
        dish: meta.dish,
        date: meta.date,
        event: meta.event,
        meal: meta.meal,
        pax: meta.pax,
        acronym: meta.acronym,
        ws: parsed.ws,
        master: '(bespoke-editor)',
        xlsxBytes: finalBuf
      };
      if (root.__alloc && typeof root.__alloc.setBespoke === 'function') {
        var cur = (root.__alloc.bespoke || []).slice();
        cur.push(entry);
        root.__alloc.setBespoke(cur);
      } else if (typeof root.onAllocBespokeSaved === 'function') {
        root.onAllocBespokeSaved(entry);
      }
      status('Added "' + entry.tab + '" to prep list. Download prep list to include it.');
      root.__allocEditorPhotos = { bySheet: {} };
      return entry;
    });
  }

  function afterOpen() {
    ensureLegendToolbar();
    patchPrintA4Landscape();
  }

  root.PreplineAllocEditor = {
    openFromForm: openFromForm,
    openEditor: openEditor,
    buildStarterBuffer: buildStarterBuffer,
    afterOpen: afterOpen,
    LEGEND: LEGEND
  };

  function wire() {
    // Prefer full editor button; keep quick-add as secondary
    var add = document.getElementById('bespokeAdd');
    if (add && !add.__allocEditor) {
      add.__allocEditor = true;
      add.textContent = 'Open Excel editor';
      add.title = 'Full spreadsheet editor (Univer) with Paula colour legend — formulas, fills, photo, print, then add to prep list';
      add.onclick = function (ev) {
        ev.preventDefault();
        openFromForm();
      };
    }
    var quick = document.getElementById('bespokeQuickAdd');
    if (quick && !quick.__wired) {
      quick.__wired = true;
      quick.onclick = function () {
        if (root.__alloc && root.__alloc.onAddBespoke) root.__alloc.onAddBespoke();
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
  setTimeout(wire, 0);
  setTimeout(wire, 200);
})(typeof window !== 'undefined' ? window : this);
