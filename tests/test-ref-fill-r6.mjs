/**
 * Unit: Ref # autofill rules for 4.8.35-r12
 * Keyword-first (plurals/short-long), then date filter.
 * Fresh/perishable: 0..4 (prefer 3 then 4). Dry: STRICT 3|4.
 * Microherbs/fish/seafood (incl. oyster) + Get Fish: 0..2.
 * HENG: 0..1. Tap/ice/SUB blank.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const a = html.indexOf('const PO_STOP =');
const b = html.indexOf('const PO_MONTHS =');
if (a < 0 || b < 0) throw new Error('extract bounds missing');
const block = html.slice(a, b);

const sandbox = {
  console,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  POS: [],
  poLinks: {},
  poMatchCache: null,
  PO_KEY: 'k',
  PO_LINK_KEY: 'l',
  norm: (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim(),
};
sandbox.ingKey = (task) => sandbox.norm(task);
const inHouse = html.slice(html.indexOf('function poIsInHouse(task){'), a);
const boxStart = html.indexOf('function poSupplierShort(n){');
const boxEnd = html.indexOf('const poInViews');
const boxFns = html.slice(boxStart, boxEnd);

vm.createContext(sandbox);
vm.runInContext(inHouse + '\n' + block + '\n' + boxFns + `
  this.__export = {
    poIsNonPurchased, poIsMicroherbExempt, poIsFishExempt, poIsFishSupplier, poIsPerishable, poDeliveryAllowed,
    poIsHengSupplier, poMatchFor, poTokens, poScore, PO_FILL_MIN,
    PO_DELIVERY_PREF_DAYS, PO_DELIVERY_ALT_DAYS, PO_DELIVERY_EXEMPT_MAX, PO_DELIVERY_PERISH_MAX, PO_DELIVERY_HENG_MAX,
    clearCache(){ poMatchCache = null; }
  };
`, sandbox);

const {
  poIsNonPurchased, poIsMicroherbExempt, poIsFishExempt, poIsFishSupplier, poIsPerishable, poDeliveryAllowed,
  poIsHengSupplier, poMatchFor, poTokens, poScore, PO_FILL_MIN, PO_DELIVERY_PREF_DAYS,
  PO_DELIVERY_ALT_DAYS, PO_DELIVERY_EXEMPT_MAX, PO_DELIVERY_PERISH_MAX, PO_DELIVERY_HENG_MAX, clearCache
} = sandbox.__export;

function makePO(delivery, items) {
  return {
    req: 'RQ' + delivery.replace(/\//g, ''),
    delivery,
    poNumbers: ['PO1'],
    subject: 'test',
    file: 't.pdf',
    items: items.map((it, i) => ({
      n: i + 1, desc: it.desc, supplier: it.supplier || 'Select Fresh', qty: 1, unit: 'kg'
    }))
  };
}
function reset(pos) { sandbox.POS = pos; clearCache(); sandbox.poLinks = {}; vm.runInContext('poLinks = {}', sandbox); }
function fill(name) { return poMatchFor(name, { functionDate: '03/11/2026', forFill: true }); }

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('[PASS]', name, detail || ''); }
  else { fail++; console.log('[FAIL]', name, detail || ''); }
}

check('constants prefer 3', PO_DELIVERY_PREF_DAYS === 3);
check('constants alt 4', PO_DELIVERY_ALT_DAYS === 4);
check('constants exempt max 2', PO_DELIVERY_EXEMPT_MAX === 2);
check('constants heng max 1', PO_DELIVERY_HENG_MAX === 1);

check('tap water non-purchased', poIsNonPurchased('Tap Water'));
check('water non-purchased', poIsNonPurchased('Water'));
check('ice non-purchased', poIsNonPurchased('Ice'));
check('boiling water non-purchased', poIsNonPurchased('Boiling Water'));
check('SUB non-purchased', poIsNonPurchased('Green Oil (SUB)'));
check('spinach IS purchased', !poIsNonPurchased('Baby Spinach 1kg'));
check('microherb exempt', poIsMicroherbExempt('Micro Herbs Snow Pea Leaf Tendrils Sprout 100gm'));
check('salmon fish exempt', poIsFishExempt('Salmon Fillet 1kg'));
check('prawn IS fish-exempt (r12 seafood)', poIsFishExempt('Prawns Green 1kg'));
check('oyster IS fish-exempt (r12)', poIsFishExempt('Oyster Pambula'));
check('oysters plural fish-exempt', poIsFishExempt('Pambula Oysters open'));
check('Get Fish supplier detected', poIsFishSupplier('Get Fish Pty Ltd'));
check('seafood supplier detected', poIsFishSupplier('Sydney Seafood Co'));
check('Select Fresh NOT fish supplier', !poIsFishSupplier('Select Fresh'));
check('oyster day-0 allowed by name', poDeliveryAllowed(0, 'Oyster Pambula'));
check('Get Fish line day-0 allowed even for spinach wording', poDeliveryAllowed(0, 'Mystery Pack', {supplier:'Get Fish Pty Ltd'}));
check('Get Fish day-3 NOT (exempt max 2)', !poDeliveryAllowed(3, 'Oyster Pambula', {supplier:'Get Fish Pty Ltd'}));

check('heng detects HENG', poIsHengSupplier('HENG Produce'));
check('heng detects heng mid', poIsHengSupplier('Fresh HENG Co'));
check('heng rejects other', !poIsHengSupplier('Select Fresh'));

check('ordinary day 3 allowed', poDeliveryAllowed(3, 'Baby Spinach'));
check('ordinary day 4 allowed', poDeliveryAllowed(4, 'Baby Spinach'));
check('perishable spinach day 0 allowed (r12)', poDeliveryAllowed(0, 'Baby Spinach'));
check('perishable spinach day 1 allowed', poDeliveryAllowed(1, 'Baby Spinach'));
check('perishable spinach day 2 allowed', poDeliveryAllowed(2, 'Baby Spinach'));
check('perishable spinach day 4 allowed', poDeliveryAllowed(4, 'Baby Spinach'));
check('perishable spinach day 5 NOT', !poDeliveryAllowed(5, 'Baby Spinach'));
check('dry flour day 0 NOT (strict 3|4)', !poDeliveryAllowed(0, 'Plain Flour 1kg'));
check('dry flour day 3 allowed', poDeliveryAllowed(3, 'Plain Flour 1kg'));
check('spinach is perishable', poIsPerishable('Baby Spinach'));
check('flour NOT perishable', !poIsPerishable('Plain Flour 1kg'));

check('exempt day 0 allowed', poDeliveryAllowed(0, 'Micro Herbs Basil'));
check('exempt day 2 allowed', poDeliveryAllowed(2, 'Salmon Fillet'));
check('exempt day 3 NOT allowed', !poDeliveryAllowed(3, 'Micro Herbs Basil'));

check('heng day 0 allowed', poDeliveryAllowed(0, 'Baby Spinach', {supplier:'HENG'}));
check('heng day 1 allowed', poDeliveryAllowed(1, 'Baby Spinach', {supplier:'HENG Produce'}));
check('heng day 2 NOT allowed', !poDeliveryAllowed(2, 'Baby Spinach', {supplier:'HENG'}));
check('heng day 3 NOT allowed (overrides ordinary)', !poDeliveryAllowed(3, 'Baby Spinach', {supplier:'HENG'}));
check('heng day 0 on fish allowed', poDeliveryAllowed(0, 'Salmon Fillet', {supplier:'HENG'}));
check('heng day 2 on fish NOT (overrides exempt)', !poDeliveryAllowed(2, 'Salmon Fillet', {supplier:'HENG'}));

// BAT = 03/11/2026 → day-3 delivery = 31/10/2026, day-4 = 30/10/2026, day-0 = 03/11/2026, day-1 = 02/11/2026
reset([
  makePO('31/10/2026', [{desc:'Baby Spinach 1kg'}]),
  makePO('30/10/2026', [{desc:'Baby Spinach 1kg'}]),
  makePO('03/11/2026', [{desc:'Baby Spinach 1kg'}]),
]);
let m = fill('Baby Spinach 1kg');
check('ordinary prefers day-3 over day-4 and day-0', m && m.status==='ok' && m.item && m.item.po && m.item.po.delivery==='31/10/2026', m && m.item && m.item.po && m.item.po.delivery);

reset([makePO('30/10/2026', [{desc:'Baby Spinach 1kg'}])]);
m = fill('Baby Spinach 1kg');
check('ordinary accepts day-4 when no day-3', m && m.status==='ok' && m.item.po.delivery==='30/10/2026');

reset([makePO('03/11/2026', [{desc:'Baby Spinach 1kg'}])]);
m = fill('Baby Spinach 1kg');
check('perishable same-day fills (r12 0–4)', m && m.status==='ok' && m.item.po.delivery==='03/11/2026', m && m.status);

reset([makePO('03/11/2026', [{desc:'Plain Flour 1kg'}])]);
m = fill('Plain Flour 1kg');
check('dry flour same-day → nodelivery', !m || m.status==='nodelivery' || m.status==='none', m && m.status);

reset([makePO('01/11/2026', [{desc:'Micro Herbs Basil 50g'}])]); // day-2
m = fill('Micro Herbs Basil 50g');
check('microherb day-2 fills', m && m.status==='ok' && m.item.po.delivery==='01/11/2026', m && m.status);

reset([makePO('31/10/2026', [{desc:'Micro Herbs Basil 50g'}])]); // day-3 — outside exempt
m = fill('Micro Herbs Basil 50g');
check('microherb day-3 → nodelivery', !m || m.status==='nodelivery' || m.status==='none', m && m.status);

reset([
  makePO('03/11/2026', [{desc:'Baby Spinach 1kg', supplier:'HENG Produce'}]),
  makePO('02/11/2026', [{desc:'Baby Spinach 1kg', supplier:'HENG Produce'}]),
  makePO('01/11/2026', [{desc:'Baby Spinach 1kg', supplier:'HENG Produce'}]),
]);
m = fill('Baby Spinach 1kg');
check('HENG prefers day-0 over day-1; rejects day-2', m && m.status==='ok' && m.item.po.delivery==='03/11/2026', m && m.item && m.item.po && m.item.po.delivery);

reset([makePO('31/10/2026', [{desc:'Baby Spinach 1kg', supplier:'HENG'}])]);; // day-3
m = fill('Baby Spinach 1kg');
check('HENG day-3 rejected', !m || m.status==='nodelivery' || m.status==='none', m && m.status);

reset([makePO('31/10/2026', [{desc:'Tap Water'}])]);
m = fill('Tap Water');
check('tap water stays blank', !m || m.status==='none' || m.status==='skip' || m.status==='nonpurchased' || (m.status!=='ok'), m && m.status);

reset([makePO('31/10/2026', [{desc:'Ice Cubes'}])]);
m = fill('Ice');
check('ice stays blank', !m || m.status!=='ok', m && m.status);

reset([makePO('31/10/2026', [{desc:'Green Oil SUB'}])]);
m = fill('Green Oil (SUB)');
check('SUB stays blank', !m || m.status!=='ok', m && m.status);


// --- r12: universal keyword (plurals / short-long) ---
check('tokens oyster/oysters align', (()=>{ const a=poTokens('Oyster Pambula'), b=poTokens('Oysters Pambula open'); return a.includes('oyster') && b.includes('oyster') && poScore(a,b) >= PO_FILL_MIN; })());
check('tokens tomato/tomatoes', (()=>{ const a=poTokens('Tomato'), b=poTokens('Tomatoes vine ripened'); return a.includes('tomato') && b.includes('tomato') && poScore(a,b) >= PO_FILL_MIN; })());
check('FILL_MIN try-hard 0.45', PO_FILL_MIN === 0.45);
check('PERISH_MAX 4', PO_DELIVERY_PERISH_MAX === 4);

// --- r12: RQ00049541 Oyster Pambula / Get Fish (delivery 10/11/2026) ---
// Keyword match was already strong (score ~0.85); window was the failure under r11.
function fillOn(name, bat) { return poMatchFor(name, { functionDate: bat, forFill: true }); }

reset([makePO('10/11/2026', [{desc:'01151000 Oyster Pambula, open', supplier:'Get Fish Pty Ltd'}])]);
m = fillOn('Oyster Pambula', '10/11/2026'); // day-0
check('oyster fills day-0 vs BAT (r12)', m && m.status==='ok' && m.item && m.item.po.delivery==='10/11/2026', m && m.status);
check('oyster box has Get Fish', m && m.status==='ok' && /get\s*fish/i.test(m.boxText||m.item.supplier||''), m && (m.boxText||m.item && m.item.supplier));

reset([makePO('10/11/2026', [{desc:'01151000 Oyster Pambula, open', supplier:'Get Fish Pty Ltd'}])]);
m = fillOn('Oyster Pambula', '11/11/2026'); // day-1
check('oyster fills day-1 vs BAT', m && m.status==='ok', m && m.status);

reset([makePO('10/11/2026', [{desc:'01151000 Oyster Pambula, open', supplier:'Get Fish Pty Ltd'}])]);
m = fillOn('Oyster Pambula', '12/11/2026'); // day-2
check('oyster fills day-2 vs BAT', m && m.status==='ok', m && m.status);

reset([makePO('10/11/2026', [{desc:'01151000 Oyster Pambula, open', supplier:'Get Fish Pty Ltd'}])]);
m = fillOn('Oyster Pambula', '13/11/2026'); // day-3 — outside fish window
check('oyster day-3 → nodelivery', !m || m.status==='nodelivery' || m.status==='none', m && m.status);

// Same REQ also has HENG lines — day-0 ok for HENG, still 0–1 only
reset([makePO('10/11/2026', [
  {desc:'01151000 Sushi Nigiri : Inari (Tofu) VEGAN GF x 30', supplier:'Heng Australia Pty Ltd'},
  {desc:'01151000 Oyster Pambula, open', supplier:'Get Fish Pty Ltd'},
])]);
m = fillOn('Oyster Pambula', '10/11/2026');
check('mixed REQ: oyster still picks Get Fish', m && m.status==='ok' && /get\s*fish/i.test((m.item&&m.item.supplier)||''), m && m.item && m.item.supplier);
m = fillOn('Sushi Nigiri Inari', '10/11/2026');
check('mixed REQ: HENG nigiri fills day-0', m && m.status==='ok' && /heng/i.test((m.item&&m.item.supplier)||''), m && m.status);

// Token sanity: Pambula oysters wording variants
reset([makePO('10/11/2026', [{desc:'01151000 Oyster Pambula, open', supplier:'Get Fish Pty Ltd'}])]);
for (const name of ['Oyster Pambula', 'Oysters Pambula', 'Pambula Oyster', 'Pambula oysters open']) {
  m = fillOn(name, '10/11/2026');
  check('variant fills: '+name, m && m.status==='ok', m && m.status);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
