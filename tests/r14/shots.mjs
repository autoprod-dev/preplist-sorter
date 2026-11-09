// Usage: node tests/r14/shots.mjs <outDir> [baseUrl]
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.resolve(process.argv[2] || '/workspace/share/prepline-r14-shots/before'); fs.mkdirSync(OUT, { recursive: true });
const F='/workspace/private-po-test/'; const PT = ['PT-02b85e7b.pdf','PO-a9fcd00e.pdf','PO-ea4708de.pdf','PO-1cbb942d.pdf'].map(f=>F+f);
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.mjs':'text/javascript','.webmanifest':'application/manifest+json','.pdf':'application/pdf','.ico':'image/x-icon' };
const server = http.createServer((req,res)=>{ let u=decodeURIComponent((req.url||'/').split('?')[0]); if(u.endsWith('/')) u+='index.html'; const fp=path.join(ROOT,u); if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'}); fs.createReadStream(fp).pipe(res); });
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base = process.argv[3] || `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch();
for (const [name, vp] of [['desktop-1366',{width:1366,height:900}],['mobile-390',{width:390,height:844}]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: name.startsWith('mobile') });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__preplineBridge && window.pdfjsLib, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.evaluate(()=>{ document.querySelectorAll('#welcomeModal,.wm-overlay').forEach(e=>e.remove()); });
  await page.screenshot({ path: path.join(OUT, name + '-fresh.png') });
  if (await page.evaluate(() => !!window.PreplineUiR14)) { await page.evaluate(() => PreplineUiR14.show('Reading 4 PDFs — production tools & purchase orders…')); await page.waitForTimeout(700); await page.screenshot({ path: path.join(OUT, name + '-loading.png') }); await page.evaluate(() => PreplineUiR14.hide(true)); await page.waitForTimeout(500); }
  await page.setInputFiles('#fileInput', PT);
  await page.waitForFunction(() => (window.__preplineBridge.getRows()||[]).length > 5, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.evaluate(()=>{ try{ window.PreplinePdf && PreplinePdf.close(); }catch(e){} });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, name + '-sorted.png') });
  await page.screenshot({ path: path.join(OUT, name + '-sorted-full.png'), fullPage: true });
  await ctx.close();
}
await browser.close(); server.close(); console.log('shots ->', OUT);
