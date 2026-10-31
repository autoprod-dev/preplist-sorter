/* Prepline 4.7.9 — Print/export the original (as-is) includes dish photos in print AND xlsx.
 * Trial copy only. Reuses 4.7.6 originalPageImages (ExcelJS getImages mapped by srcSheet).
 * Print: photo beside each dish block (via 4.7.6). Xlsx: ExcelJS addImage in each dish tab.
 * Skip cleanly when a dish has no photo.
 */
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

  function enrichDishesWithSrcSheet(dishes) {
    var sheetByDish = {};
    (typeof ROWS !== 'undefined' ? ROWS : []).forEach(function (r) {
      if (r && r.dish && r.srcSheet && !sheetByDish[r.dish]) sheetByDish[r.dish] = r.srcSheet;
    });
    dishes.forEach(function (d) {
      if (!d.srcSheet && sheetByDish[d.name]) d.srcSheet = sheetByDish[d.name];
    });
    return dishes;
  }

  function safeSheetName(name, used) {
    var s = String(name || 'Dish').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Dish';
    var t = s, i = 2;
    while (used[t.toLowerCase()]) {
      t = (s.slice(0, 28) + ' ' + i).slice(0, 31);
      i++;
    }
    used[t.toLowerCase()] = true;
    return t;
  }

  function dataUrlParts(dataUrl) {
    var m = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m) return null;
    var mime = m[1].toLowerCase();
    var ext = 'png';
    if (mime.indexOf('jpeg') >= 0 || mime.indexOf('jpg') >= 0) ext = 'jpeg';
    else if (mime.indexOf('gif') >= 0) ext = 'gif';
    else if (mime.indexOf('webp') >= 0) ext = 'webp';
    return { base64: m[2], extension: ext };
  }

  function pbEscLocal(s) {
    if (typeof pbEsc === 'function') return pbEsc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Build as-is workbook: one sheet per dish; embed photo top-right when present. */
  async function buildAsIsXlsxWithPhotos(dishes) {
    var ExcelJS = await ensureExcelJS();
    var wb = new ExcelJS.Workbook();
    wb.creator = 'Prepline by Autoprod';
    var used = {};
    var photoCount = 0;

    for (var di = 0; di < dishes.length; di++) {
      var d = dishes[di];
      var title = (typeof cleanDishName === 'function' ? cleanDishName(d.name) : d.name) || d.name || 'Dish';
      var ws = wb.addWorksheet(safeSheetName(title, used), {
        views: [{ state: 'frozen', ySplit: 5, showGridLines: true }]
      });

      ws.getCell('B1').value = title;
      ws.getCell('B1').font = { name: 'Calibri', size: 14, bold: true };
      ws.getCell('B2').value = 'Made with Prepline by Autoprod. Quantities are per pax; Total needed = Qty per pax × PAX.';
      ws.getCell('B3').value = 'PAX';
      ws.getCell('B3').font = { bold: true };
      var pax = d.pax;
      if (pax !== '' && pax != null && isFinite(Number(pax))) ws.getCell('C3').value = Number(pax);
      else ws.getCell('C3').value = pax == null ? '' : pax;
      ws.getCell('C3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

      var headers = ['', 'Item', 'Quantity per pax', 'Unit', 'Total needed', 'Section', 'Prep day', 'Ref #'];
      headers.forEach(function (h, i) {
        var cell = ws.getRow(5).getCell(i + 1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
      });

      var rowIdx = 6;
      (d.rows || []).filter(function (r) { return String(r.item || '').trim(); }).forEach(function (r) {
        var row = ws.getRow(rowIdx);
        row.getCell(2).value = r.item;
        var q = r.qty;
        if (q !== '' && q != null && isFinite(Number(q))) row.getCell(3).value = Number(q);
        else if (q != null && q !== '') row.getCell(3).value = q;
        row.getCell(4).value = r.unit || '';
        /* 4.8.10: plain qty×pax number — never a formula. */
        var qn = (q !== '' && q != null && isFinite(Number(q))) ? Number(q) : NaN;
        var pn = (pax !== '' && pax != null && isFinite(Number(pax))) ? Number(pax) : NaN;
        if (isFinite(qn) && isFinite(pn)) row.getCell(5).value = qn * pn;
        else row.getCell(5).value = '';
        row.getCell(6).value = r.section || (typeof pbSection === 'function' ? pbSection(r) : '') || '';
        var day = r.day ? (typeof dayLabel === 'function' ? dayLabel(r.day) : r.day) : '';
        row.getCell(7).value = day;
        row.getCell(8).value = r.ref || '';
        rowIdx++;
      });

      ws.getColumn(1).width = 3;
      ws.getColumn(2).width = 36;
      ws.getColumn(3).width = 16;
      ws.getColumn(4).width = 8;
      ws.getColumn(5).width = 14;
      ws.getColumn(6).width = 28;
      ws.getColumn(7).width = 12;
      ws.getColumn(8).width = 14;
      ws.getColumn(10).width = 28;

      var photo = dishPhotoFor(d);
      if (photo && photo.dataUrl) {
        var parts = dataUrlParts(photo.dataUrl);
        if (parts) {
          try {
            var imageId = wb.addImage({ base64: parts.base64, extension: parts.extension });
            /* Place beside the header / table (columns J–L, rows 1–12). */
            ws.addImage(imageId, {
              tl: { col: 9, row: 0 },
              ext: { width: 220, height: 280 }
            });
            ws.getCell('J14').value = photo.pageLabel || 'Dish photo';
            ws.getCell('J14').font = { size: 9, color: { argb: 'FF666666' }, name: 'Calibri' };
            photoCount++;
          } catch (e) {
            console.warn('addImage skip', title, e);
          }
        }
      }
    }

    if (!dishes.length) {
      wb.addWorksheet('Sheet1');
    }

    var buf = await wb.xlsx.writeBuffer();
    return { buffer: buf, sheets: dishes.length, photos: photoCount };
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

  async function exportAsIsXlsxWithPhotos(src) {
    var dishes = src === 'builder'
      ? (typeof pbValid === 'function' ? pbValid() : [])
      : (typeof asIsModelFromRows === 'function' ? asIsModelFromRows() : []);
    if (!dishes.length) {
      if (typeof setStatus === 'function') setStatus('Nothing to export yet — load a preplist first.', 'err');
      return null;
    }
    enrichDishesWithSrcSheet(dishes);
    var result = await buildAsIsXlsxWithPhotos(dishes);
    var name = 'Prepline_Original_' + (new Date().toISOString().slice(0, 10)) + '.xlsx';
    downloadBuf(result.buffer, name);
    root.__lastAsIsXlsx = result;
    if (typeof setStatus === 'function') {
      setStatus(
        'Original/as-is spreadsheet: ' + result.sheets + ' dish tab(s), ' +
          result.photos + ' photo(s) embedded' +
          (result.photos < result.sheets ? ' (dishes without a photo skipped cleanly)' : '') + '.',
        'ok'
      );
    }
    return result;
  }

  /** Also embed photos into By-dish Excel export when photos are available. */
  function patchExportDishes() {
    if (typeof exportDishesToXlsx !== 'function') return;
    if (exportDishesToXlsx.__prepline479) return;
    var orig = exportDishesToXlsx;
    var wrapped = function () {
      var dishes = typeof asIsModelFromRows === 'function' ? asIsModelFromRows() : [];
      enrichDishesWithSrcSheet(dishes);
      var anyPhoto = dishes.some(function (d) { return !!dishPhotoFor(d); });
      if (!anyPhoto) return orig();
      /* Prefer ExcelJS photo export (same layout as as-is original). */
      exportAsIsXlsxWithPhotos('upload').catch(function (e) {
        console.warn('photo xlsx failed, falling back', e);
        orig();
      });
    };
    wrapped.__prepline479 = true;
    try { exportDishesToXlsx = wrapped; } catch (e) {}
    root.exportDishesToXlsx = wrapped;
  }

  function patchAsIsBar() {
    /* Re-wrap printAsIs so the preview bar gains Download .xlsx (with photos). */
    var current = typeof printAsIs === 'function' ? printAsIs : root.printAsIs;
    if (typeof current !== 'function' || current.__prepline479) return;
    var wrapped = function (src) {
      current(src);
      var bar = document.querySelector('#asisView .asis-bar');
      if (!bar || bar.querySelector('#asisXlsxBtn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pb-done';
      btn.id = 'asisXlsxBtn';
      btn.textContent = '📊 Download .xlsx (with photos)';
      btn.title = 'One tab per dish; embeds each dish photo when present (same source as Print as-is)';
      btn.onclick = function () {
        exportAsIsXlsxWithPhotos(src || 'upload').catch(function (e) {
          if (typeof setStatus === 'function') setStatus('As-is xlsx failed: ' + (e && e.message || e), 'err');
        });
      };
      var printBtn = bar.querySelector('#asisPrintBtn');
      if (printBtn && printBtn.nextSibling) bar.insertBefore(btn, printBtn.nextSibling);
      else bar.appendChild(btn);
    };
    wrapped.__prepline479 = true;
    try { printAsIs = wrapped; } catch (e) {}
    root.printAsIs = wrapped;
  }

  function patchOriginalsPrint() {
    /* On Original PTs print, keep printing images; also offer xlsx with photos from the tab bar. */
    if (typeof renderOriginalsTab !== 'function' || renderOriginalsTab.__prepline479) return;
    /* Soft: add a global helper used by a button injected after render via MutationObserver-lite */
    root.exportOriginalXlsx479 = function () {
      return exportAsIsXlsxWithPhotos('upload');
    };
  }

  root.exportAsIsXlsxWithPhotos = exportAsIsXlsxWithPhotos;
  root.buildAsIsXlsxWithPhotos = buildAsIsXlsxWithPhotos;
  root.Prepline479 = {
    VERSION: '4.8.23',
    exportAsIsXlsxWithPhotos: exportAsIsXlsxWithPhotos,
    dishPhotoFor: dishPhotoFor
  };

  function boot() {
    patchAsIsBar();
    patchExportDishes();
    patchOriginalsPrint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  /* 476 patches printAsIs on DOMContentLoaded too — re-patch shortly after so our Download button sticks. */
  setTimeout(boot, 0);
  setTimeout(boot, 50);
  setTimeout(boot, 250);
})(typeof window !== 'undefined' ? window : this);
