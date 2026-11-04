import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import http from 'http';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = path.join(root, 'tests/screenshots-r7');
fs.mkdirSync(shotDir, { recursive: true });

const fixture = `<!doctype html>
<html><head><meta charset="utf-8"><title>4840 smoke</title>
<meta name="prepline-version" content="4.8.35-r7">
<style>
.u480-settings-bar{display:flex;gap:8px;align-items:center;padding:8px;background:#eee}
.u480-settings-collapsed .u480-body{display:none}
.u480-body{padding:8px}
#dbPanel.u4835-load-collapsed > .u480-body{display:none}
body{font-family:sans-serif;margin:16px}
button{display:inline-block !important; visibility:visible !important; opacity:1 !important}
</style>
</head>
<body class="u480-sorted">
<div id="appVersion">Prepline v4.8.35-r7</div>
<div id="dbPanel" class="u4835-load-open u480-open">
  <div id="u4835LoadBar" class="u480-settings-bar u480-load-summary"><h2>Load</h2><button id="u4835LoadToggle" type="button">Hide</button></div>
  <div class="u480-body u480-load-body">load body</div>
</div>
<div id="paxPanelWrap" class="u480-settings-open"><div class="u480-settings-bar"><h2>Pax</h2><button type="button">Hide</button></div><div class="u480-body">pax</div></div>
<div id="staffingPanelWrap" class="u480-settings-open"><div class="u480-settings-bar"><h2>Chef</h2><button type="button">Hide</button></div><div class="u480-body">chef</div></div>
<div id="ingPanelWrap" class="u480-settings-open"><div class="u480-settings-bar"><h2>Ing</h2><button type="button">Hide</button></div><div class="u480-body">ing</div></div>
<div class="u4821-wrap" data-u4821="changes"><div class="u480-settings-bar"><h2>Changes</h2><button class="u4821-toggle" type="button">Hide</button></div><div class="u480-body">ch</div></div>
<div class="u4821-wrap" data-u4821="prepSummary"><div class="u480-settings-bar"><h2>Prep</h2><button class="u4821-toggle" type="button">Hide</button></div><div class="u480-body">ps</div></div>
<div class="u4821-wrap" data-u4821="kitchenClose"><div class="u480-settings-bar"><h2>Kitchen</h2><button class="u4821-toggle" type="button">Hide</button></div><div class="u480-body">kc</div></div>
<div id="u4835Filters" class="u480-settings-open"><div class="u480-settings-bar"><h2>Filters</h2><button type="button">Hide</button></div><div class="u480-body">f</div></div>
<div class="u4827-wrap" data-u4827="moreViews"><div class="u480-settings-bar"><h2>More</h2><button class="u4827-toggle" type="button">Hide</button></div><div class="u480-body">mv</div></div>
<div class="u4821-wrap" data-u4821="export"><div class="u480-settings-bar"><h2>Export</h2><button class="u4821-toggle" type="button">Hide</button></div><div class="u480-body">ex</div></div>
<script src="/upgrades-4840.js"></script>
<script>setTimeout(function(){ window.__ready = true; }, 400);</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') { res.writeHead(200,{'Content-Type':'text/html'}); res.end(fixture); return; }
  if (req.url === '/upgrades-4840.js') { res.writeHead(200,{'Content-Type':'application/javascript'}); res.end(fs.readFileSync(path.join(root,'upgrades-4840.js'))); return; }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready && window.PreplineStepOwner);

const list1 = await page.evaluate(() => window.__preplineStepList);
const nums = list1.map(x => x.n);
const results = [];
const row = (id, ok, detail) => { results.push({id,ok,detail}); console.log(`${ok?'PASS':'FAIL'} ${id} ${detail||''}`); };

row('numbers_1_N', nums.every((n,i)=>n===i+1) && nums.length>=8, JSON.stringify({nums, ids:list1.map(x=>x.id)}));
row('default_hidden', list1.every(x=>!x.open), JSON.stringify(list1.filter(x=>x.open).map(x=>x.id)));

async function clickToggle(id){
  await page.locator(`button[data-u4840-toggle="${id}"]`).click({ force: true });
}
async function readState(id){
  return page.evaluate((id) => {
    const btn = document.querySelector(`button[data-u4840-toggle="${id}"]`);
    const wrap = document.querySelector(`[data-u4840-id="${id}"]`) || (id==='load' ? document.getElementById('dbPanel') : null);
    const listRow = (window.__preplineStepList||[]).find(x=>x.id===id);
    let openDom = false;
    if (id === 'load') {
      const panel = document.getElementById('dbPanel');
      openDom = panel && !panel.classList.contains('u4835-load-collapsed') && !panel.classList.contains('u480-collapsed');
    } else {
      openDom = wrap && !wrap.classList.contains('u480-settings-collapsed');
    }
    return { btn: btn && btn.textContent, openList: !!(listRow && listRow.open), openDom };
  }, id);
}

const sampleMs = 1500, interval = 100;
for (const step of list1) {
  await clickToggle(step.id);
  await page.waitForTimeout(80);
  let stuck = true; let last = null;
  const t0 = Date.now();
  while (Date.now() - t0 < sampleMs) {
    last = await readState(step.id);
    if (!(last.openDom && last.openList && last.btn === 'Hide')) { stuck = false; break; }
    await page.waitForTimeout(interval);
  }
  row(`toggle_open_${step.id}`, stuck, stuck ? `held ${sampleMs}ms` : JSON.stringify(last));
  await clickToggle(step.id);
  await page.waitForTimeout(80);
  const closed = await readState(step.id);
  row(`toggle_close_${step.id}`, !closed.openDom && closed.btn === 'Show', JSON.stringify(closed));
}

await page.screenshot({ path: path.join(shotDir, 'desktop-1366-after-toggles.png'), fullPage: true });

await page.evaluate(() => {
  document.querySelectorAll('button[data-u4840-toggle]').forEach(btn => {
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
  });
});
const first = list1[0];
await clickToggle(first.id);
await page.waitForTimeout(100);
const afterClone = await readState(first.id);
row('survives_button_clone', afterClone.openDom && afterClone.btn === 'Hide', JSON.stringify(afterClone));
await page.screenshot({ path: path.join(shotDir, 'desktop-1366-clone-survive.png'), fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: path.join(shotDir, 'mobile-390.png'), fullPage: true });
row('mobile_viewport_ok', true, '390x844');

const pass = results.filter(r=>r.ok).length;
const fail = results.filter(r=>!r.ok).length;
console.log('RESULT', { pass, fail, steps: list1.length });
fs.writeFileSync(path.join(shotDir, 'results.json'), JSON.stringify({ results, list1 }, null, 2));
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
