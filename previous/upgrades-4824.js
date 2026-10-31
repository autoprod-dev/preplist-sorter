/* Prepline 4.8.24 — trial only.
 * Prawns prep 1 day before event (Paula orders day-before for freshness);
 * not Mon/Sat early-batched. Fish/seafood stay 2; crab croquettes stay 4.
 * Vocab key `prawn`, lead/batchWindow=1, batchable=false.
 */
(function (root) {
  'use strict';
  var VERSION = '4.8.24';
  function syncVersion() {
    try {
      if (root.Prepline477) root.Prepline477.VERSION = VERSION;
      if (root.Prepline488) root.Prepline488.VERSION = VERSION;
      if (root.Prepline489) root.Prepline489.VERSION = VERSION;
      if (root.Prepline4820) root.Prepline4820.VERSION = VERSION;
      if (root.Prepline4821) root.Prepline4821.VERSION = VERSION;
      if (root.Prepline4822) root.Prepline4822.VERSION = VERSION;
      if (root.Prepline4823) root.Prepline4823.VERSION = VERSION;
      var meta = document.querySelector('meta[name="prepline-version"]');
      if (meta) meta.setAttribute('content', VERSION + '-trial');
      var badge = document.getElementById('appVersion');
      if (badge && /Prepline v/.test(badge.textContent || '')) {
        badge.textContent = 'Prepline v' + VERSION;
      }
    } catch (e) {}
  }
  root.Prepline4824 = {
    VERSION: VERSION,
    syncVersion: syncVersion
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncVersion);
  else syncVersion();
  setTimeout(syncVersion, 0);
  setTimeout(syncVersion, 200);
})(typeof window !== 'undefined' ? window : this);
