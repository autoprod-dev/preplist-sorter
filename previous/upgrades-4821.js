/* Prepline 4.8.23 — UI cleanup (trial only).
 * 1) Remove the progress / tick-off feature from the UI entirely.
 * 2) Keep A3 prep calendar one-page print (no layout regression).
 * 3) Sections 4–9 behind collapsible Show/Hide toggles in the same
 *    style as packs-per-dish / chef-hours (u480-settings-bar),
 *    collapsed by default; click Show → expand, click Hide → collapse.
 *    4 Changes check · 5 Prep summary · 6 Kitchen close & public holidays
 *    7 Export options · 8 Print options · 9 Calendar grid
 */
(function (root) {
  'use strict';

  var VERSION = '4.8.23';
  var CSS_ID = 'u4821-css';
  var openState = Object.create(null);

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      /* Progress feature removed */
      '#u47Progress, .u47-progress, .u47-progress-bar, .u47-tickbar, .u47-tickcell,',
      '.u47-tick, button.u47-tick-all, .u47-progress-share, #u47ProgressShare { display:none!important; }',
      /* Collapsible wraps — match u480 settings bars */
      'body.u480-sorted .u4821-wrap.u480-settings-collapsed > *:not(.u480-settings-bar){display:none!important;}',
      'body.u480-sorted .u4821-wrap > .u480-settings-bar{display:flex!important;}',
      '.u4821-wrap{margin:0 0 10px;border:1px solid var(--line,#E3DFD3);border-radius:10px;',
      'background:var(--panel,#F7F4EA);padding:8px 12px;}',
      '.u4821-wrap > .u480-settings-bar{display:none;justify-content:space-between;align-items:center;gap:8px;margin:0;}',
      '.u4821-wrap > .u480-settings-bar h2{margin:0;font-size:14px;font-weight:600;}',
      '.u4821-body{margin-top:8px;}',
      /* Hide original Export/Print details once converted */
      'details.u480-group.u4821-converted{display:none!important;}',
      /* Calendar print: force content visible even if collapsed */
      '@media print{',
      '  .u4821-wrap.u4821-cal-wrap > .u480-settings-bar{display:none!important;}',
      '  .u4821-wrap.u4821-cal-wrap.u480-settings-collapsed > *:not(.u480-settings-bar){display:block!important;}',
      '  body.u486-cal-print .u4821-wrap.u4821-cal-wrap{display:block!important;border:none;padding:0;background:transparent;}',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function makeBar(title, hint, key) {
    var open = !!openState[key];
    return (
      '<div class="u480-settings-bar no-print">' +
        '<div><h2>' + title + '</h2>' +
        (hint ? '<div class="small" style="font-size:12px;color:var(--ink-soft,#6b675c);">' + hint + '</div>' : '') +
        '</div>' +
        '<button type="button" class="ghost u4821-toggle">' + (open ? 'Hide' : 'Show') + '</button>' +
      '</div>'
    );
  }

  function wireToggle(wrap, key) {
    if (!wrap || wrap.__u4821Toggle) return;
    wrap.__u4821Toggle = true;
    var btn = wrap.querySelector('.u4821-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var collapsed = wrap.classList.toggle('u480-settings-collapsed');
      openState[key] = !collapsed;
      btn.textContent = collapsed ? 'Show' : 'Hide';
      if (!collapsed && key === 'calendarSlot') {
        try {
          if (typeof setView === 'function') setView('week');
          else if (typeof root.setView === 'function') root.setView('week');
        } catch (e) {}
      }
    });
  }

  function ensureCollapsible(el, key, title, hint, extraClass) {
    if (!el || !el.parentNode) return null;
    var parent = el.parentNode;
    if (parent.classList && parent.classList.contains('u4821-wrap') &&
        parent.getAttribute('data-u4821') === key) {
      parent.classList.toggle('u480-settings-collapsed', !openState[key]);
      var b = parent.querySelector('.u4821-toggle');
      if (b) b.textContent = openState[key] ? 'Hide' : 'Show';
      wireToggle(parent, key);
      return parent;
    }
    var wrap = document.createElement('div');
    wrap.className = 'u4821-wrap no-print' + (extraClass ? ' ' + extraClass : '');
    wrap.setAttribute('data-u4821', key);
    if (!openState[key]) wrap.classList.add('u480-settings-collapsed');
    wrap.innerHTML = makeBar(title, hint, key);
    parent.insertBefore(wrap, el);
    wrap.appendChild(el);
    wireToggle(wrap, key);
    return wrap;
  }

  /** Turn a u480 details group into a Show/Hide settings-bar wrap. */
  function convertDetails(detailsId, key, title, hint) {
    var d = document.getElementById(detailsId);
    if (!d || !d.parentNode) return null;
    // Already have a wrap for this key next to it?
    var existing = document.querySelector('.u4821-wrap[data-u4821="' + key + '"]');
    if (existing) {
      existing.classList.toggle('u480-settings-collapsed', !openState[key]);
      var b = existing.querySelector('.u4821-toggle');
      if (b) b.textContent = openState[key] ? 'Hide' : 'Show';
      wireToggle(existing, key);
      d.classList.add('u4821-converted');
      return existing;
    }
    var bodySrc = d.querySelector('.u480-group-body');
    var wrap = document.createElement('div');
    wrap.className = 'u4821-wrap no-print';
    wrap.setAttribute('data-u4821', key);
    if (!openState[key]) wrap.classList.add('u480-settings-collapsed');
    wrap.innerHTML = makeBar(title, hint, key);
    var body = document.createElement('div');
    body.className = 'u4821-body u480-group-body';
    if (bodySrc) {
      while (bodySrc.firstChild) body.appendChild(bodySrc.firstChild);
    }
    wrap.appendChild(body);
    d.parentNode.insertBefore(wrap, d);
    d.classList.add('u4821-converted');
    wireToggle(wrap, key);
    return wrap;
  }

  function ensureCalendarSlot() {
    var groups = document.getElementById('u480Groups');
    if (!groups) return;
    var existing = document.querySelector('.u4821-wrap[data-u4821="calendarSlot"]');
    if (existing) {
      existing.classList.toggle('u480-settings-collapsed', !openState.calendarSlot);
      var b = existing.querySelector('.u4821-toggle');
      if (b) b.textContent = openState.calendarSlot ? 'Hide' : 'Show';
      wireToggle(existing, 'calendarSlot');
      return;
    }
    var wrap = document.createElement('div');
    wrap.className = 'u4821-wrap no-print';
    wrap.setAttribute('data-u4821', 'calendarSlot');
    if (!openState.calendarSlot) wrap.classList.add('u480-settings-collapsed');
    wrap.innerHTML = makeBar('9 · Calendar grid', 'Week / month / year · Print A3', 'calendarSlot');
    var body = document.createElement('div');
    body.className = 'u4821-body';
    body.innerHTML =
      '<div class="row" style="gap:8px;flex-wrap:wrap;">' +
      '<button type="button" class="secondary" id="u4821OpenCalBtn">Open week calendar</button>' +
      '<span class="small" style="color:var(--ink-soft);font-size:12px;">Opens the calendar grid view (same as Week under More views).</span>' +
      '</div>';
    wrap.appendChild(body);
    groups.appendChild(wrap);
    wireToggle(wrap, 'calendarSlot');
    var btn = body.querySelector('#u4821OpenCalBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        openState.calendarSlot = true;
        try {
          if (typeof setView === 'function') setView('week');
          else if (typeof root.setView === 'function') root.setView('week');
        } catch (e) {}
      });
    }
  }

  function removeProgressUi() {
    var U = root.PreplineUpgrades47;
    if (U && typeof U.progressSummaryHtml === 'function' && !U.progressSummaryHtml.__u4821) {
      U.progressSummaryHtml = function () { return ''; };
      U.progressSummaryHtml.__u4821 = true;
    }
    ['u47Progress', 'u47ProgressShare'].forEach(function (id) {
      var n = document.getElementById(id);
      if (n && n.parentNode) n.parentNode.removeChild(n);
    });
    document.querySelectorAll('.u47-progress, .u47-tickbar').forEach(function (n) {
      if (n && n.parentNode) n.parentNode.removeChild(n);
    });
  }

  function upgradePaxChefToggles() {
    ['paxPanelWrap', 'staffingPanelWrap', 'ingPanelWrap'].forEach(function (id) {
      var wrap = document.getElementById(id);
      if (!wrap) return;
      var btn = wrap.querySelector('.u480-settings-bar button');
      if (!btn || btn.__u4821Toggle) return;
      btn.__u4821Toggle = true;
      var fresh = btn.cloneNode(true);
      fresh.classList.add('u4821-toggle');
      btn.parentNode.replaceChild(fresh, btn);
      fresh.addEventListener('click', function () {
        var collapsed = wrap.classList.toggle('u480-settings-collapsed');
        if (collapsed) wrap.classList.remove('u480-settings-open');
        else wrap.classList.add('u480-settings-open');
        fresh.textContent = collapsed ? 'Show' : 'Hide';
      });
      fresh.textContent = wrap.classList.contains('u480-settings-collapsed') ? 'Show' : 'Hide';
    });
  }

  function applySectionToggles() {
    ensureCss();
    removeProgressUi();

    // 4 · Changes check
    var diff = document.getElementById('u47Diff');
    if (diff) {
      ensureCollapsible(diff, 'changes', '4 · Changes check',
        'Added · removed · qty vs last upload');
    }

    // 5 · Prep summary
    var sum = document.getElementById('masterSummaryPanel');
    if (sum) {
      var h2 = sum.querySelector('h2');
      if (h2 && !h2.dataset.u4821) {
        h2.dataset.u4821 = '1';
        h2.textContent = 'All dishes & packs';
      }
      ensureCollapsible(sum, 'prepSummary', '5 · Prep summary (all dishes & packs)',
        'Tick dishes · pax · copy prep days');
    }

    // 6 · Kitchen close
    var kd = document.getElementById('blockedDaysPanel');
    if (kd) {
      ensureCollapsible(kd, 'kitchenClose', '6 · Kitchen close & public holidays',
        'Prep auto-shifts off closed days');
    }

    // 7 · Export options  /  8 · Print options  (convert details → Show/Hide bars)
    convertDetails('u480Export', 'export', '7 · Export options', 'Excel · PDF · email');
    convertDetails('u480Print', 'print', '8 · Print options', 'sections · days · method · A3');

    // 9 · Calendar grid — always-available slot in toolbar groups
    ensureCalendarSlot();

    // Also wrap the live calendar when week view is on
    var cal = document.getElementById('u486Cal');
    if (cal) {
      ensureCollapsible(cal, 'calendar', '9 · Calendar grid',
        'Week / month / year prep calendar', 'u4821-cal-wrap');
    }

    upgradePaxChefToggles();
  }


  function attachResultsObserver() {
    try {
      var ra = document.getElementById('resultsArea');
      if (!ra || ra.__u4821Obs) return !!ra;
      ra.__u4821Obs = true;
      var ro = new MutationObserver(function () {
        setTimeout(function () {
          try { applySectionToggles(); } catch (e) {}
        }, 0);
      });
      ro.observe(ra, { childList: true, subtree: false });
      return true;
    } catch (e) { return false; }
  }

  function patchRender() {
    var g = root;
    if (typeof g.render !== 'function') return false;
    if (g.render.__u4821) return true;
    var orig = g.render;
    function wrapped() {
      var ret = orig.apply(this, arguments);
      // After 480/486 syncChrome — next tick so DOM is settled
      setTimeout(function () {
        try { applySectionToggles(); } catch (e) {
          try { console.warn('[u4821]', e); } catch (_) {}
        }
      }, 0);
      return ret;
    }
    wrapped.__u4821 = true;
    if (orig.__u480) wrapped.__u480 = true;
    if (orig.__u486cal) wrapped.__u486cal = true;
    try { render = wrapped; } catch (e) {}
    g.render = wrapped;
    return true;
  }

  function boot() {
    ensureCss();
    removeProgressUi();
    patchRender();
    try {
      var obs = new MutationObserver(function () {
        if (document.body.classList.contains('u480-sorted')) {
          setTimeout(function () {
            try { applySectionToggles(); } catch (e) {}
          }, 0);
        }
      });
      obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
    // resultsArea mutations (innerHTML rewrite on each render)
    attachResultsObserver();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        patchRender();
        setTimeout(applySectionToggles, 0);
      });
    } else {
      setTimeout(applySectionToggles, 0);
    }
  }

  root.Prepline4821 = {
    VERSION: VERSION,
    apply: applySectionToggles,
    removeProgressUi: removeProgressUi
  };

  boot();
  setTimeout(boot, 0);
  setTimeout(boot, 50);
  setTimeout(boot, 250);
  setTimeout(function () { patchRender(); attachResultsObserver(); applySectionToggles(); }, 500);
  setTimeout(function () { patchRender(); attachResultsObserver(); applySectionToggles(); }, 1500);
  setTimeout(function () { patchRender(); attachResultsObserver(); applySectionToggles(); }, 3000);
})(typeof window !== 'undefined' ? window : this);
