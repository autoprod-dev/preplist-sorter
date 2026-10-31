// Prepline trial open access (4.7.4): no login, sign-up, trial, email check, PIN,
// device-token or Apps Script call. App opens straight into full access.
(function () {
  'use strict';
  try {
    if (!localStorage.getItem('prepline.signup.v1')) {
      localStorage.setItem('prepline.signup.v1', JSON.stringify({
        d: new Date().toISOString().slice(0, 10),
        via: 'open_access'
      }));
    }
  } catch (e) {}
  window.__preplineGate = { status: 'unlimited', reason: 'trial_open_access' };
  function clearGate() {
    var d = document.getElementById('apGate');
    if (d) d.remove();
    if (document.body) {
      Array.prototype.forEach.call(document.body.children, function (el) {
        el.removeAttribute('inert');
      });
    }
    document.documentElement.style.overflow = '';
    var note = document.getElementById('apTrialNote');
    if (note) note.remove();
  }
  if (document.body) clearGate();
  else document.addEventListener('DOMContentLoaded', clearGate);
})();
