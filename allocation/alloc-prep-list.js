/* Prepline: Plated prep-list xlsx from kitchen WO + master recipe copies.
   Clones each matched master sheet, sets event label + pax, PRESERVES each
   ingredient's Excel formula (recalculated; never a uniform multiplier). */
(function (root) {
  'use strict';

  const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const Formula =
    typeof AllocFormula !== 'undefined'
      ? AllocFormula
      : typeof require === 'function'
        ? (() => {
            try {
              return require('./alloc-formula.js');
            } catch (e) {
              return null;
            }
          })()
        : null;

  const clean = (v) => (v == null ? '' : String(v).replace(/\u00a0/g, ' ').trim());
  const lc = (s) => String(s || '').toLowerCase();

  /** Known dish → master sheet aliases (WO wording → 2026 master tab). Prefer 2026 tabs. */
  const ALIASES = [
    // Mains first (avoid entree keywords like pea/prawn inside main descriptions)
    { re: /beef\s*cheek|18\s*hour\s*braised/i, sheet: '2026 18 Hour Braised Beef Cheek', key: 'Beef Cheek', course: 'M' },
    { re: /chicken\s*mosaic|girraween\s*chicken\s*mosaic|giraween\s*chicken\s*mosaic/i, sheet: '2026 Chicken Mosaic Main', key: 'Mosaic', course: 'M' },
    { re: /barramundi|wildfire\s*spiced|daintree\s*barra/i, sheet: '2026 Barra Main', key: 'Barra', course: 'M' },
    { re: /aubergine|eggplant\s*steak|native\s*spiced\s*aubergine/i, sheet: '2026 Eggplant Steak Dietary', key: 'Eggplant', course: 'M' },
    { re: /beef\s*eye\s*fillet|chargrilled\s*riverina\s*(beef\s*)?eye|riverina\s*mbs.*eye\s*fillet/i, sheet: '2026 Beef Eye Fillet Mains', key: 'Beef Eye', course: 'M' },
    { re: /lamb\s*two\s*ways|lamb\s*2\s*ways|braised\s*junee\s*lamb/i, sheet: '2026 Lamb Two-Ways Main', key: 'Lamb2Way', course: 'M' },
    { re: /bannockburn\s*chicken|roasted\s*bannockburn/i, sheet: '2026 Bannockburn Chicken Main', key: 'Bannockburn', course: 'M' },
    { re: /tasmanian\s*salmon|slow\s*cooked.*salmon/i, sheet: '2026 Salmon Main', key: 'Salmon', course: 'M' },
    { re: /12[- ]?hour\s*braised.*lamb|braised\s*cowra\s*lamb/i, sheet: '2026 Lamb Two-Ways Main', key: 'Lamb2Way', course: 'M' },
    { re: /lamb\s*rump|cowra\s*valley\s*lamb/i, sheet: '2026 Lamb Rump Main', key: 'Lamb Rump', course: 'M' },
    { re: /cabbage\s*brik|cannonball\s*cabbage/i, sheet: '2026 Cabbage Brik Dietary', key: 'Cabbage', course: 'M' },
    { re: /murray\s*cod|aquna|blue\s*eye\s*cod|roasted\s*blue\s*eye|oven\s*roasted\s*aquna/i, sheet: '2026 Cod Main', key: 'Cod', course: 'M', altSheets: ['2026 Cod'] },
    // Entrees
    { re: /duck\s*breast|hawkesbury\s*duck|hunter\s*valley\s*duck|smoked.*duck/i, sheet: '2026 Duck', key: 'Duck', course: 'E', altSheets: ['2026 Duck Entree'] },
    { re: /byron\s*bay.*pork|berkshire\s*pork|roasted.*pork(?!\s*belly)/i, sheet: '2026 Pork', key: 'Pork', course: 'E', altSheets: ['2026 Pork Entree'] },
    { re: /butternut|agnolotti|goat.?s?\s*cheese\s*ravioli|squash.*ravioli/i, sheet: '2026 Agnolotti Entree', key: 'Rav', course: 'E' },
    { re: /\bravioli\b/i, sheet: '2026 Ravioli', key: 'Rav', course: 'E', altSheets: ['2026 Agnolotti Entree', '2026 Ravioli Entree'] },
    { re: /\bburrata\b/i, sheet: '2026 Burrata', key: 'Burrata', course: 'E' },
    { re: /green\s*pea\s*and\s*coconut|pea\s*and\s*coconut|crushed\s*pea|garden\s*pea|pea\s*parfait|scorched\s*green\s*peas/i, sheet: '2026 Pea Dietary', key: 'Pea', course: 'E' },
    { re: /mooloolaba\s*prawns?|king\s*prawns?|u5\s*prawns?|\bshrimp\b|poached\s+prawns?|prawns?\s+with|\bprawns?\s*,/i, sheet: '2026 Poached Prawn', key: 'Prawn', course: 'E' },
    { re: /\bkangaroo\b/i, sheet: '2026 Kangaroo', key: 'Kangaroo', course: 'E' },
    { re: /hiramasa|kingfish/i, sheet: 'Pepperberry cured Hiramasa king', key: 'Kingfish', course: 'E' },
    // Breakfast / BF
    { re: /handbowl.*braised\s*broad|braised\s*broad\s*beans.*handbowl|handbowl\s*-\s*braised\s*broad/i, sheet: 'BF Handbowls - Braised broad be', key: 'BF Broad', course: 'BF' },
    { re: /handbowl.*scrambled|scrambled\s*eggs?\s*with\s*roasted\s*sweet|handbowl\s*-\s*scrambled/i, sheet: 'BF Handbowls - Scrambled Eggs w', key: 'BF Scram', course: 'BF' },
    { re: /scrambled\s*free-?range|sweet\s*potato\s*hash.*zucchini/i, sheet: 'Breakfast - Scrambled free-rang', key: 'BF FreeEgg', course: 'BF' },
    { re: /scrambled\s*tofu|breakfast\s*dietary.*tofu/i, sheet: 'Breakfast Dietary - Scrambled T', key: 'BF Tofu', course: 'BF' },
    { re: /farmhouse\s*scrambled|famhouse\s*scrambled/i, sheet: 'Breakfast - Famhouse scrambled ', key: 'Farmhouse', course: 'BF' },
    { re: /folded\s*eggs?/i, sheet: 'Breakfast - Folded eggs, sweet ', key: 'BF Folded', course: 'BF' },
    { re: /asparagus\s*and\s*leek/i, sheet: 'Breakfast - Asparagus and leek ', key: 'BF Asp', course: 'BF' },
    { re: /ful\s*medames/i, sheet: 'Breakfast - Ful medames slow co', key: 'BF Ful', course: 'BF' },
    { re: /ocean\s*trout\s*gravlax|gravlax/i, sheet: 'Breakfast - Ocean trout gravlax', key: 'BF Gravlax', course: 'BF' }
  ];

  function matchMaster(dish, sheetNames) {
    const names = sheetNames || [];
    const candidatesFor = (want, alts) => {
      const out = [];
      const add = (n) => { if (n && names.includes(n) && !out.includes(n)) out.push(n); };
      add(want);
      for (const a of alts || []) add(a);
      if (want && !out.length) {
        const hit = names.find((n) => lc(n).includes(lc(want).slice(0, 12)));
        add(hit);
      }
      return out;
    };
    for (const a of ALIASES) {
      if (!a.re.test(dish)) continue;
      const candidates = candidatesFor(a.sheet, a.altSheets);
      const matched = candidates[0] || null;
      if (matched) return { ...a, matched, candidates };
      return { ...a, matched: null, missing: a.sheet, candidates: [] };
    }
    // last-resort: BF / Breakfast tab whose title words appear in the dish
    const tokens = lc(dish).split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const bfTabs = names.filter((n) => /^BF\b/i.test(n) || /^Breakfast\b/i.test(n));
    let best = null, bestScore = 0;
    for (const n of bfTabs) {
      const nt = lc(n).split(/[^a-z0-9]+/).filter((w) => w.length > 3);
      const score = nt.filter((w) => tokens.includes(w)).length;
      if (score > bestScore) { bestScore = score; best = n; }
    }
    if (best && bestScore >= 2) return { re: null, sheet: best, key: best.replace(/^BF\s*/i,'BF ').replace(/^Breakfast\s*-?\s*/i,'BF ').slice(0,12), course: 'BF', matched: best };
    return null;
  }

  function mealFromTime(t) {
    let mins = null;
    if (typeof t === 'number' && t > 0 && t < 1) mins = Math.round(t * 24 * 60);
    else {
      const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
      if (m) mins = (+m[1]) * 60 + (+m[2]);
    }
    if (mins == null) return 'Dinner';
    if (mins < 10 * 60 + 30) return 'Breakfast';
    if (mins < 15 * 60) return 'Lunch';
    return 'Dinner';
  }

  /** Client short codes (compact for Excel 31-char tabs). */
  const CLIENT_SHORT = [
    [/\bSAP\b/i, 'SAP'],
    [/CommBank|Commonwealth\s*Bank|\bCBA\b/i, 'CBA'],
    [/NAWIC/i, 'NAWIC'],
    [/\bSDA\b/i, 'SDA'],
    [/Australian\s*Training\s*Awards|\bATA\b/i, 'ATA'],
    [/CEO\s*Magazine|\bCEO\b/i, 'CEO'],
    [/World\s*Business\s*Forum|\bWBF\b/i, 'WBF'],
    [/SailPoint/i, 'SailPoint'],
    [/Tourism\s*Awards/i, 'Tourism'],
    [/\bHIA\b/i, 'HIA'],
    [/Military\s*Medicine|AMMA/i, 'AMMA'],
    [/Innovation\s*&\s*Excellence|Excellence\s*Awards/i, 'IEA'],
    [/\bESA\b|NZSE|SRB/i, 'ESA'],
    [/Macquarie/i, 'Macq'],
    [/Lottery|\bWLS\b/i, 'WLS'],
    [/Kaseya/i, 'Kaseya'],
    [/Ageing\s*Australia/i, 'Ageing'],
    [/Stone\s*Awards/i, 'Stone'],
    [/Charity\s*Appreciation|\bICCS\b/i, 'ICCS'],
    [/Five\s*V\s*Capital/i, 'FiveV']
  ];

  function clientBase(event) {
    const e = clean(event);
    if (!e) return 'EVT';
    for (const [re, a] of CLIENT_SHORT) if (re.test(e)) return a;
    const words = e
      .replace(/\(.*?\)/g, '')
      .replace(/\b20\d{2}\b/g, '')
      .split(/[\s|/,\-–—]+/)
      .filter((w) => w && !/^(the|and|of|for|a|an|at|in|on|nsw|sydney|australia|australian)$/i.test(w));
    if (words.length === 1) return words[0].slice(0, 8);
    const caps = words.map((w) => w[0]).join('').toUpperCase();
    if (caps.length >= 2 && caps.length <= 6) return caps;
    return words.slice(0, 2).map((w) => w.slice(0, 4)).join('').slice(0, 10);
  }

  /** Distinguishing keyword(s) from full event name (Excellence, Christmas, …). */
  function eventDistinguisher(event, meal) {
    const e = clean(event);
    if (!e) return meal || '';
    // Strip known client phrases so leftover words are the distinguisher
    let rest = e;
    for (const [re] of CLIENT_SHORT) rest = rest.replace(re, ' ');
    rest = rest
      .replace(/\(.*?\)/g, ' ')
      .replace(/\b20\d{2}\b/g, ' ')
      .replace(/[|/,\-–—]+/g, ' ');
    const stop = /^(the|and|of|for|a|an|at|in|on|nsw|sydney|australia|australian|bank|awards?|function|gala|event|inc|ltd|pty|limited|officers?|retired|christmas|dinner|lunch|breakfast|annual|national|international)$/i;
    // Preferred distinctive tokens (checked on full event, keep original casing form)
    const preferred = [
      [/Excellence/i, 'Excellence'],
      [/Christmas/i, 'Christmas'],
      [/Innovation/i, 'Innovation'],
      [/Charity/i, 'Charity'],
      [/Appreciation/i, 'Appreciation'],
      [/Tourism/i, 'Tourism'],
      [/Military|AMMA/i, 'Military'],
      [/Stone/i, 'Stone'],
      [/SailPoint/i, 'SailPoint'],
      [/Training/i, 'Training'],
      [/Retired/i, 'Retired'],
      [/Forum/i, 'Forum']
    ];
    for (const [re, lab] of preferred) if (re.test(e)) return lab;
    const tokens = rest.split(/\s+/).filter((w) => w && w.length > 2 && !stop.test(w));
    if (tokens.length) return tokens[0].replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
    return meal || '';
  }

  /**
   * Short function label used in tabs + summary.
   * Same client on different nights → distinct labels (CBA Christmas vs CBA Excellence).
   */
  function eventAcronym(event, meal) {
    const base = clientBase(event);
    const dist = eventDistinguisher(event, meal);
    if (!dist) return base;
    // Avoid "CBA CBA" / "ICCS ICCS"
    if (lc(dist) === lc(base)) return base;
    return (base + ' ' + dist).trim();
  }

  /** Ensure labels unique across a job list; append next distinguishing word / meal / date if needed. */
  function disambiguateAcronyms(items) {
    const list = items || [];
    const byLabel = new Map();
    for (const it of list) {
      const lab = it.acronym || eventAcronym(it.event, it.meal);
      it.acronym = lab;
      if (!byLabel.has(lab)) byLabel.set(lab, []);
      byLabel.get(lab).push(it);
    }
    for (const [, group] of byLabel) {
      if (group.length <= 1) continue;
      // Same label on different full events → expand
      const byEvent = new Map();
      for (const g of group) {
        const ek = (g.event || '') + '|' + (g.meal || '');
        if (!byEvent.has(ek)) byEvent.set(ek, []);
        byEvent.get(ek).push(g);
      }
      if (byEvent.size <= 1) continue;
      for (const [, evGroup] of byEvent) {
        const sample = evGroup[0];
        const base = clientBase(sample.event);
        let rest = clean(sample.event);
        for (const [re] of CLIENT_SHORT) rest = rest.replace(re, ' ');
        rest = rest.replace(/\(.*?\)/g, ' ').replace(/\b20\d{2}\b/g, ' ');
        const stop = /^(the|and|of|for|a|an|at|in|on|nsw|sydney|australia|australian|bank|awards?|function|gala|event|inc|ltd|pty|limited)$/i;
        const tokens = rest.split(/[\s|/,\-–—]+/).filter((w) => w && w.length > 2 && !stop.test(w));
        let label = base;
        for (const tok of tokens) {
          const t = tok.replace(/[^A-Za-z0-9]/g, '');
          if (!t || lc(t) === lc(base)) continue;
          const cand = (label + ' ' + t).trim();
          // accept once unique among other event keys
          const clash = [...byEvent.keys()].some((k) => {
            if (k === (sample.event || '') + '|' + (sample.meal || '')) return false;
            const other = byEvent.get(k)[0];
            return lc(other.acronym) === lc(cand) || lc(eventAcronym(other.event, other.meal)) === lc(cand);
          });
          label = cand;
          if (!clash) break;
        }
        if (label === base && sample.meal) label = base + ' ' + sample.meal;
        if (label === base || label === base + ' ' + (sample.meal || '')) {
          const dd = (sample.date || '').slice(8, 10);
          const mm = (sample.date || '').slice(5, 7);
          if (dd) label = (base + ' ' + dd + '-' + mm).trim();
        }
        for (const g of evGroup) g.acronym = label;
      }
    }
    return list;
  }

  function dayNum(iso) {
    // Mon=1 … Sun=7
    const d = new Date(iso + 'T00:00').getDay();
    return d === 0 ? 7 : d;
  }

  function fmtEventLabel(iso, meal, acronym) {
    const dt = new Date(iso + 'T00:00');
    const day = DAYS_LONG[dt.getDay()];
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${day} ${dd}/${mm} ${meal} (${acronym})`;
  }

  /** Gerard tab form: "1 Monday - Pea - CBA Christmas" (N Day - dish - distinct function label). Excel max 31 — never drop the distinguishing label. */
  function safeSheetName(name, fallback) {
    let s = String(name == null ? '' : name).replace(/[\\/*?\[\]:]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) s = fallback || 'Sheet';
    return s.slice(0, 31);
  }

  function tabName(iso, courseLetter, dishKey, acronym) {
    const n = dayNum(iso);
    const long = DAYS_LONG[new Date(iso + 'T00:00').getDay()];
    const short = DAYS_SHORT[new Date(iso + 'T00:00').getDay()];
    const key = String(dishKey || 'Dish').replace(/[\\/*?\[\]:]/g, ' ').trim();
    let acr = String(acronym || 'EVT').replace(/[\\/*?\[\]:]/g, ' ').trim();
    const fit = (dayWord, dish) => (n + ' ' + dayWord + ' - ' + dish + ' - ' + acr).replace(/\s+/g, ' ').trim();
    let base = fit(long, key);
    if (base.length > 31) base = fit(short, key);
    if (base.length > 31) {
      const room = 31 - (n + ' ' + short + ' -  - ' + acr).length;
      base = fit(short, key.slice(0, Math.max(2, room)));
    }
    if (base.length > 31) {
      const parts = acr.split(/\s+/);
      while (base.length > 31 && parts.length > 1) {
        parts.pop();
        acr = parts.join(' ');
        base = fit(short, key.slice(0, 3));
      }
    }
    if (base.length > 31) {
      const suffix = (' - ' + acr).slice(0, 20);
      const headBudget = 31 - suffix.length;
      base = (n + ' ' + short + ' - ' + key).slice(0, headBudget).trimEnd() + suffix;
    }
    return base.slice(0, 31).trim();
  }

  /** SheetJS read() returns flat fill styles; xlsx-js-style write() needs nested {fill:{...}}. */
  function styleHasFill(s) {
    if (!s) return false;
    if (s.fill && (s.fill.fgColor || s.fill.bgColor || s.fill.patternType)) return true;
    if (s.patternType || s.fgColor || s.bgColor) return true;
    return false;
  }
  function normalizeStyle(s) {
    if (!s) return s;
    const out = {};
    if (s.font) out.font = s.font;
    if (s.border) out.border = s.border;
    if (s.alignment) out.alignment = s.alignment;
    if (s.numFmt) out.numFmt = s.numFmt;
    if (s.fill) out.fill = JSON.parse(JSON.stringify(s.fill));
    else if (s.patternType || s.fgColor || s.bgColor) {
      out.fill = {
        patternType: s.patternType || 'solid',
        fgColor: s.fgColor ? JSON.parse(JSON.stringify(s.fgColor)) : undefined,
        bgColor: s.bgColor ? JSON.parse(JSON.stringify(s.bgColor)) : undefined
      };
    }
    if (out.fill && out.fill.fgColor && out.fill.fgColor.rgb) {
      let r = String(out.fill.fgColor.rgb).replace(/^#/, '').toUpperCase();
      if (r.length === 6) r = 'FF' + r;
      out.fill.fgColor = { rgb: r };
    }
    if (out.fill && out.fill.bgColor && out.fill.bgColor.rgb) {
      let r = String(out.fill.bgColor.rgb).replace(/^#/, '').toUpperCase();
      if (r.length === 6) r = 'FF' + r;
      out.fill.bgColor = { rgb: r };
    }
    return out;
  }
  /** Score a master sheet for Paula colour-legend usefulness (higher = better). */
  function legendScore(ws) {
    if (!ws) return 0;
    let score = 0;
    const re = /sauce|puree|gels|vege|garnish|starch|protein/i;
    for (const addr of Object.keys(ws)) {
      if (addr[0] === '!') continue;
      const c = ws[addr];
      if (!c) continue;
      const t = c.v != null ? String(c.v) : '';
      if (t && t.length < 48 && re.test(t) && styleHasFill(c.s)) score += 5;
      else if (t && t.length < 48 && re.test(t)) score += 1;
      // coloured marker cells (often empty col A)
      if (styleHasFill(c.s) && (!t || !String(t).trim())) {
        const m = /^A\d+$/i.exec(addr);
        if (m) score += 2;
      }
    }
    return score;
  }
  function cloneSheet(ws) {
    const out = {};
    for (const k of Object.keys(ws)) {
      if (k[0] === '!') {
        if (k === '!merges' && Array.isArray(ws[k])) out[k] = ws[k].map((m) => ({ s: { ...m.s }, e: { ...m.e } }));
        else if (k === '!cols' && Array.isArray(ws[k])) out[k] = ws[k].map((c) => ({ ...c }));
        else if (k === '!rows' && Array.isArray(ws[k])) out[k] = ws[k].map((r) => ({ ...r }));
        else out[k] = ws[k];
        continue;
      }
      const c = ws[k];
      const n = {};
      if (c.t != null) n.t = c.t;
      if (c.v != null) n.v = c.v;
      if (c.f) n.f = c.f;
      if (c.w != null) n.w = c.w;
      if (c.z) n.z = c.z;
      if (c.s) n.s = normalizeStyle(c.s);
      // Empty colour-marker / legend swatch cells must keep a value or SheetJS drops the fill on write.
      if (styleHasFill(c.s) && (n.v == null || n.v === '')) {
        n.t = 's';
        n.v = '';
      }
      if (n.t == null && n.v != null) n.t = typeof n.v === 'number' ? 'n' : 's';
      out[k] = n;
    }
    return out;
  }

  function encCol(idx1) {
    let s = '',
      v = idx1;
    while (v) {
      const m = (v - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      v = Math.floor((v - 1) / 26);
    }
    return s;
  }

  /** Locate pax numeric cell (left of "pax" label) and optional event-label cell. */
  function layoutOf(ws) {
    for (const addr of Object.keys(ws)) {
      if (addr[0] === '!') continue;
      const c = ws[addr];
      if (!c || c.v == null) continue;
      if (!/^\s*pax\s*$/i.test(String(c.v))) continue;
      const m = addr.match(/^([A-Z]+)(\d+)$/i);
      if (!m) continue;
      const col = m[1].toUpperCase();
      const row = +m[2];
      let n = 0;
      for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64);
      const paxAddr = encCol(n - 1) + row;
      const eventAddr = n > 2 ? encCol(n - 2) + row : null;
      // dish title: often B1 or A1
      const titleAddr = ws['B1'] ? 'B1' : ws['A1'] ? 'A1' : null;
      return { paxAddr, labelAddr: addr.toUpperCase(), eventAddr, titleAddr, paxRow: row };
    }
    return null;
  }


  /** Parse "230 x Dish..." / "40x Dish..." blocks from WO column-I notes (CUSTOM MAIN). */
  function parseNoteDishes(notes) {
    const text = String(notes || '');
    if (!text.trim()) return [];
    const dietIdx = text.search(/dietary\s*option\s*:/i);
    const out = [];
    const re = /(\d+)\s*x\s*['"]?\s*([^\n]+)/gi;
    let m;
    while ((m = re.exec(text))) {
      const pax = +m[1];
      let dish = String(m[2] || '').replace(/['"]+/g, '').trim();
      if (/^menu\s*pres/i.test(dish)) continue;
      if (!pax || dish.length < 8) continue;
      // Truncate at trailing GF/VE markers kept; drop "ALTERNATING WITH" noise if captured
      if (/^alternating\b/i.test(dish)) continue;
      const dietary = dietIdx >= 0 && m.index >= dietIdx;
      out.push({ pax, dish, dietary, raw: m[0] });
    }
    return out;
  }

  function altPaxEach(headerPax, nDishes) {
    const n = Math.max(1, nDishes || 1);
    return Math.ceil(Number(headerPax || 0) / n);
  }

  function dietaryPaxFromTotal(headerPax) {
    return Math.ceil(Number(headerPax || 0) * 0.1);
  }

  /**
   * Every function in the date window with include/exclude reason (Gerard audit).
   */
  function inventoryWeek(wo, opts) {
    opts = opts || {};
    const dateFrom = opts.dateFrom || null;
    const dateTo = opts.dateTo || null;
    const byKey = new Map();
    for (const l of wo.lines || []) {
      if (dateFrom && l.date < dateFrom) continue;
      if (dateTo && l.date > dateTo) continue;
      const k = l.date + '|' + (l.event || '');
      if (!byKey.has(k)) {
        byKey.set(k, {
          date: l.date,
          event: l.event,
          acronym: eventAcronym(l.event, l.meal),
          lines: [],
          yellowRed: 0,
          dishish: 0,
          packageOnly: 0,
          popcorn: 0,
          crew: 0,
          customMainNotes: 0,
          noteDishes: []
        });
      }
      const g = byKey.get(k);
      g.lines.push(l);
      const it = clean(l.item);
      const its = lc(it);
      const coloured = l.colour === 'FFFF00' || l.colour === 'FF0000';
      if (coloured) g.yellowRed++;
      if (/popcorn|popping\s*corn/i.test(its)) g.popcorn++;
      if (/\bcrew\s*(main\s*)?meal\b|icc\s*av\s*crew|generic\s*crew/i.test(its)) g.crew++;
      if (/plated\s*menu|two\s*course\s*plated|three\s*course|alternate\s*serve:\s*\d|no\s*signature/i.test(its)) g.packageOnly++;
      if (/custom\s*main/i.test(its) && l.notes) {
        g.customMainNotes++;
        g.noteDishes.push(...parseNoteDishes(l.notes));
      }
      if (
        coloured &&
        !/^(entree|entr[eé]e|main\s*course|dessert|plated\s*menu|breakfast|alternate\s*serve|custom\s*main|dietary\s*option)/i.test(its) &&
        !/popcorn|popping\s*corn|crew\s*meal|generic\s*(menu|crew)|no\s*signature|two\s*course|three\s*course|filter\s*coffee|\bteas?\b/i.test(its) &&
        (Number(l.qty) > 0 || parseNoteDishes(l.notes).length)
      ) {
        g.dishish++;
      }
    }
    // Also surface days in range with zero lines (empty calendar days)
    const days = [];
    if (dateFrom && dateTo) {
      const a = new Date(dateFrom + 'T12:00:00');
      const b = new Date(dateTo + 'T12:00:00');
      for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        days.push(y + '-' + m + '-' + day);
      }
    }
    const out = [];
    for (const iso of days) {
      const events = [...byKey.values()].filter((x) => x.date === iso);
      if (!events.length) {
        out.push({
          date: iso,
          event: null,
          included: false,
          reason: 'no functions listed on this day in the WO'
        });
        continue;
      }
      for (const e of events) {
        let included = false;
        let reason = '';
        if (e.noteDishes.length) {
          included = true;
          reason = 'CUSTOM MAIN notes → ' + e.noteDishes.length + ' dish(es)';
        } else if (e.dishish > 0) {
          included = true;
          reason = e.dishish + ' coloured plated dish row(s)';
        } else if ((e.popcorn || e.packageOnly) && !e.dishish) {
          included = false;
          const bits = [];
          if (e.popcorn) bits.push('popcorn / live station');
          if (e.packageOnly) bits.push('plated package header with no dish selection');
          reason = bits.join(' + ') + ' — not a plated recipe dish';
        } else if (e.crew && !e.dishish) {
          included = false;
          reason = 'crew meals only';
        } else if (!e.yellowRed) {
          included = false;
          reason = 'no yellow/red plated rows';
        } else {
          included = false;
          reason = 'coloured rows present but no matchable plated dishes';
        }
        out.push({
          date: e.date,
          event: e.event,
          acronym: e.acronym,
          included,
          reason,
          yellowRed: e.yellowRed,
          dishish: e.dishish,
          noteDishes: e.noteDishes.map((d) => ({ dish: d.dish.slice(0, 80), pax: d.pax, dietary: d.dietary }))
        });
      }
    }
    return out;
  }

  /**
   * Build per dish×function jobs from parsed WO lines (coloured plated rows).
   * Does NOT aggregate across events — one prep tab per function dish.
   */
  function jobsFromWO(wo, platedBuild, opts) {
    opts = opts || {};
    const dateFrom = opts.dateFrom || null;
    const dateTo = opts.dateTo || null;
    const P =
      typeof AllocPlated !== 'undefined'
        ? AllocPlated
        : typeof require === 'function'
          ? (() => {
              try {
                return require('./alloc-plated.js');
              } catch (e) {
                return null;
              }
            })()
          : null;

    const jobs = [];
    const skipped = [];
    let course = 'Other';
    let dietaryNext = false;
    let lastEk = '';
    let headerPax = 0;
    let altMode = false;
    const HEADER = /^(entree|entr[eé]e|main\s*course|dessert|plated\s*menu|breakfast|alternate\s*serve|custom\s*main)/i;
    const DIETARY_LABEL = /^dietary\s*option\b/i;
    const SKIP_ITEM = /^(no\s*signature\s*dishes|table\s*service|filter\s*coffee|\bteas?\b|botanical\s*water|additional\s*hours|hire\b|service\s*fee|generic\s*(menu|crew)|popcorn|live\s*popcorn|butter\s*popcorn|popping\s*corn|two\s*course\s*plated|three\s*course|plated\s*menu|al\s*ternate)/i;
    const CREW = /\bcrew\s*(main\s*)?meal\b|icc\s*av\s*crew|generic\s*crew/i;
    const COURSE_ENTREE = /\bentr[eé]e\b/i;
    const COURSE_MAIN = /\bmain\s*course\b|\bcustom\s*main\b/i;
    const COURSE_BF = /\bbreakfast\b/i;
    const NON_RECIPE = /popcorn|popping\s*corn|generic\s*menu|extra\s*popping/i;

    const bag = new Map();
    // Pending qty=1 dishes under an alternate header — fix pax after group closes
    const pendingAlt = [];

    function flushAlt() {
      if (!pendingAlt.length || !headerPax) {
        pendingAlt.length = 0;
        return;
      }
      const dishes = pendingAlt.filter((g) => !g.dietary);
      const diets = pendingAlt.filter((g) => g.dietary);
      const n = Math.max(1, dishes.length);
      // Alternate: each dish ceil(total/n). If WO already gave an explicit count, keep the larger.
      const each = altPaxEach(headerPax, n);
      for (const g of dishes) {
        const explicit = Number(g.pax) || 0;
        g.pax = Math.max(explicit, each);
        g.paxExplicit = explicit;
        g.paxComputed = each;
      }
      // Dietary: ceil(10% of course total); use max(explicit, computed)
      const dietEach = dietaryPaxFromTotal(headerPax);
      for (const g of diets) {
        const explicit = Number(g.pax) || 0;
        g.pax = Math.max(explicit, dietEach);
        g.paxExplicit = explicit;
        g.paxComputed = dietEach;
      }
      pendingAlt.length = 0;
    }

    for (const l of wo.lines || []) {
      if (dateFrom && l.date < dateFrom) continue;
      if (dateTo && l.date > dateTo) continue;
      const it = clean(l.item);
      const its = lc(it);
      const ek = l.date + '|' + l.event;
      if (ek !== lastEk) {
        flushAlt();
        course = 'Other';
        dietaryNext = false;
        headerPax = 0;
        altMode = false;
        lastEk = ek;
      }
      // Allow yellow/red; also allow uncoloured breakfast-looking rows
      const isBFLook = /handbowl|scrambled|farmhouse|famhouse|gravlax|ful\s*medames|folded\s*eggs|breakfast/i.test(its);
      if (l.colour && l.colour !== 'FFFF00' && l.colour !== 'FF0000') continue;
      if (!l.colour && !isBFLook) continue;
      if (DIETARY_LABEL.test(its)) {
        dietaryNext = true;
        continue;
      }
      if (HEADER.test(its) || /alternate\s*serve/i.test(its)) {
        flushAlt();
        if (COURSE_ENTREE.test(its)) course = 'Entree';
        else if (COURSE_MAIN.test(its)) course = 'Main';
        else if (/\bdessert\b/i.test(its)) course = 'Dessert';
        else if (COURSE_BF.test(its)) course = 'Breakfast';
        else course = course; // keep
        headerPax = Number(l.qty) || 0;
        altMode = /alternate/i.test(its) || /custom\s*main/i.test(its);
        dietaryNext = false;

        // CUSTOM MAIN / headers that put dishes in column-I notes (e.g. Excellence Awards)
        const noteDishes = parseNoteDishes(l.notes);
        if (noteDishes.length) {
          let meal = mealFromTime(l.time);
          if (course === 'Breakfast') meal = 'Breakfast';
          for (const nd of noteDishes) {
            const dish = P ? P.shortDish(nd.dish) : nd.dish.slice(0, 60);
            const useCourse = nd.dietary ? course : course;
            const key = [l.date, l.event, meal, useCourse, dish, nd.dietary ? 'D' : 'A'].join('|');
            let g = bag.get(key);
            if (!g) {
              g = {
                date: l.date,
                event: l.event,
                eventNo: l.eventNo || '',
                meal,
                course: useCourse === 'Other' ? 'Main' : useCourse,
                dish,
                itemRaw: nd.dish,
                dietary: !!nd.dietary,
                pax: nd.pax,
                paxExplicit: nd.pax,
                paxComputed: nd.dietary ? dietaryPaxFromTotal(headerPax) : null,
                rooms: new Set(),
                times: new Set(),
                rows: [],
                fromAlt: true,
                fromNotes: true
              };
              if (nd.dietary && headerPax) {
                g.pax = Math.max(nd.pax, dietaryPaxFromTotal(headerPax));
              }
              bag.set(key, g);
            } else {
              g.pax = Math.max(g.pax, nd.pax);
            }
            if (l.room) g.rooms.add(l.room);
            if (l.time) g.times.add(l.time);
            g.rows.push(l.r);
          }
          // Notes already carry the dish split — do not wait for phantom qty=1 children
          altMode = false;
        }
        continue;
      }
      if (SKIP_ITEM.test(its) || CREW.test(its) || NON_RECIPE.test(its) || l.qty <= 0) continue;
      // Package / header-only lines with no real dish words
      if (/^(entree|main|dessert|breakfast)\b/i.test(its) && its.length < 40) continue;

      let meal = mealFromTime(l.time);
      if (course === 'Breakfast' || isBFLook) meal = 'Breakfast';
      const dish = P ? P.shortDish(it) : its.slice(0, 60);
      const useCourse = course === 'Other' && isBFLook ? 'Breakfast' : course;
      const key = [l.date, l.event, meal, useCourse, dish].join('|');
      let g = bag.get(key);
      if (!g) {
        g = {
          date: l.date,
          event: l.event,
          eventNo: l.eventNo || '',
          meal,
          course: useCourse,
          dish,
          itemRaw: it,
          dietary: !!dietaryNext,
          pax: 0,
          rooms: new Set(),
          times: new Set(),
          rows: [],
          fromAlt: altMode
        };
        bag.set(key, g);
        if (altMode) pendingAlt.push(g);
      }
      const q = Number(l.qty) || 0;
      g.pax += q;
      if (l.room) g.rooms.add(l.room);
      if (l.time) g.times.add(l.time);
      g.rows.push(l.r);
      g.dietary = g.dietary || !!dietaryNext;
      dietaryNext = false;
    }
    flushAlt();

    for (const g of bag.values()) {
      if (g.course === 'Other' && !/scrambled|farmhouse|breakfast|handbowl/i.test(g.dish)) {
        skipped.push({ dish: g.dish, why: 'not a plated entree/main/breakfast recipe row', date: g.date, event: g.event });
        continue;
      }
      jobs.push({
        date: g.date,
        event: g.event,
        meal: g.meal,
        course: g.course,
        dish: g.dish,
        itemRaw: g.itemRaw,
        dietary: g.dietary,
        pax: g.pax,
        paxExplicit: g.paxExplicit != null ? g.paxExplicit : null,
        paxComputed: g.paxComputed != null ? g.paxComputed : null,
        fromNotes: !!g.fromNotes,
        rooms: [...g.rooms],
        acronym: eventAcronym(g.event, g.meal),
        woRows: g.rows
      });
    }
    const mealOrd = { Breakfast: 0, Lunch: 1, Dinner: 2 };
    const courseOrd = ['Breakfast', 'Entree', 'Main', 'Dessert', 'Other'];
    jobs.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.event.localeCompare(b.event) ||
        (mealOrd[a.meal] || 9) - (mealOrd[b.meal] || 9) ||
        courseOrd.indexOf(a.course) - courseOrd.indexOf(b.course)
    );
    disambiguateAcronyms(jobs);
    return { jobs, skipped };
  }

  /**
   * @param {object} opts
   * @param {object} opts.wo - parseWorkOrder result
   * @param {object[]} opts.masters - [{name, wb}] SheetJS workbooks (Entrees / Mains)
   * @param {object} [opts.XLSX] - sheet lib
   */
  function buildPrepList(opts) {
    const X = opts.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    if (!X) throw new Error('XLSX required');
    if (!Formula) throw new Error('AllocFormula missing');

    const sheetIndex = new Map(); // name -> {wb, ws, source}
    const allNames = [];
    for (const m of opts.masters || []) {
      if (!m || !m.wb) continue;
      for (const n of m.wb.SheetNames) {
        if (/^BULK\b|^Bulk\b|PLATED\s*MONTHLY|^CUTAWAY\b/i.test(n)) continue;
        if (!sheetIndex.has(n)) {
          sheetIndex.set(n, { wb: m.wb, name: n, source: m.name || 'master' });
          allNames.push(n);
        }
      }
    }

    const { jobs, skipped: skipNon } = jobsFromWO(opts.wo, null, opts);
    const outWb = X.utils.book_new();
    const usedNames = new Set();
    const matched = [];
    const unmatched = [];
    const formulaErrors = [];

    for (const job of jobs) {
      const hit = matchMaster(job.itemRaw || job.dish, allNames);
      if (!hit || (!hit.matched && !(hit.candidates && hit.candidates.length))) {
        unmatched.push({
          dish: job.dish,
          itemRaw: job.itemRaw,
          date: job.date,
          event: job.event,
          pax: job.pax,
          reason: hit && hit.missing ? 'master sheet not in loaded files: ' + hit.missing : 'no master alias for dish'
        });
        continue;
      }
      // Prefer the candidate master tab with the strongest Paula colour legend.
      const cands = (hit.candidates && hit.candidates.length
        ? hit.candidates
        : [hit.matched]).filter((n) => n && sheetIndex.has(n));
      if (!cands.length) {
        unmatched.push({
          dish: job.dish,
          itemRaw: job.itemRaw,
          date: job.date,
          event: job.event,
          pax: job.pax,
          reason: hit && hit.missing ? 'master sheet not in loaded files: ' + hit.missing : 'no master alias for dish'
        });
        continue;
      }
      let bestName = cands[0], bestScore = -1;
      for (const n of cands) {
        const sc = legendScore(sheetIndex.get(n).wb.Sheets[n]);
        if (sc > bestScore) { bestScore = sc; bestName = n; }
      }
      hit.matched = bestName;
      const meta = sheetIndex.get(hit.matched);
      const src = meta.wb.Sheets[hit.matched];
      const ws = cloneSheet(src);
      applySamplePrintSetup(ws);
      const lay = layoutOf(ws);
      if (!lay) {
        formulaErrors.push({ sheet: hit.matched, error: 'could not find pax cell layout' });
        unmatched.push({ dish: job.dish, reason: 'master layout: no pax cell', sheet: hit.matched });
        continue;
      }
      // Set covers — keep cell fill/font from the master
      const prevPax = ws[lay.paxAddr] || {};
      ws[lay.paxAddr] = { t: 'n', v: job.pax, s: prevPax.s };
      // Event label when that cell is a string slot (standard C2-pax layout with B2 label)
      if (lay.eventAddr && ws[lay.eventAddr] != null) {
        const cur = ws[lay.eventAddr];
        if (cur.t === 's' || typeof cur.v === 'string' || cur.v == null || cur.v === '') {
          ws[lay.eventAddr] = { t: 's', v: fmtEventLabel(job.date, job.meal, job.acronym), s: cur.s };
        }
      } else if (lay.paxAddr === 'C2' && (ws['B2'] == null || typeof (ws['B2'] && ws['B2'].v) === 'string')) {
        const curB = ws['B2'] || {};
        ws['B2'] = { t: 's', v: fmtEventLabel(job.date, job.meal, job.acronym), s: curB.s };
      }

      const rec = Formula.recalcSheet(ws);
      if (rec.errors && rec.errors.length) {
        formulaErrors.push({ sheet: hit.matched, dish: job.dish, errors: rec.errors });
      }

      let name = safeSheetName(tabName(job.date, hit.course === 'E' ? 'E' : hit.course === 'BF' ? 'BF' : 'M', hit.key, job.acronym), 'Dish');
      let uniq = name;
      let i = 2;
      while (usedNames.has(uniq)) {
        uniq = safeSheetName(name.slice(0, 28) + ' ' + i, 'Dish');
        i++;
      }
      usedNames.add(uniq);
      X.utils.book_append_sheet(outWb, ws, uniq);
      const eventLabel = fmtEventLabel(job.date, job.meal, job.acronym);
      matched.push({
        tab: uniq,
        master: hit.matched,
        masterSource: meta.source,
        dish: job.dish,
        date: job.date,
        event: job.event,
        meal: job.meal,
        pax: job.pax,
        paxExplicit: job.paxExplicit,
        paxComputed: job.paxComputed,
        dietary: !!job.dietary,
        fromNotes: !!job.fromNotes,
        acronym: job.acronym,
        formulaCells: Object.keys(rec.values || {}).length,
        paxAddr: lay.paxAddr,
        eventAddr: lay.eventAddr || null,
        labelAddr: lay.labelAddr || null,
        eventLabel: eventLabel
      });
    }

    // Index sheet
    // Keep match report in memory only — Load a preplist treats EVERY tab as a dish,
    // so do not append an index sheet (it would appear as a fake dish).

    // Optional bespoke / manually-built tabs (from in-app Excel editor)
    for (const extra of opts.extraSheets || []) {
      if (!extra || !extra.ws) continue;
      let name = safeSheetName(extra.tab || extra.name || 'Bespoke', 'Bespoke');
      let uniq = name;
      let i = 2;
      while (usedNames.has(uniq)) {
        uniq = (name.slice(0, 28) + ' ' + i).slice(0, 31);
        i++;
      }
      usedNames.add(uniq);
      const ws = cloneSheet(extra.ws);
      applySamplePrintSetup(ws);
      X.utils.book_append_sheet(outWb, ws, uniq);
      matched.push({
        tab: uniq,
        master: extra.master || '(bespoke)',
        dish: extra.dish || uniq,
        date: extra.date || '',
        event: extra.event || '',
        meal: extra.meal || '',
        pax: extra.pax != null ? extra.pax : null,
        dietary: !!extra.dietary,
        fromNotes: false,
        acronym: extra.acronym || 'BESPOKE',
        formulaCells: 0,
        bespoke: true
      });
    }

    return {
      workbook: outWb,
      matched,
      unmatched,
      skipped: skipNon,
      formulaErrors,
      fileName: prepFileName(opts.wo, opts)
    };
  }


  /**
   * STEP 2 — one-row-per-function day-by-day summary.
   * Columns: Day, Date, Function, Entree, Entree pax, Main, Main pax, Dietaries, Dietary pax
   */
  function buildDaySummary(opts) {
    const X = opts.XLSX || (typeof XLSX !== 'undefined' ? XLSX : null);
    if (!X) throw new Error('XLSX required');
    const { jobs } = jobsFromWO(opts.wo, null, opts);
    const bag = new Map();
    for (const j of jobs) {
      const k = j.date + '|' + j.event + '|' + j.meal;
      let g = bag.get(k);
      if (!g) {
        g = {
          date: j.date,
          event: j.event,
          meal: j.meal,
          acronym: j.acronym,
          breakfasts: [],
          entrees: [],
          mains: [],
          dietaries: []
        };
        bag.set(k, g);
      }
      const entry = { dish: j.dish, pax: j.pax };
      if (j.dietary) g.dietaries.push(entry);
      else if (j.course === 'Breakfast' || j.meal === 'Breakfast') g.breakfasts.push(entry);
      else if (j.course === 'Entree') g.entrees.push(entry);
      else if (j.course === 'Main') g.mains.push(entry);
      else if (/scrambled|farmhouse|breakfast|handbowl/i.test(j.dish)) g.breakfasts.push(entry);
      else g.mains.push(entry);
    }
    const mealOrd = { Breakfast: 0, Lunch: 1, Dinner: 2 };
    const rows = [...bag.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.event.localeCompare(b.event) || (mealOrd[a.meal] || 9) - (mealOrd[b.meal] || 9)
    );
    const fmtDishes = (arr) => arr.map((x) => x.dish).join(' / ');
    const fmtPax = (arr) => {
      if (!arr.length) return '';
      if (arr.length === 1) return arr[0].pax;
      const all = arr.map((x) => x.pax);
      if (all.every((p) => p === all[0])) return all[0];
      return arr.map((x) => x.dish + ' ' + x.pax).join(' / ');
    };
    const aoa = [
      ['Day-by-day function summary'],
      ['Week Ending', summaryWE(opts.wo, opts)],
      [],
      ['Day', 'Date', 'Function', 'Full event', 'Meal', 'Breakfast', 'Breakfast pax', 'Entree', 'Entree pax', 'Main', 'Main pax', 'Dietaries', 'Dietary pax'],
      ...rows.map((r) => {
        const dt = new Date(r.date + 'T00:00');
        const day = DAYS_LONG[dt.getDay()];
        const n = dayNum(r.date);
        const [y, m, d] = r.date.split('-');
        return [
          n + ' ' + day,
          d + '/' + m + '/' + y,
          r.acronym || eventAcronym(r.event, r.meal),
          r.event,
          r.meal,
          fmtDishes(r.breakfasts),
          fmtPax(r.breakfasts),
          fmtDishes(r.entrees),
          fmtPax(r.entrees),
          fmtDishes(r.mains),
          fmtPax(r.mains),
          fmtDishes(r.dietaries),
          fmtPax(r.dietaries)
        ];
      })
    ];
    const ws = X.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { width: 14 }, { width: 12 }, { width: 18 }, { width: 42 }, { width: 10 },
      { width: 36 }, { width: 12 }, { width: 36 }, { width: 12 },
      { width: 36 }, { width: 12 }, { width: 36 }, { width: 12 }
    ];
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'Day summary');

    // Sheet 2: every calendar day Mon–Sun in the WE window + every WO function with include/exclude reason
    const inv = inventoryWeek(opts.wo, opts) || [];
    const invAoa = [
      ['All-days function check (include / exclude)'],
      ['Week Ending', summaryWE(opts.wo, opts)],
      [],
      ['Day', 'Date', 'Function', 'Acronym', 'Included?', 'Reason', 'Coloured dish rows', 'Note dishes']
    ];
    for (const e of inv) {
      const dt = new Date(e.date + 'T12:00:00');
      const day = DAYS_LONG[dt.getDay()];
      const n = dayNum(e.date);
      const [y, m, d] = e.date.split('-');
      const noteN = (e.noteDishes && e.noteDishes.length) || 0;
      invAoa.push([
        n + ' ' + day,
        d + '/' + m + '/' + y,
        e.event || '(no function)',
        e.acronym || '',
        e.included ? 'YES' : 'no',
        e.reason || '',
        e.dishish != null ? e.dishish : '',
        noteN
      ]);
    }
    const wsInv = X.utils.aoa_to_sheet(invAoa);
    wsInv['!cols'] = [
      { width: 14 }, { width: 12 }, { width: 48 }, { width: 12 },
      { width: 10 }, { width: 64 }, { width: 16 }, { width: 12 }
    ];
    X.utils.book_append_sheet(wb, wsInv, 'All days check');
    return { workbook: wb, rows, inventory: inv, fileName: summaryFileName(opts.wo, opts) };
  }

  function weekEndingISO(wo, opts) {
    opts = opts || {};
    if (opts.weekEnding) return opts.weekEnding;
    if (opts.dateTo) {
      // snap dateTo up to that week's Sunday
      const d = new Date(opts.dateTo + 'T00:00');
      const day = d.getDay(); // 0 Sun
      const add = day === 0 ? 0 : 7 - day;
      d.setDate(d.getDate() + add);
      return d.toISOString().slice(0, 10);
    }
    const days = (wo && wo.days) || [];
    const last = days[days.length - 1] || '2026-01-01';
    const d = new Date(last + 'T00:00');
    const day = d.getDay();
    const add = day === 0 ? 0 : 7 - day;
    d.setDate(d.getDate() + add);
    return d.toISOString().slice(0, 10);
  }

  function summaryWE(wo, opts) {
    const iso = weekEndingISO(wo, opts);
    const [y, m, d] = iso.split('-');
    return d + '/' + m + '/' + y;
  }

  function summaryFileName(wo, opts) {
    const tag = opts && opts.versionTag ? ' ' + opts.versionTag : '';
    return 'Plated day-by-day summary WE ' + summaryWE(wo, opts).replace(/\//g, '.') + tag + '.xlsx';
  }

  function prepFileName(wo, opts) {
    const tag = opts && opts.versionTag ? ' ' + opts.versionTag : '';
    return 'Plated prep list WE ' + summaryWE(wo, opts).replace(/\//g, '.') + tag + '.xlsx';
  }


  function applySamplePrintSetup(ws) {
    // SheetJS / xlsx-js-style page setup — photo injector also patches OOXML to match sample exactly.
    ws['!pageSetup'] = {
      paperSize: 9,
      orientation: 'landscape',
      fitToWidth: 1,
      fitToHeight: 1,
      pageOrder: 'overThenDown'
    };
    ws['!printOptions'] = { horizontalCentered: true, gridLines: true };
    ws['!margins'] = { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0, footer: 0 };
    return ws;
  }


  /** Write prep workbook with cellStyles so Paula colour fills/legend survive. */
  function writePrepXlsx(workbook, XLSXlib) {
    const X = XLSXlib || (typeof XLSX !== 'undefined' ? XLSX : null);
    if (!X) throw new Error('XLSX required');
    return X.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true });
  }

  /**
   * Blank master-shaped sheet with Paula's colour legend (exact RGB used on 2026 masters).
   * Layout: A = colour marker, B = item, C = per person, D = unit, E = total formula, L = legend.
   */
  function blankPaulaLegendSheet(opts) {
    opts = opts || {};
    const dish = opts.dish || 'Bespoke dish';
    const eventLabel = opts.eventLabel || '';
    const pax = opts.pax != null ? opts.pax : 100;
    const rows = opts.rows || []; // [{item, per, unit, cat}] cat: sauce|vege|garnish|starch|protein
    const CAT = {
      sauce: { rgb: 'FF4A86E8', label: 'Sauce, Puree, Gels' },
      vege: { rgb: 'FF00FF00', label: 'Vege' },
      garnish: { rgb: 'FFFF9900', label: 'Garnish' },
      starch: { rgb: 'FFFFFF00', label: 'Starch' },
      protein: { rgb: 'FFFF0000', label: 'Protein' }
    };
    const fill = (rgb) => ({ fill: { patternType: 'solid', fgColor: { rgb: rgb } } });
    const ws = {};
    ws['B1'] = { t: 's', v: dish, s: fill('FFFFFF00') };
    ws['G1'] = { t: 's', v: 'COMMENTS', s: fill('FFF6B26B') };
    ws['B2'] = { t: 's', v: eventLabel || 'Event' };
    ws['C2'] = { t: 'n', v: pax };
    ws['D2'] = { t: 's', v: 'pax' };
    ws['B3'] = { t: 's', v: 'Item' };
    ws['C3'] = { t: 's', v: 'per person' };
    ws['D3'] = { t: 's', v: 'unit' };
    ws['E3'] = { t: 's', v: 'total' };
    const legendOrder = ['sauce', 'vege', 'garnish', 'starch', 'protein'];
    legendOrder.forEach((k, i) => {
      const r = 4 + i;
      ws['L' + r] = { t: 's', v: CAT[k].label, s: fill(CAT[k].rgb) };
    });
    const defaultRows = rows.length
      ? rows
      : [
          { item: 'Protein element / Prep', per: 1, unit: 'ea', cat: 'protein' },
          { item: 'Sauce / Puree', per: 20, unit: 'g', cat: 'sauce' },
          { item: 'Vegetable element', per: 30, unit: 'g', cat: 'vege' },
          { item: 'Starch element', per: 80, unit: 'g', cat: 'starch' },
          { item: 'Garnish / herbs', per: 2, unit: 'g', cat: 'garnish' }
        ];
    defaultRows.forEach((row, i) => {
      const r = 4 + i;
      const cat = CAT[row.cat] || CAT.garnish;
      ws['A' + r] = { t: 's', v: '', s: fill(cat.rgb) };
      ws['B' + r] = { t: 's', v: row.item || '' };
      ws['C' + r] = { t: 'n', v: row.per != null ? row.per : 1 };
      ws['D' + r] = { t: 's', v: row.unit || 'g' };
      ws['E' + r] = { t: 'n', f: '=$C$2*C' + r, v: (row.per != null ? row.per : 1) * pax };
    });
    const last = 3 + Math.max(defaultRows.length, 5);
    ws['!ref'] = 'A1:L' + Math.max(last, 8);
    ws['!cols'] = [{ wch: 3 }, { wch: 55 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 28 }];
    applySamplePrintSetup(ws);
    return ws;
  }

  const API = {
    buildPrepList,
    buildDaySummary,
    jobsFromWO,
    inventoryWeek,
    parseNoteDishes,
    altPaxEach,
    dietaryPaxFromTotal,
    matchMaster,
    mealFromTime,
    eventAcronym,
    clientBase,
    eventDistinguisher,
    disambiguateAcronyms,
    tabName,
    safeSheetName,
    fmtEventLabel,
    layoutOf,
    cloneSheet,
    applySamplePrintSetup,
    writePrepXlsx,
    blankPaulaLegendSheet,
    legendScore,
    normalizeStyle,
    summaryFileName,
    prepFileName,
    ALIASES
  };
  root.AllocPrepList = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
