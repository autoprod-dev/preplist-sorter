/* Prepline venue rules engine (rules-engine branch).
 * Profiles in localStorage. Default profile mirrors prep-days-vocab.js + ALLOC_RATIOS.
 * Rule types: colour | keyword | packs | staffing | ifthen
 */
(function (root) {
  'use strict';
  var STORE = 'prepline.rules.v1';
  var ACTIVE = 'prepline.rules.active';

  function uid() { return 'r' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

  function defaultFromVocab() {
    var vocab = Array.isArray(root.PREP_DAYS_VOCAB) ? root.PREP_DAYS_VOCAB : [];
    var rules = [];
    // Colour-meaning rules: legend labels -> category / lead (colours bound at runtime from sheet legend)
    vocab.forEach(function (c, i) {
      (c.legend || []).forEach(function (lab) {
        rules.push({
          id: uid(), type: 'colour', enabled: true, priority: i,
          name: 'Legend: ' + lab + ' → ' + c.label,
          colour: '', legendLabel: lab, category: c.key, leadDays: c.lead,
          weekendShift: !!c.weekendShift, stack: false
        });
      });
      (c.words || []).forEach(function (w) {
        rules.push({
          id: uid(), type: 'keyword', enabled: true, priority: 100 + i,
          name: 'Keyword: ' + w + ' → ' + c.label,
          field: 'name', op: 'contains', value: w.replace(/\*$/, ''), wildcard: /\*$/.test(w),
          category: c.key, leadDays: c.lead, weekendShift: !!c.weekendShift, stack: false
        });
      });
    });
    // Staffing defaults from ALLOC_RATIOS shape (service Sandwich other brackets)
    var R = (root.AllocRaw && root.AllocRaw.ALLOC_RATIOS) || root.ALLOC_RATIOS || null;
    if (R && R.service) {
      Object.keys(R.service).forEach(function (sec) {
        var t = R.service[sec].other || R.service[sec].sydEats || [];
        t.forEach(function (pair) {
          rules.push({
            id: uid(), type: 'staffing', enabled: true, priority: 500,
            name: 'Staff ' + sec + ' ≤' + pair[0] + ' → ' + pair[1] + ' chefs',
            section: sec, mode: 'service', paxMax: pair[0], chefs: pair[1], round: 'none', stack: false
          });
        });
      });
    }
    // Packs example (disabled by default so defaults match prior behaviour)
    rules.push({
      id: uid(), type: 'packs', enabled: false, priority: 600,
      name: '1 pack per 10 pax (example, off)',
      per: 10, unit: 'pack', round: 'up', stack: false
    });
    // 4.4.2 editable exception: crab croquettes (bulked/frozen) → 4-day weekend-shift group
    // Priority 5 beats seafood "crab" keyword (100+) so the exception wins under first-match.
    rules.push({
      id: uid(), type: 'keyword', enabled: true, priority: 5,
      name: 'Crab croquettes (bulked/frozen) → 4-day group',
      field: 'name', op: 'contains', value: 'crab croquette', wildcard: false,
      category: 'crabcroq', leadDays: 4, weekendShift: true, overridePrep: true, stack: false
    });
    // 4.8.24 Gerard: prawns prep 1 day before (Paula orders day-before for freshness); not Mon/Sat early-batched.
    // Priority 5 so these beat any leftover seafood prawn/shrimp keywords on older profiles.
    ['prawn', 'prawns', 'shrimp', 'shrimps'].forEach(function (w) {
      rules.push({
        id: uid(), type: 'keyword', enabled: true, priority: 5,
        name: 'Prawns → 1-day (order day-before)',
        field: 'name', op: 'contains', value: w, wildcard: false,
        category: 'prawn', leadDays: 1, weekendShift: true, overridePrep: true, stack: false
      });
    });
    var batchable = {};
    (Array.isArray(root.PREP_DAYS_VOCAB) ? root.PREP_DAYS_VOCAB : []).forEach(function (c) {
      // Default on for protein/veg/dry/oil/sauce/starch/dairy/dressing; off for garnish/micro/prawn
      var on = (c.family === 'protein' || c.family === 'veg' || c.family === 'sauce' ||
        c.family === 'starch' || c.family === 'dairy' || c.family === 'dressing' ||
        c.key === 'dry' || c.key === 'oil' || c.key === 'crabcroq');
      batchable[c.key] = !!on;
    });
    batchable.prawn = false; /* 4.8.24: never early-batch prawns (Mon/Sat packing) */
    batchable.garnish = false;
    batchable.micro = false;
    return {
      id: 'default',
      name: 'Default',
      builtIn: true,
      matchMode: 'first', // first | stack
      weekendShift: true, // 4.6.2: weekend avoidance for ALL categories (profile toggle)
      allowSaturdayStarts: false, // default: no Saturday starts
      saturdayCap: 3, // optional soft cap when Saturday starts allowed
      prepDaysVersion: '4.8.26',
      batchable: batchable, // cross-dish batching on/off per prep category
      rules: rules,
      updatedAt: new Date().toISOString()
    };
  }

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && Array.isArray(o.profiles) && o.profiles.length) {
          // 4.4.2: refresh built-in Default so micro lead 1, weekendShift, crab croquette rule land
          if (!o.version || o.version < 2) {
            var fresh = defaultFromVocab();
            var di = o.profiles.findIndex(function (p) { return p.id === 'default'; });
            if (di >= 0 && o.profiles[di].builtIn) o.profiles[di] = fresh;
            else if (di < 0) o.profiles.unshift(fresh);
            o.version = 2;
            saveStore(o);
          }
          // 4.6.0: ensure every profile has a batchable map
          if (!o.version || o.version < 3) {
            var defB = defaultFromVocab().batchable || {};
            o.profiles.forEach(function (pr) {
              if (!pr.batchable || typeof pr.batchable !== 'object') pr.batchable = Object.assign({}, defB);
              else {
                Object.keys(defB).forEach(function (k) {
                  if (pr.batchable[k] === undefined) pr.batchable[k] = defB[k];
                });
              }
            });
            o.version = 3;
            saveStore(o);
          }
          // 4.6.2: weekend avoidance + Sat toggles; refresh built-in Default leads/windows
          if (!o.version || o.version < 4) {
            var fresh4 = defaultFromVocab();
            o.profiles.forEach(function (pr) {
              if (pr.allowSaturdayStarts === undefined) pr.allowSaturdayStarts = false;
              if (pr.saturdayCap === undefined) pr.saturdayCap = 3;
              if (pr.weekendShift === undefined) pr.weekendShift = true;
              if (pr.id === 'default' && pr.builtIn) {
                pr.rules = fresh4.rules;
                pr.batchable = Object.assign({}, fresh4.batchable, pr.batchable || {});
                pr.weekendShift = pr.weekendShift !== false;
                pr.allowSaturdayStarts = !!pr.allowSaturdayStarts;
                pr.saturdayCap = Number.isFinite(Number(pr.saturdayCap)) ? Number(pr.saturdayCap) : 3;
                pr.prepDaysVersion = '4.6.2';
              }
            });
            o.version = 4;
            saveStore(o);
          }
          // 4.8.24: prawn lead=1 + not batchable; refresh built-in Default rules/batchable
          if (!o.version || o.version < 5) {
            var fresh5 = defaultFromVocab();
            o.profiles.forEach(function (pr) {
              if (!pr.batchable || typeof pr.batchable !== 'object') pr.batchable = Object.assign({}, fresh5.batchable);
              else {
                Object.keys(fresh5.batchable || {}).forEach(function (k) {
                  if (pr.batchable[k] === undefined) pr.batchable[k] = fresh5.batchable[k];
                });
                pr.batchable.prawn = false;
              }
              if (pr.id === 'default' && pr.builtIn) {
                pr.rules = fresh5.rules;
                pr.batchable = Object.assign({}, fresh5.batchable);
                pr.batchable.prawn = false;
                pr.prepDaysVersion = '4.8.24';
              }
            });
            o.version = 5;
            saveStore(o);
          }
          // 4.8.25: Gerard soft/hard veg + micro 1-day not batched; refresh built-in Default
          if (!o.version || o.version < 6) {
            var fresh6 = defaultFromVocab();
            o.profiles.forEach(function (pr) {
              if (!pr.batchable || typeof pr.batchable !== 'object') pr.batchable = Object.assign({}, fresh6.batchable);
              else {
                Object.keys(fresh6.batchable || {}).forEach(function (k) {
                  if (pr.batchable[k] === undefined) pr.batchable[k] = fresh6.batchable[k];
                });
              }
              pr.batchable.micro = false;
              pr.batchable.prawn = false;
              if (pr.id === 'default' && pr.builtIn) {
                pr.rules = fresh6.rules;
                pr.batchable = Object.assign({}, fresh6.batchable);
                pr.batchable.micro = false;
                pr.batchable.prawn = false;
                pr.prepDaysVersion = '4.8.25';
              }
            });
            o.version = 6;
            saveStore(o);
          }
          // 4.8.26: puree=2, poultry/cheese=3, long-life gels/soils; refresh Default
          if (!o.version || o.version < 7) {
            var fresh7 = defaultFromVocab();
            o.profiles.forEach(function (pr) {
              if (!pr.batchable || typeof pr.batchable !== 'object') pr.batchable = Object.assign({}, fresh7.batchable);
              else {
                Object.keys(fresh7.batchable || {}).forEach(function (k) {
                  if (pr.batchable[k] === undefined) pr.batchable[k] = fresh7.batchable[k];
                });
              }
              pr.batchable.micro = false;
              pr.batchable.prawn = false;
              if (pr.id === 'default' && pr.builtIn) {
                pr.rules = fresh7.rules;
                pr.batchable = Object.assign({}, fresh7.batchable);
                pr.batchable.micro = false;
                pr.batchable.prawn = false;
                pr.prepDaysVersion = '4.8.26';
              }
            });
            o.version = 7;
            saveStore(o);
          }
          return o;
        }
      }
    } catch (e) {}
    var def = defaultFromVocab();
    var store = { profiles: [def], version: 7 };
    saveStore(store);
    return store;
  }

  function saveStore(store) {
    try { localStorage.setItem(STORE, JSON.stringify(store)); } catch (e) {}
  }

  function activeId() {
    try { return localStorage.getItem(ACTIVE) || 'default'; } catch (e) { return 'default'; }
  }
  function setActiveId(id) {
    try { localStorage.setItem(ACTIVE, id); } catch (e) {}
  }

  function getProfile(id) {
    var s = loadStore();
    return s.profiles.find(function (p) { return p.id === (id || activeId()); }) || s.profiles[0];
  }

  function listProfiles() { return loadStore().profiles.slice(); }

  function saveProfile(profile) {
    var s = loadStore();
    profile.updatedAt = new Date().toISOString();
    var i = s.profiles.findIndex(function (p) { return p.id === profile.id; });
    if (i >= 0) s.profiles[i] = profile; else s.profiles.push(profile);
    saveStore(s);
    return profile;
  }

  function deleteProfile(id) {
    if (id === 'default') return false;
    var s = loadStore();
    s.profiles = s.profiles.filter(function (p) { return p.id !== id; });
    saveStore(s);
    if (activeId() === id) setActiveId('default');
    return true;
  }

  function resetDefault() {
    var s = loadStore();
    var def = defaultFromVocab();
    var i = s.profiles.findIndex(function (p) { return p.id === 'default'; });
    if (i >= 0) s.profiles[i] = def; else s.profiles.unshift(def);
    saveStore(s);
    setActiveId('default');
    return def;
  }

  function exportProfile(id) {
    return JSON.stringify(getProfile(id), null, 2);
  }

  function importProfile(json, asNew) {
    var p = typeof json === 'string' ? JSON.parse(json) : json;
    if (!p || !Array.isArray(p.rules)) throw new Error('Not a Prepline rules profile');
    if (asNew || p.id === 'default') {
      p.id = uid();
      p.name = (p.name || 'Imported') + ' (imported)';
      p.builtIn = false;
    }
    return saveProfile(p);
  }

  function syncBatchableToUi(profile) {
    var p = profile || getProfile();
    if (!root.PreplineBatch || !p) return;
    try {
      var st = {};
      if (p.batchable) st.batchable = p.batchable;
      if (typeof p.allowSaturdayStarts === 'boolean') st.allowSaturdayStarts = p.allowSaturdayStarts;
      if (Number.isFinite(Number(p.saturdayCap))) st.saturdayCap = Number(p.saturdayCap);
      if (typeof p.weekendShift === 'boolean') st.avoidWeekend = p.weekendShift !== false;
      root.PreplineBatch.loadState(st);
    } catch (e) {}
  }


  function norm(t) {
    return String(t == null ? '' : t).toLowerCase().replace(/[ée]/g, function (m) { return m === 'é' ? 'e' : m; });
  }

  function matchOp(fieldVal, op, value, wildcard) {
    var a = norm(fieldVal), b = norm(value);
    if (op === 'contains') {
      if (wildcard) return a.indexOf(b) >= 0 || new RegExp('(^|[^a-z])' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(a);
      return a.indexOf(b) >= 0;
    }
    if (op === 'equals') return a === b;
    if (op === 'gt') return Number(fieldVal) > Number(value);
    if (op === 'lt') return Number(fieldVal) < Number(value);
    if (op === 'between') {
      var parts = String(value).split(/[,|]/);
      return Number(fieldVal) >= Number(parts[0]) && Number(fieldVal) <= Number(parts[1]);
    }
    return false;
  }

  function fieldOf(row, field) {
    if (!row) return '';
    if (field === 'name' || field === 'item' || field === 'task') return row.task || row.item || row.name || row.dish || '';
    if (field === 'section') return row.section || '';
    if (field === 'pax') return row.pax;
    if (field === 'date') return row.date || row.eventDate || '';
    if (field === 'day') return row.day || row.dayName || '';
    if (field === 'colour' || field === 'color') return row.colour || row.fill || row.legendLabel || '';
    if (field === 'type' || field === 'category') return row.prepCat || row.category || row.cat || '';
    return row[field];
  }

  /** Evaluate rules against a row. Returns accumulated actions. */
  function evaluate(row, opts) {
    opts = opts || {};
    var profile = opts.profile || getProfile();
    var mode = opts.matchMode || profile.matchMode || 'first';
    var legendLabel = opts.legendLabel || row.legendLabel || '';
    var colour = (row.colour || row.fill || '').toString().replace(/^#/, '').toUpperCase();
    var out = { category: null, leadDays: null, weekendShift: null, overridePrep: false, staff: null, packs: null, highlight: null, hide: false, notes: [], matched: [], src: '' };
    var rules = (profile.rules || []).filter(function (r) { return r.enabled !== false; })
      .slice().sort(function (a, b) { return (a.priority || 0) - (b.priority || 0); });

    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      var hit = false;
      if (r.type === 'colour') {
        var lab = norm(r.legendLabel || '');
        if (lab && norm(legendLabel) === lab) hit = true;
        if (!hit && r.colour && colour && colour === String(r.colour).replace(/^#/, '').toUpperCase()) hit = true;
      } else if (r.type === 'keyword') {
        hit = matchOp(fieldOf(row, r.field || 'name'), r.op || 'contains', r.value, r.wildcard);
      } else if (r.type === 'packs') {
        hit = true; // applies when asked for packs
      } else if (r.type === 'staffing') {
        var pax = Number(row.pax);
        if (r.section && row.section && norm(row.section) !== norm(r.section)) hit = false;
        else if (Number.isFinite(pax) && Number.isFinite(r.paxMax) && pax <= r.paxMax) hit = true;
        else if (r.paxMax === Infinity || r.paxMax == null) hit = Number.isFinite(pax);
      } else if (r.type === 'ifthen') {
        hit = matchOp(fieldOf(row, r.field || 'name'), r.op || 'contains', r.value, r.wildcard);
      }
      if (!hit) continue;
      out.matched.push(r.id);
      applyAction(out, r);
      if (mode === 'first' && !r.stack) break;
    }
    return out;
  }

  function applyAction(out, r) {
    if (r.category != null && r.category !== '') { out.category = r.category; out.src = r.type; }
    if (r.leadDays != null && r.leadDays !== '') out.leadDays = Number(r.leadDays);
    if (r.weekendShift != null) out.weekendShift = !!r.weekendShift;
    if (r.overridePrep) out.overridePrep = true;
    if (r.type === 'staffing' && r.chefs != null) {
      var n = Number(r.chefs);
      if (r.round === 'up') n = Math.ceil(n);
      else if (r.round === 'down') n = Math.floor(n);
      else if (r.round === 'nearest') n = Math.round(n);
      out.staff = n;
    }
    if (r.type === 'packs' || r.packsPer != null) {
      var per = Number(r.per || r.packsPer || 10);
      var pax = Number(out._pax != null ? out._pax : 0);
    }
    if (r.action === 'set_category' || r.thenCategory) out.category = r.thenCategory || r.category;
    if (r.action === 'set_lead' || r.thenLead != null) out.leadDays = Number(r.thenLead != null ? r.thenLead : r.leadDays);
    if (r.action === 'set_staff' || r.thenStaff != null) out.staff = Number(r.thenStaff != null ? r.thenStaff : r.chefs);
    if (r.action === 'highlight' || r.thenHighlight) out.highlight = r.thenHighlight || r.highlight;
    if (r.action === 'hide' || r.thenHide) out.hide = true;
    if (r.action === 'note' || r.thenNote) out.notes.push(r.thenNote || r.note || '');
    if (r.type === 'ifthen') {
      if (r.thenCategory) out.category = r.thenCategory;
      if (r.thenLead != null && r.thenLead !== '') out.leadDays = Number(r.thenLead);
      if (r.thenStaff != null && r.thenStaff !== '') out.staff = Number(r.thenStaff);
      if (r.thenHighlight) out.highlight = r.thenHighlight;
      if (r.thenHide) out.hide = true;
      if (r.thenNote) out.notes.push(r.thenNote);
    }
  }

  function packsFor(pax, rule) {
    rule = rule || {};
    var per = Number(rule.per || 10) || 10;
    var n = Number(pax) / per;
    if (rule.round === 'down') return Math.floor(n);
    if (rule.round === 'nearest') return Math.round(n);
    return Math.ceil(n); // default up
  }

  /** Build a PREP_DAYS_VOCAB-compatible array from colour+keyword rules (for prepVocab hook). */
  function vocabFromProfile(profile) {
    profile = profile || getProfile();
    var byKey = {};
    (profile.rules || []).forEach(function (r) {
      if (r.enabled === false) return;
      if (r.type !== 'colour' && r.type !== 'keyword') return;
      var key = r.category; if (!key) return;
      if (!byKey[key]) byKey[key] = { key: key, label: key, lead: Number.isFinite(r.leadDays) ? r.leadDays : 0, family: key, weekendShift: !!r.weekendShift, legend: [], words: [] };
      if (Number.isFinite(r.leadDays)) byKey[key].lead = r.leadDays;
      if (r.weekendShift) byKey[key].weekendShift = true;
      if (r.type === 'colour' && r.legendLabel) byKey[key].legend.push(norm(r.legendLabel));
      if (r.type === 'keyword' && r.value) byKey[key].words.push(r.wildcard ? r.value + '*' : r.value);
    });
    // Prefer built-in labels/order when keys match
    var vocab = Array.isArray(root.PREP_DAYS_VOCAB) ? root.PREP_DAYS_VOCAB : [];
    var out = [];
    var seen = {};
    vocab.forEach(function (c) {
      if (byKey[c.key]) {
        out.push({
          key: c.key, label: c.label, lead: byKey[c.key].lead, family: c.family,
          weekendShift: c.weekendShift === true || byKey[c.key].weekendShift === true,
          legend: byKey[c.key].legend.length ? byKey[c.key].legend : (c.legend || []).slice(),
          words: byKey[c.key].words.length ? byKey[c.key].words : (c.words || []).slice()
        });
        seen[c.key] = 1;
      } else {
        out.push(c);
        seen[c.key] = 1;
      }
    });
    Object.keys(byKey).forEach(function (k) { if (!seen[k]) out.push(byKey[k]); });
    return out;
  }

  function preview(row, opts) {
    return evaluate(row, opts);
  }

  var API = {
    STORE: STORE, uid: uid, defaultFromVocab: defaultFromVocab,
    loadStore: loadStore, getProfile: getProfile, listProfiles: listProfiles,
    saveProfile: saveProfile, deleteProfile: deleteProfile, resetDefault: resetDefault,
    syncBatchableToUi: syncBatchableToUi,
    activeId: activeId, setActiveId: setActiveId,
    exportProfile: exportProfile, importProfile: importProfile,
    evaluate: evaluate, preview: preview, packsFor: packsFor, vocabFromProfile: vocabFromProfile
  };
  root.PreplineRules = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : global);
