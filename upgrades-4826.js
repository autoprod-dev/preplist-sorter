/* Prepline 4.8.26 — trial only.
 * Long-life mise expands to soils + gels (dressings, any croutons, powders, crumbs, oils).
 * ANY puree = 2 days before event only (no long-life / earlier week pack).
 * Poultry lead=3 (overrides 4-day protein). Cheese=3. Dressings & butters stay 4.
 */
(function (root) {
  'use strict';
  var VERSION = '4.8.26';
  function syncVersion() {
    try {
      if (root.Prepline477) root.Prepline477.VERSION = VERSION;
      if (root.Prepline488) root.Prepline488.VERSION = VERSION;
      if (root.Prepline489) root.Prepline489.VERSION = VERSION;
      if (root.Prepline4820) root.Prepline4820.VERSION = VERSION;
      if (root.Prepline4821) root.Prepline4821.VERSION = VERSION;
      if (root.Prepline4822) root.Prepline4822.VERSION = VERSION;
      if (root.Prepline4823) root.Prepline4823.VERSION = VERSION;
      if (root.Prepline4824) root.Prepline4824.VERSION = VERSION;
      if (root.Prepline4825) root.Prepline4825.VERSION = VERSION;
      var meta = document.querySelector('meta[name="prepline-version"]');
      if (meta) meta.setAttribute('content', VERSION + '-trial');
      var badge = document.getElementById('appVersion');
      if (badge && /Prepline v/.test(badge.textContent || '')) {
        badge.textContent = 'Prepline v' + VERSION;
      }
    } catch (e) {}
  }
  root.Prepline4826 = { VERSION: VERSION, syncVersion: syncVersion };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncVersion);
  else syncVersion();
  setTimeout(syncVersion, 0);
  setTimeout(syncVersion, 200);
})(typeof window !== 'undefined' ? window : this);
