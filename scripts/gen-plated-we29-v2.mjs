/**
 * Generate Plated STEP2 + STEP3 for WE 29/11/2026 (v2): notes/pax rules + photo inject.
 * Local only — does not publish.
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_OUT || '/workspace/share/prepline-4828-plated';
const WO = '/home/box/prototypes/_private/plated-wo/plated-work-order.xlsx';
const MASTERS = [
  '/home/box/prototypes/_private/plated-master/plated-mains-2026-master.xlsx',
  '/home/box/prototypes/_private/plated-master/plated-entrees-2026-master.xlsx'
];
const DATE_FROM = '2026-11-23';
const DATE_TO = '2026-11-29';
const WEEK_ENDING = '2026-11-29';
const VERSION_TAG = 'v2';

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'application/octet-stream';
}

function startServer(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let url = decodeURIComponent((req.url || '/').split('?')[0]);
      if (url === '/' ) url = '/index.html';
      if (url === '/allocation' || url === '/allocation/') url = '/allocation/index.html';
      const fp = path.join(ROOT, url.replace(/^\//, ''));
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404); res.end('no ' + url); return;
      }
      res.writeHead(200, { 'Content-Type': contentType(fp), 'Cache-Control': 'no-store' });
      fs.createReadStream(fp).pipe(res);
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function b64(buf) {
  return Buffer.from(buf).toString('base64');
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'v2'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'renders'), { recursive: true });
  const port = 8831 + Math.floor(Math.random() * 40);
  const server = await startServer(port);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('prepline.account.v2', JSON.stringify({ token: 'test-token-v2' }));
    localStorage.setItem('prepline.signup.v1', JSON.stringify({ d: '2026-11-02', via: 'test' }));
  });
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.includes('script.google.com') || u.includes('macros/s/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'unlimited', token: 'test-token-v2' })
      });
      return;
    }
    await route.continue();
  });

  await page.goto(`http://127.0.0.1:${port}/allocation/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(500);

  // Load WO via UI so parseWorkOrder + section detect match production
  await page.setInputFiles('#woFile', WO);
  await page.waitForTimeout(2800);
  const st = await page.locator('#woStatus').innerText();
  console.log('WO status:', st.slice(0, 200));

  // Inject both masters
  for (const mp of MASTERS) {
    const masterB64 = fs.readFileSync(mp).toString('base64');
    const name = path.basename(mp);
    await page.evaluate(async ({ b64, name }) => {
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const wb = XLSX.read(u8.buffer, { cellStyles: true, cellFormula: true });
      const cur = (window.__alloc.masters || []).slice();
      cur.push({ name, wb });
      window.__alloc.setMastersFromBuffers(cur);
    }, { b64: masterB64, name });
  }
  const masterCount = await page.evaluate(() => (window.__alloc.masters || []).length);
  console.log('masters', masterCount);

  const built = await page.evaluate(({ dateFrom, dateTo, weekEnding, versionTag }) => {
    const opts = {
      wo: window.__alloc.lastWo,
      masters: window.__alloc.masters,
      XLSX,
      dateFrom,
      dateTo,
      weekEnding,
      versionTag
    };
    const inv = AllocPrepList.inventoryWeek(opts.wo, opts);
    const jobs = AllocPrepList.jobsFromWO(opts.wo, null, opts);
    const day = AllocPrepList.buildDaySummary(opts);
    const prep = AllocPrepList.buildPrepList(opts);
    const dayBuf = XLSX.write(day.workbook, { type: 'array', bookType: 'xlsx' });
    const prepBuf = XLSX.write(prep.workbook, { type: 'array', bookType: 'xlsx' });
    const toB64 = (arr) => {
      let s = '';
      const u8 = new Uint8Array(arr);
      const chunk = 0x8000;
      for (let i = 0; i < u8.length; i += chunk) {
        s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
      }
      return btoa(s);
    };
    return {
      inventory: inv,
      jobs: jobs.jobs,
      skipped: jobs.skipped,
      dayName: day.fileName,
      prepName: prep.fileName,
      dayB64: toB64(dayBuf),
      prepB64: toB64(prepBuf),
      matched: prep.matched,
      unmatched: prep.unmatched,
      formulaErrors: prep.formulaErrors,
      dayRows: day.rows
    };
  }, { dateFrom: DATE_FROM, dateTo: DATE_TO, weekEnding: WEEK_ENDING, versionTag: VERSION_TAG });

  const dayPath = path.join(OUT, built.dayName);
  const prepRawPath = path.join(OUT, 'v2', 'prep-raw-' + built.prepName);
  const prepFinalPath = path.join(OUT, built.prepName);
  fs.writeFileSync(dayPath, Buffer.from(built.dayB64, 'base64'));
  fs.writeFileSync(prepRawPath, Buffer.from(built.prepB64, 'base64'));

  // Attach photo fallbacks (e.g. Cod Main empty drawing → 2026 Cod entree photo)
  const aliasBySheet = {};
  for (const a of (await page.evaluate(() => AllocPrepList.ALIASES.map((x) => ({ sheet: x.sheet, altSheets: x.altSheets || [] }))))) {
    const sheets = [a.sheet, ...(a.altSheets || [])].filter(Boolean);
    for (const s of sheets) aliasBySheet[s] = sheets;
  }
  for (const m of built.matched) {
    m.altSheets = (aliasBySheet[m.master] || []).filter((s) => s !== m.master);
    m.photoFallbacks = m.altSheets.slice();
  }

  const mapPath = path.join(OUT, 'v2', 'matched-mapping.json');
  fs.writeFileSync(mapPath, JSON.stringify({ matched: built.matched, unmatched: built.unmatched, inventory: built.inventory, jobs: built.jobs, skipped: built.skipped, dayRows: built.dayRows, formulaErrors: built.formulaErrors }, null, 2));

  // Inject photos + print setup
  const inj = spawnSync(
    'python3',
    [
      path.join(ROOT, 'scripts/inject-prep-photos.py'),
      '--input', prepRawPath,
      '--output', prepFinalPath,
      '--mapping', mapPath,
      ...MASTERS.flatMap((m) => ['--master', m])
    ],
    { encoding: 'utf8' }
  );
  console.log('inject stdout', inj.stdout.slice(0, 2000));
  if (inj.status !== 0) {
    console.error(inj.stderr);
    throw new Error('photo inject failed');
  }
  const injectReport = JSON.parse(inj.stdout);

  // Also copy into v2 folder with explicit names
  fs.copyFileSync(dayPath, path.join(OUT, 'v2', built.dayName));
  fs.copyFileSync(prepFinalPath, path.join(OUT, 'v2', built.prepName));

  const report = {
    week: 'Mon 23 Nov – Sun 29 Nov 2026 (WE 29/11/2026)',
    versionTag: VERSION_TAG,
    step2: dayPath,
    step3: prepFinalPath,
    step2Size: fs.statSync(dayPath).size,
    step3Size: fs.statSync(prepFinalPath).size,
    tabs: built.matched.map((m) => m.tab),
    matched: built.matched,
    unmatched: built.unmatched,
    skipped: built.skipped,
    inventory: built.inventory,
    inject: injectReport,
    formulaErrors: built.formulaErrors
  };
  fs.writeFileSync(path.join(OUT, 'trial-we-29.11.2026-v2-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    tabs: report.tabs.length,
    photos: injectReport.photos,
    unmatched: built.unmatched.length,
    day: built.dayName,
    prep: built.prepName
  }, null, 2));

  await browser.close();
  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
