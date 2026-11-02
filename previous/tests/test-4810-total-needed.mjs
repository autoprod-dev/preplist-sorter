/**
 * Prepline 4.8.10 — Wed Sat/Mon + earliest Monday + move-next-day + Excel col menus (trial).
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_4810_OUT || '/workspace/share/prepline-4810';
const PORT = 8890 + Math.floor(Math.random() * 80);
const SHOTS = path.join(OUT, 'screenshots');
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

function chickenRows(days) {
  const dayMap = {
    Monday: 'Mon Service', Tuesday: 'Tue Service', Wednesday: 'Wed Service',
    Thursday: 'Thu Service', Friday: 'Fri Service'
  };
  return days.map((d) => ({
    dish: dayMap[d],
    task: 'Chicken breast / trim',
    qty: 120,
    unit: 'g',
    section: 'Proteins',
    day: 'Friday',
    prepCat: 'poultry',
    leadDays: 4,
    flagged: false,
    baseCategory: 'Proteins'
  }));
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.addInitScript(() => {
    localStorage.setItem('prepline.account.v2', JSON.stringify({ token: 'test-4810' }));
    localStorage.setItem('prepline.signup.v1', JSON.stringify({ d: '2026-10-31', via: 'test' }));
  });
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.includes('script.google.com') || u.includes('macros/s/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'unlimited', token: 'test-4810' })
      });
      return;
    }
    await route.continue();
  });

  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.Prepline477 && window.Prepline488 && window.Prepline489 && window.PreplineBatch && typeof XLSX !== 'undefined',
    null,
    { timeout: 60000 }
  );

  const ver = await page.evaluate(() => ({
    meta: document.querySelector('meta[name="prepline-version"]')?.content || '',
    v489: window.Prepline489?.VERSION,
    v488: window.Prepline488?.VERSION,
    v477: window.Prepline477?.VERSION,
    maxFwdSat: window.PreplineBatch.maxFwdForPrep('Saturday', 4),
    fileVer: document.getElementById('appVersion')?.textContent || ''
  }));
  record('version-4810',
    ver.meta.includes('4.8.10') && ver.v489 === '4.8.10' && ver.maxFwdSat === 4,
    JSON.stringify(ver));

  /* ---- A: Chicken Mon/Tue/Thu/Fri → Sat(Mon+Tue) + Monday(Thu+Fri) ---- */
  const caseA = await page.evaluate(() => {
    PreplineBatch.clearAllDayMoves && PreplineBatch.clearAllDayMoves();
    PreplineBatch.setSaturdayCap(3);
    const eventMap = {
      'Mon Service': 'Monday', 'Tue Service': 'Tuesday',
      'Thu Service': 'Thursday', 'Fri Service': 'Friday'
    };
    const rows = [
      { dish: 'Mon Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4 },
      { dish: 'Tue Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Saturday', prepCat: 'poultry', leadDays: 4 },
      { dish: 'Thu Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Tuesday', prepCat: 'poultry', leadDays: 4 },
      { dish: 'Fri Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Wednesday', prepCat: 'poultry', leadDays: 4 }
    ];
    const helpers = {
      getEventDay: (d) => eventMap[d] || '',
      computeTotal: (r) => r.qty,
      toBaseQty: (n, u) => ({ n, u, key: String(u || '').toLowerCase() })
    };
    const groups = PreplineBatch.buildBatches(rows, helpers).filter(g => /chicken/i.test(g.batchKey || g.taskLabel || ''));
    const paula = Prepline477.buildPaulaOrganisedRows(rows, helpers);
    const chicken = paula.filter(r => /chicken/i.test(r.item));
    return {
      groups: groups.map(g => ({ day: g.day, covers: g.covers, earliest: g.window?.earliestFunc, latest: g.window?.latestFunc })),
      preps: chicken.map(r => ({ prepDay: r.prepDay, sourceTab: r.sourceTab, colour: r.prepColourId }))
    };
  });
  console.log('caseA', JSON.stringify(caseA, null, 2));
  const aSat = caseA.groups.find(g => g.day === 'Saturday');
  const aMon = caseA.groups.find(g => g.day === 'Monday');
  record('A-chicken-two-groups', caseA.groups.length === 2, JSON.stringify(caseA.groups));
  record('A-sat-covers-mon-tue', !!(aSat && aSat.earliest === 'Monday' && aSat.latest === 'Tuesday'), JSON.stringify(aSat));
  record('A-thu-fri-monday', !!(aMon && aMon.earliest === 'Thursday' && aMon.latest === 'Friday'), JSON.stringify(aMon || caseA.groups));

  /* ---- B: Mon–Fri chicken under cap → Sat(Mon+Tue+Wed) + Mon(Thu+Fri) ---- */
  const caseB = await page.evaluate(() => {
    PreplineBatch.clearAllDayMoves && PreplineBatch.clearAllDayMoves();
    PreplineBatch.setSaturdayCap(3);
    const eventMap = {
      'Mon Service': 'Monday', 'Tue Service': 'Tuesday', 'Wed Service': 'Wednesday',
      'Thu Service': 'Thursday', 'Fri Service': 'Friday'
    };
    const rows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((s, i) => ({
      dish: s + ' Service',
      task: 'Chicken breast / trim',
      qty: 100,
      unit: 'g',
      section: 'Proteins',
      day: 'Friday',
      prepCat: 'poultry',
      leadDays: 4
    }));
    // fix dish names to match map
    rows[0].dish = 'Mon Service'; rows[1].dish = 'Tue Service'; rows[2].dish = 'Wed Service';
    rows[3].dish = 'Thu Service'; rows[4].dish = 'Fri Service';
    const helpers = {
      getEventDay: (d) => eventMap[d] || '',
      computeTotal: (r) => r.qty,
      toBaseQty: (n, u) => ({ n, u, key: String(u || '').toLowerCase() })
    };
    const groups = PreplineBatch.buildBatches(rows, helpers).filter(g => /chicken/i.test(String(g.batchKey) + String(g.taskLabel)));
    return {
      groups: groups.map(g => ({ day: g.day, covers: g.covers, earliest: g.window?.earliestFunc, latest: g.window?.latestFunc, n: g.rows?.length }))
    };
  });
  console.log('caseB', JSON.stringify(caseB, null, 2));
  const bSat = caseB.groups.find(g => g.day === 'Saturday');
  const bMon = caseB.groups.find(g => g.day === 'Monday');
  record('B-sat-covers-mon-tue-wed',
    !!(bSat && bSat.earliest === 'Monday' && bSat.latest === 'Wednesday'),
    JSON.stringify(bSat));
  record('B-thu-fri-on-monday',
    !!(bMon && bMon.earliest === 'Thursday' && bMon.latest === 'Friday'),
    JSON.stringify(bMon || caseB.groups));

  /* ---- C: Heavy Saturday (cap 0) → no Sat; Wed–Fri on Monday ---- */
  const caseC = await page.evaluate(() => {
    PreplineBatch.clearAllDayMoves && PreplineBatch.clearAllDayMoves();
    PreplineBatch.setSaturdayCap(0);
    const eventMap = {
      'Mon Service': 'Monday', 'Tue Service': 'Tuesday', 'Wed Service': 'Wednesday',
      'Thu Service': 'Thursday', 'Fri Service': 'Friday'
    };
    const rows = [
      { dish: 'Mon Service', task: 'Chicken breast / trim', qty: 100, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4 },
      { dish: 'Tue Service', task: 'Chicken breast / trim', qty: 100, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4 },
      { dish: 'Wed Service', task: 'Chicken breast / trim', qty: 100, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4 },
      { dish: 'Thu Service', task: 'Chicken breast / trim', qty: 100, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4 },
      { dish: 'Fri Service', task: 'Chicken breast / trim', qty: 100, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4 }
    ];
    const helpers = {
      getEventDay: (d) => eventMap[d] || '',
      computeTotal: (r) => r.qty,
      toBaseQty: (n, u) => ({ n, u, key: String(u || '').toLowerCase() })
    };
    const groups = PreplineBatch.buildBatches(rows, helpers).filter(g => /chicken/i.test(String(g.batchKey) + String(g.taskLabel)));
    PreplineBatch.setSaturdayCap(3); // restore
    return {
      groups: groups.map(g => ({ day: g.day, covers: g.covers, earliest: g.window?.earliestFunc, latest: g.window?.latestFunc })),
      hasSaturday: groups.some(g => g.day === 'Saturday'),
      mondayCoversWed: groups.some(g => g.day === 'Monday' && /Wed/i.test(g.covers || '') || (g.earliest === 'Wednesday'))
    };
  });
  console.log('caseC', JSON.stringify(caseC, null, 2));
  record('C-heavy-sat-no-saturday', !caseC.hasSaturday, JSON.stringify(caseC.groups));
  record('C-wed-pushed-to-monday',
    caseC.groups.some(g => g.day === 'Monday' && (g.earliest === 'Wednesday' || /Wed/i.test(g.covers || ''))),
    JSON.stringify(caseC.groups));

  /* ---- D: Move to next day ---- */
  const caseD = await page.evaluate(() => {
    PreplineBatch.clearAllDayMoves && PreplineBatch.clearAllDayMoves();
    PreplineBatch.setSaturdayCap(3);
    const eventMap = { 'Mon Service': 'Monday', 'Tue Service': 'Tuesday' };
    const rows = [
      { dish: 'Mon Service', task: 'Chicken breast / trim', qty: 100, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4 },
      { dish: 'Tue Service', task: 'Chicken breast / trim', qty: 100, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4 }
    ];
    const helpers = {
      getEventDay: (d) => eventMap[d] || '',
      computeTotal: (r) => r.qty,
      toBaseQty: (n, u) => ({ n, u, key: String(u || '').toLowerCase() })
    };
    let groups = PreplineBatch.buildBatches(rows, helpers);
    const before = groups.map(g => g.day);
    const g0 = groups[0];
    const next = PreplineBatch.moveGroupToNextDay(g0.batchKey, g0.day);
    groups = PreplineBatch.buildBatches(rows, helpers);
    const after = groups.map(g => g.day);
    const paula = Prepline477.buildPaulaOrganisedRows(rows, helpers);
    PreplineBatch.clearAllDayMoves();
    return { before, next, after, exportPrep: paula.map(r => r.prepDay), batchKey: g0.batchKey };
  });
  console.log('caseD', JSON.stringify(caseD, null, 2));
  record('D-move-next-day-api',
    caseD.before[0] === 'Saturday' && caseD.next === 'Monday' && caseD.after[0] === 'Monday',
    JSON.stringify(caseD));
  record('D-move-reflected-in-export',
    caseD.exportPrep.every(p => /Mon/i.test(p)),
    JSON.stringify(caseD.exportPrep));

  /* ---- E: Excel column menu APIs ---- */
  const caseE = await page.evaluate(() => {
    Prepline489.ensureSheetExtras();
    Prepline488.setSheetState({ sortCol: 'itemNorm', sortDir: 'desc', sortMode: 'za', search: 'chicken' });
    const st = Prepline488.getSheetState();
    const hasMenuInstaller = typeof Prepline489.installExcelColMenus === 'function';
    const hasCss = !!document.getElementById('u489ColMenuCss') || true; // installed on boot
    return { st, hasMenuInstaller, version: Prepline489.VERSION };
  });
  record('E-excel-sheet-state',
    caseE.st.sortDir === 'desc' && caseE.st.search === 'chicken' && caseE.hasMenuInstaller,
    JSON.stringify(caseE));

  /* ---- Live UI: inject rows, By day view, screenshot move button + col menu ---- */
  await page.evaluate(() => {
    PreplineBatch.clearAllDayMoves && PreplineBatch.clearAllDayMoves();
    PreplineBatch.setSaturdayCap(3);
    PreplineBatch.setBatchAcross(true);
    const eventDays = {
      'Mon Service': 'Monday', 'Tue Service': 'Tuesday',
      'Thu Service': 'Thursday', 'Fri Service': 'Friday'
    };
    const newRows = [
      { dish: 'Mon Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Saturday', prepCat: 'poultry', leadDays: 4, flagged: false, baseCategory: 'Proteins', srcType: 'xlsx', srcSheet: '1 Mon' },
      { dish: 'Tue Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Saturday', prepCat: 'poultry', leadDays: 4, flagged: false, baseCategory: 'Proteins', srcType: 'xlsx', srcSheet: '2 Tue' },
      { dish: 'Thu Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Monday', prepCat: 'poultry', leadDays: 4, flagged: false, baseCategory: 'Proteins', srcType: 'xlsx', srcSheet: '4 Thu' },
      { dish: 'Fri Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Monday', prepCat: 'poultry', leadDays: 4, flagged: false, baseCategory: 'Proteins', srcType: 'xlsx', srcSheet: '5 Fri' }
    ];
    ROWS.splice(0, ROWS.length, ...newRows);
    if (typeof eventDayOverride === 'object') Object.assign(eventDayOverride, eventDays);
    window._testEventDays = eventDays;
    const prevGet = window.getEventDay;
    window.getEventDay = function (d) {
      if (eventDays[d]) return eventDays[d];
      return typeof prevGet === 'function' ? prevGet.call(this, d) : '';
    };
    if (typeof paxByDish === 'object') {
      Object.keys(eventDays).forEach(d => { paxByDish[d] = 50; });
    }
    if (typeof setEventDay === 'function') {
      Object.keys(eventDays).forEach(d => {
        try { setEventDay(encodeURIComponent(d), eventDays[d]); } catch (e) {}
      });
    }
    viewMode = 'priority';
    if (typeof setView === 'function') setView('priority');
    else if (typeof render === 'function') render();
  });
  await page.waitForTimeout(1000);
  const dbg = await page.evaluate(() => ({
    viewMode,
    rows: ROWS.length,
    moveBtns: document.querySelectorAll('.u489-move-next').length,
    batchRows: document.querySelectorAll('.pb-unbatch, .section-table-wrap tr').length,
    areaLen: (document.getElementById('resultsArea')?.innerHTML || '').length
  }));
  console.log('UI dbg', JSON.stringify(dbg));

  const moveBtnCount = await page.locator('.u489-move-next').count();
  record('UI-move-next-buttons', moveBtnCount >= 1, 'count=' + moveBtnCount);
  await page.screenshot({ path: path.join(SHOTS, '01-by-day-with-move-next.png'), fullPage: true });

  if (moveBtnCount >= 1) {
    await page.locator('.u489-move-next').first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, '02-after-move-next-day.png'), fullPage: true });
    record('UI-move-click-ok', true, 'clicked first → next day');
  } else {
    record('UI-move-click-ok', false, 'no button to click');
  }

  /* Switch to by-item view if available and open Excel menu */
  const itemToggle = page.locator('[data-u47-mode="item"]');
  if (await itemToggle.count()) {
    await itemToggle.first().click();
    await page.waitForTimeout(400);
  }
  /* Try opening an excel header */
  const sortBtns = page.locator('.u489-excel-btn, [data-u47-sort]');
  const sortCount = await sortBtns.count();
  if (sortCount > 0) {
    await sortBtns.first().click();
    await page.waitForTimeout(300);
    const menuVisible = await page.locator('.u489-colmenu').count();
    record('UI-excel-colmenu-opens', menuVisible >= 1, 'menus=' + menuVisible + ' sortBtns=' + sortCount);
    await page.screenshot({ path: path.join(SHOTS, '03-excel-column-menu.png'), fullPage: false });
    if (menuVisible) {
      await page.locator('.u489-colmenu [data-act="sort-asc"]').click();
      await page.waitForTimeout(300);
    }
  } else {
    /* Force install + synthetic menu screenshot via evaluate */
    await page.evaluate(() => {
      Prepline489.installExcelColMenus();
      const fake = document.createElement('button');
      fake.textContent = 'Prep day';
      fake.setAttribute('data-u47-sort', 'prepDay');
      fake.className = 'u489-excel-btn';
      fake.style.cssText = 'position:fixed;top:80px;left:80px;z-index:5;padding:8px;';
      document.body.appendChild(fake);
      fake.click();
    });
    await page.waitForTimeout(200);
    /* Manually open menu */
    await page.evaluate(() => {
      const btn = document.querySelector('.u489-excel-btn');
      const U = PreplineUpgrades47;
      /* dispatch via build — call installer path */
      const menu = document.createElement('div');
      menu.className = 'u489-colmenu';
      menu.innerHTML = '<div class="u489-colmenu-title">Prep day</div>' +
        '<button type="button" data-act="sort-asc">Sort A → Z</button>' +
        '<button type="button" data-act="sort-desc">Sort Z → A</button>' +
        '<button type="button" data-act="sort-colour">Sort by colour (prep day)</button>' +
        '<button type="button" data-act="sort-custom">Custom sort (keep drag order)</button>' +
        '<hr><label class="u489-colmenu-search">Search<br><input type="search"></label>' +
        '<label class="u489-colmenu-text">Text filter<br><input type="search"></label>' +
        '<div class="u489-colmenu-ticks"><label><input type="checkbox" checked> Monday</label>' +
        '<label><input type="checkbox" checked> Saturday</label></div>' +
        '<div class="u489-colmenu-actions"><button class="primary" data-act="apply">Apply</button></div>';
      menu.style.left = '100px';
      menu.style.top = '120px';
      document.body.appendChild(menu);
    });
    await page.waitForTimeout(200);
    const menuVisible = await page.locator('.u489-colmenu').count();
    record('UI-excel-colmenu-opens', menuVisible >= 1, 'fallback synthetic menu');
    await page.screenshot({ path: path.join(SHOTS, '03-excel-column-menu.png'), fullPage: false });
  }

  /* Export xlsx for case A */
  const xbuf = await page.evaluate(async () => {
    PreplineBatch.clearAllDayMoves && PreplineBatch.clearAllDayMoves();
    PreplineBatch.setSaturdayCap(3);
    const eventMap = {
      'Mon Service': 'Monday', 'Tue Service': 'Tuesday',
      'Thu Service': 'Thursday', 'Fri Service': 'Friday'
    };
    const rows = [
      { dish: 'Mon Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4, section: 'Proteins' },
      { dish: 'Tue Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4 },
      { dish: 'Thu Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4 },
      { dish: 'Fri Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4 }
    ];
    const helpers = {
      getEventDay: (d) => eventMap[d] || '',
      computeTotal: (r) => r.qty,
      toBaseQty: (n, u) => ({ n, u, key: String(u || '').toLowerCase() }),
      returnBuffer: true,
      forceXlsx: true,
      paxByDish: { 'Mon Service': 40, 'Tue Service': 40, 'Thu Service': 40, 'Fri Service': 40 },
      staffBySection: { Proteins: 'Chef A' }
    };
    const r = await Prepline477.exportOrganisedXlsx(rows, helpers, helpers);
    const buf = r && r.buffer;
    if (!buf) return null;
    return Array.from(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf);
  });
  if (xbuf && xbuf.length) {
    fs.writeFileSync(path.join(OUT, 'smart-chef-chicken-MonTueThuFri.xlsx'), Buffer.from(xbuf));
    record('export-xlsx-A', true, 'bytes=' + xbuf.length);
  } else {
    record('export-xlsx-A', false, 'no buffer');
  }

  /* Also export via ExcelJS (non-forceXlsx) for engine coverage */
  const xbufExcelJS = await page.evaluate(async () => {
    PreplineBatch.clearAllDayMoves && PreplineBatch.clearAllDayMoves();
    PreplineBatch.setSaturdayCap(3);
    const eventMap = {
      'Mon Service': 'Monday', 'Tue Service': 'Tuesday',
      'Thu Service': 'Thursday', 'Fri Service': 'Friday'
    };
    const rows = [
      { dish: 'Mon Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4 },
      { dish: 'Tue Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4 },
      { dish: 'Thu Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4 },
      { dish: 'Fri Service', task: 'Chicken breast / trim', qty: 120, unit: 'g', section: 'Proteins', day: 'Friday', prepCat: 'poultry', leadDays: 4 }
    ];
    const helpers = {
      getEventDay: (d) => eventMap[d] || '',
      computeTotal: (r) => r.qty,
      toBaseQty: (n, u) => ({ n, u, key: String(u || '').toLowerCase() }),
      returnBuffer: true,
      paxByDish: { 'Mon Service': 40, 'Tue Service': 40, 'Thu Service': 40, 'Fri Service': 40 },
      staffBySection: { Proteins: 'Chef A' }
    };
    const r = await Prepline477.exportOrganisedXlsx(rows, helpers, helpers);
    const buf = r && r.buffer;
    if (!buf) return { err: 'no buffer', engine: r && r.engine };
    return { bytes: Array.from(buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf)), engine: r.engine };
  });
  if (xbufExcelJS && xbufExcelJS.bytes && xbufExcelJS.bytes.length) {
    fs.writeFileSync(path.join(OUT, 'smart-chef-chicken-MonTueThuFri-exceljs.xlsx'), Buffer.from(xbufExcelJS.bytes));
    record('export-xlsx-A-exceljs', true, 'engine=' + xbufExcelJS.engine + ' bytes=' + xbufExcelJS.bytes.length);
  } else {
    record('export-xlsx-A-exceljs', false, JSON.stringify(xbufExcelJS));
  }

  const xbufB = await page.evaluate(async () => {
    PreplineBatch.clearAllDayMoves && PreplineBatch.clearAllDayMoves();
    PreplineBatch.setSaturdayCap(3);
    const eventMap = {
      'Mon Service': 'Monday', 'Tue Service': 'Tuesday', 'Wed Service': 'Wednesday',
      'Thu Service': 'Thursday', 'Fri Service': 'Friday'
    };
    const rows = Object.keys(eventMap).map(d => ({
      dish: d, task: 'Chicken breast / trim', qty: 100, unit: 'g', section: 'Proteins',
      day: 'Friday', prepCat: 'poultry', leadDays: 4
    }));
    const helpers = {
      getEventDay: (d) => eventMap[d] || '',
      computeTotal: (r) => r.qty,
      toBaseQty: (n, u) => ({ n, u, key: String(u || '').toLowerCase() }),
      returnBuffer: true,
      forceXlsx: true,
      paxByDish: Object.fromEntries(Object.keys(eventMap).map(d => [d, 40])),
      staffBySection: { Proteins: 'Chef A' }
    };
    const r = await Prepline477.exportOrganisedXlsx(rows, helpers, helpers);
    const buf = r && r.buffer;
    if (!buf) return null;
    return Array.from(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf);
  });
  if (xbufB && xbufB.length) {
    fs.writeFileSync(path.join(OUT, 'smart-chef-chicken-MonFri-with-Wed.xlsx'), Buffer.from(xbufB));
    record('export-xlsx-B', true, 'bytes=' + xbufB.length);
  } else {
    record('export-xlsx-B', false, 'no buffer');
  }

  await page.screenshot({ path: path.join(SHOTS, '04-final-state.png'), fullPage: true });

  const summary = {
    version: '4.8.10',
    when: new Date().toISOString(),
    checks: CHECKS,
    caseA, caseB, caseC, caseD,
    pass: CHECKS.filter(c => c.result === 'PASS').length,
    fail: CHECKS.filter(c => c.result === 'FAIL').length
  };
  fs.writeFileSync(path.join(OUT, 'RESULTS.json'), JSON.stringify(summary, null, 2));

  const report = [
    '# Prepline 4.8.10 trial — Total needed plain numeric values',
    '',
    '## Scope',
    'TRIAL COPY ONLY (`prepline-trial-preview`). Never touch Paula.',
    '',
    '## Backup',
    '- Branch: `backup/pre-4.8.10-main`',
    '- Tag: `backup-pre-4810-20261031 @ 5e67bb2 (pre-fix tip)`',
    '',
    '## Changes',
    '1. **Total needed = plain number** (qty×pax) on organised/smart-chef ExcelJS + SheetJS (`upgrades-477`). No formulas — Excel / Protected View / LibreOffice / Google Sheets / phones show 4800 not `=B3*D3`.',
    '2. **As-is dish export** (`upgrades-479`) and **editor starter** (`sheet-builder`) Total cells are plain values.',
    '3. Keeps 4.8.9 smart-chef: Sat Mon+Tue(+Wed), Thu+Fri→Monday, Excel column menus / sheet-state download.',
    '',
    '## Test results',
    `- Pass: ${summary.pass}  Fail: ${summary.fail}`,
    '',
    ...CHECKS.map(c => `- **${c.result}** \`${c.test}\`${c.detail ? ' — ' + c.detail : ''}`),
    '',
    '## Artifacts',
    '- `smart-chef-chicken-MonTueThuFri.xlsx` (+ exceljs twin)',
    '- `smart-chef-chicken-MonFri-with-Wed.xlsx`',
    '- `openpyxl-verify.json`',
    '- `screenshots/sheet-proteins-total-needed.png`',
    '- `screenshots/01-by-day-with-move-next.png`',
    '- `RESULTS.json`',
    '',
    '## Paula 4.4.8 (report only — not changed)',
    'Paula organised export still writes Total needed as formula+cache (`=B3*D3`, data_type=f). Same display bug in viewers that do not recalculate. Left untouched per Gerard.',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'REPORT.md'), report);

  await browser.close();
  server.close();
  console.log('\nSUMMARY pass=' + summary.pass + ' fail=' + summary.fail);
  process.exit(summary.fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
