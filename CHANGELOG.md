# Prepline changelog

Version scheme: MAJOR.MINOR.PATCH. A new baseline from Gerard = new major.
- v1: original "Preplist Sorter" baseline (commit 0820477).
- v2: PDF qty/name split fix, offline build, reload fix (master); Pro + Lemon Squeezy test mode (branch `pro`).

## 3.5.0 (2026-10-08) Prepline Pro live release (branch pro-live-3.5.0, NOT published yet)
- LICENSE_CONFIG `mode: 'live'`: Pro switched on for real money. No TEST MODE badge; TEST- keys and Lemon Squeezy test-mode keys are refused.
- Live store 485739; product/variant ids and checkout links are `TODO_LIVE_*` placeholders until the live-mode products exist (`release/fill_live_ids.py` fills them, `release/check_live_ready.py` blocks publishing while any are left). Lifetime checkout keeps LAUNCH50 prefilled.
- `supportEmail: autoprod.help@gmail.com` (SUPPORT_EMAIL now reads it), `offlineDownloadUrl: https://app.lemonsqueezy.com/my-orders`, `legal` links.
- Terms, Privacy and Refunds pages (seller Autoprod, contact autoprod.help@gmail.com, NSW law, effective 8 Oct 2026; no ABN line) linked from the footer and the Upgrade panel/dialog when Pro is on. Public and team builds (build_public.py) are unchanged.
- Live-mode wording for a not-yet-configured checkout/download (no "TEST MODE" text in live).
- Fixes (branch pro-live-3.5.0-fixes only): original-page viewer styled as a modal overlay (from test 3.4.2; on live 3.4.0 the hidden viewer showed at the bottom of the page); "Apply to all" pax: a bad value is marked on the box and the warning is replaced by "Pax N applied to every dish." once a valid value is applied (it used to stay on screen).
- Offline Windows Pro zip rebuilt from the live source (`release/build_pro_zip.py`), staged for Lemon Squeezy, never in the public site.
- Visitor counter, LIVE public site only (ships with 3.5.0, never separately): GoatCounter, site code in `release/goatcounter.json` (`autoprod-prepline`, endpoint https://autoprod-prepline.goatcounter.com/count). Standard count.js snippet with the defaults (path, referrer, title, screen width; no cookies) and `allow_local: false` (localhost, private networks and file:// are never counted). count.js is a pinned, unmodified copy of gc.zgo.at/count.js (ISC) served from the site at `vendor/goatcounter/count.js`. Added by `release/add_goatcounter.py` from `release/assemble_publish.sh`, so the source index.html, the test site, the team edition and both offline zips never contain it; `release/check_live_ready.py` requires it in the live set and checks it is absent from the zips (and from any `--absent` build). Privacy page: new GoatCounter paragraph (section 5), short version and section 6 updated; the in-app privacy list only mentions it when the snippet is on the page. Visit `#toggle-goatcounter` once on a device to stop counting your own visits there.
- Welcome box approximate location (same as live 3.4.1 / test 3.4.3): the sign-up also sends tz/lang/loc worked out on the device from the browser's time zone + language (built-in tzdata zone -> country table, language-region then "Unknown" fallback). No new field, no IP, no IP lookup, no geolocation. Under-form note, in-app privacy and Privacy page (legal/prepline-live/privacy.md) say so. Apps Script v6 stores Approx location + Time zone. Tests: tests/v3/test_v341_geo.py.

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

## 3.4.0 (2026-10-06) First-visit welcome box (name + position)
- Asks once per device for Name and Position before using the app (live and test sites only; never on file:// copies, the team site, the shared phone view or in print). ALLOW_SKIP flag (default false).
- Saved to the private "Prepline sign-ups" Google Sheet via an Apps Script web app: Name, Position, Date tried only. Queued in localStorage and retried once per load (max 5); the app never waits for the network.
- Privacy page and in-app privacy text updated. New tests: tests/v3/test_v340.py; tests/v3/signup_off/ lets older suites run with the box done.

## 3.3.5 (2026-10-05) Team edition fits 320px phones (TEST site only, not live/team)
- The Kitchen tools grid (Saved templates, Custom stations, Kitchens; shown only in the team edition / Pro) had a 280px minimum column and pushed 320px phones 8px wider. Columns now shrink to the screen (minmax(min(280px,100%),1fr)).
- Found when releasing 3.3.4: live passed, team failed test_v334 at 320px and was rolled back to 3.3.3.

## 3.3.4 (2026-10-05) Phone fixes from the mobile check (TEST site only, not live)
- 320px phones (iPhone SE, Galaxy S9+): view switcher wraps; summary table scrolls inside its box. No more sideways page scroll or zoomed-out page (this also hid the survey prompt's "No thanks" button).
- Bigger tap targets on touch screens: row checkboxes 24px, checkbox labels and buttons/inputs/selects 32px tall, footer links padded.
- Dates use the local day, not UTC: Excel and order-sheet file names, share payload date and survey prompt mark (before 11 am Sydney they showed yesterday).
- New test: tests/v3/test_v334.py.

## 3.3.3 (2026-10-04) Colleague trial: print fixes, Report a problem, privacy page
- Print: Dishes / Used in column 11px (about 8.3pt, was 6.5px); prep-day handouts give Section and Lead more room (small-print 10.4px) so rows no longer wrap to 3 lines; white page background in print (no beige band under a short last page); Method captures print full width, with the blank margin around each capture trimmed when it is captured (any problem keeps the full capture).
- Dates are dd/mm/yyyy everywhere (loaded stamp, order sheet "printed", Excel "Generated", shared view, templates), whatever the browser language.
- "Report a problem" button next to Feedback / Email us (and in the footer): what went wrong (required), what you were doing (optional); adds app version, view, browser and OS, screen size, edition (web/team/offline) and date. Email report (mailto autoprod.help@gmail.com, subject "Prepline problem report v3.3.3", body capped at 1,800 characters) or Copy report. Your list only if you tick the box (off by default). No network request.
- Privacy page (privacy.html, linked in the footer; a file:// copy shows the same notice in the app).
- Public and team builds: the Lemon Squeezy test checkout config and licence code are left out of the built page (build_public.py); the test site keeps them.

## 3.3.2 (2026-10-04) Survey link, one-time survey prompt, survey QR, SEO
- "Help shape Prepline – 1-min survey" link next to Feedback. Opens in a new tab (`rel="noopener"`). The address lives in one constant, `SURVEY_URL`; empty = every survey link, prompt and QR is hidden.
- One-time prompt (small corner card, not a blocking modal) about 1.5 s after a list is first generated: Take survey / No thanks. Remembered in `localStorage` (`prepline.surveyPrompt.v1`) the moment it shows, so it never appears again. Never shown in the phone shared view.
- Small "Feedback / survey" QR code (about 16 mm) in the bottom-right corner of every printout, after the content (kept together, no extra page in normal use); a small survey QR plus link in the share-to-phones window; a survey link at the foot of the phone shared view. QR codes drawn locally with the bundled qrcode-generator: no network request.
- Survey links carry `?from=app-link|app-prompt|app-print|app-share|app-phone` (`team-…` in the team build) so the survey can tell where answers came from. No personal data.
- SEO (public page only, inside `<!-- SEO:START/END -->`, stripped from team and test builds): title, meta description, canonical, Open Graph + Twitter card with `icons/og-image.png` (1200x630), JSON-LD SoftwareApplication (free, AUD), `robots.txt`, `sitemap.xml`; one h1 ("Prepline – kitchen prep list organiser"), the top-bar brand is no longer an h1.
- Public support / feedback contact: **autoprod.help@gmail.com** (Autoprod), in one constant `SUPPORT_EMAIL` (empty = hidden). "Email us" mailto link next to Feedback; the Feedback dialog keeps **Copy feedback text** and adds **Email feedback** (opens the user's own mail app with the same text; mailto body capped at 1,800 characters, with a note to use Copy for longer text). The copied text itself still has no address. Help text names the address. Nothing is sent from the page.
- Pro switched off (`LICENSE_CONFIG.mode 'off'`, the live site): every PRO pill / badge is hidden (`body.pro-off` + CSS), e.g. on "+ Append another PDF to this list". Pro test builds keep their pills.

## 3.3.1 (2026-10-03) Live release of 3.3; team build; no support address
- Feedback: no email address and no mailto anywhere. "Copy feedback text" is the main action, to paste into
  an email, Teams or a text to whoever shared Prepline with you. If the clipboard is blocked, the text is shown selected.
  The unused licence `supportEmail` setting is removed.
- Live site gets the 3.3 features (Pro off). Installable app now works on both sites, each scoped to its own path
  (/preplist-sorter/ and /prepline-test/) with its own cache names (`prepline:<path><version>`); neither site
  can control or clear the other. The manifest uses relative start_url/scope.
- Share links from file:// copies (offline zip, single file) point at the live site; from team copies, at the team site.
- New edition flag `edition: 'team'` for the team build: every tool unlocked (templates, custom stations,
  kitchens, append PDF and the 3.3 tools), no licence, Upgrade, Buy or TEST badge. Honoured only on file://,
  localhost or the team site path /prepline-team/; the public site keeps `edition: 'web'`.
- Team website (/prepline-team/): every library served from the site itself, system fonts, no request to any
  other domain. The service worker precaches same-site lib/ copies when present and never contacts a CDN there.
- PDF reader: waits up to 20 s for the library on a slow PC or network (was 5 s), with a clearer message.
- Unchanged: GST and "$" as entered, allergen disclaimer, per-kitchen data and free/Pro defaults,
  "Include method in printout" default No.

## 3.3.0 (2026-10-03) Seven kitchen features (test site only)
Built on 3.2.5, one commit per feature. Everything new is stored under new keys
(`preplineIngredientInfo_v1`, `preplinePref_ingPanelOpen_v1`); existing saved lists, the recipe database,
the print-method default (No), per-pax formulas and Source tab columns are unchanged. No Pro limits enforced.
1. Allergen tags: 11 standard tags + custom, keyword suggestions marked "?" until confirmed, dish-level tags,
   chips in all views and printouts, disclaimer, Allergens column (I) in all three Excel exports, saved in the recipe database.
2. Order sheet: supplier per ingredient (remembered), Order sheet view grouped by supplier with roll-up (g→kg, ml→L),
   rounded-up order qty, unassigned items last; print per supplier or all; Excel with one tab per supplier and an editable Order qty.
   Supplier column (J) in the main exports.
3. Cost per dish: price per kg / L / each (remembered); cost per dish, per pax and list total; missing or mismatched prices flagged.
   Excel: Price, Price per, unit factor and Cost formula columns (K–N), dish cost SUM and cost per pax formula; Est. cost on the order sheet.
4. Instant demo: "Try with sample menu" loads a made-up 5-dish menu (with allergens, suppliers, prices), marked SAMPLE DATA, one-click clear.
5. Team share: per section, QR code + link opening a read-only phone view with no server (list compressed in the URL hash,
   bundled MIT QR library). Splits into up to 8 parts, link only beyond. Limits: docs/TEAM_SHARE_LIMITS.md.
6. Feedback button: pre-filled email to a placeholder address (removed in 3.3.1) or copy to clipboard;
   version, browser and screen only, list only when ticked.
7. Installable app on /prepline-test/ only: manifest, icons, iOS tags, versioned service worker (network-first pages,
   cached CDN libraries), "update available — Reload" prompt. Nothing registers on any other path or on file://.
- Tests: `tests/v3/test_v33.py` (new) plus the full `tests/v3/test_v3.py`.

## 3.2.5 (2026-10-03) "Include method in printout" defaults to No
- New users and devices start with "Include method in printout: No", so printouts leave out the Method screen captures unless someone switches it to Yes.
- Choices already remembered on a device stay as they are: a saved Yes stays Yes, a saved No stays No. Nothing saved (or storage unavailable) now means No.
- Nothing else changed. Same key, `preplinePref_printIncludeMethod_v1`.
- Tests: fresh storage shows No and prints have no method; a stored 'yes' still prints the method; the choice survives a reload.

## 3.2.4 (2026-10-03) "Include method in printout"
- New Yes/No toggle, "Include method in printout", in the print-button row (next to "Print all sections / prep days (one page complete)"). That row sits above the list in all three views (By dish, By team section, By prep day), so it's one shared control, visible from every view, right above each dish/section/day Print button.
- No: the captured Method screen captures ("Method reference" crops) are left out of every printout: dish sheets, section handouts, prep-day handouts and both "one page complete" prints. The heading and the extra print page go too, so the sheet ends after the table. As a safety net, every printout also has any method/page image block or other image removed before printing.
- Default Yes. The choice is remembered on this device under its own key, `preplinePref_printIncludeMethod_v1` (not in the session, database, template or Pro kitchen data).
- Unchanged: the on-screen 📖 View original button and its viewer (including the viewer's own Print button, which prints the original pages on request).
- Tests: default Yes, No for each print type (no images, no heading, no blank method page), reload with No and Yes, phone 390 px.
