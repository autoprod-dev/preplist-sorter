/* Prepline 4.7.4 — open access (no login/gate). Builds on 4.7.3 features (trial copy only). */
(function (root) {
  'use strict';
  var U = root.PreplineUpgrades47;
  if (!U) { console.warn('upgrades-473: PreplineUpgrades47 missing'); return; }

  var WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function lsGet(k, fb) {
    try { var v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  var WEATHER_KEY = 'prepline.weather.v1';
  var DISPATCH_KEY = 'prepline.dispatch.v1';
  var SIGNOFF_KEY = 'prepline.signoff.v1';
  var AUTO_ALLOC_DONE = 'prepline.autoAlloc.done.v1';
  var EMAIL_TO_KEY = 'prepline.emailTo.v1';

  function weatherMap() { return lsGet(WEATHER_KEY, {}) || {}; }
  function saveWeatherMap(m) { lsSet(WEATHER_KEY, m || {}); }
  /* Own localStorage maps — do NOT call U.dispatchMap after we overwrite it (infinite recurse) */
  function dispatchMap() { return lsGet(DISPATCH_KEY, {}) || {}; }
  function saveDispatch(m) { lsSet(DISPATCH_KEY, m || {}); }
  function signoffMap() { return lsGet(SIGNOFF_KEY, {}) || {}; }
  function saveSignoff(m) { lsSet(SIGNOFF_KEY, m || {}); }

  function todayWeekday(d) {
    d = d || new Date();
    return WEEKDAYS[(d.getDay() + 6) % 7];
  }
  function dayIdx(d) { return WEEKDAYS.indexOf(d); }
  function forwardDays(from, to) {
    var a = dayIdx(from), b = dayIdx(to);
    if (a < 0 || b < 0) return null;
    return (b - a + 7) % 7;
  }

  function organised(rows, deps, helpers) {
    helpers = helpers || {};
    deps = deps || {};
    return U.buildOrganisedRows(rows, deps, helpers) || [];
  }

  /* ---------- Perishability (Exec Chef) ---------- */
  var PERISH_HINTS = [
    { re: /\b(fish|salmon|tuna|barra|prawn|oyster|scallop|roe|caviar)\b/i, label: 'Highly perishable seafood', hours: 36 },
    { re: /\b(herb|microgreen|flower|blossom|leaf|leaves|lettuce|salad|karkalla|warrigal|samphire)\b/i, label: 'Wilt-prone greens/herbs', hours: 48 },
    { re: /\b(dairy|cream|butter|milk|yoghurt|cheese|custard)\b/i, label: 'Dairy — cold chain', hours: 72 },
    { re: /\b(sous\s*vide|sv)\b/i, label: 'SV bag — chill promptly', hours: 72 },
    { re: /\b(puree|purée|gel|jus|sauce)\b/i, label: 'Sauce/gel — use within lead', hours: 96 }
  ];
  function perishFlagsForRow(r) {
    var text = ((r.cells && r.cells.itemName) || '') + ' ' + ((r.cells && r.cells.section) || '');
    var out = [];
    PERISH_HINTS.forEach(function (h) {
      if (h.re.test(text)) out.push(h);
    });
    return out;
  }
  function enrichExecPerish(flags, rows) {
    var byKey = {};
    (rows || []).forEach(function (r) { byKey[r.key] = r; });
    (flags || []).forEach(function (f) {
      var r = f.row || byKey[f.key];
      if (!r) return;
      var pf = perishFlagsForRow(r);
      if (pf.length) {
        f.perish = pf.map(function (p) { return p.label; });
        f.reasons = (f.reasons || []).concat(f.perish.map(function (l) { return 'Perish: ' + l; }));
        r.execFlags = f.reasons;
        r.perishFlags = pf;
      }
    });
    // Also add perish-only flags for rows in window without other issues
    (rows || []).forEach(function (r) {
      var pf = perishFlagsForRow(r);
      if (!pf.length) return;
      r.perishFlags = pf;
      var already = (flags || []).some(function (f) { return f.key === r.key; });
      if (!already) {
        var prep = r.cells.prepDay;
        var eventOne = String(r.cells.eventDay || '').split('/')[0];
        eventOne = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }[eventOne] || eventOne;
        var gap = (prep && eventOne) ? forwardDays(prep, eventOne) : null;
        if (gap != null && gap <= 3) {
          flags.push({
            key: r.key, row: r,
            reasons: pf.map(function (p) { return 'Perish: ' + p.label; }),
            prep: prep, event: eventOne, perish: pf.map(function (p) { return p.label; })
          });
        }
      }
    });
    return flags;
  }

  var _execChefFlags = U.execChefFlags;
  U.execChefFlags = function (organisedRows, opts) {
    var flags = _execChefFlags ? _execChefFlags.call(U, organisedRows, opts) : [];
    return enrichExecPerish(flags, organisedRows);
  };

  /* ---------- Morning brief (load, behind, who to chase) ---------- */
  function morningBriefHtml(rows, deps, helpers) {
    helpers = helpers || {};
    var escH = helpers.escapeHtml || esc;
    var todayName = helpers.todayName || todayWeekday();
    var all = organised(rows, deps, helpers);
    if (U.staffingConflicts) U.staffingConflicts(all);
    var due = all.filter(function (r) { return r.cells.prepDay === todayName; });
    var behind = [];
    var todayIdx = dayIdx(todayName);
    due.forEach(function (r) { /* due counted below */ });
    all.forEach(function (r) {
      var pi = dayIdx(r.cells.prepDay);
      var tick = U.getTick ? U.getTick(r.group || {}) : { status: 'todo' };
      if (pi >= 0 && todayIdx >= 0) {
        var lag = (todayIdx - pi + 7) % 7;
        if (lag > 0 && lag < 5 && (!tick || tick.status === 'todo')) behind.push(r);
      }
    });
    var chase = {};
    behind.concat(due.filter(function (r) {
      var s = String(r.cells.staff || '');
      return !s || s === '—' || /^unalloc/i.test(s);
    })).forEach(function (r) {
      var s = String(r.cells.staff || 'Unallocated');
      if (!chase[s]) chase[s] = [];
      chase[s].push(r);
    });
    var weather = weatherMap()[todayName] || '';
    var execN = (U.execChefFlags(all, helpers) || []).length;
    var html = '<div class="panel u473-brief" id="u473Brief"><h3 style="margin:0 0 6px;">Morning brief · ' + escH(todayName) + '</h3>';
    html += '<div class="u47-dashgrid" style="margin-bottom:12px;">';
    html += '<div class="u47-dashcard" id="u473Load"><div class="n">' + due.length + '</div><div class="lbl">Today\'s load</div></div>';
    html += '<div class="u47-dashcard' + (behind.length ? ' warn' : '') + '" id="u473Behind"><div class="n">' + behind.length + '</div><div class="lbl">Behind / unticked</div></div>';
    html += '<div class="u47-dashcard" id="u473ChaseN"><div class="n">' + Object.keys(chase).length + '</div><div class="lbl">People to chase</div></div>';
    html += '<div class="u47-dashcard' + (execN ? ' warn' : '') + '"><div class="n">' + execN + '</div><div class="lbl">Exec flags</div></div>';
    html += '</div>';
    html += '<div class="row no-print" style="gap:8px;margin-bottom:10px;align-items:center;flex-wrap:wrap;">';
    html += '<label>Weather note <input id="u473Weather" data-weather-day="' + escH(todayName) + '" value="' + escH(weather) + '" placeholder="Hot / wet / humidity…" style="width:220px"></label>';
    html += '<button type="button" class="secondary" id="u473WeatherSave">Save weather</button></div>';
    if (weather) html += '<div class="meta" id="u473WeatherShow">Weather: ' + escH(weather) + '</div>';
    html += '<h4 style="margin:12px 0 6px;">Who to chase</h4>';
    if (!Object.keys(chase).length) html += '<div class="meta">No chase list — load looks covered.</div>';
    else {
      html += '<ul class="u473-chaselist" id="u473ChaseList">';
      Object.keys(chase).sort().forEach(function (name) {
        html += '<li><b>' + escH(name) + '</b> — ' + chase[name].length + ' line(s): ' +
          chase[name].slice(0, 4).map(function (r) { return escH(r.cells.itemName); }).join(', ') +
          (chase[name].length > 4 ? '…' : '') + '</li>';
      });
      html += '</ul>';
    }
    html += '<h4 style="margin:12px 0 6px;">Today\'s lines</h4><div class="section-table-wrap"><table id="u473BriefTable"><thead><tr>';
    html += '<th>Item</th><th>Section</th><th>Staff</th><th>Dispatch</th><th>Flags</th></tr></thead><tbody>';
    due.forEach(function (r) {
      var disp = dispatchMap()[r.key] || 'pending';
      var flags = (r.execFlags || []).concat((r.perishFlags || []).map(function (p) { return p.label; }));
      html += '<tr data-u47-key="' + escH(r.key) + '"><td>' + escH(r.cells.itemName) + '</td><td>' + escH(r.cells.section) +
        '</td><td>' + escH(r.cells.staff) + '</td><td>' + escH(disp) + '</td><td>' + escH(flags.join('; ') || '—') + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  /* ---------- Dispatch tracker + sign-off + near-event ---------- */
  function nearEventWarning(r, todayName) {
    var eventOne = String((r.cells && r.cells.eventDay) || '').split('/')[0];
    eventOne = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }[eventOne] || eventOne;
    var gap = forwardDays(todayName, eventOne);
    if (gap == null) return null;
    if (gap === 0) return 'Event TODAY';
    if (gap === 1) return 'Event tomorrow';
    if (gap <= 2) return 'Event in ' + gap + ' days';
    return null;
  }
  function dispatchTrackerHtml(rows, deps, helpers) {
    helpers = helpers || {};
    var escH = helpers.escapeHtml || esc;
    var todayName = helpers.todayName || todayWeekday();
    var all = organised(rows, deps, helpers);
    var disp = dispatchMap();
    var so = signoffMap();
    var html = '<div class="panel u473-dispatch" id="u473Dispatch"><h3 style="margin:0 0 6px;">Dispatch tracker</h3>';
    html += '<p class="meta">Pack → dispatch → sign-off. Near-event rows highlight in amber.</p>';
    html += '<div class="section-table-wrap"><table id="u473DispatchTable"><thead><tr>';
    html += '<th>Item</th><th>Prep</th><th>Event</th><th>Staff</th><th>Status</th><th>Sign-off</th><th>Warn</th></tr></thead><tbody>';
    all.forEach(function (r) {
      var st = disp[r.key] || 'pending';
      var signed = so[r.key] || '';
      var warn = nearEventWarning(r, todayName);
      var near = !!warn;
      html += '<tr data-u47-key="' + escH(r.key) + '"' + (near ? ' class="u473-near"' : '') + '>';
      html += '<td>' + escH(r.cells.itemName) + '</td><td>' + escH(r.cells.prepDay) + '</td><td>' + escH(r.cells.eventDay) + '</td>';
      html += '<td>' + escH(r.cells.staff) + '</td>';
      html += '<td><select class="u473-disp" data-key="' + escH(r.key) + '">';
      ['pending', 'packed', 'dispatched'].forEach(function (o) {
        html += '<option value="' + o + '"' + (st === o ? ' selected' : '') + '>' + o + '</option>';
      });
      html += '</select></td>';
      html += '<td><input class="u473-signoff" data-key="' + escH(r.key) + '" placeholder="Initials" value="' + escH(signed) + '" style="width:80px"></td>';
      html += '<td>' + (warn ? ('<span class="u473-nearwarn">' + escH(warn) + '</span>') : '—') + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
  }

  /* ---------- Roster by person / station (multi-tag staff) ---------- */
  function splitStaff(s) {
    return String(s || '').split(/[,;/]+/).map(function (x) { return x.trim(); }).filter(function (x) {
      return x && x !== '—' && !/^unalloc/i.test(x);
    });
  }
  function rosterHtml(rows, deps, helpers) {
    helpers = helpers || {};
    var escH = helpers.escapeHtml || esc;
    var all = organised(rows, deps, helpers);
    var byPerson = {}, byStation = {};
    all.forEach(function (r) {
      var sec = r.cells.section || '—';
      if (!byStation[sec]) byStation[sec] = [];
      byStation[sec].push(r);
      splitStaff(r.cells.staff).forEach(function (n) {
        if (!byPerson[n]) byPerson[n] = [];
        byPerson[n].push(r);
      });
    });
    var html = '<div class="panel u473-roster" id="u473Roster"><h3 style="margin:0 0 6px;">Roster · by person / station</h3>';
    html += '<p class="meta">Staff cells support multiple names (comma / slash). Tag several chefs on one line.</p>';
    html += '<div class="row no-print" style="gap:8px;margin-bottom:10px;">';
    html += '<button type="button" class="secondary u473-roster-tab on" data-roster="person">By person</button>';
    html += '<button type="button" class="secondary u473-roster-tab" data-roster="station">By station</button></div>';
    html += '<div id="u473RosterPerson">';
    Object.keys(byPerson).sort().forEach(function (n) {
      html += '<h4 class="u47-sechead">' + escH(n) + ' (' + byPerson[n].length + ')</h4><ul>';
      byPerson[n].forEach(function (r) {
        html += '<li>' + escH(r.cells.itemName) + ' · ' + escH(r.cells.prepDay) + ' · ' + escH(r.cells.section) + '</li>';
      });
      html += '</ul>';
    });
    if (!Object.keys(byPerson).length) html += '<div class="meta">No named staff yet — allocate or auto-allocate.</div>';
    html += '</div><div id="u473RosterStation" hidden>';
    Object.keys(byStation).sort().forEach(function (sec) {
      html += '<h4 class="u47-sechead">' + escH(sec) + ' (' + byStation[sec].length + ')</h4><ul>';
      byStation[sec].forEach(function (r) {
        html += '<li>' + escH(r.cells.itemName) + ' · ' + escH(r.cells.staff) + ' · ' + escH(r.cells.prepDay) + '</li>';
      });
      html += '</ul>';
    });
    html += '</div></div>';
    return html;
  }

  /* ---------- Swap tool (swap prep day or staff between two rows) ---------- */
  function swapToolHtml(rows, deps, helpers) {
    helpers = helpers || {};
    var escH = helpers.escapeHtml || esc;
    var all = organised(rows, deps, helpers);
    var html = '<div class="panel u473-swap" id="u473Swap"><h3 style="margin:0 0 6px;">Swap tool</h3>';
    html += '<p class="meta">Pick two organised lines and swap prep day and/or staff. Undo via Ctrl/Cmd+Z.</p>';
    html += '<div class="row" style="gap:12px;flex-wrap:wrap;align-items:flex-end;">';
    html += '<label>Line A <select id="u473SwapA" style="min-width:220px"><option value="">—</option>';
    all.forEach(function (r) {
      html += '<option value="' + escH(r.key) + '">' + escH(r.cells.itemName) + ' · ' + escH(r.cells.prepDay) + ' · ' + escH(r.cells.staff) + '</option>';
    });
    html += '</select></label>';
    html += '<label>Line B <select id="u473SwapB" style="min-width:220px"><option value="">—</option>';
    all.forEach(function (r) {
      html += '<option value="' + escH(r.key) + '">' + escH(r.cells.itemName) + ' · ' + escH(r.cells.prepDay) + ' · ' + escH(r.cells.staff) + '</option>';
    });
    html += '</select></label>';
    html += '<label><input type="checkbox" id="u473SwapDay" checked> Prep day</label>';
    html += '<label><input type="checkbox" id="u473SwapStaff" checked> Staff</label>';
    html += '<button type="button" id="u473SwapGo">Swap</button></div>';
    var last = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('prepline.swapMsg')) || '';
    html += '<div class="meta" id="u473SwapMsg" style="margin-top:8px;">' + escH(last) + '</div></div>';
    return html;
  }
  function applySwap(keyA, keyB, opts) {
    opts = opts || {};
    var bridge = root.__preplineBridge;
    var rows = bridge && bridge.getRows ? bridge.getRows() : (root.ROWS || []);
    var deps = typeof batchDeps === 'function' ? batchDeps() : {};
    var helpers = opts.helpers || { defaultStaff: 'Unallocated', paxByDish: root.paxByDish, cleanDishName: root.cleanDishName };
    var all = organised(rows, deps, helpers);
    var a = all.find(function (r) { return r.key === keyA; });
    var b = all.find(function (r) { return r.key === keyB; });
    if (!a || !b) return { ok: false, reason: 'missing' };
    if (U.pushUndo) {
      U.pushUndo({
        type: 'swap',
        snap: {
          staff: U.staffOverrideMap ? Object.assign({}, U.staffOverrideMap()) : {},
          dayA: a.cells.prepDay, dayB: b.cells.prepDay,
          keyA: keyA, keyB: keyB
        }
      });
    }
    if (opts.staff !== false) {
      var sm = U.staffOverrideMap ? U.staffOverrideMap() : {};
      var sa = sm[keyA] != null ? sm[keyA] : a.cells.staff;
      var sb = sm[keyB] != null ? sm[keyB] : b.cells.staff;
      sm[keyA] = sb; sm[keyB] = sa;
      if (U.saveStaffOverrideMap) U.saveStaffOverrideMap(sm);
    }
    if (opts.day !== false) {
      var dayA = a.cells.prepDay, dayB = b.cells.prepDay;
      function patchByKey(key, day) {
        var parts = String(key || '').split('::');
        var item = parts[0] || '', dish = parts[2] || '';
        rows.forEach(function (rr) {
          var taskN = String(rr.task || '').toLowerCase();
          var itemN = String(item || '').toLowerCase();
          var dishOk = !dish || String(rr.dish || '') === dish;
          if (dishOk && (taskN.indexOf(itemN.split('/')[0].trim()) >= 0 || itemN.indexOf(taskN.split('/')[0].trim()) >= 0)) {
            rr.day = day;
          }
        });
        if (a.group && key === keyA) (a.group.rows || []).forEach(function (r) { r.day = day; });
        if (b.group && key === keyB) (b.group.rows || []).forEach(function (r) { r.day = day; });
      }
      if (dayA !== dayB) {
        patchByKey(keyA, dayB);
        patchByKey(keyB, dayA);
        if (bridge && bridge.setRows) bridge.setRows(rows);
      }
    }
    if (U.pushHistory) U.pushHistory({ what: 'Swap', from: keyA, to: keyB });
    return { ok: true };
  }

  /* ---------- Auto-allocation on load ---------- */
  function autoAllocateStaff(rows, deps, helpers) {
    helpers = helpers || {};
    var doneKey = AUTO_ALLOC_DONE;
    var sig = String((rows || []).length) + ':' + String((rows && rows[0] && rows[0].task) || '');
    var prev = lsGet(doneKey, null);
    // Re-run when list signature changes; skip if staff overrides already dense
    var all = organised(rows, deps, helpers);
    var sm = U.staffOverrideMap ? U.staffOverrideMap() : {};
    var unalloc = all.filter(function (r) {
      var s = sm[r.key] != null ? sm[r.key] : r.cells.staff;
      return !s || s === '—' || /^unalloc/i.test(s);
    });
    if (!unalloc.length) { lsSet(doneKey, { sig: sig, at: Date.now() }); return { ok: true, n: 0, reason: 'all_allocated' }; }
    var staffBySection = helpers.staffBySection || {};
    var fallbackPool = [];
    Object.keys(staffBySection).forEach(function (sec) {
      splitStaff(staffBySection[sec]).forEach(function (n) {
        if (fallbackPool.indexOf(n) < 0) fallbackPool.push(n);
      });
    });
    if (!fallbackPool.length) fallbackPool = ['Chef A', 'Chef B'];
    var i = 0;
    unalloc.forEach(function (r) {
      var lead = staffBySection[r.cells.section];
      var names = splitStaff(lead);
      var pick = names.length ? names[i % names.length] : fallbackPool[i % fallbackPool.length];
      // Support multi-tag for large pax
      var pax = 0;
      String(r.cells.paxPacks || '').split(/[\/+]/).forEach(function (p) {
        var n = parseFloat(p); if (Number.isFinite(n)) pax += n;
      });
      var expected = 1;
      if (root.AllocRaw && root.AllocRaw.staffFor) {
        try { expected = root.AllocRaw.staffFor('Salad', pax || 100, null, { prep: true }) || 1; } catch (e) {}
      } else if (pax > 400) expected = 2;
      if (expected > 1 && fallbackPool.length > 1) {
        var a = pick, b = fallbackPool[(i + 1) % fallbackPool.length];
        sm[r.key] = a === b ? a : (a + ', ' + b);
      } else sm[r.key] = pick;
      i += 1;
    });
    if (U.saveStaffOverrideMap) U.saveStaffOverrideMap(sm);
    if (U.pushHistory) U.pushHistory({ what: 'Auto-allocate', to: unalloc.length + ' rows' });
    lsSet(doneKey, { sig: sig, at: Date.now(), n: unalloc.length });
    return { ok: true, n: unalloc.length };
  }

  /* ---------- Prep-min totals helper ---------- */
  function prepMinTotals(organisedRows) {
    var byDay = {}, total = 0, blank = 0, set = 0;
    WEEKDAYS.forEach(function (d) { byDay[d] = 0; });
    (organisedRows || []).forEach(function (r) {
      var v = r.cells && r.cells.prepMin;
      if (v === '' || v == null || v === '—') { blank += 1; return; }
      var n = parseFloat(v);
      if (!Number.isFinite(n)) { blank += 1; return; }
      set += 1; total += n;
      var day = r.cells.prepDay;
      if (byDay[day] != null) byDay[day] += n;
    });
    return { total: total, blank: blank, set: set, byDay: byDay };
  }

  /* ---------- Weather panel fragment for item view ---------- */
  function weatherBarHtml(todayName) {
    todayName = todayName || todayWeekday();
    var w = weatherMap()[todayName] || '';
    return '<div class="panel no-print u473-weatherbar" id="u473WeatherBar"><b>Weather · ' + esc(todayName) + '</b> ' +
      '<input id="u473WeatherInline" data-weather-day="' + esc(todayName) + '" value="' + esc(w) + '" placeholder="Note for the floor…" style="width:240px;margin:0 8px">' +
      '<button type="button" class="secondary" id="u473WeatherInlineSave">Save</button>' +
      (w ? (' <span class="meta">' + esc(w) + '</span>') : '') + '</div>';
  }

  /* ---------- Templates UI strip ---------- */
  function templatesBarHtml() {
    var m = (U.loadFunctionTemplate && typeof U.loadFunctionTemplate === 'function')
      ? (function () {
          try { return lsGet('prepline.fnTemplates.v1', {}) || {}; } catch (e) { return {}; }
        })() : (lsGet('prepline.fnTemplates.v1', {}) || {});
    var names = Object.keys(m);
    var html = '<div class="panel no-print u473-templates" id="u473Templates"><b>Function templates</b> ';
    html += '<input id="u473TplName" placeholder="Function name" style="width:160px"> ';
    html += '<button type="button" class="secondary" id="u473TplSave">Save template</button> ';
    html += '<select id="u473TplLoad"><option value="">Load…</option>';
    names.forEach(function (n) { html += '<option value="' + esc(n) + '">' + esc(n) + '</option>'; });
    html += '</select></div>';
    return html;
  }

  /* ---------- Email recipient setting (no hardcoded address) ---------- */
  function emailSettingsHtml() {
    var to = '';
    try { to = lsGet(EMAIL_TO_KEY, '') || ''; if (typeof to !== 'string') to = ''; } catch (e) {}
    if (U.emailTo) to = U.emailTo() || to;
    return '<div class="panel no-print u473-email" id="u473EmailSet"><b>Email sheet recipient</b> ' +
      '<input id="u473EmailTo" type="email" placeholder="chef@example.com (optional)" value="' + esc(to) + '" style="width:220px"> ' +
      '<button type="button" class="secondary" id="u473EmailSave">Remember</button> ' +
      '<span class="meta">Mailto opens blank To if empty — never hardcodes an address.</span></div>';
  }

  /* ---------- Enhance renderByItemView further ---------- */
  var _renderByItem = U.renderByItemView;
  U.renderByItemView = function (rows, deps, helpers) {
    helpers = helpers || {};
    var core = _renderByItem ? _renderByItem.call(U, rows, deps, helpers) : '';
    var all = organised(rows, deps, helpers);
    var pm = prepMinTotals(all);
    var extra = '';
    extra += weatherBarHtml(helpers.todayName || todayWeekday());
    extra += templatesBarHtml();
    extra += emailSettingsHtml();
    extra += '<div class="panel no-print" id="u473PrepMinTotals"><b>Prep time</b> · set: ' + pm.set +
      ' · blank: ' + pm.blank + ' · total minutes: <span id="u473PrepMinSum">' + pm.total + '</span></div>';
    // Prefixed panels (weather/templates) then core; ensure shopping panel gone
    core = core.replace(/<div class="panel u47-shop"[\s\S]*?<\/div>/, '');
    return extra + core;
  };

  var _bindByItem = U.bindByItemView;
  U.bindByItemView = function (rootEl, onChange) {
    if (_bindByItem) _bindByItem.call(U, rootEl, onChange);
    if (!rootEl) rootEl = document;
    function saveWeatherFrom(inp) {
      if (!inp) return;
      var day = inp.getAttribute('data-weather-day') || todayWeekday();
      var m = weatherMap();
      m[day] = inp.value || '';
      saveWeatherMap(m);
      if (U.pushHistory) U.pushHistory({ what: 'Weather', to: day + ': ' + m[day] });
      if (U.showToast) U.showToast('Weather note saved');
    }
    var wSave = document.getElementById('u473WeatherSave') || document.getElementById('u473WeatherInlineSave');
    [document.getElementById('u473WeatherSave'), document.getElementById('u473WeatherInlineSave')].forEach(function (btn) {
      if (btn && !btn._u473) {
        btn._u473 = true;
        btn.addEventListener('click', function () {
          var inp = document.getElementById('u473Weather') || document.getElementById('u473WeatherInline');
          saveWeatherFrom(inp);
          if (onChange) onChange();
        });
      }
    });
    var emailSave = document.getElementById('u473EmailSave');
    if (emailSave && !emailSave._u473) {
      emailSave._u473 = true;
      emailSave.addEventListener('click', function () {
        var v = (document.getElementById('u473EmailTo') || {}).value || '';
        if (U.setEmailTo) U.setEmailTo(v);
        else lsSet(EMAIL_TO_KEY, v);
        if (U.showToast) U.showToast('Email recipient saved (local only)');
      });
    }
    var tplSave = document.getElementById('u473TplSave');
    if (tplSave && !tplSave._u473) {
      tplSave._u473 = true;
      tplSave.addEventListener('click', function () {
        var name = ((document.getElementById('u473TplName') || {}).value || '').trim();
        if (!name) { if (U.showToast) U.showToast('Enter a function name'); return; }
        var dishes = [];
        try {
          var bridge = root.__preplineBridge;
          var rows = bridge && bridge.getRows ? bridge.getRows() : [];
          var seen = {};
          rows.forEach(function (r) { if (r.dish && !seen[r.dish]) { seen[r.dish] = 1; dishes.push(r.dish); } });
        } catch (e) {}
        if (U.saveFunctionTemplate) U.saveFunctionTemplate(name, dishes);
        if (U.showToast) U.showToast('Template saved: ' + name);
        if (onChange) onChange();
      });
    }
    // Prep-min click-to-edit on organised table (column before Notes)
    rootEl.querySelectorAll && rootEl.querySelectorAll('tr[data-u47-key]').forEach(function (tr) {
      if (tr._u473pm) return;
      tr._u473pm = true;
      var tds = tr.querySelectorAll('td[data-u47-v]');
      // Prep min is second-to-last when Notes is last
      if (tds.length >= 2) {
        var pmTd = tds[tds.length - 2];
        pmTd.title = 'Click to set prep minutes (blank until set)';
        pmTd.style.cursor = 'pointer';
        pmTd.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var k = tr.getAttribute('data-u47-key');
          var map = U.prepMinMap ? U.prepMinMap() : {};
          var cur = map[k] != null ? String(map[k]) : '';
          var next = prompt('Prep minutes (leave blank to clear)', cur);
          if (next == null) return;
          next = String(next).trim();
          if (next === '') delete map[k];
          else map[k] = next;
          if (U.savePrepMinMap) U.savePrepMinMap(map);
          if (U.pushHistory) U.pushHistory({ what: 'Prep min', from: cur, to: next, key: k });
          if (onChange) onChange();
        });
      }
    });
  };

  /* ---------- Bind new view panels ---------- */
  function bind473Views(onChange) {
    document.querySelectorAll('.u473-roster-tab').forEach(function (btn) {
      if (btn._u473) return;
      btn._u473 = true;
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-roster');
        document.querySelectorAll('.u473-roster-tab').forEach(function (b) { b.classList.toggle('on', b === btn); });
        var p = document.getElementById('u473RosterPerson');
        var s = document.getElementById('u473RosterStation');
        if (p && s) { p.hidden = mode !== 'person'; s.hidden = mode !== 'station'; }
      });
    });
    document.querySelectorAll('.u473-disp').forEach(function (sel) {
      if (sel._u473) return;
      sel._u473 = true;
      sel.addEventListener('change', function () {
        var m = dispatchMap();
        m[sel.getAttribute('data-key')] = sel.value;
        saveDispatch(m);
        if (U.pushHistory) U.pushHistory({ what: 'Dispatch', to: sel.value, key: sel.getAttribute('data-key') });
      });
    });
    document.querySelectorAll('.u473-signoff').forEach(function (inp) {
      if (inp._u473) return;
      inp._u473 = true;
      inp.addEventListener('change', function () {
        var m = signoffMap();
        m[inp.getAttribute('data-key')] = inp.value;
        saveSignoff(m);
        if (U.pushHistory) U.pushHistory({ what: 'Sign-off', to: inp.value, key: inp.getAttribute('data-key') });
      });
    });
    var swapGo = document.getElementById('u473SwapGo');
    if (swapGo && !swapGo._u473) {
      swapGo._u473 = true;
      swapGo.addEventListener('click', function () {
        var a = (document.getElementById('u473SwapA') || {}).value;
        var b = (document.getElementById('u473SwapB') || {}).value;
        var day = !!(document.getElementById('u473SwapDay') || {}).checked;
        var staff = !!(document.getElementById('u473SwapStaff') || {}).checked;
        var res = applySwap(a, b, { day: day, staff: staff });
        var text = res.ok ? 'Swapped prep day / staff.' : ('Swap failed: ' + (res.reason || 'unknown'));
        try { sessionStorage.setItem('prepline.swapMsg', text); } catch (e) {}
        var msg = document.getElementById('u473SwapMsg');
        if (msg) msg.textContent = text;
        if (res.ok && U.showToast) U.showToast('Swapped — Undo with Ctrl/Cmd+Z');
        if (res.ok && onChange) onChange();
      });
    }
    var wSave = document.getElementById('u473WeatherSave');
    if (wSave && !wSave._u473) {
      wSave._u473 = true;
      wSave.addEventListener('click', function () {
        var inp = document.getElementById('u473Weather');
        if (!inp) return;
        var day = inp.getAttribute('data-weather-day') || todayWeekday();
        var m = weatherMap();
        m[day] = inp.value || '';
        saveWeatherMap(m);
        if (U.showToast) U.showToast('Weather saved');
        if (onChange) onChange();
      });
    }
  }

  // Hook bindUpgrades47 path via render after item bind
  var _bind47 = null;
  var _bindScheduled = false;
  function installBindHook() {
    if (_bindScheduled) return;
    _bindScheduled = true;
    setTimeout(function () {
      _bindScheduled = false;
      bind473Views(function () {
        if (root.__preplineBridge && root.__preplineBridge.render) root.__preplineBridge.render();
        else if (typeof root.render === 'function') root.render();
      });
    }, 0);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(installBindHook, 0);
    });
  }

  /* ---------- CSS ---------- */
  function injectCss() {
    if (document.getElementById('u473Css')) return;
    var s = document.createElement('style');
    s.id = 'u473Css';
    s.textContent = [
      '.u473-near{background:#FFF4D6 !important;}',
      '.u473-nearwarn{display:inline-block;font-size:10px;padding:1px 6px;border-radius:999px;background:#F5E3DC;color:#9B2C2C;}',
      '.u473-chaselist{padding-left:18px;font-size:13px;}',
      '.u473-roster-tab.on{background:var(--ink,#1C1E1B);color:#fff;}'
    ].join('');
    document.head.appendChild(s);
  }
  injectCss();

  // Kill shopping export if still called
  U.weekShoppingHtml = function () {
    return '<div class="panel" id="u47Shop"><h3>Shopping list removed</h3><p class="meta">Use the original Order sheet (4.7.0). Weekly shopping roll-up is not offered.</p></div>';
  };

  // Expose
  U.VERSION = '4.7.4';
  U.todayWeekday = todayWeekday;
  U.morningBriefHtml = morningBriefHtml;
  U.dispatchTrackerHtml = dispatchTrackerHtml;
  U.rosterHtml = rosterHtml;
  U.swapToolHtml = swapToolHtml;
  U.applySwap = applySwap;
  U.autoAllocateStaff = autoAllocateStaff;
  U.prepMinTotals = prepMinTotals;
  U.perishFlagsForRow = perishFlagsForRow;
  U.nearEventWarning = nearEventWarning;
  U.weatherMap = weatherMap;
  U.saveWeatherMap = saveWeatherMap;
  U.signoffMap = signoffMap;
  U.saveSignoff = saveSignoff;
  U.bind473Views = bind473Views;
  U.dispatchMap = dispatchMap;
  U.saveDispatch = saveDispatch;

  root.Prepline473 = { VERSION: '4.7.4' };
})(typeof window !== 'undefined' ? window : globalThis);
