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
