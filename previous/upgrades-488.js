/* Prepline 4.8.26 (base 4.8.8 APIs) — trial: smart-chef prep-day grouping; food-type lead clamp (4.8.11).
 * Autoprod. TRIAL ONLY for smart chef — do NOT port smart chef / pastel / Autofilter to Paula.
 *
 * Smart chef reuses PreplineBatch (29 Oct) greedy rules:
 *   - 4-day proteins (poultry/redmeat/crabcroq) incl. chicken; fish/seafood window 2 (4.8.13); prawns window 1 non-batchable (4.8.24)
 *   - Saturday covers Mon+Tue (maxFwd 3); Mon can cover through Fri (winMax 4)
 *   - Sunday never; saturdayCap overflow → Friday; dry/oils window 4
 * Organised yellow-header export then:
 *   1) Assigns each row the batch prep day (not the raw lead-only day)
 *   2) Same prep date → one pastel colour block
 *   3) Within block: Item A–Z, then Source tab
 * Column AutoFilter menus stay (ExcelJS / SheetJS).
 *
 * Section toggles: per-section show/hide only (no Show-all card, no localStorage).
 */
(function (root) {
  'use strict';

  var WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu',
    Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };

  /* ---------- Sheet sort/filter state (in-memory; Excel Autofilter is separate) ---------- */
  var sheetState = {
    sortCol: 'prepDay',
    sortDir: 'asc',
    filters: {}
  };

  function getSheetState() {
    return {
      sortCol: sheetState.sortCol,
      sortDir: sheetState.sortDir,
      filters: Object.assign({}, sheetState.filters)
    };
  }

  function setSheetState(next) {
    if (!next || typeof next !== 'object') return getSheetState();
    if (next.sortCol) sheetState.sortCol = String(next.sortCol);
    if (next.sortDir === 'asc' || next.sortDir === 'desc') sheetState.sortDir = next.sortDir;
    if (next.filters && typeof next.filters === 'object') sheetState.filters = Object.assign({}, next.filters);
    return getSheetState();
  }

  function applySheetState(rows, state) {
    var list = Array.isArray(rows) ? rows.slice() : [];
    var st = state || sheetState;
    var filters = (st && st.filters) || {};
    Object.keys(filters).forEach(function (col) {
      var want = filters[col];
      if (want == null || want === '' || (Array.isArray(want) && !want.length)) return;
      list = list.filter(function (r) {
        var v = r[col];
        if (Array.isArray(want)) return want.indexOf(v) >= 0;
        return String(v || '') === String(want);
      });
    });
    var col = (st && st.sortCol) || 'actualPrep';
    var dir = (st && st.sortDir) === 'desc' ? -1 : 1;
    list.sort(function (a, b) {
      /* 4.8.19 Gerard Sheets: Col H Prep day A–Z (label text e.g. "1 Monday"),
         then Col A Item A–Z, then Col I Source tab A–Z.
         Matches Google Sheets sort — NOT calendar actualPrep (which puts
         previous-week "5 Friday" before "1 Monday"). */
      var pa = String(a.prepDay || '').toLowerCase();
      var pb = String(b.prepDay || '').toLowerCase();
      if (pa < pb) return -1 * dir;
      if (pa > pb) return 1 * dir;
      if (a.itemNorm < b.itemNorm) return -1 * dir;
      if (a.itemNorm > b.itemNorm) return 1 * dir;
      var sa = String(a.sourceTab || '').toLowerCase();
      var sb = String(b.sourceTab || '').toLowerCase();
      if (sa < sb) return -1 * dir;
      if (sa > sb) return 1 * dir;
      if (col !== 'actualPrep' && col !== 'prepDay' && col !== 'itemNorm' && col !== 'sourceTab' && col !== 'item') {
        var va = a[col], vb = b[col];
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
      }
      return 0;
    });
    return list;
  }

  /* ---------- Smart-chef prep-day map (reuse PreplineBatch) ---------- */

  function rowIdentity(r, idx) {
    return [
      idx,
      String(r.dish || ''),
      String(r.task || r.item || ''),
      String(r.unit || ''),
      String(r.section || '')
    ].join('\u0001');
  }

  /**
   * Build a map: rowIdentity → { prepDay, batchKey, covers, earliestFunc, latestFunc, span }.
   * Uses PreplineBatch.buildBatches — same greedy pack as the on-screen batch view.
   */
  function smartPrepDayMap(rows, helpers) {
    helpers = helpers || {};
    var PB = root.PreplineBatch;
    if (!PB || typeof PB.buildBatches !== 'function') return null;

    var list = Array.isArray(rows) ? rows : [];
    var getEventDay = helpers.getEventDay || function () { return ''; };
    var deps = {
      getEventDay: getEventDay,
      computeTotal: helpers.computeTotal || function () { return null; },
      toBaseQty: helpers.toBaseQty || function (n, u) { return { n: n, u: u, key: String(u || '').toLowerCase() }; },
      blockedDays: helpers.blockedDays || new Set()
    };

    /* Ensure food-type + lead when prepCat missing (Gerard: poultry/redmeat 4, seafood/fish 2, prawn 1). */
    list.forEach(function (r) {
      if (!r) return;
      if (!r.prepCat) {
        var t = String(r.task || r.item || '').toLowerCase();
        if (/\bchicken\b|\bspatch\b|\bpoultry\b|\bduck\b|\bturkey\b|\bquail\b/.test(t)
            && !/\b(jus|stock|oil|dressing|butter|cream|sauce|gel|puree|glace)\b/.test(t.split('/')[0] || t)) {
          r.prepCat = 'poultry';
          r.leadDays = 3; /* 4.8.26 overrides 4-day protein */
        } else if (/\bprawn\b|\bshrimp\b/.test(t)) {
          r.prepCat = 'prawn';
          if (!Number.isFinite(r.leadDays)) r.leadDays = 1;
        } else if (/\bsalmon\b|\bfish\b|\bcod\b|\btrout\b|\bbarramundi\b|\bscallop\b|\btuna\b|\bseafood\b/.test(t)) {
          r.prepCat = 'seafood';
          if (!Number.isFinite(r.leadDays)) r.leadDays = 2;
        } else if (/\bbeef\b|\blamb\b|\bpork\b|\bveal\b|\bwagyu\b|\bbrisket\b/.test(t)) {
          r.prepCat = 'redmeat';
          if (!Number.isFinite(r.leadDays)) r.leadDays = 4;
        } else if (/\b(parmesan|ricotta|feta|mozzarella|burrata|cheese|haloumi|halloumi|mascarpone|cheddar|brie)\b/.test(t)
            && !/\b(butter|cream)\b/.test(t.split('/')[0] || t)) {
          r.prepCat = 'cheese';
          r.leadDays = 3; /* 4.8.26 */
        } else if (/\bbutter\b|\bcream\b/.test(t.split('/')[0] || t)) {
          r.prepCat = 'dairy';
          if (!Number.isFinite(r.leadDays)) r.leadDays = 4;
        } else if (/\bdressing\b|\bvinaigrette\b|\baioli\b|\bmayo\b/.test(t)) {
          r.prepCat = 'dressing';
          if (!Number.isFinite(r.leadDays)) r.leadDays = 4;
        } else if (/\bcrouton/.test(t) || /\b(powder|crumb|crumbs|crumble|dust|dukkah|dukka|panko|furikake)\b/.test(t.split('/')[0] || t)) {
          r.prepCat = 'dry';
          if (!Number.isFinite(r.leadDays)) r.leadDays = 4;
        } else if (/\boil\b/.test(t.split('/')[0] || t)) {
          r.prepCat = 'oil';
          if (!Number.isFinite(r.leadDays)) r.leadDays = 4;
        } else if (/\bcrouton/.test(t) || /\b(soil|powder|crumb|crumbs|crumble|dust|dukkah|dukka|panko|furikake)\b/.test(t.split('/')[0] || t)) {
          r.prepCat = 'dry';
          r.leadDays = 4;
        }
      }
      /* 4.8.26: puree=2 (overrides gels); cheese=3; poultry=3 */
      (function () {
        var task = String(r.task || r.item || '');
        var head = task.toLowerCase().split('/')[0] || '';
        if (/\bpurees?\b|\bpurées?\b|\bpureed\b/.test(head) || r.prepCat === 'puree') {
          r.prepCat = 'puree';
          r.leadDays = 2;
          return;
        }
        if (/\bfluid\s*gel\b|\bgels?\b/.test(head) && !/\bpurees?\b/.test(head)) {
          r.prepCat = 'gels';
          if (!Number.isFinite(r.leadDays) || r.leadDays > 3) r.leadDays = 3;
        }
        if (/\b(butter|beurre)\b/.test(head)
            && !/butter\s+lettuce|butter\s+poached|no\s+butter|without\s+butter/i.test(head)) {
          r.prepCat = 'dairy';
          r.leadDays = 4; /* butters stay 4 */
          return;
        }
        if (/\b(cheese|parmesan|parmigiano|pecorino|mozzarella|burrata|ricotta|feta|haloumi|halloumi|mascarpone|cheddar|brie|camembert|goat curd|labneh)\b/.test(head)
            && !/\b(butter|cream|creme|crème)\b/.test(head)) {
          r.prepCat = 'cheese';
          r.leadDays = 3;
        }
        if (r.prepCat === 'poultry' || (/\b(chicken|duck|turkey|quail|poultry|spatchcock|poussin)\b/.test(head)
            && !/\b(jus|stock|oil|dressing|butter)\b/.test(head))) {
          /* name poultry product — not chicken jus */
          if (/\b(chicken|duck|turkey|quail|poultry|spatchcock|poussin)\b/.test(head)
              && !/\b(jus|stock|oil|dressing|butter|cream|sauce|gel|puree)\b/.test(head)) {
            r.prepCat = 'poultry';
            r.leadDays = 3;
          } else if (r.prepCat === 'poultry') {
            r.leadDays = 3;
          }
        }
      })();
      /* 4.8.25: Gerard soft/hard first; else vegraw/vegcook. Also garnish→hard list hits. */
      (function () {
        var task = r.task || r.item || '';
        if (typeof root.classifyGerardVeg === 'function') {
          var g = root.classifyGerardVeg(task);
          if (g && g.covered) {
            r.prepCat = g.key;
            r.leadDays = g.lead;
            r.vegStage = g.stage;
            r.vegStageClear = true;
            return;
          }
        }
        if (r.prepCat === 'veg' || r.prepCat === 'vegraw' || r.prepCat === 'vegcook' || r.prepCat === 'vegsoft' || r.prepCat === 'veghard') {
          if (typeof root.classifyVegPrepStage === 'function') {
            var st = root.classifyVegPrepStage(task);
            r.prepCat = st.key;
            r.leadDays = st.key === 'vegraw' || st.key === 'veghard' ? 4 : (st.key === 'vegsoft' ? 2 : 3);
            r.vegStage = st.stage;
            r.vegStageClear = !!st.clear;
          } else {
            r.prepCat = 'vegcook';
            if (!Number.isFinite(r.leadDays)) r.leadDays = 3;
          }
        }
      })();
      /* Never let leadDays exceed the food-type window (and vice versa floor for seafood). */
      if (r.prepCat && root.PreplineBatch && typeof root.PreplineBatch.batchWindowFor === 'function') {
        var w = root.PreplineBatch.batchWindowFor(r.prepCat, r.leadDays);
        if (Number.isFinite(r.leadDays) && Number.isFinite(w) && r.leadDays > w) r.leadDays = w;
      }
    });

    var groups;
    try {
      groups = PB.buildBatches(list, deps);
    } catch (e) {
      console.warn('Prepline488 smartPrepDayMap', e);
      return null;
    }

    var byId = Object.create(null);
    var byRef = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

    (groups || []).forEach(function (g) {
      var info = {
        prepDay: g.day || '',
        batchKey: g.batchKey || '',
        covers: g.covers || '',
        earliestFunc: g.window && g.window.earliestFunc ? g.window.earliestFunc : '',
        latestFunc: g.window && g.window.latestFunc ? g.window.latestFunc : '',
        span: g.window && Number.isFinite(g.window.span) ? g.window.span : 0,
        winMax: g.window && g.window.winMax != null ? g.window.winMax : null,
        merged: !!g.merged
      };
      (g.rows || []).forEach(function (r) {
        if (byRef) try { byRef.set(r, info); } catch (e) {}
      });
    });

    /* Also index by position so buildPaulaRows can look up even if refs differ. */
    list.forEach(function (r, idx) {
      var info = byRef ? byRef.get(r) : null;
      if (info) byId[rowIdentity(r, idx)] = info;
    });

    return {
      byId: byId,
      byRef: byRef,
      groups: groups,
      lookup: function (r, idx) {
        if (byRef) {
          try {
            var hit = byRef.get(r);
            if (hit) return hit;
          } catch (e) {}
        }
        if (idx != null) return byId[rowIdentity(r, idx)] || null;
        return null;
      }
    };
  }

  /**
   * Apply smart prep day onto a raw row's display label inputs.
   * Returns { prepDay, info } — prepDay is full weekday name or ''.
   */
  function smartPrepDayForRow(r, idx, map) {
    if (!map) return { prepDay: '', info: null };
    var info = map.lookup(r, idx);
    if (!info || !info.prepDay) return { prepDay: '', info: info };
    return { prepDay: info.prepDay, info: info };
  }

  /* Default organised sort: Prep day label A–Z → Item A–Z → Source A–Z (Sheets H→A→I) */
  function smartChefSort(a, b) {
    /* 4.8.19 Gerard Sheets dialog: Column H A–Z, then A A–Z, then I A–Z.
       Use prep day LABEL ("1 Monday"), not calendar actualPrep. */
    var pa = String(a.prepDay || '').toLowerCase();
    var pb = String(b.prepDay || '').toLowerCase();
    if (pa < pb) return -1;
    if (pa > pb) return 1;
    if (a.itemNorm < b.itemNorm) return -1;
    if (a.itemNorm > b.itemNorm) return 1;
    var sa = String(a.sourceTab || '').toLowerCase();
    var sb = String(b.sourceTab || '').toLowerCase();
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    return 0;
  }

  /* ---------- Section toggles (session only — no localStorage, no Show-all) ---------- */
  /* hiddenSections: { [sectionName]: true }. Empty = all visible. */
  var hiddenSections = Object.create(null);

  function isSectionHidden(name) {
    return !!hiddenSections[name];
  }

  function toggleSection(name) {
    if (!name || name === 'all' || name === 'REVIEW') return getVisibleSections();
    if (hiddenSections[name]) delete hiddenSections[name];
    else hiddenSections[name] = true;
    return getVisibleSections();
  }

  function showSection(name) {
    if (name) delete hiddenSections[name];
  }

  function hideSection(name) {
    if (name) hiddenSections[name] = true;
  }

  function getVisibleSections(allSections) {
    var all = allSections || (typeof root.SECTIONS !== 'undefined' ? root.SECTIONS : null);
    if (!all || !all.length) {
      return Object.keys(hiddenSections).filter(function (k) { return !hiddenSections[k]; });
    }
    return all.filter(function (s) { return !hiddenSections[s]; });
  }

  function resetSectionToggles() {
    hiddenSections = Object.create(null);
  }

  /**
   * Install per-section show/hide on the by-section sumcards.
   * Replaces exclusive setFilter('section') / Show-all with toggle chips.
   * Does NOT write to localStorage.
   */
  function installSectionToggles() {
    if (typeof document === 'undefined') return;
    if (root._prepline488TogglesInstalled) return;
    root._prepline488TogglesInstalled = true;

    var prevSetFilter = typeof root.setFilter === 'function' ? root.setFilter : null;
    root.setFilter = function (s) {
      if (s === 'REVIEW') {
        if (prevSetFilter) return prevSetFilter('REVIEW');
        return;
      }
      if (s === 'all') {
        /* No Show-all: treat as no-op (do not clear toggles via a Show-all card). */
        return;
      }
      toggleSection(s);
      if (typeof root.render === 'function') root.render();
    };

    /* After each render, restyle sumcards + drop the Show-all card + honour hidden sections. */
    var prevRender = typeof root.render === 'function' ? root.render : null;
    if (prevRender) {
      root.render = function () {
        prevRender.apply(this, arguments);
        try { decorateSectionToggles(); } catch (e) {}
      };
    }

    /* Also patch renderBySection visibility when it runs inside render. */
    decorateSectionToggles();
  }

  function decorateSectionToggles() {
    if (typeof document === 'undefined') return;
    var summary = document.querySelector('.summary.no-print');
    if (!summary) return;

    /* Remove "Show all sections" card. */
    Array.prototype.slice.call(summary.querySelectorAll('.sumcard')).forEach(function (card) {
      var t = (card.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^Show all sections$/i.test(t)) card.parentNode.removeChild(card);
    });

    /* Mark hidden sections and hide their section blocks. */
    var SECS = typeof root.SECTIONS !== 'undefined' ? root.SECTIONS : [];
    SECS.forEach(function (s) {
      var hidden = isSectionHidden(s);
      Array.prototype.slice.call(summary.querySelectorAll('.sumcard')).forEach(function (card) {
        var lbl = card.querySelector('.lbl');
        if (lbl && lbl.textContent === s) {
          card.classList.toggle('u488-sec-off', hidden);
          card.classList.toggle('active', !hidden);
          card.title = hidden ? 'Show ' + s : 'Hide ' + s;
        }
      });
    });

    /* Hide section heads + tables for toggled-off sections. */
    Array.prototype.slice.call(document.querySelectorAll('.section-head')).forEach(function (head) {
      var h3 = head.querySelector('h3');
      if (!h3) return;
      var name = h3.textContent.trim();
      var hide = isSectionHidden(name);
      head.style.display = hide ? 'none' : '';
      var wrap = head.nextElementSibling;
      if (wrap && wrap.classList && wrap.classList.contains('section-table-wrap')) {
        wrap.style.display = hide ? 'none' : '';
      }
    });

    ensureToggleCss();
  }

  function ensureToggleCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('u488ToggleCss')) return;
    var s = document.createElement('style');
    s.id = 'u488ToggleCss';
    s.textContent = [
      '.sumcard.u488-sec-off{opacity:.42;filter:grayscale(.35);}',
      '.sumcard.u488-sec-off .n{text-decoration:line-through;}'
    ].join('');
    document.head.appendChild(s);
  }

  /* Auto-install toggles when DOM ready (trial page). */
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(installSectionToggles, 0);
      });
    } else {
      setTimeout(installSectionToggles, 0);
    }
  }

  /* ---------- Unclear Paula 4-day rule notes (for report; not guesses) ---------- */
  var RULE_CLARIFICATIONS = [
    'Wed vs Mon+Tue (4.8.9 Gerard): Saturday maxFwd=min(winMax,4) so Sat covers Mon+Tue+Wed when under saturdayCap; if Sat heavy / cap full, Wed pushes to Monday. In-app → next day moves a prep group on the fly.',
    'Thu+Fri prep day (4.8.9 Gerard): earliest valid day = Monday (tie-break no longer fresher/later).',
    'Exception list: DEFAULT_BATCH_WINDOW — seafood/fish=2; prawn=1 not batchable; vegsoft=2 / veghard=4 (4.8.25); puree=2 no long-life (4.8.26); poultry/cheese=3 (4.8.26); vegraw=4 / vegcook|veg=3; garnish=2; gels/starch=3; redmeat/crabcroq/dry/oil/dairy/dressing=4; micro=1 not batchable. Long-life: dressings/croutons/powders/crumbs/oils/soils/gels. garnish/micro/prawn batchable=false.',
    'Saturday: only for multi-use 4-day proteins (≥2 uses) when allowSaturdayStarts is off; saturdayCap default 3 then overflow to Friday.',
    'Sunday: never used as a prep start (always shifted).',
    'Solo (single use): uses prepStartFromLead (base lead + weekend avoidance), not the multi-use Saturday pack.',
    'Same ingredient within 1–3 days: merged only when canCoverUse holds for the chosen prep day (forward days in [1, maxFwd]); batch key is normalised name + method + unit — different methods stay separate.'
  ];

  root.Prepline488 = {
    VERSION: '4.8.26',
    smartPrepDayMap: smartPrepDayMap,
    smartPrepDayForRow: smartPrepDayForRow,
    smartChefSort: smartChefSort,
    rowIdentity: rowIdentity,
    getSheetState: getSheetState,
    setSheetState: setSheetState,
    applySheetState: applySheetState,
    installSectionToggles: installSectionToggles,
    toggleSection: toggleSection,
    showSection: showSection,
    hideSection: hideSection,
    isSectionHidden: isSectionHidden,
    getVisibleSections: getVisibleSections,
    resetSectionToggles: resetSectionToggles,
    RULE_CLARIFICATIONS: RULE_CLARIFICATIONS,
    WEEKDAYS: WEEKDAYS,
    SHORT: SHORT
  };
})(typeof window !== 'undefined' ? window : globalThis);
