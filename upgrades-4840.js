/* Prepline 4.8.35-r9 — SINGLE owner of step numbers + Show/Hide.
 *
 * Root cause of prior breakage: six scripts (4821, 4822, 4827/4828, 4835, 4838)
 * each kept their own openState, cloned buttons (killing listeners), renumbered
 * with different hard-coded maps, and re-forced collapse from observers/timers.
 *
 * This module owns ALL of that:
 *  - One openState map keyed by stable section id
 *  - One capture-phase delegated click on document (recloning cannot break it)
 *  - Sequential 1..N numbers from DOM visual order (renumber after layout settles
 *    and only on real structural change — never on class toggles)
 *  - Default hidden EXCEPT Step 1 (Load / One-time sort upload) open by
 *    default (r5/r6). Open/close otherwise only on user click.
 *  - Load collapse CSS scoped to body.u480-sorted so upload is never blanked
 *    before a sort (Show bar itself is hidden until sorted).
 */
(function (root) {
  'use strict';

  var VERSION = '4.8.35-r9';
  var CSS_ID = 'u4840-css';
  var ATTR = 'data-u4840-id';
  var openState = Object.create(null);
  var defaulted = Object.create(null);
  var lastStructureKey = '';
  var renumberTimer = null;
  var settleTimer = null;
  var ticking = false;

  /* Stable catalog. find() returns the wrap element or null.
   * Labels have no number — we stamp 1..N from visual order. */
  var CATALOG = [
    {
      id: 'load',
      label: 'Load a preplist',
      find: function () {
        return document.getElementById('u4835LoadBar') ||
          document.querySelector('#dbPanel .u480-load-summary') ||
          document.getElementById('dbPanel');
      },
      /* Load uses special collapse classes on #dbPanel */
      isOpen: function () {
        var panel = document.getElementById('dbPanel');
        if (!panel) return false;
        if (panel.classList.contains('u4835-load-collapsed') || panel.classList.contains('u480-collapsed')) return false;
        if (panel.classList.contains('u4835-load-open') || panel.classList.contains('u480-open')) return true;
        /* Fallback: treat missing collapse class as open only if explicitly open */
        return !panel.classList.contains('u4835-load-collapsed');
      },
      setOpen: function (open) {
        var panel = document.getElementById('dbPanel');
        if (!panel) return;
        if (open) {
          panel.classList.remove('u4835-load-collapsed', 'u480-collapsed');
          panel.classList.add('u4835-load-open', 'u480-open');
        } else {
          panel.classList.add('u4835-load-collapsed', 'u480-collapsed');
          panel.classList.remove('u4835-load-open', 'u480-open');
        }
      },
      toggleBtn: function (wrap) {
        return (wrap && (wrap.querySelector('#u4835LoadToggle, #u4822LoadToggle, #u480ShowLoadBtn') ||
          wrap.querySelector('button'))) ||
          document.getElementById('u4835LoadToggle') ||
          document.getElementById('u4822LoadToggle');
      },
      setTitle: function (wrap, title) {
        var h = (wrap && wrap.querySelector('h2')) || document.querySelector('#u4835LoadBar h2, #dbPanelTitle');
        if (h) h.textContent = title;
      }
    },
    {
      id: 'pax',
      label: 'Pax per dish',
      find: function () { return document.getElementById('paxPanelWrap'); }
    },
    {
      id: 'chef',
      label: 'Chef-hours settings',
      find: function () { return document.getElementById('staffingPanelWrap'); }
    },
    {
      id: 'ingredients',
      label: 'Ingredients: allergens, suppliers and prices',
      find: function () { return document.getElementById('ingPanelWrap'); }
    },
    {
      id: 'changes',
      label: 'Changes check',
      find: function () { return document.querySelector('.u4821-wrap[data-u4821="changes"]'); }
    },
    {
      id: 'prepSummary',
      label: 'Prep summary (all dishes/pax/covers)',
      find: function () { return document.querySelector('.u4821-wrap[data-u4821="prepSummary"]'); }
    },
    {
      id: 'kitchenClose',
      label: 'Kitchen close & public holidays',
      find: function () { return document.querySelector('.u4821-wrap[data-u4821="kitchenClose"]'); }
    },
    {
      id: 'filters',
      label: 'Preplist filters',
      find: function () { return document.getElementById('u4835Filters'); }
    },
    {
      id: 'moreViews',
      label: 'More views',
      find: function () {
        return document.querySelector('.u4827-wrap[data-u4827="moreViews"]') ||
          document.querySelector('.u4821-wrap[data-u4821="moreViews"]');
      }
    },
    {
      id: 'export',
      label: 'Export options',
      find: function () {
        return document.querySelector('.u4821-wrap[data-u4821="export"]') ||
          document.querySelector('.u4827-wrap[data-u4827="export"]');
      }
    },
    {
      id: 'print',
      label: 'Print options',
      find: function () {
        return document.querySelector('.u4821-wrap[data-u4821="print"]') ||
          document.querySelector('.u4827-wrap[data-u4827="print"]');
      }
    },
    {
      id: 'cookingYield',
      label: 'Cooking yield check',
      find: function () { return document.querySelector('.u4827-wrap[data-u4827="cookingYield"]'); }
    },
    {
      id: 'requisitions',
      label: 'Requisitions (purchase orders)',
      find: function () { return document.querySelector('.u4827-wrap[data-u4827="requisitions"]'); }
    },
    {
      id: 'foodCost',
      label: 'Food cost',
      find: function () { return document.querySelector('.u4827-wrap[data-u4827="foodCost"]'); }
    },
    {
      id: 'originals',
      label: 'Original production tools',
      find: function () { return document.querySelector('.u4827-wrap[data-u4827="originals"]'); }
    },
    {
      id: 'howto',
      label: 'How Prepline sorts & schedules',
      find: function () {
        return document.getElementById('u4827HowtoWrap') ||
          document.querySelector('.u4827-wrap[data-u4827="howto"]');
      }
    }
  ];

  var byId = Object.create(null);
  CATALOG.forEach(function (c) { byId[c.id] = c; });

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      /* Keep every settings bar visible so Hide is always reachable */
      'body.u480-sorted #paxPanelWrap > .u480-settings-bar,',
      'body.u480-sorted #staffingPanelWrap > .u480-settings-bar,',
      'body.u480-sorted #ingPanelWrap > .u480-settings-bar,',
      'body.u480-sorted .u4821-wrap > .u480-settings-bar,',
      'body.u480-sorted .u4827-wrap > .u480-settings-bar,',
      'body.u480-sorted #u4835Filters > .u480-settings-bar,',
      'body.u480-sorted #u4835LoadBar{display:flex!important;justify-content:space-between;align-items:center;gap:8px;}',
      /* Collapse bodies */
      'body.u480-sorted .u4821-wrap.u480-settings-collapsed > *:not(.u480-settings-bar),',
      'body.u480-sorted .u4827-wrap.u480-settings-collapsed > *:not(.u480-settings-bar),',
      'body.u480-sorted #paxPanelWrap.u480-settings-collapsed > *:not(.u480-settings-bar),',
      'body.u480-sorted #staffingPanelWrap.u480-settings-collapsed > *:not(.u480-settings-bar),',
      'body.u480-sorted #ingPanelWrap.u480-settings-collapsed > *:not(.u480-settings-bar),',
      'body.u480-sorted #u4835Filters.u480-settings-collapsed > *:not(.u480-settings-bar):not(#u4835PlanSlot){display:none!important;}',
      'body.u480-sorted #u4835Filters.u480-settings-collapsed #u4835FiltersBody{display:none!important;}',
      'body.u480-sorted #u4835PlanSlot{display:block!important;}',
      '#u4827HowtoWrap.u480-settings-collapsed #u4827HowtoBody{display:none!important;}',
      /* Load collapsed — ONLY after sort. Before sort the Show bar is CSS-hidden
       * (4835), so collapsing here left file input + One-time sort with no way back. */
      'body.u480-sorted #dbPanel.u4835-load-collapsed > .u480-load-body,',
      'body.u480-sorted #dbPanel.u480-collapsed > .u480-load-body{display:none!important;}',
      /* Calendar stays off Prepline page */
      '#u4835CalWrap,.u4821-wrap[data-u4821="calendar"],.u4821-wrap[data-u4821="calendarSlot"],#u486Cal,#u4835Cal{display:none!important;}'
    ].join('');
    document.head.appendChild(s);
  }

  function isVisible(el) {
    if (!el || !el.getClientRects) return false;
    if (el.hasAttribute('hidden')) return false;
    var st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    /* display:none ancestors */
    if (el.offsetParent === null && st.position !== 'fixed') {
      /* load bar / sticky exceptions: still "present" if in flow with size */
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
    }
    return true;
  }

  function standardIsOpen(wrap) {
    return !wrap.classList.contains('u480-settings-collapsed');
  }

  function standardSetOpen(wrap, open) {
    if (open) {
      wrap.classList.remove('u480-settings-collapsed');
      wrap.classList.add('u480-settings-open');
    } else {
      wrap.classList.add('u480-settings-collapsed');
      wrap.classList.remove('u480-settings-open');
    }
  }

  function standardToggleBtn(wrap) {
    return wrap.querySelector(':scope > .u480-settings-bar button') ||
      wrap.querySelector('.u480-settings-bar button') ||
      wrap.querySelector('button.u4827-toggle, button.u4821-toggle, button.u4822-toggle');
  }

  function standardSetTitle(wrap, title) {
    var h = wrap.querySelector(':scope > .u480-settings-bar h2') ||
      wrap.querySelector('.u480-settings-bar h2') ||
      wrap.querySelector('h2');
    if (h) h.textContent = title;
  }

  function resolve(entry) {
    var wrap = entry.find();
    if (!wrap) return null;
    /* Skip calendar stubs always */
    if (wrap.getAttribute && /calendar/i.test(wrap.getAttribute('data-u4821') || '')) return null;
    if (entry.id === 'load') return wrap;
    var sorted = document.body.classList.contains('u480-sorted');
    if (!sorted) {
      /* Before sort only include wraps that are actually on screen (howto). */
      if (!isVisible(wrap)) return null;
      return wrap;
    }
    /* After sort: include every catalogued wrap that exists in the tree, even
     * when collapsed — the Show button on the settings bar is the way back in.
     * Skipping collapsed wraps left Original PTs / Export / Print unnumbered
     * and easy to miss. */
    if (wrap.hasAttribute('hidden') || wrap.style.display === 'none') return null;
    var st = window.getComputedStyle(wrap);
    if (st.display === 'none') return null;
    return wrap;
  }

  function syncLabel(entry, wrap) {
    var open = entry.isOpen ? entry.isOpen() : standardIsOpen(wrap);
    openState[entry.id] = !!open;
    var btn = entry.toggleBtn ? entry.toggleBtn(wrap) : standardToggleBtn(wrap);
    if (btn) {
      var txt = btn.textContent || '';
      /* Keep "Show load / paste" style only if already that pattern and closed */
      if (entry.id === 'load' && /load/i.test(txt)) {
        btn.textContent = open ? 'Hide' : 'Show';
      } else {
        btn.textContent = open ? 'Hide' : 'Show';
      }
      btn.setAttribute('data-u4840-toggle', entry.id);
      btn.type = 'button';
    }
  }

  function applyDefault(entry, wrap) {
    if (defaulted[entry.id]) return;
    defaulted[entry.id] = true;
    /* Default hidden, EXCEPT Load (Step 1 / One-time sort upload) — always
     * visible by default, matching r5/r6 "Step 1 open". Without this the
     * file input vanishes and the Show bar is display:none until sorted. */
    /* Load always open; originals open so Print / View original are reachable
     * as soon as the Original PTs view is shown (Show still toggles). */
    var wantOpen = entry.id === 'load' || entry.id === 'originals';
    if (entry.setOpen) entry.setOpen(wantOpen);
    else standardSetOpen(wrap, wantOpen);
    openState[entry.id] = wantOpen;
    syncLabel(entry, wrap);
  }

  function toggle(entry, wrap) {
    var open = entry.isOpen ? entry.isOpen() : standardIsOpen(wrap);
    var next = !open;
    if (entry.setOpen) entry.setOpen(next);
    else standardSetOpen(wrap, next);
    openState[entry.id] = next;
    syncLabel(entry, wrap);
    try {
      if (root.__preplineStepList) {
        root.__preplineStepList.forEach(function (row) {
          if (row.id === entry.id) row.open = next;
        });
      }
    } catch (e) {}
  }

  function collectInOrder() {
    var found = [];
    CATALOG.forEach(function (entry) {
      var wrap = resolve(entry);
      if (!wrap) return;
      wrap.setAttribute(ATTR, entry.id);
      found.push({ entry: entry, wrap: wrap });
    });
    found.sort(function (a, b) {
      if (a.wrap === b.wrap) return 0;
      var pos = a.wrap.compareDocumentPosition(b.wrap);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    return found;
  }

  function structureKey(list) {
    return list.map(function (x) { return x.entry.id; }).join('|');
  }

  function renumber() {
    ensureCss();
    var list = collectInOrder();
    var key = structureKey(list);
    list.forEach(function (item, i) {
      var n = i + 1;
      var title = n + ' · ' + item.entry.label;
      if (item.entry.setTitle) item.entry.setTitle(item.wrap, title);
      else standardSetTitle(item.wrap, title);
      applyDefault(item.entry, item.wrap);
      /* When #origTab is on screen (Original PTs view), keep panel open so Print shows. */
      if (item.entry.id === 'originals' && document.getElementById('origTab')) {
        if (item.entry.setOpen) item.entry.setOpen(true);
        else standardSetOpen(item.wrap, true);
        openState.originals = true;
      }
      syncLabel(item.entry, item.wrap);
    });
    lastStructureKey = key;
    try {
      root.__preplineStepList = list.map(function (item, i) {
        return {
          n: i + 1,
          id: item.entry.id,
          label: item.entry.label,
          open: !!openState[item.entry.id]
        };
      });
    } catch (e) {}
    return list;
  }

  var forceTimer = null;
  var lastForceAt = 0;
  function scheduleRenumber(force) {
    /* force=true: NEVER reset a pending timer (resetting under MO/render storms
     * starved renumber forever — only load+howto stayed claimed). Coalesce. */
    if (force) {
      if (forceTimer) return;
      var delay = (Date.now() - lastForceAt < 200) ? 120 : 40;
      forceTimer = setTimeout(function () {
        forceTimer = null;
        lastForceAt = Date.now();
        renumber();
      }, delay);
      return;
    }
    /* Debounced path: also coalesce — do not keep postponing past first schedule. */
    if (renumberTimer) return;
    renumberTimer = setTimeout(function () {
      renumberTimer = null;
      var list = collectInOrder();
      var key = structureKey(list);
      if (key === lastStructureKey && lastStructureKey) {
        list.forEach(function (item) {
          syncLabel(item.entry, item.wrap);
        });
        return;
      }
      renumber();
    }, 80);
  }

  function onDocClick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var btn = t.closest('button');
    if (!btn) return;

    /* Prefer explicit mark */
    var id = btn.getAttribute('data-u4840-toggle');
    var wrap = null;
    var entry = null;

    if (id && byId[id]) {
      entry = byId[id];
      wrap = resolve(entry);
    } else {
      wrap = btn.closest('[' + ATTR + ']') ||
        btn.closest('.u4821-wrap, .u4827-wrap, #paxPanelWrap, #staffingPanelWrap, #ingPanelWrap, #u4835Filters, #u4835LoadBar');
      if (!wrap) {
        /* Load toggle may sit in bar above dbPanel */
        if (btn.id === 'u4835LoadToggle' || btn.id === 'u4822LoadToggle' || btn.id === 'u480ShowLoadBtn') {
          entry = byId.load;
          wrap = resolve(entry);
        }
      } else {
        id = wrap.getAttribute(ATTR);
        if (id && byId[id]) entry = byId[id];
        else {
          /* Infer from wrap */
          for (var i = 0; i < CATALOG.length; i++) {
            var w = CATALOG[i].find();
            if (w === wrap) { entry = CATALOG[i]; break; }
          }
        }
      }
    }

    if (!entry || !wrap) return;
    /* Ignore unrelated buttons inside open sections (e.g. Export Excel) */
    var bar = wrap.querySelector('.u480-settings-bar') || wrap;
    if (entry.id !== 'load') {
      if (!bar.contains(btn)) return;
      /* Must be the settings toggle, not a nested action button.
       * NOTE: local name must NOT be `toggle` — that shadows the toggle() function. */
      var toggleEl = entry.toggleBtn ? entry.toggleBtn(wrap) : standardToggleBtn(wrap);
      if (toggleEl && btn !== toggleEl && !btn.classList.contains('u4827-toggle') &&
          !btn.classList.contains('u4821-toggle') && !btn.classList.contains('u4822-toggle') &&
          btn.id !== 'u4835FiltersToggle' && btn.id !== 'u4835LoadToggle') {
        return;
      }
    }

    ev.preventDefault();
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
    toggle(entry, wrap);
  }


  function patchRender() {
    try {
      var g = root;
      if (typeof g.render !== 'function') return;
      if (g.render.__u4840) return;
      var orig = g.render;
      function wrapped() {
        var ret = orig.apply(this, arguments);
        /* After every paint, reclaim new wraps (Original PTs / Export / Print).
         * 4828's render patch calls its local applyFeatureToggles directly and
         * never hits Prepline4827.apply — so our apply wrapper alone is not enough. */
        setTimeout(function () { scheduleRenumber(true); }, 0);
        setTimeout(function () { scheduleRenumber(true); }, 120);
        setTimeout(function () { scheduleRenumber(true); }, 400);
        return ret;
      }
      wrapped.__u4840 = true;
      try { if (orig.__u4827) wrapped.__u4827 = true; } catch (e0) {}
      try { if (orig.__u480) wrapped.__u480 = true; } catch (e1) {}
      try { if (orig.__u4821) wrapped.__u4821 = true; } catch (e2) {}
      try { render = wrapped; } catch (e3) {}
      g.render = wrapped;
    } catch (e) {}
  }

  function neutralizeCompetitors() {
    try {
      if (root.Prepline4822) {
        root.Prepline4822.applyToggles = function () {
          scheduleRenumber(false);
        };
      }
    } catch (e) {}

    try {
      if (root.Prepline4827) {
        var prevApply = root.Prepline4827.apply;
        root.Prepline4827.apply = function () {
          if (typeof prevApply === 'function') {
            try { prevApply(); } catch (e) {}
          }
          scheduleRenumber(false);
        };
        root.Prepline4828 = root.Prepline4827;
      }
    } catch (e2) {}

    try {
      if (root.Prepline4835) {
        if (typeof root.Prepline4835.apply === 'function') {
          var prev35 = root.Prepline4835.apply;
          root.Prepline4835.apply = function () {
            try { prev35(); } catch (e) {}
            scheduleRenumber(false);
          };
        }
      }
    } catch (e3) {}

    try {
      if (root.Prepline4838) {
        root.Prepline4838.STEP = null;
      }
    } catch (e4) {}

    try {
      if (root.Prepline480 && typeof root.Prepline480.expandSettings === 'function') {
        root.Prepline480.expandSettings = function () {
          scheduleRenumber(true);
        };
      }
    } catch (e5) {}
  }

  function observeStructure() {
    if (document.body.__u4840Obs) return;
    document.body.__u4840Obs = true;
    var obs = new MutationObserver(function (mutations) {
      var structural = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) {
          structural = true;
          break;
        }
      }
      if (!structural) return; /* ignore class/attribute noise — never fight clicks */
      scheduleRenumber(false);
    });
    try {
      obs.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
    try {
      new MutationObserver(function () {
        scheduleRenumber(true);
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (e2) {}
  }

  function stampVersion() {
    try {
      var meta = document.querySelector('meta[name="prepline-version"]');
      if (meta) meta.setAttribute('content', VERSION);
      var badge = document.getElementById('appVersion');
      if (badge) badge.textContent = 'Prepline v' + VERSION;
    } catch (e) {}
  }

  function boot() {
    ensureCss();
    stampVersion();
    neutralizeCompetitors();
    patchRender();
    if (!document.__u4840Click) {
      document.__u4840Click = true;
      document.addEventListener('click', onDocClick, true); /* capture — wins over old bubble listeners */
    }
    observeStructure();
    renumber();
    /* Settle passes after other modules finish creating wraps */
    [0, 100, 300, 800, 1600].forEach(function (ms) {
      setTimeout(function () { scheduleRenumber(true); stampVersion(); }, ms);
    });
    /* Keep badge on 4840's VERSION — older upgrades used to overwrite every 2s. */
    if (!root.__u4840StampTimer) {
      root.__u4840StampTimer = setInterval(stampVersion, 2000);
    }
    if (!root.__u4840SortedWatch) {
      root.__u4840SortedWatch = true;
      var wasSorted = false;
      setInterval(function () {
        var sorted = !!(document.body && document.body.classList.contains('u480-sorted'));
        if (sorted && !wasSorted) {
          wasSorted = true;
          [0, 100, 300, 800, 1600, 3000].forEach(function (ms) {
            setTimeout(function () { patchRender(); scheduleRenumber(true); }, ms);
          });
        }
        if (!sorted) wasSorted = false;
      }, 500);
    }
  }

  root.__preplineStepOwnerActive = true;
  root.PreplineStepOwner = {
    VERSION: VERSION,
    renumber: renumber,
    scheduleRenumber: scheduleRenumber,
    openState: openState,
    catalog: CATALOG,
    list: function () { return root.__preplineStepList || []; }
  };
  root.Prepline4840 = root.PreplineStepOwner;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
