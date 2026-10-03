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

## 3.2.2 (2026-10-03) pax rescaling fix
- Changing a dish's pax now rescales every quantity and kg for that dish straight away, while typing (not only on leaving the box), in By dish, By team section and By prep day, including combined totals across dishes, every print handout (dish, section, day, "one page complete") and all three "Export to Excel (editable)" files.
- Root causes: (1) PDF rows stored the printed batch total as a fixed number and ignored pax, with no record of the yield it was printed for; (2) the pax boxes only reacted on change (blur/Enter); (3) render() never saved, so a pax edit was lost on reload unless something else saved.
- PDF dishes scale from the front-page Yield (printed total × pax ÷ yield), kept per row as `pdfBasePax` through reload, append, templates and the recipe database. Lists saved before 3.2.2 get the yield back from their saved pax. A PDF with no readable Yield keeps its printed totals and says so.
- Pax input: blank = not set (spreadsheet: "set pax"; PDF: printed total), 0 gives 0, decimals allowed, up to 1,000,000; anything else is refused and the box turns red. kg/L rollover unchanged (900 g × 1.5 = 1.35 kg). Editing pax in the list also updates this week's Recipe database pick, and the weekly pax box is live once generated.
- Excel: PDF totals become a formula (printed × PAX ÷ yield), like spreadsheet totals (Qty × PAX).
- Tests: pax checks for each view, prints, exports (openpyxl), reload, PDF, append, templates, recipe database, edge cases and phone; new samples `pax-scaling.xlsx`, `no-yield.pdf`.

## 3.2.3 (2026-10-03) per-pax in Excel and in the app
- All three "Export to Excel (editable)" files use one layout, with every task row carrying its own per-pax and PAX cells:
  `Item | Quantity per pax | Unit | PAX (this row) | Total needed | Section | Prep day | Source tab`.
  Each dish block keeps its PAX row (B = the dish's pax). On every task row, PAX (this row) is `=$B$<PAX row>` and Total needed is `=B<row>*D<row>`: cell references only. Editing a dish's PAX updates all its rows (in the combined By section / By day tabs too, since each dish has its own block); editing one row's per-pax, or typing over its PAX (this row), recalculates just that row. A dish with no pax yet gets a blank PAX cell and guarded formulas that stay blank.
- Units: one Unit column per row, shared by the per-pax amount and the total, so the formula is a plain multiply with no conversion. Spreadsheet rows keep the unit they were imported in (0.18 kg per pax → total in kg). PDF rows are written in g or ml (2.5 kg for 60 pax → 41.67 g per pax, total 2500 g); counts keep their own unit (bunch, each).
- PDF per-pax = printed total ÷ Yield. A PDF with no Yield line: Quantity per pax and PAX are blank and the printed total is a plain value (nothing to scale from).
- App: the Per pax column (screen, prints, copy as text) shows PDF per-pax too, e.g. 41.7 g, 15 ml, 3.33 g (3 significant figures below 10, 1 decimal from 10; kg/L from 1000). No Yield: "—".
- Totals keep full precision internally (only float noise removed), so the app and a recalculated Excel file agree exactly; display rounding is unchanged.
- Re-upload: the importer reads the wider layout (Source tab is now 7 columns right of Item), and a re-uploaded PDF export keeps its totals (per-pax × PAX).
- Tests: formulas checked with openpyxl and recalculated with LibreOffice headless (Python evaluator fallback), before and after editing PAX, a per-pax cell and one row's PAX; spreadsheet, PDF, PDF with no Yield, append and template lists.

## 3.2.4 (2026-10-03) "Include method in printout"
- New Yes/No toggle, "Include method in printout", in the print-button row (next to "Print all sections / prep days (one page complete)"). That row sits above the list in all three views (By dish, By team section, By prep day), so it's one shared control, visible from every view, right above each dish/section/day Print button.
- No: the captured Method screen captures ("Method reference" crops) are left out of every printout: dish sheets, section handouts, prep-day handouts and both "one page complete" prints. The heading and the extra print page go too, so the sheet ends after the table. As a safety net, every printout also has any method/page image block or other image removed before printing.
- Default Yes. The choice is remembered on this device under its own key, `preplinePref_printIncludeMethod_v1` (not in the session, database, template or Pro kitchen data).
- Unchanged: the on-screen 📖 View original button and its viewer (including the viewer's own Print button, which prints the original pages on request).
- Tests: default Yes, No for each print type (no images, no heading, no blank method page), reload with No and Yes, phone 390 px.
