# 4.8.35-r12 — Oyster/seafood + perishable Ref#

## Cause (Oyster Pambula miss)
RQ00049541 Get Fish delivery 10/11/2026 had "Oyster Pambula, open" but Ref# stayed blank.
Keyword match scored ~0.85, but `poIsFishExempt` excluded shellfish and Get Fish was not treated as a fish supplier → day-0 fell outside ordinary STRICT 3|4 → `nodelivery`.

## Fix
1. **Keyword-first**: stronger plurals/short-long (`oyster`/`oysters`, tomato/tomatoes); `PO_FILL_MIN` 0.45.
2. **Fish/seafood**: oysters/shellfish + Get Fish / seafood suppliers → 0–2 days (same as microherbs).
3. **Perishable (veg/fruit/herbs/dairy/meat/…)**: try hard within 0–4 days; still prefer day 3 then 4 when present.
4. Unchanged: dry goods STRICT 3|4; HENG 0–1; tap/ice/SUB blank.

## Tests
- Unit: 70/70 (`tests/test-ref-fill-r6.mjs`)
- E2E: 35/35 (`tests/e2e-r11-verify.mjs`); Ref# filledCount 3→4

## Deploy
- Main: public/master → https://autoprod-dev.github.io/preplist-sorter/
- Trial: mirror + bump ~4.8.46
- Standalone: rebuild Prepline-Main-4.8.35-r12.html
