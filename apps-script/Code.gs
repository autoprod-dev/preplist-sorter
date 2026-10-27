// Prepline Access Log (staged) — bind to the sheet: Extensions > Apps Script, paste this file.
// doPost: log one attempt to "Attempts" and answer with this person's status from "Access".
// doGet (?email=...): status only, no logging. No secrets in this file.
var TZ = 'Australia/Sydney';
function sh_(n) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function clean_(v) { v = String(v == null ? '' : v).slice(0, 200); return /^[=+\-@]/.test(v) ? "'" + v : v; } // block formula injection

var ATT_H = ['Login time (Sydney)','Full name','Workplace / company','Email','City/region','Access status','Reason'];
var ACC_H = ['email','status (allow/block/unlimited)','until_date (YYYY-MM-DD)','notes','updated_at'];
function headers_() {   // run once (or automatically on each request) to set the exact column headers
  sh_('Attempts').getRange(1,1,1,ATT_H.length).setValues([ATT_H]);
  sh_('Access').getRange(1,1,1,ACC_H.length).setValues([ACC_H]);
}
function setup() { headers_(); }
function lookup_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return { status: 'allow', reason: 'no_email_default_allow' };
  var rows = sh_('Access').getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {               // last matching row wins
    if (String(rows[i][0]).trim().toLowerCase() !== email) continue;
    var s = String(rows[i][1]).trim().toLowerCase(), u = rows[i][2];
    if (u instanceof Date) u = Utilities.formatDate(u, TZ, 'yyyy-MM-dd'); else u = String(u || '').trim();
    if (s === 'block' || s === 'blocked') return { status: 'blocked', reason: 'blocked_by_admin' };
    if (s === 'unlimited') return { status: 'unlimited', reason: 'unlimited' };
    if (/^\d{4}-\d{2}-\d{2}$/.test(u)) {
      var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
      return u < today ? { status: 'until', until: u, reason: 'access_expired' } : { status: 'until', until: u, reason: 'within_until' };
    }
    return { status: 'allow', reason: 'allowed' };
  }
  return { status: 'allow', reason: 'not_listed_default_allow' };
}
function result_(r) { return r.status === 'blocked' ? 'blocked' : (r.reason === 'access_expired' || r.reason === 'missing_details') ? 'denied' : 'granted'; }

function doPost(e) {
  var b = {}; try { b = JSON.parse(e.postData.contents); } catch (x) {}
  var r = lookup_(b.email);
  if (!String(b.name||'').trim() || !String(b.establishment||'').trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.email||'').trim()))
    r = { status: 'blocked', reason: 'missing_details', message: 'Please sign in with your full name, workplace and email.' };
  var lock = LockService.getScriptLock(); lock.waitLock(5000);
  try {
    if (sh_('Attempts').getRange(1,1).getValue() !== ATT_H[0]) headers_();
    sh_('Attempts').appendRow([now_(), clean_(b.name), clean_(b.establishment), clean_(String(b.email || '').toLowerCase()),
      clean_(b.region), result_(r), r.reason + (b.page ? ' (' + clean_(b.page) + ')' : '')]);
  } finally { lock.releaseLock(); }
  return json_(r);
}
function doGet(e) { return json_(lookup_(e && e.parameter && e.parameter.email)); }
