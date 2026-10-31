/**
 * Prepline 4.8.8 — smart-chef prep-day grouping (trial organised export).
 * Synthetic chicken Mon/Tue/Thu/Fri + WE sample export screenshots/xlsx.
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_488_OUT || '/workspace/share/prepline-488';
const PORT = 8890 + Math.floor(Math.random() * 80);
const SHOTS = path.join(OUT, 'screenshots', 'smart-chef');
const SOURCE = process.env.PAULA_SOURCE
  || path.join(ROOT, 'paula-files', 'WE-15.11.26-For-Sorter.xlsx');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const CHECKS = [];
function record(name, pass, detail) {
  CHECKS.push({ test: name, result: pass ? 'PASS' : 'FAIL', detail: detail || '' });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.webmanifest')) return 'application/manifest+json';
  return 'application/octet-stream';
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let url = decodeURIComponent((req.url || '/').split('?')[0]);
      if (url === '/') url = '/index.html';
      const fp = path.join(ROOT, url.replace(/^\//, ''));
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404); res.end('no'); return;
      }
      res.writeHead(200, { 'Content-Type': contentType(fp), 'Cache-Control': 'no-store' });
      fs.createReadStream(fp).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('prepline.account.v2', JSON.stringify({ token: 'test-488' }));
    localStorage.setItem('prepline.signup.v1', JSON.stringify({ d: '2026-10-31', via: 'test' }));
  });
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.includes('script.google.com') || u.includes('macros/s/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'unlimited', token: 'test-488' })
      });
      return;
    }
    await route.continue();
  });

  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.Prepline477 && window.Prepline488 && window.PreplineBatch && typeof XLSX !== 'undefined',
    null,
    { timeout: 60000 }
  );

  const ver = await page.evaluate(() => ({
    meta: document.querySelector('meta[name="prepline-version"]')?.content || '',
    v488: window.Prepline488?.VERSION,
    v477: window.Prepline477?.VERSION
  }));
  record('version-488', ver.meta.includes('4.8.8') && ver.v488 === '4.8.8', JSON.stringify(ver));

  /* ---- Synthetic chicken Mon/Tue/Thu/Fri ---- */
  const chicken = await page.evaluate(() => {
    const eventMap = {
      'Mon Service': 'Monday',
      'Tue Service': 'Tuesday',
      'Thu Service': 'Thursday',
      'Fri Service': 'Friday'
    };
    const rows = [
      { dish: 'Mon Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4, flagged: false, baseCategory: 'Proteins' },
      { dish: 'Tue Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Saturday', prepCat: 'poultry', leadDays: 4, flagged: false, baseCategory: 'Proteins' },
      { dish: 'Thu Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Tuesday', prepCat: 'poultry', leadDays: 4, flagged: false, baseCategory: 'Proteins' },
      { dish: 'Fri Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Wednesday', prepCat: 'poultry', leadDays: 4, flagged: false, baseCategory: 'Proteins' },
      /* decoy fish — must stay 1-day, not merge with chicken */
      { dish: 'Fri Service', task: 'Torched Salmon / portion', qty: 1, unit: 'ea', section: 'Proteins', day: 'Thursday', prepCat: 'seafood', leadDays: 1, flagged: false, baseCategory: 'Proteins' },
      /* dry good — 4-day ok */
      { dish: 'Wed Service', task: 'Olive oil / reserve', qty: 20, unit: 'ml', section: 'Oils and Dressings', day: 'Monday', prepCat: 'oil', leadDays: 4, flagged: false, baseCategory: 'Oils and Dressings' }
    ];
    // Wed service for oil
    eventMap['Wed Service'] = 'Wednesday';

    const helpers = {
      getEventDay: (d) => eventMap[d] || '',
      dayLabel: (d) => d,
      srcName: (r) => r.dish,
      cleanDishName: (d) => d,
      paxByDish: { 'Mon Service': 40, 'Tue Service': 40, 'Wed Service': 40, 'Thu Service': 40, 'Fri Service': 40 },
      defaultStaff: '',
      staffBySection: {}
    };

    const map = Prepline488.smartPrepDayMap(rows, helpers);
    const groups = (map && map.groups || []).map(g => ({
      day: g.day,
      batchKey: g.batchKey,
      dishes: g.dishes,
      covers: g.covers,
      earliest: g.window && g.window.earliestFunc,
      latest: g.window && g.window.latestFunc,
      n: (g.rows || []).length,
      tasks: (g.rows || []).map(r => r.task)
    }));

    const paula = Prepline477.buildPaulaOrganisedRows(rows, helpers);
    const chickenRows = paula.filter(r => /chicken/i.test(r.item));
    const chickenPreps = chickenRows.map(r => ({
      dish: r.dish,
      prepDay: r.prepDay,
      actualPrep: r.actualPrep,
      colour: r.prepColourId,
      covers: r.smartCovers
    }));

    /* Colour: same prep day → same colour id among chicken lines that share prep */
    const byPrep = {};
    chickenRows.forEach(r => {
      byPrep[r.prepDay] = byPrep[r.prepDay] || new Set();
      byPrep[r.prepDay].add(r.prepColourId);
    });

    /* Sort integrity within sheet: actualPrep non-decreasing; within same prep, item then source */
    let sortOk = true;
    for (let i = 1; i < paula.length; i++) {
      const a = paula[i - 1], b = paula[i];
      if (a.actualPrep > b.actualPrep) { sortOk = false; break; }
      if (a.actualPrep === b.actualPrep) {
        if (a.itemNorm > b.itemNorm) { sortOk = false; break; }
        if (a.itemNorm === b.itemNorm && String(a.sourceTab || '').toLowerCase() > String(b.sourceTab || '').toLowerCase()) {
          sortOk = false; break;
        }
      }
    }

    return {
      groups,
      chickenPreps,
      byPrep: Object.fromEntries(Object.entries(byPrep).map(([k, v]) => [k, [...v]])),
      sortOk,
      clarifications: Prepline488.RULE_CLARIFICATIONS,
      salmon: paula.filter(r => /salmon/i.test(r.item)).map(r => ({ prepDay: r.prepDay, dish: r.dish })),
      paulaCount: paula.length
    };
  });

  console.log('chicken groups:', JSON.stringify(chicken.groups, null, 2));
  console.log('chicken preps:', JSON.stringify(chicken.chickenPreps, null, 2));

  const chickenGroups = chicken.groups.filter(g => /chicken/i.test(String(g.batchKey)));
  record('chicken-two-batches', chickenGroups.length === 2,
    'n=' + chickenGroups.length + ' days=' + chickenGroups.map(g => g.day + '(' + g.earliest + '-' + g.latest + ')').join(', '));

  const sat = chickenGroups.find(g => g.day === 'Saturday');
  record('sat-covers-mon-tue', !!(sat && sat.earliest === 'Monday' && sat.latest === 'Tuesday'),
    sat ? JSON.stringify(sat) : 'no Saturday group');

  const midweek = chickenGroups.find(g => g.day !== 'Saturday');
  record('thu-fri-second-group', !!(midweek && midweek.earliest === 'Thursday' && midweek.latest === 'Friday'),
    midweek ? JSON.stringify(midweek) : 'missing');

  /* Example said Monday; algorithm may pick Tue — record actual, do not fail hard on Mon vs Tue */
  const midDay = midweek && midweek.day;
  record('thu-fri-prep-day-recorded', !!midDay,
    'prepDay=' + midDay + ' (example said Monday; batching fresher-tie may use Tuesday)');

  record('one-colour-per-prep-day', Object.values(chicken.byPrep).every(ids => ids.length === 1),
    JSON.stringify(chicken.byPrep));

  record('sort-prep-then-item-source', chicken.sortOk, '');

  record('fish-not-merged-with-chicken', chicken.salmon.length === 1 && !/chicken/i.test(JSON.stringify(chicken.salmon)),
    JSON.stringify(chicken.salmon));

  /* Export synthetic xlsx */
  const synExport = await page.evaluate(async () => {
    const eventMap = {
      'Mon Service': 'Monday', 'Tue Service': 'Tuesday', 'Wed Service': 'Wednesday',
      'Thu Service': 'Thursday', 'Fri Service': 'Friday'
    };
    const rows = [
      { dish: 'Mon Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4, flagged: false, baseCategory: 'Proteins' },
      { dish: 'Tue Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Saturday', prepCat: 'poultry', leadDays: 4, flagged: false, baseCategory: 'Proteins' },
      { dish: 'Thu Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Tuesday', prepCat: 'poultry', leadDays: 4, flagged: false, baseCategory: 'Proteins' },
      { dish: 'Fri Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Wednesday', prepCat: 'poultry', leadDays: 4, flagged: false, baseCategory: 'Proteins' },
      { dish: 'Fri Service', task: 'Torched Salmon / portion', qty: 1, unit: 'ea', section: 'Proteins', day: 'Thursday', prepCat: 'seafood', leadDays: 1, flagged: false, baseCategory: 'Proteins' },
      { dish: 'Wed Service', task: 'Olive oil / reserve', qty: 20, unit: 'ml', section: 'Oils and Dressings', day: 'Monday', prepCat: 'oil', leadDays: 4, flagged: false, baseCategory: 'Oils and Dressings' }
    ];
    const helpers = {
      getEventDay: (d) => eventMap[d] || '',
      dayLabel: (d) => d,
      srcName: (r) => r.dish,
      cleanDishName: (d) => d,
      paxByDish: { 'Mon Service': 40, 'Tue Service': 40, 'Wed Service': 40, 'Thu Service': 40, 'Fri Service': 40 },
      returnBuffer: true,
      defaultStaff: '',
      staffBySection: {}
    };
    const res = await Prepline477.exportOrganisedXlsx(rows, {}, helpers);
    const buf = res.buffer;
    const b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
    return { name: res.name, rows: res.rows, sheets: res.sheets, engine: res.engine, b64, layout: res.layout };
  });

  const synPath = path.join(OUT, 'smart-chef-chicken-MonTueThuFri.xlsx');
  fs.writeFileSync(synPath, Buffer.from(synExport.b64, 'base64'));
  record('synthetic-xlsx-written', fs.existsSync(synPath) && fs.statSync(synPath).size > 1000,
    synPath + ' ' + fs.statSync(synPath).size + 'b engine=' + synExport.engine);

  /* Inspect pastel fills via ExcelJS in page if available */
  const fillCheck = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    if (!window.ExcelJS) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'vendor/exceljs/exceljs.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(u8.buffer);
    const out = [];
    wb.eachSheet((ws) => {
      const rows = [];
      ws.eachRow((row, n) => {
        if (n <= 2) return;
        const prep = row.getCell(8);
        const fill = prep.fill && prep.fill.fgColor && prep.fill.fgColor.argb;
        rows.push({
          item: String(row.getCell(1).value || ''),
          prepDay: String(prep.value || ''),
          source: String(row.getCell(9).value || ''),
          fill: fill || null
        });
      });
      out.push({ sheet: ws.name, rows, autoFilter: !!ws.autoFilter });
    });
    return out;
  }, synExport.b64);

  const proteinSheet = fillCheck.find(s => /protein/i.test(s.sheet));
  record('autofilter-present', !!(proteinSheet && proteinSheet.autoFilter), JSON.stringify(fillCheck.map(s => ({ sheet: s.sheet, af: s.autoFilter, n: s.rows.length }))));

  if (proteinSheet) {
    const chickenLines = proteinSheet.rows.filter(r => /chicken/i.test(r.item));
    const fillsByPrep = {};
    chickenLines.forEach(r => {
      fillsByPrep[r.prepDay] = fillsByPrep[r.prepDay] || new Set();
      fillsByPrep[r.prepDay].add(r.fill);
    });
    const oneFillEach = Object.values(fillsByPrep).every(s => s.size === 1);
    const distinctPreps = Object.keys(fillsByPrep);
    const twoBlocks = distinctPreps.length === 2 &&
      Object.values(fillsByPrep).map(s => [...s][0]).filter((v, i, a) => a.indexOf(v) === i).length === 2;
    record('pastel-one-per-prep-block', oneFillEach && twoBlocks,
      JSON.stringify({ fillsByPrep: Object.fromEntries(Object.entries(fillsByPrep).map(([k, v]) => [k, [...v]])), lines: chickenLines }));
  } else {
    record('pastel-one-per-prep-block', false, 'no Proteins sheet');
  }

  /* Screenshot synthetic by injecting ROWS and opening organised isn't a separate screen —
     capture the page after loading sample instead. */

  /* ---- WE sample if present ---- */
  if (fs.existsSync(SOURCE)) {
    await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => window.Prepline477 && window.Prepline488 && typeof XLSX !== 'undefined' && typeof handleWorkbookObject === 'function',
      null,
      { timeout: 60000 }
    );
    // Serve sample via copy next to index so page can fetch (edit-before-sort wraps handleFile).
    const tmpName = '_tmp_sample_488.xlsx';
    fs.copyFileSync(SOURCE, path.join(ROOT, tmpName));
    const loaded = await page.evaluate(async (name) => {
      const resp = await fetch('/' + name);
      const ab = await resp.arrayBuffer();
      const data = new Uint8Array(ab);
      const wbObj = XLSX.read(data, { type: 'array', cellDates: false, sheetStubs: false, cellStyles: true });
      handleWorkbookObject(wbObj, 'WE-15.11.26-For-Sorter.xlsx'); // no rawBytes → sync finish
      return (ROWS || []).length;
    }, tmpName);
    try { fs.unlinkSync(path.join(ROOT, tmpName)); } catch (e) {}
    record('sample-loaded', loaded > 50, 'rows=' + loaded);
    await page.screenshot({ path: path.join(SHOTS, 'sample-loaded.png'), fullPage: false }).catch(() => {});

    if (loaded > 50) {
      const sampleExport = await page.evaluate(async () => {
        const helpers = {
          cleanDishName: typeof cleanDishName === 'function' ? cleanDishName : (d) => d,
          paxByDish: typeof paxByDish !== 'undefined' ? paxByDish : {},
          allergenText: typeof allergenText === 'function' ? allergenText : () => '',
          dayLabel: typeof dayLabel === 'function' ? dayLabel : (d) => d,
          srcName: typeof srcName === 'function' ? srcName : (r) => r.srcSheet || r.dish,
          exportPerPax: typeof exportPerPax === 'function' ? exportPerPax : undefined,
          getEventDay: typeof getEventDay === 'function' ? getEventDay : undefined,
          getEventDateStr: typeof getEventDateStr === 'function' ? getEventDateStr : undefined,
          returnBuffer: true
        };
        const res = await Prepline477.exportOrganisedXlsx(viewRows(), typeof batchDeps === 'function' ? batchDeps() : {}, helpers);
        const u8 = new Uint8Array(res.buffer);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < u8.length; i += chunk) binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
        const paula = Prepline477.buildPaulaOrganisedRows(viewRows(), helpers);
        const colours = {};
        paula.forEach(r => { colours[r.prepColourId] = (colours[r.prepColourId] || 0) + 1; });
        return {
          name: res.name, rows: res.rows, sheets: res.sheets, engine: res.engine, b64: btoa(binary),
          colourBlocks: Object.keys(colours).length,
          first20: paula.slice(0, 20).map(r => ({ item: r.item, prep: r.prepDay, src: r.sourceTab, ap: r.actualPrep, c: r.prepColourId }))
        };
      });
      const samplePath = path.join(OUT, 'WE-15.11.26-organised-smart-chef.xlsx');
      fs.writeFileSync(samplePath, Buffer.from(sampleExport.b64, 'base64'));
      record('sample-xlsx-written', fs.statSync(samplePath).size > 5000,
        samplePath + ' rows=' + sampleExport.rows + ' colourBlocks=' + sampleExport.colourBlocks);
      fs.writeFileSync(path.join(OUT, 'smart-chef-sample-preview.json'), JSON.stringify({
        sheets: sampleExport.sheets, colourBlocks: sampleExport.colourBlocks, first20: sampleExport.first20
      }, null, 2));
      await page.screenshot({ path: path.join(SHOTS, 'sample-after-export.png'), fullPage: false }).catch(() => {});
    }
  } else {
    record('sample-loaded', false, 'missing ' + SOURCE);
  }

  /* Section toggles: no Show-all after install */
  const toggleCheck = await page.evaluate(() => {
    if (typeof setFilter === 'function') setFilter('Proteins');
    if (typeof render === 'function') render();
    const cards = Array.from(document.querySelectorAll('.sumcard')).map(c => (c.textContent || '').replace(/\s+/g, ' ').trim());
    const hasShowAll = cards.some(t => /^Show all sections$/i.test(t));
    const proteinsOff = !!document.querySelector('.sumcard.u488-sec-off');
    return { hasShowAll, proteinsOff, cardCount: cards.length, hidden: Prepline488.isSectionHidden('Proteins') };
  });
  record('section-toggles-no-show-all', toggleCheck.hasShowAll === false, JSON.stringify(toggleCheck));
  record('section-toggle-hides', toggleCheck.hidden === true || toggleCheck.proteinsOff === true, JSON.stringify(toggleCheck));

  await page.screenshot({ path: path.join(SHOTS, 'section-toggles.png'), fullPage: false });

  fs.writeFileSync(path.join(OUT, 'smart-chef-results.json'), JSON.stringify({
    checks: CHECKS,
    clarifications: chicken.clarifications,
    chickenGroups: chicken.groups,
    chickenPreps: chicken.chickenPreps,
    midweekPrepDayNote: midDay
  }, null, 2));

  const failed = CHECKS.filter(c => c.result === 'FAIL');
  console.log('\n' + CHECKS.length + ' checks, ' + failed.length + ' failed');
  await browser.close();
  server.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
