/* Prepline · Work-order event calendar (Week / Month / Year).
   Lives on Work orders & allocation. Auto-fills from Larder/Plated WO uploads.
   Accumulates across uploads on this device (dedupe eventNo+date). Show/Hide (default hidden).
   Print: A4 or A3 landscape; auto-scale + wrap; busy days grow / continue — no clipping. */
(function (root) {
  'use strict';
  var STORE_KEY = 'prepline.alloc.calEvents.v1';
  var OPEN_KEY = 'prepline.alloc.calOpen.v1';
  var SPAN_KEY = 'prepline.alloc.calSpan.v1';
  var ANCHOR_KEY = 'prepline.alloc.calAnchor.v1';
  var PAPER_KEY = 'prepline.alloc.calPaper.v1';
  var WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function mondayOf(d) {
    d = startOfDay(d);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  function addDays(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }
  function parseIso(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d) ? null : startOfDay(d);
  }

  function loadEvents() {
    try {
      var a = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveEvents(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list || [])); } catch (e) {}
  }
  function eventKey(ev) {
    return String(ev.eventNo || '').trim() + '|' + String(ev.date || '').trim();
  }
  function isOpen() {
    try { return localStorage.getItem(OPEN_KEY) === '1'; } catch (e) { return false; }
  }
  function setOpen(v) {
    try { localStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch (e) {}
  }
  function getSpan() {
    try {
      var v = localStorage.getItem(SPAN_KEY);
      if (v === 'month' || v === 'year' || v === 'week') return v;
    } catch (e) {}
    return 'week';
  }
  function setSpan(v) {
    if (v !== 'week' && v !== 'month' && v !== 'year') v = 'week';
    try { localStorage.setItem(SPAN_KEY, v); } catch (e) {}
    return v;
  }
  function getAnchor() {
    try {
      var v = localStorage.getItem(ANCHOR_KEY);
      if (v) {
        var p = v.split('-');
        if (p.length === 3) {
          var d = new Date(+p[0], +p[1] - 1, +p[2]);
          if (!isNaN(d.getTime())) return startOfDay(d);
        }
      }
    } catch (e) {}
    return mondayOf(new Date());
  }
  function setAnchor(d) {
    d = startOfDay(d);
    try { localStorage.setItem(ANCHOR_KEY, ymd(d)); } catch (e) {}
    return d;
  }
  function getPaper() {
    try {
      var v = localStorage.getItem(PAPER_KEY);
      if (v === 'A4' || v === 'A3') return v;
    } catch (e) {}
    return 'A3';
  }
  function setPaper(v) {
    v = (v === 'A4') ? 'A4' : 'A3';
    try { localStorage.setItem(PAPER_KEY, v); } catch (e) {}
    return v;
  }

  /** Build calendar events from a parsed work order + optional allocation result. */
  function eventsFromWorkOrder(wo, meta) {
    meta = meta || {};
    var out = [];
    var by = {};
    var section = meta.kitchenSection || wo.kitchenSection || 'Larder';
    var source = meta.name || 'work-order';
    (wo.lines || []).forEach(function (l) {
      if (!l || !l.date) return;
      var no = String(l.eventNo || '').trim();
      var name = String(l.event || '').trim();
      var k = no + '|' + l.date;
      if (!by[k]) {
        by[k] = {
          eventNo: no,
          name: name,
          date: l.date,
          pax: 0,
          dishes: [],
          rooms: {},
          section: section,
          source: source
        };
      }
      var g = by[k];
      if (name && !g.name) g.name = name;
      if (l.qty > g.pax) g.pax = l.qty;
      var dish = String(l.item || '').trim();
      if (dish && g.dishes.indexOf(dish) < 0) g.dishes.push(dish);
      if (l.room) g.rooms[l.room] = 1;
    });
    /* Prefer Plated function roll-up when present on allocation result */
    if (meta.functions && meta.functions.length) {
      meta.functions.forEach(function (f) {
        var k = String(f.eventNo || '').trim() + '|' + String(f.date || '').trim();
        if (!k || k === '|') return;
        var existing = by[k];
        var dishArr = [];
        if (Array.isArray(f.dishList)) dishArr = f.dishList.slice();
        else if (Array.isArray(f.dishes)) dishArr = f.dishes.slice();
        else if (existing && existing.dishes) dishArr = existing.dishes.slice();
        by[k] = {
          eventNo: String(f.eventNo || '').trim(),
          name: f.name || f.event || (existing && existing.name) || '',
          date: f.date,
          pax: f.paxMax != null ? f.paxMax : (f.pax || (existing && existing.pax) || 0),
          dishes: dishArr,
          rooms: (existing && existing.rooms) || {},
          section: meta.kitchenSection || section || 'Plated',
          source: source,
          dishCount: typeof f.dishes === 'number' ? f.dishes : dishArr.length
        };
      });
    }
    Object.keys(by).forEach(function (k) {
      var g = by[k];
      g.rooms = Object.keys(g.rooms || {});
      if (!g.dishes) g.dishes = [];
      /* Cap stored dish list for localStorage size; print still lists what we have */
      if (g.dishes.length > 40) g.dishes = g.dishes.slice(0, 40);
      out.push(g);
    });
    return out;
  }

  function mergeEvents(incoming) {
    var cur = loadEvents();
    var map = {};
    cur.forEach(function (e) { map[eventKey(e)] = e; });
    (incoming || []).forEach(function (e) {
      var k = eventKey(e);
      if (!k || k === '|') return;
      var prev = map[k];
      if (!prev) { map[k] = e; return; }
      /* Merge dishes / take max pax / prefer longer name */
      var dishes = (prev.dishes || []).slice();
      (e.dishes || []).forEach(function (d) {
        if (d && dishes.indexOf(d) < 0) dishes.push(d);
      });
      map[k] = {
        eventNo: e.eventNo || prev.eventNo,
        name: (e.name && e.name.length >= (prev.name || '').length) ? e.name : prev.name,
        date: e.date || prev.date,
        pax: Math.max(Number(e.pax) || 0, Number(prev.pax) || 0),
        dishes: dishes.slice(0, 60),
        rooms: Array.from(new Set([].concat(prev.rooms || [], e.rooms || []))),
        section: e.section || prev.section,
        source: e.source || prev.source,
        dishCount: e.dishCount != null ? e.dishCount : prev.dishCount
      };
    });
    var list = Object.keys(map).map(function (k) { return map[k]; });
    list.sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date)) || String(a.eventNo).localeCompare(String(b.eventNo));
    });
    saveEvents(list);
    return list;
  }

  function clearEvents() {
    saveEvents([]);
    return [];
  }

  function byYmd(list) {
    var o = {};
    (list || []).forEach(function (e) {
      if (!e.date) return;
      if (!o[e.date]) o[e.date] = [];
      o[e.date].push(e);
    });
    return o;
  }

  function chipHtml(ev, compact) {
    var title = '#' + (ev.eventNo || '—') + ' ' + (ev.name || '') +
      ' · ' + (ev.date || '') + ' · pax ' + (ev.pax || '—');
    if (compact) {
      return '<div class="ac-chip" title="' + esc(title) + '"><b>#' + esc(ev.eventNo || '—') + '</b> ' +
        esc((ev.name || '').slice(0, 28)) +
        (ev.pax ? ' · ' + esc(String(ev.pax)) + 'p' : '') + '</div>';
    }
    var dishes = (ev.dishes || []).slice(0, 8);
    var more = (ev.dishes || []).length - dishes.length;
    return '<div class="ac-chip ac-chip-full" title="' + esc(title) + '">' +
      '<div class="ac-chip-h"><b>#' + esc(ev.eventNo || '—') + '</b> ' + esc(ev.name || 'Function') + '</div>' +
      '<div class="ac-chip-m">' + esc(ev.date) + (ev.pax ? ' · ' + esc(String(ev.pax)) + ' pax' : '') +
      (ev.section ? ' · ' + esc(ev.section) : '') + '</div>' +
      (dishes.length ? '<ul class="ac-chip-d">' + dishes.map(function (d) {
        return '<li>' + esc(d) + '</li>';
      }).join('') + (more > 0 ? '<li class="ac-more">+' + more + ' more</li>' : '') + '</ul>' : '') +
      '</div>';
  }

  function rangeLabel(span, anchor) {
    if (span === 'year') return String(anchor.getFullYear());
    if (span === 'month') return MONTHS[anchor.getMonth()] + ' ' + anchor.getFullYear();
    var mon = mondayOf(anchor);
    var sun = addDays(mon, 6);
    if (mon.getMonth() === sun.getMonth()) {
      return mon.getDate() + '–' + sun.getDate() + ' ' + MONTHS[mon.getMonth()] + ' ' + mon.getFullYear();
    }
    return mon.getDate() + ' ' + MONTHS[mon.getMonth()].slice(0, 3) + ' – ' +
      sun.getDate() + ' ' + MONTHS[sun.getMonth()].slice(0, 3) + ' ' + sun.getFullYear();
  }

  function renderWeek(map, weekMon, todayY) {
    var html = '<div class="ac-week" role="grid">';
    html += '<div class="ac-weekhead">';
    for (var i = 0; i < 7; i++) {
      var d = addDays(weekMon, i);
      html += '<div class="ac-colhead' + (ymd(d) === todayY ? ' today' : '') + '">' +
        '<span class="ac-dow">' + SHORT[i] + '</span><span class="ac-dom">' + d.getDate() + '</span></div>';
    }
    html += '</div><div class="ac-weekbody">';
    for (var j = 0; j < 7; j++) {
      var day = addDays(weekMon, j);
      var k = ymd(day);
      var items = map[k] || [];
      html += '<div class="ac-daycol' + (k === todayY ? ' today' : '') + '" data-ymd="' + k + '">';
      if (!items.length) html += '<div class="ac-empty">—</div>';
      else items.forEach(function (ev) { html += chipHtml(ev, false); });
      html += '</div>';
    }
    html += '</div></div>';
    return html;
  }

  function renderMonth(map, anchor, todayY) {
    var y = anchor.getFullYear(), m = anchor.getMonth();
    var gridStart = mondayOf(new Date(y, m, 1));
    var gridEnd = addDays(mondayOf(new Date(y, m + 1, 0)), 6);
    var html = '<div class="ac-month" role="grid">';
    html += '<div class="ac-monthhead">';
    SHORT.forEach(function (s) { html += '<div class="ac-mhd">' + s + '</div>'; });
    html += '</div><div class="ac-monthbody">';
    for (var d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) {
      var k = ymd(d);
      var items = map[k] || [];
      html += '<div class="ac-mcell' + (d.getMonth() === m ? '' : ' out') + (k === todayY ? ' today' : '') +
        '" data-ymd="' + k + '"><div class="ac-mdate">' + d.getDate() +
        (items.length ? ' <span class="ac-count">' + items.length + '</span>' : '') +
        '</div><div class="ac-mchips">';
      items.forEach(function (ev) { html += chipHtml(ev, true); });
      html += '</div></div>';
    }
    html += '</div></div>';
    return html;
  }

  function renderYear(map, anchor, todayY) {
    var y = anchor.getFullYear();
    var html = '<div class="ac-year" aria-label="Year calendar">';
    for (var m = 0; m < 12; m++) {
      var gridStart = mondayOf(new Date(y, m, 1));
      var gridEnd = addDays(mondayOf(new Date(y, m + 1, 0)), 6);
      html += '<button type="button" class="ac-yminimonth" data-cal-goto-month="' + m + '" data-cal-goto-year="' + y + '">' +
        '<div class="ac-ymtitle">' + MONTHS[m] + '</div><div class="ac-ymhead">';
      SHORT.forEach(function (s) { html += '<span>' + s.charAt(0) + '</span>'; });
      html += '</div><div class="ac-ymbody">';
      for (var d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) {
        var k = ymd(d);
        var items = map[k] || [];
        var n = items.length;
        var names = items.map(function (e) { return (e.eventNo ? '#' + e.eventNo + ' ' : '') + (e.name || ''); }).join('; ');
        html += '<span class="ac-yday' + (d.getMonth() === m ? '' : ' out') + (n ? ' has' : '') +
          (k === todayY ? ' today' : '') + '" data-ymd="' + k + '" title="' + esc(k + (n ? ' · ' + n + ' · ' + names : '')) + '">' +
          d.getDate() + (n ? '<i>' + n + '</i>' : '') + '</span>';
      }
      html += '</div></button>';
    }
    html += '</div>';
    return html;
  }

  function toolbarHtml(span, label, paper, count) {
    return '<div class="ac-toolbar noprint">' +
      '<div class="ac-spans" role="tablist">' +
      '<button type="button" class="ac-span' + (span === 'week' ? ' on' : '') + '" data-cal-span="week">Week</button>' +
      '<button type="button" class="ac-span' + (span === 'month' ? ' on' : '') + '" data-cal-span="month">Month</button>' +
      '<button type="button" class="ac-span' + (span === 'year' ? ' on' : '') + '" data-cal-span="year">Year</button>' +
      '</div>' +
      '<div class="ac-nav">' +
      '<button type="button" data-cal-nav="-1" aria-label="Previous">‹</button>' +
      '<span class="ac-range">' + esc(label) + '</span>' +
      '<button type="button" data-cal-nav="1" aria-label="Next">›</button>' +
      '<button type="button" data-cal-nav="today">Today</button>' +
      '</div>' +
      '<div class="ac-printopts">' +
      '<label>Paper <select data-cal-paper>' +
      '<option value="A3"' + (paper === 'A3' ? ' selected' : '') + '>A3 landscape</option>' +
      '<option value="A4"' + (paper === 'A4' ? ' selected' : '') + '>A4 landscape</option>' +
      '</select></label> ' +
      '<button type="button" class="primary" data-cal-print="1">Print calendar</button>' +
      '</div>' +
      '<span class="ac-meta">' + count + ' function' + (count === 1 ? '' : 's') + ' stored</span>' +
      '<button type="button" class="danger" data-cal-clear="1" title="Clear all calendar events on this device">Clear calendar</button>' +
      '</div>';
  }

  function ensureCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('allocCalCss')) return;
    var s = document.createElement('style');
    s.id = 'allocCalCss';
    s.textContent = [
      '#allocCalCard .ac-wrap{margin-top:8px;}',
      '.ac-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 12px;}',
      '.ac-spans{display:inline-flex;border:1px solid #ccc;border-radius:8px;overflow:hidden;background:#fff;}',
      '.ac-span{border:0;background:transparent;padding:8px 12px;cursor:pointer;font:inherit;font-size:13px;}',
      '.ac-span.on{background:#1C1B16;color:#fff;}',
      '.ac-nav{display:inline-flex;align-items:center;gap:6px;}',
      '.ac-nav button{min-width:34px;height:34px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer;}',
      '.ac-range{font-weight:700;min-width:150px;text-align:center;}',
      '.ac-printopts{display:inline-flex;align-items:center;gap:8px;}',
      '.ac-meta{font-size:12px;color:#666;}',
      '.ac-note{font-size:12.5px;color:#5C5A52;margin:0 0 10px;}',
      '.ac-week,.ac-month{border:1px solid #ddd;border-radius:10px;overflow:hidden;background:#fff;}',
      '.ac-weekhead,.ac-weekbody,.ac-monthhead,.ac-monthbody{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));}',
      '.ac-colhead,.ac-mhd{padding:8px 4px;text-align:center;background:#FAF8F2;border-bottom:1px solid #ddd;font-size:12px;}',
      '.ac-dow{display:block;font-size:10px;color:#666;text-transform:uppercase;}',
      '.ac-dom{font-size:16px;font-weight:700;}',
      '.ac-colhead.today .ac-dom,.ac-mcell.today .ac-mdate{background:#1C1B16;color:#fff;border-radius:999px;padding:2px 8px;}',
      '.ac-daycol{min-height:180px;padding:6px;border-right:1px solid #eee;display:flex;flex-direction:column;gap:6px;}',
      '.ac-daycol:last-child{border-right:0;}',
      '.ac-daycol.today,.ac-mcell.today{background:#FFFDF5;}',
      '.ac-empty{color:#bbb;text-align:center;margin-top:20px;font-size:12px;}',
      '.ac-chip{border:1px solid #c9c3b4;border-radius:6px;padding:5px 6px;background:#F4F7FB;font-size:11px;line-height:1.3;overflow-wrap:anywhere;word-break:break-word;}',
      '.ac-chip-h{font-size:12px;margin-bottom:2px;}',
      '.ac-chip-m{color:#555;font-size:10.5px;margin-bottom:4px;}',
      '.ac-chip-d{margin:0;padding-left:14px;font-size:10.5px;}',
      '.ac-chip-d .ac-more{list-style:none;margin-left:-14px;color:#666;}',
      '.ac-mcell{min-height:120px;border-right:1px solid #eee;border-bottom:1px solid #eee;padding:4px;overflow:visible;}',
      '.ac-mcell.out{opacity:.45;background:#f7f5ef;}',
      '.ac-mdate{font-size:12px;font-weight:700;margin:0 0 4px;}',
      '.ac-count{font-weight:600;color:#1A56DB;font-size:11px;}',
      '.ac-mchips{display:flex;flex-direction:column;gap:3px;}',
      '.ac-year{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;}',
      '.ac-yminimonth{border:1px solid #ddd;border-radius:10px;padding:8px;background:#fff;text-align:left;cursor:pointer;font:inherit;}',
      '.ac-yminimonth:hover{box-shadow:0 0 0 2px #1C1B16;}',
      '.ac-ymtitle{font-weight:700;text-align:center;margin:0 0 6px;font-size:13px;}',
      '.ac-ymhead,.ac-ymbody{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;}',
      '.ac-ymhead span{font-size:9px;color:#666;}',
      '.ac-yday{position:relative;font-size:11px;padding:5px 0;border-radius:4px;}',
      '.ac-yday.out{opacity:.35;}',
      '.ac-yday.has{background:#E8F0FE;font-weight:700;}',
      '.ac-yday.has i{display:block;font-size:8px;font-style:normal;color:#1A56DB;}',
      '.ac-yday.today{outline:2px solid #1C1B16;}',
      '@media (max-width:720px){.ac-weekbody{grid-template-columns:1fr;}.ac-weekhead{display:none;}.ac-daycol{min-height:0;border-right:0;border-bottom:1px solid #eee;}}',
      /* Print — paper size set via @page from printCal */
      '@media print{',
      '  body.ac-cal-print *{visibility:hidden!important;}',
      '  body.ac-cal-print #allocCalPrint, body.ac-cal-print #allocCalPrint *{visibility:visible!important;}',
      '  body.ac-cal-print #allocCalPrint{position:absolute;left:0;top:0;width:100%;display:block!important;}',
      '  body.ac-cal-print{-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
      '  .ac-print-root{font-family:Calibri,Arial,sans-serif;}',
      '  .ac-print-root h1{font-size:16pt;margin:0 0 6pt;}',
      '  .ac-print-root .ac-print-sub{font-size:10pt;margin:0 0 10pt;color:#333;}',
      '  .ac-print-grid{width:100%;border-collapse:collapse;table-layout:fixed;}',
      '  .ac-print-grid th,.ac-print-grid td{border:1px solid #333;vertical-align:top;padding:4pt;overflow-wrap:anywhere;word-break:break-word;}',
      '  .ac-print-grid th{background:#FAF8F2;font-size:9pt;}',
      '  .ac-print-ev{margin:0 0 6pt;padding:3pt;border:0.5pt solid #999;border-radius:3pt;break-inside:avoid;}',
      '  .ac-print-ev b{font-size:inherit;}',
      '  .ac-print-ev ul{margin:2pt 0 0;padding-left:12pt;}',
      '  .ac-print-cont{page-break-before:always;}',
      '  .ac-print-year{display:grid;grid-template-columns:repeat(3,1fr);gap:8pt;}',
      '  .ac-print-ym{border:1px solid #333;padding:4pt;}',
      '}'
    ].join('');
    document.head.appendChild(s);
  }

  function renderPanel() {
    ensureCss();
    var host = document.getElementById('allocCalBody');
    if (!host) return;
    var open = isOpen();
    var toggle = document.getElementById('allocCalToggle');
    if (toggle) toggle.textContent = open ? 'Hide' : 'Show';
    host.hidden = !open;
    if (!open) return;

    var list = loadEvents();
    var map = byYmd(list);
    var span = getSpan();
    var anchor = getAnchor();
    if (!localStorage.getItem(ANCHOR_KEY) && list.length) {
      var first = parseIso(list[0].date);
      if (first) anchor = setAnchor(mondayOf(first));
    }
    var paper = getPaper();
    var todayY = ymd(new Date());
    var weekMon = mondayOf(anchor);
    var label = rangeLabel(span, span === 'week' ? weekMon : anchor);
    var html = '<div class="ac-wrap" id="allocCalInner">';
    html += toolbarHtml(span, label, paper, list.length);
    html += '<p class="ac-note">Functions from uploaded work orders (Larder + Plated). Accumulates on this device; duplicate event # + date merges. Year cells show counts — click a month to open it.</p>';
    if (span === 'week') html += renderWeek(map, weekMon, todayY);
    else if (span === 'month') html += renderMonth(map, new Date(anchor.getFullYear(), anchor.getMonth(), 1), todayY);
    else html += renderYear(map, new Date(anchor.getFullYear(), 0, 1), todayY);
    html += '</div>';
    host.innerHTML = html;
    bind(host);
  }

  function shiftAnchor(dir) {
    var span = getSpan();
    var a = getAnchor();
    if (dir === 'today') { setAnchor(mondayOf(new Date())); return; }
    var n = +dir || 0;
    if (span === 'year') setAnchor(new Date(a.getFullYear() + n, 0, 1));
    else if (span === 'month') setAnchor(new Date(a.getFullYear(), a.getMonth() + n, 1));
    else setAnchor(addDays(mondayOf(a), n * 7));
  }

  function bind(rootEl) {
    if (!rootEl || rootEl.__acBound) return;
    rootEl.__acBound = true;
    rootEl.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-cal-span],[data-cal-nav],[data-cal-print],[data-cal-clear],[data-cal-goto-month],.ac-yday.has');
      if (!t || !rootEl.contains(t)) return;
      if (t.getAttribute('data-cal-clear')) {
        if (!confirm('Clear all calendar functions stored on this device?')) return;
        clearEvents();
        renderPanel();
        return;
      }
      if (t.getAttribute('data-cal-print')) {
        printCal();
        return;
      }
      var span = t.getAttribute('data-cal-span');
      if (span) { setSpan(span); renderPanel(); return; }
      var nav = t.getAttribute('data-cal-nav');
      if (nav != null) { shiftAnchor(nav); renderPanel(); return; }
      var gm = t.getAttribute('data-cal-goto-month');
      if (gm != null) {
        var gy = +t.getAttribute('data-cal-goto-year');
        setAnchor(new Date(gy, +gm, 1));
        setSpan('month');
        renderPanel();
        return;
      }
      if (t.classList.contains('ac-yday') && t.getAttribute('data-ymd')) {
        var parts = t.getAttribute('data-ymd').split('-');
        setAnchor(new Date(+parts[0], +parts[1] - 1, +parts[2]));
        setSpan('week');
        renderPanel();
      }
    });
    rootEl.addEventListener('change', function (ev) {
      if (ev.target && ev.target.getAttribute('data-cal-paper') != null) {
        setPaper(ev.target.value);
      }
    });
  }

  /** Build print HTML with full event details; split overflow days onto continuation pages. */
  function buildPrintHtml(paper) {
    var list = loadEvents();
    var map = byYmd(list);
    var span = getSpan();
    var anchor = getAnchor();
    var weekMon = mondayOf(anchor);
    var label = rangeLabel(span, span === 'week' ? weekMon : anchor);
    var baseFs = paper === 'A4' ? 8.5 : 10; /* pt — auto-scale further if crowded */

    function dayEventsHtml(items, fs) {
      return items.map(function (ev) {
        var dishes = ev.dishes || [];
        return '<div class="ac-print-ev" style="font-size:' + fs + 'pt">' +
          '<b>#' + esc(ev.eventNo || '—') + ' · ' + esc(ev.name || 'Function') + '</b><br>' +
          esc(ev.date) + (ev.pax ? ' · ' + esc(String(ev.pax)) + ' pax' : '') +
          (ev.section ? ' · ' + esc(ev.section) : '') +
          (dishes.length
            ? '<ul>' + dishes.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>'
            : '') +
          '</div>';
      }).join('');
    }

    function busyScore(items) {
      var n = 0;
      (items || []).forEach(function (e) { n += 1 + (e.dishes ? e.dishes.length : 0); });
      return n;
    }

    var maxBusy = 0;
    Object.keys(map).forEach(function (k) {
      maxBusy = Math.max(maxBusy, busyScore(map[k]));
    });
    /* Scale font down when a day is packed */
    var fs = baseFs;
    if (maxBusy > 40) fs = Math.max(6, baseFs - 2);
    if (maxBusy > 70) fs = Math.max(5.5, baseFs - 3);

    var pages = [];
    var head = '<div class="ac-print-root" data-paper="' + paper + '">' +
      '<h1>Work order calendar · ' + esc(label) + '</h1>' +
      '<p class="ac-print-sub">' + paper + ' landscape · ' + list.length + ' functions · details wrap; busy days continue on following pages</p>';

    if (span === 'year') {
      var y = anchor.getFullYear();
      var body = '<div class="ac-print-year">';
      for (var m = 0; m < 12; m++) {
        var monthEvents = [];
        Object.keys(map).forEach(function (k) {
          if (k.indexOf(y + '-' + pad2(m + 1)) === 0) monthEvents = monthEvents.concat(map[k]);
        });
        body += '<div class="ac-print-ym"><b>' + MONTHS[m] + '</b><div style="font-size:' + fs + 'pt">';
        if (!monthEvents.length) body += '<span style="color:#888">—</span>';
        else {
          var byDay = {};
          monthEvents.forEach(function (e) {
            if (!byDay[e.date]) byDay[e.date] = [];
            byDay[e.date].push(e);
          });
          Object.keys(byDay).sort().forEach(function (dk) {
            body += '<div style="margin:3pt 0"><u>' + esc(dk) + '</u> (' + byDay[dk].length + ')</div>';
            body += dayEventsHtml(byDay[dk], fs);
          });
        }
        body += '</div></div>';
      }
      body += '</div>';
      pages.push(head + body + '</div>');
    } else {
      /* Week or month as 7-col table; overflow events → continuation */
      var days = [];
      if (span === 'week') {
        for (var i = 0; i < 7; i++) days.push(addDays(weekMon, i));
      } else {
        var y2 = anchor.getFullYear(), m2 = anchor.getMonth();
        var gs = mondayOf(new Date(y2, m2, 1));
        var ge = addDays(mondayOf(new Date(y2, m2 + 1, 0)), 6);
        for (var d = new Date(gs); d <= ge; d = addDays(d, 1)) days.push(new Date(d));
      }

      /* First page: all days with a soft cap of events inline; remainder → cont pages */
      var CAP = paper === 'A4' ? 4 : 6;
      var leftovers = [];
      var table = '<table class="ac-print-grid"><thead><tr>';
      if (span === 'week') {
        days.forEach(function (d, idx) {
          table += '<th>' + SHORT[idx] + ' ' + d.getDate() + '/' + (d.getMonth() + 1) + '</th>';
        });
        table += '</tr></thead><tbody><tr>';
        days.forEach(function (d) {
          var k = ymd(d);
          var items = (map[k] || []).slice();
          var show = items.slice(0, CAP);
          var rest = items.slice(CAP);
          if (rest.length) leftovers.push({ date: k, items: rest });
          table += '<td style="font-size:' + fs + 'pt">' +
            (show.length ? dayEventsHtml(show, fs) : '—') +
            (rest.length ? '<div style="font-size:8pt;color:#444">+' + rest.length + ' more → cont.</div>' : '') +
            '</td>';
        });
        table += '</tr></tbody></table>';
      } else {
        /* Month: rows of weeks */
        table = '<table class="ac-print-grid"><thead><tr>';
        SHORT.forEach(function (s) { table += '<th>' + s + '</th>'; });
        table += '</tr></thead><tbody>';
        for (var wi = 0; wi < days.length; wi += 7) {
          table += '<tr>';
          for (var di = 0; di < 7; di++) {
            var dd = days[wi + di];
            if (!dd) { table += '<td></td>'; continue; }
            var kk = ymd(dd);
            var items2 = (map[kk] || []).slice();
            var show2 = items2.slice(0, CAP);
            var rest2 = items2.slice(CAP);
            if (rest2.length) leftovers.push({ date: kk, items: rest2 });
            var inM = dd.getMonth() === anchor.getMonth();
            table += '<td style="font-size:' + fs + 'pt;opacity:' + (inM ? '1' : '.45') + '">' +
              '<div style="font-weight:700">' + dd.getDate() + '</div>' +
              (show2.length ? dayEventsHtml(show2, fs) : '') +
              (rest2.length ? '<div style="font-size:8pt">+' + rest2.length + ' → cont.</div>' : '') +
              '</td>';
          }
          table += '</tr>';
        }
        table += '</tbody></table>';
      }
      pages.push(head + table + '</div>');

      leftovers.forEach(function (block) {
        pages.push(
          '<div class="ac-print-root ac-print-cont" data-paper="' + paper + '">' +
          '<h1>Continuation · ' + esc(block.date) + '</h1>' +
          '<p class="ac-print-sub">Overflow from busy day — full function details</p>' +
          dayEventsHtml(block.items, Math.max(fs, 8)) +
          '</div>'
        );
      });
    }
    return pages.join('');
  }

  function printCal(paperOverride) {
    var paper = setPaper(paperOverride || getPaper());
    ensureCss();
    var holder = document.getElementById('allocCalPrint');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'allocCalPrint';
      holder.style.display = 'none';
      document.body.appendChild(holder);
    }
    holder.innerHTML = buildPrintHtml(paper);
    /* Dynamic @page size */
    var pageStyle = document.getElementById('allocCalPageCss');
    if (!pageStyle) {
      pageStyle = document.createElement('style');
      pageStyle.id = 'allocCalPageCss';
      document.head.appendChild(pageStyle);
    }
    var size = paper === 'A4' ? 'A4 landscape' : 'A3 landscape';
    pageStyle.textContent = '@page{size:' + size + ';margin:10mm;}';
    document.body.classList.add('ac-cal-print');
    var clear = function () {
      document.body.classList.remove('ac-cal-print');
      window.removeEventListener('afterprint', clear);
    };
    window.addEventListener('afterprint', clear);
    window.print();
    setTimeout(clear, 2500);
    return { paper: paper, html: holder.innerHTML };
  }

  /** Ingest after WO upload / allocation build. */
  function ingestFromAllocation(wo, res, meta) {
    meta = Object.assign({}, meta || {});
    if (res && res.kitchenSection) meta.kitchenSection = res.kitchenSection;
    if (res && res.functions) meta.functions = res.functions;
    var incoming = eventsFromWorkOrder(wo, meta);
    var list = mergeEvents(incoming);
    /* Seed anchor to first event week if empty store was just filled */
    if (list.length) {
      var d = parseIso(list[0].date);
      if (d && !localStorage.getItem(ANCHOR_KEY)) setAnchor(mondayOf(d));
    }
    renderPanel();
    return list;
  }

  function boot() {
    ensureCss();
    var toggle = document.getElementById('allocCalToggle');
    if (toggle && !toggle.__ac) {
      toggle.__ac = true;
      toggle.addEventListener('click', function () {
        setOpen(!isOpen());
        renderPanel();
      });
    }
    renderPanel();
  }

  root.AllocCalendar = {
    VERSION: '4.8.37',
    eventsFromWorkOrder: eventsFromWorkOrder,
    mergeEvents: mergeEvents,
    clearEvents: clearEvents,
    loadEvents: loadEvents,
    ingestFromAllocation: ingestFromAllocation,
    renderPanel: renderPanel,
    printCal: printCal,
    buildPrintHtml: buildPrintHtml,
    getPaper: getPaper,
    setPaper: setPaper,
    setOpen: setOpen,
    isOpen: isOpen,
    getSpan: getSpan,
    setSpan: setSpan,
    setAnchor: setAnchor,
    boot: boot
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : this);
