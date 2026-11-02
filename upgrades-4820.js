/* Prepline 4.8.23 — A3 landscape prep calendar (trial). Autoprod.
 * Columns = prep days (Mon…Sun), rows = kitchen sections (colour-coded).
 * Each cell: compact item lines with pack #, event/function short code, group time/chefs.
 * Designed for ONE A3 landscape page (auto-shrink fallback). Print + xlsx + PDF.
 */
(function (root) {
  'use strict';

  var VERSION = '4.8.23';

  var DAY_ORDER = [
    '1 Monday', '2 Tuesday', '3 Wednesday', '4 Thursday',
    '5 Friday', '6 Saturday', '7 Sunday'
  ];
  var DAY_SHORT = {
    '1 Monday': 'Mon', '2 Tuesday': 'Tue', '3 Wednesday': 'Wed',
    '4 Thursday': 'Thu', '5 Friday': 'Fri', '6 Saturday': 'Sat', '7 Sunday': 'Sun'
  };

  var SECTION_ROWS = [
    { key: 'Sauce, Purees and Gels', label: 'Sauces / Purees / Gels', short: 'Sauce', css: '#D6EAF7', ink: '#0B3D91' },
    { key: 'Vegetables', label: 'Vegetables', short: 'Vege', css: '#E4F0E1', ink: '#1F5C2A' },
    { key: 'Garnishes, Herbs, Powders, Oils', label: 'Garnishes / Herbs / Powders / Oils', short: 'Garnish', css: '#F6E6D2', ink: '#8A4B12',
      aliases: ['Garnishes, Herbs, Powders, Oils Etc.'] },
    { key: 'Starch', label: 'Starch', short: 'Starch', css: '#FFF4C2', ink: '#5C4300' },
    { key: 'Proteins', label: 'Proteins', short: 'Protein', css: '#F5E3DC', ink: '#8B2E1A' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function canonicalSection(sec) {
    var s = String(sec || '');
    for (var i = 0; i < SECTION_ROWS.length; i++) {
      var row = SECTION_ROWS[i];
      if (row.key === s) return row.key;
      if (row.aliases && row.aliases.indexOf(s) >= 0) return row.key;
    }
    /* Map via sheetForItem when available */
    if (root.Prepline477 && typeof root.Prepline477.sheetForItem === 'function') {
      try {
        var sh = root.Prepline477.sheetForItem('', s);
        if (sh && sh !== 'Other') return sh.replace(/ Etc\.$/, '');
      } catch (e) {}
    }
    return s || 'Other';
  }

  function sectionMeta(key) {
    for (var i = 0; i < SECTION_ROWS.length; i++) {
      if (SECTION_ROWS[i].key === key) return SECTION_ROWS[i];
    }
    return { key: key, label: key || 'Other', short: key || '—', css: '#F2F2F2', ink: '#333' };
  }

  /** "3 WED M Beef Eye CEO" → "3WED·CEO"; "4 THURS M Cod MACQ Cutaway" → "4THU·MACQ" */
  function sourceShort(src) {
    var s = String(src || '').trim();
    if (!s) return '';
    var m = s.match(/^(\d+)\s*([A-Za-z]+)/);
    var num = m ? m[1] : '';
    var dayTok = m ? m[2] : '';
    var day = dayTok ? dayTok.slice(0, 3).toUpperCase() : '';
    var parts = s.split(/\s+/);
    var venue = '';
    var VENUE_RE = /^(CEO|WLS|TA|MACQ|Cutaway|Cutaw|BANQ|HOTEL|CLUB)$/i;
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      if (VENUE_RE.test(p) || (/^[A-Z]{2,5}$/.test(p) && p.length >= 2)) {
        venue = p.replace(/Cutaway|Cutaw/i, 'MACQ').slice(0, 4).toUpperCase();
        break;
      }
    }
    if (!venue && parts.length > 2) {
      venue = parts[parts.length - 1].replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
    }
    var head = (num + day) || s.slice(0, 6).toUpperCase();
    return venue ? (head + '·' + venue) : head;
  }

  /** Compact item label for kitchen cell. */
  function itemShort(item) {
    var s = String(item || '').trim();
    /* Drop leading DF already renamed; keep head before method slash */
    var slash = s.indexOf(' /');
    if (slash > 8) s = s.slice(0, slash);
    s = s.replace(/\s*\([^)]*per\)\s*$/i, '').trim();
    if (s.length > 32) s = s.slice(0, 30) + '…';
    return s;
  }

  function formatQtyCompact(r) {
    if (!r) return '';
    if (r.nonNumeric) return '';
    var n = Number(r.qtyPerPax);
    var pax = Number(r.pax) || 0;
    var tot = r.fixedTotal ? n : (Number.isFinite(n) ? n * pax : NaN);
    if (!Number.isFinite(tot) || tot <= 0) return '';
    var u = String(r.unit || '').toLowerCase();
    if (u === 'g' || u === 'gm' || u === 'gram' || u === 'grams') {
      if (tot >= 1000) return (Math.round(tot / 100) / 10) + 'kg';
      return Math.round(tot) + 'g';
    }
    if (u === 'ml' || u === 'millilitre' || u === 'milliliter') {
      if (tot >= 1000) return (Math.round(tot / 100) / 10) + 'L';
      return Math.round(tot) + 'ml';
    }
    if (u === 'kg' || u === 'l' || u === 'lt' || u === 'litre' || u === 'liter') {
      return (Math.round(tot * 10) / 10) + u.replace('litre', 'L').replace('liter', 'L').replace('lt', 'L');
    }
    return (Math.round(tot * 10) / 10) + (r.unit ? r.unit : '');
  }

  function staffCompact(label) {
    var s = String(label || '');
    if (!s || s === '↑ grouped') return '';
    /* "6 hours · 2 chefs (5 lines)" → "6h·2ch" */
    var hm = s.match(/([\d.]+)\s*hours?/i);
    var cm = s.match(/(\d+)\s*chefs?/i);
    if (hm && cm) return hm[1].replace(/\.0$/, '') + 'h·' + cm[1] + 'ch';
    if (hm) return hm[1].replace(/\.0$/, '') + 'h';
    var mm = s.match(/([\d.]+)\s*min/i);
    if (mm) return Math.round(Number(mm[1])) + 'm';
    return s.slice(0, 12);
  }

  function dayKey(prepDay) {
    var s = String(prepDay || '').trim();
    if (DAY_SHORT[s]) return s;
    /* Normalise "Monday" / "1 Mon" etc. */
    var m = s.match(/^(\d+)\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
    if (m) {
      var map = {
        mon: '1 Monday', monday: '1 Monday',
        tue: '2 Tuesday', tuesday: '2 Tuesday',
        wed: '3 Wednesday', wednesday: '3 Wednesday',
        thu: '4 Thursday', thursday: '4 Thursday',
        fri: '5 Friday', friday: '5 Friday',
        sat: '6 Saturday', saturday: '6 Saturday',
        sun: '7 Sunday', sunday: '7 Sunday'
      };
      var k = map[m[2].toLowerCase()];
      if (k) return k;
    }
    return s || 'Unscheduled';
  }

  /**
   * Build calendar model from view rows.
   * Collapses same item+day+section into one cell line; collects event codes + pack #.
   */
  function buildCalendarModel(rows, helpers) {
    helpers = helpers || {};
    var P477 = root.Prepline477 || root.PreplineUpgrades47 || {};
    var build = P477.buildPaulaOrganisedRows || P477.buildPaulaRows;
    if (typeof build !== 'function' && root.PreplineUpgrades47) {
      build = root.PreplineUpgrades47.buildPaulaOrganisedRows;
    }
    var paula = typeof build === 'function' ? build(rows, helpers) : [];
    /* Ensure staff grouping applied (buildPaulaRows already does via applySheetState path;
       re-apply if staff still ungrouped). */
    if (P477.applyStaffBatchGrouping) {
      try { paula = P477.applyStaffBatchGrouping(paula, helpers) || paula; } catch (e) {}
    }

    var daysPresent = {};
    var grid = {}; /* sectionKey -> dayKey -> { lines: [] } */
    SECTION_ROWS.forEach(function (s) { grid[s.key] = {}; });

    /* First pass: group by section|day|itemNorm */
    var buckets = {};
    var packCounterByDay = {};

    paula.forEach(function (r) {
      if (!r || r.staff === '↑ grouped') {
        /* Still count follower source into the leader bucket via itemNorm+day */
      }
      var sec = canonicalSection(r.section);
      if (!grid[sec]) {
        /* Skip Other / Box-off for the 5-row calendar; fold into nearest if possible */
        if (sec === 'Other' || /Box off/i.test(sec)) return;
        grid[sec] = {};
      }
      var day = dayKey(r.prepDay);
      daysPresent[day] = true;
      var itemKey = String(r.itemNorm || r.item || '').toLowerCase();
      var bk = sec + '||' + day + '||' + itemKey;
      if (!buckets[bk]) {
        if (!packCounterByDay[day]) packCounterByDay[day] = 0;
        packCounterByDay[day] += 1;
        buckets[bk] = {
          section: sec,
          day: day,
          item: r.item,
          itemNorm: itemKey,
          packNo: packCounterByDay[day],
          qtyParts: [],
          codes: [],
          codeSet: {},
          staff: '',
          staffMinutes: 0,
          lines: 0
        };
      }
      var b = buckets[bk];
      b.lines += 1;
      if (r.staff && r.staff !== '↑ grouped') {
        b.staff = r.staff;
        b.staffMinutes = r.staffMinutes || 0;
      }
      var q = formatQtyCompact(r);
      if (q) b.qtyParts.push({ q: q, n: r.fixedTotal ? Number(r.qtyPerPax) : Number(r.qtyPerPax) * Number(r.pax) });
      var code = sourceShort(r.sourceTab);
      if (code && !b.codeSet[code]) {
        b.codeSet[code] = true;
        b.codes.push(code);
      }
    });

    Object.keys(buckets).forEach(function (bk) {
      var b = buckets[bk];
      if (!grid[b.section]) grid[b.section] = {};
      if (!grid[b.section][b.day]) grid[b.section][b.day] = { lines: [] };
      var qtyStr = '';
      if (b.qtyParts.length === 1) qtyStr = b.qtyParts[0].q;
      else if (b.qtyParts.length > 1) {
        /* Sum numeric when same unit family */
        var sum = b.qtyParts.reduce(function (s, p) { return s + (Number(p.n) || 0); }, 0);
        if (sum >= 1000 && /g$/i.test(b.qtyParts[0].q) && !/kg/i.test(b.qtyParts[0].q)) {
          qtyStr = (Math.round(sum / 100) / 10) + 'kg';
        } else if (sum > 0) {
          qtyStr = b.qtyParts[0].q; /* keep first; mark count */
          if (b.qtyParts.length > 1) qtyStr += '×' + b.qtyParts.length;
        }
      }
      grid[b.section][b.day].lines.push({
        packNo: b.packNo,
        item: itemShort(b.item),
        qty: qtyStr,
        codes: b.codes.slice(0, 6),
        staff: staffCompact(b.staff),
        lines: b.lines
      });
    });

    /* Sort lines in each cell by packNo */
    Object.keys(grid).forEach(function (sec) {
      Object.keys(grid[sec]).forEach(function (day) {
        grid[sec][day].lines.sort(function (a, b) { return a.packNo - b.packNo; });
      });
    });

    var days = DAY_ORDER.filter(function (d) { return daysPresent[d]; });
    /* Always show Mon–Fri at minimum when any data; add Sat/Sun if present */
    if (!days.length) days = DAY_ORDER.slice(0, 5);

    var weLabel = 'WEEK ENDING: ____';
    if (P477.resolveWeekEndingLabel) {
      try {
        var wi = P477.resolveWeekEndingLabel(helpers, paula);
        if (wi && wi.label) weLabel = wi.label;
      } catch (e) {}
    } else if (helpers.weekLabel) {
      weLabel = 'WEEK ENDING: ' + helpers.weekLabel;
    }

    return {
      weekEnding: weLabel,
      days: days,
      sections: SECTION_ROWS.map(function (s) { return s.key; }),
      grid: grid,
      rowCount: paula.length,
      cellLineCount: Object.keys(buckets).length
    };
  }

  function renderCalendarHtml(model, opts) {
    opts = opts || {};
    var shrink = opts.shrink != null ? opts.shrink : true;
    var title = opts.title || 'Prep calendar';
    var days = model.days || [];
    var html = '';
    html += '<div class="a3cal" id="a3PrepCalendar">';
    html += '<header class="a3cal-head">';
    html += '<div class="a3cal-brand">Prepline by Autoprod</div>';
    html += '<h1>' + esc(title) + '</h1>';
    html += '<div class="a3cal-we">' + esc(model.weekEnding || '') +
      ' · ' + (model.cellLineCount || 0) + ' prep jobs · v' + VERSION + '</div>';
    html += '</header>';
    html += '<table class="a3cal-table" cellspacing="0" cellpadding="0">';
    html += '<thead><tr><th class="a3cal-corner">Section</th>';
    days.forEach(function (d) {
      html += '<th class="a3cal-day">' + esc(DAY_SHORT[d] || d) + '</th>';
    });
    html += '</tr></thead><tbody>';

    (model.sections || []).forEach(function (secKey) {
      var meta = sectionMeta(secKey);
      html += '<tr>';
      html += '<th class="a3cal-sec" style="background:' + meta.css + ';color:' + meta.ink + '">' +
        esc(meta.label) + '</th>';
      days.forEach(function (d) {
        var cell = (model.grid[secKey] && model.grid[secKey][d]) || { lines: [] };
        html += '<td class="a3cal-cell" style="background:' + meta.css + '">';
        if (!cell.lines.length) {
          html += '<span class="a3cal-empty">—</span>';
        } else {
          cell.lines.forEach(function (ln) {
            html += '<div class="a3cal-line">';
            html += '<span class="a3cal-pack">P' + String(ln.packNo).padStart(2, '0') + '</span> ';
            html += '<b class="a3cal-item">' + esc(ln.item) + '</b>';
            if (ln.qty) html += ' <span class="a3cal-qty">' + esc(ln.qty) + '</span>';
            if (ln.codes && ln.codes.length) {
              html += ' <span class="a3cal-codes">' + esc(ln.codes.join(',')) + '</span>';
            }
            if (ln.staff) html += ' <span class="a3cal-staff">' + esc(ln.staff) + '</span>';
            html += '</div>';
          });
        }
        html += '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    html += '<footer class="a3cal-foot">P## = pack # within prep day · codes = event/function (source short) · h·ch = batch staff estimate · Fit: one A3 landscape</footer>';
    html += '</div>';
    return html;
  }

  function calendarCss(opts) {
    opts = opts || {};
    var baseFont = opts.baseFont || 8;
    return [
      '@page { size: A3 landscape; margin: 8mm; }',
      'html, body { margin: 0; padding: 0; background: #fff; }',
      'body { font-family: Arial, Helvetica, sans-serif; color: #111; }',
      '.a3cal { width: 100%; box-sizing: border-box; }',
      '.a3cal-head { display: flex; align-items: baseline; gap: 12px; margin: 0 0 4px; flex-wrap: wrap; }',
      '.a3cal-brand { font-size: 9px; font-weight: 700; color: #1A4D8F; letter-spacing: 0.02em; }',
      '.a3cal-head h1 { font-size: 14px; margin: 0; font-weight: 800; letter-spacing: -0.01em; }',
      '.a3cal-we { font-size: 9px; color: #333; margin-left: auto; }',
      '.a3cal-table { width: 100%; border-collapse: collapse; table-layout: fixed; }',
      '.a3cal-table th, .a3cal-table td { border: 1.5px solid #111; vertical-align: top; }',
      '.a3cal-corner { width: 78px; background: #1C1E1B; color: #fff; font-size: 9px; padding: 4px; text-align: left; }',
      '.a3cal-day { background: #1C1E1B; color: #fff; font-size: 11px; font-weight: 800; padding: 4px 3px; text-align: center; }',
      '.a3cal-sec { width: 78px; font-size: 9px; font-weight: 800; padding: 3px 4px; text-align: left; line-height: 1.15; }',
      '.a3cal-cell { padding: 2px 3px; font-size: ' + baseFont + 'px; line-height: 1.2; }',
      '.a3cal-line { margin: 0 0 1px; padding: 0; orphans: 2; widows: 2; }',
      '.a3cal-pack { font-weight: 800; color: #000; font-variant-numeric: tabular-nums; }',
      '.a3cal-item { font-weight: 700; color: #000; }',
      '.a3cal-qty { font-weight: 700; color: #0B3D91; }',
      '.a3cal-codes { color: #333; font-weight: 600; }',
      '.a3cal-staff { color: #8B2E1A; font-weight: 800; }',
      '.a3cal-empty { color: #999; }',
      '.a3cal-foot { font-size: 7.5px; color: #444; margin-top: 3px; }',
      '@media print {',
      '  .no-print { display: none !important; }',
      '  html, body { width: 100%; height: 100%; overflow: hidden; }',
      '  .a3cal { -webkit-print-color-adjust: exact; print-color-adjust: exact; transform-origin: top left; }',
      '  .a3cal-table { page-break-inside: avoid; break-inside: avoid; }',
      '  tr { page-break-inside: avoid; break-inside: avoid; }',
      '}',
      '.a3cal-scale-wrap { transform-origin: top left; }'
    ].join('\n');
  }

  function buildPrintDocument(model, opts) {
    opts = opts || {};
    var css = calendarCss(opts);
    var body = renderCalendarHtml(model, opts);
    /* Autofit: scale the calendar to fit one A3 landscape page (297mm tall usable). */
    var autofit = '<script>(function(){' +
      'function fit(){' +
        'var el=document.querySelector(".a3cal"); if(!el) return;' +
        'document.documentElement.style.zoom="1";' +
        'el.style.transform="";' +
        'var pageH=Math.floor((297-16)*96/25.4);' +
        'var pageW=Math.floor((420-16)*96/25.4);' +
        'var h=el.scrollHeight, w=el.scrollWidth;' +
        'var s=Math.min(1, pageH/Math.max(h,1), pageW/Math.max(w,1));' +
        'if(s>1) s=1;' +
        'document.documentElement.style.zoom=String(s);' +
        'document.documentElement.setAttribute("data-a3-scale", s.toFixed(4));' +
        'document.documentElement.setAttribute("data-a3-h", String(h));' +
        'document.documentElement.setAttribute("data-a3-fit","1");' +
      '}' +
      'if(document.readyState==="complete") fit();' +
      'else window.addEventListener("load", fit);' +
      'window.addEventListener("beforeprint", fit);' +
      'setTimeout(fit, 40); setTimeout(fit, 180); setTimeout(fit, 400);' +
      '})();<\/script>';

    return '<!doctype html><html><head><meta charset="utf-8"><title>Prepline A3 prep calendar</title>' +
      '<style>' + css + '</style></head><body>' + body + autofit + '</body></html>';
  }

  function openPrintWindow(model, opts) {
    var html = buildPrintDocument(model, opts);
    var w = root.open('', '_blank');
    if (!w) return { ok: false, error: 'popup-blocked' };
    w.document.write(html);
    w.document.close();
    setTimeout(function () {
      try { w.focus(); w.print(); } catch (e) {}
    }, 350);
    return { ok: true, days: model.days.length, lines: model.cellLineCount };
  }

  function printA3Calendar(rows, helpers, opts) {
    var model = buildCalendarModel(rows, helpers);
    /* Auto-shrink: denser weeks get smaller base font */
    var n = model.cellLineCount || 0;
    var baseFont = 8;
    if (n > 220) baseFont = 5.5;
    else if (n > 160) baseFont = 6;
    else if (n > 110) baseFont = 6.5;
    else if (n > 70) baseFont = 7;
    opts = Object.assign({ baseFont: baseFont, title: 'Prep calendar (A3)' }, opts || {});
    var r = openPrintWindow(model, opts);
    return Object.assign({ model: model, baseFont: baseFont }, r);
  }

  /** Return HTML string for Playwright page.setContent + page.pdf */
  function a3CalendarHtmlForPdf(rows, helpers, opts) {
    var model = buildCalendarModel(rows, helpers);
    var n = model.cellLineCount || 0;
    var baseFont = 8;
    if (n > 220) baseFont = 5.5;
    else if (n > 160) baseFont = 6;
    else if (n > 110) baseFont = 6.5;
    else if (n > 70) baseFont = 7;
    opts = Object.assign({ baseFont: baseFont, title: 'Prep calendar (A3)' }, opts || {});
    return {
      html: buildPrintDocument(model, opts),
      model: model,
      baseFont: baseFont
    };
  }

  function downloadBlob(buf, name, mime) {
    var blob = new Blob([buf], { type: mime || 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function loadExcelJSLocal() {
    return new Promise(function (resolve, reject) {
      if (root.ExcelJS) return resolve(root.ExcelJS);
      if (typeof document === 'undefined') return reject(new Error('no DOM'));
      var s = document.createElement('script');
      s.src = 'vendor/exceljs/exceljs.min.js';
      s.onload = function () { resolve(root.ExcelJS); };
      s.onerror = function () { reject(new Error('ExcelJS failed to load')); };
      document.head.appendChild(s);
    });
  }

  function exportA3CalendarXlsx(rows, helpers) {
    helpers = helpers || {};
    var model = buildCalendarModel(rows, helpers);
    var P477 = root.Prepline477 || {};
    var load = (typeof P477.loadExcelJS === 'function') ? P477.loadExcelJS : loadExcelJSLocal;
    function withExcelJS(ExcelJS) {
      var wb = new ExcelJS.Workbook();
      wb.creator = 'Prepline by Autoprod';
      var ws = wb.addWorksheet('A3 Prep Calendar', {
        pageSetup: {
          paperSize: 8, /* A3 */
          orientation: 'landscape',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 1,
          margins: { left: 0.3, right: 0.3, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 }
        }
      });
      var days = model.days;
      var header = ['Section'].concat(days.map(function (d) { return DAY_SHORT[d] || d; }));
      ws.addRow([model.weekEnding]);
      ws.mergeCells(1, 1, 1, header.length);
      ws.getRow(1).font = { bold: true, size: 14 };
      ws.addRow(header);
      var hr = ws.getRow(2);
      hr.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      hr.eachCell(function (c) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C1E1B' } };
        c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
      model.sections.forEach(function (secKey) {
        var meta = sectionMeta(secKey);
        var rowVals = [meta.label];
        days.forEach(function (d) {
          var cell = (model.grid[secKey] && model.grid[secKey][d]) || { lines: [] };
          var text = cell.lines.map(function (ln) {
            var parts = ['P' + String(ln.packNo).padStart(2, '0'), ln.item];
            if (ln.qty) parts.push(ln.qty);
            if (ln.codes && ln.codes.length) parts.push(ln.codes.join(','));
            if (ln.staff) parts.push(ln.staff);
            return parts.join(' ');
          }).join('\n');
          rowVals.push(text || '—');
        });
        var row = ws.addRow(rowVals);
        row.alignment = { wrapText: true, vertical: 'top' };
        row.eachCell(function (c, col) {
          var argb = 'FF' + meta.css.replace('#', '');
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } };
          c.border = {
            top: { style: 'thin', color: { argb: 'FF111111' } },
            left: { style: 'thin', color: { argb: 'FF111111' } },
            bottom: { style: 'thin', color: { argb: 'FF111111' } },
            right: { style: 'thin', color: { argb: 'FF111111' } }
          };
          c.font = { size: col === 1 ? 9 : 7, bold: col === 1, color: { argb: 'FF' + meta.ink.replace('#', '') } };
        });
        row.height = Math.min(180, 14 + Math.max.apply(null, days.map(function (d) {
          var cell = (model.grid[secKey] && model.grid[secKey][d]) || { lines: [] };
          return (cell.lines.length || 1) * 11;
        })));
      });
      ws.getColumn(1).width = 16;
      for (var c = 2; c <= header.length; c++) ws.getColumn(c).width = 28;
      var name = 'Prepline_A3_Calendar.xlsx';
      return wb.xlsx.writeBuffer().then(function (buf) {
        if (helpers.returnBuffer) {
          return { name: name, buffer: buf, engine: 'exceljs', rows: model.cellLineCount, days: days.length };
        }
        downloadBlob(buf, name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return { name: name, rows: model.cellLineCount, days: days.length, engine: 'exceljs' };
      });
    }
    if (typeof load === 'function') {
      return load().then(withExcelJS);
    }
    if (root.ExcelJS) return withExcelJS(root.ExcelJS);
    return Promise.reject(new Error('ExcelJS unavailable'));
  }

  /* Screen preview panel (optional view) */
  function calendarPreviewHtml(rows, helpers) {
    var model = buildCalendarModel(rows, helpers);
    var n = model.cellLineCount || 0;
    var baseFont = n > 120 ? 7 : 8;
    return '<div class="panel a3cal-preview">' +
      '<div class="row no-print" style="gap:8px;flex-wrap:wrap;margin-bottom:8px;">' +
      '<button type="button" class="secondary" onclick="printA3Calendar4820()">🖨️ Print A3 calendar</button>' +
      '<button type="button" class="secondary" onclick="exportA3CalendarXlsx4820()">📊 A3 calendar · Excel</button>' +
      '<button type="button" class="secondary" onclick="exportA3CalendarPdf4820()">🧾 A3 calendar · PDF</button>' +
      '<span class="meta">' + esc(model.weekEnding) + ' · ' + model.cellLineCount + ' jobs · font ' + baseFont + 'pt</span>' +
      '</div>' +
      '<div style="overflow:auto;border:1px solid #ccc;background:#fff;">' +
      '<style>' + calendarCss({ baseFont: baseFont }) + '</style>' +
      renderCalendarHtml(model, { baseFont: baseFont, title: 'Prep calendar (A3 preview)' }) +
      '</div></div>';
  }

  var api = {
    VERSION: VERSION,
    buildCalendarModel: buildCalendarModel,
    renderCalendarHtml: renderCalendarHtml,
    calendarCss: calendarCss,
    buildPrintDocument: buildPrintDocument,
    printA3Calendar: printA3Calendar,
    a3CalendarHtmlForPdf: a3CalendarHtmlForPdf,
    exportA3CalendarXlsx: exportA3CalendarXlsx,
    calendarPreviewHtml: calendarPreviewHtml,
    sourceShort: sourceShort,
    SECTION_ROWS: SECTION_ROWS,
    DAY_ORDER: DAY_ORDER
  };

  root.Prepline4820 = api;
  /* Also hang off Prepline477 for convenience */
  if (root.Prepline477) {
    root.Prepline477.printA3Calendar = printA3Calendar;
    root.Prepline477.exportA3CalendarXlsx = exportA3CalendarXlsx;
    root.Prepline477.a3CalendarHtmlForPdf = a3CalendarHtmlForPdf;
    root.Prepline477.VERSION = VERSION;
  }
  if (root.PreplineUpgrades47) {
    root.PreplineUpgrades47.printA3Calendar = printA3Calendar;
    root.PreplineUpgrades47.exportA3CalendarXlsx = exportA3CalendarXlsx;
    root.PreplineUpgrades47.a3CalendarHtmlForPdf = a3CalendarHtmlForPdf;
  }
})(typeof window !== 'undefined' ? window : globalThis);
