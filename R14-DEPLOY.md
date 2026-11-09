# 4.8.35-r14 — Session-only uploads (recipe database removed) + new workspace UI + loading logo

## 1. Recipe database removed / uploads never stored
- Recipe database mode (toggle, weekly generator, manage/backup/import/clear) removed; the tool is always one-time sort.
- Nothing parsed from an upload is written to browser storage: auto-saved sort (rows + original page images),
  purchase orders, PO links, change-check snapshot, recipe/yield library, per-list staff/notes/order/tick-off/undo,
  and on the Work order page the uploaded work order, bespoke sheets and calendar events.
- `session-only.js` (first script on both pages) keeps those keys in memory for the tab and clears anything
  older builds stored (incl. upload data inside Pro kitchen profiles and any prepline/recipe IndexedDB).
- Settings stay (venue rules, print/chef-hours prefs, ingredient allergen/supplier/price info, section map, history).

## 2. UI
- `ui-r14.js` (screen-only CSS): sticky top bar with Prepline mark + quick actions (Upload, Jump to step,
  Original PTs print, PTs + Ref # print, Excel, Top, "Session only" badge), white card layout, consistent
  buttons with hover/active/focus states, softer background, mobile: scrollable single-row tabs/actions.
- Print output is pixel-identical to r13 (compared page.pdf renders).
- Steps now numbered in on-screen order (upgrades-4840 still single owner). Requisitions was showing as 10 between 5 and 6.

## 3. Loading logo
- Inline overlay (Prepline logo, animated ticks) shown on page load, PDF/xlsx upload + sort, Sort now / Sort extract,
  prints (Original PTs, Ref #, views) and exports. Yields immediately to any choice dialog (Spreadsheet ready, editors).

## Tests
- `tests/e2e-r14-verify.mjs` 69/69 at 1366 and 390 (all r11–r13 Ref # rules + prints + r14 checks)
- `tests/r14/sw-upgrade.mjs` 9/9 (cached r13 → r14, returning SW cache, offline) at 1366 + 390
- `tests/r14/xlsx-paste-sample.mjs` 8/8, `tests/r14/alloc-session.mjs` 5/5, `test-4840-stepowner` 23/23, `test-ref-fill-r6` 80/80
