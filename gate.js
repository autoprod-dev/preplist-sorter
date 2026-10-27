// Prepline accounts + 7-day trial (separate layer; does not touch any Prepline feature).
// The status service decides. Fails CLOSED: any error, timeout, missing/disabled config or bad answer = no entry.
(function () {
  'use strict';
  var C = window.PREPLINE_GATE || {};
  var BASE = (document.currentScript && document.currentScript.src) || location.href;
  var KEY = 'prepline.account.v2';
  // the account sign-up replaces the older welcome box: mark it done so only one form ever shows
  try { if (!localStorage.getItem('prepline.signup.v1')) localStorage.setItem('prepline.signup.v1', JSON.stringify({ d: new Date().toISOString().slice(0, 10), via: 'account' })); } catch (e) {}
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function st() { try { return JSON.parse(ls(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function put(s) { ls(KEY, JSON.stringify(s)); }
  var meta = document.querySelector('meta[name="prepline-version"]');
  var page = (location.pathname.match(/\/(allocation)\//) || [, 'index'])[1];
  var CARD = 'max-width:420px;width:100%;background:#fff;border-radius:14px;padding:28px;box-shadow:0 6px 30px rgba(0,0,0,.08)';
  var INP = 'display:block;width:100%;box-sizing:border-box;margin:4px 0 12px;padding:8px';
  var BTN = 'width:100%;padding:10px;font-weight:700;cursor:pointer';
  var FOOT = '<p style="margin:14px 0 0;color:#8a92a3;font-size:12px;text-align:center">PrepLine by Autoprod \u00a9 2026</p>';
  function region() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } }
  function ready(fn) { if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function overlay(id, html) {
    var old = document.getElementById('apGate'); if (old) old.remove();
    var d = document.createElement('div'); d.id = 'apGate'; d.className = id; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#f6f7f9;display:flex;align-items:center;justify-content:center;padding:24px;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1d2433;overflow:auto';
    d.innerHTML = html;
    Array.prototype.forEach.call(document.body.children, function (el) { if (el !== d) el.setAttribute('inert', ''); });
    document.body.appendChild(d); document.documentElement.style.overflow = 'hidden'; return d;
  }
  function unlock() { ready(unlock_); }
  function unlock_() {
    var d = document.getElementById('apGate'); if (d) d.remove();
    Array.prototype.forEach.call(document.body.children, function (el) { el.removeAttribute('inert'); });
    document.documentElement.style.overflow = '';
  }
  function call(body) {
    if (!C.enabled || !C.endpoint) return Promise.resolve(null);
    body.region = region(); body.page = page; body.version = meta ? meta.content : ''; body.ts = Date.now();
    var ctl = window.AbortController ? new AbortController() : null, timer = setTimeout(function () { if (ctl) ctl.abort(); }, C.timeoutMs || 8000);
    return fetch(C.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        clearTimeout(timer);
        if (!r || !r.ok) return null;
        return r.json().then(function (j) { return j && typeof j === 'object' ? j : null; }, function () { return null; });
      })
      .catch(function () { clearTimeout(timer); return null; });
  }
  function showOffline() {
    ready(function () {
      var d = overlay('ap-offline', '<div style="' + CARD + ';text-align:center"><div style="font-size:20px;font-weight:700;margin-bottom:8px">Can\u2019t check your access right now</div>' +
        '<p style="margin:0 0 16px;color:#5b6475">Check your internet and try again.</p>' +
        '<button id="apRetry" type="button" style="' + BTN + ';background:#1d4ed8;color:#fff;border:0;border-radius:8px">Retry</button>' +
        '<p style="margin:14px 0 0;color:#5b6475;font-size:13px">Still stuck? <a href="mailto:autoprod.help@gmail.com">autoprod.help@gmail.com</a></p>' + FOOT + '</div>');
      d.querySelector('#apRetry').addEventListener('click', function () {
        d.querySelector('#apRetry').disabled = true; d.querySelector('#apRetry').textContent = 'Checking\u2026';
        start();
      });
    });
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dmy(s) { return s.split('-').reverse().join('/'); }
  function note(text) {
    ready(function () {
      var n = document.getElementById('apTrialNote') || document.createElement('div'); n.id = 'apTrialNote';
      n.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483000;background:#fff7e0;border:1px solid #e9c46a;color:#5b4a12;border-radius:999px;padding:3px 12px;font:13px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.08)';
      n.textContent = text; document.documentElement.appendChild(n);
    });
  }
  // Apply an answer from the service. Missing / bad / unknown answer = closed (fail-closed).
  var OK = { trial: 1, unlimited: 1, paid: 1, until: 1 };
  function apply(j) {
    window.__preplineGate = j || { status: 'offline', reason: 'no_answer' };
    if (!j || typeof j.status !== 'string') return showOffline();
    var s = st(); if (j.token) { s.token = j.token; put(s); if (!ls('prepline.signup.v1')) ls('prepline.signup.v1', JSON.stringify({ d: today(), via: 'account' })); }  // one form only
    if (j.status === 'not_found') { s.token = ''; put(s); return showSignup(true); }
    if (j.status === 'blocked') return showBlocked('Access to Prepline has been paused for this account.');
    if (j.status === 'until') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(j.until || '')) return showOffline();
      if (j.until < today()) return showBlocked('Your Prepline access ended on ' + dmy(j.until) + '.');
      return unlock();
    }
    if (j.status === 'expired') return showBuy();
    if (!OK[j.status]) return showOffline();
    unlock();
    if (j.status === 'trial' && j.daysLeft > 0) note('Trial: ' + j.daysLeft + (j.daysLeft === 1 ? ' day' : ' days') + ' left');
  }
  function showBlocked(msg) {
    ready(function () {
      var d = overlay('ap-blocked', '<div style="' + CARD + ';text-align:center"><div style="font-size:20px;font-weight:700;margin-bottom:8px">Prepline isn\u2019t available</div><p id="apGateMsg" style="margin:0 0 14px"></p>' +
        '<p style="margin:0;color:#5b6475;font-size:14px">If you think this is a mistake, contact <a href="mailto:autoprod.help@gmail.com">autoprod.help@gmail.com</a>.</p>' + FOOT + '</div>');
      d.querySelector('#apGateMsg').textContent = msg;
    });
  }
  function showSignup(login) {
    ready(function () {
      var d = overlay('ap-signup', '<form style="' + CARD + '" novalidate>' +
        '<div id="apTitle" style="font-size:20px;font-weight:700;margin-bottom:4px"></div><p id="apSub" style="margin:0 0 14px;color:#5b6475;font-size:14px"></p>' +
        '<div class="apSignOnly"><label>Full name<input name="n" autocomplete="name" style="' + INP + '"></label>' +
        '<label>Workplace / company<input name="w" autocomplete="organization" style="' + INP + '"></label></div>' +
        '<label>Email<input name="e" type="email" autocomplete="email" style="' + INP + '"></label>' +
        '<p id="apErr" style="color:#b42318;font-size:14px;margin:0 0 8px" role="alert"></p>' +
        '<p class="apSignOnly" style="font-size:12px;color:#5b6475">Autoprod records sign-ups (name, workplace, email, region, time). See <a href="' + new URL('privacy.html', BASE).href + '" target="_blank" rel="noopener">privacy</a>.</p>' +
        '<button id="apGo" type="submit" style="' + BTN + '"></button>' +
        '<p style="margin:12px 0 0;text-align:center;font-size:14px"><a href="#" id="apSwitch"></a></p>' + FOOT + '</form>');
      var f = d.querySelector('form'), mode = login ? 'login' : 'signup';
      function render() {
        var L = mode === 'login';
        d.querySelector('#apTitle').textContent = L ? 'Log in to Prepline' : 'Start your free 7-day trial';
        d.querySelector('#apSub').textContent = L ? 'Enter the email you signed up with to use Prepline on this device.' : 'Sign up once. This device will remember you next time.';
        d.querySelector('#apGo').textContent = L ? 'Log in' : 'Sign up';
        d.querySelector('#apSwitch').textContent = L ? 'New here? Sign up' : 'Already signed up? Log in with email';
        Array.prototype.forEach.call(d.querySelectorAll('.apSignOnly'), function (x) { x.style.display = L ? 'none' : ''; });
        d.querySelector('#apErr').textContent = '';
      }
      render();
      d.querySelector('#apSwitch').addEventListener('click', function (ev) { ev.preventDefault(); mode = mode === 'login' ? 'signup' : 'login'; render(); });
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); var err = d.querySelector('#apErr');
        var email = f.e.value.trim().toLowerCase(), name = f.n.value.trim(), wp = f.w.value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Please enter a valid email.'; return; }
        if (mode === 'signup' && (name.length < 2 || wp.length < 2)) { err.textContent = 'Please enter your name and workplace.'; return; }
        var s = st(); s.email = email; if (mode === 'signup') { s.name = name; s.establishment = wp; } put(s);
        d.querySelector('#apGo').disabled = true;
        call(mode === 'signup' ? { action: 'signup', name: name, establishment: wp, email: email } : { action: 'login', email: email }).then(function (j) {
          d.querySelector('#apGo').disabled = false;
          if (!j) { err.textContent = 'Can\u2019t check your access right now. Check your internet and try again.'; return; }
          if (j.status === 'not_found') { err.textContent = 'No account found for that email. Check it, or sign up.'; return; }
          if (j.status === 'invalid') { err.textContent = 'Please fill in every field.'; return; }
          apply(j);
        });
      });
    });
  }
  function showBuy() {
    ready(function () {
      var d = overlay('ap-buy', '<div style="' + CARD + ';text-align:center"><div style="font-size:20px;font-weight:700;margin-bottom:8px">Your free trial has ended</div>' +
        '<p style="margin:0 0 16px">Thanks for trying Prepline. To keep using it, buy a licence. You\u2019ll get an activation code by email.</p>' +
        '<a id="apBuy" target="_blank" rel="noopener" style="display:block;box-sizing:border-box;' + BTN + ';background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none;margin-bottom:18px">Buy Prepline</a>' +
        '<form style="text-align:left" novalidate><label>Have an activation code?<input name="c" placeholder="PL-XXXX-XXXX-XXXX-XXXX-X" autocomplete="off" style="' + INP + ';text-transform:uppercase"></label>' +
        '<p id="apErr" style="color:#b42318;font-size:14px;margin:0 0 8px" role="alert"></p><button type="submit" style="' + BTN + '">Unlock</button></form>' +
        '<p style="margin:14px 0 0;color:#5b6475;font-size:13px">Questions? <a href="mailto:autoprod.help@gmail.com">autoprod.help@gmail.com</a></p>' + FOOT + '</div>');
      var s = st(), u = C.checkoutUrl || '#';
      try { var x = new URL(u); if (s.email) x.searchParams.set('checkout[email]', s.email); x.searchParams.set('checkout[custom][trial_email]', s.email || ''); u = x.href; } catch (e) {}
      d.querySelector('#apBuy').href = u;
      var f = d.querySelector('form');
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); var err = d.querySelector('#apErr'), code = f.c.value.trim().toUpperCase().replace(/\s+/g, '');
        if (!/^PL-[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}-[A-HJ-NP-Z2-9]$/.test(code)) { err.textContent = 'That doesn\u2019t look like a Prepline code (PL-XXXX-XXXX-XXXX-XXXX-X).'; return; }
        call({ action: 'activate', token: st().token || '', code: code }).then(function (j) {
          if (!j) { err.textContent = 'Couldn\u2019t check the code right now. Please try again shortly.'; return; }
          if (j.status === 'bad_code') { err.textContent = 'That code wasn\u2019t recognised. Check it and try again.'; return; }
          apply(j);
        });
      });
    });
  }
  function start() {
    C = window.PREPLINE_GATE || {};
    if (!C.enabled || !C.endpoint) { window.__preplineGate = { status: 'offline', reason: 'gate_misconfigured' }; return showOffline(); }
    var s0 = st();
    if (!s0.token) return showSignup(false);
    call({ action: 'check', token: s0.token }).then(apply);
  }
  start();
})();
