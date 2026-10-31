// Prepline access settings. Gate disabled — app opens with full access, no login/sign-up, no Apps Script.
// gate.js unlocks immediately; these flags are kept for any code that reads PREPLINE_GATE.
window.PREPLINE_GATE = {
  enabled: false,
  endpoint: '',
  timeoutMs: 0,
  trial: { enforce: false },
  openAccess: true
};
