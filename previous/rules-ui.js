/* Venue Rules UI — profiles, rule CRUD, test preview. No real venue names. */
(function (root) {
  'use strict';
  var R = function () { return root.PreplineRules; };

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function ensurePanel() {
    if (document.getElementById('rulesPanel')) return;
    var css = document.createElement('style');
    css.textContent = [
      '#rulesPanel{position:fixed;inset:0;z-index:9400;background:rgba(28,30,27,.45);display:none;align-items:stretch;justify-content:center;padding:24px}',
      '#rulesPanel.open{display:flex}',
      '#rulesPanel .rp-card{background:#F7F4EC;border:1px solid #D9D3C4;border-radius:14px;width:min(960px,100%);max-height:92vh;overflow:auto;box-shadow:0 18px 50px rgba(0,0,0,.25);padding:18px 20px 24px;font-family:Inter,sans-serif;color:#1C1E1B}',
      '#rulesPanel h2{margin:0 0 4px;font-family:Fraunces,serif;font-size:22px}',
      '#rulesPanel .rp-sub{color:#5C5A52;font-size:13px;margin:0 0 14px}',
      '#rulesPanel .rp-top{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}',
      '#rulesPanel select,#rulesPanel input,#rulesPanel textarea{font:inherit;padding:6px 8px;border:1px solid #C9C2B0;border-radius:8px;background:#fff}',
      '#rulesPanel button{font:inherit;padding:7px 12px;border-radius:8px;border:1px solid #C9C2B0;background:#fff;cursor:pointer}',
      '#rulesPanel button.primary{background:#1C1E1B;color:#F7F4EC;border-color:#1C1E1B}',
      '#rulesPanel button.ghost{background:transparent}',
      '#rulesPanel table{width:100%;border-collapse:collapse;font-size:13px}',
      '#rulesPanel th,#rulesPanel td{border-bottom:1px solid #E4DED0;padding:7px 6px;text-align:left;vertical-align:top}',
      '#rulesPanel tr.disabled{opacity:.45}',
      '#rulesPanel .rp-type{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#7A7568}',
      '#rulesPanel .rp-edit{background:#fff;border:1px solid #D9D3C4;border-radius:10px;padding:12px;margin:12px 0}',
      '#rulesPanel .rp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}',
      '#rulesPanel .rp-preview{background:#EDEAE2;border-radius:8px;padding:10px;font-size:13px;margin-top:10px}',
      '#rulesPanel .rp-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}',
      '#openRulesBtn{margin-left:6px}'
    ].join('\n');
    document.head.appendChild(css);

    var wrap = el('div');
    wrap.id = 'rulesPanel';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Venue rules');
    wrap.innerHTML = '<div class="rp-card" id="rulesCard"></div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closeRules(); });
  }

  function openRules() {
    ensurePanel();
    document.getElementById('rulesPanel').classList.add('open');
    render();
  }
  function closeRules() {
    var p = document.getElementById('rulesPanel');
    if (p) p.classList.remove('open');
  }

  function activeProfile() { return R().getProfile(); }

  function render() {
    var card = document.getElementById('rulesCard');
    if (!card) return;
    var profiles = R().listProfiles();
    var p = activeProfile();
    var opts = profiles.map(function (x) {
      return '<option value="' + x.id + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.name) + (x.builtIn ? ' (built-in)' : '') + '</option>';
    }).join('');
    var rows = (p.rules || []).slice().sort(function (a, b) { return (a.priority || 0) - (b.priority || 0); }).map(function (r, i) {
      return '<tr class="' + (r.enabled === false ? 'disabled' : '') + '" data-id="' + r.id + '">' +
        '<td><input type="checkbox" data-act="en" ' + (r.enabled === false ? '' : 'checked') + '></td>' +
        '<td>' + (r.priority || 0) + '</td>' +
        '<td><span class="rp-type">' + esc(r.type) + '</span><div><b>' + esc(r.name || r.type) + '</b></div><div style="color:#5C5A52;font-size:12px">' + esc(summary(r)) + '</div></td>' +
        '<td style="white-space:nowrap">' +
          '<button type="button" data-act="up" title="Higher priority">↑</button> ' +
          '<button type="button" data-act="down" title="Lower priority">↓</button> ' +
          '<button type="button" data-act="edit">Edit</button> ' +
          '<button type="button" data-act="del" class="ghost">Delete</button>' +
        '</td></tr>';
    }).join('');
    card.innerHTML =
      '<div class="rp-top"><h2 style="flex:1">Venue rules</h2><button type="button" class="ghost" id="rpClose">Close</button></div>' +
      '<p class="rp-sub">Colour, keyword, packs, staffing and IF/THEN rules for this kitchen. Profiles stay on this device. The Default profile mirrors the built-in prep-day vocabulary and staffing ratios. Weekend avoidance (all categories) is on by default — Sat/Sun → Mon, or Fri if Mon is on/after function; Sunday never. Optional Saturday starts + soft cap below. Crab croquettes (frozen bulk) is an editable keyword exception → 4-day protein window.</p>' +
      '<div class="rp-top">' +
        '<label>Profile <select id="rpProfile">' + opts + '</select></label>' +
        '<label>Match <select id="rpMode"><option value="first"' + (p.matchMode !== 'stack' ? ' selected' : '') + '>First match wins</option><option value="stack"' + (p.matchMode === 'stack' ? ' selected' : '') + '>Stack / continue</option></select></label>' +
        '<label title="All categories: Sat/Sun raw starts move forward to Monday, or back to Friday if Monday is on/after the function day. Sunday never."><input type="checkbox" id="rpWeekend"' + (p.weekendShift === false ? '' : ' checked') + '> Weekend avoidance (all categories)</label>' +
        '<label title="When off (default), Saturday starts are shifted like weekend. When on, Saturday is allowed as a prep start day."><input type="checkbox" id="rpAllowSat"' + (p.allowSaturdayStarts ? ' checked' : '') + '> Allow Saturday starts</label>' +
        '<label title="Soft guidance when Saturday starts are allowed (not a hard lock).">Sat cap <input type="number" id="rpSatCap" min="0" max="20" step="1" value="' + (Number.isFinite(Number(p.saturdayCap)) ? Number(p.saturdayCap) : 3) + '" style="width:3.2em"></label>' +
        '<button type="button" id="rpNewProf">New profile</button>' +
        '<button type="button" id="rpDup">Duplicate</button>' +
        '<button type="button" id="rpExport">Export JSON</button>' +
        '<button type="button" id="rpImport">Import JSON</button>' +
        '<button type="button" id="rpReset"' + (p.id === 'default' ? '' : ' hidden') + '>Reset Default</button>' +
        '<button type="button" id="rpDelProf" class="ghost"' + (p.builtIn ? ' hidden' : '') + '>Delete profile</button>' +
      '</div>' +
      '<div class="rp-top">' +
        '<button type="button" class="primary" data-add="colour">+ Colour</button>' +
        '<button type="button" class="primary" data-add="keyword">+ Keyword</button>' +
        '<button type="button" class="primary" data-add="packs">+ Packs</button>' +
        '<button type="button" class="primary" data-add="staffing">+ Staffing</button>' +
        '<button type="button" class="primary" data-add="ifthen">+ IF / THEN</button>' +
        '<button type="button" id="rpTest">Test preview</button>' +
      '</div>' +
      '<div class="rp-batch" id="rpBatch" style="margin:12px 0;padding:12px;border:1px solid #D9D3C3;border-radius:8px;background:#fff">' +
        '<div style="font-weight:600;margin-bottom:6px">Cross-dish batching (per section)</div>' +
        '<p style="margin:0 0 8px;font-size:12.5px;color:#5C5A52">When “Batch across dishes” is on, matching ingredients merge across dishes/function days within each category’s batch window (4-day redmeat/dairy-butter/dry/oil/dressing/crab croq; 3 poultry/cheese/gels/starch; 2 puree/garnish; 1 fish/micro; long-life dressings/croutons/powders/crumbs/oils/soils/gels). Sunday never; Saturday only if allowed. Untick a category to keep it as separate lines.</p>' +
        '<div id="rpBatchChecks" style="display:flex;flex-wrap:wrap;gap:8px 14px"></div>' +
      '</div>' +
      '<div id="rpEdit"></div>' +
      '<table><thead><tr><th>On</th><th>Pri</th><th>Rule</th><th></th></tr></thead><tbody id="rpBody">' + (rows || '<tr><td colspan="4">No rules yet.</td></tr>') + '</tbody></table>' +
      '<div class="rp-preview" id="rpPrev" hidden></div>';

    card.querySelector('#rpClose').onclick = closeRules;
    card.querySelector('#rpProfile').onchange = function () { R().setActiveId(this.value); render(); };
    card.querySelector('#rpMode').onchange = function () { p.matchMode = this.value; R().saveProfile(p); };
    card.querySelector('#rpWeekend').onchange = function () { p.weekendShift = !!this.checked; R().saveProfile(p); if (R().syncBatchableToUi) R().syncBatchableToUi(p); };
    var allowSat = card.querySelector('#rpAllowSat');
    if (allowSat) allowSat.onchange = function () { p.allowSaturdayStarts = !!this.checked; R().saveProfile(p); if (R().syncBatchableToUi) R().syncBatchableToUi(p); };
    var satCap = card.querySelector('#rpSatCap');
    if (satCap) satCap.onchange = function () { var n = Number(this.value); p.saturdayCap = Number.isFinite(n) && n >= 0 ? n : 3; R().saveProfile(p); if (R().syncBatchableToUi) R().syncBatchableToUi(p); };
    (function fillBatch(){
      var box = card.querySelector('#rpBatchChecks'); if (!box) return;
      if (!p.batchable) p.batchable = {};
      var vocab = (window.PREP_DAYS_VOCAB || []);
      box.innerHTML = vocab.map(function (c) {
        /* 4.8.24: prawn omitted from default-on list → stays false (no Mon/Sat early batch). */
        var on = p.batchable[c.key] !== false && (p.batchable[c.key] === true || ['poultry','redmeat','seafood','veg','vegsoft','veghard','vegraw','vegcook','dry','oil','gels','puree','dressing','dairy','cheese','starch','crabcroq'].indexOf(c.key) >= 0);
        if (p.batchable[c.key] === undefined) p.batchable[c.key] = on;
        if (c.key === 'prawn') { p.batchable.prawn = false; on = false; }
        return '<label style="font-size:12.5px;display:inline-flex;align-items:center;gap:5px;cursor:pointer">' +
          '<input type="checkbox" data-batch-cat="' + c.key + '"' + (p.batchable[c.key] ? ' checked' : '') + '> ' +
          (c.label || c.key) + '</label>';
      }).join('');
      box.querySelectorAll('[data-batch-cat]').forEach(function (inp) {
        inp.onchange = function () {
          p.batchable[inp.getAttribute('data-batch-cat')] = !!inp.checked;
          R().saveProfile(p);
          if (R().syncBatchableToUi) R().syncBatchableToUi(p);
          if (typeof render === 'function') try { render(); } catch (e) {}
        };
      });
      if (R().syncBatchableToUi) R().syncBatchableToUi(p);
    })();
    card.querySelector('#rpNewProf').onclick = function () {
      var name = prompt('Profile name', 'My kitchen');
      if (!name) return;
      var np = { id: R().uid(), name: name, builtIn: false, matchMode: 'first', rules: [] };
      R().saveProfile(np); R().setActiveId(np.id); render();
    };
    card.querySelector('#rpDup').onclick = function () {
      var copy = JSON.parse(JSON.stringify(p));
      copy.id = R().uid(); copy.name = p.name + ' copy'; copy.builtIn = false;
      R().saveProfile(copy); R().setActiveId(copy.id); render();
    };
    card.querySelector('#rpExport').onclick = function () {
      var blob = new Blob([R().exportProfile(p.id)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'prepline-rules-' + (p.name || 'profile').replace(/\s+/g, '-') + '.json'; a.click();
    };
    card.querySelector('#rpImport').onclick = function () {
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = function () {
        var f = inp.files[0]; if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          try { var imp = R().importProfile(reader.result, true); R().setActiveId(imp.id); render(); }
          catch (err) { alert('Import failed: ' + (err.message || err)); }
        };
        reader.readAsText(f);
      };
      inp.click();
    };
    card.querySelector('#rpReset').onclick = function () {
      if (!confirm('Reset Default profile to built-in prep-day vocabulary and staffing ratios?')) return;
      R().resetDefault(); render();
    };
    card.querySelector('#rpDelProf').onclick = function () {
      if (!confirm('Delete this profile?')) return;
      R().deleteProfile(p.id); render();
    };
    card.querySelectorAll('[data-add]').forEach(function (b) {
      b.onclick = function () { showEditor(blankRule(b.getAttribute('data-add'))); };
    });
    card.querySelector('#rpTest').onclick = showTest;
    card.querySelectorAll('#rpBody tr[data-id]').forEach(function (tr) {
      var id = tr.getAttribute('data-id');
      var rule = (p.rules || []).find(function (x) { return x.id === id; });
      tr.querySelector('[data-act=en]').onchange = function () { rule.enabled = !!this.checked; R().saveProfile(p); render(); };
      tr.querySelector('[data-act=up]').onclick = function () { bump(rule, -10); };
      tr.querySelector('[data-act=down]').onclick = function () { bump(rule, 10); };
      tr.querySelector('[data-act=edit]').onclick = function () { showEditor(rule); };
      tr.querySelector('[data-act=del]').onclick = function () {
        if (!confirm('Delete rule?')) return;
        p.rules = p.rules.filter(function (x) { return x.id !== id; });
        R().saveProfile(p); render();
      };
    });
  }

  function bump(rule, delta) {
    var p = activeProfile();
    rule.priority = (rule.priority || 0) + delta;
    R().saveProfile(p); render();
  }

  function blankRule(type) {
    return {
      id: R().uid(), type: type, enabled: true, priority: 50,
      name: type + ' rule', stack: false,
      colour: '', legendLabel: '', category: 'veg', leadDays: 4, weekendShift: false, overridePrep: false,
      field: 'name', op: 'contains', value: '', wildcard: false,
      per: 10, unit: 'pack', round: 'up',
      section: 'Sandwich', mode: 'service', paxMax: 150, chefs: 1,
      thenCategory: '', thenLead: '', thenStaff: '', thenHighlight: '', thenHide: false, thenNote: ''
    };
  }

  function summary(r) {
    if (r.type === 'colour') return (r.legendLabel || r.colour || '?') + ' → ' + (r.category || '') + (r.leadDays != null ? ' · lead ' + r.leadDays : '');
    if (r.type === 'keyword') return (r.field || 'name') + ' ' + (r.op || 'contains') + ' "' + (r.value || '') + '" → ' + (r.category || '') + (r.leadDays != null && r.leadDays !== '' ? ' · lead ' + r.leadDays : '') + (r.weekendShift ? ' · weekend-shift' : '') + (r.overridePrep ? ' · override' : '');
    if (r.type === 'packs') return '1 ' + (r.unit || 'pack') + ' per ' + (r.per || 10) + ' pax · round ' + (r.round || 'up');
    if (r.type === 'staffing') return (r.section || 'any') + ' ≤' + r.paxMax + ' → ' + r.chefs + ' chefs';
    if (r.type === 'ifthen') return 'IF ' + (r.field || 'name') + ' ' + (r.op || 'contains') + ' "' + (r.value || '') + '" THEN…';
    return '';
  }

  function showEditor(rule) {
    var box = document.getElementById('rpEdit');
    if (!box) return;
    var isNew = !(activeProfile().rules || []).some(function (x) { return x.id === rule.id; });
    box.innerHTML = '<div class="rp-edit"><b>' + (isNew ? 'New' : 'Edit') + ' ' + esc(rule.type) + ' rule</b>' +
      '<div class="rp-grid" style="margin-top:8px">' +
      field('Name', '<input id="reName" value="' + escAttr(rule.name || '') + '">') +
      field('Priority', '<input id="rePri" type="number" value="' + (rule.priority || 0) + '">') +
      (rule.type === 'colour' ? field('Legend label', '<input id="reLab" value="' + escAttr(rule.legendLabel || '') + '">') + field('Colour hex', '<input id="reCol" value="' + escAttr(rule.colour || '') + '" placeholder="optional AABBCC">') : '') +
      (rule.type === 'keyword' || rule.type === 'ifthen' ? field('Field', sel('reField', ['name', 'section', 'pax', 'date', 'day', 'colour', 'category'], rule.field || 'name')) + field('Op', sel('reOp', ['contains', 'equals', 'gt', 'lt', 'between'], rule.op || 'contains')) + field('Value', '<input id="reVal" value="' + escAttr(rule.value || '') + '">') : '') +
      (rule.type === 'keyword' ? field('Wildcard prefix', '<label><input type="checkbox" id="reWild"' + (rule.wildcard ? ' checked' : '') + '> starts-with *</label>') : '') +
      (rule.type === 'packs' ? field('Per pax', '<input id="rePer" type="number" value="' + (rule.per || 10) + '">') + field('Unit', '<input id="reUnit" value="' + escAttr(rule.unit || 'pack') + '">') + field('Round', sel('reRound', ['up', 'down', 'nearest'], rule.round || 'up')) : '') +
      (rule.type === 'staffing' ? field('Section', '<input id="reSec" value="' + escAttr(rule.section || '') + '">') + field('Pax max', '<input id="rePax" type="number" value="' + (rule.paxMax == null ? '' : rule.paxMax) + '">') + field('Chefs', '<input id="reChefs" type="number" value="' + (rule.chefs == null ? '' : rule.chefs) + '">') + field('Round', sel('reRound', ['none', 'up', 'down', 'nearest'], rule.round || 'none')) : '') +
      ((rule.type === 'colour' || rule.type === 'keyword' || rule.type === 'ifthen') ? field('Category', '<input id="reCat" value="' + escAttr(rule.category || rule.thenCategory || '') + '" placeholder="veg, starch…">') + field('Lead days', '<input id="reLead" type="number" value="' + (rule.leadDays != null ? rule.leadDays : (rule.thenLead || '')) + '">') : '') +
      (rule.type === 'ifthen' ? field('Then staff', '<input id="reThenStaff" value="' + escAttr(rule.thenStaff == null ? '' : rule.thenStaff) + '">') + field('Then note', '<input id="reThenNote" value="' + escAttr(rule.thenNote || '') + '">') + field('Hide', '<label><input type="checkbox" id="reHide"' + (rule.thenHide ? ' checked' : '') + '> hide row</label>') : '') +
      ((rule.type === 'colour' || rule.type === 'keyword' || rule.type === 'ifthen') ? field('Weekend avoidance', '<label><input type="checkbox" id="reWk"' + (rule.weekendShift ? ' checked' : '') + '> Weekend avoidance</label>') + field('Override prep', '<label><input type="checkbox" id="reOv"' + (rule.overridePrep ? ' checked' : '') + '> wins over legend/keywords</label>') : '') +
      field('Stack', '<label><input type="checkbox" id="reStack"' + (rule.stack ? ' checked' : '') + '> keep matching after this</label>') +
      '</div><div class="rp-actions"><button type="button" class="primary" id="reSave">Save rule</button><button type="button" class="ghost" id="reCancel">Cancel</button></div></div>';
    box.querySelector('#reCancel').onclick = function () { box.innerHTML = ''; };
    box.querySelector('#reSave').onclick = function () {
      rule.name = val('reName');
      rule.priority = num('rePri', 0);
      rule.stack = !!(document.getElementById('reStack') || {}).checked;
      if (rule.type === 'colour') { rule.legendLabel = val('reLab'); rule.colour = val('reCol'); rule.category = val('reCat'); rule.leadDays = num('reLead', null); rule.weekendShift = !!(document.getElementById('reWk') || {}).checked; rule.overridePrep = !!(document.getElementById('reOv') || {}).checked; }
      if (rule.type === 'keyword') { rule.field = val('reField'); rule.op = val('reOp'); rule.value = val('reVal'); rule.wildcard = !!(document.getElementById('reWild') || {}).checked; rule.category = val('reCat'); rule.leadDays = num('reLead', null); rule.weekendShift = !!(document.getElementById('reWk') || {}).checked; rule.overridePrep = !!(document.getElementById('reOv') || {}).checked; }
      if (rule.type === 'packs') { rule.per = num('rePer', 10); rule.unit = val('reUnit') || 'pack'; rule.round = val('reRound') || 'up'; }
      if (rule.type === 'staffing') { rule.section = val('reSec'); rule.paxMax = num('rePax', Infinity); rule.chefs = num('reChefs', 1); rule.round = val('reRound') || 'none'; }
      if (rule.type === 'ifthen') {
        rule.field = val('reField'); rule.op = val('reOp'); rule.value = val('reVal');
        rule.thenCategory = val('reCat'); rule.category = rule.thenCategory;
        rule.thenLead = num('reLead', ''); rule.leadDays = rule.thenLead;
        rule.thenStaff = num('reThenStaff', ''); rule.thenNote = val('reThenNote');
        rule.thenHide = !!(document.getElementById('reHide') || {}).checked;
        rule.weekendShift = !!(document.getElementById('reWk') || {}).checked;
        rule.overridePrep = !!(document.getElementById('reOv') || {}).checked;
      }
      var p = activeProfile();
      var i = (p.rules || []).findIndex(function (x) { return x.id === rule.id; });
      if (i >= 0) p.rules[i] = rule; else { p.rules = p.rules || []; p.rules.push(rule); }
      R().saveProfile(p); box.innerHTML = ''; render();
    };
  }

  function showTest() {
    var name = prompt('Test item / dish wording', 'roasted pumpkin puree');
    if (name == null) return;
    var legend = prompt('Legend label (optional)', 'puree');
    var out = R().preview({ task: name, item: name, legendLabel: legend || '', section: 'Sandwich', pax: 120 });
    var box = document.getElementById('rpPrev');
    box.hidden = false;
    box.innerHTML = '<b>Preview</b> for <code>' + esc(name) + '</code>' + (legend ? ' · legend <code>' + esc(legend) + '</code>' : '') +
      '<div>category: <b>' + esc(out.category || '—') + '</b> · lead: <b>' + (out.leadDays == null ? '—' : out.leadDays) + '</b> · staff: <b>' + (out.staff == null ? '—' : out.staff) + '</b></div>' +
      '<div style="font-size:12px;color:#5C5A52">matched ' + out.matched.length + ' rule(s)' + (out.notes.length ? ' · ' + esc(out.notes.join('; ')) : '') + '</div>';
  }

  function field(label, html) { return '<label style="display:flex;flex-direction:column;gap:4px;font-size:12px"><span>' + label + '</span>' + html + '</label>'; }
  function sel(id, opts, cur) {
    return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + o + '"' + (o === cur ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>';
  }
  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function num(id, d) { var e = document.getElementById(id); if (!e || e.value === '') return d; var n = Number(e.value); return Number.isFinite(n) ? n : d; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function escAttr(s) { return esc(s).replace(/\n/g, ' '); }

  function wireButton() {
    var row = document.getElementById('sampleRow') || document.getElementById('dbPanel');
    if (!row || document.getElementById('openRulesBtn')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'secondary'; b.id = 'openRulesBtn';
    b.textContent = '⚙️ Venue rules';
    b.onclick = openRules;
    row.appendChild(b);
  }

  root.openRules = openRules;
  root.closeRules = closeRules;
  document.addEventListener('DOMContentLoaded', wireButton);
  if (document.readyState !== 'loading') wireButton();
})(window);
