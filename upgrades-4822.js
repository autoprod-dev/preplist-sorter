/* Prepline 4.8.23 — trial only.
 * A) Ref# PO window 0–3 days + multi-delivery "Supplier DD/MM/YYYY; …" (core in index.html).
 * B) Every collapsible settings bar toggles both ways: Show ↔ Hide.
 *    Root cause: u480 CSS hid .u480-settings-bar once expanded, so Pax (2) /
 *    Chef-hours (3) / Ingredients had no Hide. Keep the bar visible; flip label.
 *    Also give Load chrome (1) a Hide when expanded.
 */
(function (root) {
  'use strict';

  var VERSION = '4.8.23';
  var CSS_ID = 'u4822-css';

  function bustPoCache() {
    try {
      if (typeof poMatchCache !== 'undefined') poMatchCache = null;
      root.poMatchCache = null;
    } catch (e) {}
  }

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      /* Keep Show/Hide bar visible whether collapsed or open (sections 2, 3, Ingredients, 4–9) */
      'body.u480-sorted #paxPanelWrap > .u480-settings-bar,',
      'body.u480-sorted #staffingPanelWrap > .u480-settings-bar,',
      'body.u480-sorted #ingPanelWrap > .u480-settings-bar,',
      'body.u480-sorted .u4821-wrap > .u480-settings-bar {',
      '  display:flex!important; justify-content:space-between; align-items:center; gap:8px; margin:0 0 8px;',
      '}',
      /* Load chrome (1): keep a summary/hide row visible when expanded */
      'body.u480-sorted #dbPanel.u480-open .u480-load-summary {',
      '  display:flex!important; margin-bottom:8px;',
      '}',
      'body.u480-sorted #dbPanel.u480-open .u480-load-summary .u480-load-hint { display:none; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /** Wire a wrap's settings-bar button as a true Show/Hide toggle. */
  function wireShowHide(wrap, btn) {
    /* 4.8.35-r7: Show/Hide owned by upgrades-4840. Do not clone or bind. */
    return;
  }

  function upgradeSettingsBars() {
    ensureCss();
    ['paxPanelWrap', 'staffingPanelWrap', 'ingPanelWrap'].forEach(function (id) {
      var wrap = document.getElementById(id);
      if (!wrap) return;
      var btn = wrap.querySelector('.u480-settings-bar button');
      if (btn) wireShowHide(wrap, btn);
    });
    // 4–9 wraps from 4821 + feature wraps from 4827/4828
    document.querySelectorAll('.u4821-wrap, .u4827-wrap').forEach(function (wrap) {
      var btn = wrap.querySelector('.u480-settings-bar button.u4821-toggle, .u480-settings-bar button.u4827-toggle, .u480-settings-bar button');
      if (btn) wireShowHide(wrap, btn);
    });
  }

  /** Section 1 — Load a preplist: Show load / paste ↔ Hide load */
  function upgradeLoadChrome() {
    /* 4.8.35-r7: Load Show/Hide owned by 4840. */
    ensureCss();
    return;
  }

  function syncLoadLabel(panel, btn) {
    if (!panel || !btn) return;
    var open = panel.classList.contains('u480-open');
    btn.textContent = open ? 'Hide load' : 'Show load / paste';
  }

  function applyAll() {
    try {
      ensureCss();
      upgradeSettingsBars();
      upgradeLoadChrome();
      bustPoCache();
    } catch (e) {
      try { console.warn('[u4822]', e); } catch (_) {}
    }
  }

  function patchRender() {
    if (typeof root.render !== 'function' || root.render.__u4822) return;
    var orig = root.render;
    function wrapped() {
      var r = orig.apply(this, arguments);
      setTimeout(applyAll, 0);
      return r;
    }
    wrapped.__u4822 = true;
    if (orig.__u480) wrapped.__u480 = true;
    if (orig.__u486cal) wrapped.__u486cal = true;
    if (orig.__u4821) wrapped.__u4821 = true;
    try { render = wrapped; } catch (e) {}
    root.render = wrapped;
  }

  // Also patch Prepline480.ensureSettingsBar so new bars start as toggles
  function patch480() {
    var P = root.Prepline480;
    if (!P || P.__u4822Patched) return;
    P.__u4822Patched = true;
    var origExpand = P.expandSettings;
    if (typeof origExpand === 'function') {
      P.expandSettings = function () {
        /* 4.8.35-r7: do not force sections open — 4840 defaults hidden. */
      };
    }
  }

  function boot() {
    ensureCss();
    patch480();
    patchRender();
    applyAll();
  }

  root.Prepline4822 = {
    VERSION: VERSION,
    WINDOW_DAYS: 3,
    bustPoCache: bustPoCache,
    applyToggles: applyAll
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 0);
  setTimeout(boot, 50);
  setTimeout(boot, 250);
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
})(typeof window !== 'undefined' ? window : this);
