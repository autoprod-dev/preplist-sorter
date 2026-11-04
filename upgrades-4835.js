/* Prepline 4.8.35/4.8.38 — One-time sort layout + calendar overview (trial + Paula live).
 * Layout: unique steps, Show/Hide (default hidden; Step 1 open), File: proof
 *   beside Load only, Ingredients+Prep summary stay put, filters box + yield.
 * UX: hide empty #proPanel spacer under mode tabs; one title + one Show/Hide
 *   per step (no duplicate native h2 / Show-hide when expanded).
 * Calendar: kill duplicate "Calendar grid"; one Month/Week overview showing
 *   event #, event name, dishes (optional pax). A3 landscape print (month /
 *   week). Ingredient-level detail kept via existing Export/Print / By-dish.
 */
(function (root) {
  'use strict';

  var VERSION = '4.8.35';
  var CSS_ID = 'u4835-css';
  var LS_KEY = 'preplinePref_u4835_open_v1';
  var CAL_LS = 'preplinePref_u4835_cal_v1';

  var STEP = {
    load: 1, pax: 2, chef: 3, ingredients: 4, changes: 5,
    prepSummary: 6, kitchenClose: 7, filters: 8, moreViews: 9,
    export: 10, print: 11, calendar: 12, requisitions: 13, foodCost: 14, howto: 15
  };

  var WEEKDAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  var SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return fallback;
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  var openState = loadJSON(LS_KEY, { load: true });
  var calState = loadJSON(CAL_LS, { span: 'month', anchor: null });

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      /* ---- File proof beside Load (filename only) ---- */
      '#dbPanel .u4835-load-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;}',
      '#u4835FileProof{display:none;align-items:center;gap:6px;border:1px solid var(--line,#E3DFD3);',
      'border-radius:8px;padding:5px 10px;background:#fff;font-size:12.5px;color:var(--ink,#1a1a1a);max-width:min(420px,70vw);}',
      'body.u480-sorted #u4835FileProof{display:inline-flex!important;}',
      '#u4835FileProof b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px;}',
      'body.u480-sorted #u480FileChip{display:none!important;}',
      /* ---- Step 1 Load bar ---- */
      '#u4835LoadBar{display:none;justify-content:space-between;align-items:center;gap:8px;margin:0 0 8px;width:100%;',
      'border:1px solid var(--line,#E3DFD3);border-radius:10px;background:var(--panel,#F7F4EA);padding:8px 12px;}',
      '#u4835LoadBar h2{margin:0;font-size:15px;font-weight:600;}',
      'body.u480-sorted #u4835LoadBar{display:flex!important;}',
      'body.u480-sorted #dbPanel.u4835-load-collapsed > .u480-load-body{display:none!important;}',
      'body.u480-sorted #dbPanel.u4835-load-collapsed > .u480-load-summary{display:none!important;}',
      'body.u480-sorted #dbPanel.u4835-load-open > .u480-load-body{display:block!important;}',
      'body.u480-sorted #dbPanel.u4835-load-open > .u480-load-summary{display:none!important;}',
      /* Hide empty Pro spacer under One-time sort / Recipe database tabs */
      '#proPanel:empty{display:none!important;margin:0!important;padding:0!important;border:none!important;min-height:0!important;}',
      'body.u480-sorted #proPanel:empty{display:none!important;}',
      /* One Load title only (bar); keep File proof row, hide native h2 + u480 summary */
      'body.u480-sorted #dbPanelTitle{display:none!important;}',
      'body.u480-sorted #dbPanel .u480-load-summary,',
      'body.u480-sorted #dbPanel.u480-open .u480-load-summary,',
      'body.u480-sorted #dbPanel.u480-collapsed .u480-load-summary{display:none!important;}',
      /* One title + one toggle for Pax / Chef / Ingredients (bar always; hide native) */
      'body.u480-sorted #paxPanelWrap > .u480-settings-bar,',
      'body.u480-sorted #staffingPanelWrap > .u480-settings-bar,',
      'body.u480-sorted #ingPanelWrap > .u480-settings-bar{display:flex!important;}',
      'body.u480-sorted #paxPanelWrap > h2{display:none!important;}',
      'body.u480-sorted #staffingPanelWrap > .row.no-print{display:none!important;}',
      'body.u480-sorted #toggleStaffingBtn{display:none!important;}',
      'body.u480-sorted #ingPanelWrap > h2{display:none!important;}',
      'body.u480-sorted #ingPanelWrap > .row:has(h2){display:none!important;}',
      'body.u480-sorted #ingPanelToggle{display:none!important;}',
      /* ---- Filters box ---- */
      '#u4835Filters{margin:0 0 12px;border:1px solid var(--line,#E3DFD3);border-radius:10px;',
      'background:var(--panel,#F7F4EA);padding:8px 12px;}',
      '#u4835Filters > .u480-settings-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0;}',
      '#u4835Filters > .u480-settings-bar h2{margin:0;font-size:14px;font-weight:600;}',
      '#u4835Filters.u480-settings-collapsed > #u4835FiltersBody{display:none!important;}',
      '#u4835FiltersBody{margin-top:8px;display:flex;flex-direction:column;gap:10px;}',
      '#u4835FiltersBody .u47-plan-toggle{margin:0;}',
      '#u4835FiltersBody .pb-sticky{position:static;margin:0;box-shadow:none;}',
      '#u4835YieldSlot{border-top:1px dashed var(--line,#E3DFD3);padding-top:8px;}',
      '#u4835YieldSlot .u4827-wrap,#u4835YieldSlot .u4821-wrap{margin:0;border:none;background:transparent;padding:0;}',
      /* Hide parked yield clones left behind */
      '.u4835-yield-parked{display:none!important;}',
      /* ---- Kill duplicate calendar slot stub ---- */
      '.u4821-wrap[data-u4821="calendarSlot"]{display:none!important;}',
      /* ---- Overview calendar ---- */
      '#u4835Cal{margin-top:8px;}',
      '#u4835Cal .u4835-cal-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin:0 0 10px;}',
      '#u4835Cal .u4835-spans{display:inline-flex;gap:4px;}',
      '#u4835Cal .u4835-span,#u4835Cal .u4835-navbtn{font:12.5px/1.2 "IBM Plex Sans",system-ui,sans-serif;',
      'padding:6px 10px;border:1px solid var(--line,#D9D3C3);border-radius:999px;background:#fff;cursor:pointer;}',
      '#u4835Cal .u4835-span.on{background:var(--ink,#1C1B16);color:#fff;border-color:var(--ink,#1C1B16);}',
      '#u4835Cal .u4835-range{font-weight:600;font-size:13px;min-width:140px;text-align:center;}',
      '#u4835Cal .u4835-printrow{display:flex;flex-wrap:wrap;gap:6px;}',
      '#u4835Cal .u4835-note{font-size:12px;color:var(--ink-soft,#6b675c);margin:0 0 8px;}',
      /* Hide ingredient-chip calendar when overview is present */
      'body.u4835-cal-overview #u486Cal .u486-weekgrid,',
      'body.u4835-cal-overview #u486Cal .u486-monthgrid,',
      'body.u4835-cal-overview #u486Cal .u486-yeargrid,',
      'body.u4835-cal-overview #u486Cal .u486-toolbar,',
      'body.u4835-cal-overview #u486Cal .u486-legend,',
      'body.u4835-cal-overview #u486Cal .u486-note,',
      'body.u4835-cal-overview #u486Cal .u486-unscheduled{display:none!important;}',
      /* Month grid */
      '.u4835-month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;}',
      '.u4835-mhd{font-size:11px;font-weight:700;text-align:center;padding:4px;color:var(--ink-soft);}',
      '.u4835-mcell{border:1px solid var(--line,#D9D3C3);border-radius:6px;min-height:88px;padding:4px 5px;background:#fff;}',
      '.u4835-mcell.out{opacity:.4;background:#f5f5f5;}',
      '.u4835-mcell.today{outline:2px solid var(--ink,#1C1B16);}',
      '.u4835-mdate{font-size:11px;font-weight:700;margin-bottom:3px;}',
      /* Week grid */
      '.u4835-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;}',
      '.u4835-wcell{border:1px solid var(--line,#D9D3C3);border-radius:8px;min-height:160px;padding:6px 7px;background:#fff;}',
      '.u4835-wcell.today{outline:2px solid var(--ink,#1C1B16);}',
      '.u4835-wdow{font-size:11px;font-weight:700;color:var(--ink-soft);}',
      '.u4835-wdom{font-size:16px;font-weight:700;margin-bottom:6px;}',
      /* Event cards */
      '.u4835-ev{border:1px solid #cfc9b8;border-radius:5px;padding:3px 5px;margin:0 0 4px;background:#FBF8EF;font-size:11px;line-height:1.25;}',
      '.u4835-ev-num{font-weight:800;color:#1A4D8F;margin-right:4px;}',
      '.u4835-ev-name{font-weight:700;}',
      '.u4835-ev-dish{display:block;padding-left:2px;color:#333;}',
      '.u4835-ev-pax{color:var(--ink-soft,#6b675c);font-weight:600;}',
      '.u4835-empty{color:#aaa;font-size:11px;}',
      /* Mobile */
      '@media (max-width:640px){',
      '  .u4835-week{grid-template-columns:1fr;}' ,
      '  .u4835-month{grid-template-columns:repeat(7,minmax(0,1fr));font-size:10px;}',
      '  .u4835-mcell{min-height:64px;padding:2px;}',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function stepTitle(n, label) { return n + ' · ' + label; }

  function fileLabel() {
    var tag = document.getElementById('fileTag');
    var t = (tag && tag.textContent || '').trim();
    if (!t || t === 'no file loaded') return 'sorted list';
    return t;
  }

  function bumpVersionChrome() {
    try {
      var host = (location.hostname || '') + (location.pathname || '');
      var trial = /trial/i.test(host);
      var meta = document.querySelector('meta[name="prepline-version"]');
      if (meta) meta.setAttribute('content', VERSION + (trial ? '-trial' : ''));
      var badge = document.getElementById('appVersion');
      if (badge) badge.textContent = 'Prepline v' + VERSION;
    } catch (e) {}
  }

  /* ---------- Load: File proof + Step 1 ---------- */
  function ensureFileProofBesideLoad() {
    var panel = document.getElementById('dbPanel');
    if (!panel) return;
    var titleRow = null;
    var kids = panel.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].classList && kids[i].classList.contains('row') && kids[i].querySelector('#dbPanelTitle, h2')) {
        titleRow = kids[i]; break;
      }
    }
    if (!titleRow) {
      var body = panel.querySelector('.u480-load-body');
      if (body) {
        for (var j = 0; j < body.children.length; j++) {
          if (body.children[j].classList && body.children[j].classList.contains('row') &&
              body.children[j].querySelector('#dbPanelTitle, h2')) {
            titleRow = body.children[j]; break;
          }
        }
      }
    }
    if (!titleRow) return;
    titleRow.classList.add('u4835-load-head');
    var proof = document.getElementById('u4835FileProof');
    if (!proof) {
      proof = document.createElement('div');
      proof.id = 'u4835FileProof';
      proof.className = 'u4835-file-proof no-print';
      proof.innerHTML = 'File: <b id="u4835FileName"></b>';
      var h2 = titleRow.querySelector('#dbPanelTitle, h2');
      if (h2) {
        if (h2.nextSibling) titleRow.insertBefore(proof, h2.nextSibling);
        else titleRow.appendChild(proof);
      } else titleRow.appendChild(proof);
    }
    var nameEl = document.getElementById('u4835FileName');
    if (nameEl) nameEl.textContent = fileLabel();
    var chip = document.getElementById('u480FileChip');
    if (chip) { chip.hidden = true; }
  }

  function ensureLoadStepBar() {
    var panel = document.getElementById('dbPanel');
    if (!panel) return;
    var bar = document.getElementById('u4835LoadBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'u4835LoadBar';
      bar.className = 'no-print';
      bar.innerHTML =
        '<div><h2>' + stepTitle(STEP.load, 'Load a preplist') + '</h2>' +
        '<div class="small" style="font-size:12px;color:var(--ink-soft,#6b675c);">Upload · paste · sample</div></div>' +
        '<button type="button" class="ghost" id="u4835LoadToggle">Hide</button>';
      panel.parentNode.insertBefore(bar, panel);
      /* 4.8.35-r7: Load toggle owned by 4840 */
      try { bar.querySelector('#u4835LoadToggle').setAttribute('data-u4840-toggle', 'load'); } catch (e) {}
    }
    var h2 = bar.querySelector('h2');
    if (h2) h2.textContent = stepTitle(STEP.load, 'Load a preplist');
    if (document.body.classList.contains('u480-sorted')) {
      var btn = document.getElementById('u4835LoadToggle');
      if (openState.load !== false) {
        panel.classList.remove('u4835-load-collapsed');
        panel.classList.add('u4835-load-open');
        panel.classList.remove('u480-collapsed');
        if (btn) btn.textContent = 'Hide';
      } else {
        panel.classList.add('u4835-load-collapsed');
        panel.classList.remove('u4835-load-open');
        panel.classList.add('u480-collapsed');
        if (btn) btn.textContent = 'Show';
      }
    }
  }

  function setBarTitle(wrap, title) {
    if (!wrap) return;
    var h2 = wrap.querySelector(':scope > .u480-settings-bar h2') || wrap.querySelector('.u480-settings-bar h2');
    if (h2) h2.textContent = title;
  }

  function forceCollapsed(wrap, wantOpen) {
    /* 4.8.35-r7: 4840 owns default collapse + Show/Hide. */
    return;
  }

  function wireRemember(wrap, key) {
    /* 4.8.35-r7: no per-button remember — 4840 owns state. */
    return;
  }

  function isSorted() {
    return document.body.classList.contains('u480-sorted');
  }

  function fixEmptyProPanel() {
    var pp = document.getElementById('proPanel');
    if (!pp) return;
    if (!String(pp.innerHTML || '').trim()) {
      pp.style.display = 'none';
      pp.setAttribute('hidden', '');
    } else {
      pp.removeAttribute('hidden');
      if (pp.style.display === 'none' && pp.querySelector('button, input, .row')) {
        /* leave explicit hide from renderProPanel alone */
      }
    }
  }

  /* One chrome for Pax/Chef/Ingredients. Do NOT clone buttons — u4821/u4822
   * already wire Show↔Hide; recloning every applyLayout detaches the node. */
  function ensureOwnSettingsBar(wrap, label) {
    if (!wrap) return null;
    var bar = wrap.querySelector(':scope > .u480-settings-bar');
    if (bar) return bar;
    if (wrap.dataset) delete wrap.dataset.u480Bar;
    bar = document.createElement('div');
    bar.className = 'u480-settings-bar no-print';
    bar.innerHTML =
      '<h2 style="margin:0;font-size:15px;">' + label + '</h2>' +
      '<button type="button" class="ghost u4822-toggle">Show</button>';
    wrap.insertBefore(bar, wrap.firstChild);
    if (wrap.dataset) wrap.dataset.u480Bar = '1';
    return bar;
  }

  function stabilizeNativeToggles() {
    /* Stop u4821 re-cloning forever (it flags the old node, not the fresh one). */
    ['paxPanelWrap', 'staffingPanelWrap', 'ingPanelWrap'].forEach(function (id) {
      var wrap = document.getElementById(id);
      if (!wrap) return;
      var btn = wrap.querySelector(':scope > .u480-settings-bar button');
      if (!btn) return;
      btn.__u4821Toggle = true;
      btn.__u4822Toggle = true;
    });
  }

  function fixNativeStepToggles() {
    if (!isSorted()) return;
    var rows = [
      ['paxPanelWrap', 'pax', stepTitle(STEP.pax, 'Pax per dish')],
      ['staffingPanelWrap', 'chef', stepTitle(STEP.chef, 'Chef-hours settings')],
      ['ingPanelWrap', 'ingredients', stepTitle(STEP.ingredients, 'Ingredients: allergens, suppliers and prices')]
    ];
    rows.forEach(function (pair) {
      var wrap = document.getElementById(pair[0]);
      if (!wrap || wrap.style.display === 'none') return;
      var key = pair[1];
      ensureOwnSettingsBar(wrap, pair[2]);
      /* 4.8.35-r7: title/collapse/label owned by 4840 */
      var nativeToggle = wrap.querySelector('#toggleStaffingBtn, #ingPanelToggle');
      if (nativeToggle) nativeToggle.style.display = 'none';
    });
    stabilizeNativeToggles();
    /* Ask u4822 to wire Show↔Hide without fighting us. */
    /* 4.8.35-r7: do not re-wire toggles via 4822 — 4840 owns Show/Hide. */
    stabilizeNativeToggles();
  }


  function ensureEmptySectionHint(wrap, key) {
    if (!wrap) return;
    var body = wrap.querySelector(':scope > .u4821-body, :scope > .u4827-body, :scope > .u480-group-body') ||
      wrap.querySelector('.u4821-body, .u4827-body, .u480-group-body');
    if (!body) {
      /* Bar-only wrap (content is other direct children). Skip if any real sibling content. */
      var kids = Array.prototype.slice.call(wrap.children || []).filter(function (c) {
        return c && !c.classList.contains('u480-settings-bar') && !c.classList.contains('u4835-empty-hint');
      });
      if (kids.length) return;
      body = document.createElement('div');
      body.className = 'u4835-empty-body';
      wrap.appendChild(body);
    }
    var meaningful = false;
    try {
      var txt = String(body.textContent || '').replace(/\s+/g, ' ').trim();
      meaningful = txt.length > 0 || !!body.querySelector('button, input, select, table, a, img, canvas, svg, .row, .card');
    } catch (e) {}
    var hint = body.querySelector(':scope > .u4835-empty-hint') || wrap.querySelector(':scope > .u4835-empty-hint');
    if (meaningful) {
      if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
      return;
    }
    if (hint) return;
    hint = document.createElement('div');
    hint.className = 'u4835-empty-hint meta';
    hint.style.cssText = 'font-size:12.5px;color:var(--ink-soft,#6b675c);padding:6px 2px;';
    hint.textContent = 'Load a preplist first — this section fills in after you sort.';
    body.appendChild(hint);
  }

  function renumberAndCollapse() {
    if (!isSorted()) return;

    var map = [
      /* pax / chef / ingredients: titles+defaults in fixNativeStepToggles */
      ['.u4821-wrap[data-u4821="changes"]', 'changes', STEP.changes, 'Changes check'],
      ['.u4821-wrap[data-u4821="prepSummary"]', 'prepSummary', STEP.prepSummary, 'Prep summary (all dishes/pax/covers)'],
      ['.u4821-wrap[data-u4821="kitchenClose"]', 'kitchenClose', STEP.kitchenClose, 'Kitchen close & public holidays'],
      ['.u4827-wrap[data-u4827="moreViews"],.u4821-wrap[data-u4821="moreViews"]', 'moreViews', STEP.moreViews, 'More views'],
      ['.u4821-wrap[data-u4821="export"]', 'export', STEP.export, 'Export options'],
      ['.u4821-wrap[data-u4821="print"]', 'print', STEP.print, 'Print options'],
      /* calendar moved off Prepline (4.8.38) */
      ['.u4827-wrap[data-u4827="requisitions"]', 'requisitions', STEP.requisitions, 'Requisitions (purchase orders)'],
      ['.u4827-wrap[data-u4827="foodCost"]', 'foodCost', STEP.foodCost, 'Food cost'],
      ['#u4827HowtoWrap', 'howto', STEP.howto, 'How Prepline sorts & schedules']
    ];

    map.forEach(function (row) {
      var el = document.querySelector(row[0]);
      if (!el) return;
      /* 4.8.35-r7: titles + collapse owned by 4840; only empty hints here. */
      ensureEmptySectionHint(el, row[1]);
    });

    /* Kill duplicate calendar stub (root cause of double "9 · Calendar grid") */
    var slot = document.querySelector('.u4821-wrap[data-u4821="calendarSlot"]');
    if (slot) {
      slot.style.display = 'none';
      slot.setAttribute('hidden', '');
      var sh = slot.querySelector('.u480-settings-bar h2');
      if (sh) sh.textContent = '';
      try { if (slot.parentNode) slot.parentNode.removeChild(slot); } catch (e) {}
    }
    /* Live calendar wrap title → step 12 (u4821 still stamps "9 ·") */
    var calWrap = document.querySelector('.u4821-wrap[data-u4821="calendar"]');
    if (calWrap) setBarTitle(calWrap, stepTitle(STEP.calendar, 'Calendar grid'));
  }

  /* ---------- Filters box (plan above day chips + yield) ---------- */
  function ensureFiltersBox() {
    if (!isSorted()) return;
    var area = document.getElementById('resultsArea');
    if (!area) return;

    var box = document.getElementById('u4835Filters');
    if (!box) {
      box = document.createElement('div');
      box.id = 'u4835Filters';
      box.className = 'no-print';
      box.innerHTML =
        '<div class="u480-settings-bar no-print">' +
          '<div><h2>' + stepTitle(STEP.filters, 'Preplist filters') + '</h2>' +
          '<div class="small" style="font-size:12px;color:var(--ink-soft,#6b675c);">By dish / day / section · day chips · cooking yield</div></div>' +
          '<button type="button" class="ghost" id="u4835FiltersToggle">Show</button>' +
        '</div>' +
        '<div id="u4835FiltersBody">' +
          '<div id="u4835PlanSlot"></div>' +
          '<div id="u4835DaySlot"></div>' +
          '<div id="u4835YieldSlot"></div>' +
        '</div>';
      var groups = document.getElementById('u480Groups');
      if (groups && groups.parentNode === area) area.insertBefore(box, groups);
      else if (area.firstChild) area.insertBefore(box, area.firstChild);
      else area.appendChild(box);
      /* 4.8.35-r7: Filters toggle owned by 4840 */
      try { box.querySelector('#u4835FiltersToggle').setAttribute('data-u4840-toggle', 'filters'); } catch (e) {}
    }

    /* 4.8.35-r7: filters title/collapse owned by 4840 */
    var fbtn = document.getElementById('u4835FiltersToggle');
    if (fbtn) try { fbtn.setAttribute('data-u4840-toggle', 'filters'); } catch (e) {}

    var planSlot = document.getElementById('u4835PlanSlot');
    var daySlot = document.getElementById('u4835DaySlot');
    var plan = area.querySelector(':scope > .u47-plan-toggle') || document.getElementById('u47PlanToggle');
    if (plan && planSlot && plan.parentNode !== planSlot) {
      planSlot.innerHTML = '';
      planSlot.appendChild(plan);
    }
    var sticky = document.getElementById('pbSticky') || area.querySelector('.pb-sticky');
    if (sticky && daySlot && sticky.parentNode !== daySlot) {
      daySlot.innerHTML = '';
      daySlot.appendChild(sticky);
    }
    parkYield();
  }

  function parkYield() {
    var slot = document.getElementById('u4835YieldSlot');
    if (!slot) return;
    var panel = document.getElementById('yieldPanel');
    var stub = document.querySelector('.u4827-wrap[data-u4827="cookingYield"]');
    var target = null;
    if (panel) {
      var wrap = panel.closest('.u4827-wrap, .u4821-wrap');
      target = wrap || panel;
    } else if (stub) target = stub;

    if (!target) {
      if (!slot.querySelector('.u4835-yield-inline')) {
        slot.innerHTML =
          '<div class="u4835-yield-inline"><div style="font-weight:600;font-size:13px;">Cooking yield check</div>' +
          '<div class="meta" style="font-size:12.5px;margin-top:4px;">Upload a purchase order / requisition to compare raw vs cooked weights, or open Yield library under More views.</div></div>';
      }
      return;
    }
    if (stub && stub !== target) stub.classList.add('u4835-yield-parked');
    if (target.parentNode !== slot) {
      slot.innerHTML = '';
      slot.appendChild(target);
    }
    if (target.classList) {
      target.classList.remove('u480-settings-collapsed');
      var yh = target.querySelector('.u480-settings-bar h2');
      if (yh) yh.textContent = 'Cooking yield check';
      var yb = target.querySelector('.u480-settings-bar button');
      if (yb) yb.textContent = 'Hide';
    }
  }

  /* ---------- Event overview calendar (Month / Week) ---------- */
  function parseDishMeta(dish) {
    var raw = String(dish || '').trim();
    /* "1 Monday - Pork - CBA Christmas" or "5 Fri - Burrata - ICCS Charity" */
    var m = raw.match(/^\s*(\d+)?\s*([A-Za-z]+)?\s*-\s*(.+?)\s*-\s*(.+)\s*$/);
    if (m) {
      return {
        eventNum: (m[1] || '').trim(),
        dayWord: (m[2] || '').trim(),
        dishName: m[3].trim(),
        eventName: m[4].trim()
      };
    }
    var parts = raw.split(/\s+-\s+/);
    if (parts.length >= 2) {
      return { eventNum: '', dayWord: '', dishName: parts[0].trim(), eventName: parts[parts.length - 1].trim() };
    }
    return { eventNum: '', dayWord: '', dishName: raw, eventName: 'Event' };
  }

  function mondayOf(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = (x.getDay() + 6) % 7; /* Mon=0 */
    x.setDate(x.getDate() - day);
    return x;
  }
  function addDays(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }
  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function parseAuDate(s) {
    if (!s) return null;
    if (s instanceof Date && !isNaN(s)) return s;
    var t = String(s).trim();
    var m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      var y = +m[3]; if (y < 100) y += 2000;
      return new Date(y, +m[2] - 1, +m[1]);
    }
    var d = new Date(t);
    return isNaN(d) ? null : d;
  }

  function getAnchor() {
    if (calState.anchor) {
      var d = parseAuDate(calState.anchor) || new Date(calState.anchor);
      if (d && !isNaN(d)) return d;
    }
    return inferAnchor();
  }
  function setAnchor(d) {
    calState.anchor = ymd(d);
    saveJSON(CAL_LS, calState);
    return d;
  }
  function getSpan() {
    return calState.span === 'week' ? 'week' : 'month';
  }
  function setSpan(sp) {
    calState.span = sp === 'week' ? 'week' : 'month';
    saveJSON(CAL_LS, calState);
  }

  function inferAnchor() {
    var rows = [];
    try { rows = (typeof ROWS !== 'undefined' && ROWS) ? ROWS : (root.ROWS || []); } catch (e) {}
    var dates = [];
    var seenDish = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.dish || seenDish[r.dish]) return;
      seenDish[r.dish] = 1;
      var ds = null;
      try {
        if (typeof getEventDateStr === 'function') ds = getEventDateStr(r.dish);
        else if (typeof eventDateByDish !== 'undefined' && eventDateByDish) ds = eventDateByDish[r.dish];
      } catch (e) {}
      var d = parseAuDate(ds);
      if (d) dates.push(d);
    });
    if (dates.length) {
      dates.sort(function (a, b) { return a - b; });
      return mondayOf(dates[0]);
    }
    /* Fall back: week containing first weekday mentioned */
    return mondayOf(new Date());
  }

  /** Build map ymd -> [ {eventNum, eventName, dishes:[{name,pax}]} ] */
  function buildEventsByYmd(anchor, span) {
    var rows = [];
    try { rows = (typeof ROWS !== 'undefined' && ROWS) ? ROWS : (root.ROWS || []); } catch (e) {}
    var weekMon = mondayOf(anchor);
    var rangeStart, rangeEnd;
    if (span === 'week') {
      rangeStart = weekMon;
      rangeEnd = addDays(weekMon, 6);
    } else {
      var first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      rangeStart = mondayOf(first);
      var last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
      rangeEnd = addDays(mondayOf(last), 6);
    }

    var byYmd = {};
    var seenDish = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.dish || seenDish[r.dish]) return;
      seenDish[r.dish] = 1;
      var meta = parseDishMeta(r.dish);
      var abs = null;
      try {
        if (typeof getEventDateStr === 'function') abs = parseAuDate(getEventDateStr(r.dish));
        else if (typeof eventDateByDish !== 'undefined' && eventDateByDish) abs = parseAuDate(eventDateByDish[r.dish]);
      } catch (e) {}
      var dayName = null;
      try {
        if (typeof getEventDay === 'function') dayName = getEventDay(r.dish);
      } catch (e) {}
      if (!dayName && meta.dayWord) {
        for (var i = 0; i < WEEKDAYS.length; i++) {
          if (new RegExp('^' + WEEKDAYS[i].slice(0, 3), 'i').test(meta.dayWord) ||
              new RegExp('^' + WEEKDAYS[i] + '$', 'i').test(meta.dayWord)) {
            dayName = WEEKDAYS[i]; break;
          }
        }
      }

      var dates = [];
      if (abs) {
        dates.push(abs);
      } else if (dayName) {
        var di = WEEKDAYS.indexOf(dayName);
        if (di >= 0) {
          /* Place on every matching weekday in visible range */
          for (var d = new Date(rangeStart); d <= rangeEnd; d = addDays(d, 1)) {
            if (((d.getDay() + 6) % 7) === di) dates.push(new Date(d));
          }
        }
      }
      if (!dates.length) return;

      var pax = null;
      try {
        if (typeof paxByDish !== 'undefined' && paxByDish && paxByDish[r.dish] != null) pax = paxByDish[r.dish];
      } catch (e) {}

      dates.forEach(function (dt) {
        if (dt < rangeStart || dt > rangeEnd) return;
        if (span === 'month' && dt.getMonth() !== anchor.getMonth() && false) { /* show out-of-month in grid anyway */ }
        var k = ymd(dt);
        if (!byYmd[k]) byYmd[k] = {};
        var ek = (meta.eventNum || '') + '||' + meta.eventName;
        if (!byYmd[k][ek]) {
          byYmd[k][ek] = {
            eventNum: meta.eventNum || '',
            eventName: meta.eventName || 'Event',
            dishes: []
          };
        }
        byYmd[k][ek].dishes.push({ name: meta.dishName, pax: pax, raw: r.dish });
      });
    });

    /* Convert to arrays */
    var out = {};
    Object.keys(byYmd).forEach(function (k) {
      out[k] = Object.keys(byYmd[k]).map(function (ek) { return byYmd[k][ek]; });
      out[k].sort(function (a, b) {
        return String(a.eventNum).localeCompare(String(b.eventNum)) ||
          a.eventName.localeCompare(b.eventName);
      });
    });
    return out;
  }

  function eventCardHtml(ev, compact) {
    var html = '<div class="u4835-ev">';
    html += '<div>';
    if (ev.eventNum) html += '<span class="u4835-ev-num">#' + esc(ev.eventNum) + '</span>';
    html += '<span class="u4835-ev-name">' + esc(ev.eventName) + '</span></div>';
    (ev.dishes || []).forEach(function (d) {
      html += '<span class="u4835-ev-dish">· ' + esc(d.name);
      if (d.pax != null && d.pax !== '') html += ' <span class="u4835-ev-pax">(' + esc(d.pax) + ')</span>';
      html += '</span>';
    });
    html += '</div>';
    return html;
  }

  function renderMonthHtml(byYmd, anchor, todayY) {
    var y = anchor.getFullYear(), m = anchor.getMonth();
    var first = new Date(y, m, 1);
    var gridStart = mondayOf(first);
    var last = new Date(y, m + 1, 0);
    var gridEnd = addDays(mondayOf(last), 6);
    var html = '<div class="u4835-month" role="grid" aria-label="Month overview">';
    SHORT.forEach(function (s) { html += '<div class="u4835-mhd">' + s + '</div>'; });
    for (var d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) {
      var k = ymd(d);
      var inMonth = d.getMonth() === m;
      var isToday = k === todayY;
      var events = byYmd[k] || [];
      html += '<div class="u4835-mcell' + (inMonth ? '' : ' out') + (isToday ? ' today' : '') + '" data-ymd="' + k + '">';
      html += '<div class="u4835-mdate">' + d.getDate() + '</div>';
      if (!events.length) html += '<div class="u4835-empty">—</div>';
      else events.forEach(function (ev) { html += eventCardHtml(ev, true); });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderWeekHtml(byYmd, weekMon, todayY) {
    var html = '<div class="u4835-week" role="grid" aria-label="Week overview">';
    for (var i = 0; i < 7; i++) {
      var d = addDays(weekMon, i);
      var k = ymd(d);
      var isToday = k === todayY;
      var events = byYmd[k] || [];
      html += '<div class="u4835-wcell' + (isToday ? ' today' : '') + '" data-ymd="' + k + '">';
      html += '<div class="u4835-wdow">' + SHORT[i] + '</div>';
      html += '<div class="u4835-wdom">' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + '</div>';
      if (!events.length) html += '<div class="u4835-empty">—</div>';
      else events.forEach(function (ev) { html += eventCardHtml(ev, false); });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function rangeLabel(span, anchor) {
    if (span === 'week') {
      var mon = mondayOf(anchor);
      var sun = addDays(mon, 6);
      if (mon.getMonth() === sun.getMonth()) {
        return mon.getDate() + '–' + sun.getDate() + ' ' + MONTHS[mon.getMonth()] + ' ' + mon.getFullYear();
      }
      return mon.getDate() + ' ' + MONTHS[mon.getMonth()].slice(0, 3) + ' – ' +
        sun.getDate() + ' ' + MONTHS[sun.getMonth()].slice(0, 3) + ' ' + sun.getFullYear();
    }
    return MONTHS[anchor.getMonth()] + ' ' + anchor.getFullYear();
  }

  function ensureOverviewCalendar() {
    /* 4.8.38: calendar moved to Work order, allocation & calendar grid — do not mount on Prepline page */
    return;
    /* Host: prefer live calendar wrap body; else create under results */
    var calWrap = document.querySelector('.u4821-wrap[data-u4821="calendar"]');
    var hostParent = null;
    var host = document.getElementById('u4835Cal');

    if (calWrap) {
      setBarTitle(calWrap, stepTitle(STEP.calendar, 'Calendar grid'));
      hostParent = calWrap;
      /* Ensure wrap body exists */
      var body = calWrap.querySelector('.u4821-body') || calWrap;
      if (!host) {
        host = document.createElement('div');
        host.id = 'u4835Cal';
        host.className = 'no-print';
        body.appendChild(host);
      }
    } else if (isSorted()) {
      /* Create calendar step if missing (e.g. week view not open) */
      var area = document.getElementById('resultsArea');
      var existingSlotGone = document.querySelector('.u4821-wrap[data-u4821="calendarSlot"]');
      var wrap = document.getElementById('u4835CalWrap');
      if (!wrap && area) {
        wrap = document.createElement('div');
        wrap.id = 'u4835CalWrap';
        wrap.className = 'u4821-wrap no-print';
        wrap.setAttribute('data-u4821', 'calendar');
        if (!openState.calendar) wrap.classList.add('u480-settings-collapsed');
        wrap.innerHTML =
          '<div class="u480-settings-bar no-print">' +
            '<div><h2>' + stepTitle(STEP.calendar, 'Calendar grid') + '</h2>' +
            '<div class="small" style="font-size:12px;color:var(--ink-soft);">Month / Week · event # · dishes · A3 print</div></div>' +
            '<button type="button" class="ghost" id="u4835CalToggle">' + (openState.calendar ? 'Hide' : 'Show') + '</button>' +
          '</div>' +
          '<div class="u4821-body"></div>';
        var printWrap = document.querySelector('.u4821-wrap[data-u4821="print"]');
        if (printWrap && printWrap.parentNode) printWrap.parentNode.insertBefore(wrap, printWrap.nextSibling);
        else if (area) area.appendChild(wrap);
        wrap.querySelector('#u4835CalToggle').addEventListener('click', function () {
          var willOpen = wrap.classList.contains('u480-settings-collapsed');
          if (willOpen) {
            wrap.classList.remove('u480-settings-collapsed');
            openState.calendar = true;
            this.textContent = 'Hide';
          } else {
            wrap.classList.add('u480-settings-collapsed');
            openState.calendar = false;
            this.textContent = 'Show';
          }
          saveJSON(LS_KEY, openState);
          if (willOpen) renderOverviewIntoHost();
        });
      }
      calWrap = document.getElementById('u4835CalWrap') || document.querySelector('.u4821-wrap[data-u4821="calendar"]');
      if (calWrap) {
        var b2 = calWrap.querySelector('.u4821-body') || calWrap;
        host = document.getElementById('u4835Cal');
        if (!host) {
          host = document.createElement('div');
          host.id = 'u4835Cal';
          b2.appendChild(host);
        }
      }
    }

    /* Always hide the stub slot */
    var slot = document.querySelector('.u4821-wrap[data-u4821="calendarSlot"]');
    if (slot) slot.style.display = 'none';

    document.body.classList.add('u4835-cal-overview');
    renderOverviewIntoHost();
  }

  function renderOverviewIntoHost() {
    var host = document.getElementById('u4835Cal');
    if (!host) return;
    var span = getSpan();
    var anchor = getAnchor();
    if (span === 'week') anchor = mondayOf(anchor);
    else anchor = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    var byYmd = buildEventsByYmd(anchor, span);
    var todayY = ymd(new Date());
    var label = rangeLabel(span, span === 'week' ? mondayOf(anchor) : anchor);

    var html = '';
    html += '<div class="u4835-cal-toolbar no-print">';
    html += '<div class="u4835-spans" role="tablist" aria-label="Calendar span">';
    html += '<button type="button" class="u4835-span' + (span === 'month' ? ' on' : '') + '" data-u4835-span="month">Month</button>';
    html += '<button type="button" class="u4835-span' + (span === 'week' ? ' on' : '') + '" data-u4835-span="week">Week</button>';
    html += '</div>';
    html += '<div class="u4835-nav">';
    html += '<button type="button" class="u4835-navbtn" data-u4835-nav="-1" aria-label="Previous">‹</button>';
    html += '<span class="u4835-range">' + esc(label) + '</span>';
    html += '<button type="button" class="u4835-navbtn" data-u4835-nav="1" aria-label="Next">›</button>';
    html += '</div>';
    html += '<div class="u4835-printrow">';
    html += '<button type="button" class="secondary" data-u4835-print="1">🖨️ Print A3 ' + (span === 'week' ? 'week' : 'month') + '</button>';
    html += '</div></div>';
    html += '<div class="u4835-note no-print">Overview for the plated team — each day shows event #, event name and dishes (pax). Ingredient-level detail stays in By dish / Export / Print.</div>';
    if (span === 'week') html += renderWeekHtml(byYmd, mondayOf(anchor), todayY);
    else html += renderMonthHtml(byYmd, anchor, todayY);

    host.innerHTML = html;
    host.querySelectorAll('[data-u4835-span]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setSpan(btn.getAttribute('data-u4835-span'));
        renderOverviewIntoHost();
      });
    });
    host.querySelectorAll('[data-u4835-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dir = btn.getAttribute('data-u4835-nav');
        var a = getAnchor();
        var sp = getSpan();
        if (sp === 'week') setAnchor(addDays(mondayOf(a), dir === '-1' ? -7 : 7));
        else setAnchor(new Date(a.getFullYear(), a.getMonth() + (dir === '-1' ? -1 : 1), 1));
        renderOverviewIntoHost();
      });
    });
    var printBtn = host.querySelector('[data-u4835-print]');
    if (printBtn) printBtn.addEventListener('click', function () { printOverviewA3(getSpan()); });
  }

  function overviewPrintCss(span) {
    var base = span === 'week' ? 11 : 8;
    return [
      '@page { size: A3 landscape; margin: 8mm; }',
      'html,body{margin:0;padding:0;background:#fff;}',
      'body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:' + base + 'px;}',
      '.sheet{width:100%;box-sizing:border-box;}',
      '.head{display:flex;align-items:baseline;gap:12px;margin:0 0 6px;flex-wrap:wrap;}',
      '.brand{font-size:10px;font-weight:700;color:#1A4D8F;}',
      'h1{font-size:' + (span === 'week' ? 18 : 14) + 'px;margin:0;font-weight:800;}',
      '.sub{font-size:10px;color:#333;margin-left:auto;}',
      '.month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;}',
      '.week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;}',
      '.mhd{font-size:10px;font-weight:700;text-align:center;padding:3px;}',
      '.cell{border:1.25px solid #111;border-radius:3px;padding:4px;vertical-align:top;min-height:' + (span === 'week' ? '120px' : '72px') + ';}',
      '.date{font-weight:800;font-size:' + (span === 'week' ? 13 : 10) + 'px;margin-bottom:3px;}',
      '.ev{border:1px solid #444;border-radius:3px;padding:3px 4px;margin:0 0 3px;background:#FBF8EF;}',
      '.ev-num{font-weight:800;color:#1A4D8F;margin-right:3px;}',
      '.ev-name{font-weight:700;}',
      '.ev-dish{display:block;padding-left:1px;}',
      '.pax{color:#555;font-weight:600;}',
      '.empty{color:#999;}',
      '.foot{font-size:8px;color:#444;margin-top:4px;}',
      '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}'
    ].join('\n');
  }

  function printOverviewA3(span) {
    span = span === 'week' ? 'week' : 'month';
    var anchor = getAnchor();
    if (span === 'week') anchor = mondayOf(anchor);
    else anchor = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    var byYmd = buildEventsByYmd(anchor, span);
    var label = rangeLabel(span, span === 'week' ? mondayOf(anchor) : anchor);
    var title = span === 'week' ? 'Week overview (A3)' : 'Month overview (A3)';
    var body = '<div class="sheet"><div class="head"><div class="brand">Prepline by Autoprod</div>' +
      '<h1>' + esc(title) + '</h1><div class="sub">' + esc(label) + ' · event # · event name · dishes · v' + VERSION + '</div></div>';

    if (span === 'week') {
      body += '<div class="week">';
      var mon = mondayOf(anchor);
      for (var i = 0; i < 7; i++) {
        var d = addDays(mon, i);
        var k = ymd(d);
        var events = byYmd[k] || [];
        body += '<div class="cell"><div class="date">' + SHORT[i] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + '</div>';
        if (!events.length) body += '<div class="empty">—</div>';
        else events.forEach(function (ev) {
          body += '<div class="ev">';
          if (ev.eventNum) body += '<span class="ev-num">#' + esc(ev.eventNum) + '</span>';
          body += '<span class="ev-name">' + esc(ev.eventName) + '</span>';
          (ev.dishes || []).forEach(function (dish) {
            body += '<span class="ev-dish">· ' + esc(dish.name);
            if (dish.pax != null && dish.pax !== '') body += ' <span class="pax">(' + esc(dish.pax) + ')</span>';
            body += '</span>';
          });
          body += '</div>';
        });
        body += '</div>';
      }
      body += '</div>';
    } else {
      body += '<div class="month">';
      SHORT.forEach(function (s) { body += '<div class="mhd">' + s + '</div>'; });
      var y = anchor.getFullYear(), m = anchor.getMonth();
      var gridStart = mondayOf(new Date(y, m, 1));
      var gridEnd = addDays(mondayOf(new Date(y, m + 1, 0)), 6);
      for (var d2 = new Date(gridStart); d2 <= gridEnd; d2 = addDays(d2, 1)) {
        var k2 = ymd(d2);
        var events2 = byYmd[k2] || [];
        var dim = d2.getMonth() !== m ? 'opacity:.45;' : '';
        body += '<div class="cell" style="' + dim + '"><div class="date">' + d2.getDate() + '</div>';
        if (!events2.length) body += '<div class="empty">—</div>';
        else events2.forEach(function (ev) {
          body += '<div class="ev">';
          if (ev.eventNum) body += '<span class="ev-num">#' + esc(ev.eventNum) + '</span>';
          body += '<span class="ev-name">' + esc(ev.eventName) + '</span>';
          (ev.dishes || []).forEach(function (dish) {
            body += '<span class="ev-dish">· ' + esc(dish.name);
            if (dish.pax != null && dish.pax !== '') body += ' <span class="pax">(' + esc(dish.pax) + ')</span>';
            body += '</span>';
          });
          body += '</div>';
        });
        body += '</div>';
      }
      body += '</div>';
    }
    body += '<div class="foot">Overview only — ingredient lists stay in By dish / Export. Fit: one A3 landscape page.</div></div>';

    var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
      '<style>' + overviewPrintCss(span) + '</style></head><body>' + body +
      '<script>window.onload=function(){setTimeout(function(){window.print();},200);};<\/script>' +
      '</body></html>';

    /* Also stash last HTML for Playwright PDF capture */
    root.__u4835LastPrintHtml = html;
    root.__u4835LastPrintSpan = span;

    var w = window.open('', '_blank');
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    }
    return html;
  }

  /* ---------- apply / boot ---------- */
  var _applyScheduled = false;
  function applyLayout() {
    if (_applyScheduled) return;
    _applyScheduled = true;
    setTimeout(function () {
      _applyScheduled = false;
      try {
        ensureCss();
        bumpVersionChrome();
        fixEmptyProPanel();
        ensureFileProofBesideLoad();
        ensureLoadStepBar();
        fixNativeStepToggles();
        renumberAndCollapse();
        ensureFiltersBox();
        ensureOverviewCalendar();
      } catch (e) {
        try { console.warn('[u4835]', e); } catch (_) {}
      }
    }, 40);
  }

  function patchRender() {
    var g = root;
    if (typeof g.render !== 'function') return false;
    if (g.render.__u4835) return true;
    var orig = g.render;
    function wrapped() {
      var ret = orig.apply(this, arguments);
      setTimeout(applyLayout, 0);
      setTimeout(applyLayout, 60);
      setTimeout(applyLayout, 200);
      return ret;
    }
    wrapped.__u4835 = true;
    if (orig.__u480) wrapped.__u480 = true;
    if (orig.__u4821) wrapped.__u4821 = true;
    if (orig.__u4827) wrapped.__u4827 = true;
    if (orig.__u486cal) wrapped.__u486cal = true;
    try { render = wrapped; } catch (e) {}
    g.render = wrapped;
    return true;
  }

  function attachObservers() {
    try {
      var ra = document.getElementById('resultsArea');
      if (ra && !ra.__u4835Obs) {
        ra.__u4835Obs = true;
        new MutationObserver(function () {
          setTimeout(applyLayout, 0);
        }).observe(ra, { childList: true, subtree: false });
      }
    } catch (e) {}
    try {
      if (!document.body.__u4835BodyObs) {
        document.body.__u4835BodyObs = true;
        new MutationObserver(function () {
          if (document.body.classList.contains('u480-sorted')) setTimeout(applyLayout, 0);
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }
    } catch (e) {}
  }

  function boot() {
    ensureCss();
    bumpVersionChrome();
    patchRender();
    attachObservers();
    applyLayout();
  }

  root.Prepline4835 = {
    VERSION: VERSION,
    apply: applyLayout,
    STEP: STEP,
    printOverviewA3: printOverviewA3,
    buildEventsByYmd: buildEventsByYmd,
    setSpan: setSpan,
    getSpan: getSpan
  };

  boot();
  setTimeout(boot, 0);
  setTimeout(boot, 50);
  setTimeout(boot, 250);
  setTimeout(function () { patchRender(); attachObservers(); applyLayout(); }, 500);
  setTimeout(function () { patchRender(); attachObservers(); applyLayout(); }, 1500);
  setTimeout(function () { patchRender(); attachObservers(); applyLayout(); }, 3000);
})(typeof window !== 'undefined' ? window : this);
