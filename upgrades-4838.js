/* Prepline 4.8.38 — SAFE UI polish on top of 4.8.35 layout.
 * - Calendar grid removed from Preplist page (lives under Work order, allocation & calendar grid).
 * - Step numbers unique; Load a preplist = Step 1; Show/Hide default hidden.
 * - Empty #proPanel spacer stays hidden; single title + single toggle per step.
 *
 * 4.8.35-r2: MutationObserver must NOT re-enter (mobile freeze).
 * 4.8.35-r5: Show/Hide flicker fix (4828 stop re-forcing openState) + SW heal
 * from stale openState after u4822 reclones the toggle button.
 * 4.8.35-r7: single Show/Hide+step owner (4840); looser Ref # keyword match
 * 4.8.35-r6: Ref # autofill — 3 or 4 days before BAT (prefer 3); microherbs/fish 0–4;
 * tap water/ice/SUB blank; strong name match only.
 */
(function (root) {
  'use strict';
  var VERSION = '4.8.35-r7';
  var CSS_ID = 'u4838-css';

  /* Renumber without calendar on Prepline page */
  var STEP = {
    load: 1, pax: 2, chef: 3, ingredients: 4, changes: 5,
    prepSummary: 6, kitchenClose: 7, filters: 8, moreViews: 9,
    export: 10, print: 11, requisitions: 12, foodCost: 13, howto: 14
  };

  function stepTitle(n, label) { return n + ' · ' + label; }

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      /* Kill any Prepline-page calendar wraps (4835 overview + 4821 stubs) */
      '#u4835CalWrap,',
      '.u4821-wrap[data-u4821="calendar"],',
      '.u4821-wrap[data-u4821="calendarSlot"],',
      '#u486Cal,',
      '#u4835Cal{display:none!important;height:0!important;margin:0!important;padding:0!important;border:none!important;overflow:hidden!important;}',
      /* Empty Pro spacer under One-time sort / Recipe database */
      '#proPanel:empty{display:none!important;margin:0!important;padding:0!important;border:none!important;min-height:0!important;height:0!important;}',
      'body.u480-sorted #proPanel:empty{display:none!important;}',
      /* Hide legacy week-calendar toolbar buttons on Prepline page */
      '#weekViewBtn,',
      'button[onclick="printA3Calendar4820()"],',
      'button[onclick="exportA3CalendarXlsx4820()"],',
      'button[onclick="exportA3CalendarPdf4820()"]{display:none!important;}'
    ].join('');
    document.head.appendChild(s);
  }

  function removePreplineCalendars() {
    [
      '#u4835CalWrap',
      '.u4821-wrap[data-u4821="calendar"]',
      '.u4821-wrap[data-u4821="calendarSlot"]',
      '#u4835Cal',
      '#u486Cal'
    ].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        try { el.setAttribute('hidden', ''); el.style.display = 'none'; } catch (e) {}
        try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e2) {}
      });
    });
    try { document.body.classList.remove('u4835-cal-overview'); } catch (e3) {}
    /* Neutralise 4835 calendar builder if it runs later */
    if (root.Prepline4835 && typeof root.Prepline4835.ensureOverviewCalendar === 'function') {
      root.Prepline4835.ensureOverviewCalendar = function () { /* moved to allocation */ };
    }
  }

  function setBarTitle(wrap, title) {
    if (!wrap) return;
    var h = wrap.querySelector('.u480-settings-bar h2') || wrap.querySelector('h2');
    if (h && h.textContent !== title) h.textContent = title;
  }

  function renumberSteps() {
    /* 4.8.35-r7: sequential numbering owned by upgrades-4840. */
    return;
  }

  function stampVersion() {
    try {
      var meta = document.querySelector('meta[name="prepline-version"]');
      if (meta && meta.getAttribute('content') !== VERSION) meta.setAttribute('content', VERSION);
      var badge = document.getElementById('appVersion');
      var label = 'Prepline v' + VERSION;
      if (badge && badge.textContent !== label) badge.textContent = label;
    } catch (e) {}
  }

  var _tickBusy = false;
  var _tickQueued = false;
  function tick() {
    if (_tickBusy) { _tickQueued = true; return; }
    _tickBusy = true;
    _tickQueued = false;
    try {
      ensureCss();
      removePreplineCalendars();
      renumberSteps();
      stampVersion();
    } catch (e) {
      try { console.warn('[u4838]', e); } catch (_) {}
    } finally {
      _tickBusy = false;
      if (_tickQueued) {
        _tickQueued = false;
        setTimeout(tick, 0);
      }
    }
  }

  function boot() {
    tick();
    /* Observe only coarse signals — never rewrite in a tight MO loop. */
    var obs = new MutationObserver(function () {
      if (_tickBusy) { _tickQueued = true; return; }
      setTimeout(tick, 50);
    });
    try {
      obs.observe(document.body || document.documentElement, {
        childList: true,
        subtree: false,
        attributes: true,
        attributeFilter: ['class']
      });
    } catch (e) {}
    setInterval(tick, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  root.Prepline4838 = { VERSION: VERSION, STEP: STEP, removePreplineCalendars: removePreplineCalendars };
})(typeof window !== 'undefined' ? window : globalThis);
