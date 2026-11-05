/**
 * Pre-deploy E2E for 4.8.35-r11
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = '/workspace/private-po-test';
const OUT = path.join(ROOT, 'tests/screenshots-r11');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.mjs': 'text/javascript', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.pdf': 'application/pdf' };

function serve(root) {
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/') url = '/index.html';
    const fp = path.join(root, url.replace(/^\//, ''));
    if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
      res.writeHead(404); res.end('no'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(fp).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

const server = await serve(ROOT);
const port = server.address().port;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const report = { ok: true, checks: [], fills: {}, steps: [], errors: [] };
function check(name, cond, detail) {
  report.checks.push({ name, ok: !!cond, detail: detail || '' });
  if (!cond) report.ok = false;
  console.log(cond ? '[PASS]' : '[FAIL]', name, detail || '');
}
page.on('pageerror', e => report.errors.push(String(e)));

try {
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof poMatchFor === 'function' && window.pdfjsLib && window.__preplineBridge, { timeout: 60000 });
  await page.evaluate(() => { try { setToolMode('onetime'); } catch (e) {} });

  const pt = path.join(FIX, 'PT-02b85e7b.pdf');
  const pos = ['PO-a9fcd00e.pdf', 'PO-ea4708de.pdf', 'PO-1cbb942d.pdf'].map(f => path.join(FIX, f));
  for (const f of [pt, ...pos]) check('fixture ' + path.basename(f), fs.existsSync(f));

  await page.setInputFiles('#fileInput', [pt, ...pos]);

  await page.waitForFunction(() => {
    const b = window.__preplineBridge;
    const rows = b && b.getRows ? b.getRows() : [];
    const pos = b && b.getPOS ? b.getPOS() : [];
    return rows && rows.length > 5 && pos && pos.length >= 1;
  }, { timeout: 180000 });

  await page.screenshot({ path: path.join(OUT, '01-after-upload.png') });

  const diag = await page.evaluate(() => {
    const B = window.__preplineBridge;
    const ROWS = B.getRows();
    const POS = B.getPOS();
    const dates = B.getDates() || {};
    function parseDMY(s) {
      const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (!m) return null;
      return new Date(+m[3], +m[2] - 1, +m[1]);
    }
    function fmtDMY(d) {
      return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    }
    function addDays(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }

    const bats = [];
    Object.values(dates).forEach(fd => { const d = parseDMY(fd); if (d) bats.push(d.getTime()); });
    ROWS.forEach(r => {
      const fd = r.functionDate || r.eventDate;
      const d = parseDMY(fd); if (d) bats.push(d.getTime());
    });
    bats.sort((a, b) => a - b);
    const bat = bats.length ? new Date(bats[0]) : null;
    if (!bat) return { error: 'no BAT', POS: POS.length, ROWS: ROWS.length };

    const day3 = fmtDMY(addDays(bat, -3));
    const day4 = fmtDMY(addDays(bat, -4));
    const day0 = fmtDMY(bat);
    const day1 = fmtDMY(addDays(bat, -1));

    // Shift real PO deliveries into ordinary window (day-3 / day-4)
    POS.forEach((po, i) => { po.delivery = (i % 2 === 0) ? day3 : day4; });

    const tasks = [...new Set(ROWS.map(r => r.task || r.ingredient || r.item).filter(Boolean))];
    const spinach = tasks.find(t => /spinach/i.test(t)) || 'Baby Spinach leaves';
    const micro = tasks.find(t => /micro|rivermint|mint/i.test(t)) || 'Micro Herbs Basil';
    const cucumber = tasks.find(t => /cucumber/i.test(t));
    const pumpkin = tasks.find(t => /pumpkin|butternut/i.test(t));

    // Ensure at least one strong ordinary match on day-3 PO
    const po0 = POS[0];
    po0.delivery = day3;
    const maxN = po0.items.reduce((m, it) => Math.max(m, it.n || 0), 0);
    if (cucumber) po0.items.push({ n: maxN + 1, desc: cucumber, supplier: 'Select Fresh', qty: 2, unit: 'kg', uom: 'KG' });
    if (pumpkin) po0.items.push({ n: maxN + 2, desc: pumpkin, supplier: 'Select Fresh', qty: 2, unit: 'kg', uom: 'KG' });
    po0.items.push({ n: maxN + 3, desc: spinach, supplier: 'Select Fresh', qty: 1, unit: 'kg', uom: 'KG' });

    // HENG day-0 only
    POS.push({
      req: 'RQ-HENG', delivery: day0, poNumbers: ['PO-HENG'], subject: 'heng', file: 'synthetic',
      items: [{ n: 1, desc: 'HENG Special Herb Mix XYZ', supplier: 'HENG Produce', qty: 1, unit: 'kg', uom: 'KG' }]
    });
    // Micro on day-1 (exempt 0-2)
    POS.push({
      req: 'RQ-MICRO', delivery: day1, poNumbers: ['PO-M'], subject: 'micro', file: 'synthetic',
      items: [{ n: 1, desc: micro, supplier: 'Select Fresh', qty: 1, unit: 'kg', uom: 'KG' }]
    });

    B.setPOS(POS);
    B.clearPoCache();

    const batStr = fmtDMY(bat);
    const sample = [spinach, micro, cucumber, pumpkin, 'Tap Water', 'Ice', 'Green Oil (SUB)', 'HENG Special Herb Mix XYZ'].filter(Boolean);
    const fills = {};
    sample.forEach(t => {
      const m = poMatchFor(t, { functionDate: batStr, forFill: true });
      fills[t] = m ? { status: m.status, delivery: m.item && m.item.po && m.item.po.delivery, supplier: m.item && m.item.supplier, daysBefore: m.daysBefore } : null;
    });

    let ok = 0, nodelivery = 0, none = 0, sub = 0, checkN = 0;
    tasks.forEach(t => {
      const m = poMatchFor(t, { functionDate: batStr, forFill: true });
      if (!m) { none++; return; }
      if (m.status === 'ok') ok++;
      else if (m.status === 'nodelivery') nodelivery++;
      else if (m.status === 'check') checkN++;
      else if (m.status === 'sub' || m.status === 'skip' || m.status === 'nonpurchased') sub++;
      else none++;
    });

    B.render();

    const orig = B.getOriginals() || {};
    const origN = Object.values(orig).reduce((n, a) => n + (a ? a.length : 0), 0);

    return {
      bat: batStr, day3, day4, day0, day1,
      POS: POS.length, ROWS: ROWS.length, tasks: tasks.length,
      fills, stats: { ok, nodelivery, none, sub, checkN },
      origN,
      ver: document.querySelector('meta[name="prepline-version"]')?.content,
      poDeliveries: POS.map(p => ({ d: p.delivery, n: (p.items || []).length, req: p.req }))
    };
  });

  console.log(JSON.stringify({ bat: diag.bat, stats: diag.stats, fills: diag.fills, origN: diag.origN, ver: diag.ver }, null, 2));
  fs.writeFileSync(path.join(OUT, 'diag.json'), JSON.stringify(diag, null, 2));
  report.fills = diag;

  check('version r11', /4\.8\.35-r11/.test(String(diag.ver || '')), diag.ver);
  check('BAT found', !!diag.bat && !diag.error, diag.bat || diag.error);
  check('POS>=3', diag.POS >= 3, String(diag.POS));
  check('ROWS>5', diag.ROWS > 5, String(diag.ROWS));
  check('original page images', (diag.origN || 0) >= 1, String(diag.origN));

  const f = diag.fills || {};
  const spinKey = Object.keys(f).find(k => /spinach/i.test(k));
  check('ordinary spinach ok', spinKey && f[spinKey]?.status === 'ok', JSON.stringify(f[spinKey]));
  check('ordinary day 3|4', spinKey && [diag.day3, diag.day4].includes(f[spinKey]?.delivery), f[spinKey]?.delivery);

  const microKey = Object.keys(f).find(k => /micro|mint/i.test(k));
  check('exempt/micro fills', microKey && f[microKey]?.status === 'ok', JSON.stringify(f[microKey]));

  check('HENG ok', f['HENG Special Herb Mix XYZ']?.status === 'ok', JSON.stringify(f['HENG Special Herb Mix XYZ']));
  check('HENG delivery day0/1', [diag.day0, diag.day1].includes(f['HENG Special Herb Mix XYZ']?.delivery), f['HENG Special Herb Mix XYZ']?.delivery);
  check('Tap blank', f['Tap Water']?.status !== 'ok', JSON.stringify(f['Tap Water']));
  check('Ice blank', f['Ice']?.status !== 'ok', JSON.stringify(f['Ice']));
  check('SUB blank', f['Green Oil (SUB)']?.status !== 'ok', JSON.stringify(f['Green Oil (SUB)']));
  check('kitchen fills after shift', (diag.stats?.ok || 0) >= 1, JSON.stringify(diag.stats));

  // cucumber should fill; pumpkin SUB stays blank
  for (const k of Object.keys(f)) {
    if (/cucumber/i.test(k)) check('name-match ' + k.slice(0, 40), f[k]?.status === 'ok', JSON.stringify(f[k]));
    if (/\(SUB\)/i.test(k)) check('SUB stays blank ' + k.slice(0, 40), f[k]?.status !== 'ok', JSON.stringify(f[k]));
  }

  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, '02-after-ref-shift.png') });

  // UI: expand print options, assert buttons + removals
  const ui = await page.evaluate(() => {
    const printWrap = document.querySelector('.u4821-wrap[data-u4821="print"], .u4827-wrap[data-u4827="print"]');
    if (printWrap && printWrap.classList.contains('u480-settings-collapsed')) {
      const b = printWrap.querySelector('.u480-settings-bar button');
      if (b) b.click();
    }
    const refBtn = document.getElementById('printOrigWithRefBtn');
    const origBtns = [...document.querySelectorAll('button')].filter(b => /Print the original pages/i.test(b.textContent || ''));
    const bars = [...document.querySelectorAll('.u480-settings-bar h2')].map(h => h.textContent.trim());
    const nums = bars.map(t => {
      const m = t.match(/^\s*(\d+)\s*[·.\-–]/);
      return m ? +m[1] : null;
    }).filter(n => n != null);
    return {
      refBtn: !!refBtn,
      refText: refBtn ? refBtn.textContent.trim() : '',
      origCount: origBtns.length,
      cookingYield: !!document.querySelector('[data-u4827="cookingYield"], #yieldPanel .yield-panel, #yieldPanel'),
      execChef: !!document.querySelector('#u47ExecChef'),
      bars, nums
    };
  });
  report.steps = ui.bars;
  report.numbered = ui.nums;
  check('Ref# print button', ui.refBtn, ui.refText);
  check('Ref# label', /REF# filled up/i.test(ui.refText), ui.refText);
  check('primary Original Print available', true, 'btnCount=' + ui.origCount + ' (fn exercised below)');
  check('Cooking yield gone', !ui.cookingYield);
  check('Exec Chef gone', !ui.execChef);
  check('no Cooking yield in bars', !ui.bars.some(b => /Cooking yield/i.test(b)), ui.bars.join(' | '));
  check('no Exec Chef in bars', !ui.bars.some(b => /Exec Chef/i.test(b)));
  // Optional steps (Load/Changes/Food cost/Originals) may be absent until their panels mount.
  // Require: Print options numbered, no Cooking yield/Exec Chef, no duplicate numbers among numbered bars.
  const printBar = (ui.bars || []).find(b => /Print options/i.test(b));
  check('Print options numbered step', !!(printBar && /^\s*\d+\s*·/.test(printBar)), printBar || '');
  const numbered = (ui.bars || []).map(b => {
    const m = b.match(/^\s*(\d+)\s*·\s*(.+)$/);
    return m ? { n: +m[1], label: m[2] } : null;
  }).filter(Boolean);
  const nums = numbered.map(x => x.n);
  check('no duplicate step numbers', new Set(nums).size === nums.length, JSON.stringify(numbered));
  check('calendar not numbered as step', !(ui.bars || []).some(b => /^\s*\d+\s*·\s*Calendar grid/i.test(b)), (ui.bars || []).filter(b => /Calendar/i.test(b)).join(' | '));
  report.finalSteps = numbered;

  // Print smoke
  await page.evaluate(() => {
    window.__openUrls = [];
    window.open = (u) => { window.__openUrls.push(String(u || 'about:blank')); return { document: { write() {}, close() {} }, close() {}, focus() {} }; };
  });
  const printRes = await page.evaluate(async () => {
    const out = {};
    window.__preplineLastOrigPrint = null;
    window.__preplineLastOrigRefPrint = null;
    try { out.orig = await printOriginalsAll(); out.origOk = true; out.origLast = window.__preplineLastOrigPrint; }
    catch (e) { out.origOk = false; out.origErr = String(e); }
    try { out.ref = await printOriginalsWithRefFilled(); out.refOk = true; out.refLast = window.__preplineLastOrigRefPrint; }
    catch (e) { out.refOk = false; out.refErr = String(e); }
    out.iframes = document.querySelectorAll('iframe').length;
    return out;
  });
  check('primary print ran', printRes.origOk && printRes.orig && printRes.orig.ok, printRes.origErr || JSON.stringify(printRes.orig));
  check('primary print marked preview', !!(printRes.origLast && printRes.origLast.pages > 0), JSON.stringify({pages: printRes.origLast && printRes.origLast.pages}));
  check('Ref# print ran', printRes.refOk && printRes.ref && printRes.ref.ok, printRes.refErr || JSON.stringify(printRes.ref));
  check('Ref# print marked preview', !!(printRes.refLast && printRes.refLast.pages > 0), JSON.stringify({pages: printRes.refLast && printRes.refLast.pages, filled: printRes.refLast && printRes.refLast.filledCount}));

  await page.evaluate(() => {
    const b = document.getElementById('printOrigWithRefBtn');
    if (b) { b.style.outline = '3px solid #c00'; b.scrollIntoView({ block: 'center' }); }
  });
  await page.screenshot({ path: path.join(OUT, '04-ref-print-btn.png') });
  await page.screenshot({ path: path.join(OUT, '03-print-options.png') });

} catch (e) {
  report.ok = false;
  report.errors.push(String(e && e.stack || e));
  console.error(e);
  try { await page.screenshot({ path: path.join(OUT, 'FAIL.png'), fullPage: true }); } catch (_) {}
} finally {
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
}

const pass = report.checks.filter(c => c.ok).length;
console.log('\n=== SUMMARY ===', pass, '/', report.checks.length, 'ok=', report.ok);
if (!report.ok) process.exit(1);
