/* Prepline 4.7.x upgrades (trial copy only). Autoprod.
 * 1 Week view  2 Tick-off  3 Change check  4 Order-from-batches
 * 5 Recipe/yield lib  6 Station sheets  7 Voice input  8 Auto-section
 * 10 Organised yellow-header xlsx (11 cols, Section after Item) + By item view + drag order
 * Shared row builder used by screen + export.
 */
(function (root) {
  'use strict';

  var WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };
  var SECTION_ORDER = [
    'Sauce, Purees and Gels',
    'Vegetables',
    'Garnishes, Herbs, Powders, Oils Etc.',
    'Starch',
    'Proteins',
    'Box off/ Trolley organising team'
  ];
  /* Light legend tints: blue sauce, green vege, orange garnish, yellow starch, red protein */
  var SECTION_COLOURS = {
    'Sauce, Purees and Gels': { bg: 'FFD6EAF7', css: '#D6EAF7', ink: '#1A56DB', short: 'Sauce' },
    'Vegetables': { bg: 'FFE4F0E1', css: '#E4F0E1', ink: '#2F6B3A', short: 'Vege' },
    'Garnishes, Herbs, Powders, Oils Etc.': { bg: 'FFF6E6D2', css: '#F6E6D2', ink: '#C97A2E', short: 'Garnish' },
    'Starch': { bg: 'FFFFF4C2', css: '#FFF4C2', ink: '#7A5A00', short: 'Starch' },
    'Proteins': { bg: 'FFF5E3DC', css: '#F5E3DC', ink: '#B5442E', short: 'Protein' },
    'Box off/ Trolley organising team': { bg: 'FFEFE1D2', css: '#EFE1D2', ink: '#8A5A34', short: 'Box' }
  };
  function sectionColour(sec) {
    return SECTION_COLOURS[sec] || { bg: 'FFF2F2F2', css: '#F2F2F2', ink: '#5C5A52', short: sec || '—' };
  }
  var NOTES_KEY = 'prepline.organised.notes.v1';
  var STAFF_OVERRIDE_KEY = 'prepline.organised.staff.v1';
  var HISTORY_KEY = 'prepline.history.v1';
  var UNDO_KEY = 'prepline.undo.v1';
  var DEVICE_WHO_KEY = 'prepline.deviceWho.v1';
  var BULK_SEL_KEY = 'prepline.organised.bulkSel.v1';
  function notesMap() { return lsGet(NOTES_KEY, {}) || {}; }
  function saveNotesMap(m) { lsSet(NOTES_KEY, m || {}); }
  function staffOverrideMap() { return lsGet(STAFF_OVERRIDE_KEY, {}) || {}; }
  function saveStaffOverrideMap(m) { lsSet(STAFF_OVERRIDE_KEY, m || {}); }
  function bulkSel() { var a = lsGet(BULK_SEL_KEY, []); return Array.isArray(a) ? a : []; }
  function saveBulkSel(a) { lsSet(BULK_SEL_KEY, a || []); }
  function getDeviceWho() {
    var w = lsGet(DEVICE_WHO_KEY, null);
    if (w && w.name) return w;
    try {
      var acc = JSON.parse(localStorage.getItem('prepline.account.v1') || 'null');
      if (acc && (acc.name || acc.email)) {
        w = { name: acc.name || '', email: acc.email || '' };
        lsSet(DEVICE_WHO_KEY, w);
        return w;
      }
    } catch (e) {}
    return { name: '', email: '' };
  }
  function setDeviceWho(name) {
    var w = getDeviceWho();
    w.name = String(name || '').trim();
    lsSet(DEVICE_WHO_KEY, w);
    return w;
  }
  function whoLabel() {
    var w = getDeviceWho();
    if (w.name && w.email) return w.name + ' <' + w.email + '>';
    return w.name || w.email || 'This device';
  }
  function sydneyStamp(d) {
    d = d || new Date();
    try {
      return new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Sydney', year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      }).format(d) + ' Sydney';
    } catch (e) { return d.toISOString(); }
  }
  function historyList() {
    var a = lsGet(HISTORY_KEY, []);
    return Array.isArray(a) ? a : [];
  }
  function pushHistory(entry) {
    var a = historyList();
    a.unshift({
      at: Date.now(),
      sydney: sydneyStamp(),
      who: whoLabel(),
      what: entry.what || '',
      from: entry.from == null ? '' : String(entry.from),
      to: entry.to == null ? '' : String(entry.to),
      key: entry.key || ''
    });
    if (a.length > 500) a = a.slice(0, 500);
    lsSet(HISTORY_KEY, a);
    return a;
  }
  function exportHistoryCsv() {
    var rows = [['When (Sydney)', 'Who', 'What', 'From', 'To', 'Key']];
    historyList().forEach(function (h) {
      rows.push([h.sydney || '', h.who || '', h.what || '', h.from || '', h.to || '', h.key || '']);
    });
    var csv = rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c == null ? '' : c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');
    downloadText('Prepline_History_' + new Date().toISOString().slice(0, 10) + '.csv', csv, 'text/csv');
    return rows.length - 1;
  }
  function undoStack() {
    var a = lsGet(UNDO_KEY, []);
    return Array.isArray(a) ? a : [];
  }
  function pushUndo(action) {
    var a = undoStack();
    a.push(Object.assign({ at: Date.now() }, action || {}));
    if (a.length > 40) a = a.slice(-40);
    lsSet(UNDO_KEY, a);
  }
  function popUndo() {
    var a = undoStack();
    var last = a.pop();
    lsSet(UNDO_KEY, a);
    return last || null;
  }
  function showToast(msg, undoFn) {
    if (typeof document === 'undefined') return;
    var el = document.getElementById('u47Toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'u47Toast';
      el.className = 'u47-toast no-print';
      document.body.appendChild(el);
    }
    el.innerHTML = '';
    var span = document.createElement('span');
    span.textContent = msg || '';
    el.appendChild(span);
    if (typeof undoFn === 'function') {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = 'Undo'; b.className = 'u47-toast-undo';
      b.onclick = function () { undoFn(); el.classList.remove('show'); };
      el.appendChild(b);
    }
    el.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { el.classList.remove('show'); }, 6000);
  }
  function markSavedIndicator() {
    if (typeof document === 'undefined') return;
    var el = document.getElementById('u47Saved');
    if (!el) {
      el = document.createElement('div');
      el.id = 'u47Saved';
      el.className = 'u47-saved no-print';
      el.textContent = 'Saved';
      document.body.appendChild(el);
    }
    el.classList.add('show');
    clearTimeout(markSavedIndicator._t);
    markSavedIndicator._t = setTimeout(function () { el.classList.remove('show'); }, 1600);
  }

  var SHELF_DAYS = {
    poultry: 4, redmeat: 4, crabcroq: 4, seafood: 2, fish: 2, prawn: 1, vegsoft: 2, veghard: 4,
    veg: 4, dry: 4, oil: 4, gels: 3, puree: 2, dressing: 4, dairy: 4, cheese: 3, poultry: 3, starch: 3,
    garnish: 2, micro: 1
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function wrapEsc(fn) {
    return function (s) {
      try { return (fn || esc)(String(s == null ? '' : s)); }
      catch (e) { return esc(s); }
    };
  }
  function shortDay(d) { return SHORT[d] || (d ? String(d).slice(0, 3) : '—'); }
  function dayIdx(d) { return WEEKDAYS.indexOf(d); }
  function shiftBack(day, n) {
    var i = dayIdx(day);
    if (i < 0) return '';
    return WEEKDAYS[((i - n) % 7 + 7) % 7];
  }
  function normKey(s) {
    return String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9\s/]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function lsGet(k, fallback) {
    try {
      var v = localStorage.getItem(k);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function downloadText(name, text, mime) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 1500);
  }

  /* ---------- 1) Week view ---------- */
  function buildWeekGroups(rows, deps) {
    deps = deps || {};
    var batches = (root.PreplineBatch && root.PreplineBatch.buildBatches)
      ? root.PreplineBatch.buildBatches(rows, deps)
      : (rows || []).map(function (r) {
          return {
            taskLabel: r.task, day: r.day || '', section: r.section || '',
            total: 0, hasTotal: false, unit: r.unit || '', rows: [r],
            dishes: [r.dish], merged: false, covers: '', reason: '', batchKey: r.task
          };
        });
    var byDay = {};
    WEEKDAYS.forEach(function (d) { if (d !== 'Sunday') byDay[d] = {}; });
    byDay.Unscheduled = {};
    batches.forEach(function (g) {
      var day = g.day && dayIdx(g.day) >= 0 && g.day !== 'Sunday' ? g.day : 'Unscheduled';
      var sec = g.section || 'Uncategorised';
      if (!byDay[day]) byDay[day] = {};
      if (!byDay[day][sec]) byDay[day][sec] = [];
      byDay[day][sec].push(g);
    });
    return byDay;
  }

  function renderWeekView(rows, deps, helpers) {
    helpers = helpers || {};
    var escH = wrapEsc(helpers.escapeHtml);
    var qN = helpers.qN || function (n) { return String(n); };
    var qU = helpers.qU || function (n, u) { return u || ''; };
    var clean = helpers.cleanDishName || function (d) { return d; };
    var byDay = buildWeekGroups(rows, deps);
    var days = WEEKDAYS.filter(function (d) { return d !== 'Sunday'; }).concat(['Unscheduled']);
    var html = '<div class="u47-week" id="u47Week">';
    html += '<div class="u47-note no-print">Prep-day calendar: dishes/items by the day they are prepped (same batching as By prep day). Tap a day chip to jump.</div>';
    html += '<div class="u47-calgrid no-print" role="navigation">';
    days.forEach(function (day) {
      var secs0 = byDay[day] || {};
      var n0 = Object.keys(secs0).reduce(function (s, k) { return s + secs0[k].length; }, 0);
      html += '<a class="u47-calchip' + (n0 ? '' : ' empty') + '" href="#u47-day-' + encodeURIComponent(day) + '">' +
        '<b>' + escH(day === 'Unscheduled' ? 'TBC' : shortDay(day)) + '</b><span>' + n0 + '</span></a>';
    });
    html += '</div>';
    days.forEach(function (day) {
      var secs = byDay[day] || {};
      var keys = Object.keys(secs);
      if (!keys.length) return;
      keys.sort(function (a, b) {
        var ia = SECTION_ORDER.indexOf(a), ib = SECTION_ORDER.indexOf(b);
        if (ia < 0) ia = 99; if (ib < 0) ib = 99;
        return ia !== ib ? ia - ib : a.localeCompare(b);
      });
      var n = keys.reduce(function (s, k) { return s + secs[k].length; }, 0);
      html += '<div class="panel u47-daypanel" id="u47-day-' + escH(day) + '"><h3 class="u47-dayhead">' + escH(day === 'Unscheduled' ? 'Unscheduled' : day) +
        ' <span class="meta">' + n + ' line' + (n === 1 ? '' : 's') + ' · prep day</span></h3>';
      keys.forEach(function (sec) {
        html += '<h4 class="u47-sechead">' + escH(sec) + '</h4>';
        html += '<div class="section-table-wrap"><table><thead><tr><th>Task</th><th>For</th><th>Qty</th><th>Covers</th></tr></thead><tbody>';
        secs[sec].forEach(function (g) {
          var total = g.hasTotal ? ('<b>' + escH(qN(g.total, g.unit)) + '</b> ' + escH(qU(g.total, g.unit))) : '—';
          var dishes = (g.dishes || []).map(clean).join(', ');
          var sub = mergedSubtitleHtml(g, escH);
          var tick = tickControlsHtml(g, escH);
          var sc = sectionColour(sec);
          html += '<tr style="background:' + sc.css + '"><td class="task">' + escH(g.taskLabel) + sub + tick + '</td><td class="dish">' +
            escH(dishes) + '</td><td class="qty">' + total + '</td><td>' + escH(g.covers || '—') + '</td></tr>';
        });
        html += '</tbody></table></div>';
      });
      html += '</div>';
    });
    html += '</div>';
    return html;
  }

  /* ---------- Merged subtitle (shared screen + export) ---------- */
  function functionNamesForGroup(g, cleanFn) {
    cleanFn = cleanFn || function (d) { return d; };
    var names = [], seen = {};
    (g.dishes || []).forEach(function (d) {
      var c = cleanFn(d) || d;
      if (!c || seen[c]) return;
      seen[c] = true;
      names.push(c);
    });
    return names;
  }

  function mergedSubtitleText(g, opts) {
    opts = opts || {};
    if (!g || !g.merged) return '';
    var names = functionNamesForGroup(g, opts.cleanDishName);
    if (!names.length) return 'Merged';
    var max = opts.maxNames != null ? opts.maxNames : 99;
    var shown = names.slice(0, max);
    var extra = names.length - shown.length;
    var body = shown.join(' + ') + (extra > 0 ? ' +' + extra + ' more' : '');
    return 'Merged: ' + body;
  }

  function mergedSubtitleHtml(g, escH, opts) {
    opts = opts || {};
    if (!g || !g.merged) return '';
    escH = wrapEsc(escH);
    var full = mergedSubtitleText(g, Object.assign({}, opts, { maxNames: 99 }));
    var short = mergedSubtitleText(g, Object.assign({}, opts, { maxNames: opts.phoneMax || 2 }));
    var days = g.covers ? ('<span class="pb-covers">' + escH(g.covers) + '</span> · ') : '';
    return '<div class="pb-reason u47-merged" title="' + escH(full) + '">' +
      days + '<span class="u47-merged-full">' + escH(full) + '</span>' +
      '<span class="u47-merged-short">' + escH(short) + '</span></div>';
  }

  /* ---------- 2) Tick-off (local + share code) ---------- */
  var TICK_KEY = 'prepline.tickoff.v1';
  function tickStore() { return lsGet(TICK_KEY, { lines: {}, listId: '', updated: 0 }) || { lines: {}, listId: '', updated: 0 }; }
  function tickSave(st) { st.updated = Date.now(); lsSet(TICK_KEY, st); }
  function tickLineKey(g) {
    return normKey((g.batchKey || g.taskLabel || '') + '|' + (g.day || '') + '|' + (g.section || ''));
  }
  function getTick(g) {
    var st = tickStore();
    return st.lines[tickLineKey(g)] || { status: 'todo', pct: 0, qtyDone: '', note: '' };
  }
  function setTick(g, patch) {
    var st = tickStore();
    var k = tickLineKey(g);
    st.lines[k] = Object.assign({ status: 'todo', pct: 0, qtyDone: '', note: '' }, st.lines[k] || {}, patch || {});
    tickSave(st);
    return st.lines[k];
  }
  function tickControlsHtml(g, escH) {
    escH = wrapEsc(escH);
    var t = getTick(g);
    var k = encodeURIComponent(tickLineKey(g));
    var cls = 'u47-tick u47-tick-' + (t.status || 'todo');
    return '<div class="u47-tickbar no-print ' + cls + '" data-tick-key="' + k + '">' +
      '<button type="button" class="u47-tickbtn" data-tick="todo" aria-label="Not done">○</button>' +
      '<button type="button" class="u47-tickbtn" data-tick="part" aria-label="Part done">◐</button>' +
      '<button type="button" class="u47-tickbtn" data-tick="done" aria-label="Done">●</button>' +
      (t.status === 'part' ? '<input class="u47-tickpct" type="number" min="0" max="100" value="' + escH(t.pct || 50) + '" aria-label="Percent done">%' : '') +
      (t.status === 'done' ? '<span class="u47-ticklab">Done</span>' : (t.status === 'part' ? '<span class="u47-ticklab">Part</span>' : '')) +
      '</div>';
  }
  function progressSummaryHtml(groups) {
    var total = 0, done = 0, part = 0;
    (groups || []).forEach(function (g) {
      total++;
      var t = getTick(g);
      if (t.status === 'done') done++;
      else if (t.status === 'part') part++;
    });
    var pct = total ? Math.round((done + part * 0.5) / total * 100) : 0;
    return '<div class="u47-progress no-print panel" id="u47Progress">' +
      '<b>Progress</b> ' + done + ' done · ' + part + ' part · ' + (total - done - part) + ' left · ~' + pct + '%' +
      '<div class="u47-progbar"><div style="width:' + pct + '%"></div></div>' +
      '<div class="meta">Saved on this phone only. For another device, use Share progress code below. True live multi-device sync needs a backend — ask Gerard.</div>' +
      '<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap;">' +
      '<button type="button" class="secondary" id="u47ShareProg">Copy progress code</button>' +
      '<button type="button" class="ghost" id="u47LoadProg">Paste progress code</button>' +
      '<button type="button" class="ghost" id="u47ClearProg">Clear ticks</button>' +
      '</div></div>';
  }
  function exportProgressCode() {
    var st = tickStore();
    var raw = JSON.stringify({ v: 1, t: st.updated, lines: st.lines });
    try { return btoa(unescape(encodeURIComponent(raw))); } catch (e) { return ''; }
  }
  function importProgressCode(code) {
    try {
      var raw = decodeURIComponent(escape(atob(String(code || '').trim())));
      var o = JSON.parse(raw);
      if (!o || !o.lines) return false;
      var st = tickStore();
      st.lines = Object.assign({}, st.lines, o.lines);
      tickSave(st);
      return true;
    } catch (e) { return false; }
  }
  function bindTickControls(rootEl, onChange) {
    if (!rootEl) return;
    rootEl.querySelectorAll('[data-tick-key]').forEach(function (bar) {
      var key = decodeURIComponent(bar.getAttribute('data-tick-key') || '');
      bar.querySelectorAll('[data-tick]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var status = btn.getAttribute('data-tick');
          var st = tickStore();
          st.lines[key] = Object.assign({ status: 'todo', pct: 0 }, st.lines[key] || {}, {
            status: status,
            pct: status === 'part' ? (st.lines[key] && st.lines[key].pct) || 50 : (status === 'done' ? 100 : 0)
          });
          tickSave(st);
          if (onChange) onChange();
        });
      });
      var pct = bar.querySelector('.u47-tickpct');
      if (pct) pct.addEventListener('change', function () {
        var st = tickStore();
        st.lines[key] = Object.assign({}, st.lines[key] || {}, { status: 'part', pct: Number(pct.value) || 0 });
        tickSave(st);
        if (onChange) onChange();
      });
    });
    var share = rootEl.querySelector('#u47ShareProg');
    if (share) share.addEventListener('click', function () {
      var c = exportProgressCode();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(c).then(function () { alert('Progress code copied. Paste it on another phone to sync ticks.'); });
      } else { prompt('Copy this progress code:', c); }
    });
    var load = rootEl.querySelector('#u47LoadProg');
    if (load) load.addEventListener('click', function () {
      var c = prompt('Paste progress code:');
      if (c && importProgressCode(c)) { if (onChange) onChange(); }
      else if (c) alert('Could not read that code.');
    });
    var clr = rootEl.querySelector('#u47ClearProg');
    if (clr) clr.addEventListener('click', function () {
      if (!confirm('Clear all tick-off progress on this device?')) return;
      lsSet(TICK_KEY, { lines: {}, listId: '', updated: Date.now() });
      if (onChange) onChange();
    });
  }

  /* ---------- 3) Change check ---------- */
  var SNAP_KEY = 'prepline.wo.snapshot.v1';
  function rowSig(r) {
    return normKey(r.dish) + '|' + normKey(r.task) + '|' + String(r.qty) + '|' + String(r.unit || '');
  }
  function snapshotFromRows(rows, meta) {
    return {
      at: Date.now(),
      name: (meta && meta.name) || '',
      rows: (rows || []).map(function (r) {
        return { dish: r.dish, task: r.task, qty: r.qty, unit: r.unit, section: r.section, day: r.day };
      })
    };
  }
  function rememberSnapshot(rows, meta) {
    var prev = lsGet(SNAP_KEY, null);
    var next = snapshotFromRows(rows, meta);
    var diff = prev ? diffSnapshots(prev, next) : null;
    lsSet(SNAP_KEY, next);
    lsSet(SNAP_KEY + '.lastDiff', diff);
    return diff;
  }
  function peekLastDiff() { return lsGet(SNAP_KEY + '.lastDiff', null); }
  function diffSnapshots(prev, next) {
    var oldMap = {}, neuMap = {};
    (prev.rows || []).forEach(function (r) { oldMap[rowSig(r)] = r; });
    (next.rows || []).forEach(function (r) { neuMap[rowSig(r)] = r; });
    // Quantity-aware: match by dish+task, compare qty
    function keyDT(r) { return normKey(r.dish) + '|' + normKey(r.task); }
    var oldDT = {}, neuDT = {};
    (prev.rows || []).forEach(function (r) { oldDT[keyDT(r)] = r; });
    (next.rows || []).forEach(function (r) { neuDT[keyDT(r)] = r; });
    var added = [], removed = [], changed = [];
    Object.keys(neuDT).forEach(function (k) {
      if (!oldDT[k]) added.push(neuDT[k]);
      else {
        var a = oldDT[k], b = neuDT[k];
        if (String(a.qty) !== String(b.qty) || String(a.unit || '') !== String(b.unit || '')) {
          changed.push({ before: a, after: b });
        }
      }
    });
    Object.keys(oldDT).forEach(function (k) {
      if (!neuDT[k]) removed.push(oldDT[k]);
    });
    return {
      prevName: prev.name || '', nextName: next.name || '',
      added: added, removed: removed, changed: changed,
      summary: added.length + ' added, ' + removed.length + ' removed, ' + changed.length + ' qty changed'
    };
  }
  function changeCheckHtml(diff, escH) {
    escH = wrapEsc(escH);
    if (!diff) return '';
    if (!diff.added.length && !diff.removed.length && !diff.changed.length) {
      return '<div class="panel u47-diff no-print" id="u47Diff"><b>Change check</b> — same as last upload (no line changes).</div>';
    }
    function line(r) { return escH(String(r.task == null ? '' : r.task)) + ' · ' + escH(String(r.dish == null ? '' : r.dish)) + ' · ' + escH(String(r.qty == null ? '' : r.qty)) + ' ' + escH(String(r.unit || '')); }
    var html = '<div class="panel u47-diff no-print" id="u47Diff"><b>Change check</b> — ' + escH(String(diff.summary || ''));
    if (diff.added.length) {
      html += '<details open><summary>Added (' + diff.added.length + ')</summary><ul>' +
        diff.added.slice(0, 40).map(function (r) { return '<li class="u47-add">' + line(r) + '</li>'; }).join('') + '</ul></details>';
    }
    if (diff.removed.length) {
      html += '<details open><summary>Removed (' + diff.removed.length + ')</summary><ul>' +
        diff.removed.slice(0, 40).map(function (r) { return '<li class="u47-rem">' + line(r) + '</li>'; }).join('') + '</ul></details>';
    }
    if (diff.changed.length) {
      html += '<details open><summary>Qty changed (' + diff.changed.length + ')</summary><ul>' +
        diff.changed.slice(0, 40).map(function (c) {
          return '<li class="u47-chg">' + escH(String(c.after.task||'')) + ' · ' + escH(String(c.after.dish||'')) + ': ' +
            escH(String(c.before.qty==null?'':c.before.qty)) + ' → <b>' + escH(String(c.after.qty==null?'':c.after.qty)) + '</b> ' + escH(String(c.after.unit || '')) + '</li>';
        }).join('') + '</ul></details>';
    }
    html += '<button type="button" class="ghost" onclick="document.getElementById(\'u47Diff\').remove()">Dismiss</button></div>';
    return html;
  }

  /* ---------- 4) Order list from batches ---------- */
  function latestDeliveryDay(prepDay) {
    if (!prepDay || dayIdx(prepDay) < 0) return '';
    // Delivery the day before prep start (never Sunday → Saturday)
    var d = shiftBack(prepDay, 1);
    if (d === 'Sunday') d = 'Saturday';
    return d;
  }
  function buildOrderFromBatches(rows, deps, helpers) {
    helpers = helpers || {};
    var batches = (root.PreplineBatch && root.PreplineBatch.buildBatches)
      ? root.PreplineBatch.buildBatches(rows, deps) : [];
    var applyY = helpers.applyYield || function (n) { return n; };
    var map = {}, order = [];
    batches.forEach(function (g) {
      var name = (g.name || g.taskLabel || '').toLowerCase();
      var uk = String(g.unit || '').toLowerCase();
      if (/^(g|gm|grams?)$/.test(uk)) uk = 'g';
      if (/^(kg|kgs|kilos?)$/.test(uk)) uk = 'g';
      if (/^(ml|millilitres?)$/.test(uk)) uk = 'ml';
      if (/^(l|lt|ltr|litres?)$/.test(uk)) uk = 'ml';
      var key = name + '|' + uk;
      if (!map[key]) {
        map[key] = {
          name: g.name || g.taskLabel, unitKey: uk, total: 0, hasTotal: false,
          unit: g.unit || '', prepDays: [], deliveryDays: [], dishes: []
        };
        order.push(key);
      }
      var o = map[key];
      if (g.hasTotal) {
        var n = applyY(g.total, g);
        // normalise to g/ml base if possible
        if (/^kg/.test(String(g.unit || '').toLowerCase())) n = n * 1000;
        if (/^l$|^lt|^ltr|^litre/.test(String(g.unit || '').toLowerCase())) n = n * 1000;
        o.total += n; o.hasTotal = true;
        if (uk === 'g') o.unit = 'g';
        if (uk === 'ml') o.unit = 'ml';
      }
      if (g.day && o.prepDays.indexOf(g.day) < 0) o.prepDays.push(g.day);
      var del = latestDeliveryDay(g.day);
      if (del && o.deliveryDays.indexOf(del) < 0) o.deliveryDays.push(del);
      (g.dishes || []).forEach(function (d) { if (o.dishes.indexOf(d) < 0) o.dishes.push(d); });
    });
    return order.map(function (k) {
      var o = map[k];
      o.prepDays.sort(function (a, b) { return dayIdx(a) - dayIdx(b); });
      o.deliveryDays.sort(function (a, b) { return dayIdx(a) - dayIdx(b); });
      // Latest delivery = latest among needed delivery days
      o.latestDelivery = o.deliveryDays.length ? o.deliveryDays[o.deliveryDays.length - 1] : '';
      if (o.unit === 'g' && o.total >= 1000) { o.displayN = Math.round(o.total) / 1000; o.displayU = 'kg'; }
      else if (o.unit === 'ml' && o.total >= 1000) { o.displayN = Math.round(o.total) / 1000; o.displayU = 'L'; }
      else { o.displayN = Math.round(o.total * 100) / 100; o.displayU = o.unit || ''; }
      return o;
    });
  }
  function renderOrderFromBatches(rows, deps, helpers) {
    helpers = helpers || {};
    var escH = wrapEsc(helpers.escapeHtml);
    var lines = buildOrderFromBatches(rows, deps, helpers);
    var html = '<div class="u47-order" id="u47Order"><div class="panel">' +
      '<div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
      '<h3 style="margin:0;">Order list (from batches)</h3>' +
      '<div class="row" style="gap:8px;"><button type="button" class="secondary" id="u47OrderCsv">Export CSV</button>' +
      '<button type="button" class="secondary" id="u47OrderPrint">Print</button></div></div>' +
      '<div class="meta">Totals from batched prep. Latest delivery = day before prep start (Sunday → Saturday).</div>';
    if (!lines.length) {
      html += '<div class="empty"><div class="big">Nothing to order yet</div>Load a list and turn batching on.</div></div></div>';
      return html;
    }
    html += '<div class="section-table-wrap"><table><thead><tr><th>Ingredient</th><th>Total</th><th>Latest delivery</th><th>Prep days</th><th>Used in</th></tr></thead><tbody>';
    lines.forEach(function (L) {
      html += '<tr><td class="task">' + escH(L.name) + '</td><td class="qty"><b>' +
        (L.hasTotal ? escH(L.displayN) + ' ' + escH(L.displayU) : '—') + '</b></td><td>' +
        escH(L.latestDelivery || '—') + '</td><td>' + escH(L.prepDays.map(shortDay).join(', ') || '—') +
        '</td><td class="dish">' + escH(L.dishes.join(', ')) + '</td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    return html;
  }
  function orderCsv(rows, deps, helpers) {
    var lines = buildOrderFromBatches(rows, deps, helpers);
    var out = ['Ingredient,Total,Unit,Latest delivery,Prep days,Used in'];
    lines.forEach(function (L) {
      out.push([
        '"' + String(L.name).replace(/"/g, '""') + '"',
        L.hasTotal ? L.displayN : '',
        L.hasTotal ? L.displayU : '',
        L.latestDelivery || '',
        L.prepDays.join(' '),
        '"' + L.dishes.join('; ').replace(/"/g, '""') + '"'
      ].join(','));
    });
    return out.join('\n');
  }

  /* ---------- 5) Recipe & yield library ---------- */
  var RECIPE_KEY = 'prepline.recipes.v1';
  function recipeLib() { return lsGet(RECIPE_KEY, { items: [] }) || { items: [] }; }
  function saveRecipes(lib) { lsSet(RECIPE_KEY, lib); }
  function findYield(task) {
    var lib = recipeLib();
    var k = normKey(task);
    for (var i = 0; i < lib.items.length; i++) {
      var it = lib.items[i];
      if (normKey(it.name) === k || (k && normKey(it.name) && k.indexOf(normKey(it.name)) >= 0)) return it;
    }
    return null;
  }
  function applyYieldToQty(n, taskOrGroup) {
    if (!Number.isFinite(n)) return n;
    var task = typeof taskOrGroup === 'string' ? taskOrGroup : (taskOrGroup && (taskOrGroup.name || taskOrGroup.taskLabel || ''));
    var y = findYield(task);
    if (!y || !Number.isFinite(y.yieldPct) || y.yieldPct <= 0) return n;
    // raw needed = cooked / (yield/100)
    return Math.round(n / (y.yieldPct / 100) * 1000) / 1000;
  }
  function recipeLibHtml(escH) {
    escH = wrapEsc(escH);
    var lib = recipeLib();
    var html = '<div class="panel u47-recipes no-print" id="u47Recipes"><h3 style="margin:0 0 6px;">Recipe &amp; yield library</h3>' +
      '<div class="meta">Saved on this device. Yield % = usable weight ÷ raw weight × 100. Applied to order list totals (raw needed). Prep min blank until set — shows as "set time".</div>' +
      '<div class="section-table-wrap"><table><thead><tr><th>Ingredient</th><th>Yield %</th><th>Prep min</th><th>Note</th><th></th></tr></thead><tbody>';
    lib.items.forEach(function (it, i) {
      html += '<tr><td><input data-ri="' + i + '" data-f="name" value="' + escH(it.name) + '"></td>' +
        '<td><input data-ri="' + i + '" data-f="yieldPct" type="number" min="1" max="100" step="0.1" value="' + escH(it.yieldPct) + '" style="width:80px"></td>' +
        '<td><input data-ri="' + i + '" data-f="prepMinutes" type="number" min="0" step="1" placeholder="set time" value="' +
          escH(it.prepMinutes != null && it.prepMinutes !== '' ? it.prepMinutes : '') + '" style="width:80px" title="Minutes — blank until set"></td>' +
        '<td><input data-ri="' + i + '" data-f="note" value="' + escH(it.note || '') + '"></td>' +
        '<td><button type="button" class="ghost" data-rdel="' + i + '">Remove</button></td></tr>';
    });
    html += '</tbody></table></div>' +
      '<div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap;">' +
      '<button type="button" class="secondary" id="u47RecAdd">Add row</button>' +
      '<button type="button" class="secondary" id="u47RecExport">Export JSON</button>' +
      '<button type="button" class="ghost" id="u47RecImport">Import JSON</button>' +
      '<button type="button" class="ghost" id="u47RecSeed">Add chicken/beef examples</button>' +
      '</div></div>';
    return html;
  }
  function bindRecipeLib(rootEl, onChange) {
    if (!rootEl) return;
    function refreshFromInputs() {
      var lib = { items: [] };
      rootEl.querySelectorAll('[data-ri][data-f="name"]').forEach(function (inp) {
        var i = +inp.getAttribute('data-ri');
        var row = rootEl.querySelector('[data-ri="' + i + '"][data-f="yieldPct"]');
        var note = rootEl.querySelector('[data-ri="' + i + '"][data-f="note"]');
        lib.items[i] = {
          name: inp.value,
          yieldPct: row ? Number(row.value) : 100,
          prepMinutes: (function () {
            var pm = rootEl.querySelector('[data-ri="' + i + '"][data-f="prepMinutes"]');
            if (!pm || pm.value === '') return '';
            var n = Number(pm.value);
            return Number.isFinite(n) ? n : '';
          })(),
          note: note ? note.value : ''
        };
      });
      lib.items = lib.items.filter(Boolean);
      saveRecipes(lib);
    }
    rootEl.querySelectorAll('[data-ri]').forEach(function (inp) {
      inp.addEventListener('change', function () { refreshFromInputs(); if (onChange) onChange(); });
    });
    rootEl.querySelectorAll('[data-rdel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var lib = recipeLib();
        lib.items.splice(+btn.getAttribute('data-rdel'), 1);
        saveRecipes(lib);
        if (onChange) onChange();
      });
    });
    var add = rootEl.querySelector('#u47RecAdd');
    if (add) add.addEventListener('click', function () {
      var lib = recipeLib();
      lib.items.push({ name: '', yieldPct: 70, note: '', prepMinutes: '' });
      saveRecipes(lib);
      if (onChange) onChange();
    });
    var exp = rootEl.querySelector('#u47RecExport');
    if (exp) exp.addEventListener('click', function () {
      downloadText('prepline-recipes.json', JSON.stringify(recipeLib(), null, 2), 'application/json');
    });
    var imp = rootEl.querySelector('#u47RecImport');
    if (imp) imp.addEventListener('click', function () {
      var t = prompt('Paste recipes JSON:');
      if (!t) return;
      try {
        var o = JSON.parse(t);
        if (o && Array.isArray(o.items)) { saveRecipes(o); if (onChange) onChange(); }
        else alert('JSON needs an items array.');
      } catch (e) { alert('Invalid JSON'); }
    });
    var seed = rootEl.querySelector('#u47RecSeed');
    if (seed) seed.addEventListener('click', function () {
      var lib = recipeLib();
      [
        { name: 'chicken breast', yieldPct: 70, note: 'raw → trimmed', prepMinutes: '' },
        { name: 'beef short rib', yieldPct: 65, note: 'raw → trimmed', prepMinutes: '' },
        { name: 'salmon', yieldPct: 80, note: 'raw → portioned', prepMinutes: '' }
      ].forEach(function (ex) {
        if (!lib.items.some(function (x) { return normKey(x.name) === normKey(ex.name); })) lib.items.push(ex);
      });
      saveRecipes(lib);
      if (onChange) onChange();
    });
  }

  /* ---------- 6) Station sheets (allocation + main) ---------- */
  function useByFromPrep(prepDay, prepCat) {
    var life = SHELF_DAYS[prepCat] != null ? SHELF_DAYS[prepCat] : 3;
    if (!prepDay || dayIdx(prepDay) < 0) return '';
    var i = dayIdx(prepDay);
    // use-by = prep day + (life-1), cap before next week conceptually
    return WEEKDAYS[(i + Math.max(life - 1, 0)) % 7];
  }
  function buildStationSheetsFromAlloc(state) {
    // Group allocation lines by allocated Staff / staff field
    if (!state || !state.res || !state.res.sheets) return [];
    var byChef = {};
    state.res.sheets.forEach(function (sh) {
      ['service', 'prep'].forEach(function (blk) {
        (sh[blk] || []).forEach(function (sec) {
          (sec.lines || []).forEach(function (l) {
            var chef = String(l.alloc || l.staff || 'Unallocated').trim() || 'Unallocated';
            if (!byChef[chef]) byChef[chef] = [];
            byChef[chef].push({
              dish: l.dish || '',
              pax: l.paxValue,
              day: l.dayWord || sh.dayName || '',
              section: sec.key || sec.title || '',
              prepDay: sh.dayName || '',
              notes: l.notes || '',
              block: blk
            });
          });
        });
      });
    });
    return Object.keys(byChef).sort().map(function (chef) {
      return { chef: chef, lines: byChef[chef] };
    });
  }
  function stationSheetHtml(sheets, opts) {
    opts = opts || {};
    var escH = wrapEsc(opts.escapeHtml);
    var html = '<div class="u47-stations" id="u47Stations">';
    (sheets || []).forEach(function (s, idx) {
      html += '<section class="u47-station-sheet" data-chef="' + escH(s.chef) + '">' +
        '<header><div class="u47-brand">Prepline by Autoprod</div>' +
        '<h2>Station sheet — ' + escH(s.chef) + '</h2>' +
        '<div class="meta">Printed ' + escH(new Date().toLocaleDateString('en-AU')) + '</div></header>' +
        '<table><thead><tr><th>Dish / line</th><th>Section</th><th>Function day</th><th>Prep day</th><th>Use-by</th><th>Pax</th><th>Notes</th></tr></thead><tbody>';
      s.lines.forEach(function (l) {
        var useBy = useByFromPrep(l.prepDay, opts.prepCat || '');
        html += '<tr><td>' + escH(l.dish) + '</td><td>' + escH(l.section) + '</td><td>' +
          escH(l.day) + '</td><td>' + escH(l.prepDay) + '</td><td>' + escH(useBy || '—') +
          '</td><td>' + escH(l.pax == null ? '' : l.pax) + '</td><td>' + escH(l.notes) + '</td></tr>';
      });
      html += '</tbody></table></section>';
      if (idx < sheets.length - 1) html += '<div class="u47-page-break"></div>';
    });
    html += '</div>';
    return html;
  }
  function stationPrintCss() {
    /* Scoped to body.u47-station-print ONLY — an unscoped body *{visibility:hidden}
     * blanked every other printout (calendar, plan PDF, organised, etc.). */
    return [
      '@media print{',
      '  body.u47-station-print *{visibility:hidden;}',
      '  body.u47-station-print .u47-stations,body.u47-station-print .u47-stations *{visibility:visible;}',
      '  body.u47-station-print .u47-stations{position:absolute;left:0;top:0;width:100%;}',
      '  body.u47-station-print .u47-page-break{page-break-after:always;}',
      '  body.u47-station-print .noprint,body.u47-station-print .no-print{display:none!important;}',
      '}',
      '.u47-station-sheet{font:12px/1.35 Arial,Helvetica,sans-serif;color:#111;padding:12mm;max-width:210mm;margin:0 auto 16px;background:#fff;border:1px solid #ddd;}',
      '.u47-station-sheet h2{margin:4px 0 8px;font-size:18px;}',
      '.u47-brand{font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:#555;}',
      '.u47-station-sheet table{width:100%;border-collapse:collapse;}',
      '.u47-station-sheet th,.u47-station-sheet td{border:1px solid #333;padding:5px 6px;text-align:left;}',
      '.u47-station-sheet th{background:#FFFF00;font-weight:700;}'
    ].join('');
  }

  /* ---------- 7) Voice input ---------- */
  function parseVoiceUtterance(text) {
    var t = String(text || '').trim();
    if (!t) return null;
    var day = '';
    WEEKDAYS.forEach(function (d) {
      var re = new RegExp('\\b(for\\s+)?' + d + '\\b', 'i');
      var re2 = new RegExp('\\b(for\\s+)?' + shortDay(d) + '\\b', 'i');
      if (re.test(t) || re2.test(t)) day = d;
    });
    t = t.replace(/\b(for\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/ig, ' ').trim();
    var qty = '', unit = '', item = t;
    var m = t.match(/^(\d+(?:\.\d+)?)\s*(kilos?|kilograms?|kg|grams?|g|gms?|litres?|liters?|l|lt|ml|millilitres?|cups?|bunches?|bunch|each|pcs?|pieces?)?\s+(?:of\s+)?(.+)$/i);
    if (m) {
      qty = m[1];
      unit = (m[2] || '').toLowerCase();
      item = m[3];
      if (/^kilos?$|^kilograms?$/.test(unit)) unit = 'kg';
      if (/^grams?$|^gms?$/.test(unit)) unit = 'g';
      if (/^litres?$|^liters?$|^lt$/.test(unit)) unit = 'L';
      if (/^bunches?$/.test(unit)) unit = 'bunch';
      if (/^pieces?$|^pcs?$/.test(unit)) unit = 'pc';
    }
    item = item.replace(/\s+/g, ' ').trim();
    if (!item) return null;
    return { qty: qty, unit: unit, task: item, day: day, raw: text };
  }
  function voiceSupported() {
    return !!(root.SpeechRecognition || root.webkitSpeechRecognition);
  }
  function voicePanelHtml() {
    var ok = voiceSupported();
    return '<div class="panel u47-voice no-print" id="u47Voice">' +
      '<h3 style="margin:0 0 6px;">Voice add</h3>' +
      (ok
        ? '<button type="button" class="u47-mic" id="u47Mic" aria-label="Start dictation">🎤 Tap to dictate</button>' +
          '<div class="meta">Example: “5 kilo diced chicken for Wednesday”. Confirm before it is added.</div>'
        : '<div class="meta">Voice input is not supported in this browser. Use Chrome or Edge on Android/desktop, or type the line below.</div>') +
      '<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap;align-items:end;">' +
      '<div class="field"><label>Qty</label><input id="u47VQty" style="width:70px"></div>' +
      '<div class="field"><label>Unit</label><input id="u47VUnit" style="width:70px"></div>' +
      '<div class="field" style="flex:1"><label>Item</label><input id="u47VItem" style="width:100%"></div>' +
      '<div class="field"><label>Day</label><select id="u47VDay"><option value="">—</option>' +
      WEEKDAYS.filter(function (d) { return d !== 'Sunday'; }).map(function (d) {
        return '<option value="' + d + '">' + d + '</option>';
      }).join('') + '</select></div>' +
      '<button type="button" class="secondary" id="u47VAdd">Add line</button>' +
      '</div><div class="meta" id="u47VStatus"></div></div>';
  }
  function bindVoice(rootEl, handlers) {
    handlers = handlers || {};
    if (!rootEl) return;
    var qty = rootEl.querySelector('#u47VQty');
    var unit = rootEl.querySelector('#u47VUnit');
    var item = rootEl.querySelector('#u47VItem');
    var day = rootEl.querySelector('#u47VDay');
    var status = rootEl.querySelector('#u47VStatus');
    function fill(p) {
      if (!p) return;
      if (qty) qty.value = p.qty || '';
      if (unit) unit.value = p.unit || '';
      if (item) item.value = p.task || '';
      if (day && p.day) day.value = p.day;
      if (status) status.textContent = 'Heard: ' + (p.raw || '') + ' — check, then Add line.';
    }
    var mic = rootEl.querySelector('#u47Mic');
    if (mic && voiceSupported()) {
      mic.addEventListener('click', function () {
        var SR = root.SpeechRecognition || root.webkitSpeechRecognition;
        var rec = new SR();
        rec.lang = 'en-AU';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        if (status) status.textContent = 'Listening…';
        mic.classList.add('u47-mic-on');
        rec.onresult = function (ev) {
          var said = ev.results[0][0].transcript;
          fill(parseVoiceUtterance(said));
          mic.classList.remove('u47-mic-on');
        };
        rec.onerror = function () {
          if (status) status.textContent = 'Could not hear that. Try again or type the line.';
          mic.classList.remove('u47-mic-on');
        };
        rec.onend = function () { mic.classList.remove('u47-mic-on'); };
        try { rec.start(); } catch (e) {
          if (status) status.textContent = 'Mic busy — try again.';
          mic.classList.remove('u47-mic-on');
        }
      });
    }
    // Test hook: simulate recognition
    root.PreplineUpgrades47.simulateVoice = function (text) {
      fill(parseVoiceUtterance(text));
      return parseVoiceUtterance(text);
    };
    var add = rootEl.querySelector('#u47VAdd');
    if (add) add.addEventListener('click', function () {
      var payload = {
        qty: qty && qty.value, unit: unit && unit.value,
        task: item && item.value, day: day && day.value
      };
      if (!payload.task) { if (status) status.textContent = 'Enter an item first.'; return; }
      if (handlers.onAdd) handlers.onAdd(payload);
      if (status) status.textContent = 'Added.';
      if (item) item.value = '';
      if (qty) qty.value = '';
    });
  }

  /* ---------- 8) Auto-assign section ---------- */
  var SEC_MAP_KEY = 'prepline.sectionMap.v1';
  function sectionMap() { return lsGet(SEC_MAP_KEY, { byIngredient: {} }) || { byIngredient: {} }; }
  function saveSectionMap(m) { lsSet(SEC_MAP_KEY, m); }
  function learnSectionsFromRows(rows) {
    var m = sectionMap();
    (rows || []).forEach(function (r) {
      if (!r || !r.task || !r.section) return;
      var parts = root.PreplineBatch && root.PreplineBatch.parseTaskParts
        ? root.PreplineBatch.parseTaskParts(r.task) : { name: normKey(r.task) };
      var k = normKey(parts.name || r.task);
      if (!k) return;
      if (!m.byIngredient[k]) m.byIngredient[k] = {};
      m.byIngredient[k][r.section] = (m.byIngredient[k][r.section] || 0) + 1;
    });
    saveSectionMap(m);
    return m;
  }
  function suggestSection(task, fallback) {
    var parts = root.PreplineBatch && root.PreplineBatch.parseTaskParts
      ? root.PreplineBatch.parseTaskParts(task) : { name: normKey(task) };
    var k = normKey(parts.name || task);
    var m = sectionMap().byIngredient[k];
    if (!m) return { section: fallback || '', source: 'fallback', key: k };
    var best = '', n = 0;
    Object.keys(m).forEach(function (s) { if (m[s] > n) { n = m[s]; best = s; } });
    return { section: best || fallback || '', source: best ? 'learned' : 'fallback', key: k, count: n };
  }
  function sectionBadgeHtml(suggestion, escH) {
    escH = wrapEsc(escH);
    if (!suggestion || !suggestion.section) return '';
    var tip = suggestion.source === 'learned'
      ? ('Usually goes to ' + suggestion.section + ' (' + (suggestion.count || 0) + ' prior lines)')
      : 'Suggested from rules';
    return '<span class="u47-secbadge" title="' + escH(tip) + '">→ ' + escH(suggestion.section) + '</span>';
  }

  /* ---------- 10) Organised rows (shared screen + export) ---------- */
  var ORGANISED_HEADERS = [
    'Function name', 'Dish name', 'Pax / packs', 'Prep day', 'Event day',
    'Item name', 'Section', 'Qty each', 'Qty total needed', 'Batch no.', 'Staff allocated', 'Prep min', 'Notes'
  ];
  var PREP_MIN_KEY = 'prepline.organised.prepMin.v1';
  function prepMinMap() { return lsGet(PREP_MIN_KEY, {}) || {}; }
  function savePrepMinMap(m) { lsSet(PREP_MIN_KEY, m || {}); }
  var ORDER_KEY = 'prepline.organised.order.v1';
  var ITEM_VIEW_KEY = 'prepline.organised.itemView.v1';

  function forwardDaysGap(from, to) {
    var a = dayIdx(from), b = dayIdx(to);
    if (a < 0 || b < 0) return null;
    return (b - a + 7) % 7;
  }

  function normItem(s) {
    return String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9\s/+.-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function paxForDishes(dishes, helpers) {
    var paxMap = (helpers && helpers.paxByDish) || {};
    var vals = [];
    var seen = {};
    (dishes || []).forEach(function (d) {
      var n = paxMap[d];
      if (n == null || n === '') return;
      var s = String(n);
      if (seen[s]) return;
      seen[s] = true;
      vals.push(s);
    });
    return vals.length ? vals.join(' / ') : '—';
  }

  function eventDaysForGroup(g, deps) {
    var getEventDay = (deps && deps.getEventDay) || function () { return ''; };
    var days = [], seen = {};
    (g.rows || []).forEach(function (r) {
      var ed = getEventDay(r.dish) || '';
      if (!ed || seen[ed]) return;
      seen[ed] = true;
      days.push(ed);
    });
    if (!days.length && g.covers) return String(g.covers);
    days.sort(function (a, b) { return dayIdx(a) - dayIdx(b); });
    if (!days.length) return '—';
    if (days.length === 1) return days[0];
    return days.map(shortDay).join('/');
  }

  function latestEventDay(g, deps) {
    var getEventDay = (deps && deps.getEventDay) || function () { return ''; };
    var best = '', bi = -1;
    (g.rows || []).forEach(function (r) {
      var ed = getEventDay(r.dish) || '';
      var i = dayIdx(ed);
      if (i > bi) { bi = i; best = ed; }
    });
    return best;
  }

  function rowKeyFor(g, batchNo) {
    var dishes = (g.dishes || []).slice().sort().join('|');
    return [g.taskLabel || '', g.day || '', dishes, String(batchNo)].join('::');
  }

  function getSavedOrder() {
    var arr = lsGet(ORDER_KEY, []);
    return Array.isArray(arr) ? arr : [];
  }
  function saveOrder(keys) {
    lsSet(ORDER_KEY, keys || []);
  }
  function resetOrder() {
    try { localStorage.removeItem(ORDER_KEY); } catch (e) {}
  }

  function getItemViewState() {
    var s = lsGet(ITEM_VIEW_KEY, null) || {};
    return {
      mode: s.mode === 'section' ? 'section' : 'item',
      sortCol: s.sortCol || null,
      sortDir: s.sortDir === 'desc' ? 'desc' : 'asc',
      filters: s.filters && typeof s.filters === 'object' ? s.filters : {},
      search: typeof s.search === 'string' ? s.search : ''
    };
  }
  function setItemViewState(patch) {
    var cur = getItemViewState();
    Object.keys(patch || {}).forEach(function (k) { cur[k] = patch[k]; });
    lsSet(ITEM_VIEW_KEY, cur);
    return cur;
  }

  function buildOrganisedRows(rows, deps, helpers) {
    helpers = helpers || {};
    deps = deps || {};
    var clean = helpers.cleanDishName || function (d) { return d; };
    var staffBySection = helpers.staffBySection || {};
    var batches = (root.PreplineBatch && root.PreplineBatch.buildBatches)
      ? root.PreplineBatch.buildBatches(rows, deps) : [];
    var out = [];
    var batchNo = 0;
    batches.forEach(function (g) {
      batchNo += 1;
      var names = functionNamesForGroup(g, clean);
      var functionName = g.merged
        ? mergedSubtitleText(g, { cleanDishName: clean, maxNames: 99 })
        : (names[0] || clean((g.dishes && g.dishes[0]) || '') || '—');
      if (!functionName) functionName = '—';
      var dishName = names.length ? names.join(' + ') : '—';
      var prepDay = g.day || '—';
      var eventDay = eventDaysForGroup(g, deps);
      var latestEv = latestEventDay(g, deps);
      var gap = (prepDay && prepDay !== '—' && latestEv) ? forwardDaysGap(prepDay, latestEv) : null;
      var shadeLate = gap != null && gap > 4;
      var qtyEach = '—';
      if (g.rows && g.rows[0] && g.rows[0].qty !== '' && g.rows[0].qty != null) {
        qtyEach = String(g.rows[0].qty) + (g.rows[0].unit ? ' ' + g.rows[0].unit : '');
      }
      var qtyTotal = g.hasTotal
        ? (String(Math.round(g.total * 1000) / 1000) + ' ' + (g.unit || '')).trim()
        : 'set pax';
      var itemName = g.taskLabel || '—';
      var sectionName = g.section || '—';
      var rk = rowKeyFor(g, batchNo);
      var ov = staffOverrideMap();
      var staff = (ov[rk] != null && ov[rk] !== '') ? ov[rk]
        : (staffBySection[g.section] || helpers.defaultStaff || 'Unallocated');
      var noteVal = (notesMap()[rk] != null) ? String(notesMap()[rk]) : '';
      var pmRaw = prepMinMap()[rk];
      var prepMin = (pmRaw != null && pmRaw !== '') ? String(pmRaw) : '';
      var cells = {
        functionName: functionName || '—',
        dishName: dishName || '—',
        paxPacks: paxForDishes(g.dishes, helpers) || '—',
        prepDay: prepDay || '—',
        eventDay: eventDay || '—',
        itemName: itemName || '—',
        section: sectionName || '—',
        qtyEach: qtyEach || '—',
        qtyTotal: qtyTotal || '—',
        batchNo: String(batchNo),
        staff: staff || 'Unallocated',
        prepMin: prepMin, /* blank until set */
        notes: noteVal === '' ? '—' : noteVal
      };
      Object.keys(cells).forEach(function (k) {
        if (k === 'prepMin') return; /* blank until set — never force em-dash */
        if (cells[k] == null || cells[k] === '') cells[k] = '—';
      });
      out.push({
        key: rk,
        cells: cells,
        values: [
          cells.functionName, cells.dishName, cells.paxPacks, cells.prepDay, cells.eventDay,
          cells.itemName, cells.section, cells.qtyEach, cells.qtyTotal, cells.batchNo, cells.staff,
          cells.prepMin === '' ? '' : cells.prepMin, cells.notes
        ],
        section: sectionName || '—',
        sectionFill: sectionColour(sectionName),
        merged: !!g.merged,
        shadeLate: shadeLate,
        gap: gap,
        group: g,
        itemNorm: normItem(itemName),
        eventIdx: dayIdx(latestEv),
        functionNorm: normItem(functionName),
        dup: false,
        dupCount: 0
      });
    });
    /* Duplicate warning: same item + same function (not intentional batch merges) */
    var dupIndex = {};
    out.forEach(function (r) {
      if (r.merged) return;
      var dk = r.itemNorm + '||' + r.functionNorm;
      if (!dupIndex[dk]) dupIndex[dk] = [];
      dupIndex[dk].push(r);
    });
    Object.keys(dupIndex).forEach(function (dk) {
      var list = dupIndex[dk];
      if (list.length < 2) return;
      list.forEach(function (r) { r.dup = true; r.dupCount = list.length; });
    });

    out.sort(function (a, b) {
      if (a.itemNorm < b.itemNorm) return -1;
      if (a.itemNorm > b.itemNorm) return 1;
      if (a.eventIdx !== b.eventIdx) {
        if (a.eventIdx < 0) return 1;
        if (b.eventIdx < 0) return -1;
        return a.eventIdx - b.eventIdx;
      }
      if (a.functionNorm < b.functionNorm) return -1;
      if (a.functionNorm > b.functionNorm) return 1;
      return 0;
    });

    var saved = getSavedOrder();
    if (saved && saved.length) {
      var byKey = {};
      out.forEach(function (r) { byKey[r.key] = r; });
      var ordered = [];
      var used = {};
      saved.forEach(function (k) {
        if (byKey[k] && !used[k]) { ordered.push(byKey[k]); used[k] = true; }
      });
      out.forEach(function (r) {
        if (!used[r.key]) ordered.push(r);
      });
      out = ordered;
    }
    return out;
  }

  function buildExportRows(rows, deps, helpers) {
    return buildOrganisedRows(rows, deps, helpers).map(function (r) {
      return {
        dishName: r.cells.dishName,
        itemName: r.cells.itemName,
        section: r.cells.section,
        notes: r.cells.notes,
        qtyEach: r.cells.qtyEach,
        qtyTotal: r.cells.qtyTotal,
        batchNo: r.cells.batchNo,
        staff: r.cells.staff,
        functionName: r.cells.functionName,
        paxPacks: r.cells.paxPacks,
        prepDay: r.cells.prepDay,
        eventDay: r.cells.eventDay,
        merged: r.merged,
        shadeLate: r.shadeLate,
        group: r.group,
        key: r.key,
        values: r.values,
        cells: r.cells
      };
    });
  }

  function loadExcelJS() {
    return new Promise(function (resolve, reject) {
      if (root.ExcelJS) return resolve(root.ExcelJS);
      var s = document.createElement('script');
      s.src = 'vendor/exceljs/exceljs.min.js';
      s.onload = function () { resolve(root.ExcelJS); };
      s.onerror = function () { reject(new Error('ExcelJS failed to load')); };
      document.head.appendChild(s);
    });
  }

  function exportOrganisedXlsx(rows, deps, helpers) {
    helpers = helpers || {};
    var data = buildOrganisedRows(rows, deps, helpers);
    if (!helpers.allRows) data = applyItemFiltersSort(data, getItemViewState());
    var headers = ORGANISED_HEADERS.slice();
    var name = 'Prepline_Organised_' + (new Date().toISOString().slice(0, 10)) + '.xlsx';
    var lateFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

    function downloadBlob(buf, filename) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 1500);
    }

    function withExcelJS(ExcelJS) {
      var wb = new ExcelJS.Workbook();
      var ws = wb.addWorksheet('Prep list', {
        views: [{ state: 'frozen', ySplit: 1, activeCell: 'A2', showGridLines: true }]
      });
      ws.columns = [
        { key: 'functionName', width: 28 },
        { key: 'dishName', width: 28 },
        { key: 'paxPacks', width: 12 },
        { key: 'prepDay', width: 12 },
        { key: 'eventDay', width: 14 },
        { key: 'itemName', width: 32 },
        { key: 'section', width: 22 },
        { key: 'qtyEach', width: 12 },
        { key: 'qtyTotal', width: 16 },
        { key: 'batchNo', width: 10 },
        { key: 'staff', width: 16 },
        { key: 'prepMin', width: 10 },
        { key: 'notes', width: 24 }
      ];
      var head = ws.addRow(headers);
      head.eachCell(function (cell) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        cell.font = { bold: true, name: 'Arial', size: 11 };
        cell.alignment = { vertical: 'top', wrapText: true, horizontal: 'left' };
      });
      data.forEach(function (r) {
        var row = ws.addRow(r.values.map(function (v) { return (v == null || v === '') ? '—' : v; }));
        var secFill = r.sectionFill && r.sectionFill.bg
          ? { type: 'pattern', pattern: 'solid', fgColor: { argb: r.sectionFill.bg } }
          : null;
        row.eachCell(function (cell) {
          cell.alignment = { vertical: 'top', wrapText: true, horizontal: 'left' };
          if (secFill) cell.fill = secFill;
          else if (r.shadeLate) cell.fill = lateFill;
          if (cell.value == null || cell.value === '') cell.value = '—';
        });
      });
      var ncols = headers.length;
      ws.eachRow(function (row, rn) {
        if (rn === 1) return;
        for (var c = 1; c <= ncols; c++) {
          var cell = row.getCell(c);
          if (cell.value == null || cell.value === '') cell.value = '—';
          cell.alignment = { vertical: 'top', wrapText: true, horizontal: 'left' };
        }
      });
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, data.length + 1), column: ncols }
      };
      return wb.xlsx.writeBuffer().then(function (buf) {
        downloadBlob(buf, name);
        return { name: name, rows: data.length, headers: headers, data: data, engine: 'exceljs' };
      });
    }

    function withXLSX() {
      if (typeof XLSX === 'undefined' || !XLSX.utils) throw new Error('XLSX not loaded');
      var aoa = [headers];
      data.forEach(function (r) {
        aoa.push(r.values.map(function (v) { return (v == null || v === '') ? '—' : v; }));
      });
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      var yellow = { patternType: 'solid', fgColor: { rgb: 'FFFF00' } };
      var bold = { bold: true, name: 'Arial', sz: 11 };
      var wrapTop = { vertical: 'top', wrapText: true, horizontal: 'left' };
      var late = { patternType: 'solid', fgColor: { rgb: 'F2F2F2' } };
      headers.forEach(function (_, c) {
        var addr = XLSX.utils.encode_cell({ r: 0, c: c });
        if (!ws[addr]) ws[addr] = { t: 's', v: headers[c] };
        ws[addr].s = { fill: yellow, font: bold, alignment: wrapTop };
      });
      var ncols = headers.length;
      for (var r = 1; r < aoa.length; r++) {
        for (var c = 0; c < ncols; c++) {
          var a = XLSX.utils.encode_cell({ r: r, c: c });
          if (!ws[a] || ws[a].v === '' || ws[a].v == null) ws[a] = { t: 's', v: '—' };
          var style = { alignment: wrapTop };
          var dr = data[r - 1];
          if (dr && dr.sectionFill && dr.sectionFill.bg) style.fill = { patternType: 'solid', fgColor: { rgb: dr.sectionFill.bg.slice(2) } };
          else if (dr && dr.shadeLate) style.fill = late;
          ws[a].s = Object.assign({}, ws[a].s || {}, style);
        }
      }
      ws['!cols'] = [
        { wch: 28 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
        { wch: 32 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 24 }
      ];
      var lastCol = XLSX.utils.encode_col(ncols - 1);
      ws['!autofilter'] = { ref: 'A1:' + lastCol + Math.max(1, aoa.length) };
      ws['!freeze'] = 'A2';
      ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2', activeCell: 'A2' }];
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Prep list');
      XLSX.writeFile(wb, name);
      return { name: name, rows: data.length, headers: headers, data: data, engine: 'xlsx' };
    }

    if (typeof document !== 'undefined') {
      if (helpers.forceXlsx) return withXLSX();
      var pending = loadExcelJS().then(withExcelJS).catch(function () { return withXLSX(); });
      pending.name = name; pending.rows = data.length; pending.headers = headers; pending.data = data;
      return pending;
    }
    return withXLSX();
  }

  var COL_KEYS = [
    'functionName', 'dishName', 'paxPacks', 'prepDay', 'eventDay',
    'itemName', 'section', 'qtyEach', 'qtyTotal', 'batchNo', 'staff', 'notes'
  ];

  function applyItemFiltersSort(rows, state) {
    state = state || getItemViewState();
    var filters = state.filters || {};
    var q = String(state.search || '').trim().toLowerCase();
    var filtered = rows.filter(function (r) {
      if (q) {
        var hay = (r.values || []).join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return COL_KEYS.every(function (k) {
        var f = filters[k];
        if (!f) return true;
        var cell = String(r.cells[k] || '');
        if (typeof f === 'object' && !Array.isArray(f)) {
          if (f.text && cell.toLowerCase().indexOf(String(f.text).toLowerCase()) < 0) return false;
          if (Array.isArray(f.values) && f.values.length && f.values.indexOf(cell) < 0) return false;
          return true;
        }
        if (Array.isArray(f)) return f.indexOf(cell) >= 0;
        return cell.toLowerCase().indexOf(String(f).toLowerCase()) >= 0;
      });
    });
    if (state.sortCol && COL_KEYS.indexOf(state.sortCol) >= 0) {
      var col = state.sortCol;
      var dir = state.sortDir === 'desc' ? -1 : 1;
      filtered = filtered.slice().sort(function (a, b) {
        var va = String(a.cells[col] || '');
        var vb = String(b.cells[col] || '');
        if (col === 'prepDay' || col === 'eventDay') {
          var ia = dayIdx(va), ib = dayIdx(vb);
          if (ia >= 0 || ib >= 0) {
            if (ia < 0) return 1 * dir;
            if (ib < 0) return -1 * dir;
            return (ia - ib) * dir;
          }
        }
        if (col === 'section') {
          var sa = SECTION_ORDER.indexOf(va), sb = SECTION_ORDER.indexOf(vb);
          if (sa < 0) sa = 999; if (sb < 0) sb = 999;
          if (sa !== sb) return (sa - sb) * dir;
        }
        if (col === 'itemName') { va = a.itemNorm; vb = b.itemNorm; }
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    }
    return filtered;
  }


  function injectWeekEndingPrintCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('u47WePrintCss')) return;
    var s = document.createElement('style');
    s.id = 'u47WePrintCss';
    s.textContent = '@media print{.u47-week-ending{position:fixed;top:0;left:0;right:0;z-index:9999;}' +
      '.u47-itemview{padding-top:48px;}.u47-week-ending{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}';
    document.head.appendChild(s);
  }

  function renderByItemView(rows, deps, helpers) {
    helpers = helpers || {};
    var escH = wrapEsc(helpers.escapeHtml || esc);
    var state = getItemViewState();
    var all = buildOrganisedRows(rows, deps, helpers);
    var list = applyItemFiltersSort(all, state);
    var tickHtml = helpers.tickControlsHtml || function () { return ''; };
    var batchReason = helpers.batchReasonHtml || function () { return ''; };
    var unbatchBtn = helpers.unbatchButtonHtml || function () { return ''; };

    var html = '';
    var weBanner = 'WEEK ENDING: ____';
    try {
      if (root.Prepline477 && typeof root.Prepline477.resolveWeekEndingLabel === 'function') {
        var srcFile = (typeof sourceInfo !== 'undefined' && sourceInfo && sourceInfo.name) || '';
        weBanner = root.Prepline477.resolveWeekEndingLabel({ sourceFileName: srcFile, getEventDateStr: helpers.getEventDateStr }, []).label;
      }
    } catch (eWe) {}
    html += '<div class="u47-itemview" id="u47ItemView" data-no-daynum>';
    try { injectWeekEndingPrintCss(); } catch (eCss) {}
    html += '<div class="u47-week-ending" role="banner">' + escH(weBanner) + '</div>';
    html += '<div class="u47-toolbar no-print">';
    html += '<div class="viewtoggle u47-itemtoggle">';
    html += '<button type="button" class="' + (state.mode === 'item' ? '' : 'secondary') + '" data-u47-mode="item">By item</button>';
    html += '<button type="button" class="' + (state.mode === 'section' ? '' : 'secondary') + '" data-u47-mode="section">By section</button>';
    html += '</div>';
    html += '<button type="button" class="secondary" id="u47ResetOrder" title="Clear saved drag order">Reset order</button>';
    html += '<span class="u47-note" style="margin:0">' + list.length + ' rows · same columns as Organised export · drag ☰ to reorder</span>';
    html += '</div>';

    html += '<div class="u47-filters no-print">';
    COL_KEYS.forEach(function (k, i) {
      var label = ORGANISED_HEADERS[i];
      var val = (state.filters && state.filters[k]) || '';
      html += '<label class="u47-filter">' + escH(label) +
        '<input type="search" data-u47-filter="' + k + '" value="' + escH(val) + '" placeholder="Filter…"></label>';
    });
    html += '</div>';

    function sortMark(col) {
      if (state.sortCol !== col) return '';
      return state.sortDir === 'desc' ? ' ↓' : ' ↑';
    }

    function rowCard(r) {
      var g = r.group;
      var tick = (state.mode === 'section' && !helpers.print) ? tickHtml(g) : '';
      var sub = (r.merged && helpers.showMerged !== false) ? batchReason(g) : '';
      var unb = (state.mode === 'section' && r.merged) ? unbatchBtn(g) : '';
      return '<article class="u47-card' + (r.shadeLate ? ' u47-late' : '') + (r.merged ? ' u47-merged-row' : '') +
        '" draggable="false" data-u47-key="' + escH(r.key) + '">' +
        '<div class="u47-card-top">' +
          '<button type="button" class="u47-drag" data-u47-drag aria-label="Drag to reorder" title="Drag to reorder">☰</button>' +
          '<div class="u47-card-main">' +
            '<div class="u47-card-item"><strong>' + escH(r.cells.itemName) + '</strong>' +
              (r.merged ? ' <span class="u47-pill">merged</span>' : '') + '</div>' +
            '<div class="u47-card-meta">' + escH(r.cells.functionName) +
              (r.cells.functionName !== r.cells.dishName ? ' · ' + escH(r.cells.dishName) : '') + '</div>' +
            '<div class="u47-card-meta">' + escH(r.cells.prepDay) + ' prep → ' + escH(r.cells.eventDay) +
              ' · pax ' + escH(r.cells.paxPacks) + '</div>' +
            '<div class="u47-card-meta">Section: ' + escH(r.cells.section) + '</div>' +
            '<div class="u47-card-qty">' + escH(r.cells.qtyEach) + ' each · <b>' + escH(r.cells.qtyTotal) + '</b>' +
              ' · batch ' + escH(r.cells.batchNo) + ' · ' + escH(r.cells.staff) + '</div>' +
            sub + unb +
          '</div>' + tick +
        '</div></article>';
    }

    function rowTr(r) {
      var g = r.group;
      var tick = (state.mode === 'section' && !helpers.print)
        ? ('<td class="u47-tickcell">' + tickHtml(g) + '</td>') : '';
      var cellsHtml = r.values.map(function (v) {
        return '<td data-u47-v="' + escH(v) + '">' + escH(v) + '</td>';
      }).join('');
      return '<tr class="' + (r.shadeLate ? 'u47-late' : '') + (r.merged ? ' u47-merged-row' : '') +
        '" data-u47-key="' + escH(r.key) + '" draggable="false">' +
        '<td class="u47-dragcell no-print"><button type="button" class="u47-drag" data-u47-drag aria-label="Drag to reorder">☰</button></td>' +
        cellsHtml + tick + '</tr>';
    }

    function tableHead(withTick) {
      var h = '<div class="u47-table-wrap u47-desktop-only"><table class="u47-table"><thead><tr>' +
        '<th class="no-print"></th>';
      ORGANISED_HEADERS.forEach(function (label, i) {
        var k = COL_KEYS[i];
        h += '<th><button type="button" class="u47-sort" data-u47-sort="' + k + '">' +
          escH(label) + sortMark(k) + '</button></th>';
      });
      if (withTick) h += '<th class="no-print">Tick</th>';
      h += '</tr></thead><tbody data-u47-list>';
      return h;
    }

    if (state.mode === 'section') {
      var bySec = {};
      list.forEach(function (r) {
        var s = r.section || '—';
        if (!bySec[s]) bySec[s] = [];
        bySec[s].push(r);
      });
      var secs = Object.keys(bySec).sort(function (a, b) {
        var ia = SECTION_ORDER.indexOf(a), ib = SECTION_ORDER.indexOf(b);
        if (ia < 0) ia = 999; if (ib < 0) ib = 999;
        if (ia !== ib) return ia - ib;
        return a.localeCompare(b);
      });
      secs.forEach(function (sec) {
        html += '<section class="u47-secblock"><h3 class="u47-sechead">' + escH(sec) +
          ' <span class="u47-note">(' + bySec[sec].length + ')</span></h3>';
        html += '<div class="u47-cards u47-phone-only" data-u47-list>' + bySec[sec].map(rowCard).join('') + '</div>';
        html += tableHead(true) + bySec[sec].map(rowTr).join('') + '</tbody></table></div></section>';
      });
    } else {
      html += '<div class="u47-cards u47-phone-only" data-u47-list>' + list.map(rowCard).join('') + '</div>';
      html += tableHead(false) + list.map(rowTr).join('') + '</tbody></table></div>';
    }

    if (!list.length) html += '<div class="panel">No rows match the filters.</div>';
    html += '</div>';
    return html;
  }

  function bindByItemView(rootEl, onChange) {
    if (!rootEl) return;
    rootEl.querySelectorAll('[data-u47-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setItemViewState({ mode: btn.getAttribute('data-u47-mode') });
        if (onChange) onChange();
      });
    });
    rootEl.querySelectorAll('[data-u47-sort]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var col = btn.getAttribute('data-u47-sort');
        var st = getItemViewState();
        if (st.sortCol === col) {
          setItemViewState({ sortDir: st.sortDir === 'asc' ? 'desc' : 'asc' });
        } else {
          setItemViewState({ sortCol: col, sortDir: 'asc' });
        }
        if (onChange) onChange();
      });
    });
    var filterTimer = null;
    rootEl.querySelectorAll('[data-u47-filter]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(function () {
          var st = getItemViewState();
          var filters = Object.assign({}, st.filters);
          var k = inp.getAttribute('data-u47-filter');
          var v = inp.value.trim();
          if (v) filters[k] = v; else delete filters[k];
          setItemViewState({ filters: filters });
          if (onChange) onChange();
        }, 200);
      });
    });
    var reset = rootEl.querySelector('#u47ResetOrder');
    if (reset) reset.addEventListener('click', function () {
      resetOrder();
      setItemViewState({ sortCol: null, sortDir: 'asc' });
      if (onChange) onChange();
    });

    var dragKey = null;
    var longTimer = null;
    var dragging = false;

    function collectKeys(listEl) {
      return Array.prototype.map.call(listEl.querySelectorAll('[data-u47-key]'), function (el) {
        return el.getAttribute('data-u47-key');
      });
    }
    function persistFromDom() {
      var lists = rootEl.querySelectorAll('[data-u47-list]');
      var keys = [];
      if (lists.length) {
        var best = collectKeys(lists[0]);
        for (var i = 0; i < lists.length; i++) {
          var kk = collectKeys(lists[i]);
          if (kk.length >= best.length) best = kk;
        }
        keys = best;
      }
      saveOrder(keys);
    }

    rootEl.querySelectorAll('[data-u47-list]').forEach(function (listEl) {
      listEl.querySelectorAll('[data-u47-key]').forEach(function (row) {
        var handle = row.querySelector('[data-u47-drag]') || row;
        handle.addEventListener('mousedown', function () { row.setAttribute('draggable', 'true'); });
        handle.addEventListener('mouseup', function () { row.setAttribute('draggable', 'false'); });
        handle.addEventListener('touchstart', function () {
          longTimer = setTimeout(function () {
            dragging = true;
            dragKey = row.getAttribute('data-u47-key');
            row.classList.add('u47-dragging');
          }, 350);
        }, { passive: true });
        handle.addEventListener('touchend', function () {
          clearTimeout(longTimer);
          if (dragging) {
            dragging = false;
            row.classList.remove('u47-dragging');
            persistFromDom();
            if (onChange) onChange();
          }
          dragKey = null;
        });
        handle.addEventListener('touchmove', function (e) {
          if (!dragging) { clearTimeout(longTimer); return; }
          var t = e.touches[0];
          var el = document.elementFromPoint(t.clientX, t.clientY);
          var target = el && el.closest ? el.closest('[data-u47-key]') : null;
          if (target && target.parentNode === listEl && target !== row) {
            var rect = target.getBoundingClientRect();
            if (t.clientY < rect.top + rect.height / 2) listEl.insertBefore(row, target);
            else listEl.insertBefore(row, target.nextSibling);
          }
        }, { passive: true });

        row.addEventListener('dragstart', function (e) {
          dragKey = row.getAttribute('data-u47-key');
          row.classList.add('u47-dragging');
          try { e.dataTransfer.setData('text/plain', dragKey); e.dataTransfer.effectAllowed = 'move'; } catch (err) {}
        });
        row.addEventListener('dragend', function () {
          row.classList.remove('u47-dragging');
          row.setAttribute('draggable', 'false');
          persistFromDom();
          dragKey = null;
          if (onChange) onChange();
        });
      });
      listEl.addEventListener('dragover', function (e) {
        e.preventDefault();
        var target = e.target.closest ? e.target.closest('[data-u47-key]') : null;
        if (!target || !dragKey) return;
        var moving = null;
        try {
          moving = listEl.querySelector('[data-u47-key="' + dragKey.replace(/"/g, '\\"') + '"]');
        } catch (err) {
          listEl.querySelectorAll('[data-u47-key]').forEach(function (el) {
            if (el.getAttribute('data-u47-key') === dragKey) moving = el;
          });
        }
        if (!moving || moving === target) return;
        var rect = target.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) listEl.insertBefore(moving, target);
        else listEl.insertBefore(moving, target.nextSibling);
      });
    });
  }

  /* ---------- CSS ---------- */
  function css() {
    return [
      '.u47-note{font-size:12.5px;color:var(--ink-soft,#5C5A52);margin:0 0 12px;}',
      '.u47-dayhead{margin:0 0 8px;}',
      '.u47-sechead{margin:12px 0 6px;font-size:14px;color:var(--ink-soft,#5C5A52);}',
      '.u47-tickbar{display:inline-flex;align-items:center;gap:6px;margin-top:6px;}',
      '.u47-tickbtn{width:44px;height:44px;border-radius:10px;border:1px solid var(--line,#D9D3C3);background:#fff;font-size:20px;cursor:pointer;}',
      '.u47-tick-done .u47-tickbtn[data-tick=done],.u47-tick-part .u47-tickbtn[data-tick=part]{background:#1C1B16;color:#fff;border-color:#1C1B16;}',
      '.u47-tickpct{width:64px;height:40px;font-size:16px;}',
      '.u47-progbar{height:8px;background:#E8E4D8;border-radius:99px;margin:8px 0;overflow:hidden;}',
      '.u47-progbar>div{height:100%;background:#2F6B3A;}',
      '.u47-diff ul{margin:6px 0;padding-left:18px;}',
      '.u47-add{color:#2F6B3A;}',
      '.u47-rem{color:#9B2C2C;}',
      '.u47-chg{color:#7A5A00;}',
      '.u47-mic{width:100%;max-width:320px;height:64px;font-size:18px;border-radius:12px;border:2px solid #1C1B16;background:#fff;cursor:pointer;}',
      '.u47-mic-on{background:#FFF4C2;border-color:#C9A227;}',
      '.u47-secbadge{display:inline-block;margin-left:6px;font-size:11px;padding:2px 7px;border-radius:999px;background:#E8F0FE;color:#1A56DB;}',
      '.u47-merged-short{display:none;}',
      '@media (max-width:520px){.u47-merged-full{display:none;}.u47-merged-short{display:inline;}}',
      '.u47-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;align-items:center;}',
      '.u47-week-ending{font-family:Calibri,Arial,sans-serif;font-size:18px;font-weight:700;text-align:center;padding:8px 10px;margin:0 0 8px;background:#FFF2CC;border:1px solid #000;letter-spacing:0.02em;}',
      '.u47-itemview{margin-top:8px;}',
      '.u47-filters{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin:0 0 12px;}',
      '.u47-filter{font-size:11px;color:var(--ink-soft,#5C5A52);display:flex;flex-direction:column;gap:2px;}',
      '.u47-filter input{font-size:12px;padding:4px 6px;border:1px solid var(--line,#D9D3C3);border-radius:6px;}',
      '.u47-table-wrap{max-height:70vh;overflow:auto;border:1px solid var(--line,#D9D3C3);border-radius:8px;background:#fff;}',
      '.u47-table{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px;}',
      '.u47-table thead th{position:sticky;top:0;z-index:2;background:#FFFF00;font-weight:700;text-align:left;padding:8px 8px;border-bottom:1px solid #ccc;white-space:nowrap;}',
      '.u47-table td{padding:8px;border-bottom:1px solid #eee;vertical-align:top;white-space:normal;word-break:break-word;}',
      '.u47-table tr.u47-late td,.u47-card.u47-late{background:#F2F2F2;}',
      '.u47-sort{background:none;border:none;font:inherit;font-weight:700;cursor:pointer;padding:0;text-align:left;}',
      '.u47-drag{width:36px;height:36px;border:1px solid var(--line,#D9D3C3);border-radius:8px;background:#fff;cursor:grab;font-size:16px;}',
      '.u47-dragging{opacity:.55;outline:2px dashed #1C1B16;}',
      '.u47-cards{display:flex;flex-direction:column;gap:10px;}',
      '.u47-card{border:1px solid var(--line,#D9D3C3);border-radius:10px;padding:10px;background:#fff;}',
      '.u47-card-top{display:flex;gap:8px;align-items:flex-start;}',
      '.u47-card-item{font-size:15px;}',
      '.u47-card-meta{font-size:12px;color:var(--ink-soft,#5C5A52);margin-top:2px;}',
      '.u47-card-qty{font-size:13px;margin-top:6px;}',
      '.u47-pill{font-size:10px;padding:1px 6px;border-radius:999px;background:#FFF4C2;color:#6B4F28;vertical-align:middle;}',
      '.u47-phone-only{display:none;}',
      '.u47-desktop-only{display:block;}',
      '@media (max-width:720px){.u47-phone-only{display:flex;}.u47-desktop-only{display:none;}.u47-filters{grid-template-columns:1fr 1fr;}}'
    ].join('');
  }
  function ensureCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('u47Css')) return;
    var s = document.createElement('style');
    s.id = 'u47Css';
    s.textContent = css() + stationPrintCss();
    document.head.appendChild(s);
  }

  root.PreplineUpgrades47 = {
    VERSION: '4.7.2',
    buildWeekGroups: buildWeekGroups,
    renderWeekView: renderWeekView,
    mergedSubtitleText: mergedSubtitleText,
    mergedSubtitleHtml: mergedSubtitleHtml,
    functionNamesForGroup: functionNamesForGroup,
    getTick: getTick,
    setTick: setTick,
    tickControlsHtml: tickControlsHtml,
    progressSummaryHtml: progressSummaryHtml,
    exportProgressCode: exportProgressCode,
    importProgressCode: importProgressCode,
    bindTickControls: bindTickControls,
    rememberSnapshot: rememberSnapshot,
    peekLastDiff: peekLastDiff,
    diffSnapshots: diffSnapshots,
    changeCheckHtml: changeCheckHtml,
    buildOrderFromBatches: buildOrderFromBatches,
    renderOrderFromBatches: renderOrderFromBatches,
    orderCsv: orderCsv,
    recipeLib: recipeLib,
    saveRecipes: saveRecipes,
    applyYieldToQty: applyYieldToQty,
    recipeLibHtml: recipeLibHtml,
    bindRecipeLib: bindRecipeLib,
    useByFromPrep: useByFromPrep,
    buildStationSheetsFromAlloc: buildStationSheetsFromAlloc,
    stationSheetHtml: stationSheetHtml,
    stationPrintCss: stationPrintCss,
    parseVoiceUtterance: parseVoiceUtterance,
    voiceSupported: voiceSupported,
    voicePanelHtml: voicePanelHtml,
    bindVoice: bindVoice,
    simulateVoice: function (text) {
      var p = parseVoiceUtterance(text);
      if (p && typeof document !== 'undefined') {
        var qty = document.getElementById('u47VQty');
        var unit = document.getElementById('u47VUnit');
        var item = document.getElementById('u47VItem');
        var day = document.getElementById('u47VDay');
        var status = document.getElementById('u47VStatus');
        if (qty) qty.value = p.qty || '';
        if (unit) unit.value = p.unit || '';
        if (item) item.value = p.task || '';
        if (day && p.day) day.value = p.day;
        if (status) status.textContent = 'Heard: ' + (p.raw || '') + ' — check, then Add line.';
      }
      return p;
    },
    learnSectionsFromRows: learnSectionsFromRows,
    suggestSection: suggestSection,
    sectionBadgeHtml: sectionBadgeHtml,
    ORGANISED_HEADERS: ORGANISED_HEADERS,
    COL_KEYS: COL_KEYS,
    SECTION_ORDER: SECTION_ORDER,
    sectionColour: sectionColour,
    notesMap: notesMap,
    saveNotesMap: saveNotesMap,
    prepMinMap: prepMinMap,
    savePrepMinMap: savePrepMinMap,
    staffOverrideMap: staffOverrideMap,
    saveStaffOverrideMap: saveStaffOverrideMap,
    pushHistory: pushHistory,
    historyList: historyList,
    exportHistoryCsv: exportHistoryCsv,
    pushUndo: pushUndo,
    popUndo: popUndo,
    showToast: showToast,
    markSavedIndicator: markSavedIndicator,
    getDeviceWho: getDeviceWho,
    setDeviceWho: setDeviceWho,
    sydneyStamp: sydneyStamp,
    buildOrganisedRows: buildOrganisedRows,
    buildExportRows: buildExportRows,
    exportOrganisedXlsx: exportOrganisedXlsx,
    renderByItemView: renderByItemView,
    bindByItemView: bindByItemView,
    applyItemFiltersSort: applyItemFiltersSort,
    getItemViewState: getItemViewState,
    setItemViewState: setItemViewState,
    getSavedOrder: getSavedOrder,
    saveOrder: saveOrder,
    resetOrder: resetOrder,
    ensureCss: ensureCss,
    latestDeliveryDay: latestDeliveryDay,
    SHELF_DAYS: SHELF_DAYS
  };
})(typeof window !== 'undefined' ? window : globalThis);
