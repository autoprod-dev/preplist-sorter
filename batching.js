/* Prepline 4.8.17 — food-type lead windows + smart-chef batching.
 * Batch key: prepCat + normalised name + method + unit (never mix food types in one pack).
 * Prep day is ALWAYS strictly before earliest member use (never same-day).
 * winMax = min(category batchWindow, row.leadDays when set) — never exceed food-type lead.
 * Per-ingredient greedy (sorted uses, start at earliest U):
 *   - Candidate prep days U-winMax .. U-1, Sunday never
 *   - Saturday: allowed for 4-day protein multi-use (>=2) even when allowSaturdayStarts is off;
 *     subject to saturdayCap (overflow → Friday). Singletons use weekend avoidance (no Sat unless allowed).
 *   - Cover: forwardDays(prep, use) in [1, maxFwd]; Saturday maxFwd = min(winMax, 4) (through Wed);
 *     other days maxFwd = winMax (4-day protein Mon can cover through Fri)
 *   - Pick day covering the most subsequent uses; multi-use 4-day proteins require min lead 2;
 *     tie → earliest valid day (Gerard 4.8.9) + Saturday prefer. Solo → prepStartFromLead then clamp to winMax.
 *   - dayMoves: only applied when dest still covers every member within that pack's winMax.
 * Fish/seafood window 2 (4.8.13 Gerard): collect/trim then process/count/tray; Mon-event → Sat.
 * Prawns window 1 + not batchable (4.8.24 Gerard): Paula orders day-before for freshness; no Mon/Sat early pack.
 * Veg 4.8.12: vegraw≤4 (collect/trim), vegcook≤3 (cook stages); batch only within same stage.
 * Veg 4.8.25 Gerard: vegsoft=2, veghard=4 (named lists); micro=1 not early-batched.
 * 4.8.17 long-life (dressings, croutons, dry powders/crumbs, oils): last ~2 weeks — pack ALL
 * week rows of the same item onto ONE prep day = up to 4 days before earliest function
 * (Sunday never / Saturday cap). Overrides prior oils/dressing multi-pack splits.
 */
