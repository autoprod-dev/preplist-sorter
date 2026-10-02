# Prepline changelog

Version scheme: MAJOR.MINOR.PATCH. A new baseline from Gerard = new major.
- v1: original "Preplist Sorter" baseline (commit 0820477).
- v2: PDF qty/name split fix, offline build, reload fix (master); Pro + Lemon Squeezy test mode (branch `pro`).

## 3.0.0 (2026-10-02)
- New baseline: `originals/kitchen-organiser-2026-10-02-from-gerard.html` (sha256 in `originals/SHA256SUMS`), kept byte-for-byte untouched.
- Adds: method crops from production-tool PDF pages under each prep list, "View original" page viewer, per-view Excel export (editable, re-uploadable), closed-days auto-shift, bulk move ticked rows, tick/untick dishes, iframe printing.

## 3.0.0 build (branch v3)
- index.html built from the original: Prepline branding, Pro / Lemon Squeezy licence layer (test mode `ls-test`, from branch `pro`), blank-page reload fix (dc0f059), version string.
- v2 free limits (one PDF per sort, "Made with Prepline" print footer) kept as switches in `LICENSE_CONFIG.freeLimits`, OFF.

## 3.1.0 (2026-10-02) Gerard's tweaks
- Print buttons: "Print all sections (one page complete)", "Print all prep days (one page complete)".
- Each view's own button reads "📊 Export to Excel (editable)".
- Excel exports use the imported workbook's tab names (By dish); stricter Excel-safe tab names.
- Tests: `tests/v3/test_v3.py` (headless Chromium), samples in `tests/v3/samples/`.

## 3.2.0 (2026-10-03) Gerard's answers
- (a) No screenshot/image OCR or AI. PDF method capture unchanged.
- (b) Every parsed row stores its original source name (`srcSheet`): the workbook tab name exactly, a PDF recipe's title exactly as printed, or "Pasted list". Survives reload, append PDF, templates and the recipe database. By dish export names tabs from it for spreadsheets and PDFs alike, in the source order.
- (c) Every export has a "Source tab" column with the exact original name; re-uploading an export reads it back, so names survive a round trip even when Excel forced a change.
- Tab names change only where Excel forces it (\ / ? * [ ] :, apostrophe at either end, 31 chars, "History", blank, case-only duplicates); each change is listed in the export message.
- (d) Free limits stay off.
- (e) Re-applied from v2: PDF quantity+name split (with skipped-row warning); "butternut" no longer a sauce; kg/L display with litres never shown as kg; one raw vs cooked story (PDF quantities are front-page COOKED/finished weights, matching the printed banner).
- Reload: PDF rows' fixed batch totals now survive a reload (before, they showed "set pax").
- Tests: 99 checks in `tests/v3/test_v3.py`; new samples `awkward-tabs.xlsx`, `fixes-and-titles.pdf`.

## 3.2.1 (2026-10-03) sorting fix
- The six built-in sections have no pastry or starch station, so desserts/pastry (meringue, pavlova, tarts, sponge, mousse, ice cream, sorbet, panna cotta...) and rice/grain/starch prep (rice, risotto, arancini, couscous, quinoa, barley, pasta, gnocchi, noodles, bread, dough...) now go to Big Jobs, which already held polenta, mash and rosti. Savoury items (chicken liver parfait, salmon mousse, beef tartare, beef wellington pastry) stay Proteins; "rice wine/vinegar" stay sauces. A Pro custom station (e.g. Pastry) still wins.
- Whole-word matching fixes: cauliflower (was Garnishes via "flower"), trumpet mushroom (was Proteins via "rump"), gelato and "adjust" (were Sauces via "gel"/"jus"), pavlova (was caught by the pave prep-day rule), swiss chard / charcuterie (were cook-day via "char").
- Brussels sprouts, green beans, sweet corn → Vegetables; vinegar, mirin, caramel, horseradish → Sauces.
- Tests: classifier table + end-to-end checks.
