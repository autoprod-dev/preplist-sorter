/* Prepline 4.7.8 — Organised export auto A–Z sort on download (trial). Autoprod.
 * Paula layout (4.7.7) unchanged: 5 section tabs, yellow headers, Total =Bn*Dn, AutoFilter.
 * Sort within each tab: dish/Source tab A–Z → prep day chrono → event/function date chrono → item A–Z.
 * No extra dialog; exportOrganisedXlsx already produces this on click.
 */
(function (root) {
  'use strict';
  root.Prepline478 = {
    VERSION: '4.7.8',
    SORT: ['dish/sourceTab A-Z', 'prepDay chrono', 'eventDate chrono', 'item A-Z']
  };
})(typeof window !== 'undefined' ? window : globalThis);
