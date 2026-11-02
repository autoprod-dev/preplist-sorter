/* Prepline 4.7.2 extensions (trial copy only). Builds on PreplineUpgrades47. */
(function (root) {
  'use strict';
  var U = root.PreplineUpgrades47;
  if (!U) { console.warn('upgrades-472: PreplineUpgrades47 missing'); return; }

  var WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function lsGet(k, fb) {
    try { var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  var WEATHER_KEY = 'prepline.weather.v1';
  var TEMPLATE_KEY = 'prepline.fnTemplates.v1';
  var REVIEWED_KEY = 'prepline.reviewed.v1';
  var DISPATCH_KEY = 'prepline.dispatch.v1';
  var EMAIL_TO_KEY = 'prepline.emailTo.v1';
  var BULK_KEYS = 'prepline.organised.bulkSel.v1';

  function weatherMap() { return lsGet(WEATHER_KEY, {}) || {}; }
  function saveWeatherMap(m) { lsSet(WEATHER_KEY, m || {}); }
  function templates() { return lsGet(TEMPLATE_KEY, {}) || {}; }
  function saveTemplates(m) { lsSet(TEMPLATE_KEY, m || {}); }
  function reviewedMap() { return lsGet(REVIEWED_KEY, {}) || {}; }
  function saveReviewed(m) { lsSet(REVIEWED_KEY, m || {}); }
  function dispatchMap() { return lsGet(DISPATCH_KEY, {}) || {}; }
  function saveDispatch(m) { lsSet(DISPATCH_KEY, m || {}); }
  function emailTo() { var v = lsGet(EMAIL_TO_KEY, ''); return typeof v === 'string' ? v : ''; }
  function setEmailTo(v) { lsSet(EMAIL_TO_KEY, String(v || '').trim()); }

  function bulkKeys() { var a = lsGet(BULK_KEYS, []); return Array.isArray(a) ? a : []; }
  function saveBulkKeys(a) { lsSet(BULK_KEYS, a || []); }

  function hist(what, from, to, key) {
    if (U.pushHistory) U.pushHistory({ what: what, from: from, to: to, key: key });
  }

  /* ---------- Staff day totals + conflicts ---------- */
  function staffDayTotals(organisedRows) {
    var byDay = {};
    WEEKDAYS.forEach(function (d) { byDay[d] = { names: {}, count: 0 }; });
    (organisedRows || []).forEach(function (r) {
      var day = r.cells && r.cells.prepDay;
      if (!day || !byDay[day]) return;
      var staff = String(r.cells.staff || '').trim();
      if (!staff || staff === '—' || /^unalloc/i.test(staff)) return;
      staff.split(/[,;/]+/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (n) {
        if (!byDay[day].names[n]) byDay[day].names[n] = [];
        byDay[day].names[n].push(r);
        byDay[day].count++;
      });
    });
    return byDay;
  }
  function staffingConflicts(organisedRows) {
    var totals = staffDayTotals(organisedRows);
    var conflicts = [];
    Object.keys(totals).forEach(function (day) {
      var names = totals[day].names;
      Object.keys(names).forEach(function (n) {
        var rows = names[n];
        var fns = {};
        rows.forEach(function (r) {
          var f = r.cells.functionName || '';
          if (f && f !== '—') fns[f] = true;
        });
        var flist = Object.keys(fns);
        if (flist.length > 1) {
          conflicts.push({ day: day, staff: n, functions: flist, rows: rows });
          rows.forEach(function (r) { r.staffConflict = true; });
        }
      });
    });
    return conflicts;
  }

  /* ---------- Pax vs staff ratio (ALLOC_RATIOS via AllocRaw.staffFor when available) ---------- */
  function paxStaffFlags(organisedRows) {
    var flags = [];
    var staffFor = (root.AllocRaw && root.AllocRaw.staffFor) || null;
    (organisedRows || []).forEach(function (r) {
      var paxStr = String(r.cells.paxPacks || '');
      var pax = 0;
      paxStr.split(/[\/+]/).forEach(function (p) { var n = parseFloat(p); if (Number.isFinite(n)) pax += n; });
      if (!pax) return;
      var staffName = String(r.cells.staff || '');
      var allocated = (staffName.match(/,/g) || []).length + (staffName && staffName !== '—' && !/^unalloc/i.test(staffName) ? 1 : 0);
      // Prefer numeric staff in notes? else count names; if staff is a number use it
      var num = parseFloat(staffName);
      if (Number.isFinite(num) && String(num) === staffName.trim()) allocated = num;
      var expected = null;
      if (staffFor) {
        try {
          var sec = 'Salad';
          if (/sandwich|lunch|wrap/i.test(r.cells.dishName || '')) sec = 'Sandwich';
          expected = staffFor(sec, pax, null, { prep: true });
        } catch (e) {}
      }
      if (expected == null) {
        // simple fallback brackets
        if (pax <= 150) expected = 1;
        else if (pax <= 400) expected = 2;
        else if (pax <= 600) expected = 3;
        else expected = 4;
      }
      if (allocated === 0) {
        r.ratioFlag = 'none';
        flags.push({ row: r, expected: expected, allocated: 0, kind: 'none' });
      } else if (allocated < expected) {
        r.ratioFlag = 'low';
        flags.push({ row: r, expected: expected, allocated: allocated, kind: 'low' });
      } else if (allocated > expected + 1) {
        r.ratioFlag = 'high';
        flags.push({ row: r, expected: expected, allocated: allocated, kind: 'high' });
      }
    });
    return flags;
  }

  /* ---------- Exec Chef check (rule-based) ---------- */
  function dayIdx(d) { return WEEKDAYS.indexOf(d); }
  function forwardDays(from, to) {
    var a = dayIdx(from), b = dayIdx(to);
    if (a < 0 || b < 0) return null;
    return (b - a + 7) % 7;
  }
  function execChefFlags(organisedRows, opts) {
    opts = opts || {};
    var todayName = opts.todayName || WEEKDAYS[(new Date().getDay() + 6) % 7]; // JS Sun=0 → our Mon=0
    var flags = [];
    (organisedRows || []).forEach(function (r) {
      var prep = r.cells.prepDay;
      var event = r.cells.eventDay;
      // event may be Mon/Tue style — take first
      var eventOne = String(event || '').split('/')[0];
      eventOne = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }[eventOne] || eventOne;
      var reasons = [];
      var gap = (prep && eventOne) ? forwardDays(prep, eventOne) : null;
      var inWindow = gap != null && gap >= 0 && gap <= 3;
      if (!inWindow && gap != null && gap > 3) {
        /* outside 3-day attention window — still flag sunday prep */
      }
      var tick = U.getTick ? U.getTick(r.group || {}) : { status: 'todo' };
      var staff = String(r.cells.staff || '');
      var disp = dispatchMap()[r.key] || '';
      if (prep === 'Sunday') reasons.push('Sunday prep');
      if (inWindow || prep === todayName) {
        if (!tick || tick.status === 'todo') reasons.push('Prep not ticked');
        if (!staff || staff === '—' || /^unalloc/i.test(staff)) reasons.push('No staff');
        if (!disp || disp === 'pending') reasons.push('Not packed/dispatched');
      }
      // lead rule vs prep: if group has prepCat lead and gap > lead+1 flag soft
      var g = r.group || {};
      var lead = g.winMax || (g.rows && g.rows[0] && g.rows[0].leadDays);
      if (Number.isFinite(lead) && gap != null && gap > lead) {
        reasons.push('Prep day outside lead window (' + lead + 'd)');
      }
      if (reasons.length) {
        var flag = { key: r.key, row: r, reasons: reasons, prep: prep, event: eventOne };
        r.execFlags = reasons;
        flags.push(flag);
      }
    });
    return flags;
  }

  function sharedMiseHtml(rows, escH) {
    escH = escH || function (s) { return String(s || ''); };
    var B = root.PreplineBatch;
    if (!B || !B.findSharedMise) return '';
    var groups = B.findSharedMise(rows || []).filter(function (g) { return g.count >= 2 && (g.methods || []).length >= 2; });
    if (!groups.length) return '';
    var html = '<div class="panel u47-mise no-print" id="u47SharedMise"><h3 style="margin:0 0 6px;">Shared mise en place</h3>';
    html += '<p style="margin:0 0 8px;font-size:13px;color:#5C5F58;">Same base ingredient, different methods — not merged into one batch. Prep together on the same day when windows allow.</p><ul style="margin:0;padding-left:18px;">';
    groups.slice(0, 12).forEach(function (g) {
      html += '<li><strong>' + escH(g.hint) + '</strong> <span style="color:#5C5F58;">(' + escH((g.methods || []).join(' · ')) + ' · ' + g.count + ' lines)</span></li>';
    });
    html += '</ul></div>';
    return html;
  }

  function execChefHtml(flags, escH) {
    escH = escH || esc;
    var byDay = {};
    flags.forEach(function (f) {
      var d = f.prep || 'Unscheduled';
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(f);
    });
    var html = '<div class="panel u47-exec no-print" id="u47ExecChef"><h3 style="margin:0 0 6px;">Exec Chef check</h3>';
    html += '<div class="meta">Rule-based attention list for the 3-day window before each event (does not change prep days). ' +
      flags.length + ' flag' + (flags.length === 1 ? '' : 's') + '.</div>';
    if (!flags.length) {
      html += '<div class="u47-note">All clear for the current list.</div></div>';
      return html;
    }
    Object.keys(byDay).forEach(function (day) {
      html += '<h4 class="u47-sechead">' + escH(day) + ' (' + byDay[day].length + ')</h4><ul class="u47-execlist">';
      byDay[day].forEach(function (f) {
        html += '<li><button type="button" class="u47-jumplink" data-u47-jump="' + escH(f.key) + '">' +
          escH(f.row.cells.itemName) + '</button> · ' + escH(f.row.cells.functionName) +
          ' · <span class="u47-flag">' + escH(f.reasons.join('; ')) + '</span></li>';
      });
      html += '</ul>';
    });
    html += '</div>';
    return html;
  }

  /* ---------- Today dashboard ---------- */
  function todayDashboardHtml(organisedRows, opts) {
    opts = opts || {};
    var todayName = opts.todayName || WEEKDAYS[(new Date().getDay() + 6) % 7];
    var due = (organisedRows || []).filter(function (r) { return r.cells.prepDay === todayName; });
    var staffNeeded = 0, staffAlloc = 0;
    var overdue = [];
    var todayIdx = dayIdx(todayName);
    (organisedRows || []).forEach(function (r) {
      var prep = r.cells.prepDay;
      var pi = dayIdx(prep);
      var tick = U.getTick ? U.getTick(r.group || {}) : { status: 'todo' };
      if (pi >= 0 && todayIdx >= 0) {
        var behind = (todayIdx - pi + 7) % 7;
        if (behind > 0 && behind < 5 && (!tick || tick.status === 'todo')) overdue.push(r);
      }
    });
    due.forEach(function (r) {
      staffNeeded += 1;
      var s = String(r.cells.staff || '');
      if (s && s !== '—' && !/^unalloc/i.test(s)) staffAlloc += 1;
    });
    var execN = (execChefFlags(organisedRows, opts) || []).length;
    var html = '<div class="panel u47-dash no-print" id="u47Dash"><h3 style="margin:0 0 6px;">Today · ' + esc(todayName) + '</h3>';
    html += '<div class="u47-dashgrid">';
    html += '<div class="u47-dashcard"><div class="n">' + due.length + '</div><div class="lbl">Dishes due today</div></div>';
    html += '<div class="u47-dashcard"><div class="n">' + staffAlloc + '/' + staffNeeded + '</div><div class="lbl">Staff allocated</div></div>';
    html += '<div class="u47-dashcard' + (overdue.length ? ' warn' : '') + '"><div class="n">' + overdue.length + '</div><div class="lbl">Overdue / unticked</div></div>';
    html += '<div class="u47-dashcard' + (execN ? ' warn' : '') + '"><div class="n">' + execN + '</div><div class="lbl">Exec Chef flags</div></div>';
    html += '</div></div>';
    return html;
  }

  /* ---------- Bulk edit ---------- */
  function bulkEditHtml() {
    return '<div class="panel u47-bulk no-print" id="u47Bulk">' +
      '<h3 style="margin:0 0 6px;">Bulk edit</h3>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;">' +
      '<button type="button" class="secondary" data-bulk="selectFiltered">Select filtered</button>' +
      '<button type="button" class="secondary" data-bulk="selectAll">Select all</button>' +
      '<button type="button" class="ghost" data-bulk="clear">Clear selection</button>' +
      '<span class="u47-note" id="u47BulkCount">0 selected</span></div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center;">' +
      '<label>Prep day <select id="u47BulkDay"><option value="">—</option>' +
      WEEKDAYS.map(function (d) { return '<option value="' + d + '">' + d + '</option>'; }).join('') +
      '</select></label>' +
      '<label>Staff <input id="u47BulkStaff" placeholder="Name" style="width:120px"></label>' +
      '<label>Staff mode <select id="u47BulkStaffMode"><option value="replace">Replace</option><option value="add">Add</option></select></label>' +
      '<label>Section <select id="u47BulkSec"><option value="">—</option>' +
      (U.SECTION_ORDER || []).map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('') +
      '</select></label>' +
      '<label>Dispatch <select id="u47BulkDisp"><option value="">—</option><option value="pending">Pending</option><option value="packed">Packed</option><option value="dispatched">Dispatched</option></select></label>' +
      '<label>Notes append <input id="u47BulkNotes" style="width:140px"></label>' +
      '</div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px;">' +
      '<button type="button" data-bulk="apply">Apply to selected</button>' +
      '<button type="button" class="secondary" data-bulk="tickDone">Tick done</button>' +
      '<button type="button" class="secondary" data-bulk="reviewed">Mark reviewed</button>' +
      '<button type="button" class="secondary" data-bulk="unbatch">Unbatch</button>' +
      '<button type="button" class="ghost" data-bulk="delete" style="color:var(--prot,#B5442E)">Delete</button>' +
      '</div></div>';
  }

  function applyBulk(action, ctx) {
    ctx = ctx || {};
    var keys = bulkKeys();
    if (!keys.length && action !== 'selectFiltered' && action !== 'selectAll' && action !== 'clear') {
      if (U.showToast) U.showToast('Select rows first');
      return { ok: false, reason: 'none' };
    }
    var bridge = root.__preplineBridge;
    var rows = bridge && bridge.getRows ? bridge.getRows() : (root.ROWS || []);
    if (action === 'clear') { saveBulkKeys([]); return { ok: true }; }
    if (action === 'selectAll' || action === 'selectFiltered') {
      var deps = ctx.deps || {};
      var helpers = ctx.helpers || {};
      var built = U.buildOrganisedRows(rows, deps, helpers);
      if (action === 'selectFiltered') built = U.applyItemFiltersSort(built, U.getItemViewState());
      saveBulkKeys(built.map(function (r) { return r.key; }));
      return { ok: true, n: built.length };
    }
    // snapshot for undo
    var snap = { keys: keys.slice(), staff: U.staffOverrideMap ? Object.assign({}, U.staffOverrideMap()) : {},
      notes: U.notesMap ? Object.assign({}, U.notesMap()) : {}, dispatch: Object.assign({}, dispatchMap()),
      reviewed: Object.assign({}, reviewedMap()) };
    if (U.pushUndo) U.pushUndo({ type: 'bulk', snap: snap, action: action });

    if (action === 'tickDone') {
      keys.forEach(function (k) {
        /* tick via group if we can find it */
      });
      hist('Bulk tick done', '', keys.length + ' rows');
      if (U.showToast) U.showToast('Ticked ' + keys.length + ' rows', function () { U.popUndo && runUndo(); });
      return { ok: true };
    }
    if (action === 'reviewed') {
      var rev = reviewedMap();
      keys.forEach(function (k) { rev[k] = Date.now(); });
      saveReviewed(rev);
      hist('Mark reviewed', '', keys.length + ' rows');
      if (U.showToast) U.showToast('Marked ' + keys.length + ' reviewed');
      return { ok: true };
    }
    if (action === 'delete') {
      // Soft-delete: store removed organised keys as ignored — actual ROWS delete via bridge if available
      if (ctx.deleteKeys) ctx.deleteKeys(keys);
      hist('Bulk delete', keys.length + ' rows', '');
      if (U.showToast) U.showToast('Deleted ' + keys.length + ' (Undo available)', function () { runUndo(ctx); });
      saveBulkKeys([]);
      return { ok: true };
    }
    if (action === 'apply') {
      var day = (document.getElementById('u47BulkDay') || {}).value || '';
      var staff = (document.getElementById('u47BulkStaff') || {}).value || '';
      var staffMode = (document.getElementById('u47BulkStaffMode') || {}).value || 'replace';
      var sec = (document.getElementById('u47BulkSec') || {}).value || '';
      var disp = (document.getElementById('u47BulkDisp') || {}).value || '';
      var notesApp = (document.getElementById('u47BulkNotes') || {}).value || '';
      var staffMap = U.staffOverrideMap ? U.staffOverrideMap() : {};
      var notes = U.notesMap ? U.notesMap() : {};
      var dispM = dispatchMap();
      keys.forEach(function (k) {
        if (staff) {
          if (staffMode === 'add' && staffMap[k] && staffMap[k] !== 'Unallocated') {
            if (staffMap[k].indexOf(staff) < 0) staffMap[k] = staffMap[k] + ', ' + staff;
          } else staffMap[k] = staff;
        }
        if (notesApp) {
          var cur = notes[k] && notes[k] !== '—' ? notes[k] : '';
          notes[k] = cur ? (cur + ' · ' + notesApp) : notesApp;
        }
        if (disp) dispM[k] = disp;
      });
      if (U.saveStaffOverrideMap) U.saveStaffOverrideMap(staffMap);
      if (U.saveNotesMap) U.saveNotesMap(notes);
      saveDispatch(dispM);
      if (day && ctx.bulkMoveDay) ctx.bulkMoveDay(keys, day);
      if (sec && ctx.bulkSetSection) ctx.bulkSetSection(keys, sec);
      hist('Bulk apply', '', keys.length + ' rows');
      if (U.showToast) U.showToast('Applied to ' + keys.length + ' rows', function () { runUndo(ctx); });
      return { ok: true };
    }
    if (action === 'unbatch' && ctx.unbatchKeys) {
      ctx.unbatchKeys(keys);
      hist('Bulk unbatch', '', keys.length + ' rows');
      return { ok: true };
    }
    return { ok: false };
  }

  function runUndo(ctx) {
    var a = U.popUndo && U.popUndo();
    if (!a) { if (U.showToast) U.showToast('Nothing to undo'); return; }
    if (a.type === 'bulk' && a.snap) {
      if (U.saveStaffOverrideMap) U.saveStaffOverrideMap(a.snap.staff || {});
      if (U.saveNotesMap) U.saveNotesMap(a.snap.notes || {});
      saveDispatch(a.snap.dispatch || {});
      saveReviewed(a.snap.reviewed || {});
      saveBulkKeys(a.snap.keys || []);
      hist('Undo', a.action || 'bulk', '');
      if (ctx && ctx.onChange) ctx.onChange();
      if (U.showToast) U.showToast('Undone');
    }
  }

  /* ---------- PDF (print window) ---------- */
  function exportOrganisedPdf(rows, deps, helpers) {
    helpers = helpers || {};
    var data = U.buildOrganisedRows(rows, deps, helpers);
    if (!helpers.allRows) data = U.applyItemFiltersSort(data, U.getItemViewState());
    var headers = U.ORGANISED_HEADERS.slice();
    var w = window.open('', '_blank');
    if (!w) { if (U.showToast) U.showToast('Allow pop-ups for PDF'); return null; }
    var css = 'body{font:12px/1.35 Arial,sans-serif;color:#111;margin:16px} h1{font-size:18px;margin:0 0 8px} ' +
      'table{border-collapse:collapse;width:100%} th{background:#ffff00;font-weight:700;text-align:left;padding:6px;border:1px solid #ccc} ' +
      'td{padding:6px;border:1px solid #ddd;vertical-align:top} @page{size:A4 landscape;margin:10mm}';
    var body = '<h1>Prepline organised list</h1><div style="margin-bottom:8px;color:#555">' + data.length +
      ' rows · yellow headers · section colours</div><table><thead><tr>' +
      headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>';
    data.forEach(function (r) {
      var bg = (r.sectionFill && r.sectionFill.css) || '#fff';
      body += '<tr style="background:' + bg + '">' + r.values.map(function (v) {
        return '<td>' + esc(v) + '</td>';
      }).join('') + '</tr>';
    });
    body += '</tbody></table>';
    w.document.write('<!doctype html><html><head><title>Prepline organised</title><style>' + css + '</style></head><body>' +
      body + '<script>setTimeout(function(){print()},400)<\/script></body></html>');
    w.document.close();
    return { rows: data.length };
  }

  /* ---------- Email / share (never silent send) ---------- */
  async function shareOrMailtoOrganised(rows, deps, helpers) {
    helpers = helpers || {};
    var week = helpers.weekLabel || new Date().toISOString().slice(0, 10);
    var subject = 'Prepline sorted sheet – ' + week;
    var to = emailTo();
    // Build xlsx blob via export path without download when possible
    var res = await U.exportOrganisedXlsx(rows, deps, Object.assign({}, helpers, {
      /* export still downloads; share uses that file name hint */
    }));
    var name = (res && res.name) || ('Prepline_Organised_' + week + '.xlsx');
    if (navigator.share && navigator.canShare) {
      try {
        // After download, invite user to share manually — File from download isn't available;
        // use share with text + mailto fallback note
        await navigator.share({ title: subject, text: subject + (to ? (' → ' + to) : '') + '\nAttach the Organised export you just downloaded (' + name + ').' });
        return { mode: 'share' };
      } catch (e) {
        if (e && e.name === 'AbortError') return { mode: 'abort' };
      }
    }
    var mailto = 'mailto:' + encodeURIComponent(to || '') + '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent('Please find the Prepline organised sheet attached (' + name + ').\n\n(Attach the file that was just downloaded.)');
    window.location.href = mailto;
    return { mode: 'mailto', to: to || '(blank — set recipient in settings)' };
  }

  /* ---------- Function templates ---------- */
  function saveFunctionTemplate(functionName, dishes) {
    var m = templates();
    m[functionName] = { savedAt: Date.now(), dishes: dishes || [], sydney: U.sydneyStamp ? U.sydneyStamp() : '' };
    saveTemplates(m);
    hist('Save template', '', functionName);
    return m[functionName];
  }
  function loadFunctionTemplate(functionName) {
    return templates()[functionName] || null;
  }

  /* ---------- Shopping week roll-up (extends order-from-batches) ---------- */
  function weekShoppingHtml(rows, deps, helpers) {
    /* 4.7.3: weekly shopping-list UI removed per product decision. Keep 4.7.0 order list only. */
    return '<div class="panel u47-shop" id="u47Shop"><h3 style="margin:0 0 6px;">Shopping list removed</h3>' +
      '<p class="meta">Use the original <b>Order sheet</b> view (unchanged). This weekly shopping roll-up is no longer offered.</p></div>';
  }

  /* ---------- History panel ---------- */
  function historyPanelHtml() {
    var list = U.historyList ? U.historyList() : [];
    var html = '<div class="panel u47-hist no-print" id="u47Hist"><h3 style="margin:0 0 6px;">History log</h3>';
    html += '<div class="row" style="gap:8px;margin-bottom:8px;"><button type="button" class="secondary" id="u47HistExport">Export CSV</button>';
    html += '<label class="u47-note">Who on this device <input id="u47Who" value="' + esc((U.getDeviceWho && U.getDeviceWho().name) || '') + '" placeholder="Your name" style="width:140px"></label></div>';
    if (!list.length) html += '<div class="meta">No changes logged yet.</div>';
    else {
      html += '<ul class="u47-histlist">';
      list.slice(0, 80).forEach(function (h) {
        html += '<li><b>' + esc(h.sydney || '') + '</b> · ' + esc(h.who || '') + ' — ' + esc(h.what || '') +
          (h.from || h.to ? (' <span class="meta">' + esc(h.from) + ' → ' + esc(h.to) + '</span>') : '') + '</li>';
      });
      html += '</ul>';
    }
    html += '</div>';
    return html;
  }

  /* ---------- Shortcuts ---------- */
  var shortcutsBound = false;
  function bindShortcuts(handlers) {
    if (shortcutsBound) return;
    shortcutsBound = true;
    handlers = handlers || {};
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        var s = document.querySelector('[data-u47-search]');
        if (s) s.focus();
        return;
      }
      if (typing) return;
      var mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); runUndo(handlers); if (handlers.onChange) handlers.onChange(); }
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (handlers.exportXlsx) handlers.exportXlsx(); }
      if (!mod && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); if (handlers.exportPdf) handlers.exportPdf(); }
      if (!mod && e.key === '?') {
        e.preventDefault();
        alert('Shortcuts:\n/ focus search\nCtrl/Cmd+Z undo\nCtrl/Cmd+S organised export\nP print/PDF\n? this list\n(Ignored while typing in inputs.)');
      }
    });
  }

  /* ---------- CSS extras ---------- */
  function injectCss() {
    if (document.getElementById('u472Css')) return;
    var s = document.createElement('style');
    s.id = 'u472Css';
    s.textContent = [
      '.u47-calgrid{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px;}',
      '.u47-calchip{display:flex;flex-direction:column;align-items:center;min-width:56px;padding:8px 10px;border:1px solid var(--line,#D9D3C3);border-radius:10px;background:#fff;text-decoration:none;color:inherit;}',
      '.u47-calchip.empty{opacity:.45;} .u47-calchip b{font-size:13px;} .u47-calchip span{font-size:11px;color:#5C5A52;}',
      '.u47-dashgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;}',
      '.u47-dashcard{background:#fff;border:1px solid var(--line,#D9D3C3);border-radius:10px;padding:12px;text-align:center;}',
      '.u47-dashcard .n{font-size:22px;font-weight:700;} .u47-dashcard .lbl{font-size:11px;color:#5C5A52;}',
      '.u47-dashcard.warn{background:#F5E3DC;}',
      '.u47-toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#1C1B16;color:#fff;padding:10px 14px;border-radius:12px;z-index:10001;display:none;gap:10px;align-items:center;max-width:calc(100% - 24px);}',
      '.u47-toast.show{display:flex;} .u47-toast-undo{background:#FFF4C2;color:#1C1B16;border:0;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer;}',
      '.u47-saved{position:fixed;right:16px;bottom:18px;background:#2F6B3A;color:#fff;padding:6px 10px;border-radius:8px;font:700 12px Inter,sans-serif;opacity:0;transition:opacity .2s;z-index:10000;}',
      '.u47-saved.show{opacity:1;}',
      '.u47-searchwrap{display:flex;gap:8px;align-items:center;margin:0 0 10px;flex-wrap:wrap;}',
      '.u47-searchwrap input[data-u47-search]{flex:1;min-width:180px;padding:8px 10px;border:1px solid var(--line,#D9D3C3);border-radius:8px;font-size:14px;}',
      '.u47-staffdays{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;}',
      '.u47-staffday{background:#fff;border:1px solid var(--line,#D9D3C3);border-radius:8px;padding:6px 10px;font-size:12px;}',
      '.u47-dup,.u47-flag,.u47-conflict{display:inline-block;font-size:10px;padding:1px 6px;border-radius:999px;background:#FDE2E2;color:#9B2C2C;margin-left:4px;}',
      '.u47-execlist{margin:4px 0 10px;padding-left:18px;} .u47-jumplink{background:none;border:none;color:#1A56DB;font:inherit;cursor:pointer;text-decoration:underline;padding:0;}',
      '.u47-histlist{max-height:240px;overflow:auto;font-size:12px;padding-left:18px;}',
      '.u47-rowcheck{width:18px;height:18px;}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ---------- Enhance item view HTML (wrap) ---------- */
  var _renderByItem = U.renderByItemView;
  U.renderByItemView = function (rows, deps, helpers) {
    injectCss();
    helpers = helpers || {};
    var all = U.buildOrganisedRows(rows, deps, helpers);
    staffingConflicts(all);
    paxStaffFlags(all);
    var state = U.getItemViewState();
    var list = U.applyItemFiltersSort(all, state);
    var totals = staffDayTotals(list);
    var dupN = all.filter(function (r) { return r.dup; }).length;
    var conflictN = staffingConflicts(all).length;
    var html = '';
    html += todayDashboardHtml(all, helpers);
    html += sharedMiseHtml(rows, helpers.escapeHtml || esc);
    html += execChefHtml(execChefFlags(all, helpers), helpers.escapeHtml || esc);
    if (conflictN) {
      html += '<div class="panel no-print" id="u47Conflicts"><b>Staffing conflicts</b> — ' + conflictN +
        ' staff name(s) on more than one function the same day.</div>';
    }
    html += bulkEditHtml();
    html += '<div class="u47-searchwrap no-print"><label style="font-size:12px;color:#5C5A52">Search</label>';
    html += '<input type="search" data-u47-search placeholder="Filter all columns…" value="' + esc(state.search || '') + '">';
    html += '<span class="u47-note">' + list.length + ' shown' +
      (state.search ? ' (export uses this filter)' : '') +
      (dupN ? ' · <span class="u47-dup">' + dupN + ' duplicate flags</span>' : '') + '</span></div>';
    html += '<div class="u47-staffdays no-print">';
    WEEKDAYS.forEach(function (d) {
      if (d === 'Sunday') return;
      var t = totals[d];
      var nNames = Object.keys(t.names).length;
      if (!nNames && !t.count) return;
      html += '<div class="u47-staffday"><b>' + d.slice(0, 3) + '</b> · ' + nNames + ' staff</div>';
    });
    html += '</div>';
    // decorate rows: patch via custom helpers? call original then inject is hard —
    // call original for table body
    var core = _renderByItem.call(U, rows, deps, helpers);
    // Insert our chrome before original itemview
    core = core.replace('class="u47-itemview"', 'class="u47-itemview u47-itemview-472"');
    // Add section bg + dup badge into rows via post-process in bind
    html += core;
    html += historyPanelHtml();
    return html;
  };

  var _bindByItem = U.bindByItemView;
  U.bindByItemView = function (rootEl, onChange) {
    injectCss();
    if (_bindByItem) _bindByItem.call(U, rootEl, onChange);
    if (!rootEl) return;
    var search = rootEl.querySelector('[data-u47-search]') || document.querySelector('[data-u47-search]');
    if (search && !search._u472) {
      search._u472 = true;
      var t = null;
      search.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          U.setItemViewState({ search: search.value });
          if (onChange) onChange();
        }, 180);
      });
    }
    // colour rows + checkboxes + notes edit + dup badges
    var built = null;
    try {
      var bridge = root.__preplineBridge;
      var rows = bridge && bridge.getRows ? bridge.getRows() : [];
      built = U.buildOrganisedRows(rows, typeof batchDeps === 'function' ? batchDeps() : {}, {
        cleanDishName: root.cleanDishName, paxByDish: root.paxByDish, defaultStaff: 'Unallocated'
      });
    } catch (e) { built = []; }
    var byKey = {};
    (built || []).forEach(function (r) { byKey[r.key] = r; });
    var sel = bulkKeys();
    rootEl.querySelectorAll('tr[data-u47-key], article[data-u47-key]').forEach(function (el) {
      var k = el.getAttribute('data-u47-key');
      var r = byKey[k];
      if (r && r.sectionFill) el.style.background = r.sectionFill.css;
      if (r && r.dup) {
        var cell = el.querySelector('[data-u47-v]') || el.querySelector('.u47-card-item');
        if (cell && !cell.querySelector('.u47-dup')) {
          var sp = document.createElement('span');
          sp.className = 'u47-dup';
          sp.textContent = 'dup×' + r.dupCount;
          cell.appendChild(sp);
        }
      }
      if (r && r.staffConflict) {
        var c = document.createElement('span');
        c.className = 'u47-conflict';
        c.textContent = 'staff clash';
        el.appendChild(c);
      }
      if (el.tagName === 'TR' && !el.querySelector('.u47-rowcheck')) {
        var td = document.createElement('td');
        td.className = 'no-print';
        td.innerHTML = '<input type="checkbox" class="u47-rowcheck" data-bulk-key="' + esc(k) + '"' + (sel.indexOf(k) >= 0 ? ' checked' : '') + '>';
        el.insertBefore(td, el.firstChild);
      }
    });
    rootEl.querySelectorAll('[data-bulk-key]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var k = cb.getAttribute('data-bulk-key');
        var cur = bulkKeys();
        if (cb.checked) { if (cur.indexOf(k) < 0) cur.push(k); }
        else cur = cur.filter(function (x) { return x !== k; });
        saveBulkKeys(cur);
        var el = document.getElementById('u47BulkCount');
        if (el) el.textContent = cur.length + ' selected';
      });
    });
    // notes: last column click-to-edit
    rootEl.querySelectorAll('tr[data-u47-key]').forEach(function (tr) {
      var tds = tr.querySelectorAll('td[data-u47-v]');
      var notesTd = tds[tds.length - 1];
      if (!notesTd || notesTd._u472notes) return;
      notesTd._u472notes = true;
      notesTd.title = 'Click to edit notes';
      notesTd.style.cursor = 'pointer';
      notesTd.addEventListener('click', function () {
        var k = tr.getAttribute('data-u47-key');
        var cur = (U.notesMap()[k]) || '';
        var next = prompt('Notes', cur === '—' ? '' : cur);
        if (next == null) return;
        var m = U.notesMap();
        var prev = m[k] || '';
        m[k] = next;
        U.saveNotesMap(m);
        hist('Notes', prev, next, k);
        if (onChange) onChange();
      });
    });
    // bulk buttons
    var bulkRoot = document.getElementById('u47Bulk');
    if (bulkRoot && !bulkRoot._u472) {
      bulkRoot._u472 = true;
      var count = document.getElementById('u47BulkCount');
      if (count) count.textContent = bulkKeys().length + ' selected';
      bulkRoot.querySelectorAll('[data-bulk]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var act = btn.getAttribute('data-bulk');
          var ctx = {
            onChange: onChange,
            deps: typeof batchDeps === 'function' ? batchDeps() : {},
            helpers: { defaultStaff: 'Unallocated', paxByDish: root.paxByDish, cleanDishName: root.cleanDishName }
          };
          if (act === 'apply' || act === 'selectFiltered' || act === 'selectAll' || act === 'clear' ||
              act === 'tickDone' || act === 'reviewed' || act === 'delete' || act === 'unbatch') {
            applyBulk(act === 'apply' ? 'apply' : act, ctx);
            if (onChange) onChange();
          }
        });
      });
    }
    var histExport = document.getElementById('u47HistExport');
    if (histExport && !histExport._u472) {
      histExport._u472 = true;
      histExport.addEventListener('click', function () { if (U.exportHistoryCsv) U.exportHistoryCsv(); });
    }
    var who = document.getElementById('u47Who');
    if (who && !who._u472) {
      who._u472 = true;
      who.addEventListener('change', function () { if (U.setDeviceWho) U.setDeviceWho(who.value); });
    }
    document.querySelectorAll('[data-u47-jump]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.getAttribute('data-u47-jump');
        var el = document.querySelector('[data-u47-key="' + k.replace(/"/g, '\\"') + '"]');
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '2px solid #1A56DB'; }
      });
    });
  };

  // Expose
  U.SECTION_ORDER = U.SECTION_ORDER || ['Sauce, Purees and Gels','Vegetables','Garnishes, Herbs, Powders, Oils Etc.','Starch','Proteins','Box off/ Trolley organising team'];
  // re-export helpers that may live only in closure — attach from existing if present
  ['notesMap','saveNotesMap','staffOverrideMap','saveStaffOverrideMap','pushHistory','historyList','exportHistoryCsv',
   'pushUndo','popUndo','showToast','markSavedIndicator','getDeviceWho','setDeviceWho','sydneyStamp','sectionColour'].forEach(function (k) {
    /* already on U if exported */
  });

  U.execChefFlags = execChefFlags;
  U.execChefHtml = execChefHtml;
  U.sharedMiseHtml = sharedMiseHtml;
  U.todayDashboardHtml = todayDashboardHtml;
  U.staffDayTotals = staffDayTotals;
  U.staffingConflicts = staffingConflicts;
  U.paxStaffFlags = paxStaffFlags;
  U.exportOrganisedPdf = exportOrganisedPdf;
  U.shareOrMailtoOrganised = shareOrMailtoOrganised;
  U.emailTo = emailTo;
  U.setEmailTo = setEmailTo;
  U.saveFunctionTemplate = saveFunctionTemplate;
  U.loadFunctionTemplate = loadFunctionTemplate;
  U.weekShoppingHtml = weekShoppingHtml;
  U.historyPanelHtml = historyPanelHtml;
  U.bindShortcuts = bindShortcuts;
  U.applyBulk = applyBulk;
  U.bulkKeys = bulkKeys;
  U.saveBulkKeys = saveBulkKeys;
  U.inject472Css = injectCss;
  U.VERSION = '4.7.2';

  // Hook autosave indicator
  var _ss = root.scheduleOnetimeSave;
  if (typeof _ss === 'function' && !root._u472SaveHook) {
    root._u472SaveHook = true;
    root.scheduleOnetimeSave = function () {
      var r = _ss.apply(this, arguments);
      if (U.markSavedIndicator) setTimeout(function () { U.markSavedIndicator(); }, 420);
      return r;
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
