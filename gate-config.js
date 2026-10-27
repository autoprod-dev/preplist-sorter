// Prepline access settings. enabled must be true and endpoint set, or the gate stays closed (Retry screen).
// trial.enforce: false = testing phase — trial and expired both unlock (no trial-ended screen).
// Set trial.enforce to true to restore 7-day trial + expired activation-code screen.
window.PREPLINE_GATE = {
  enabled: true,
  endpoint: 'https://script.google.com/macros/s/AKfycbwuB0NQpptlvBOrZ58J3gHPFfVBWVFWvZZXADBLhhW39uhkIZJ1Yt-b7ug0ecydU3_z/exec',
  timeoutMs: 8000,
  trial: { enforce: false }
};
