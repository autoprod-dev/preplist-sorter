/* Prepline: Plated kitchen work-order extraction.
   Same day/event/room/qty/item columns as Larder; Colour Codes legend is Plated (FFFF00) + Cutaway.
   Builds Entree / Main / Dessert allocation sheets. No real guest data in here. */
(function (root) {
  'use strict';
  const DW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const FILL = { Entree: 'FFFF00', Main: 'F4B183', Dessert: 'D5A6BD', Other: 'CFE2F3' };
  const HEADER = /^(entree|entr[eé]e|main\s*course|dessert|plated\s*menu|breakfast|alternate\s*serve)\b/i;
  const COURSE_ENTREE = /\bentr[eé]e\b/i;
  const COURSE_MAIN = /\bmain\s*course\b/i;
  const COURSE_DESSERT = /\bdessert\b/i;
  const COURSE_BF = /\bbreakfast\b|seated\s*breakfast/i;
  const DIETARY_LABEL = /^dietary\s*option\b/i;
  const SKIP_ITEM = /^(no\s*signature\s*dishes|table\s*service|filter\s*coffee|\bteas?\b|botanical\s*water|additional\s*hours|hire\b|service\s*fee)\b/i;
  const CREW = /\bcrew\s*(main\s*)?meal\b|icc\s*av\s*crew/i;
  const GENERIC = /generic\s*menu\s*item|two\s*course\s*plated|sydneysider\s*seated|dish\s*selection\s*missing/i;
  const TAGS = /\s+\b(GF|VE|V|DF|LC|contains\b.*)(\s+(GF|VE|V|DF|LC))*\s*$/i;

  const clean = (v) => (v == null ? '' : String(v).replace(/\u00a0/g, ' ').trim());
  const lc = (s) => String(s || '').toLowerCase();

  function shortDish(t) {
    t = clean(t).split('\n')[0].replace(/^["'\-\s•]+/, '');
    t = t.replace(/\((serves|pfd|ge|v|gf)[^)]*\)/gi, '');
    let seg = t.split(/,| with | served | – | - /i);
    let s = (seg[0] || '').trim();
    if (s.split(/\s+/).length < 2 && seg[1]) s += ' ' + seg[1].trim();
    return lc(s.replace(TAGS, '').replace(/\s+/g, ' ').trim());
  }

  function courseFromHeader(item) {
    const s = lc(item);
    if (COURSE_ENTREE.test(s)) return 'Entree';
    if (COURSE_MAIN.test(s)) return 'Main';
    if (COURSE_DESSERT.test(s)) return 'Dessert';
    if (COURSE_BF.test(s)) return 'Other';
    if (/^plated\s*menu/i.test(s)) return 'Other';
    return 'Other';
  }

  /** Detect Larder vs Plated from Colour Codes legend and sheet names. */
  function detectSection(legend, sheetNames) {
    const names = (legend || []).map((l) => lc(l.name || l));
    const sheets = (sheetNames || []).map((n) => lc(n));
    // Sheet tab names are authoritative when present
    if (sheets.some((n) => /plated\s*tally|^plated$/.test(n))) return 'Plated';
    if (sheets.some((n) => /larder\s*tally|^larder$/.test(n))) return 'Larder';
    const hasPlated = names.some((n) => /^plated$/.test(n.trim()));
    const hasLarder = names.some((n) =>
      /^(sandwich|canap[eé]s?|salad|fruit|fruits|kiosk|platters?|green\s*room|syd\s*eats|retail)$/.test(n.trim())
    );
    if (hasPlated && !hasLarder) return 'Plated';
    if (hasLarder && !hasPlated) return 'Larder';
    if (hasPlated) return 'Plated';
    return 'Larder';
  }

  function build(wo, S) {
    const L = wo.lines || [];
    const skipped = [];
    const trace = [];
    const out = new Map();
    const functions = new Map();
    let course = 'Other';
    let dietaryNext = false;
    let lastEk = '';

    const put = (sec, date, dish, pax, o) => {
      const key = sec + '|' + date + '|' + dish;
      let g = out.get(key);
      if (!g) {
        g = {
          section: sec,
          date,
          dates: [date],
          dish,
          parts: [],
          rows: [],
          first: o.r,
          kind: o.kind || 'dish',
          fill: FILL[sec] || FILL.Other,
          flags: new Set(),
          dietary: !!o.dietary,
          events: new Set(),
          rooms: new Set()
        };
        out.set(key, g);
      }
      if (pax != null && pax !== '') {
        const q = typeof pax === 'number' ? pax : Number(pax);
        if (Number.isFinite(q)) g.parts.push({ r: o.r, q });
        else g.raw = pax;
      }
      g.rows.push(o.r);
      g.first = Math.min(g.first, o.r);
      if (o.event) g.events.add(o.event);
      if (o.room) g.rooms.add(o.room);
      if (o.flag) g.flags.add(o.flag);
      if (o.dietary) g.dietary = true;
      trace.push({ woRow: o.r, dish, section: sec });
      return g;
    };

    for (const l of L) {
      const it = clean(l.item);
      const its = lc(it);
      const ek = l.date + '|' + l.event;
      if (ek !== lastEk) {
        course = 'Other';
        dietaryNext = false;
        lastEk = ek;
      }
      if (!functions.has(ek)) {
        functions.set(ek, {
          date: l.date,
          event: l.event,
          eventNo: l.eventNo || '',
          rooms: new Set(),
          dishes: 0,
          paxMax: 0
        });
      }
      const fn = functions.get(ek);
      if (l.room) fn.rooms.add(l.room);

      // Only Plated / cutaway-coloured rows (and uncoloured parents are already filtered by parse)
      if (l.colour && l.colour !== 'FFFF00' && l.colour !== 'FF0000') {
        // non-plated colours on a plated sheet — skip
        skipped.push({ r: l.r, item: it, why: 'colour ' + l.colour + ' not Plated yellow' });
        continue;
      }
      if (!l.colour) {
        skipped.push({ r: l.r, item: it, why: 'uncoloured (not Plated)' });
        continue;
      }

      if (DIETARY_LABEL.test(its)) {
        dietaryNext = true;
        skipped.push({ r: l.r, item: it, why: 'dietary label (marks following dish)' });
        continue;
      }
      if (HEADER.test(its) || /alternate\s*serve\s*:?\s*$/i.test(its)) {
        course = courseFromHeader(it);
        dietaryNext = false;
        if (l.qty > 1) fn.paxMax = Math.max(fn.paxMax, l.qty);
        skipped.push({ r: l.r, item: it, why: 'course / menu header (pax context only)' });
        continue;
      }
      if (SKIP_ITEM.test(its)) {
        skipped.push({ r: l.r, item: it, why: 'service / non-dish row' });
        continue;
      }
      if (CREW.test(its)) {
        skipped.push({ r: l.r, item: it, why: 'crew meal (not plated guest dish — confirm)' });
        continue;
      }
      if (l.qty <= 0) {
        skipped.push({ r: l.r, item: it, why: 'qty 0' });
        continue;
      }

      let sec = course;
      if (COURSE_BF.test(its) || /^plated\s*item:/i.test(its)) sec = 'Other';
      const dish = shortDish(it) || its.slice(0, 40);
      const dietary = dietaryNext;
      dietaryNext = false;
      const flag = GENERIC.test(its) ? 'Dish / menu selection may be missing — confirm' : null;
      put(sec, l.date, dish, l.qty, {
        r: l.r,
        event: l.event,
        room: l.room,
        dietary,
        flag,
        kind: 'dish'
      });
      fn.dishes += 1;
      fn.paxMax = Math.max(fn.paxMax, l.qty || 0);
    }

    const lines = [];
    for (const g of out.values()) {
      const total = g.parts.reduce((a, p) => a + p.q, 0);
      const pv =
        g.raw != null
          ? g.raw
          : g.parts.length > 1
            ? '=' + g.parts.map((p) => p.q).join('+')
            : g.parts.length
              ? total
              : null;
      const notesBits = [];
      if (g.dietary) notesBits.push('dietary');
      if (g.events.size === 1) notesBits.push([...g.events][0]);
      else if (g.events.size > 1) notesBits.push(g.events.size + ' functions');
      if (g.rooms.size > 1) notesBits.push(g.rooms.size + ' rooms');
      lines.push({
        section: g.section,
        date: g.date,
        dates: g.dates,
        dish: g.dish,
        paxValue: pv,
        paxTotal: typeof pv === 'number' ? pv : total,
        dayWord: null,
        fill: g.fill,
        flag: [...g.flags].join(' · ') || null,
        notes: notesBits.join(' · ') || null,
        woRows: [...new Set(g.rows)],
        first: g.first,
        kind: g.kind,
        dietary: g.dietary,
        syd: false,
        startMin: null
      });
    }
    lines.sort(
      (a, b) =>
        (a.date || '').localeCompare(b.date || '') ||
        ['Entree', 'Main', 'Dessert', 'Other'].indexOf(a.section) -
          ['Entree', 'Main', 'Dessert', 'Other'].indexOf(b.section) ||
        (a.first || 0) - (b.first || 0)
    );

    const fnList = [...functions.values()]
      .map((f) => ({
        date: f.date,
        event: f.event,
        eventNo: f.eventNo,
        rooms: [...f.rooms],
        dishes: f.dishes,
        paxMax: f.paxMax
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.event.localeCompare(b.event));

    return { lines, skipped, trace, functions: fnList, kitchenSection: 'Plated' };
  }

  const API = {
    detectSection,
    build,
    shortDish,
    FILL,
    SERVICE_SECTIONS: ['Entree', 'Main', 'Dessert'],
    PREP_SECTIONS: [
      { key: 'Entree', title: 'Entree prep', fill: FILL.Entree, matrix: [['Entree', 'am'], [null, 'pm']] },
      { key: 'Main', title: 'Main prep', fill: FILL.Main, matrix: [['Main', 'am'], [null, 'pm']] },
      { key: 'Dessert', title: 'Dessert prep', fill: FILL.Dessert, matrix: [['Dessert', 'am'], [null, 'pm']] },
      { key: 'Other', title: 'Other / breakfast', fill: FILL.Other, matrix: [['Other', 'am'], [null, 'pm']] }
    ],
    SERVICE_FILL: FILL
  };
  root.AllocPlated = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
