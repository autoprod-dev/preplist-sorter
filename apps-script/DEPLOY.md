# Deploy the access log (on Gerard's laptop, signed in to Google)
Sheet: Prepline Access Log (staged) — https://docs.google.com/spreadsheets/d/1MVPlikR3Vx2MRqsIQpNvCaZvOI0PUQtAfCp6I5uRw_4/edit

1. Open the sheet > Extensions > Apps Script. Delete the sample code, paste all of apps-script/Code.gs, click Save. Choose `setup` in the function dropdown and click Run once (approve the Google permission prompt) — this writes the exact column headers.
2. Deploy > New deployment > type "Web app". Execute as: **Me**. Who has access: **Anyone**. Click Deploy and copy the Web app URL (ends in `/exec`).
3. Paste that URL into `gate-config.js` as `endpoint: 'https://script.google.com/macros/s/.../exec'` (leave `enabled: false` until you approve going live).

Block someone: add a row in the Access tab — email, `block` (or `unlimited`, or `allow` + until_date YYYY-MM-DD). Takes effect on their next login.
