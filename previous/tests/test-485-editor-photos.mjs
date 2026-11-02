/**
 * Playwright: Prepline 4.8.5 — full spreadsheet editor carries dish photos from upload.
 * Uses Paula private sample (never commit it).
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import ExcelJS from '../vendor/exceljs/exceljs.min.js';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_485_OUT || '/workspace/share/prepline-editphoto';
const PORT = 8485 + Math.floor(Math.random() * 80);
const SOURCE = process.env.PREPLINE_485_XLSX
  || '/workspace/paula-2026-10-30/WE 15.11.26 For Sorter.xlsx';

const CHECKS = [];
function record(feature, testName, pass, detail) {
  const result = pass ? 'PASS' : 'FAIL';
  CHECKS.push({ feature, test: testName, result, detail: detail || '' });
  console.log(`[${result}] ${feature} :: ${testName}${detail ? ' — ' + detail : ''}`);
}

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.webmanifest')) return 'application/manifest+json';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.svg')) return 'image/svg+xml';
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

async function countImagesInXlsx(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fs.readFileSync(filePath));
  let sheets = 0, images = 0;
  const names = [];
  for (const ws of wb.worksheets) {
    let imgs = [];
    try { imgs = ws.getImages() || []; } catch (e) { imgs = []; }
    if (imgs.length) {
      sheets++;
      images += imgs.length;
      names.push(ws.name + '(' + imgs.length + ')');
    }
  }
  return { sheets, images, names };
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });
  if (!fs.existsSync(SOURCE)) throw new Error('Missing sample: ' + SOURCE);

  const srcStats = await countImagesInXlsx(SOURCE);
  console.log('Source photos:', srcStats);

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => {
    const t = m.text();
    if (/4\.8\.3|photo|addImage|ExcelJS|Univer|error|Error/i.test(t)) console.log('CONSOLE', t.slice(0, 220));
  });

  await page.addInitScript(() => {
    localStorage.setItem('prepline.account.v2', JSON.stringify({ token: 'test-token-485' }));
    localStorage.setItem('prepline.signup.v1', JSON.stringify({ d: '2026-10-31', via: 'test' }));
    try {
      Object.keys(localStorage).forEach((k) => {
        if (/onetime|prepline\.state|preplist/i.test(k) && !/account|signup|gate/i.test(k)) {
          localStorage.removeItem(k);
        }
      });
    } catch (e) {}
  });
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.includes('script.google.com') || u.includes('macros/s/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'unlimited', token: 'test-token-485' })
      });
      return;
    }
    await route.continue();
  });

  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(1000);

  const ver = await page.evaluate(() => ({
    meta: document.querySelector('meta[name="prepline-version"]')?.content || '',
    label: document.getElementById('appVersion')?.textContent || '',
    has485: !!(window.Prepline485 && window.Prepline485.VERSION),
    v485: window.Prepline485 && window.Prepline485.VERSION
  }));
  record('boot', 'version 4.8.5', /4\.8\.5/.test(ver.meta) && ver.has485, JSON.stringify(ver));

  await page.waitForFunction(() => !!(window.handleFile && window.handleFile.__sb && window.PreplineSheet), null, { timeout: 30000 });
  await page.locator('#fileInput').setInputFiles(SOURCE);

  await page.waitForSelector('#sbChoice.open', { timeout: 60000 });
  record('upload', 'edit choice shown', true, 'sbChoice open');

  await page.locator('#sbEditFirst').click();
  await page.waitForSelector('#sbPanel.open', { timeout: 30000 });

  // Wait for Univer + photo extract (large file)
  const pendingCheck = await page.evaluate(() => ({
    stash: !!(window.__prepline485PendingBytes && window.__prepline485PendingBytes.length),
    stashLen: window.__prepline485PendingBytes ? window.__prepline485PendingBytes.length : 0,
    pendingLen: (window.PreplineSheet && window.PreplineSheet.getPendingBytes && window.PreplineSheet.getPendingBytes())
      ? window.PreplineSheet.getPendingBytes().length : 0,
    has485: !!window.Prepline485
  }));
  console.log('pendingCheck', pendingCheck);

  let loadStats = null;
  for (let i = 0; i < 180; i++) {
    loadStats = await page.evaluate(() => window.__prepline485LastLoad || null);
    const overlay = await page.evaluate(() => {
      const el = document.getElementById('sbPhotoOverlay');
      const img = el && el.querySelector('img');
      return {
        open: !!(el && el.classList.contains('open')),
        srcLen: img && img.src ? img.src.length : 0,
        hint: (document.getElementById('sbHint')?.textContent || '').slice(0, 180),
        hasEditor: !!(window.PreplineSheet && window.PreplineSheet._getEditor && window.PreplineSheet._getEditor())
      };
    });
    if (loadStats && loadStats.photos > 0 && overlay.hasEditor) {
      console.log('load@', i, loadStats, overlay.hint);
      break;
    }
    await page.waitForTimeout(500);
  }
  record('editor', 'photos extracted from upload', !!(loadStats && loadStats.photos >= 10),
    JSON.stringify(loadStats));

  // Wait for overlay on at least one tab
  let overlayOk = false;
  for (let i = 0; i < 40; i++) {
    overlayOk = await page.evaluate(() => {
      const el = document.getElementById('sbPhotoOverlay');
      const img = el && el.querySelector('img');
      return !!(el && el.classList.contains('open') && img && img.src && img.src.indexOf('data:') === 0);
    });
    if (overlayOk) break;
    await page.waitForTimeout(400);
  }
  record('editor', 'photo overlay visible', overlayOk, 'sbPhotoOverlay open with data URL');

  await page.screenshot({ path: path.join(OUT, 'screenshots', '01-editor-photo-tab1.png'), fullPage: false });

  // Switch sheets via Univer API if possible; collect overlays on several tabs
  const sheetProbe = await page.evaluate(async () => {
    const ed = window.PreplineSheet && window.PreplineSheet._getEditor && window.PreplineSheet._getEditor();
    const wb = ed && ed.univerAPI && ed.univerAPI.getActiveWorkbook && ed.univerAPI.getActiveWorkbook();
    if (!wb || typeof wb.getSheets !== 'function') return { ok: false, reason: 'no sheets api' };
    const sheets = wb.getSheets() || [];
    const names = sheets.map((sh) => {
      try { return sh.getSheetName ? sh.getSheetName() : (sh.getName ? sh.getName() : null); } catch (e) { return null; }
    }).filter(Boolean);
    const photoKeys = Object.keys(window.Prepline485.getEditorPhotos() || {});
    const seen = [];
    for (let i = 0; i < Math.min(sheets.length, 8); i++) {
      const sh = sheets[i];
      const nm = names[i];
      try {
        if (typeof wb.setActiveSheet === 'function') wb.setActiveSheet(sh);
        else if (sh && typeof sh.activate === 'function') sh.activate();
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 500));
      const el = document.getElementById('sbPhotoOverlay');
      const open = !!(el && el.classList.contains('open'));
      const meta = el && el.querySelector('.sb-ph-meta') ? el.querySelector('.sb-ph-meta').textContent : '';
      if (open) seen.push({ nm, meta: (meta || '').slice(0, 80) });
    }
    return { ok: true, sheetCount: names.length, photoKeys: photoKeys.length, seen, sampleNames: names.slice(0, 5) };
  });
  console.log('sheetProbe', JSON.stringify(sheetProbe, null, 2));
  record('editor', 'photos across several tabs', !!(sheetProbe.seen && sheetProbe.seen.length >= 2),
    'seen=' + (sheetProbe.seen && sheetProbe.seen.length) + ' photoKeys=' + sheetProbe.photoKeys);

  await page.screenshot({ path: path.join(OUT, 'screenshots', '02-editor-after-sheet-switch.png'), fullPage: false });

  // Edit a cell via Univer facade if possible
  const edited = await page.evaluate(() => {
    try {
      const ed = window.PreplineSheet._getEditor();
      const wb = ed.univerAPI.getActiveWorkbook();
      const sheet = wb.getActiveSheet();
      if (sheet && typeof sheet.getRange === 'function') {
        const range = sheet.getRange(0, 0);
        const prev = range.getValue ? range.getValue() : null;
        if (range.setValue) range.setValue(String(prev || '') + ' · edit485');
        else if (typeof ed.univerAPI.executeCommand === 'function') {
          /* fallback no-op mark */
        }
        return { ok: true, via: 'getRange.setValue', prev: String(prev || '').slice(0, 40) };
      }
      return { ok: false, reason: 'no getRange' };
    } catch (e) {
      return { ok: false, reason: String(e && e.message || e) };
    }
  });
  record('editor', 'edit a cell', !!edited.ok, JSON.stringify(edited));
  await page.waitForTimeout(400);

  // Print button present
  const hasPrint = await page.locator('#sbPrintPhoto').count();
  record('editor', 'Print button present', hasPrint === 1, 'sbPrintPhoto');

  // Save .xlsx and verify images survive
  const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
  await page.locator('#sbSaveXlsx').click();
  let savedPath = null;
  try {
    const download = await downloadPromise;
    savedPath = path.join(OUT, download.suggestedFilename() || 'edited-with-photos.xlsx');
    await download.saveAs(savedPath);
  } catch (e) {
    console.log('download event failed, trying __lastEditorXlsx485', e.message);
  }

  const lastMeta = await page.evaluate(() => window.__lastEditorXlsx485 || null);
  record('save', 'save reported photo re-embed', !!(lastMeta && lastMeta.photos >= 10), JSON.stringify(lastMeta));

  if (savedPath && fs.existsSync(savedPath)) {
    const outStats = await countImagesInXlsx(savedPath);
    console.log('Saved photos:', outStats, 'bytes', fs.statSync(savedPath).size);
    record('save', 'exported xlsx still contains images', outStats.images >= 10,
      'images=' + outStats.images + ' sheets=' + outStats.sheets + ' file=' + path.basename(savedPath));
  } else {
    record('save', 'exported xlsx still contains images', false, 'no download file');
  }

  await page.screenshot({ path: path.join(OUT, 'screenshots', '03-editor-after-save.png'), fullPage: false });

  // Summary
  const summary = CHECKS.map((c) => c.result + ' | ' + c.feature + ' | ' + c.test + (c.detail ? ' | ' + c.detail : '')).join('\n');
  fs.writeFileSync(path.join(OUT, 'checklist.txt'), summary + '\n');
  const failed = CHECKS.filter((c) => c.result === 'FAIL');
  console.log('\n=== SUMMARY ===\n' + summary);
  console.log(failed.length ? ('FAILED ' + failed.length) : 'ALL PASS');

  await browser.close();
  server.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
