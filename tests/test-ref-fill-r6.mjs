/**
 * Unit: Ref # autofill rules for 4.8.35-r11
 * Ordinary: STRICT day 3 or 4 before BAT (prefer 3).
 * Microherbs/fish: 0..2 inclusive.
 * HENG supplier: 0..1 inclusive only (overrides ordinary/exempt).
 * Tap/ice/SUB: blank (non-purchased).
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
    poIsNonPurchased, poIsMicroherbExempt, poIsFishExempt, poDeliveryAllowed,
    poIsHengSupplier, poMatchFor, poTokens, poScore, PO_FILL_MIN,
    PO_DELIVERY_PREF_DAYS, PO_DELIVERY_ALT_DAYS, PO_DELIVERY_EXEMPT_MAX, PO_DELIVERY_HENG_MAX,
    clearCache(){ poMatchCache = null; }
  };
`, sandbox);

const {
  poIsNonPurchased, poIsMicroherbExempt, poIsFishExempt, poDeliveryAllowed,
  poIsHengSupplier, poMatchFor, PO_FILL_MIN, PO_DELIVERY_PREF_DAYS,
  PO_DELIVERY_ALT_DAYS, PO_DELIVERY_EXEMPT_MAX, PO_DELIVERY_HENG_MAX, clearCache
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
check('prawn NOT fish-exempt', !poIsFishExempt('Prawns Green 1kg'));

check('heng detects HENG', poIsHengSupplier('HENG Produce'));
check('heng detects heng mid', poIsHengSupplier('Fresh HENG Co'));
check('heng rejects other', !poIsHengSupplier('Select Fresh'));

check('ordinary day 3 allowed', poDeliveryAllowed(3, 'Baby Spinach'));
check('ordinary day 4 allowed', poDeliveryAllowed(4, 'Baby Spinach'));
check('ordinary day 0 NOT allowed (r11)', !poDeliveryAllowed(0, 'Baby Spinach'));
check('ordinary day 1 NOT allowed', !poDeliveryAllowed(1, 'Baby Spinach'));
check('ordinary day 2 NOT allowed', !poDeliveryAllowed(2, 'Baby Spinach'));
check('ordinary day 5 NOT allowed', !poDeliveryAllowed(5, 'Baby Spinach'));

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
check('ordinary same-day → no delivery (r11)', !m || m.status==='nodelivery' || m.status==='none', m && m.status);

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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
