/**
 * Prepline 4.7.9 — Print/export original (as-is) includes dish photos in print + xlsx.
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_479_OUT || '/workspace/share/prepline-479';
const PORT = 8879 + Math.floor(Math.random() * 40);
const SOURCE = '/workspace/paula-2026-10-30/WE 15.11.26 For Sorter.xlsx';

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
  if (!fs.existsSync(SOURCE)) throw new Error('missing ' + SOURCE);
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.Prepline476 && window.Prepline479 && typeof attachXlsxDishPhotos === 'function',
    null, { timeout: 60000 }
  );
  const ver = await page.evaluate(() => document.querySelector('meta[name="prepline-version"]')?.content || '');
  console.log('version', ver);
  if (!String(ver).startsWith('4.7.9')) throw new Error('bad version ' + ver);

  await page.waitForFunction(() => !!(window.handleFile && window.handleFile.__sb), null, { timeout: 20000 }).catch(() => {});
  await page.locator('#fileInput').setInputFiles(SOURCE);

  let sorted = false;
  for (let i = 0; i < 100; i++) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({
      rows: (typeof ROWS !== 'undefined' ? ROWS : []).length,
      sbOpen: !!(document.getElementById('sbChoice') && document.getElementById('sbChoice').classList.contains('open')),
      photos: Object.keys(typeof originalPageImages === 'object' && originalPageImages ? originalPageImages : {}).length,
      status: (document.getElementById('statusMsg')?.textContent || '').slice(0, 140)
    }));
    if (st.sbOpen) {
      console.log('Sort now');
      await page.locator('#sbSortNow').click();
      await page.waitForTimeout(800);
      continue;
    }
    if (st.rows > 50) {
      // wait a bit more for photo attach (async after processWorkbook)
      if (st.photos > 0 || i > 40) {
        sorted = true;
        console.log('parsed', st);
        break;
      }
    }
    if (i % 10 === 9) console.log('waiting…', st);
  }
  if (!sorted) throw new Error('upload failed');

  // Give attachXlsxDishPhotos time
  for (let i = 0; i < 20; i++) {
    const n = await page.evaluate(() => Object.keys(originalPageImages || {}).length);
    if (n >= 10) { console.log('photos attached', n); break; }
    await page.waitForTimeout(400);
  }

  const photoInfo = await page.evaluate(() => {
    const keys = Object.keys(originalPageImages || {});
    const withUrl = keys.filter(k => (originalPageImages[k] || []).some(e => e && e.dataUrl));
    return { keys: keys.length, withUrl: withUrl.length, sample: withUrl.slice(0, 5) };
  });
  console.log('photoInfo', photoInfo);
  if (photoInfo.withUrl < 5) throw new Error('expected dish photos from For Sorter, got ' + photoInfo.withUrl);

  // Open print as-is preview
  await page.evaluate(() => {
    const oc = document.getElementById('outputChoice');
    if (oc) { oc.hidden = false; }
  });
  // Call printAsIs directly
  await page.evaluate(() => { if (typeof printAsIs === 'function') printAsIs('upload'); });
  await page.waitForTimeout(800);
  await page.waitForSelector('#asisView:not([hidden])', { timeout: 10000 });

  const asisStats = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('#asisView .asis-photo img')];
    const pages = document.querySelectorAll('#asisView .asis-page').length;
    const xlsxBtn = !!document.getElementById('asisXlsxBtn');
    return {
      pages,
      photoBlocks: imgs.length,
      xlsxBtn,
      firstAlt: imgs[0] ? (imgs[0].getAttribute('alt') || '') : '',
      firstSrcLen: imgs[0] ? (imgs[0].src || '').length : 0
    };
  });
  console.log('asisStats', asisStats);
  if (!asisStats.xlsxBtn) throw new Error('Download xlsx button missing on as-is bar');
  if (asisStats.photoBlocks < 5) throw new Error('expected photo blocks in print view');

  // Screenshot a dish with photo
  await page.locator('#asisView .asis-photo img').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'screenshots', 'asis-with-photo.png'), fullPage: false });

  // Export xlsx with photos via evaluate (returnBuffer path — call build directly)
  const exportResult = await page.evaluate(async () => {
    const dishes = asIsModelFromRows();
    const sheetByDish = {};
    ROWS.forEach(r => { if (r && r.dish && r.srcSheet && !sheetByDish[r.dish]) sheetByDish[r.dish] = r.srcSheet; });
    dishes.forEach(d => { if (!d.srcSheet && sheetByDish[d.name]) d.srcSheet = sheetByDish[d.name]; });
    const result = await buildAsIsXlsxWithPhotos(dishes);
    const u8 = result.buffer instanceof ArrayBuffer ? new Uint8Array(result.buffer)
      : (result.buffer instanceof Uint8Array ? result.buffer : new Uint8Array(result.buffer));
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    return { sheets: result.sheets, photos: result.photos, b64: btoa(s), nDishes: dishes.length };
  });
  console.log('export', { sheets: exportResult.sheets, photos: exportResult.photos, nDishes: exportResult.nDishes, b64len: exportResult.b64.length });
  if (exportResult.photos < 5) throw new Error('xlsx embedded too few photos: ' + exportResult.photos);

  const outXlsx = path.join(OUT, 'original-with-photos-479.xlsx');
  fs.writeFileSync(outXlsx, Buffer.from(exportResult.b64, 'base64'));
  console.log('wrote', outXlsx, fs.statSync(outXlsx).size);

  // Verify media in zip
  const chk = spawnSync('python3', ['-c', `
import zipfile
z=zipfile.ZipFile(${JSON.stringify(outXlsx)})
media=[n for n in z.namelist() if n.startswith('xl/media/')]
print('media', len(media))
print('\\n'.join(media[:20]))
assert len(media) >= 5, media
`], { encoding: 'utf8' });
  console.log(chk.stdout);
  if (chk.status !== 0) { console.error(chk.stderr); throw new Error('media check failed'); }

  // Close as-is, open Original PTs if available
  await page.evaluate(() => {
    const b = document.getElementById('asisCloseBtn');
    if (b) b.click();
  });
  await page.waitForTimeout(300);
  const hasOrig = await page.evaluate(() => Object.keys(originalPageImages || {}).length > 0);
  if (hasOrig) {
    await page.evaluate(() => { if (typeof setView === 'function') setView('orig'); });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'screenshots', 'original-pts-tab.png'), fullPage: false });
  }

  fs.writeFileSync(path.join(OUT, 'status.json'), JSON.stringify({
    version: ver,
    photoInfo,
    asisStats,
    export: { sheets: exportResult.sheets, photos: exportResult.photos, path: outXlsx }
  }, null, 2));

  await browser.close();
  server.close();
  console.log('DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });
