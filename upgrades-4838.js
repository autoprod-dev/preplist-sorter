/* Prepline 4.8.38 — SAFE UI polish on top of 4.8.35 layout.
 * - Calendar grid removed from Preplist page (lives under Work order, allocation & calendar grid).
 * - Step numbers unique; Load a preplist = Step 1; Show/Hide default hidden.
 * - Empty #proPanel spacer stays hidden; single title + single toggle per step.
 */
(function (root) {
  'use strict';
  var VERSION = '4.8.35';
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
    if (h) h.textContent = title;
  }

  function renumberSteps() {
    var map = [
      ['.u4821-wrap[data-u4821="changes"]', STEP.changes, 'Changes check'],
      ['.u4821-wrap[data-u4821="prepSummary"]', STEP.prepSummary, 'Prep summary (all dishes/pax/covers)'],
      ['.u4821-wrap[data-u4821="kitchenClose"]', STEP.kitchenClose, 'Kitchen close & public holidays'],
      ['#u4835Filters', STEP.filters, 'Preplist filters'],
      ['.u4827-wrap[data-u4827="moreViews"],.u4821-wrap[data-u4821="moreViews"]', STEP.moreViews, 'More views'],
      ['.u4821-wrap[data-u4821="export"]', STEP.export, 'Export options'],
      ['.u4821-wrap[data-u4821="print"]', STEP.print, 'Print options'],
      ['.u4827-wrap[data-u4827="requisitions"]', STEP.requisitions, 'Requisitions (purchase orders)'],
      ['.u4827-wrap[data-u4827="foodCost"]', STEP.foodCost, 'Food cost'],
      ['#u4827HowtoWrap', STEP.howto, 'How Prepline sorts & schedules']
    ];
    map.forEach(function (row) {
      var el = document.querySelector(row[0]);
      if (el) setBarTitle(el, stepTitle(row[1], row[2]));
    });
    /* Native bars from 4835 */
    var loadBar = document.querySelector('#u4835LoadBar h2');
    if (loadBar) loadBar.textContent = stepTitle(STEP.load, 'Load a preplist');
    var pax = document.querySelector('#paxPanelWrap .u480-settings-bar h2');
    if (pax) pax.textContent = stepTitle(STEP.pax, 'Pax per dish');
    var chef = document.querySelector('#staffingPanelWrap .u480-settings-bar h2');
    if (chef) chef.textContent = stepTitle(STEP.chef, 'Chef-hours settings');
    var ing = document.querySelector('#ingPanelWrap .u480-settings-bar h2');
    if (ing) ing.textContent = stepTitle(STEP.ingredients, 'Ingredients: allergens, suppliers and prices');
  }


  function stampVersion() {
    try {
      var meta = document.querySelector('meta[name="prepline-version"]');
      if (meta) meta.setAttribute('content', VERSION);
      var badge = document.getElementById('appVersion');
      if (badge) badge.textContent = 'Prepline v' + VERSION;
    } catch (e) {}
  }
  function tick() {
    ensureCss();
    removePreplineCalendars();
    renumberSteps();
    stampVersion();
  }

  function boot() {
    tick();
    var obs = new MutationObserver(function () { tick(); });
    try { obs.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
    setInterval(tick, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  root.Prepline4838 = { VERSION: VERSION, STEP: STEP, removePreplineCalendars: removePreplineCalendars };
})(typeof window !== 'undefined' ? window : globalThis);
