// Prepline access check (separate layer; does not touch any Prepline feature).
// Asks the status service whether this device may use Prepline. Fails OPEN: any error, timeout or
// missing endpoint means the page works normally. Only an explicit "blocked" or a past "until" date restricts.
(function () {
  'use strict';
  var C = window.PREPLINE_GATE || {};
  var BASE = (document.currentScript && document.currentScript.src) || location.href;
  if (!C.enabled || !C.endpoint) return;                       // kill-switch
  var KEY = 'prepline.gate.v1', Q = 'prepline.signupQueue.v1';
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function st() { try { return JSON.parse(ls(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function put(s) { ls(KEY, JSON.stringify(s)); }
  var s = st();
  if (!s.device) { s.device = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36); put(s); }
  // reuse the existing welcome sign-up: copy name/role from its queued entry before it is sent
  function grab() {
    try { var q = JSON.parse(ls(Q) || 'null'); if (q && q.b && q.b.name) { var t = st(); t.name = q.b.name; if (q.b.email) t.email = q.b.email; if (q.b.establishment) t.establishment = q.b.establishment; t.role = q.b.position === 'Other' ? (q.b.other || 'Other') : q.b.position; put(t); return true; } } catch (e) {}
    return false;
  }
  grab(); var n = 0, iv = setInterval(function () { if (grab() || ++n > 120) clearInterval(iv); }, 1000);
  var meta = document.querySelector('meta[name="prepline-version"]');
  var page = (location.pathname.match(/\/(classic|pipeline|ubs|allocation)\//) || [, 'index'])[1];
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function blockScreen(msg) {
    var show = function () {
      if (document.getElementById('apGate')) return;
      var d = document.createElement('div'); d.id = 'apGate'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true');
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#f6f7f9;display:flex;align-items:center;justify-content:center;padding:24px;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1d2433';
      d.innerHTML = '<div style="max-width:440px;background:#fff;border-radius:14px;padding:28px;box-shadow:0 6px 30px rgba(0,0,0,.08);text-align:center">' +
        '<div style="font-size:20px;font-weight:700;margin-bottom:8px">Prepline isn\u2019t available on this device</div>' +
        '<p id="apGateMsg" style="margin:0 0 14px"></p>' +
        '<p style="margin:0;color:#5b6475;font-size:14px">If you think this is a mistake, contact <a href="mailto:autoprod.help@gmail.com">autoprod.help@gmail.com</a>.</p>' +
        '<p style="margin:16px 0 0;color:#8a92a3;font-size:12px">Prepline by Autoprod</p></div>';
      d.querySelector('#apGateMsg').textContent = msg;
      Array.prototype.forEach.call(document.body.children, function (el) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); });
      document.body.appendChild(d); document.documentElement.style.overflow = 'hidden';
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  }
  function signIn(done) {
    var u = st(); if (u.name && u.email && u.establishment) return done();
    var show = function () {
      var d = document.createElement('div'); d.id = 'apSignIn';
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#f6f7f9;display:flex;align-items:center;justify-content:center;padding:24px;font:16px/1.5 system-ui,sans-serif;color:#1d2433';
      d.innerHTML = '<form style="max-width:400px;width:100%;background:#fff;border-radius:14px;padding:28px;box-shadow:0 6px 30px rgba(0,0,0,.08)">' +
        '<div style="font-size:20px;font-weight:700;margin-bottom:12px">Sign in to Prepline</div>' +
        '<label>Full name<input name="n" required minlength="2" autocomplete="name" style="display:block;width:100%;margin:4px 0 12px;padding:8px"></label>' +
        '<label>Workplace / company<input name="w" required minlength="2" autocomplete="organization" style="display:block;width:100%;margin:4px 0 12px;padding:8px"></label>' +
        '<label>Email<input name="e" type="email" required autocomplete="email" style="display:block;width:100%;margin:4px 0 12px;padding:8px"></label>' +
        '<p style="font-size:12px;color:#5b6475">Autoprod records sign-ins (name, workplace, email, region, time). See <a href="' + new URL('privacy.html', BASE).href + '" target="_blank" rel="noopener">privacy</a>.</p>' +
        '<button type="submit" style="width:100%;padding:10px;font-weight:700">Continue</button>' +
        '<p style="margin:12px 0 0;color:#8a92a3;font-size:12px;text-align:center">Prepline by Autoprod</p></form>';
      d.querySelector('form').addEventListener('submit', function (ev) {
        ev.preventDefault(); var f = ev.target, x = st();
        x.name = f.n.value.trim(); x.establishment = f.w.value.trim(); x.email = f.e.value.trim().toLowerCase();
        if (!x.name || !x.establishment || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email)) return;
        put(x); d.remove(); done();
      });
      document.body.appendChild(d);
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  }
  signIn(function () {
  var t = st(), body = { device: t.device, name: t.name || '', email: t.email || '', region: (function(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){return ''}})(), role: t.role || '', establishment: t.establishment || '', page: page, version: meta ? meta.content : '', ts: Date.now() };
  var ctl = window.AbortController ? new AbortController() : null, timer = setTimeout(function () { if (ctl) ctl.abort(); }, C.timeoutMs || 3000);
  fetch(C.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
    .then(function (r) { return r.ok || r.status === 403 ? r.json() : null; })
    .then(function (j) {
      clearTimeout(timer); window.__preplineGate = j || { status: 'open', reason: 'no_answer' };
      if (!j || typeof j.status !== 'string') return;                       // unknown answer: open
      if (j.establishment) { var u = st(); u.establishment = j.establishment; put(u); }
      if (j.status === 'blocked') return blockScreen(j.message || 'Access to Prepline has been paused for this device.');
      if (j.status === 'until' && /^\d{4}-\d{2}-\d{2}$/.test(j.until || '') && j.until < today())
        return blockScreen('Your Prepline access ended on ' + j.until.split('-').reverse().join('/') + '.');
      // allow / unlimited / until (still valid) / anything else: page works as normal
    })
    .catch(function () { clearTimeout(timer); window.__preplineGate = { status: 'open', reason: 'network' }; });   // fail open
  });
})();