(function (root) {
  'use strict';
  var WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };

  var DEFAULT_BATCHABLE = {
    poultry: true, redmeat: true, seafood: true, prawn: false, veg: true, vegsoft: true, veghard: true, vegraw: true, vegcook: true, dry: true, oil: true,
    gels: true, puree: true, dressing: true, dairy: true, cheese: true, starch: true, crabcroq: true,
    garnish: false, micro: false
  };

  // 4-day proteins share window 4; seafood/fish window 2 (4.8.13); prawns window 1 non-batchable (4.8.24).
  var DEFAULT_BATCH_WINDOW = {
    /* proteins 4; seafood 2; prawn 1; vegsoft 2 / veghard 4 (4.8.25); vegraw 4 / vegcook|veg 3; garnish 2 */
    poultry: 3, redmeat: 4, seafood: 2, prawn: 1, veg: 3, vegsoft: 2, veghard: 4, vegraw: 4, vegcook: 3, dry: 4, oil: 4,
    gels: 3, puree: 2, dressing: 4, dairy: 4, cheese: 3, starch: 3, crabcroq: 4,
    garnish: 2, micro: 1
  };

  var state = {
    batchAcrossOn: true,
    unbatched: {},
    dayFilter: 'all',
    sectionFilter: 'all',
    listAnchor: 'prep',
    batchable: Object.assign({}, DEFAULT_BATCHABLE),
    allowSaturdayStarts: false,
    saturdayCap: 3,
    avoidWeekend: true,
    dayMoves: {} /* batchKey → overridden prep weekday */
  };

  function dayIdx(d) { return WEEKDAYS.indexOf(d); }
  function shortDay(d) { return SHORT[d] || (d ? String(d).slice(0, 3) : '—'); }
  function forwardDays(from, to) {
    var a = dayIdx(from), b = dayIdx(to);
    if (a < 0 || b < 0) return null;
    return (b - a + 7) % 7;
  }
  function shiftBack(day, n) {
    var i = dayIdx(day);
    if (i < 0) return '';
    return WEEKDAYS[((i - n) % 7 + 7) % 7];
  }

  function categoryWindow(cat) {
    if (cat && Object.prototype.hasOwnProperty.call(DEFAULT_BATCH_WINDOW, cat)) {
      return DEFAULT_BATCH_WINDOW[cat];
    }
    try {
      var vocab = root.PREP_DAYS_VOCAB || [];
      for (var i = 0; i < vocab.length; i++) {
        if (vocab[i].key === cat && Number.isFinite(vocab[i].batchWindow)) return vocab[i].batchWindow;
      }
    } catch (e) {}
    return null;
  }

  /** Effective lead window: never wider than the food-type batchWindow or the row's leadDays. */
  function batchWindowFor(cat, lead) {
    var catWin = categoryWindow(cat);
    var L = Number(lead);
    var leadWin = (Number.isFinite(L) && L > 0) ? L : null;
    if (catWin != null && leadWin != null) return Math.min(catWin, leadWin);
    if (catWin != null) return catWin;
    if (leadWin != null) return leadWin;
    return 3; /* default window */
  }

  /**
   * Weekend avoidance (ALL categories when enabled):
   * Sunday never. Sat/Sun raw → Monday, unless Monday on/after function → Friday.
   * Saturday kept only when allowSaturdayStarts.
   */
  function weekendAdjust(rawDay, functionDay, opts) {
    opts = opts || {};
    var allowSat = opts.allowSaturday != null ? !!opts.allowSaturday : !!state.allowSaturdayStarts;
    var avoid = opts.avoidWeekend != null ? !!opts.avoidWeekend : (state.avoidWeekend !== false);
    var raw = rawDay;
    if (!raw) return { day: '', reason: '', raw: '' };

    if (raw === 'Saturday' && allowSat) {
      return { day: 'Saturday', reason: '', raw: raw };
    }
    if (raw !== 'Saturday' && raw !== 'Sunday') {
      return { day: raw, reason: '', raw: raw };
    }
    // Sunday always shifts; Saturday shifts when not allowed
    if (!avoid && raw === 'Sunday') {
      // Sunday never even if avoid off
    } else if (!avoid && raw === 'Saturday' && !allowSat) {
      // still shift Sat when disallowed
    } else if (!avoid) {
      return { day: raw, reason: '', raw: raw };
    }

    var leadFromRaw = forwardDays(raw, functionDay);
    if (leadFromRaw == null) {
      return { day: 'Friday', reason: 'Moved from ' + shortDay(raw) + ' to Fri (weekend)', raw: raw };
    }
    var forward = raw === 'Saturday' ? 2 : 1;
    var leadMon = leadFromRaw - forward;
    if (leadMon <= 0) {
      return { day: 'Friday', reason: 'Moved from ' + shortDay(raw) + ' to Fri (weekend)', raw: raw };
    }
    return { day: 'Monday', reason: 'Moved from ' + shortDay(raw) + ' to Mon (weekend)', raw: raw };
  }

  /** Compute prep start day from function + lead with weekend avoidance. */
  function prepStartFromLead(functionDay, lead, opts) {
    opts = opts || {};
    if (!functionDay || !Number.isFinite(Number(lead))) return { day: '', reason: '', raw: '' };
    var raw = shiftBack(functionDay, Number(lead));
    var adj = weekendAdjust(raw, functionDay, opts);
    var blocked = opts.blockedDays;
    var day = adj.day;
    var reason = adj.reason;
    var guard = 0;
    while (guard++ < 7 && day && blocked && blocked.has && blocked.has(day)) {
      // push earlier (more lead)
      var k = forwardDays(day, functionDay);
      if (k == null) break;
      var nextRaw = shiftBack(functionDay, k + 1);
      var next = weekendAdjust(nextRaw, functionDay, opts);
      day = next.day;
      if (next.reason) reason = next.reason;
    }
    if (day === 'Sunday') {
      var fix = weekendAdjust('Sunday', functionDay, opts);
      day = fix.day; reason = fix.reason || reason;
    }
    return { day: day, reason: reason, raw: raw };
  }

  function normText(s) {
    return String(s || '').toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9\s/+\-.]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  /* Primary cooking methods — order = preference when several verbs appear in a pipeline */
  var METHOD_VERBS = [
    'sous vide', 'deep fry', 'pat dry',
    'trim', 'wash', 'blanch', 'steam', 'roast', 'grill', 'sear', 'dice', 'slice', 'peel',
    'julienne', 'brunoise', 'chiffonade', 'portion', 'crumb', 'bread', 'marinate', 'brine',
    'confit', 'braise', 'poach', 'fry', 'puree', 'reduce', 'glaze',
    'pickle', 'pick', 'chop', 'mince', 'grate', 'zest', 'segment', 'debone', 'butterfly',
    'tie', 'roll', 'press', 'chill', 'freeze', 'thaw', 'defrost', 'strain', 'whisk', 'blend',
    'emulsify', 'infuse', 'render', 'clarify', 'skim', 'toast', 'char', 'smoke', 'cure',
    'ferment', 'proof', 'bake', 'cook', 'make', 'prep', 'collect', 'weigh', 'drain',
    'assemble', 'mold', 'mould', 'bag', 'tray', 'rub', 'oven', 'pull', 'mix', 'set', 'boil'
  ];
  var METHOD_ALIASES = {
    sv: 'sous vide', 'sous-vide': 'sous vide', sousvide: 'sous vide',
    puree: 'puree', 'purée': 'puree', pureed: 'puree', 'puréed': 'puree',
    mould: 'mold', saut: 'saute', saute: 'saute', 'sauté': 'saute'
  };
  /* Synonyms / abbrev → canonical ingredient tokens (applied before sort) */
  var NAME_SYNONYMS = {
    'dutch carrot': 'carrot', 'dutch carrots': 'carrot', 'baby carrot': 'carrot', 'baby carrots': 'carrot',
    'aubergine': 'eggplant', 'capsicum': 'pepper', 'capsicums': 'pepper', 'bell pepper': 'pepper',
    'shallot': 'eschalot', 'shallots': 'eschalot', 'spring onion': 'scallion', 'green onion': 'scallion',
    'courgette': 'zucchini', 'bok choy': 'bokchoy', 'pak choy': 'bokchoy',
    'microherb': 'micro herb', 'microherbs': 'micro herb', 'micro herbs': 'micro herb', 'micros': 'micro herb',
    'puree': 'puree', 'purée': 'puree', 'purees': 'puree', 'purées': 'puree',
    'wagyu': 'beef', 'eye fillet': 'beef', 'scotch fillet': 'beef', 't-bone': 'beef',
    'barra': 'barramundi', 'king salmon': 'salmon', 'ocean trout': 'trout',
    'bannockburn': 'chicken', 'spatch': 'spatchcock'
  };
  /* Base produce for shared mise (strip colour/size/diet tags) */
  var BASE_INGREDIENTS = [
    'carrot','potato','onion','leek','celery','celeriac','fennel','beetroot','pumpkin','zucchini',
    'eggplant','mushroom','cauliflower','broccoli','asparagus','pea','bean','kale','spinach',
    'cabbage','tomato','cucumber','radish','corn','garlic','lettuce','artichoke','parsnip',
    'turnip','chicken','duck','beef','lamb','pork','salmon','prawn','scallop','barramundi',
    'cod','trout','warrigal','karkalla','samphire','apple','orange','lemon','lime','yuzu'
  ];
  var MISE_HINTS = {
    carrot: 'Peel / trim carrots once for all carrot lines',
    potato: 'Peel / cook potatoes once where windows allow',
    onion: 'Peel / dice onions as shared mise',
    garlic: 'Peel garlic once for oils, purees and proteins',
    chicken: 'Break / portion chicken once for shared uses',
    duck: 'Break / portion duck once for shared uses',
    lemon: 'Zest / juice lemons once for shared uses',
    asparagus: 'Trim asparagus once for all asparagus lines',
    pea: 'Pod / blanch peas once where windows allow',
    mushroom: 'Clean mushrooms once for ragu / soil / garnish'
  };

  function stripTrailingQty(s) {
    return String(s || '')
      .replace(/\b\d+([.,]\d+)?\s*(kg|g|gm|gms|grams?|kgs?|kilos?|ml|l|lt|ltr|litres?|each|ea|pcs?|pieces?|portions?)\b/gi, ' ')
      .replace(/\b\d+([.,]\d+)?\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function singularToken(w) {
    if (w.length <= 3) return w;
    if (/ies$/.test(w) && w.length > 4) return w.replace(/ies$/, 'y');
    if (/(ches|shes|xes|zes|sses)$/.test(w)) return w.replace(/es$/, '');
    if (/s$/.test(w) && !/ss$/.test(w) && !/us$/.test(w) && !/is$/.test(w)) return w.replace(/s$/, '');
    return w;
  }
  function applyNameSynonyms(s) {
    var out = ' ' + String(s || '').toLowerCase() + ' ';
    out = out.replace(/[ée]/g, function (m) { return m === 'é' ? 'e' : m; });
    Object.keys(NAME_SYNONYMS).sort(function (a, b) { return b.length - a.length; }).forEach(function (k) {
      var re = new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '\\b', 'gi');
      out = out.replace(re, ' ' + NAME_SYNONYMS[k] + ' ');
    });
    return out.replace(/\s+/g, ' ').trim();
  }
  function canonicalName(name) {
    var n = applyNameSynonyms(name);
    var toks = String(n || '').toLowerCase().split(/\s+/).filter(Boolean)
      .map(singularToken)
      .filter(function (w) {
        return w && w !== 'and' && w !== 'with' && w !== 'of' && w !== 'the' && w !== 'a' && w !== 'an'
          && w !== 'orange' && w !== 'yellow' && w !== 'red' && w !== 'green' && w !== 'baby' && w !== 'dutch'
          && w !== 'df' && w !== 'gf' && w !== 'vg' && w !== 'vegan' && w !== 'halal';
      });
    toks.sort();
    return toks.join(' ');
  }
  function baseIngredientOf(name) {
    var n = applyNameSynonyms(name);
    var toks = String(n || '').toLowerCase().split(/\s+/).map(singularToken);
    if (toks.length && (toks[toks.length-1] === 'oil' || toks[toks.length-1] === 'oils')) return '';
    for (var i = 0; i < BASE_INGREDIENTS.length; i++) {
      if (toks.indexOf(BASE_INGREDIENTS[i]) >= 0) return BASE_INGREDIENTS[i];
    }
    return toks.filter(function (w) {
      return w && w.length > 2 && METHOD_VERBS.indexOf(w) < 0
        && w !== 'green' && w !== 'oil' && w !== 'sauce' && w !== 'gel' && w !== 'puree';
    })[0] || '';
  }
  function resolveMethod(m) {
    m = String(m || '').toLowerCase().trim();
    if (METHOD_ALIASES[m]) return METHOD_ALIASES[m];
    return m;
  }
  function isMethodToken(s) {
    var m = resolveMethod(String(s || '').toLowerCase().trim());
    if (!m) return false;
    if (METHOD_ALIASES[m] || METHOD_VERBS.indexOf(m) >= 0) return true;
    // multi-word segment that starts with a verb
    for (var i = 0; i < METHOD_VERBS.length; i++) {
      var v = METHOD_VERBS[i];
      if (m === v || m.indexOf(v + ' ') === 0 || m.indexOf(v + '(') === 0) return true;
    }
    return false;
  }
  function primaryMethod(steps) {
    // Prefer distinctive cook methods over wash/trim/tray logistics
    var rank = {
      'sous vide': 100, puree: 95, confit: 90, smoke: 88, cure: 86, brine: 84, roast: 80,
      braise: 78, grill: 76, sear: 74, fry: 72, 'deep fry': 72, poach: 70, steam: 68,
      blanch: 65, bake: 64, reduce: 62, glaze: 60, pickle: 58, blend: 55, marinate: 54,
      portion: 40, dice: 38, slice: 38, peel: 36, trim: 30, wash: 20, bag: 10, tray: 8, cook: 50, make: 45, prep: 5
    };
    var best = '', bestScore = -1;
    (steps || []).forEach(function (s) {
      var m = resolveMethod(s);
      // take first verb in the segment
      for (var i = 0; i < METHOD_VERBS.length; i++) {
        var v = METHOD_VERBS[i];
        if (m === v || m.indexOf(v + ' ') === 0 || new RegExp('^' + v.replace(/ /g, '\\s+') + '\\b').test(m)) {
          var sc = rank[v] != null ? rank[v] : 15;
          if (sc > bestScore) { bestScore = sc; best = v; }
          break;
        }
      }
    });
    return best || 'prep';
  }
  /* Levenshtein for short typo tolerance (threshold 1 for len>=5, 2 for len>=8) */
  function editDist(a, b) {
    a = String(a || ''); b = String(b || '');
    if (a === b) return 0;
    if (!a.length) return b.length; if (!b.length) return a.length;
    var i, j, prev = [], cur = [];
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      prev = cur.slice();
    }
    return prev[b.length];
  }
  function fuzzyMatchToken(tok, lexicon) {
    tok = singularToken(String(tok || '').toLowerCase());
    if (!tok || tok.length < 4) return null;
    var best = null, bd = 99;
    for (var i = 0; i < lexicon.length; i++) {
      var w = lexicon[i];
      if (w === tok) return w;
      if (Math.abs(w.length - tok.length) > 2) continue;
      var d = editDist(tok, w);
      var allow = tok.length >= 8 ? 2 : 1;
      if (d <= allow && d < bd) { bd = d; best = w; }
    }
    return best;
  }
  function fuzzyCanonName(name, lexicon) {
    var toks = String(name || '').toLowerCase().split(/\s+/).filter(Boolean);
    var out = toks.map(function (t) {
      var f = fuzzyMatchToken(t, lexicon);
      return f || singularToken(t);
    });
    out.sort();
    return out.join(' ');
  }

  function parseTaskParts(task) {
    var raw = String(task || '').trim();
    raw = raw.replace(/[àáâãäå]/gi,'a').replace(/[èéêë]/gi,'e').replace(/[ìíîï]/gi,'i')
      .replace(/[òóôõö]/gi,'o').replace(/[ùúûü]/gi,'u').replace(/[ýÿ]/gi,'y').replace(/ñ/gi,'n').replace(/ç/gi,'c');
    var t = stripTrailingQty(normText(raw));
    t = t.replace(/[ée]/g, function (m) { return m === 'é' ? 'e' : m; });
    var method = '', name = t, steps = [];
    var svHit = t.match(/(?:^|\s|\/)(sv|sous[\s-]?vide)(?:\s|$|\/)/i);
    if (svHit) {
      method = 'sous vide';
      name = t.replace(/(?:^|\s|\/)(sv|sous[\s-]?vide)(?:\s|$|\/)/gi, ' ')
        .replace(/\s*\/\s*/g, ' / ').replace(/^\s*\/\s*|\s*\/\s*$/g, ' ').replace(/\s+/g, ' ').trim();
    }
    var slash = name.split(/\s*\/\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (slash.length >= 2) {
      // Name = first non-method segment; remaining method-like segments = pipeline
      var nameParts = [], stepParts = [];
      slash.forEach(function (seg, idx) {
        var clean = stripTrailingQty(seg.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim());
        if (!clean) return;
        if (idx === 0 && !isMethodToken(clean.split(/\s+/)[0])) {
          nameParts.push(clean);
        } else if (isMethodToken(clean) || isMethodToken(clean.split(/\s+/)[0])) {
          stepParts.push(resolveMethod(clean.split(/\s+/)[0]) === clean.split(/\s+/)[0]
            ? resolveMethod(clean.split(/\s+/).slice(0, 2).join(' ')) && METHOD_VERBS.indexOf(resolveMethod(clean.split(/\s+/).slice(0, 2).join(' '))) >= 0
              ? resolveMethod(clean.split(/\s+/).slice(0, 2).join(' '))
              : resolveMethod(clean.split(/\s+/)[0])
            : clean);
          // store fuller step text for pipeline
          steps.push(clean.toLowerCase());
        } else if (!nameParts.length) {
          nameParts.push(clean);
        } else {
          steps.push(clean.toLowerCase());
          stepParts.push(clean.toLowerCase());
        }
      });
      name = nameParts.join(' ') || slash[0];
      if (!method) method = primaryMethod(steps.length ? steps : stepParts);
    } else if (!method) {
      for (var i = 0; i < METHOD_VERBS.length; i++) {
        var v = METHOD_VERBS[i];
        var re = new RegExp('^' + v.replace(/ /g, '\\s+') + '\\b\\s*(?:of\\s+|the\\s+)?');
        if (re.test(name)) { method = v; name = name.replace(re, '').trim(); steps = [v]; break; }
        var re2 = new RegExp('\\b' + v.replace(/ /g, '\\s+') + '$');
        if (re2.test(name)) { method = v; name = name.replace(re2, '').trim(); steps = [v]; break; }
      }
    }
    name = name.replace(/^(the|a|an)\s+/, '').trim();
    name = stripTrailingQty(name);
    if (!name) name = t || 'item';
    var pureeHit = name.match(/^(.*?)\s+(puree|purees|sauce|gel|gels|oil|oils|jus|dressing|vinaigrette)$/i);
    if (pureeHit && pureeHit[1] && pureeHit[1].length >= 3) {
      var pm = pureeHit[2].toLowerCase();
      if (pm.indexOf('puree') === 0) { if (!method || method === 'prep' || method === 'blend' || method === 'cook') method = 'puree'; }
      else if (pm === 'gel' || pm === 'gels') { if (!method || method === 'prep') method = 'gel'; }
      else if (!method || method === 'prep') method = pm.replace(/s$/, '');
      name = pureeHit[1].trim();
    }
    var displayName = name;
    name = applyNameSynonyms(name);
    var canon = canonicalName(name) || name;
    method = resolveMethod(method) || 'prep';
    var base = baseIngredientOf(displayName || name);
    var label = method && method !== 'prep' ? (cap(displayName) + ' / ' + method) : cap(displayName);
    return {
      name: canon,
      method: method,
      label: label,
      displayName: displayName,
      base: base,
      steps: steps,
      miseHint: base && MISE_HINTS[base] ? MISE_HINTS[base] : (base ? ('Shared mise: prep ' + base + ' together where windows allow') : '')
    };
  }
  function cap(s) {
    return String(s || '').replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
  }

  /** Groups rows that share a base ingredient but differ in method — hint only, not merged. */
  function findSharedMise(rows) {
    var byBase = {};
    (rows || []).forEach(function (r, idx) {
      var p = parseTaskParts(r.task || r.item || '');
      if (!p.base) return;
      if (!byBase[p.base]) byBase[p.base] = [];
      byBase[p.base].push({ idx: idx, row: r, parts: p });
    });
    var out = [];
    Object.keys(byBase).forEach(function (base) {
      var list = byBase[base];
      var methods = {};
      list.forEach(function (x) { methods[x.parts.method] = true; });
      if (Object.keys(methods).length < 2 && list.length < 2) return;
      if (Object.keys(methods).length < 2 && list.length < 3) return;
      out.push({
        base: base,
        hint: MISE_HINTS[base] || ('Shared mise: prep ' + base + ' together where windows allow'),
        methods: Object.keys(methods),
        count: list.length,
        labels: list.map(function (x) { return x.parts.label; })
      });
    });
    return out;
  }

  function unitKey(unit, toBaseQty) {
    if (typeof toBaseQty === 'function') {
      try { return toBaseQty(1, unit).key || String(unit || '').toLowerCase(); } catch (e) {}
    }
    var u = String(unit || '').toLowerCase().trim();
    if (/^(g|gm|gms|gram|grams|kg|kgs|kilo|kilos)$/.test(u)) return 'g';
    if (/^(ml|millilitre|millilitres|l|lt|ltr|litre|litres)$/.test(u)) return 'ml';
    return u;
  }

  /**
   * 4.8.17 / 4.8.26 Paula: long-life mise keeps ~2 weeks — dressings, any croutons, powders,
   * crumbs, oils, soils, gels (e.g. Yuzu Gel). Pack all week rows onto one prep day ≤4 before
   * earliest function. Purees are excluded (lead 2 only, no early week pack).
   */
  function isLongLifeRow(row) {
    var cat = String((row && row.prepCat) || '').toLowerCase();
    var t = String((row && (row.task || row.item)) || '').toLowerCase();
    var name = t.split('/')[0] || t;
    /* Puree always wins: never long-life (4.8.26) */
    if (cat === 'puree' || /\bpurees?\b|\bpurées?\b|\bpureed\b/.test(name)) return false;
    if (cat === 'dressing' || cat === 'oil' || cat === 'dry') return true;
    if (/\bdressing\b|\bvinaigrette\b|\baioli\b|\bmayo\b/.test(name)) return true;
    if (/\bcrouton/.test(t)) return true; /* any croutons, not only curried */
    if (/\b(powder|crumb|crumbs|crumble|dust|dukkah|dukka|panko|furikake|soils?)\b/.test(name)) return true;
    if (/\boil\b/.test(name)) return true;
    /* Gels (name or cat) — not purees (handled above) */
    if (cat === 'gels' && /\bgels?\b|\bfluid\s*gel\b/.test(name)) return true;
    if (/\bfluid\s*gel\b|\bgels?\b/.test(name) && !/\bpurees?\b|\bpurées?\b/.test(name)) return true;
    return false;
  }

  function packLongLifeAll(members, blocked, opts) {
    opts = opts || {};
    var remaining = (members || []).slice().sort(function (a, b) {
      var da = dayIdx(a.eventDay), db = dayIdx(b.eventDay);
      if (da !== db) return da - db;
      return String((a.row && a.row.dish) || '').localeCompare(String((b.row && b.row.dish) || ''));
    });
    if (!remaining.length) return [];
    var earliest = remaining[0].eventDay;
    var latest = remaining[remaining.length - 1].eventDay;
    var allowSat = !!state.allowSaturdayStarts;
    var info = prepStartFromLead(earliest, 4, {
      blockedDays: blocked,
      allowSaturday: allowSat,
      avoidWeekend: state.avoidWeekend !== false
    });
    var day = info.day || '';
    if (day && day === earliest) {
      var push = prepStartFromLead(earliest, 5, {
        blockedDays: blocked,
        allowSaturday: allowSat,
        avoidWeekend: state.avoidWeekend !== false
      });
      if (push.day && push.day !== earliest) {
        day = push.day;
        if (push.reason) info.reason = push.reason;
      }
    }
    if (day === 'Sunday') {
      var fix = weekendAdjust('Sunday', earliest, { allowSaturday: allowSat });
      day = fix.day;
      if (fix.reason) info.reason = fix.reason;
    }
    var span = 0;
    if (dayIdx(earliest) >= 0 && dayIdx(latest) >= 0) span = dayIdx(latest) - dayIdx(earliest);
    var reason = info.reason || '';
    var tag = 'Long-life: all week rows · ≤4 days before earliest function';
    reason = reason ? (reason + ' · ' + tag) : tag;
    if (day === 'Saturday') opts.satUsed = (opts.satUsed || 0) + 1;
    return [{
      members: remaining,
      win: {
        day: day,
        earliestFunc: earliest,
        latestFunc: latest,
        span: span,
        winMax: 4,
        shiftReason: reason,
        rawDay: info.raw || day,
        exceedsLead: false,
        longLife: true
      }
    }];
  }

  function batchKey(row, deps) {
    var parts = parseTaskParts(row.task || row.item);
    var uk = unitKey(row.unit, deps && deps.toBaseQty);
    var cat = String((row && row.prepCat) || '').toLowerCase() || 'unknown';
    /* 4.8.17 long-life: same item across g/ml packs together (ignore unit + cat split). */
    if (isLongLifeRow(row)) {
      /* name only — g/ml and method variants (bake vs prep) still one pack */
      return 'longlife|' + parts.name;
    }
    /* 4.8.11: food-type in key so poultry never packs with seafood under the same name. */
    return cat + '|' + parts.name + '|' + parts.method + '|' + uk;
  }

  function isFourDayProtein(cat) {
    /* 4.8.26: poultry is 3-day — not in 4-day protein Saturday multi-use path */
    return cat === 'redmeat' || cat === 'crabcroq';
  }

  /** Saturday prep lasts through Wednesday (fwd <= 4) when winMax allows; weekdays use full winMax. */
  function maxFwdForPrep(prepDay, winMax) {
    if (prepDay === 'Saturday') return Math.min(winMax, 4);
    return winMax;
  }

  function canCoverUse(prepDay, useDay, winMax, blocked) {
    if (!prepDay || prepDay === 'Sunday') return false;
    if (blocked && blocked.has && blocked.has(prepDay)) return false;
    var fwd = forwardDays(prepDay, useDay);
    if (fwd == null || fwd < 1) return false;
    if (fwd > maxFwdForPrep(prepDay, winMax)) return false;
    return true;
  }

  /**
   * Clamp a candidate prep day into [1, winMax] before useDay.
   * Prefer in-window weekdays; if none (e.g. Mon event + lead 1 → only Sunday),
   * pick the least-excess weekday before the event and mark exceedsLead.
   */
  function clampPrepToLeadWindow(prepDay, useDay, winMax, blocked) {
    var w = Math.max(Number(winMax) || 1, 1);
    if (canCoverUse(prepDay, useDay, w, blocked)) {
      return { day: prepDay, exceedsLead: false, reason: '' };
    }
    var offset, D;
    for (offset = 1; offset <= w; offset++) {
      D = shiftBack(useDay, offset);
      if (canCoverUse(D, useDay, w, blocked)) {
        return { day: D, exceedsLead: false, reason: 'Clamped to ' + shortDay(D) + ' within ' + w + '-day lead' };
      }
    }
    /* No in-window weekday (typical: Monday + 1-day lead → Sunday only). Least excess. */
    var best = null;
    for (offset = 1; offset <= 6; offset++) {
      D = shiftBack(useDay, offset);
      if (!D || D === 'Sunday') continue;
      if (blocked && blocked.has && blocked.has(D)) continue;
      var fwd = forwardDays(D, useDay);
      if (fwd == null || fwd < 1) continue;
      var excess = Math.max(0, fwd - w);
      if (!best || excess < best.excess || (excess === best.excess && dayIdx(D) > dayIdx(best.day))) {
        best = { day: D, excess: excess };
      }
    }
    if (best) {
      return {
        day: best.day,
        exceedsLead: best.excess > 0,
        reason: best.excess > 0
          ? ('No weekday inside ' + w + '-day lead for ' + shortDay(useDay) + '; used ' + shortDay(best.day) + ' (exceeds lead)')
          : ''
      };
    }
    return { day: prepDay || '', exceedsLead: true, reason: 'No valid prep day within lead window' };
  }

  /** True when dest covers every member use within winMax (never same-day / never over lead). */
  function destCoversMembers(dest, members, winMax, blocked) {
    if (!dest || dest === 'Sunday') return false;
    var w = Math.max(Number(winMax) || 1, 1);
    for (var i = 0; i < (members || []).length; i++) {
      var ed = members[i] && members[i].eventDay;
      if (!ed) ed = members[i] && members[i].row && (members[i].row.eventDay || '');
      /* makeGroup stores rows without eventDay — callers pass window earliest/latest via group */
      if (!ed && members[i] && members[i].dish) continue;
      if (ed && !canCoverUse(dest, ed, w, blocked)) return false;
    }
    return true;
  }

  function countPrefixCovered(prepDay, remaining, winMax, blocked) {
    if (!remaining.length) return 0;
    if (!canCoverUse(prepDay, remaining[0].eventDay, winMax, blocked)) return 0;
    var n = 1;
    for (var i = 1; i < remaining.length; i++) {
      if (canCoverUse(prepDay, remaining[i].eventDay, winMax, blocked)) n++;
      else break;
    }
    return n;
  }

  /** First pack under 4.6.3 rules (tests / legacy). */
  function validDayWindow(funcDays, lead, blocked, cat) {
    var days = (funcDays || []).filter(function (d) { return dayIdx(d) >= 0; });
    if (!days.length) return null;
    var seen = {}, uniq = [];
    days.forEach(function (d) {
      if (!seen[d]) { seen[d] = true; uniq.push(d); }
    });
    uniq.sort(function (a, b) { return dayIdx(a) - dayIdx(b); });
    var fakeMembers = uniq.map(function (d) {
      return { eventDay: d, row: { prepCat: cat || '', leadDays: lead } };
    });
    var packs = greedyPack(fakeMembers, blocked || new Set(), { satUsed: 0 });
    if (!packs.length || !packs[0].win || !packs[0].win.day) return null;
    return packs[0].win;
  }

  function coversPhrase(members, deps) {
    // Days covered only (dish names live in the Dish column — keep merged lines short for chefs).
    var getEventDay = deps.getEventDay || function () { return ''; };
    var seen = {}, days = [];
    members.forEach(function (r) {
      var ed = getEventDay(r.dish) || r.eventDay || '';
      if (!ed || seen[ed]) return;
      seen[ed] = true;
      days.push(shortDay(ed));
    });
    var order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    days.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    return days.join('/');
  }

  function functionNames(members, deps) {
    var clean = (deps && deps.cleanDishName) || function (d) { return d; };
    var seen = {}, names = [];
    (members || []).forEach(function (r) {
      var dish = r && (r.dish || r);
      var c = clean(dish) || String(dish || '');
      if (!c || seen[c]) return;
      seen[c] = true;
      names.push(c);
    });
    return names;
  }

  function mergedFunctionsPhrase(members, deps, maxNames) {
    var names = functionNames(members, deps);
    if (!names.length) return 'Merged';
    maxNames = maxNames == null ? 99 : maxNames;
    var shown = names.slice(0, maxNames);
    var extra = names.length - shown.length;
    return 'Merged: ' + shown.join(' + ') + (extra > 0 ? ' +' + extra + ' more' : '');
  }

  function reasonFor(win, members, deps) {
    if (!win) return '';
    // Merged lines: "Merged: Function A + Function B" (days covered rendered separately).
    if (members && members.length > 1) return mergedFunctionsPhrase(members, deps, 99);
    // Solo: keep a one-line hint; weekend shift note when present.
    var getEventDay = deps.getEventDay || function () { return ''; };
    var ed = members[0] ? (getEventDay(members[0].dish) || members[0].eventDay || '') : '';
    var parts = ['Solo for ' + (shortDay(ed) || 'event')];
    if (win.shiftReason) parts.push(win.shiftReason);
    return parts.join(' · ');
  }

  function isBatchableRow(row) {
    var cat = row.prepCat || '';
    if (!cat) return false;
    if (state.unbatched[batchKey(row, {})]) return false;
    if (state.batchable[cat] === false) return false;
    if (state.batchable[cat] === true) return true;
    return !!DEFAULT_BATCHABLE[cat];
  }

  function buildBatches(rows, deps) {
    deps = deps || {};
    var blocked = deps.blockedDays || new Set();
    var getEventDay = deps.getEventDay || function () { return ''; };
    var computeTotal = deps.computeTotal || function () { return null; };
    var toBaseQty = deps.toBaseQty || function (n, u) { return { n: n, u: u, key: String(u || '').toLowerCase() }; };

    if (!state.batchAcrossOn) {
      return rows.map(function (r) { return singleton(r, deps); });
    }

    var buckets = {};
    var order = [];
    var solos = [];
    rows.forEach(function (r, idx) {
      if (!isBatchableRow(r)) {
        solos.push({ row: r, idx: idx });
        return;
      }
      var key = batchKey(r, deps);
      if (state.unbatched[key]) {
        solos.push({ row: r, idx: idx });
        return;
      }
      var ed = getEventDay(r.dish);
      if (!ed) {
        solos.push({ row: r, idx: idx });
        return;
      }
      if (!buckets[key]) { buckets[key] = []; order.push(key); }
      buckets[key].push({ row: r, idx: idx, eventDay: ed });
    });

    var groups = [];
    var satState = { satUsed: 0 };
    order.forEach(function (key) {
      var members = buckets[key].slice();
      members.sort(function (a, b) {
        var da = dayIdx(a.eventDay), db = dayIdx(b.eventDay);
        if (da !== db) return da - db;
        return String(a.row.dish).localeCompare(String(b.row.dish));
      });
      greedyPack(members, blocked, satState).forEach(function (pack) {
        groups.push(makeGroup(key, pack, deps));
      });
    });

    solos.forEach(function (s) {
      groups.push(singleton(s.row, deps));
    });

    applyDayMoves(groups);

    groups.sort(function (a, b) {
      // Order by earliest use covered (so Sat→Mon/Tue appears before Mon→Wed/Fri), then prep day
      var ua = a.window && a.window.earliestFunc ? dayIdx(a.window.earliestFunc) : dayIdx(a.day);
      var ub = b.window && b.window.earliestFunc ? dayIdx(b.window.earliestFunc) : dayIdx(b.day);
      if (ua < 0) ua = 99; if (ub < 0) ub = 99;
      if (ua !== ub) return ua - ub;
      var da = dayIdx(a.day) < 0 ? 99 : dayIdx(a.day);
      var db = dayIdx(b.day) < 0 ? 99 : dayIdx(b.day);
      if (da !== db) return da - db;
      return String(a.taskLabel).localeCompare(String(b.taskLabel));
    });
    return groups;
  }

  /**
   * Greedy pack sorted members (earliest use first).
   * opts.satUsed tracks Saturday batches already chosen (shared cap across ingredients).
   */
  function greedyPack(members, blocked, opts) {
    opts = opts || {};
    /* 4.8.17: long-life items → single pack for the whole week */
    if (members && members.length && isLongLifeRow(members[0].row)) {
      return packLongLifeAll(members, blocked, opts);
    }
    var remaining = members.slice();
    var packs = [];
    var satUsed = opts.satUsed || 0;
    var satCap = (state.saturdayCap === 0 || Number.isFinite(Number(state.saturdayCap))) ? Number(state.saturdayCap) : 3;

    while (remaining.length) {
      var U = remaining[0].eventDay;
      var cat = remaining[0].row.prepCat || '';
      var lead = Number.isFinite(remaining[0].row.leadDays)
        ? remaining[0].row.leadDays
        : batchWindowFor(cat, null);
      var winMax = batchWindowFor(cat, lead);
      var isProt = isFourDayProtein(cat);
      var allowSatProfile = !!state.allowSaturdayStarts;

      var best = null; // { day, count, offset }

      for (var offset = 1; offset <= Math.max(winMax, 1); offset++) {
        var D = shiftBack(U, offset);
        if (!D || D === 'Sunday') continue;
        if (blocked && blocked.has && blocked.has(D)) continue;

        var count = countPrefixCovered(D, remaining, winMax, blocked);
        if (count < 1) continue;

        // Multi-use 4-day proteins: at least 2 days before earliest use
        if (isProt && count >= 2 && offset < 2) continue;

        if (D === 'Saturday') {
          var satOk = allowSatProfile || (isProt && count >= 2);
          if (!satOk) continue;
          if (satUsed >= satCap) continue; // overflow → Fri / other candidates
        }

        /* 4.8.9 tie: more cover wins; same cover → prefer Saturday (smart-chef pack);
         * otherwise earliest weekday (Thu+Fri → Monday, not Tuesday). */
        var better = false;
        if (!best || count > best.count) better = true;
        else if (count === best.count) {
          if (D === 'Saturday' && best.day !== 'Saturday') better = true;
          else if (best.day === 'Saturday' && D !== 'Saturday') better = false;
          else if (dayIdx(D) < dayIdx(best.day)) better = true;
        }
        if (better) best = { day: D, count: count, offset: offset };
      }

      // Solo: base lead + weekend avoidance (Sat only if profile allows)
      if (!best || best.count === 1) {
        var one = remaining.shift();
        var soloLead = Number.isFinite(one.row.leadDays) ? one.row.leadDays : winMax;
        var soloInfo = prepStartFromLead(one.eventDay, soloLead, {
          blockedDays: blocked,
          allowSaturday: allowSatProfile,
          avoidWeekend: state.avoidWeekend !== false
        });
        var soloDay = soloInfo.day || '';
        if (soloDay && soloDay === one.eventDay) {
          var push = prepStartFromLead(one.eventDay, Math.max(soloLead, 1) + 1, {
            blockedDays: blocked,
            allowSaturday: allowSatProfile,
            avoidWeekend: state.avoidWeekend !== false
          });
          if (push.day && push.day !== one.eventDay) {
            soloDay = push.day;
            if (push.reason) soloInfo.reason = push.reason;
          }
        }
        if (soloDay === 'Sunday') {
          var fix = weekendAdjust('Sunday', one.eventDay, { allowSaturday: allowSatProfile });
          soloDay = fix.day;
          if (fix.reason) soloInfo.reason = fix.reason;
        }
        var soloWinMax = batchWindowFor(one.row.prepCat, one.row.leadDays);
        var clamped = clampPrepToLeadWindow(soloDay, one.eventDay, soloWinMax, blocked);
        if (clamped.day) soloDay = clamped.day;
        var soloReason = one.row.dayReason || soloInfo.reason || '';
        if (clamped.reason) soloReason = (soloReason ? soloReason + ' · ' : '') + clamped.reason;
        packs.push({
          members: [one],
          win: {
            day: soloDay,
            earliestFunc: one.eventDay,
            latestFunc: one.eventDay,
            span: 0,
            winMax: soloWinMax,
            shiftReason: soloReason,
            rawDay: soloInfo.raw || '',
            exceedsLead: !!clamped.exceedsLead
          }
        });
        continue;
      }

      /* Only pack members that share this food-type and fit winMax from best.day */
      var slice = [];
      for (var si = 0; si < best.count; si++) {
        var m = remaining[si];
        var mCat = (m.row && m.row.prepCat) || '';
        if (mCat !== cat) break;
        if (!canCoverUse(best.day, m.eventDay, winMax, blocked)) break;
        slice.push(m);
      }
      if (slice.length < 2) {
        /* fall through to solo on next loop iteration by forcing count 1 path */
        best = { day: best.day, count: 1, offset: best.offset };
        continue;
      }
      var earliestFunc = slice[0].eventDay;
      var latestFunc = slice[slice.length - 1].eventDay;
      var span = dayIdx(latestFunc) - dayIdx(earliestFunc);
      if (best.day === 'Saturday') satUsed++;
      packs.push({
        members: slice,
        win: {
          day: best.day,
          earliestFunc: earliestFunc,
          latestFunc: latestFunc,
          span: span,
          winMax: winMax,
          shiftReason: '',
          rawDay: best.day,
          candidates: [best.day],
          exceedsLead: false
        }
      });
      remaining = remaining.slice(slice.length);
    }
    opts.satUsed = satUsed;
    return packs;
  }

  function makeGroup(key, pack, deps) {
    var eventDays = (pack.members || []).map(function (m) { return m.eventDay; }).filter(Boolean);
    var members = pack.members.map(function (m) {
      if (m.row && m.eventDay && !m.row.eventDay) m.row.eventDay = m.eventDay;
      return m.row;
    });
    var win = pack.win;
    var parts = parseTaskParts(members[0].task || members[0].item);
    var miseHint = parts.miseHint || '';
    var computeTotal = deps.computeTotal || function () { return null; };
    var toBaseQty = deps.toBaseQty || function (n, u) { return { n: n, u: u, key: String(u || '').toLowerCase() }; };
    var total = 0, hasTotal = false, unit = members[0].unit || '';
    var dishes = [];
    members.forEach(function (r) {
      if (dishes.indexOf(r.dish) < 0) dishes.push(r.dish);
      var raw = computeTotal(r);
      if (raw === null || raw === undefined) return;
      var based = toBaseQty(raw, r.unit);
      total += based.n;
      hasTotal = true;
      unit = based.u || unit;
      if (based.key === 'g') unit = 'g';
      if (based.key === 'ml') unit = 'ml';
    });
    var merged = members.length > 1;
    return {
      batchKey: key,
      taskLabel: parts.label,
      miseHint: typeof miseHint !== 'undefined' ? miseHint : (parts.miseHint || ''),
      base: parts.base || '',
      name: parts.name,
      method: parts.method,
      unit: unit,
      total: total,
      hasTotal: hasTotal,
      day: win.day || members[0].day || '',
      section: members[0].section,
      prepCat: members[0].prepCat,
      rows: members,
      dishes: dishes,
      merged: merged,
      covers: coversPhrase(members, deps),
      reason: reasonFor(win, members, deps),
      functions: functionNames(members, deps),
      window: win,
      eventDays: eventDays
    };
  }

  function singleton(row, deps) {
    var parts = parseTaskParts(row.task);
    var computeTotal = deps.computeTotal || function () { return null; };
    var toBaseQty = deps.toBaseQty || function (n, u) { return { n: n, u: u, key: String(u || '').toLowerCase() }; };
    var raw = computeTotal(row);
    var based = raw === null || raw === undefined ? null : toBaseQty(raw, row.unit);
    var getEventDay = deps.getEventDay || function () { return ''; };
    var ed = getEventDay(row.dish) || '';
    var day = row.day || '';
    var shiftReason = row.dayReason || '';
    if (ed && Number.isFinite(row.leadDays) && (!day || day === 'Saturday' || day === 'Sunday')) {
      var si = prepStartFromLead(ed, row.leadDays, {});
      if (si.day) { day = si.day; if (si.reason) shiftReason = si.reason; }
    }
    var win = day ? {
      day: day,
      earliestFunc: ed,
      latestFunc: ed,
      span: 0,
      winMax: batchWindowFor(row.prepCat, row.leadDays),
      shiftReason: shiftReason
    } : null;
    return {
      batchKey: batchKey(row, deps),
      taskLabel: parts.label,
      miseHint: typeof miseHint !== 'undefined' ? miseHint : (parts.miseHint || ''),
      base: parts.base || '',
      name: parts.name,
      method: parts.method,
      unit: based ? based.u : (row.unit || ''),
      total: based ? based.n : 0,
      hasTotal: !!based,
      day: day,
      section: row.section,
      prepCat: row.prepCat,
      rows: [row],
      dishes: [row.dish],
      merged: false,
      covers: coversPhrase([row], deps),
      reason: win ? reasonFor(win, [row], deps) : (row.dayReason || ''),
      functions: functionNames([row], deps),
      window: win
    };
  }


  function nextWeekday(day) {
    var i = dayIdx(day);
    if (i < 0) return 'Monday';
    for (var n = 1; n <= 7; n++) {
      var d = WEEKDAYS[(i + n) % 7];
      if (d !== 'Sunday') return d;
    }
    return day;
  }

  /** Apply on-the-fly prep-day moves (batchKey → weekday) only when still inside food-type lead. */
  function applyDayMoves(groups) {
    var moves = state.dayMoves || {};
    (groups || []).forEach(function (g) {
      if (!g || !g.batchKey) return;
      var dest = moves[g.batchKey];
      if (!dest || dayIdx(dest) < 0 || dest === 'Sunday') return;
      var winMax = (g.window && g.window.winMax != null)
        ? g.window.winMax
        : batchWindowFor(g.prepCat, null);
      var useDays = [];
      (g.eventDays || []).forEach(function (d) {
        if (d && useDays.indexOf(d) < 0) useDays.push(d);
      });
      if (g.window && g.window.earliestFunc && useDays.indexOf(g.window.earliestFunc) < 0) {
        useDays.push(g.window.earliestFunc);
      }
      if (g.window && g.window.latestFunc && useDays.indexOf(g.window.latestFunc) < 0) {
        useDays.push(g.window.latestFunc);
      }
      (g.rows || []).forEach(function (r) {
        if (r && r.eventDay && useDays.indexOf(r.eventDay) < 0) useDays.push(r.eventDay);
      });
      /* Parse covers Mon/Tue/Wed → weekdays when window missing */
      if (!useDays.length && g.covers) {
        String(g.covers).split('/').forEach(function (tok) {
          var t = String(tok || '').trim();
          WEEKDAYS.forEach(function (d) {
            if (SHORT[d] === t || d.indexOf(t) === 0) {
              if (useDays.indexOf(d) < 0) useDays.push(d);
            }
          });
        });
      }
      var origDay = g.day || (g.window && g.window.day) || '';
      var earliestUse = useDays.slice().sort(function (a, b) { return dayIdx(a) - dayIdx(b); })[0] || '';
      function coversAll(day) {
        if (!useDays.length) return false;
        for (var i = 0; i < useDays.length; i++) {
          if (!canCoverUse(day, useDays[i], winMax, null)) return false;
        }
        return true;
      }
      /* Move may only push prep LATER (strictly closer to earliest use). */
      function isStrictlyLaterPrep(cand) {
        if (!origDay || !earliestUse || cand === origDay) return false;
        var origFwd = forwardDays(origDay, earliestUse);
        var candFwd = forwardDays(cand, earliestUse);
        if (origFwd == null || candFwd == null) return false;
        return candFwd >= 1 && candFwd < origFwd;
      }
      if (coversAll(dest) && (dest === origDay || isStrictlyLaterPrep(dest))) {
        /* dest ok */
      } else {
        var tryDay = dest;
        var found = '';
        for (var step = 0; step < 6; step++) {
          tryDay = step === 0 ? dest : nextWeekday(tryDay);
          if (tryDay === origDay) break; /* wrapped — stop */
          if (coversAll(tryDay) && isStrictlyLaterPrep(tryDay)) { found = tryDay; break; }
        }
        if (!found) {
          delete moves[g.batchKey]; /* revert invalid move */
          return;
        }
        dest = found;
        moves[g.batchKey] = dest;
      }
      g.day = dest;
      if (g.window) g.window.day = dest;
      (g.rows || []).forEach(function (r) {
        if (r) r.day = dest;
      });
    });
  }

  /** Move one prep group to the next weekday (skip Sunday). Returns new day. */
  function moveGroupToNextDay(batchKey, currentDay) {
    if (!batchKey) return currentDay || '';
    var from = currentDay || state.dayMoves[batchKey] || '';
    var next = nextWeekday(from || 'Saturday');
    state.dayMoves[batchKey] = next;
    return next;
  }

  function clearDayMove(batchKey) {
    if (batchKey) delete state.dayMoves[batchKey];
  }

  function clearAllDayMoves() {
    state.dayMoves = {};
  }

  function setBatchAcross(on) { state.batchAcrossOn = !!on; }
  function toggleUnbatch(key) {
    if (state.unbatched[key]) delete state.unbatched[key];
    else state.unbatched[key] = true;
  }
  function isUnbatched(key) { return !!state.unbatched[key]; }
  function setDayFilter(d) { state.dayFilter = d || 'all'; }
  function setSectionFilter(s) { state.sectionFilter = s || 'all'; }
  function setListAnchor(a) { state.listAnchor = (a === 'function') ? 'function' : 'prep'; }
  function setBatchable(cat, on) { state.batchable[cat] = !!on; }
  function setAllowSaturday(on) { state.allowSaturdayStarts = !!on; }
  function setSaturdayCap(n) {
    var v = Number(n);
    // 0 = no Saturday batches (overflow to Fri); omit/invalid → default 3
    if (n === null || n === undefined || n === '') { state.saturdayCap = 3; return; }
    state.saturdayCap = Number.isFinite(v) && v >= 0 ? v : 3;
  }
  function setAvoidWeekend(on) { state.avoidWeekend = !!on; }
  function getState() { return state; }
  function loadState(s) {
    if (!s || typeof s !== 'object') return;
    if (typeof s.batchAcrossOn === 'boolean') state.batchAcrossOn = s.batchAcrossOn;
    if (s.unbatched && typeof s.unbatched === 'object') state.unbatched = Object.assign({}, s.unbatched);
    if (typeof s.dayFilter === 'string') state.dayFilter = s.dayFilter;
    if (typeof s.sectionFilter === 'string') state.sectionFilter = s.sectionFilter;
    if (s.listAnchor === 'prep' || s.listAnchor === 'function') state.listAnchor = s.listAnchor;
    if (s.batchable && typeof s.batchable === 'object') state.batchable = Object.assign({}, DEFAULT_BATCHABLE, s.batchable);
    if (typeof s.allowSaturdayStarts === 'boolean') state.allowSaturdayStarts = s.allowSaturdayStarts;
    if (Number.isFinite(Number(s.saturdayCap))) state.saturdayCap = Number(s.saturdayCap);
    if (typeof s.avoidWeekend === 'boolean') state.avoidWeekend = s.avoidWeekend;
    if (s.dayMoves && typeof s.dayMoves === 'object') state.dayMoves = Object.assign({}, s.dayMoves);
  }
  function exportState() {
    return {
      batchAcrossOn: state.batchAcrossOn,
      unbatched: Object.assign({}, state.unbatched),
      dayFilter: state.dayFilter,
      sectionFilter: state.sectionFilter,
      listAnchor: state.listAnchor,
      batchable: Object.assign({}, state.batchable),
      allowSaturdayStarts: state.allowSaturdayStarts,
      saturdayCap: state.saturdayCap,
      avoidWeekend: state.avoidWeekend,
      dayMoves: Object.assign({}, state.dayMoves)
    };
  }

  function filterRows(rows, deps) {
    deps = deps || {};
    var getEventDay = deps.getEventDay || function () { return ''; };
    var dayF = state.dayFilter;
    var secF = state.sectionFilter;
    var anchor = state.listAnchor;
    return rows.filter(function (r) {
      if (secF && secF !== 'all' && r.section !== secF) return false;
      if (!dayF || dayF === 'all') return true;
      var d = anchor === 'function' ? (getEventDay(r.dish) || '') : (r.day || '');
      return d === dayF;
    });
  }

  function dayCounts(rows, deps) {
    deps = deps || {};
    var getEventDay = deps.getEventDay || function () { return ''; };
    var counts = { all: rows.length };
    WEEKDAYS.forEach(function (d) { counts[d] = 0; });
    rows.forEach(function (r) {
      var d = state.listAnchor === 'function' ? (getEventDay(r.dish) || '') : (r.day || '');
      if (d && counts[d] !== undefined) counts[d]++;
    });
    return counts;
  }

  function stickyBarHtml(opts) {
    opts = opts || {};
    var counts = opts.counts || {};
    var sections = opts.sections || [];
    var esc = opts.escapeHtml || function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var chips = ['all'].concat(WEEKDAYS).map(function (d) {
      var label = d === 'all' ? 'All' : shortDay(d);
      var n = counts[d] || 0;
      var on = state.dayFilter === d;
      var dim = d !== 'all' && n === 0;
      return '<button type="button" class="pb-chip' + (on ? ' on' : '') + (dim ? ' dim' : '') + '" data-pb-day="' + d + '"' +
        (dim ? ' disabled' : '') + '>' + label + (d === 'all' ? ' (' + (counts.all || 0) + ')' : (n ? ' · ' + n : '')) + '</button>';
    }).join('');
    var secOpts = '<option value="all"' + (state.sectionFilter === 'all' ? ' selected' : '') + '>All sections</option>' +
      sections.map(function (s) {
        return '<option value="' + esc(s) + '"' + (state.sectionFilter === s ? ' selected' : '') + '>' + esc(s) + '</option>';
      }).join('');
    return '<div class="pb-sticky no-print" id="pbSticky">' +
      '<div class="pb-row">' +
        '<div class="pb-chips" role="toolbar" aria-label="Day filter">' + chips + '</div>' +
        '<label class="pb-sec">Section <select id="pbSection">' + secOpts + '</select></label>' +
        '<div class="pb-anchor">' +
          '<button type="button" class="pb-chip' + (state.listAnchor === 'prep' ? ' on' : '') + '" data-pb-anchor="prep">By prep day</button>' +
          '<button type="button" class="pb-chip' + (state.listAnchor === 'function' ? ' on' : '') + '" data-pb-anchor="function">By function</button>' +
        '</div>' +
        '<label class="pb-batch"><input type="checkbox" id="pbBatchAcross"' + (state.batchAcrossOn ? ' checked' : '') + '> Batch across dishes</label>' +
      '</div>' +
    '</div>';
  }

  function batchReasonHtml(g, esc, deps) {
    esc = esc || function (s) { return String(s); };
    deps = deps || {};
    if (!g) return '';
    // Merged: days covered + "Merged: Fn A + Fn B" (short on phone via CSS in upgrades-47).
    if (g.merged) {
      var days = g.covers || '';
      var full = g.reason || mergedFunctionsPhrase(g.rows || g.dishes || [], deps, 99);
      var short = mergedFunctionsPhrase(g.rows || g.dishes || [], deps, 2);
      // Prefer PreplineUpgrades47 helper when present (shared screen/export copy).
      if (root.PreplineUpgrades47 && root.PreplineUpgrades47.mergedSubtitleHtml) {
        return root.PreplineUpgrades47.mergedSubtitleHtml(g, esc, {
          cleanDishName: deps.cleanDishName, phoneMax: 2
        });
      }
      return '<div class="pb-reason u47-merged" title="' + esc(full) + '">' +
        (days ? '<span class="pb-covers">' + esc(days) + '</span> · ' : '') +
        '<span class="u47-merged-full">' + esc(full) + '</span>' +
        '<span class="u47-merged-short">' + esc(short) + '</span></div>';
    }
    if (!g.reason) return '';
    return '<div class="pb-reason">' + esc(g.reason) + '</div>';
  }

  function css() {
    return [
      '.pb-sticky{position:sticky;top:0;z-index:30;background:var(--paper,#F7F4EC);border:1px solid var(--line,#D9D3C3);border-radius:8px;padding:10px 12px;margin:0 0 14px;box-shadow:0 1px 0 rgba(0,0,0,.04);}',
      '.pb-row{display:flex;flex-wrap:wrap;gap:10px 12px;align-items:center;}',
      '.pb-chips{display:flex;flex-wrap:wrap;gap:6px;}',
      '.pb-chip{font:12px/1.2 "IBM Plex Sans",system-ui,sans-serif;padding:6px 10px;border:1px solid var(--line,#D9D3C3);border-radius:999px;background:#fff;color:var(--ink,#1C1B16);cursor:pointer;}',
      '.pb-chip.on{background:var(--ink,#1C1B16);color:#fff;border-color:var(--ink,#1C1B16);}',
      '.pb-chip.dim{opacity:.35;cursor:not-allowed;}',
      '.pb-sec select{font:12.5px "IBM Plex Mono",monospace;padding:5px 8px;border:1px solid var(--line);border-radius:4px;}',
      '.pb-batch{font-size:12.5px;color:var(--ink-soft,#5C5A52);display:inline-flex;align-items:center;gap:6px;cursor:pointer;}',
      '.pb-batch input{width:auto;}',
      '.pb-reason{font-size:11.5px;color:var(--ink-soft,#5C5A52);margin-top:2px;}',
      '.pb-daypill{display:inline-block;background:var(--day1-bg,#E8F0FE);color:var(--day1,#1A56DB);font-weight:600;padding:1px 7px;border-radius:999px;margin-right:4px;}',
      '.pb-covers{font-style:italic;}',
      '.pb-unbatch{font-size:10px;margin-left:6px;}'
    ].join('');
  }

  function ensureCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('pbBatchCss')) return;
    var s = document.createElement('style');
    s.id = 'pbBatchCss';
    s.textContent = css();
    document.head.appendChild(s);
  }

  root.PreplineBatch = {
    DEFAULT_BATCHABLE: DEFAULT_BATCHABLE,
    DEFAULT_BATCH_WINDOW: DEFAULT_BATCH_WINDOW,
    parseTaskParts: parseTaskParts,
    findSharedMise: findSharedMise,
    baseIngredientOf: baseIngredientOf,
    applyNameSynonyms: applyNameSynonyms,
    fuzzyMatchToken: fuzzyMatchToken,
    editDist: editDist,
    batchKey: batchKey,
    batchWindowFor: batchWindowFor,
    isFourDayProtein: isFourDayProtein,
    maxFwdForPrep: maxFwdForPrep,
    canCoverUse: canCoverUse,
    clampPrepToLeadWindow: clampPrepToLeadWindow,
    categoryWindow: categoryWindow,
    weekendAdjust: weekendAdjust,
    isLongLifeRow: isLongLifeRow,
    packLongLifeAll: packLongLifeAll,
    prepStartFromLead: prepStartFromLead,
    validDayWindow: validDayWindow,
    buildBatches: buildBatches,
    applyDayMoves: applyDayMoves,
    moveGroupToNextDay: moveGroupToNextDay,
    clearDayMove: clearDayMove,
    clearAllDayMoves: clearAllDayMoves,
    nextWeekday: nextWeekday,
    filterRows: filterRows,
    dayCounts: dayCounts,
    stickyBarHtml: stickyBarHtml,
    batchReasonHtml: batchReasonHtml,
    functionNames: functionNames,
    mergedFunctionsPhrase: mergedFunctionsPhrase,
    ensureCss: ensureCss,
    setBatchAcross: setBatchAcross,
    toggleUnbatch: toggleUnbatch,
    isUnbatched: isUnbatched,
    setDayFilter: setDayFilter,
    setSectionFilter: setSectionFilter,
    setListAnchor: setListAnchor,
    setBatchable: setBatchable,
    setAllowSaturday: setAllowSaturday,
    setSaturdayCap: setSaturdayCap,
    setAvoidWeekend: setAvoidWeekend,
    getState: getState,
    loadState: loadState,
    exportState: exportState,
    isBatchableRow: isBatchableRow,
    shortDay: shortDay,
    // Back-compat: protein window is now 4
    EXPIRY_MAX: 4
  };
})(typeof window !== 'undefined' ? window : globalThis);
