/* Prepline 4.8.35-r14 — uploads are session-only.
 * Uploaded preplists, production tools, purchase orders and anything parsed from
 * them are used on demand for this tab only. Nothing from an upload is written to
 * this browser's storage, and anything older versions stored (recipe database,
 * auto-saved sorts, saved POs/links, change-check snapshots, recipe library) is
 * cleared on load.
 *
 * Keys listed below are redirected to an in-memory map, so every feature that
 * reads them within the session still works; a reload starts clean.
 * Settings (venue rules, print prefs, chef-hours, team names, etc.) are untouched.
 */
(function (root) {
  'use strict';
  if (root.__preplineSessionOnly) return;
  root.__preplineSessionOnly = true;

  var EXACT = {
    'preplistDishDatabase_v1': 1,      /* recipe database (removed feature) */
    'preplistOnetimeSession_v1': 1,    /* auto-saved sort incl. original page images */
    'prepline.pos.v1': 1,              /* parsed purchase orders */
    'prepline.poLinks.v1': 1,          /* manual ingredient → PO line links */
    'prepline.wo.snapshot.v1': 1,      /* change-check snapshot of uploaded rows */
    'prepline.wo.snapshot.v1.lastDiff': 1,
    'prepline.recipes.v1': 1,          /* recipe & yield library (removed) */
    /* per-list working state keyed by the uploaded dishes/tasks — meaningless once
     * the upload is gone, and some of it (auto staff allocation) is written automatically */
    'prepline.organised.staff.v1': 1,
    'prepline.organised.notes.v1': 1,
    'prepline.organised.order.v1': 1,
    'prepline.organised.bulkSel.v1': 1,
    'prepline.tickoff.v1': 1,
    'prepline.undo.v1': 1,
    'prepline.autoAlloc.done.v1': 1,
    /* Work order / allocation page: uploaded work order, bespoke sheets and the
     * calendar events merged from uploads */
    'prepline.alloc.v2': 1,
    'prepline.alloc.bespoke.v1': 1,
    'prepline.alloc.calEvents.v1': 1
  };
  function isSessionKey(k) {
    k = String(k);
    return !!EXACT[k];
  }
  var mem = Object.create(null);
  var S = root.Storage && root.Storage.prototype;
  var ls = null;
  try { ls = root.localStorage; } catch (e) { ls = null; }
  /* Unpatched originals — purge() must see the real storage, not the session map. */
  var RAW = S ? { get: S.getItem, set: S.setItem, rem: S.removeItem } : null;

  /* One pass: remove everything previously persisted from uploads. Kitchen
   * profile snapshots (Pro) embedded the database + session too — strip those. */
  function purge() {
    var removed = [];
    if (!ls || !S) return removed;
    try {
      Object.keys(EXACT).forEach(function (k) {
        if (RAW.get.call(ls, k) !== null) { RAW.rem.call(ls, k); removed.push(k); }
      });
      for (var i = ls.length - 1; i >= 0; i--) {
        var key = ls.key(i);
        if (!key || key.indexOf('prepPro_profile_') !== 0) continue;
        try {
          var snap = JSON.parse(RAW.get.call(ls, key) || 'null');
          if (snap && typeof snap === 'object') {
            var hit = false;
            Object.keys(EXACT).forEach(function (k) { if (k in snap) { delete snap[k]; hit = true; } });
            if (hit) { RAW.set.call(ls, key, JSON.stringify(snap)); removed.push(key + ' (uploads stripped)'); }
          }
        } catch (e) {}
      }
    } catch (e) {}
    return removed;
  }

  if (S && ls) {
    var _get = RAW.get, _set = RAW.set, _rem = RAW.rem;
    S.getItem = function (k) {
      if (this === ls && isSessionKey(k)) return (k in mem) ? mem[k] : null;
      return _get.apply(this, arguments);
    };
    S.setItem = function (k, v) {
      if (this === ls && isSessionKey(k)) { mem[String(k)] = String(v); return; }
      return _set.apply(this, arguments);
    };
    S.removeItem = function (k) {
      if (this === ls && isSessionKey(k)) { delete mem[String(k)]; }
      return _rem.apply(this, arguments);
    };
  }

  var removed = purge();
  /* Old IndexedDB stores from earlier builds / editors that may hold file data. */
  try {
    if (root.indexedDB && typeof root.indexedDB.databases === 'function') {
      root.indexedDB.databases().then(function (list) {
        (list || []).forEach(function (d) {
          if (d && d.name && /prepline|preplist|recipe|upload/i.test(d.name)) {
            try { root.indexedDB.deleteDatabase(d.name); removed.push('idb:' + d.name); } catch (e) {}
          }
        });
      }).catch(function () {});
    }
  } catch (e) {}

  root.PreplineSessionOnly = {
    isSessionKey: isSessionKey,
    removed: removed,
    keys: Object.keys(EXACT)
  };
})(typeof window !== 'undefined' ? window : globalThis);
