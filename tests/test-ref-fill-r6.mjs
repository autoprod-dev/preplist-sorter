/**
 * Unit: Ref # autofill rules for 4.8.35-r6
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
// poIsInHouse is BEFORE PO_STOP — include it
const inHouse = html.slice(html.indexOf('function poIsInHouse(task){'), a);
const boxStart = html.indexOf('function poSupplierShort(n){');
const boxEnd = html.indexOf('const poInViews');
const boxFns = html.slice(boxStart, boxEnd);

vm.createContext(sandbox);
vm.runInContext(inHouse + '\n' + block + '\n' + boxFns + `
  this.__export = {
    poIsNonPurchased, poIsMicroherbExempt, poIsFishExempt, poDeliveryAllowed,
    poMatchFor, PO_FILL_MIN, PO_DELIVERY_PREF_DAYS,
    clearCache(){ poMatchCache = null; }
  };
`, sandbox);

const {
  poIsNonPurchased, poIsMicroherbExempt, poIsFishExempt, poDeliveryAllowed,
  poMatchFor, PO_FILL_MIN, PO_DELIVERY_PREF_DAYS, clearCache
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

check('tap water non-purchased', poIsNonPurchased('Tap Water'));
check('water non-purchased', poIsNonPurchased('Water'));
check('ice non-purchased', poIsNonPurchased('Ice'));
check('boiling water non-purchased', poIsNonPurchased('Boiling Water'));
check('SUB non-purchased', poIsNonPurchased('Green Oil (SUB)'));
check('spinach IS purchased', !poIsNonPurchased('Baby Spinach 1kg'));
check('microherb exempt', poIsMicroherbExempt('Micro Herbs Snow Pea Leaf Tendrils Sprout 100gm'));
check('salmon fish exempt', poIsFishExempt('Salmon Fillet 1kg'));
check('prawn NOT fish-exempt', !poIsFishExempt('Prawns Green 1kg'));
check('ordinary day 3 allowed', poDeliveryAllowed(3, 'Baby Spinach'));
check('ordinary day 4 allowed', poDeliveryAllowed(4, 'Baby Spinach'));
check('ordinary day 0 blocked', !poDeliveryAllowed(0, 'Baby Spinach'));
check('ordinary day 1 blocked', !poDeliveryAllowed(1, 'Baby Spinach'));
check('ordinary day 2 blocked', !poDeliveryAllowed(2, 'Baby Spinach'));
check('micro day 0 allowed', poDeliveryAllowed(0, 'Micro Herbs Mix'));
check('micro day 2 allowed', poDeliveryAllowed(2, 'Micro Herbs Mix'));
check('fish day 1 allowed', poDeliveryAllowed(1, 'Barramundi Fillet'));
check('after BAT blocked', !poDeliveryAllowed(-1, 'Baby Spinach'));

reset([
  makePO('03/11/2026', [
    { desc: 'Baby Spinach Leaves 1kg', supplier: 'Pro Bros' },
    { desc: 'Tap Water', supplier: 'Select Fresh' },
    { desc: 'Micro Herbs Snow Pea', supplier: 'Select Fresh' },
    { desc: 'Lemon Preserved 2kg', supplier: 'Two' },
  ]),
  makePO('31/10/2026', [
    { desc: 'Baby Spinach Leaves 1kg', supplier: 'Select Fresh' },
    { desc: 'Lemon Preserved 2kg Sandhurst', supplier: 'Two' },
  ]),
  makePO('30/10/2026', [
    { desc: 'Baby Spinach Leaves 1kg', supplier: 'Other Co' },
  ]),
]);

const spinach = fill('Baby Spinach Leaves 1kg');
check('spinach prefers day-3 not same-day',
  spinach && spinach.status === 'ok' && spinach.daysBefore === 3,
  JSON.stringify({ status: spinach && spinach.status, days: spinach && spinach.daysBefore, box: spinach && spinach.boxText }));

const tap = fill('Tap Water');
check('tap water stays blank (sub)', tap && tap.status === 'sub', JSON.stringify(tap));

const lemon = fill('Lemon Preserved 2kg Sandhurst');
check('lemon uses day-3 not same-day',
  lemon && lemon.status === 'ok' && lemon.daysBefore === 3,
  JSON.stringify({ status: lemon && lemon.status, days: lemon && lemon.daysBefore, box: lemon && lemon.boxText }));

const micro = fill('Micro Herbs Snow Pea Leaf Tendrils Sprout 100gm');
check('microherb may use same-day (exempt)',
  micro && micro.status === 'ok' && micro.daysBefore === 0,
  JSON.stringify({ status: micro && micro.status, days: micro && micro.daysBefore, box: micro && micro.boxText }));

check('SUB stays blank', fill('Pumpkin Puree (SUB)')?.status === 'sub');

reset([makePO('03/11/2026', [{ desc: 'Baby Spinach Leaves 1kg', supplier: 'Pro Bros' }])]);
const spinachBad = fill('Baby Spinach Leaves 1kg');
check('spinach same-day only → nodelivery',
  spinachBad && spinachBad.status === 'nodelivery',
  JSON.stringify({ status: spinachBad && spinachBad.status, reason: spinachBad && spinachBad.reason }));

reset([
  makePO('31/10/2026', [{ desc: 'Herb Sage Fresh Bunch', supplier: 'A' }]),
  makePO('30/10/2026', [{ desc: 'Herb Sage Fresh Bunch', supplier: 'B' }]),
]);
const sage = fill('Herb Sage Fresh Bunch 20g');
check('prefer day-3 over day-4',
  sage && sage.status === 'ok' && sage.daysBefore === 3 && /A/.test(sage.boxText || ''),
  JSON.stringify({ days: sage && sage.daysBefore, box: sage && sage.boxText }));

reset([makePO('30/10/2026', [{ desc: 'Parmesan Shaved PFD 1kg', supplier: 'PFD' }])]);
const parm = fill('Parmesan Shaved PFD - 1kg');
check('day-4 alone fills',
  parm && parm.status === 'ok' && parm.daysBefore === 4,
  JSON.stringify({ days: parm && parm.daysBefore, box: parm && parm.boxText }));

check('PO_FILL_MIN strong', PO_FILL_MIN >= 0.7, String(PO_FILL_MIN));
check('prefer const is 3', PO_DELIVERY_PREF_DAYS === 3);

console.log('\nRESULT', { pass, fail, PO_FILL_MIN });
if (fail) process.exit(1);
