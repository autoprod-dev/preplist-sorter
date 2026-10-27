

## No subscription pricing in the main app (4.3.5.3 / 4.3.10)

Main app (gate, signup, login, trial, expired, privacy, SW shell, sitemap) has no plan prices, Lemon Squeezy checkout URL, or Buy button.
Expired trial: activation-code only — “get in touch for an activation code”.
Standalone pricing (placeholder checkout): `/plans-k7m2/` — not linked from the app, sitemap, or APP_SHELL.

## Full access / trial.enforce (4.3.5.4 / 4.3.11)

`gate-config.js` → `trial: { enforce: false }` (current testing phase).
- false: live Code.gs may still return `trial` / `expired`; client unlocks both. No trial-ended screen, no activation box. Admin `showStatus` pill stays wired but only shows when enforce is true.
- true: restore 7-day trial behaviour (expired → activation-code screen; admin trial pill).
Flip: edit `trial.enforce` in `gate-config.js` only — no Apps Script redeploy needed for the client switch.
Optional server flag `TRIAL_ENFORCED` in Code.gs is for later; live Code.gs unchanged.
