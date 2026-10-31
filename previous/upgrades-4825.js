/* Prepline 4.8.25 — trial only.
 * Gerard veg: soft=2 / hard=4 named lists (method-specific warrigal & fennel);
 * micro herbs=1 day, not early-batched. Unlisted veg keep vegraw/vegcook fallback.
 */
(function (root) {
  'use strict';
  var VERSION = '4.8.25';
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
      var meta = document.querySelector('meta[name="prepline-version"]');
      if (meta) meta.setAttribute('content', VERSION + '-trial');
      var badge = document.getElementById('appVersion');
      if (badge && /Prepline v/.test(badge.textContent || '')) {
        badge.textContent = 'Prepline v' + VERSION;
      }
    } catch (e) {}
  }
  root.Prepline4825 = { VERSION: VERSION, syncVersion: syncVersion };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncVersion);
  else syncVersion();
  setTimeout(syncVersion, 0);
  setTimeout(syncVersion, 200);
})(typeof window !== 'undefined' ? window : this);
