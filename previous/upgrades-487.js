/* Prepline 4.8.7 — Organised export fixes (trial). Autoprod.
 * 1) Section column always equals its tab (sectionForSheet after sheetForItem).
 * 2) Total needed (col E) was formula+cache in 4.8.7; 4.8.10 writes plain qty×pax numbers.
 */
(function (root) {
  'use strict';
  root.Prepline487 = {
    VERSION: '4.8.23',
    FIX: 'organised-export-section-equals-tab+total-needed-cached'
  };
})(typeof window !== 'undefined' ? window : globalThis);
