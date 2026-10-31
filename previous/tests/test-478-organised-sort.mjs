/**
 * Prepline 4.7.8 — Organised export: Paula layout + A–Z sort + tab heuristics.
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_478_OUT || '/workspace/share/prepline-478';
const PORT = 8790 + Math.floor(Math.random() * 100);
const SOURCE = process.env.PAULA_SOURCE || (fs.existsSync('/workspace/paula-2026-10-30/For-Sorter-stripped.xlsx') ? '/workspace/paula-2026-10-30/For-Sorter-stripped.xlsx' : '/workspace/paula-2026-10-30/WE 15.11.26 For Sorter.xlsx');
const TARGET = process.env.PAULA_TARGET || '/workspace/paula-2026-10-30/WE 15.11.26 Sorted.xlsx';

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });

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
  if (!fs.existsSync(SOURCE)) throw new Error('missing source ' + SOURCE);
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('prepline.account.v2', JSON.stringify({ token: 'test-478' }));
    localStorage.setItem('prepline.signup.v1', JSON.stringify({ d: '2026-10-30', via: 'test' }));
  });
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.includes('script.google.com') || u.includes('macros/s/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'unlimited', token: 'test-478' }) });
      return;
    }
    await route.continue();
  });

  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => typeof XLSX !== 'undefined' && window.PreplineUpgrades47 && window.Prepline477 && window.Prepline478,
    null, { timeout: 60000 }
  );
  const ver = await page.evaluate(() => document.querySelector('meta[name="prepline-version"]')?.content || '');
  console.log('version meta:', ver);
  console.log('SOURCE', SOURCE);

  // Wait for sheet-builder upload hook (replaces window.handleFile)
  await page.waitForFunction(() => !!(window.handleFile && window.handleFile.__sb), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);

  await page.locator('#fileInput').setInputFiles(SOURCE);

  // Sheet-builder shows Edit / Sort-now choice for xlsx
  let sorted = false;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({
      rows: (typeof ROWS !== "undefined" ? ROWS : []).length,
      sbOpen: !!(document.getElementById('sbChoice') && document.getElementById('sbChoice').classList.contains('open')),
      status: (document.getElementById('statusMsg')?.textContent || '').slice(0, 120)
    }));
    if (st.sbOpen) {
      console.log('sbChoice open — clicking Sort now');
      await page.locator('#sbSortNow').click();
      await page.waitForTimeout(500);
      continue;
    }
    if (st.rows > 50) { sorted = true; console.log('parsed rows:', st.rows, st.status); break; }
    if (i % 10 === 9) console.log('waiting upload…', st);
  }
  if (!sorted) throw new Error('upload did not produce ROWS');

  await page.evaluate(() => {
    const oc = document.getElementById('outputChoice');
    if (oc) { oc.hidden = true; oc.innerHTML = ''; }
  });
  await page.screenshot({ path: path.join(OUT, 'screenshots', 'after-upload.png'), fullPage: false });

  const exportResult = await page.evaluate(async () => {
    const helpers = {
      cleanDishName: typeof cleanDishName === 'function' ? cleanDishName : (d) => d,
      paxByDish: typeof paxByDish !== 'undefined' ? paxByDish : {},
      allergenText: typeof allergenText === 'function' ? allergenText : () => '',
      dayLabel: typeof dayLabel === 'function' ? dayLabel : (d) => d,
      srcName: typeof srcName === 'function' ? srcName : (r) => r.srcSheet || r.dish,
      exportPerPax: typeof exportPerPax === 'function' ? exportPerPax : undefined,
      getEventDay: typeof getEventDay === 'function' ? getEventDay : undefined,
      getEventDateStr: typeof getEventDateStr === 'function' ? getEventDateStr : undefined,
      returnBuffer: true,
      allRows: true
    };
    const res = await PreplineUpgrades47.exportOrganisedXlsx(
      viewRows(),
      typeof batchDeps === 'function' ? batchDeps() : {},
      helpers
    );
    let b64 = '';
    if (res && res.buffer) {
      const u8 = res.buffer instanceof ArrayBuffer ? new Uint8Array(res.buffer)
        : (res.buffer instanceof Uint8Array ? res.buffer : new Uint8Array(res.buffer));
      let s = '';
      const chunk = 0x8000;
      for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
      b64 = btoa(s);
    }
    return { name: res?.name, rows: res?.rows, sheets: res?.sheets, engine: res?.engine, layout: res?.layout, b64 };
  });

  console.log('export:', exportResult.name, exportResult.rows, exportResult.sheets, exportResult.layout, exportResult.engine);
  if (!exportResult.b64) throw new Error('no buffer');
  const outXlsx = path.join(OUT, 'organised-export-478.xlsx');
  fs.writeFileSync(outXlsx, Buffer.from(exportResult.b64, 'base64'));
  console.log('wrote', outXlsx, fs.statSync(outXlsx).size);

  const pr = spawnSync('python3', ['/workspace/share/prepline-478/compare_export.py', OUT, outXlsx, TARGET], { encoding: 'utf8', maxBuffer: 10e6 });
  console.log(pr.stdout);
  if (pr.status !== 0) {
    console.error(pr.stderr);
    throw new Error('compare failed ' + pr.status);
  }

  await browser.close();
  server.close();
  console.log('DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });
