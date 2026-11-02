/**
 * Prepline 4.7.2 — synthetic week: recognition, shared mise, prep days, plan views.
 * No Paula private files.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'prep-days-vocab.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'batching.js'), 'utf8'), ctx);
const B = ctx.window.PreplineBatch;
const VOCAB = ctx.window.PREP_DAYS_VOCAB;

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed++; }
  else console.log('OK:', msg);
}

// --- Component recognition ---
const p1 = B.parseTaskParts('Orange Dutch Carrots / Wash / Trim / Bag / Cook / Tray');
assert(p1.base === 'carrot' && p1.method === 'cook', 'Dutch carrots → base carrot / cook');
const p2 = B.parseTaskParts('Baby carrots SV');
assert(p2.base === 'carrot' && p2.method === 'sous vide', 'Baby carrots SV → carrot / sous vide');
const p3 = B.parseTaskParts('Carrot Puree / Blend');
assert(p3.method === 'puree' && p3.base === 'carrot', 'Carrot puree → method puree, not merged with cook');
const p4 = B.parseTaskParts('purée of cauliflower');
assert(p4.method === 'puree' && /cauliflower/.test(p4.name), 'purée accent → puree cauliflower');

// Shared mise: same base, different methods — NOT one batch key
assert(p1.name + '|' + p1.method !== p2.name + '|' + p2.method, 'cook vs SV carrots are distinct batch keys');
assert(p1.name + '|' + p1.method !== p3.name + '|' + p3.method, 'cook vs puree carrots are distinct batch keys');
const mise = B.findSharedMise([
  { task: 'Orange Dutch Carrots / Wash / Cook' },
  { task: 'Baby carrots SV' },
  { task: 'Carrot Puree / Blend' }
]).filter(g => g.base === 'carrot');
assert(mise.length === 1 && mise[0].methods.length >= 2, 'Shared mise hint for carrot multi-method');

// --- Synthetic week rows ---
const dishes = [
  { dish: 'Roasted Chicken TA — Monday Dinner', event: 'Monday', items: [
    { task: 'Chicken Breast Skin On / Brine / Sear', section: 'Proteins', prepCat: 'poultry', lead: 4 },
    { task: 'Orange Dutch Carrots / Wash / Trim / Bag / Cook', section: 'Vegetables', prepCat: 'veg', lead: 2 },
    { task: 'Pea + Tarragon Puree / Blend / Bag', section: 'Sauce, Purees and Gels', prepCat: 'gels', lead: 3 },
    { task: 'Microherbs', section: 'Garnishes, Herbs, Powders, Oils Etc.', prepCat: 'micro', lead: 1 },
  ]},
  { dish: 'Duck Breast CEO — Wednesday Dinner', event: 'Wednesday', items: [
    { task: 'Duck Breast / Brine / Smoke / Sear', section: 'Proteins', prepCat: 'poultry', lead: 4 },
    { task: 'Orange Dutch Carrots / Wash / Trim / Bag / Cook', section: 'Vegetables', prepCat: 'veg', lead: 2 },
    { task: 'Carrot Puree / Blend', section: 'Sauce, Purees and Gels', prepCat: 'gels', lead: 3 },
    { task: 'Porcini Mushroom Soil', section: 'Garnishes, Herbs, Powders, Oils Etc.', prepCat: 'dry', lead: 4 },
  ]},
  { dish: 'Salmon WLS — Thursday Dinner', event: 'Thursday', items: [
    { task: 'Torched Salmon / Cure / SV', section: 'Proteins', prepCat: 'seafood', lead: 1 },
    { task: 'Yellow Dutch Carrots / Wash / Trim / Bag / Cook', section: 'Vegetables', prepCat: 'veg', lead: 2 },
    { task: 'Potato Terrine / Assemble / Cook', section: 'Starch', prepCat: 'starch', lead: 3 },
    { task: 'Green Oil', section: 'Sauce, Purees and Gels', prepCat: 'oil', lead: 4 },
  ]},
];

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function prepDay(event, lead) {
  const i = DAYS.indexOf(event);
  let raw = DAYS[(i - lead + 70) % 7];
  if (raw === 'Sunday' || raw === 'Saturday') {
    const leadFromRaw = (i - DAYS.indexOf(raw) + 7) % 7;
    const fwd = raw === 'Saturday' ? 2 : 1;
    raw = leadFromRaw - fwd <= 0 ? 'Friday' : 'Monday';
  }
  return raw;
}

const rows = [];
dishes.forEach(d => {
  d.items.forEach(it => {
    rows.push({
      task: it.task, item: it.task, dish: d.dish, unit: 'g',
      section: it.section, prepCat: it.prepCat, leadDays: it.lead,
      eventDay: d.event, day: prepDay(d.event, it.lead), qtyEach: 1, qty: 10
    });
  });
});

assert(rows.every(r => r.day !== 'Sunday'), 'No Sunday prep days');
assert(new Set(rows.map(r => r.section)).size >= 5, 'Multiple sections present');
assert(new Set(rows.map(r => r.eventDay)).size >= 3, 'Multiple event days');

// Views data shapes
const byDish = {};
rows.forEach(r => { (byDish[r.dish] ||= []).push(r); });
assert(Object.keys(byDish).length === 3, 'By dish: 3 dish groups');

const byDay = {};
rows.forEach(r => { (byDay[r.day] ||= []).push(r); });
assert(!byDay['Sunday'], 'By day: Sunday absent');
assert(Object.keys(byDay).some(d => DAYS.indexOf(d) >= 0 && d !== 'Sunday'), 'By day: Mon–Sat groups');

const SEC_ORDER = ['Proteins','Vegetables','Starch','Sauce, Purees and Gels','Garnishes, Herbs, Powders, Oils Etc.'];
const bySec = {};
rows.forEach(r => { (bySec[r.section] ||= []).push(r); });
assert(SEC_ORDER.every(s => bySec[s] && bySec[s].length), 'By section: all legend sections have items');

// Batching: orange dutch carrots Mon+Wed → merge
B.setBatchAcross(true);
const byDishEvent = {};
rows.forEach(r => { byDishEvent[r.dish] = r.eventDay; });
const groups = B.buildBatches(rows, {
  getEventDay: d => byDishEvent[d] || '',
  blockedDays: new Set(['Sunday']),
  computeTotal: () => null
});
const carrotMerged = groups.filter(g => /carrot/i.test(g.taskLabel || '') && !/puree/i.test(g.taskLabel || ''));
assert(carrotMerged.some(g => g.merged), 'Dutch carrots across days merge into one batch line');
const pureeSolo = groups.filter(g => /puree/i.test(g.taskLabel || '') && /carrot/i.test(g.taskLabel || ''));
assert(pureeSolo.length >= 1 && !pureeSolo.some(g => g.merged && carrotMerged.includes(g)), 'Carrot puree stays separate from cook carrots');

const shared = B.findSharedMise(rows).filter(g => g.base === 'carrot' && g.methods.length >= 2);
assert(shared.length >= 1, 'Shared mise lists carrot cook + puree (+ SV if present)');

// VERSION
const ver = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
assert(ver === '4.7.2', 'VERSION is 4.7.2');

// Plan toggle markup
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(html.includes('u47-plan-toggle') && html.includes('By dish') && html.includes('By day') && html.includes('By section'), 'Plan toggle Dish/Day/Section present');
assert(html.includes('upgrades-472.js'), 'upgrades-472 loaded');

if (failed) { console.error('\n' + failed + ' failed'); process.exit(1); }
console.log('\nAll synthetic 4.7.2 checks passed.');
