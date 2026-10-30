// Prepline access settings. Gate disabled in 4.4.5 — app opens with full access, no backend call.
window.PREPLINE_GATE = {
  enabled: false,
  endpoint: '',
  timeoutMs: 8000,
  trial: { enforce: false }
};
