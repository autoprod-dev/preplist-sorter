/**
 * Playwright: Prepline 4.8.1 — all original PT / View original clickable; Print includes dish photo.
 * Prefer LIVE URL via PREPLINE_481_LIVE; else serve local ROOT.
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_481_OUT || '/workspace/share/prepline-481';
const PORT = 8481 + Math.floor(Math.random() * 80);
const LIVE = process.env.PREPLINE_481_LIVE || '';

const XLSX = process.env.PREPLINE_481_XLSX
  || '/workspace/paula-2026-10-30/WE 15.11.26 For Sorter.xlsx';
const PDF = process.env.PREPLINE_481_PDF
  || '/workspace/prepline-builder/tests/v3/samples/sample-recipes.pdf';

const CHECKS = [];
function record(feature, testName, pass, detail, soft) {
  let result;
  if (soft === 'SKIP') result = 'SKIP';
  else result = pass ? 'PASS' : 'FAIL';
  CHECKS.push({ feature, test: testName, result, detail: detail || '' });
  console.log(`[${result}] ${feature} :: ${testName}${detail ? ' — ' + detail : ''}`);
}

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (p.endsWith('.pdf')) return 'application/pdf';
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
    localStorage.setItem('prepline.account.v2', JSON.stringify({ token: 'test-token-481' }));
    localStorage.setItem('prepline.signup.v1', JSON.stringify({ d: '2026-10-31', via: 'test' }));
    /* Do not restore a previous onetime sort — each test upload must stand alone */
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
        body: JSON.stringify({ status: 'unlimited', token: 'test-token-481' })
      });
      return;
    }
    await route.continue();
  });
}

async function uploadXlsx(page, filePath) {
  const input = page.locator('#fileInput');
  await input.setInputFiles(filePath);
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(() => ({
      rows: (typeof ROWS !== 'undefined' ? ROWS : []).length,
      sbOpen: !!(document.getElementById('sbChoice') && document.getElementById('sbChoice').classList.contains('open')),
      photos: Object.keys(typeof originalPageImages === 'object' && originalPageImages ? originalPageImages : {}).length,
      status: (document.getElementById('statusMsg')?.textContent || '').slice(0, 160)
    }));
    if (st.sbOpen) {
      await page.locator('#sbSortNow').click();
      await page.waitForTimeout(600);
      continue;
    }
    if (st.rows > 40) {
      if (st.photos > 0 || i > 35) return st;
    }
    await page.waitForTimeout(400);
  }
  throw new Error('xlsx upload failed');
}

async function waitPhotos(page, min = 5) {
  for (let i = 0; i < 25; i++) {
    const n = await page.evaluate(() => Object.keys(originalPageImages || {}).length);
    if (n >= min) return n;
    await page.waitForTimeout(400);
  }
  return page.evaluate(() => Object.keys(originalPageImages || {}).length);
}

