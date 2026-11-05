# 4.8.35-r13 — Synonyms, PT supplier, fresh warn/log, More views removed

## Ref # (kept + extended from r12)
1. Match similar names FIRST (plurals, short–long, synonym list), then date-filter.
2. Synonyms: oyster/oysters/pambula oyster, prawn/shrimp, coriander/cilantro, eggplant/aubergine, courgette/zucchini, rocket/arugula, …
3. Prefer supplier shown on PT (Ingredients panel or `Name - Supplier` tail).
4. Fresh/perishable must-try within 0–4 (prefer 3 then 4); fish/micro 0–2; HENG 0–1; dry STRICT 3|4; tap/ice/SUB blank.
5. SKIPPED: no-double-claim.
6. Warn when fresh has no match in 0–4 days (`warn` + UI chip).
7. Log each fill: item → PO → supplier → delivery → days-before (`[Prepline Ref#]` + `poFillLog`).

## UI
- **More views** feature/step removed entirely; Export / Print / Team remain; Print Options kept.
- Steps renumbered contiguous 1..N via upgrades-4840 catalog (moreViews entry dropped).

## Tests
- Unit: 80/80 (`tests/test-ref-fill-r6.mjs`)
- E2E: 37/37 (`tests/e2e-r11-verify.mjs`) — More views gone; Ref# filledCount 4

## Deploy
- Main → https://autoprod-dev.github.io/preplist-sorter/ (VERSION 4.8.35-r13)
- Trial → https://autoprod-dev.github.io/prepline-trial-preview/ (~4.8.47)
- Standalone → `/workspace/share/prepline-standalone/Prepline-Main-4.8.35-r13.html`
