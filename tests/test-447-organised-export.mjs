/**
 * Prepline 4.4.7 — Organised export on Paula live (Sorted layout + A–Z sort).
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_447_OUT || '/workspace/share/prepline-447';
const PORT = 8847 + Math.floor(Math.random() * 50);
const SOURCE = process.env.PAULA_SOURCE || (
  fs.existsSync('/workspace/paula-2026-10-30/For-Sorter-stripped.xlsx')
    ? '/workspace/paula-2026-10-30/For-Sorter-stripped.xlsx'
    : '/workspace/paula-2026-10-30/WE 15.11.26 For Sorter.xlsx'
);

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
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });

  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => typeof XLSX !== 'undefined' && window.PreplineOrganisedExport && typeof exportOrganisedXlsx447 === 'function',
    null, { timeout: 60000 }
  );
  const ver = await page.evaluate(() => document.querySelector('meta[name="prepline-version"]')?.content || '');
  console.log('version meta:', ver);
  console.log('SOURCE', SOURCE);
  if (ver !== '4.4.7') throw new Error('expected version 4.4.7 got ' + ver);

  await page.waitForFunction(() => !!(window.handleFile && window.handleFile.__sb), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('#fileInput').setInputFiles(SOURCE);

  let sorted = false;
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({
      rows: (typeof ROWS !== 'undefined' ? ROWS : []).length,
      sbOpen: !!(document.getElementById('sbChoice') && document.getElementById('sbChoice').classList.contains('open')),
      status: (document.getElementById('statusMsg')?.textContent || '').slice(0, 140)
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

  // Screenshot showing Organised button
  await page.evaluate(() => { try { window.scrollTo(0, 0); } catch (e) {} });
  const btn = page.locator('button[onclick="exportOrganisedXlsx447()"]');
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, 'screenshots', 'organised-button.png'), fullPage: false });

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
    const rows = (typeof activeRows === 'function' ? activeRows() : ROWS);
    const res = await PreplineOrganisedExport.exportOrganisedXlsx(rows, {}, helpers);
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
  if (exportResult.layout !== 'paula-sorted-az') throw new Error('bad layout ' + exportResult.layout);
  const expectedSheets = ['Sauce, Purees and Gels', 'Vegetables', 'Garnishes, Herbs, Powders, Oils', 'Starch', 'Proteins'];
  for (const s of expectedSheets) {
    if (!(exportResult.sheets || []).includes(s)) throw new Error('missing sheet ' + s);
  }
  const outXlsx = path.join(OUT, 'organised-export-447.xlsx');
  fs.writeFileSync(outXlsx, Buffer.from(exportResult.b64, 'base64'));
  console.log('wrote', outXlsx, fs.statSync(outXlsx).size);

  await browser.close();
  server.close();
  console.log('DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });
