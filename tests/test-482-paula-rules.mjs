/**
 * Prepline 4.8.2 — Organised export vs Paula Sorted samples (3 weeks).
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_RULES_OUT || '/workspace/share/prepline-rules';
const PORT = 8820 + Math.floor(Math.random() * 80);
const PRIVATE = '/home/box/prototypes/_private/paula-samples-2wk';
const STRIPPED = '/workspace/share/prepline-rules/stripped';

const WEEKS = [
  {
    label: 'WE-15.11.26',
    source: path.join(STRIPPED, 'WE-15.11.26-For-Sorter-stripped.xlsx'),
    target: path.join(PRIVATE, 'WE-15.11.26-Sorted.xlsx'),
  },
  {
    label: 'WE-08.11.26',
    source: path.join(STRIPPED, 'WE-08.11.26-For-Sorter-stripped.xlsx'),
    target: path.join(PRIVATE, 'WE-08.11.26-Sorted.xlsx'),
  },
  {
    label: 'WE-01.11.26',
    source: path.join(STRIPPED, 'WE-01.11.26-For-Sorter-stripped.xlsx'),
    target: path.join(PRIVATE, 'WE-01.11.26-Sorted.xlsx'),
  },
];

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

async function uploadAndExport(page, source, label) {
  await page.goto('http://127.0.0.1:' + PORT + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => typeof XLSX !== 'undefined' && window.PreplineUpgrades47 && window.Prepline477 && window.Prepline482,
    null, { timeout: 60000 }
  );
  const ver = await page.evaluate(() => ({
    meta: document.querySelector('meta[name="prepline-version"]')?.content || '',
    p482: !!(window.Prepline482 && Prepline482.VERSION),
  }));
  console.log(label, 'version', ver);

  await page.waitForFunction(() => !!(window.handleFile && window.handleFile.__sb), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(200);

  // Clear prior state
  await page.evaluate(() => {
    try {
      if (typeof ROWS !== 'undefined') ROWS.length = 0;
      if (typeof paxByDish === 'object') Object.keys(paxByDish).forEach(k => delete paxByDish[k]);
    } catch (e) {}
  });

  await page.locator('#fileInput').setInputFiles(source);

  let sorted = false;
  let lastRows = 0;
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({
      rows: (typeof ROWS !== 'undefined' ? ROWS : []).length,
      sbOpen: !!(document.getElementById('sbChoice') && document.getElementById('sbChoice').classList.contains('open')),
      status: (document.getElementById('statusMsg')?.textContent || '').slice(0, 140)
    }));
    lastRows = st.rows;
    if (st.sbOpen) {
      console.log(label, 'sbChoice — Sort now');
      await page.locator('#sbSortNow').click();
      await page.waitForTimeout(400);
      continue;
    }
    if (st.rows > 30) { sorted = true; console.log(label, 'rows', st.rows, st.status); break; }
    if (i % 15 === 14) console.log(label, 'waiting…', st);
  }
  if (!sorted) throw new Error(label + ' upload failed rows=' + lastRows);

  await page.evaluate(() => {
    const oc = document.getElementById('outputChoice');
    if (oc) { oc.hidden = true; oc.innerHTML = ''; }
  });
  await page.screenshot({ path: path.join(OUT, 'screenshots', label + '-after-upload.png'), fullPage: false });

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

  if (!exportResult.b64) throw new Error(label + ' no export buffer');
  const outXlsx = path.join(OUT, 'organised-' + label + '.xlsx');
  fs.writeFileSync(outXlsx, Buffer.from(exportResult.b64, 'base64'));
  console.log(label, 'wrote', outXlsx, fs.statSync(outXlsx).size, 'exportRows', exportResult.rows);
  await page.screenshot({ path: path.join(OUT, 'screenshots', label + '-after-export.png'), fullPage: false });
  return outXlsx;
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('prepline.account.v2', JSON.stringify({ token: 'test-482' }));
    localStorage.setItem('prepline.signup.v1', JSON.stringify({ d: '2026-10-31', via: 'test' }));
  });
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.includes('script.google.com') || u.includes('macros/s/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'unlimited', token: 'test-482' }) });
      return;
    }
    await route.continue();
  });

  const summary = [];
  for (const w of WEEKS) {
    if (!fs.existsSync(w.source)) throw new Error('missing ' + w.source);
    if (!fs.existsSync(w.target)) throw new Error('missing ' + w.target);
    const outXlsx = await uploadAndExport(page, w.source, w.label);
    const pr = spawnSync('python3', [
      '/workspace/share/prepline-rules/compare_export.py', OUT, outXlsx, w.target, w.label
    ], { encoding: 'utf8', maxBuffer: 10e6 });
    console.log(pr.stdout);
    if (pr.status !== 0) {
      console.error(pr.stderr);
      throw new Error('compare failed ' + w.label + ' ' + pr.status);
    }
    const cmp = JSON.parse(fs.readFileSync(path.join(OUT, 'compare-' + w.label + '.json'), 'utf8'));
    summary.push({ label: w.label, global: cmp.global, per_sheet: Object.fromEntries(Object.entries(cmp.per_sheet).map(([k, v]) => [k, v.match_pct])) });
  }

  fs.writeFileSync(path.join(OUT, 'SUMMARY.json'), JSON.stringify(summary, null, 2));
  const lines = summary.map(s => `${s.label}: row_match ${s.global.row_match_pct}% sheet_agree ${s.global.sheet_agree_pct}% cols ${s.global.column_coverage_pct}% (her ${s.global.her_total} / our ${s.global.our_total})`);
  fs.writeFileSync(path.join(OUT, 'SUMMARY.txt'), 'Prepline 4.8.2 organised export vs Paula Sorted\n' + lines.join('\n') + '\n');
  console.log(lines.join('\n'));

  await browser.close();
  server.close();
  console.log('DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });
