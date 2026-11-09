import http from 'http'; import fs from 'fs'; import path from 'path'; import { chromium } from 'playwright';
const ROOT='/workspace/preplist-sorter-src';
const server=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';const fp=path.join(ROOT,u);if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':fp.endsWith('.js')||fp.endsWith('.mjs')?'text/javascript':fp.endsWith('.html')?'text/html':'application/octet-stream'});fs.createReadStream(fp).pipe(r);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1366,height:900}});
await p.goto(`http://127.0.0.1:${server.address().port}/index.html`); await p.waitForFunction(()=>window.__preplineBridge&&window.pdfjsLib);
const F='/workspace/private-po-test/'; await p.setInputFiles('#fileInput',['PT-02b85e7b.pdf','PO-a9fcd00e.pdf'].map(f=>F+f));
await p.waitForFunction(()=>(__preplineBridge.getRows()||[]).length>5,null,{timeout:120000}); await p.waitForTimeout(2500);
if(process.env.CSSPROBE){const r=await p.evaluate(()=>{const w=document.querySelector("[data-u4840-id=prepSummary]");const b=w.querySelector(".u480-settings-bar");const g=e=>{const c=getComputedStyle(e);return {bg:c.backgroundColor,border:c.border,pad:c.padding,radius:c.borderRadius,sh:c.boxShadow}};return {wrap:g(w),bar:b?g(b):null};});console.log(JSON.stringify(r,null,1));}
const out=await p.evaluate(()=>{ const d=x=>x?(x.tagName+(x.id?'#'+x.id:'')+(x.className&&typeof x.className=='string'?'.'+x.className.trim().split(/\s+/).slice(0,2).join('.'):'')):'-';
 return [...document.querySelectorAll('[data-u4840-id]')].map(w=>{const ch=[];let x=w.parentElement;for(let i=0;i<4&&x;i++){ch.push(d(x));x=x.parentElement;} return w.getAttribute('data-u4840-id')+' :: '+d(w)+' <- '+ch.join(' <- ')+' top='+Math.round(w.getBoundingClientRect().top+scrollY);}).join('\n')+'\nSTEPS '+JSON.stringify(window.__preplineStepList.map(s=>s.n+' '+s.id));});
console.log(out); await b.close(); server.close();
