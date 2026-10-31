/**
 * Playwright checklist for Prepline 4.8.0 collapsible grouped-controls (trial).
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_480_OUT || '/workspace/share/prepline-480';
const PORT = 8780 + Math.floor(Math.random() * 100);
const LIVE = process.env.PREPLINE_480_LIVE || '';

const CHECKS = [];
function record(feature, testName, pass, detail) {
  CHECKS.push({ feature, test: testName, result: pass ? 'PASS' : 'FAIL', detail: detail || '' });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${feature} :: ${testName}${detail ? ' — ' + detail : ''}`);
}

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (p.endsWith('.svg')) return 'image/svg+xml';
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

async function unlockGate(page) {
  await page.addInitScript(() => {
    localStorage.setItem('prepline.account.v2', JSON.stringify({ token: 'test-token-480' }));
    localStorage.setItem('prepline.signup.v1', JSON.stringify({ d: '2026-10-30', via: 'test' }));
  });
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.includes('script.google.com') || u.includes('macros/s/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'unlimited', token: 'test-token-480' })
      });
      return;
    }
    await route.continue();
  });
}

async function loadSynthetic(page) {
  await page.evaluate(() => {
    const rows = [
      { dish: 'Gala Dinner', task: 'Dutch carrots / cook', qty: 80, unit: 'g', section: 'Vegetables', day: 'Wednesday', flagged: false, baseCategory: 'Vegetables' },
      { dish: 'Gala Dinner', task: 'Carrot puree', qty: 40, unit: 'g', section: 'Sauce, Purees and Gels', day: 'Tuesday', flagged: false, baseCategory: 'Sauce, Purees and Gels' },
      { dish: 'Gala Dinner', task: 'Duck Breast / SV', qty: 1, unit: 'ea', section: 'Proteins', day: 'Thursday', flagged: false, baseCategory: 'Proteins' },
      { dish: 'Lunch Service', task: 'Baby carrots SV', qty: 60, unit: 'g', section: 'Vegetables', day: 'Wednesday', flagged: false, baseCategory: 'Vegetables' },
      { dish: 'Lunch Service', task: 'Pea Puree', qty: 30, unit: 'g', section: 'Sauce, Purees and Gels', day: 'Tuesday', flagged: false, baseCategory: 'Sauce, Purees and Gels' }
    ];
    const b = window.__preplineBridge;
    b.clearList();
    b.setRows(rows);
    b.setPax('Gala Dinner', 120);
    b.setPax('Lunch Service', 80);
    document.getElementById('fileTag').textContent = 'synthetic-480.xlsx';
    b.render();
  });
  await page.waitForTimeout(500);
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });
  let server = null;
  let base = LIVE;
  if (!base) {
    server = await startServer();
    base = `http://127.0.0.1:${PORT}/`;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await unlockGate(page);
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(800);

  const ver = await page.evaluate(() => ({
    meta: (document.querySelector('meta[name="prepline-version"]') || {}).content || '',
    footer: (document.getElementById('appVersion') || {}).textContent || '',
    p480: window.Prepline480 && Prepline480.VERSION,
    hasGroupsHtml: !!(window.Prepline480 && Prepline480.groupsHtml)
  }));
  record('version', 'meta_480', /4\.8\.0/.test(ver.meta), JSON.stringify(ver));
  record('version', 'module_480', ver.p480 === '4.8.0', String(ver.p480));
  record('version', 'footer_480', /4\.8\.0/.test(ver.footer), ver.footer);

  // Before sort: groups absent, load chrome visible
  const before = await page.evaluate(() => ({
    groups: !!document.getElementById('u480Groups'),
    dropzone: !!(document.getElementById('dropzone') && document.getElementById('dropzone').offsetParent !== null),
    sorted: document.body.classList.contains('u480-sorted'),
    chip: !!(document.getElementById('u480FileChip') && !document.getElementById('u480FileChip').hidden)
  }));
  record('load_chrome', 'dropzone_visible_before_sort', before.dropzone, JSON.stringify(before));
  record('load_chrome', 'not_sorted_before', !before.sorted && !before.chip, JSON.stringify(before));

  await loadSynthetic(page);

  const after = await page.evaluate(() => {
    const drop = document.getElementById('dropzone');
    const body = document.querySelector('#dbPanel .u480-load-body');
    const dropVisible = drop && drop.offsetParent !== null && getComputedStyle(drop).display !== 'none'
      && (!body || getComputedStyle(body).display !== 'none');
    const groups = document.getElementById('u480Groups');
    const details = groups ? [...groups.querySelectorAll('details.u480-group')] : [];
    const openCount = details.filter(d => d.open).length;
    const ids = {
      item: !!document.getElementById('itemViewBtn'),
      week: !!document.getElementById('weekViewBtn'),
      order: !!document.getElementById('orderViewBtn'),
      order47: !!document.getElementById('order47ViewBtn'),
      recipes: !!document.getElementById('recipesViewBtn'),
      voice: !!document.getElementById('voiceViewBtn'),
      roster: !!document.getElementById('roster47ViewBtn'),
      dispatch: !!document.getElementById('dispatch47ViewBtn'),
      brief: !!document.getElementById('brief47ViewBtn'),
      swap: !!document.getElementById('swap47ViewBtn'),
      organised: !!document.querySelector('button[onclick="exportOrganisedXlsx47()"]'),
      pdf: !!document.querySelector('button[onclick="exportOrganisedPdf47()"]'),
      email: !!document.querySelector('button[onclick="shareOrganised47()"]'),
      printSec: !!document.querySelector('button[onclick="printAllSections()"]'),
      printDays: !!document.querySelector('button[onclick="printAllDays()"]'),
      planDish: !!document.querySelector('#u47PlanToggle button[onclick="setView(\'dish\')"]'),
      planDay: !!document.querySelector('#u47PlanToggle button[onclick="setView(\'priority\')"]'),
      planSec: !!document.querySelector('#u47PlanToggle button[onclick="setView(\'section\')"]')
    };
    const chip = document.getElementById('u480FileChip');
    const chipName = (document.getElementById('u480FileName') || {}).textContent || '';
    return {
      sorted: document.body.classList.contains('u480-sorted'),
      dropVisible,
      chipVisible: !!(chip && !chip.hidden),
      chipName,
      groups: !!groups,
      groupCount: details.length,
      openCount,
      groupIds: details.map(d => d.id),
      ids,
      rows: (typeof ROWS !== 'undefined' && ROWS) ? ROWS.length : 0
    };
  });

  record('load_chrome', 'body_sorted_class', after.sorted, JSON.stringify({ sorted: after.sorted }));
  record('load_chrome', 'dropzone_collapsed', !after.dropVisible, JSON.stringify({ dropVisible: after.dropVisible }));
  record('load_chrome', 'file_chip_visible', after.chipVisible, after.chipName);
  record('load_chrome', 'file_chip_name', /synthetic|sorted/i.test(after.chipName), after.chipName);

  record('groups', 'u480_groups_present', after.groups && after.groupCount === 4, JSON.stringify(after.groupIds));
  record('groups', 'collapsed_by_default', after.openCount === 0, 'open=' + after.openCount);
  record('groups', 'primary_plan_visible', after.ids.planDish && after.ids.planDay && after.ids.planSec, JSON.stringify(after.ids));

  // Every feature kept (buttons exist in DOM even inside collapsed details)
  const kept = after.ids;
  record('features_kept', 'more_views', kept.item && kept.week && kept.order && kept.order47 && kept.recipes && kept.voice, JSON.stringify(kept));
  record('features_kept', 'export', kept.organised && kept.pdf && kept.email, JSON.stringify(kept));
  record('features_kept', 'print', kept.printSec && kept.printDays, JSON.stringify(kept));
  record('features_kept', 'team', kept.roster && kept.dispatch && kept.brief && kept.swap, JSON.stringify(kept));

  // Expand Export group and click Organised export API exists
  await page.evaluate(() => {
    const d = document.getElementById('u480Export');
    if (d) d.open = true;
  });
  const exportOpen = await page.evaluate(() => !!(document.getElementById('u480Export') || {}).open);
  record('groups', 'export_opens', exportOpen, '');

  // Change expands load chrome
  await page.click('#u480ChangeFileBtn');
  await page.waitForTimeout(200);
  const expanded = await page.evaluate(() => {
    const panel = document.getElementById('dbPanel');
    const drop = document.getElementById('dropzone');
    return {
      open: panel && panel.classList.contains('u480-open'),
      dropVisible: !!(drop && drop.offsetParent !== null && getComputedStyle(drop).display !== 'none')
    };
  });
  record('load_chrome', 'change_expands_load', expanded.open && expanded.dropVisible, JSON.stringify(expanded));

  // View toggles still work
  await page.click('#u47PlanToggle button[onclick="setView(\'priority\')"]');
  await page.waitForTimeout(300);
  const dayView = await page.evaluate(() => viewMode === 'priority');
  record('views', 'toggle_priority', dayView, '');

  await page.evaluate(() => {
    const d = document.getElementById('u480ViewsMore');
    if (d) d.open = true;
  });
  await page.click('#itemViewBtn');
  await page.waitForTimeout(300);
  const itemView = await page.evaluate(() => viewMode === 'item');
  record('views', 'toggle_item_from_more', itemView, '');

  // Screenshots
  await page.evaluate(() => {
    // collapse load again for clean shot
    const panel = document.getElementById('dbPanel');
    if (panel) { panel.classList.remove('u480-open'); panel.classList.add('u480-collapsed'); }
    document.querySelectorAll('#u480Groups details').forEach(d => { d.open = false; });
    if (typeof setView === 'function') setView('dish');
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'screenshots', '01-collapsed-default.png'), fullPage: false });

  await page.evaluate(() => {
    document.querySelectorAll('#u480Groups details').forEach(d => { d.open = true; });
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'screenshots', '02-all-groups-open.png'), fullPage: false });

  await page.click('#u480ChangeFileBtn');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'screenshots', '03-load-expanded.png'), fullPage: false });

  // Mobile viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const panel = document.getElementById('dbPanel');
    if (panel) { panel.classList.remove('u480-open'); panel.classList.add('u480-collapsed'); }
    document.querySelectorAll('#u480Groups details').forEach(d => { d.open = false; });
    if (typeof render === 'function') render();
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'screenshots', '04-mobile-collapsed.png'), fullPage: false });

  const pass = CHECKS.filter(c => c.result === 'PASS').length;
  const fail = CHECKS.filter(c => c.result === 'FAIL').length;
  const lines = [
    `Prepline 4.8.0 collapsible grouped-controls checklist`,
    `generated: ${new Date().toISOString()}`,
    `base: ${base}`,
    '',
    ...CHECKS.map(c => `${c.result}\t${c.feature}\t${c.test}\t${c.detail}`),
    '',
    `TOTAL\tPASS=${pass}\tFAIL=${fail}`
  ];
  fs.writeFileSync(path.join(OUT, 'checklist.txt'), lines.join('\n'));
  fs.writeFileSync(path.join(OUT, 'status.json'), JSON.stringify({ pass, fail, checks: CHECKS, ver }, null, 2));
  console.log(`\nTOTAL PASS=${pass} FAIL=${fail}`);
  console.log('wrote', path.join(OUT, 'checklist.txt'));

  await browser.close();
  if (server) server.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
