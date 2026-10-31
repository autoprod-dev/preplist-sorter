/* Prepline 4.8.6 / 4.8.8 — Calendar-app Week/Month/Year grids + hide Team ops (trial).
 * Week/Month/Year look like Google/Outlook (day columns, date cells, coloured chips).
 * Print CSS makes each span look like a paper calendar (print-color-adjust: exact).
 * 4.8.8: Print calendar was blank because upgrades-47 station CSS hid body * on every
 * print; station CSS is now scoped, and this file forces #u486Cal visible in print.
 * Team ops (Roster / Dispatch / Morning brief / Swap) hidden for now; code kept.
 */
(function (root) {
  'use strict';

  var WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var SPAN_KEY = 'prepline.calSpan.v1';
  var ANCHOR_KEY = 'prepline.calAnchor.v1';
  /* Flip to false to bring Team ops back in the UI. */
  var HIDE_TEAM_OPS = true;
  var TEAM_VIEWS = { roster47: 1, dispatch47: 1, brief47: 1, swap47: 1 };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function mondayOf(d) {
    d = startOfDay(d);
    var offset = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - offset);
    return d;
  }
  function addDays(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }
  function parseAuDate(s) {
    if (!s) return null;
    var m = String(s).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (!m) return null;
    var dd = +m[1], mm = +m[2], yy = +m[3];
    if (yy < 100) yy += 2000;
    if (!dd || !mm || mm > 12 || dd > 31) return null;
    var d = new Date(yy, mm - 1, dd);
    if (d.getFullYear() !== yy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
    return d;
  }
  function dayNameIdx(name) {
    return WEEKDAYS.indexOf(name);
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

  function sectionColour(sec) {
    var U = root.PreplineUpgrades47;
    if (U && typeof U.sectionColour === 'function') return U.sectionColour(sec);
    return { css: '#F2F2F2', ink: '#5C5A52', short: sec || '—' };
  }

  /** Infer Monday of the operational week from event dates / today. */
  function inferWeekMonday(rows, helpers) {
    helpers = helpers || {};
    var getDate = helpers.getEventDateStr;
    var dates = [];
    if (typeof getDate === 'function') {
      var seen = {};
      (rows || []).forEach(function (r) {
        var ds = getDate(r.dish);
        var d = parseAuDate(ds);
        if (d && !seen[ymd(d)]) { seen[ymd(d)] = 1; dates.push(d); }
      });
    }
    if (typeof eventDateByDish !== 'undefined' && eventDateByDish) {
      Object.keys(eventDateByDish).forEach(function (k) {
        var d = parseAuDate(eventDateByDish[k]);
        if (d) dates.push(d);
      });
    }
    if (dates.length) {
      dates.sort(function (a, b) { return a - b; });
      return mondayOf(dates[0]);
    }
    return mondayOf(new Date());
  }

  function buildBatches(rows, deps) {
    if (root.PreplineBatch && root.PreplineBatch.buildBatches) {
      return root.PreplineBatch.buildBatches(rows, deps) || [];
    }
    return (rows || []).map(function (r) {
      return {
        taskLabel: r.task, day: r.day || '', section: r.section || '',
        total: 0, hasTotal: false, unit: r.unit || '', rows: [r],
        dishes: [r.dish], merged: false, covers: '', batchKey: r.task
      };
    });
  }

  /** Map each batch onto a calendar YMD (prep weekday → focused week; or absolute if known). */
  function placeItems(rows, deps, helpers, weekMon) {
    helpers = helpers || {};
    var clean = helpers.cleanDishName || function (d) { return d; };
    var qN = helpers.qN || function (n) { return String(n); };
    var qU = helpers.qU || function (n, u) { return u || ''; };
    var batches = buildBatches(rows, deps);
    var byYmd = {};
    var unscheduled = [];
    batches.forEach(function (g) {
      var di = dayNameIdx(g.day);
      var date = null;
      if (di >= 0) date = addDays(weekMon, di);
      var sc = sectionColour(g.section);
      var qty = g.hasTotal ? (qN(g.total, g.unit) + ' ' + qU(g.total, g.unit)) : '';
      var dishes = (g.dishes || []).map(clean).filter(Boolean);
      var item = {
        key: (g.batchKey || g.taskLabel || '') + '|' + (g.day || ''),
        label: g.taskLabel || 'Task',
        section: g.section || '',
        shortSec: sc.short || '',
        bg: sc.css || '#F2F2F2',
        ink: sc.ink || '#5C5A52',
        qty: String(qty || '').trim(),
        dishes: dishes.slice(0, 2).join(', '),
        day: g.day || '',
        covers: g.covers || '',
        group: g
      };
      if (!date) { unscheduled.push(item); return; }
      var k = ymd(date);
      if (!byYmd[k]) byYmd[k] = [];
      byYmd[k].push(item);
    });
    return { byYmd: byYmd, unscheduled: unscheduled, batches: batches };
  }

  function chipHtml(item, compact) {
    var title = esc(item.label) + (item.dishes ? ' — ' + esc(item.dishes) : '') +
      (item.qty ? ' · ' + esc(item.qty) : '');
    var body = compact
      ? esc(item.label)
      : ('<b>' + esc(item.label) + '</b>' +
        (item.dishes ? '<span class="u486-chip-sub">' + esc(item.dishes) + '</span>' : '') +
        (item.qty ? '<span class="u486-chip-qty">' + esc(item.qty) + '</span>' : ''));
    return '<div class="u486-chip" style="background:' + esc(item.bg) + ';color:' + esc(item.ink) +
      ';border-color:' + esc(item.ink) + '" title="' + title + '">' + body + '</div>';
  }

  function toolbarHtml(span, anchor, label) {
    return '<div class="u486-toolbar no-print" id="u486Toolbar">' +
      '<div class="u486-spans" role="tablist" aria-label="Calendar span">' +
      '<button type="button" class="u486-span' + (span === 'week' ? ' on' : '') + '" data-cal-span="week">Week</button>' +
      '<button type="button" class="u486-span' + (span === 'month' ? ' on' : '') + '" data-cal-span="month">Month</button>' +
      '<button type="button" class="u486-span' + (span === 'year' ? ' on' : '') + '" data-cal-span="year">Year</button>' +
      '</div>' +
      '<div class="u486-nav">' +
      '<button type="button" class="u486-navbtn" data-cal-nav="-1" aria-label="Previous">‹</button>' +
      '<span class="u486-range" id="u486Range">' + esc(label) + '</span>' +
      '<button type="button" class="u486-navbtn" data-cal-nav="1" aria-label="Next">›</button>' +
      '<button type="button" class="u486-navbtn" data-cal-nav="today">Today</button>' +
      '</div>' +
      '<button type="button" class="u486-printbtn" data-cal-print="1">Print calendar</button>' +
      '</div>';
  }

  function legendHtml() {
    var U = root.PreplineUpgrades47;
    var order = (U && U.SECTION_ORDER) || [];
    if (!order.length) return '';
    var html = '<div class="u486-legend no-print">';
    order.forEach(function (sec) {
      var sc = sectionColour(sec);
      html += '<span class="u486-leg"><i style="background:' + esc(sc.css) + ';border-color:' + esc(sc.ink) + '"></i>' +
        esc(sc.short || sec) + '</span>';
    });
    html += '</div>';
    return html;
  }

  function renderWeekGrid(placed, weekMon, todayY) {
    var html = '<div class="u486-weekgrid" role="grid" aria-label="Week calendar">';
    html += '<div class="u486-weekhead">';
    for (var i = 0; i < 7; i++) {
      var d = addDays(weekMon, i);
      var isToday = ymd(d) === todayY;
      html += '<div class="u486-colhead' + (isToday ? ' today' : '') + '">' +
        '<span class="u486-dow">' + SHORT[i] + '</span>' +
        '<span class="u486-dom">' + d.getDate() + '</span></div>';
    }
    html += '</div><div class="u486-weekbody">';
    for (var j = 0; j < 7; j++) {
      var day = addDays(weekMon, j);
      var k = ymd(day);
      var items = placed.byYmd[k] || [];
      var isToday2 = k === todayY;
      html += '<div class="u486-daycol' + (isToday2 ? ' today' : '') + '" data-ymd="' + k + '">';
      if (!items.length) html += '<div class="u486-empty">—</div>';
      else items.forEach(function (it) { html += chipHtml(it, false); });
      html += '</div>';
    }
    html += '</div></div>';
    return html;
  }

  function renderMonthGrid(placed, anchor, todayY) {
    var y = anchor.getFullYear(), m = anchor.getMonth();
    var first = new Date(y, m, 1);
    var gridStart = mondayOf(first);
    var last = new Date(y, m + 1, 0);
    var gridEnd = addDays(mondayOf(last), 6);
    var html = '<div class="u486-monthgrid" role="grid" aria-label="Month calendar">';
    html += '<div class="u486-monthhead">';
    SHORT.forEach(function (s) { html += '<div class="u486-mhd">' + s + '</div>'; });
    html += '</div><div class="u486-monthbody">';
    for (var d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) {
      var k = ymd(d);
      var inMonth = d.getMonth() === m;
      var isToday = k === todayY;
      var items = placed.byYmd[k] || [];
      html += '<div class="u486-mcell' + (inMonth ? '' : ' out') + (isToday ? ' today' : '') + '" data-ymd="' + k + '">' +
        '<div class="u486-mdate">' + d.getDate() + '</div><div class="u486-mchips">';
      var max = 4;
      items.slice(0, max).forEach(function (it) { html += chipHtml(it, true); });
      if (items.length > max) html += '<div class="u486-more">+' + (items.length - max) + ' more</div>';
      html += '</div></div>';
    }
    html += '</div></div>';
    return html;
  }

  function renderYearGrid(placed, anchor, todayY) {
    var y = anchor.getFullYear();
    var html = '<div class="u486-yeargrid" aria-label="Year calendar">';
    for (var m = 0; m < 12; m++) {
      var first = new Date(y, m, 1);
      var gridStart = mondayOf(first);
      var last = new Date(y, m + 1, 0);
      var gridEnd = addDays(mondayOf(last), 6);
      html += '<div class="u486-yminimonth"><div class="u486-ymtitle">' + MONTHS[m] + '</div>';
      html += '<div class="u486-ymhead">';
      SHORT.forEach(function (s) { html += '<span>' + s.charAt(0) + '</span>'; });
      html += '</div><div class="u486-ymbody">';
      for (var d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) {
        var k = ymd(d);
        var inMonth = d.getMonth() === m;
        var n = (placed.byYmd[k] || []).length;
        var isToday = k === todayY;
        html += '<span class="u486-yday' + (inMonth ? '' : ' out') + (n ? ' has' : '') +
          (isToday ? ' today' : '') + '" data-ymd="' + k + '" title="' + k + (n ? ' · ' + n + ' items' : '') + '">' +
          d.getDate() + (n ? '<i></i>' : '') + '</span>';
      }
      html += '</div></div>';
    }
    html += '</div>';
    return html;
  }

  function unscheduledHtml(list) {
    if (!list || !list.length) return '';
    var html = '<div class="u486-unscheduled"><b>Unscheduled</b> <span class="meta">' + list.length + '</span><div class="u486-unschips">';
    list.forEach(function (it) { html += chipHtml(it, false); });
    html += '</div></div>';
    return html;
  }

  function rangeLabel(span, anchor) {
    if (span === 'year') return String(anchor.getFullYear());
    if (span === 'month') return MONTHS[anchor.getMonth()] + ' ' + anchor.getFullYear();
    var mon = mondayOf(anchor);
    var sun = addDays(mon, 6);
    var sameMonth = mon.getMonth() === sun.getMonth();
    if (sameMonth) {
      return mon.getDate() + '–' + sun.getDate() + ' ' + MONTHS[mon.getMonth()] + ' ' + mon.getFullYear();
    }
    return mon.getDate() + ' ' + MONTHS[mon.getMonth()].slice(0, 3) + ' – ' +
      sun.getDate() + ' ' + MONTHS[sun.getMonth()].slice(0, 3) + ' ' + sun.getFullYear();
  }

  function renderCalendarView(rows, deps, helpers) {
    helpers = helpers || {};
    ensureCss();
    var span = getSpan();
    var stored = getAnchor();
    // First visit: seed from data week if anchor looks like "today Monday" default and data exists
    if (!localStorage.getItem(ANCHOR_KEY)) {
      stored = setAnchor(inferWeekMonday(rows, helpers));
    }
    var anchor = stored;
    var weekMon = mondayOf(anchor);
    var placeMon = weekMon;
    if (span === 'month') placeMon = mondayOf(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    if (span === 'year') placeMon = mondayOf(new Date(anchor.getFullYear(), 0, 1));
    // For month/year, map weekday-named prep onto EVERY matching weekday in the visible range
    // by expanding: place on the focused week's weekday, AND any other weeks in range by weekday match.
    var placed = placeItemsExpanded(rows, deps, helpers, span, anchor);
    var todayY = ymd(new Date());
    var label = rangeLabel(span, span === 'week' ? weekMon : anchor);
    var html = '<div class="u486-cal" id="u486Cal" data-span="' + span + '">';
    html += toolbarHtml(span, anchor, label);
    html += legendHtml();
    html += '<div class="u486-note no-print">Prep-day calendar — tasks sit on the day they are prepped, as coloured blocks (same section colours as the rest of Prepline).</div>';
    if (span === 'week') html += renderWeekGrid(placed, weekMon, todayY);
    else if (span === 'month') html += renderMonthGrid(placed, new Date(anchor.getFullYear(), anchor.getMonth(), 1), todayY);
    else html += renderYearGrid(placed, new Date(anchor.getFullYear(), 0, 1), todayY);
    html += unscheduledHtml(placed.unscheduled);
    html += '</div>';
    return html;
  }

  /** Place weekday-named items onto all matching weekdays in the visible span. */
  function placeItemsExpanded(rows, deps, helpers, span, anchor) {
    helpers = helpers || {};
    var clean = helpers.cleanDishName || function (d) { return d; };
    var qN = helpers.qN || function (n) { return String(n); };
    var qU = helpers.qU || function (n, u) { return u || ''; };
    var batches = buildBatches(rows, deps);
    var byYmd = {};
    var unscheduled = [];
    var rangeStart, rangeEnd;
    if (span === 'week') {
      rangeStart = mondayOf(anchor);
      rangeEnd = addDays(rangeStart, 6);
    } else if (span === 'month') {
      var first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      rangeStart = mondayOf(first);
      rangeEnd = addDays(mondayOf(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)), 6);
    } else {
      rangeStart = new Date(anchor.getFullYear(), 0, 1);
      rangeEnd = new Date(anchor.getFullYear(), 11, 31);
    }
    // Prefer absolute event→prep when we only have weekday: put on focused week for week span;
    // for month/year put on every occurrence of that weekday in range (prep pattern repeats weekly).
    batches.forEach(function (g) {
      var di = dayNameIdx(g.day);
      var sc = sectionColour(g.section);
      var qty = g.hasTotal ? (qN(g.total, g.unit) + ' ' + qU(g.total, g.unit)) : '';
      var dishes = (g.dishes || []).map(clean).filter(Boolean);
      var item = {
        key: (g.batchKey || g.taskLabel || '') + '|' + (g.day || ''),
        label: g.taskLabel || 'Task',
        section: g.section || '',
        shortSec: sc.short || '',
        bg: sc.css || '#F2F2F2',
        ink: sc.ink || '#5C5A52',
        qty: String(qty || '').trim(),
        dishes: dishes.slice(0, 2).join(', '),
        day: g.day || '',
        covers: g.covers || '',
        group: g
      };
      if (di < 0) { unscheduled.push(item); return; }
      if (span === 'week') {
        var d0 = addDays(mondayOf(anchor), di);
        var k0 = ymd(d0);
        if (!byYmd[k0]) byYmd[k0] = [];
        byYmd[k0].push(item);
      } else if (span === 'month') {
        // Every matching weekday in the focused month (weekly prep pattern)
        for (var d = new Date(rangeStart); d <= rangeEnd; d = addDays(d, 1)) {
          if (d.getMonth() !== anchor.getMonth()) continue;
          if (((d.getDay() + 6) % 7) !== di) continue;
          var k = ymd(d);
          if (!byYmd[k]) byYmd[k] = [];
          byYmd[k].push(Object.assign({}, item));
        }
      } else {
        // Year: one chip per month on the first matching weekday (keeps mini-months readable)
        for (var d = new Date(rangeStart); d <= rangeEnd; d = addDays(d, 1)) {
          if (((d.getDay() + 6) % 7) !== di) continue;
          var k = ymd(d);
          if (!byYmd[k]) byYmd[k] = [];
          byYmd[k].push(Object.assign({}, item));
          var nextMonth = d.getMonth();
          while (d.getMonth() === nextMonth && d <= rangeEnd) d = addDays(d, 1);
          d = addDays(d, -1);
        }
      }
    });
    return { byYmd: byYmd, unscheduled: unscheduled, batches: batches };
  }

  function shiftAnchor(dir) {
    var span = getSpan();
    var a = getAnchor();
    if (dir === 'today') {
      setAnchor(mondayOf(new Date()));
      return;
    }
    var n = +dir || 0;
    if (span === 'year') setAnchor(new Date(a.getFullYear() + n, 0, 1));
    else if (span === 'month') setAnchor(new Date(a.getFullYear(), a.getMonth() + n, 1));
    else setAnchor(addDays(mondayOf(a), n * 7));
  }

  function bindCalControls(rootEl, onChange) {
    if (!rootEl || rootEl.__u486Bound) return;
    rootEl.__u486Bound = true;
    rootEl.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-cal-span],[data-cal-nav],[data-cal-print],.u486-yday.has,.u486-mcell');
      if (!t || !rootEl.contains(t)) return;
      if (t.getAttribute('data-cal-print')) {
        try {
          document.body.classList.add('u486-cal-print');
          var clear = function () {
            document.body.classList.remove('u486-cal-print');
            window.removeEventListener('afterprint', clear);
          };
          window.addEventListener('afterprint', clear);
          window.print();
          /* Fallback if afterprint never fires (some WebViews). */
          setTimeout(clear, 2000);
        } catch (e) {
          document.body.classList.remove('u486-cal-print');
        }
        return;
      }
      var span = t.getAttribute('data-cal-span');
      if (span) {
        setSpan(span);
        if (typeof onChange === 'function') onChange();
        else if (typeof root.render === 'function') root.render();
        return;
      }
      var nav = t.getAttribute('data-cal-nav');
      if (nav != null) {
        shiftAnchor(nav);
        if (typeof onChange === 'function') onChange();
        else if (typeof root.render === 'function') root.render();
        return;
      }
      // Year day with items → jump to week
      if (t.classList.contains('u486-yday') && t.getAttribute('data-ymd')) {
        var parts = t.getAttribute('data-ymd').split('-');
        setAnchor(new Date(+parts[0], +parts[1] - 1, +parts[2]));
        setSpan('week');
        if (typeof onChange === 'function') onChange();
        else if (typeof root.render === 'function') root.render();
      }
    });
  }

  function css() {
    return [
      '.u486-cal{margin:0 0 16px;}',
      '.u486-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 10px;justify-content:space-between;}',
      '.u486-spans{display:inline-flex;border:1px solid var(--line,#D9D3C3);border-radius:10px;overflow:hidden;background:#fff;}',
      '.u486-span{border:0;background:transparent;padding:8px 14px;font:inherit;font-size:13px;cursor:pointer;color:#5C5A52;}',
      '.u486-span.on{background:#1C1B16;color:#fff;}',
      '.u486-nav{display:inline-flex;align-items:center;gap:6px;}',
      '.u486-navbtn{min-width:36px;height:36px;border:1px solid var(--line,#D9D3C3);border-radius:8px;background:#fff;cursor:pointer;font-size:16px;padding:0 10px;}',
      '.u486-range{font-weight:700;font-size:15px;min-width:160px;text-align:center;}',
      '.u486-printbtn{height:36px;padding:0 12px;border:1px solid var(--line,#D9D3C3);border-radius:8px;background:#fff;cursor:pointer;font:inherit;font-size:13px;}',
      '.u486-note{font-size:12.5px;color:var(--ink-soft,#5C5A52);margin:0 0 10px;}',
      '.u486-legend{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px;font-size:11px;color:#5C5A52;}',
      '.u486-leg{display:inline-flex;align-items:center;gap:4px;}',
      '.u486-leg i{width:12px;height:12px;border-radius:3px;border:1px solid;display:inline-block;}',
      /* Week grid */
      '.u486-weekgrid{border:1px solid var(--line,#D9D3C3);border-radius:12px;overflow:hidden;background:#fff;}',
      '.u486-weekhead,.u486-weekbody{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));}',
      '.u486-colhead{padding:8px 6px;text-align:center;border-bottom:1px solid var(--line,#D9D3C3);background:#FAF8F2;}',
      '.u486-colhead.today .u486-dom{background:#1C1B16;color:#fff;border-radius:999px;display:inline-flex;width:28px;height:28px;align-items:center;justify-content:center;}',
      '.u486-dow{display:block;font-size:11px;color:#5C5A52;text-transform:uppercase;letter-spacing:.04em;}',
      '.u486-dom{display:inline-block;font-size:18px;font-weight:700;margin-top:2px;}',
      '.u486-daycol{min-height:220px;padding:6px;border-right:1px solid #EEEAE0;display:flex;flex-direction:column;gap:4px;align-items:stretch;}',
      '.u486-daycol:last-child{border-right:0;}',
      '.u486-daycol.today{background:#FFFDF5;}',
      '.u486-empty{color:#C4BDA8;font-size:12px;text-align:center;margin-top:12px;}',
      /* Chips */
      '.u486-chip{border:1px solid;border-radius:6px;padding:4px 6px;font-size:11px;line-height:1.25;cursor:default;overflow:hidden;}',
      '.u486-chip b{display:block;font-size:11.5px;}',
      '.u486-chip-sub,.u486-chip-qty{display:block;opacity:.85;font-size:10px;}',
      /* Month */
      '.u486-monthgrid{border:1px solid var(--line,#D9D3C3);border-radius:12px;overflow:hidden;background:#fff;}',
      '.u486-monthhead,.u486-monthbody{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));}',
      '.u486-mhd{padding:8px;text-align:center;font-size:11px;color:#5C5A52;background:#FAF8F2;border-bottom:1px solid var(--line,#D9D3C3);text-transform:uppercase;}',
      '.u486-mcell{min-height:110px;border-right:1px solid #EEEAE0;border-bottom:1px solid #EEEAE0;padding:4px;vertical-align:top;}',
      '.u486-mcell.out{background:#F7F5EF;opacity:.55;}',
      '.u486-mcell.today{background:#FFFDF5;box-shadow:inset 0 0 0 2px #1C1B16;}',
      '.u486-mdate{font-size:12px;font-weight:700;margin:0 0 4px;}',
      '.u486-mchips{display:flex;flex-direction:column;gap:2px;}',
      '.u486-mchips .u486-chip{padding:2px 4px;font-size:10px;white-space:nowrap;text-overflow:ellipsis;}',
      '.u486-more{font-size:10px;color:#5C5A52;padding:2px;}',
      /* Year */
      '.u486-yeargrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;}',
      '.u486-yminimonth{border:1px solid var(--line,#D9D3C3);border-radius:10px;padding:8px;background:#fff;}',
      '.u486-ymtitle{font-weight:700;font-size:13px;margin:0 0 6px;text-align:center;}',
      '.u486-ymhead,.u486-ymbody{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;}',
      '.u486-ymhead span{font-size:9px;color:#5C5A52;}',
      '.u486-yday{position:relative;font-size:11px;padding:4px 0;border-radius:4px;cursor:default;}',
      '.u486-yday.out{opacity:.35;}',
      '.u486-yday.has{background:#E8F0FE;font-weight:700;cursor:pointer;}',
      '.u486-yday.has i{position:absolute;bottom:1px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:#1A56DB;}',
      '.u486-yday.today{outline:2px solid #1C1B16;}',
      '.u486-unscheduled{margin-top:14px;padding:10px;border:1px dashed var(--line,#D9D3C3);border-radius:10px;background:#FAF8F2;}',
      '.u486-unschips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}',
      /* Hide Team ops */
      'body.u486-hide-team #u480Team{display:none!important;}',
      'body.u486-hide-team #brief47ViewBtn,body.u486-hide-team #roster47ViewBtn,body.u486-hide-team #dispatch47ViewBtn,body.u486-hide-team #swap47ViewBtn{display:none!important;}',
      /* Phone */
      '@media (max-width:720px){',
      '  .u486-weekbody{grid-template-columns:1fr;}',
      '  .u486-weekhead{display:none;}',
      '  .u486-daycol{min-height:0;border-right:0;border-bottom:1px solid #EEEAE0;}',
      '  .u486-daycol::before{content:attr(data-ymd);font-size:11px;font-weight:700;color:#5C5A52;margin-bottom:4px;}',
      '  .u486-monthbody{grid-template-columns:repeat(7,minmax(0,1fr));}',
      '  .u486-mcell{min-height:64px;}',
      '}',
      /* Paper-calendar print — force calendar visible (station CSS used to blank it). */
      '@media print{',
      '  body.u486-cal-print{-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
      '  body.u486-cal-print .no-print,body.u486-cal-print .u480-groups,body.u486-cal-print .u47-plan-toggle,',
      '  body.u486-cal-print #dbPanel,body.u486-cal-print .u47-progress,body.u486-cal-print #u47Progress,',
      '  body.u486-cal-print .shell-masthead,body.u486-cal-print .masthead,body.u486-cal-print #proPanel,',
      '  body.u486-cal-print #weeklyPanel,body.u486-cal-print #paxPanelWrap,body.u486-cal-print #staffingPanelWrap,',
      '  body.u486-cal-print #poPanel,body.u486-cal-print .yield-panel,body.u486-cal-print #masterSummaryPanel,',
      '  body.u486-cal-print .version-switch,body.u486-cal-print .search-bar,body.u486-cal-print .print-order-ctl,',
      '  body.u486-cal-print footer{display:none!important;}',
      '  body.u486-cal-print #resultsArea,body.u486-cal-print #resultsArea *{box-shadow:none!important;}',
      '  body.u486-cal-print #u486Cal,body.u486-cal-print #u486Cal *{visibility:visible!important;}',
      '  body.u486-cal-print #u486Cal{display:block!important;position:relative;left:auto;top:auto;width:100%;}',
      '  body.u486-cal-print .u486-toolbar.no-print{display:flex!important;visibility:visible!important;}',
      '  body.u486-cal-print .u486-toolbar .u486-spans,body.u486-cal-print .u486-toolbar .u486-range{display:inline-flex!important;visibility:visible!important;}',
      '  body.u486-cal-print .u486-toolbar .u486-printbtn,body.u486-cal-print .u486-toolbar .u486-navbtn{display:none!important;}',
      '  body.u486-cal-print .u486-legend{display:flex!important;visibility:visible!important;}',
      '  body.u486-cal-print .u486-weekgrid,body.u486-cal-print .u486-monthgrid,body.u486-cal-print .u486-yeargrid,',
      '  body.u486-cal-print .u486-weekhead,body.u486-cal-print .u486-weekbody,body.u486-cal-print .u486-monthhead,',
      '  body.u486-cal-print .u486-monthbody,body.u486-cal-print .u486-yminimonth{display:grid!important;visibility:visible!important;}',
      '  body.u486-cal-print .u486-weekgrid,body.u486-cal-print .u486-monthgrid{display:block!important;}',
      '  body.u486-cal-print .u486-weekhead,body.u486-cal-print .u486-weekbody,',
      '  body.u486-cal-print .u486-monthhead,body.u486-cal-print .u486-monthbody{display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr))!important;}',
      '  body.u486-cal-print .u486-yeargrid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(200px,1fr))!important;}',
      '  .u486-cal{break-inside:avoid;}',
      '  .u486-weekgrid,.u486-monthgrid,.u486-yminimonth{border-color:#333!important;}',
      '  .u486-chip,.u486-leg i,.u486-yday.has,.u486-colhead.today .u486-dom,.u486-daycol.today,.u486-mcell.today{',
      '    -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}',
      '  .u486-daycol{min-height:160px;}',
      '  .u486-mcell{min-height:90px;}',
      '  /* Phone media query must not collapse the week grid on paper */',
      '  body.u486-cal-print .u486-weekbody{grid-template-columns:repeat(7,minmax(0,1fr))!important;}',
      '  body.u486-cal-print .u486-weekhead{display:grid!important;}',
      '}'
    ].join('');
  }

  function ensureCss() {
    if (typeof document === 'undefined') return;
    var s = document.getElementById('u486Css');
    if (!s) {
      s = document.createElement('style');
      s.id = 'u486Css';
      document.head.appendChild(s);
    }
    s.textContent = css();
  }

  /** Hide Team ops group; keep underlying renderers intact. */
  function hideTeamOps() {
    if (!HIDE_TEAM_OPS || typeof document === 'undefined') return;
    document.body.classList.add('u486-hide-team');
    var P = root.Prepline480;
    if (P && typeof P.groupsHtml === 'function' && !P.groupsHtml.__u486) {
      var orig = P.groupsHtml;
      function wrapped(parts) {
        parts = Object.assign({}, parts || {});
        // Drop team buttons from HTML entirely while hidden
        parts.teamBtns = '';
        var html = orig.call(this, parts);
        // Also strip the Team ops <details> block if still present
        html = html.replace(/<details class="u480-group" id="u480Team">[\s\S]*?<\/details>/, '');
        return html;
      }
      wrapped.__u486 = true;
      P.groupsHtml = wrapped;
      root.u480GroupsHtml = wrapped;
    }
    // If user somehow landed on a team view, bounce to dish
    try {
      if (typeof viewMode === 'string' && TEAM_VIEWS[viewMode]) {
        viewMode = 'dish';
      }
    } catch (e) {}
  }

  function patchSetView() {
    if (typeof root.setView !== 'function' || root.setView.__u486) {
      // also try global
    }
    var apply = function (fn, owner) {
      if (typeof fn !== 'function' || fn.__u486) return fn;
      function wrapped(v) {
        if (HIDE_TEAM_OPS && TEAM_VIEWS[v]) {
          try {
            if (typeof setStatus === 'function') setStatus('Team ops is hidden in this trial build.', 'ok');
          } catch (e) {}
          v = 'dish';
        }
        return fn.call(this, v);
      }
      wrapped.__u486 = true;
      return wrapped;
    };
    try {
      if (typeof setView === 'function') setView = apply(setView);
    } catch (e) {}
    if (typeof root.setView === 'function') root.setView = apply(root.setView);
  }

  function patchRenderWeek() {
    var U = root.PreplineUpgrades47;
    if (!U) return;
    if (U.renderWeekView && U.renderWeekView.__u486) return;
    U.renderWeekView = function (rows, deps, helpers) {
      return renderCalendarView(rows, deps, helpers || {});
    };
    U.renderWeekView.__u486 = true;
    U.renderCalendarView = renderCalendarView;
    U.getCalSpan = getSpan;
    U.setCalSpan = setSpan;
  }

  function patchBind() {
    // After each render, bind calendar controls on results area
    var g = root;
    if (typeof g.render === 'function' && !g.render.__u486cal) {
      var orig = g.render;
      function wrapped() {
        hideTeamOps();
        var ret = orig.apply(this, arguments);
        try {
          var area = document.getElementById('resultsArea');
          if (area) {
            area.__u486Bound = false;
            bindCalControls(area, function () {
              if (typeof render === 'function') render();
              else if (typeof g.render === 'function') g.render();
            });
          }
          hideTeamOps();
        } catch (e) {}
        return ret;
      }
      wrapped.__u486cal = true;
      // preserve u480 marker if present
      if (orig.__u480) wrapped.__u480 = true;
      try { render = wrapped; } catch (e) {}
      g.render = wrapped;
    }
  }

  function boot() {
    ensureCss();
    patchRenderWeek();
    hideTeamOps();
    patchSetView();
    patchBind();
  }

  root.Prepline486 = {
    VERSION: '4.8.6',
    HIDE_TEAM_OPS: HIDE_TEAM_OPS,
    renderCalendarView: renderCalendarView,
    bindCalControls: bindCalControls,
    hideTeamOps: hideTeamOps,
    ensureCss: ensureCss
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 0);
  setTimeout(boot, 50);
  setTimeout(boot, 250);
  setTimeout(boot, 1000);
})(typeof window !== 'undefined' ? window : this);
