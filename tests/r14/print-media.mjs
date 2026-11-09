// r14: print media unchanged — compare page.pdf page count/size for r13 vs r14 after the same upload.
import http from 'http'; import fs from 'fs'; import path from 'path'; import { chromium } from 'playwright';
const roots = { r13: process.env.OLD || '/tmp/r13wt', r14: path.resolve(new URL('../..', import.meta.url).pathname) };
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png' };
const out = {};
for (const [k, ROOT] of Object.entries(roots)) {
  const server = http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';const fp=path.join(ROOT,u);if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(fp)]||'application/octet-stream'});fs.createReadStream(fp).pipe(r);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  await p.goto(`http://127.0.0.1:${server.address().port}/index.html`); await p.waitForFunction(() => window.__preplineBridge && window.pdfjsLib);
  const F='/workspace/private-po-test/'; await p.setInputFiles('#fileInput', [F+'PT-02b85e7b.pdf', F+'PO-a9fcd00e.pdf']);
  await p.waitForFunction(() => __preplineBridge.getRows().length > 5, null, { timeout: 120000 }); await p.waitForTimeout(2500);
  await p.evaluate(() => { try { PreplinePdf.close(); } catch (e) {} });
  await p.emulateMedia({ media: 'print' });
  const vis = await p.evaluate(() => ['plLoader','plActionBar'].map(id => { const e = document.getElementById(id); return id + ':' + (e ? getComputedStyle(e).display : 'absent'); }).concat(['.shell-masthead'].map(s => s + ':' + getComputedStyle(document.querySelector(s)).display)));
  const pdf = await p.pdf({ format: 'A4' }); const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  fs.writeFileSync(`/workspace/share/prepline-r14-shots/print-${k}.pdf`, pdf);
  out[k] = { pages, vis };
  await b.close(); server.close();
}
console.log(JSON.stringify(out));
