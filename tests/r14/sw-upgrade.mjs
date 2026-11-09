// r14: fresh + returning (SW cache) + upgrade from a cached r13 build. Served under /preplist-sorter/.
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { chromium } from 'playwright';
const NEW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OLD = process.env.OLD || '/tmp/r13wt';
const VW = +(process.env.VW || 1366);
const OUT = '/workspace/share/prepline-r14-shots/sw-' + VW; fs.mkdirSync(OUT, { recursive: true });
let ROOT = OLD;
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json','.ico':'image/x-icon' };
const server = http.createServer((q,r)=>{ let u=decodeURIComponent(q.url.split('?')[0]); if(!u.startsWith('/preplist-sorter/')){r.writeHead(404);r.end();return;} u=u.slice('/preplist-sorter'.length); if(u.endsWith('/'))u+='index.html'; const fp=path.join(ROOT,u); if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){r.writeHead(404);r.end();return;} r.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream','Cache-Control':'no-cache'}); fs.createReadStream(fp).pipe(r); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const URL_ = `http://127.0.0.1:${server.address().port}/preplist-sorter/`;
let pass=0, fail=0; const ck=(n,c,d)=>{ c?pass++:fail++; console.log(c?'[PASS]':'[FAIL]', n, d||''); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: VW < 600 ? { width: VW, height: 844 } : { width: VW, height: 900 }, isMobile: VW < 600 });
const p = await ctx.newPage();
const ver = () => p.evaluate(() => document.querySelector('meta[name="prepline-version"]').content);
const ready = () => p.waitForFunction(() => window.__preplineBridge && document.readyState === 'complete', null, { timeout: 60000 });
// 1) returning user on cached r13 with stored uploads
await p.goto(URL_); await ready();
await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(()=>{});
await p.reload(); await ready();
await p.evaluate(() => { localStorage.setItem('preplistDishDatabase_v1', JSON.stringify({ 'Old Dish': { items: [{ task: 'Old carrot', qty: 1, unit: 'kg', section: 'Vegetables' }] } })); localStorage.setItem('prepline.pos.v1', '[{"req":"OLD","items":[]}]'); });
ck('r13 cached + SW controlling', (await ver()) === '4.8.35-r13' && await p.evaluate(() => !!navigator.serviceWorker.controller));
// 2) deploy r14 → reload (SW heal / skipWaiting must land r14)
ROOT = NEW;
await p.reload(); await ready();
for (let i = 0; i < 20 && (await ver().catch(()=>'')) !== '4.8.35-r14'; i++) { await p.waitForTimeout(1000); }
await p.waitForTimeout(2500); await ready();
ck('upgraded to r14 after deploy', (await ver()) === '4.8.35-r14', await ver());
const st = await p.evaluate(() => ({ ls: Object.keys(localStorage), rows: __preplineBridge.getRows().length, toggle: !!document.getElementById('toolModeToggle'), loaderOn: window.PreplineUiR14 && PreplineUiR14.isOn() }));
ck('old recipe DB + POs cleared on upgrade', !st.ls.includes('preplistDishDatabase_v1') && !st.ls.includes('prepline.pos.v1'), st.ls.join(','));
ck('no recipe DB UI after upgrade', !st.toggle && st.rows === 0);
await p.waitForFunction(() => window.PreplineUiR14 && !PreplineUiR14.isOn(), null, { timeout: 20000 }).catch(()=>{});
ck('loader cleared after upgrade load', await p.evaluate(() => !PreplineUiR14.isOn()));
// 3) returning visit on r14 (served by SW cache) + offline
await p.reload(); await ready();
ck('returning visit r14', (await ver()) === '4.8.35-r14');
const cached = await p.evaluate(async () => { const ks = await caches.keys(); const k = ks.find(x => /4\.8\.35-r14/.test(x)); if (!k) return { ks }; const c = await caches.open(k); const reqs = (await c.keys()).map(r => r.url.split('/').pop()); return { k, has: ['session-only.js', 'ui-r14.js'].map(f => reqs.includes(f)) }; });
ck('SW cache has r14 + new files', cached.k && cached.has.every(Boolean), JSON.stringify(cached));
await ctx.setOffline(true);
await p.reload(); await ready().catch(()=>{});
ck('offline (SW) load still r14', (await ver().catch(()=>'')) === '4.8.35-r14');
await p.waitForFunction(() => window.PreplineUiR14 && !PreplineUiR14.isOn(), null, { timeout: 20000 }).catch(()=>{});
await p.screenshot({ path: path.join(OUT, 'returning-offline.png') });
await ctx.setOffline(false);
const F='/workspace/private-po-test/';
await p.setInputFiles('#fileInput', [F+'PT-02b85e7b.pdf', F+'PO-a9fcd00e.pdf']);
await p.waitForFunction(() => __preplineBridge.getRows().length > 5, null, { timeout: 120000 });
ck('returning visit: upload + sort works', true);
await b.close(); server.close(); console.log('RESULT', pass, '/', pass+fail); if (fail) process.exit(1);
