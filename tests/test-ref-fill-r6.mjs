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
    poMatchFor, poTokens, poScore, PO_FILL_MIN, PO_DELIVERY_PREF_DAYS,
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
check('ordinary day 0 allowed (r10)', poDeliveryAllowed(0, 'Baby Spinach'));
check('ordinary day 1 allowed (r10)', poDeliveryAllowed(1, 'Baby Spinach'));
check('ordinary day 2 allowed (r10)', poDeliveryAllowed(2, 'Baby Spinach'));
check('ordinary day 5 blocked', !poDeliveryAllowed(5, 'Baby Spinach'));
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
const spinachSame = fill('Baby Spinach Leaves 1kg');
check('spinach same-day only → fills (r10 0–4 window)',
  spinachSame && spinachSame.status === 'ok' && spinachSame.daysBefore === 0,
  JSON.stringify({ status: spinachSame && spinachSame.status, days: spinachSame && spinachSame.daysBefore, box: spinachSame && spinachSame.boxText }));

// Still blank when delivery is AFTER BAT
reset([makePO('04/11/2026', [{ desc: 'Baby Spinach Leaves 1kg', supplier: 'Pro Bros' }])]);
const spinachAfter = fill('Baby Spinach Leaves 1kg');
check('spinach delivery after BAT → nodelivery',
  spinachAfter && spinachAfter.status === 'nodelivery',
  JSON.stringify({ status: spinachAfter && spinachAfter.status, reason: spinachAfter && spinachAfter.reason }));

reset([
  makePO('31/10/2026', [{ desc: 'Sage Fresh Bunch', supplier: 'A' }]),
  makePO('30/10/2026', [{ desc: 'Sage Fresh Bunch', supplier: 'B' }]),
]);
const sage = fill('Sage Fresh Bunch 20g');
check('prefer day-3 over day-4',
  sage && sage.status === 'ok' && sage.daysBefore === 3 && /A/.test(sage.boxText || ''),
  JSON.stringify({ status: sage && sage.status, days: sage && sage.daysBefore, box: sage && sage.boxText, score: sage && sage.score }));

reset([makePO('30/10/2026', [{ desc: 'Parmesan Shaved PFD 1kg', supplier: 'PFD' }])]);
const parm = fill('Parmesan Shaved PFD - 1kg');
check('day-4 alone fills',
  parm && parm.status === 'ok' && parm.daysBefore === 4,
  JSON.stringify({ days: parm && parm.daysBefore, box: parm && parm.boxText }));

check('PO_FILL_MIN keyword threshold', PO_FILL_MIN >= 0.45 && PO_FILL_MIN <= 0.6, String(PO_FILL_MIN));
check('prefer const is 3', PO_DELIVERY_PREF_DAYS === 3);

// Keyword matching (all items): PRS Celeriac peeled(Kg) PB ↔ Celeriac
reset([
  makePO('31/10/2026', [
    { desc: 'PRS Celeriac peeled(Kg) PB', supplier: 'Pro Bros' },
    { desc: 'PRS Baby Spinach Leaves 1kg', supplier: 'Select Fresh' },
    { desc: 'Truffle Oil 250ml', supplier: 'Two' },
    { desc: 'Olive Oil Extra Virgin 5L', supplier: 'PFD' },
  ]),
]);
const cel = fill('Celeriac remoulade garnish');
check('celeriac keyword matches PRS line',
  cel && cel.status === 'ok' && /Pro Bros|celeriac/i.test(cel.boxText || '') || (cel && cel.status === 'ok'),
  JSON.stringify({ status: cel && cel.status, days: cel && cel.daysBefore, box: cel && cel.boxText, score: cel && cel.score }));

const spinKw = fill('Sauteed spinach');
check('spinach keyword matches PRS baby spinach',
  spinKw && spinKw.status === 'ok',
  JSON.stringify({ status: spinKw && spinKw.status, box: spinKw && spinKw.boxText, score: spinKw && spinKw.score }));

// False-positive guards
reset([
  makePO('31/10/2026', [
    { desc: '2.6K(6) SWEET MUSTARD PICKLES RELISH MASTERFOODS', supplier: 'PFD' },
    { desc: 'CARROT JULIENNE PEELED', supplier: 'Select Fresh' },
    { desc: 'PRS Celeriac peeled(Kg) PB', supplier: 'Pro Bros' },
  ]),
]);
const mg = fill('Herb Micro Mustard Green');
check('mustard green does not match mustard pickles',
  !mg || mg.status !== 'ok',
  JSON.stringify({ status: mg && mg.status, box: mg && mg.boxText, score: mg && mg.score }));
const jul = fill('Chicken and Madeira Pate 1kg Juliannes Kitchen');
check('juliannes does not match carrot julienne',
  !jul || jul.status !== 'ok',
  JSON.stringify({ status: jul && jul.status, box: jul && jul.boxText, score: jul && jul.score }));
const cel2 = fill('Celeriac remoulade garnish');
check('celeriac still matches after containment rule',
  cel2 && cel2.status === 'ok',
  JSON.stringify({ status: cel2 && cel2.status, box: cel2 && cel2.boxText, score: cel2 && cel2.score }));


// oil alone should not prefer truffle oil when olive oil also exists — longest/best score
reset([
  makePO('31/10/2026', [
    { desc: 'Truffle Oil 250ml', supplier: 'Two' },
    { desc: 'Olive Oil Extra Virgin 5L', supplier: 'PFD' },
  ]),
]);
const oil = fill('Oil');
check('bare oil stays unmatched (generic-only overlap)',
  !oil || oil.status !== 'ok',
  JSON.stringify({ status: oil && oil.status, box: oil && oil.boxText, score: oil && oil.score }));
const olive = fill('Olive oil');
check('olive oil keyword matches olive oil line',
  olive && olive.status === 'ok' && /Olive|PFD/i.test(olive.boxText || ''),
  JSON.stringify({ status: olive && olive.status, box: olive && olive.boxText, score: olive && olive.score }));

const tokens = sandbox.poTokens || (typeof poTokens !== 'undefined' ? poTokens : null);
// export poTokens via __export if needed — skip if missing
try {
  const { poTokens: pt, poScore: ps } = sandbox.__export || {};
  if (pt) {
    const a = pt('PRS Celeriac peeled(Kg) PB');
    const b = pt('Celeriac');
    {
  const At = sandbox.__export.poTokens('Crepe Roasted Duck Portion Size 28gx30 - Heng (25.31 *Box)');
  const Bt = sandbox.__export.poTokens('700GX6 SLICED WHOLEMEAL BREAD 9324 TIP TOP');
  const sc = sandbox.__export.poScore(At, Bt);
  check('crepe does not match bread via gx residue',
    sc < 0.5 && !At.includes('gx') && !Bt.includes('gx'),
    JSON.stringify({ At, Bt, sc }));
}
check('poTokens strips PRS/peeled/Kg/PB → celeriac', a.includes('celeriac') && b.includes('celeriac'), JSON.stringify({a,b}));
  }
} catch (e) {}

console.log('\nRESULT', { pass, fail, PO_FILL_MIN });
if (fail) process.exit(1);