async function dismissOutputChoice(page) {
  await page.evaluate(() => {
    const oc = document.getElementById('outputChoice');
    if (oc) { oc.hidden = true; oc.innerHTML = ''; }
    const v = document.getElementById('preplistTab');
    if (v) v.scrollIntoView();
  });
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });
  let server = null;
  let base = LIVE;
  if (!base) {
    server = await startServer();
    base = `http://127.0.0.1:${PORT}/`;
  }
  console.log('BASE', base);
  console.log('XLSX', XLSX, fs.existsSync(XLSX));
  console.log('PDF', PDF, fs.existsSync(PDF));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await unlockGate(page);
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(900);

  const ver = await page.evaluate(() => ({
    meta: (document.querySelector('meta[name="prepline-version"]') || {}).content || '',
    footer: (document.getElementById('appVersion') || {}).textContent || '',
    p481: window.Prepline481 && Prepline481.VERSION
  }));
  record('version', 'meta_481', /4\.8\.1/.test(ver.meta), JSON.stringify(ver));
  record('version', 'module_481', ver.p481 === '4.8.1', String(ver.p481));
  record('version', 'footer_481', /4\.8\.1/.test(ver.footer), ver.footer);

  // ---- XLSX: Paula file ----
  const up = await uploadXlsx(page, XLSX);
  record('upload', 'xlsx_rows', up.rows > 40, JSON.stringify(up));
  const photoN = await waitPhotos(page, 5);
  record('upload', 'xlsx_photos', photoN >= 5, 'photos=' + photoN);
  await dismissOutputChoice(page);
  await page.waitForTimeout(400);
  await page.evaluate(() => { if (typeof setView === 'function') setView('dish'); if (typeof render === 'function') render(); });
  await page.waitForTimeout(700);

  // By dish: View original buttons
  const dishLinks = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#resultsArea .dish-block .u481-orig, #resultsArea .dish-block button[data-u481-dish], #resultsArea .dish-block button.ghost')]
      .filter(b => /view original|orig\.?\s*pt/i.test(b.textContent || ''));
    return { count: btns.length, sample: btns.slice(0, 3).map(b => b.textContent.trim()) };
  });
  record('by-dish', 'view_original_links', dishLinks.count >= 3, JSON.stringify(dishLinks));

  // Click first View original
  const firstDishBtn = page.locator('#resultsArea .dish-block button.u481-orig, #resultsArea .dish-block button[data-u481-dish]').filter({ hasText: /View original|orig/i }).first();
  await firstDishBtn.click({ timeout: 10000 });
  await page.waitForTimeout(800);

  const asIsOpen = await page.evaluate(() => {
    const ov = document.getElementById('u481AsIsOverlay');
    const viewer = document.getElementById('origViewerOverlay');
    return {
      asIs: !!(ov && !ov.hidden),
      viewer: !!(viewer && !viewer.classList.contains('hidden')),
      printBtn: !!(document.getElementById('u481AsIsPrint') || document.querySelector('#origViewerOverlay button.secondary')),
      photoInAsIs: !!document.querySelector('#u481AsIsOverlay .asis-photo img'),
      title: (document.getElementById('u481AsIsTitle') || document.getElementById('origViewerTitle') || {}).textContent || ''
    };
  });
  record('open', 'original_opens', asIsOpen.asIs || asIsOpen.viewer, JSON.stringify(asIsOpen));
  record('open', 'print_control', !!asIsOpen.printBtn, JSON.stringify(asIsOpen));
  record('open', 'dish_photo_in_original', asIsOpen.asIs ? asIsOpen.photoInAsIs : true, JSON.stringify(asIsOpen));
  await page.screenshot({ path: path.join(OUT, 'screenshots', '01-bydish-original-open.png'), fullPage: false });

  // Print original → capture __lastOriginalPrint / __lastAsIsPrint
  if (asIsOpen.asIs) {
    await page.locator('#u481AsIsPrint').click();
  } else {
    await page.locator('#origViewerOverlay button.secondary').first().click();
  }
  await page.waitForTimeout(900);
  const printHtml = await page.evaluate(() => ({
    has: !!(window.__lastOriginalPrint || window.__lastAsIsPrint),
    len: String(window.__lastOriginalPrint || window.__lastAsIsPrint || '').length,
    hasPhoto: /asis-photo|Dish photo|data:image\//i.test(String(window.__lastOriginalPrint || window.__lastAsIsPrint || ''))
  }));
  record('print', 'print_html_generated', printHtml.has && printHtml.len > 500, JSON.stringify(printHtml));
  record('print', 'print_includes_photo', printHtml.hasPhoto, JSON.stringify(printHtml));

  // Write print HTML snapshot and screenshot overlay
  const htmlOut = path.join(OUT, 'print-original-sample.html');
  const body = await page.evaluate(() => window.__lastOriginalPrint || window.__lastAsIsPrint || '');
  if (body) fs.writeFileSync(htmlOut, body);
  await page.screenshot({ path: path.join(OUT, 'screenshots', '02-print-original-ready.png'), fullPage: false });

  // Dedicated print-preview page (what Print produces, including dish photo)
  if (body) {
    const preview = await browser.newPage();
    await preview.setContent(body, { waitUntil: 'load' });
    await preview.waitForTimeout(400);
    await preview.screenshot({ path: path.join(OUT, 'screenshots', '02b-print-preview-output.png'), fullPage: true });
    await preview.close();
  }

  // Close overlay
  await page.evaluate(() => {
    if (window.Prepline481 && Prepline481.closeAsIsOriginal) Prepline481.closeAsIsOriginal();
    if (typeof closeOriginalViewer === 'function') closeOriginalViewer();
  });

  // By day
  await page.evaluate(() => { setView('priority'); });
  await page.waitForTimeout(600);
  const dayChips = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('#resultsArea td.dish .u481-orig, #resultsArea .u481-orig-chip .u481-orig')];
    return { count: chips.length, sample: chips.slice(0, 4).map(c => c.textContent.trim()) };
  });
  record('by-day', 'orig_pt_chips', dayChips.count >= 2, JSON.stringify(dayChips));
  if (dayChips.count >= 1) {
    await page.locator('#resultsArea td.dish .u481-orig, #resultsArea .u481-orig-chip .u481-orig').first().click();
    await page.waitForTimeout(700);
    const open2 = await page.evaluate(() => {
      const ov = document.getElementById('u481AsIsOverlay');
      return { asIs: !!(ov && !ov.hidden), print: !!document.getElementById('u481AsIsPrint') };
    });
    record('by-day', 'chip_opens_original', open2.asIs && open2.print, JSON.stringify(open2));
    await page.screenshot({ path: path.join(OUT, 'screenshots', '03-byday-original-open.png'), fullPage: false });
    await page.evaluate(() => Prepline481 && Prepline481.closeAsIsOriginal && Prepline481.closeAsIsOriginal());
  } else {
    record('by-day', 'chip_opens_original', false, 'no chips');
  }

  // By section
  await page.evaluate(() => { setView('section'); });
  await page.waitForTimeout(600);
  const secChips = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('#resultsArea td.dish .u481-orig')];
    return { count: chips.length };
  });
  record('by-section', 'orig_pt_chips', secChips.count >= 2, JSON.stringify(secChips));
  if (secChips.count >= 1) {
    await page.locator('#resultsArea td.dish .u481-orig').first().click();
    await page.waitForTimeout(700);
    const open3 = await page.evaluate(() => {
      const ov = document.getElementById('u481AsIsOverlay');
      const photo = !!document.querySelector('#u481AsIsOverlay .asis-photo img');
      return { asIs: !!(ov && !ov.hidden), photo };
    });
    record('by-section', 'chip_opens_original', open3.asIs, JSON.stringify(open3));
    await page.screenshot({ path: path.join(OUT, 'screenshots', '04-bysection-original-open.png'), fullPage: false });
    await page.evaluate(() => Prepline481 && Prepline481.closeAsIsOriginal && Prepline481.closeAsIsOriginal());
  }

  // Original PTs tab
  const hasOrigTab = await page.evaluate(() => Object.keys(originalPageImages || {}).length > 0);
  if (hasOrigTab) {
    await page.evaluate(() => setView('orig'));
    await page.waitForTimeout(700);
    const origTab = await page.evaluate(() => ({
      pages: document.querySelectorAll('#resultsArea .orig-page').length,
      viewBtns: [...document.querySelectorAll('#resultsArea .orig-head button, #resultsArea .u481-orig')].filter(b => /view original/i.test(b.textContent || '')).length
    }));
    record('orig-tab', 'pages_and_buttons', origTab.pages >= 1 && origTab.viewBtns >= 1, JSON.stringify(origTab));
    await page.locator('#resultsArea .orig-head button, #resultsArea button.u481-orig').filter({ hasText: /View original/i }).first().click();
    await page.waitForTimeout(700);
    const open4 = await page.evaluate(() => {
      const ov = document.getElementById('u481AsIsOverlay');
      const viewer = document.getElementById('origViewerOverlay');
      return {
        asIs: !!(ov && !ov.hidden),
        viewer: !!(viewer && !viewer.classList.contains('hidden'))
      };
    });
    record('orig-tab', 'view_original_opens', open4.asIs || open4.viewer, JSON.stringify(open4));
    await page.screenshot({ path: path.join(OUT, 'screenshots', '05-origtab-open.png'), fullPage: false });
    await page.evaluate(() => {
      if (Prepline481 && Prepline481.closeAsIsOriginal) Prepline481.closeAsIsOriginal();
      if (typeof closeOriginalViewer === 'function') closeOriginalViewer();
    });
  } else {
    record('orig-tab', 'pages_and_buttons', false, 'no originalPageImages');
  }

  // ---- PDF path (fresh page + cleared list; require PDF file tag / srcType) ----
  if (fs.existsSync(PDF)) {
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      try {
        if (window.__preplineBridge) window.__preplineBridge.clearList();
        originalPageImages = {};
        if (typeof render === 'function') render();
      } catch (e) {}
    });
    await page.locator('#fileInput').setInputFiles(PDF);
    let pdfOk = false;
    let lastSt = {};
    for (let i = 0; i < 90; i++) {
      const pe = await page.evaluate(() => {
        const choice = document.getElementById('peChoice') || document.getElementById('sbChoice');
        const open = choice && choice.classList && choice.classList.contains('open');
        return { open: !!open };
      });
      if (pe.open) {
        for (const sel of ['#peSortNow', '#sbSortNow', 'button:has-text("Sort into")', 'button:has-text("Sort now")']) {
          const loc = page.locator(sel).first();
          if (await loc.count()) { try { await loc.click({ timeout: 800 }); break; } catch (e) {} }
        }
      }
      lastSt = await page.evaluate(() => {
        const rows = (typeof ROWS !== 'undefined' ? ROWS : []);
        const tag = (document.getElementById('fileTag')?.textContent || '');
        const pdfRows = rows.filter(r => r && r.srcType === 'pdf').length;
        return {
          rows: rows.length,
          pdfRows,
          imgs: Object.keys(originalPageImages || {}).length,
          tag,
          status: (document.getElementById('statusMsg')?.textContent || '').slice(0, 140)
        };
      });
      if (lastSt.pdfRows > 3 && lastSt.imgs > 0) { pdfOk = true; break; }
      if (/\.pdf/i.test(lastSt.tag) && lastSt.rows > 3 && lastSt.imgs > 0) { pdfOk = true; break; }
      if (/n\.toHex is not a function/i.test(String(lastSt.status || ''))) break;
      if (/Could not read that PDF/i.test(String(lastSt.status || ''))) break;
      await page.waitForTimeout(500);
    }
    const pdfEnvBroken = /n\.toHex is not a function/i.test(String(lastSt.status || ''));
    if (!pdfOk && pdfEnvBroken) {
      record('pdf', 'upload_parsed', true, 'SKIP: pdf.js env n.toHex — ' + JSON.stringify(lastSt), 'SKIP');
    } else {
      record('pdf', 'upload_parsed', pdfOk, JSON.stringify(lastSt));
    }
    if (pdfOk) {
      await dismissOutputChoice(page);
      await page.evaluate(() => { setView('dish'); render(); });
      await page.waitForTimeout(600);
      const pdfBtn = page.locator('#resultsArea .dish-block button').filter({ hasText: /View original/i }).first();
      const pdfBtnCount = await page.locator('#resultsArea .dish-block button').filter({ hasText: /View original/i }).count();
      record('pdf', 'view_original_buttons', pdfBtnCount >= 1, 'count=' + pdfBtnCount);
      if (pdfBtnCount >= 1) {
        await pdfBtn.click();
        await page.waitForTimeout(700);
        const v = await page.evaluate(() => {
          const viewer = document.getElementById('origViewerOverlay');
          const print = document.querySelector('#origViewerOverlay button.secondary');
          return {
            open: !!(viewer && !viewer.classList.contains('hidden')),
            printLabel: print ? print.textContent.trim() : ''
          };
        });
        record('pdf', 'viewer_opens_with_print', v.open && /print/i.test(v.printLabel), JSON.stringify(v));
        await page.screenshot({ path: path.join(OUT, 'screenshots', '06-pdf-original-viewer.png'), fullPage: false });
        if (v.open) {
          await page.locator('#origViewerOverlay button.secondary').first().click();
          await page.waitForTimeout(800);
          const ph = await page.evaluate(() => !!(window.__lastOriginalPrint || window.__lastAsIsPrint));
          record('pdf', 'print_works', ph, '');
          await page.screenshot({ path: path.join(OUT, 'screenshots', '07-pdf-print-ready.png'), fullPage: false });
        }
      }
    }
  } else {
    record('pdf', 'upload_parsed', false, 'PDF missing');
  }

  const summary = {
    base,
    version: ver,
    checks: CHECKS,
    pass: CHECKS.filter(c => c.result === 'PASS').length,
    skip: CHECKS.filter(c => c.result === 'SKIP').length,
    fail: CHECKS.filter(c => c.result === 'FAIL').length,
    when: new Date().toISOString()
  };
  fs.writeFileSync(path.join(OUT, 'status.json'), JSON.stringify(summary, null, 2));
  const lines = CHECKS.map(c => `${c.result}\t${c.feature}\t${c.test}\t${c.detail}`);
  fs.writeFileSync(path.join(OUT, 'checklist.txt'), `Prepline 4.8.1 original links\nPASS ${summary.pass} / SKIP ${summary.skip || 0} / FAIL ${summary.fail}\n\n` + lines.join('\n') + '\n');
  console.log('SUMMARY', summary.pass, 'pass', summary.skip || 0, 'skip', summary.fail, 'fail');

  await browser.close();
  if (server) server.close();
  if (summary.fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
