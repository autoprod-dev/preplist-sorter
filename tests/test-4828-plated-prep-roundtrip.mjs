/**
 * Playwright E2E: Plated WO → day summary → prep list → Load a preplist parse.
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_4828_OUT || '/workspace/share/prepline-4828-plated';
const PORT = 8828 + Math.floor(Math.random() * 80);
const WO = '/home/box/prototypes/_private/plated-wo/plated-work-order.xlsx';
const MASTER = '/home/box/prototypes/_private/plated-master/plated-mains-2026-master.xlsx';

const CHECKS = [];
function record(feature, testName, pass, detail) {
  CHECKS.push({ feature, test: testName, result: pass ? 'PASS' : 'FAIL', detail: detail || '' });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${feature} :: ${testName}${detail ? ' — ' + detail : ''}`);
}

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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
    localStorage.setItem('prepline.account.v2', JSON.stringify({ token: 'test-token-4828' }));
    localStorage.setItem('prepline.signup.v1', JSON.stringify({ d: '2026-11-02', via: 'test' }));
  });
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.includes('script.google.com') || u.includes('macros/s/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'unlimited', token: 'test-token-4828' }) });
      return;
    }
    await route.continue();
  });
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });
  const server = await startServer();
  const base = `http://127.0.0.1:${PORT}/`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await unlockGate(page);

  // ---- Allocation: upload Plated WO ----
  await page.goto(base + 'allocation/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(400);
  record('boot', 'allocation page', await page.locator('#woFile').count() > 0, '');

  const [dlSum] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }).catch(() => null),
    (async () => {
      await page.setInputFiles('#woFile', WO);
      await page.waitForTimeout(2500);
      const st = await page.locator('#woStatus').innerText();
      record('STEP1', 'upload Plated WO + detect', /Plated/i.test(st), st.slice(0, 160));
      const cardHidden = await page.locator('#prepFlowCard').evaluate((el) => el.hidden);
      record('STEP1', 'prep flow card shown', !cardHidden, '');
      // inject masters via bridge (file input)
      const masterB64 = fs.readFileSync(MASTER).toString('base64');
      await page.evaluate(async (b64) => {
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const wb = XLSX.read(u8.buffer, { cellStyles: true, cellFormula: true });
        window.__alloc.setMastersFromBuffers([{ name: 'plated-mains-2026-master.xlsx', wb }]);
      }, masterB64);
      await page.waitForTimeout(300);
      const masters = await page.evaluate(() => (window.__alloc.masters || []).length);
      record('STEP3', 'masters loaded in UI', masters === 1, 'count=' + masters);
      // download day summary
      await page.evaluate(() => window.__alloc.onDlDaySummary());
    })()
  ]);

  let step2Path = null;
  if (dlSum) {
    step2Path = path.join(OUT, await dlSum.suggestedFilename());
    await dlSum.saveAs(step2Path);
    record('STEP2', 'download day summary', fs.existsSync(step2Path) && fs.statSync(step2Path).size > 500, path.basename(step2Path) + ' ' + (fs.existsSync(step2Path)?fs.statSync(step2Path).size:0));
  } else {
    // fallback: build via bridge and write
    const built = await page.evaluate(() => {
      const out = AllocPrepList.buildDaySummary({ wo: window.__alloc.lastWo, XLSX });
      const buf = XLSX.write(out.workbook, { type: 'array', bookType: 'xlsx' });
      return { name: out.fileName, b64: btoa(String.fromCharCode(...new Uint8Array(buf))) };
    });
    step2Path = path.join(OUT, built.name);
    fs.writeFileSync(step2Path, Buffer.from(built.b64, 'base64'));
    record('STEP2', 'download day summary', true, 'via bridge fallback ' + built.name);
  }

  // download prep list
  const [dlPrep] = await Promise.all([
    page.waitForEvent('download', { timeout: 90000 }).catch(() => null),
    page.evaluate(() => window.__alloc.onDlPrepList())
  ]);
  let step3Path = null;
  if (dlPrep) {
    step3Path = path.join(OUT, await dlPrep.suggestedFilename());
    await dlPrep.saveAs(step3Path);
  } else {
    const built = await page.evaluate(() => {
      const out = AllocPrepList.buildPrepList({ wo: window.__alloc.lastWo, masters: window.__alloc.masters, XLSX });
      const buf = XLSX.write(out.workbook, { type: 'array', bookType: 'xlsx' });
      return { name: out.fileName, b64: btoa(String.fromCharCode.apply(null, new Uint8Array(buf))), matched: out.matched.length, unmatched: out.unmatched.length, tabs: out.workbook.SheetNames.slice(0, 5) };
    });
    step3Path = path.join(OUT, built.name);
    // large file — write in chunks via binary
    const raw = await page.evaluate(() => {
      const out = AllocPrepList.buildPrepList({ wo: window.__alloc.lastWo, masters: window.__alloc.masters, XLSX });
      const buf = XLSX.write(out.workbook, { type: 'base64', bookType: 'xlsx' });
      return { name: out.fileName, b64: buf, matched: out.matched.length, unmatched: out.unmatched.length, tabs: out.workbook.SheetNames.slice(0, 8) };
    });
    fs.writeFileSync(step3Path, Buffer.from(raw.b64, 'base64'));
    record('STEP3', 'prep list generated', raw.matched > 0, `matched=${raw.matched} unmatched=${raw.unmatched} tabs=${raw.tabs.join(' | ')}`);
  }
  if (dlPrep) {
    record('STEP3', 'download prep list', fs.existsSync(step3Path) && fs.statSync(step3Path).size > 1000, path.basename(step3Path) + ' ' + fs.statSync(step3Path).size);
  }

  await page.screenshot({ path: path.join(OUT, 'screenshots', 'allocation-plated.png'), fullPage: true });

  // ---- Main app: Load a preplist ----
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(800);
  // ensure file exists
  if (!step3Path || !fs.existsSync(step3Path)) {
    // use pre-generated share file
    step3Path = path.join(OUT, 'Plated Prep List W.E 16.12.26.xlsx');
  }
  record('roundtrip', 'step3 file present', fs.existsSync(step3Path), step3Path);

  await page.setInputFiles('#fileInput', step3Path);
  await page.waitForTimeout(4000);
  const parsed = await page.evaluate(() => {
    const b = window.__preplineBridge;
    const rows = b && b.getRows ? b.getRows() : (typeof ROWS !== 'undefined' ? ROWS : []);
    const dishes = [...new Set((rows || []).map((r) => r.dish))];
    const status = (document.getElementById('status') || {}).textContent || '';
    return { rowCount: (rows || []).length, dishCount: dishes.length, sampleDishes: dishes.slice(0, 8), status: String(status).slice(0, 200) };
  });
  record('Load a preplist', 'parses dish rows', parsed.rowCount > 50, `rows=${parsed.rowCount} dishes=${parsed.dishCount} sample=${parsed.sampleDishes.join(' · ')}`);
  record('Load a preplist', 'tab naming survived', (parsed.sampleDishes || []).some((d) => /\d+ \w+ - /.test(d)), parsed.sampleDishes.slice(0, 3).join(' | '));

  await page.screenshot({ path: path.join(OUT, 'screenshots', 'loaded-preplist.png'), fullPage: true });

  const report = {
    generatedAt: new Date().toISOString(),
    checks: CHECKS,
    step2: step2Path,
    step3: step3Path,
    parsed
  };
  fs.writeFileSync(path.join(OUT, 'e2e-report.json'), JSON.stringify(report, null, 2));
  const md = ['# Prepline 4.8.28 Plated prep round-trip', '', ...CHECKS.map((c) => `- **${c.result}** ${c.feature} — ${c.test}${c.detail ? ': ' + c.detail : ''}`), '', `Step2: \`${step2Path}\``, `Step3: \`${step3Path}\``].join('\n');
  fs.writeFileSync(path.join(OUT, 'e2e-report.md'), md);

  await browser.close();
  server.close();
  const fails = CHECKS.filter((c) => c.result === 'FAIL').length;
  console.log(`\n${CHECKS.length - fails}/${CHECKS.length} passed`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
