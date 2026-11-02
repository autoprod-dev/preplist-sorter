/* Prepline 4.8.2 — Organised export rules from Paula Sorted samples (trial). Autoprod.
 * Learns from WE 15.11.26 + WE 08.11.26 + WE 01.11.26 For Sorter → Sorted pairs:
 *   flat 5-tab template (Sauce → Vegetables → Garnishes → Starch → Proteins),
 *   yellow headers, Total =Bn*Dn, blank BAT/PO #, prep day "1 Monday", blank STAFF ALLOCATED.
 * sheetForItem heuristics refined in upgrades-477.js (butter-poached → Veg, parmesan → Sauce,
 * seafood croquettes → Proteins else Starch, polenta/fregola/ravioli → Starch, crisps → Garnish).
 * Week B grouped-by-dish Sorted layout is NOT replicated (documented inconsistency).
 * Week A "Big Jobs" starch tab kept as "Starch" (WE15 name).
 */
(function (root) {
  'use strict';
  root.Prepline482 = {
    VERSION: '4.8.2',
    RULES: {
      tabs: [
        'Sauce, Purees and Gels',
        'Vegetables',
        'Garnishes, Herbs, Powders, Oils',
        'Starch',
        'Proteins'
      ],
      sort: ['dish/sourceTab A-Z', 'prepDay chrono', 'eventDate chrono', 'item A-Z'],
      batBlank: true,
      totalFormula: '=Bn*Dn',
      staffAllergenSuggestions: false,
      samples: ['WE-15.11.26', 'WE-08.11.26', 'WE-01.11.26']
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
