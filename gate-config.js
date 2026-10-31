// Trial open access (4.7.4): gate disabled — no Apps Script backend, no login/sign-up.
// gate.js unlocks immediately; these flags are kept for any code that reads PREPLINE_GATE.
window.PREPLINE_GATE = {
  enabled: false,
  endpoint: '',
  timeoutMs: 0,
  trial: { enforce: false },
  openAccess: true
};
