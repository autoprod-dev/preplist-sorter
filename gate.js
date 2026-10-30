// Prepline gate disabled (4.4.5): open straight into the app. No login, sign-up, trial,
// PIN, device-token or Apps Script call. Kept as a no-op so cached pages and the SW
// APP_SHELL still load this file without error.
(function () {
  'use strict';
  window.__preplineGate = { status: 'unlimited', reason: 'gate_disabled' };
  try {
    if (!localStorage.getItem('prepline.signup.v1')) {
      localStorage.setItem('prepline.signup.v1', JSON.stringify({
        d: new Date().toISOString().slice(0, 10),
        via: 'nologin-4.4.5'
      }));
    }
  } catch (e) {}
})();
