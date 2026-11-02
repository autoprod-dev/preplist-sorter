/**
 * Prepline 4.8.7 — Section column always equals organised-export tab.
 * Audits colour/keyword section vs placement across three Paula sample weeks.
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_487_OUT || '/workspace/share/prepline-487';
const LIVE = process.env.PREPLINE_487_LIVE === '1';
const LIVE_BASE = 'https://autoprod-dev.github.io/prepline-trial-preview/';
const PORT = 8870 + Math.floor(Math.random() * 80);
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

function normSec(s) {
  return String(s || '').replace(/\s+Etc\.?$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
function sheetMatchesSec(sheet, sec) {
  const a = normSec(sheet);
  const b = normSec(sec);
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

async function uploadAndExport(page, source, label) {
  const startUrl = LIVE ? (LIVE_BASE + '?t=' + Date.now()) : ('http://127.0.0.1:' + PORT + '/?t=' + Date.now());
  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(
    () => typeof XLSX !== 'undefined' && window.PreplineUpgrades47 && window.Prepline477 && window.Prepline487,
    null, { timeout: 60000 }
  );
  const ver = await page.evaluate(() => ({
    meta: document.querySelector('meta[name="prepline-version"]')?.content || '',
    p477: window.Prepline477?.VERSION,
    p487: window.Prepline487?.VERSION,
  }));
  console.log(label, 'version', ver);
  if (LIVE && label === 'WE-15.11.26') {
    await page.screenshot({ path: path.join(OUT, 'screenshots', '01-live-home.png'), fullPage: true });
  }
  if (!String(ver.meta).includes('4.8.7') || ver.p487 !== '4.8.7') {
    throw new Error(label + ' not on 4.8.7: ' + JSON.stringify(ver));
  }

  await page.waitForFunction(() => !!(window.handleFile && window.handleFile.__sb), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(200);

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
      status: (document.getElementById('statusMsg')?.textContent || '').slice(0, 160)
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

  // Pre-export audit: colour/keyword section vs sheetForItem placement
  const preAudit = await page.evaluate(() => {
    const rows = typeof viewRows === 'function' ? viewRows() : (ROWS || []);
    const build = PreplineUpgrades47.buildPaulaOrganisedRows || Prepline477.buildPaulaOrganisedRows;
    const built = build(rows, {
      cleanDishName: typeof cleanDishName === 'function' ? cleanDishName : (d) => d,
      paxByDish: typeof paxByDish !== 'undefined' ? paxByDish : {},
      allergenText: () => '',
      dayLabel: typeof dayLabel === 'function' ? dayLabel : (d) => d,
      srcName: typeof srcName === 'function' ? srcName : (r) => r.srcSheet || r.dish,
      exportPerPax: typeof exportPerPax === 'function' ? exportPerPax : undefined,
      getEventDay: typeof getEventDay === 'function' ? getEventDay : undefined,
      getEventDateStr: typeof getEventDateStr === 'function' ? getEventDateStr : undefined,
    });
    const mismatches = [];
    built.forEach((r) => {
      const colour = r.colourSection || '';
      const sheet = r.sheet || '';
      const section = r.section || '';
      const colourNorm = String(colour).replace(/\s+Etc\.?$/i, '').trim().toLowerCase();
      const sheetNorm = String(sheet).replace(/\s+Etc\.?$/i, '').trim().toLowerCase();
      const secNorm = String(section).replace(/\s+Etc\.?$/i, '').trim().toLowerCase();
      const colourDiffers = colour && colourNorm !== sheetNorm && !(sheetNorm.startsWith(colourNorm) || colourNorm.startsWith(sheetNorm));
      const sectionMatches = secNorm === sheetNorm || sheetNorm.startsWith(secNorm) || secNorm.startsWith(sheetNorm);
      if (colourDiffers) {
        mismatches.push({
          item: String(r.item || '').slice(0, 90),
          source: String(r.sourceTab || '').slice(0, 40),
          colourSection: colour,
          sheet,
          sectionAfterFix: section,
        });
      }
      if (!sectionMatches) {
        mismatches.push({
          item: String(r.item || '').slice(0, 90),
          source: String(r.sourceTab || '').slice(0, 40),
          FAIL_SECTION_NE_TAB: true,
          section,
          sheet,
        });
      }
    });
    const targets = built.filter((r) => {
      const t = String(r.item || '');
      return /Cashew Cream|Celeriac Puree|Thyme and pepperberry jus|Davidson Plum Ponzu/i.test(t);
    }).map((r) => ({
      item: r.item,
      startsWithCashew: String(r.item || '').startsWith('Cashew Cream'),
      sheet: r.sheet,
      section: r.section,
      colourSection: r.colourSection,
      source: r.sourceTab,
    }));
    return {
      total: built.length,
      colourVsPlacement: mismatches.filter((m) => !m.FAIL_SECTION_NE_TAB).length,
      sectionNeTab: mismatches.filter((m) => m.FAIL_SECTION_NE_TAB).length,
      mismatches: mismatches.slice(0, 80),
      targets,
    };
  });

  fs.writeFileSync(path.join(OUT, 'pre-audit-' + label + '.json'), JSON.stringify(preAudit, null, 2));
  console.log(label, 'preAudit colourVsPlacement', preAudit.colourVsPlacement, 'sectionNeTab', preAudit.sectionNeTab);

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
  return { outXlsx, preAudit };
}

function auditXlsx(xlsxPath, label) {
  const script = path.join(OUT, '_audit_one.py');
  fs.writeFileSync(script, `
import openpyxl, json
wb=openpyxl.load_workbook(${JSON.stringify(xlsxPath)}, data_only=True)
mism=[]; ok=0; samples=[]; cashew=None
def norm(s):
  return str(s or '').replace(' Etc.','').replace(' Etc','').strip().lower()
for sh in wb.sheetnames:
  ws=wb[sh]
  for row in ws.iter_rows(min_row=3, values_only=True):
    item=str(row[0] or '')
    if not item: continue
    sec=str(row[6] or ''); src=str(row[8] or '')
    sn, shn = norm(sec), norm(sh)
    match = sn==shn or sn.startswith(shn) or shn.startswith(sn)
    if match: ok+=1
    else: mism.append({'sheet':sh,'section':sec,'item':item[:90],'source':src[:40]})
    if 'Cashew Cream' in item and 'Duck' in src:
      cashew={'item':item,'section':sec,'sheet':sh,'source':src,'starts_ok':item.startswith('Cashew Cream')}
    if any(x in item for x in ['Cashew Cream','Celeriac Puree','Thyme and pepperberry jus','Davidson Plum Ponzu']):
      samples.append({'sheet':sh,'section':sec,'item':item[:100],'source':src[:40]})
print(json.dumps({'label':${JSON.stringify(label)},'ok':ok,'mismatch':len(mism),'mismatches':mism[:40],'cashew':cashew,'samples':samples}))
`);
  const pr = spawnSync('python3', [script], { encoding: 'utf8', maxBuffer: 5e6 });
  if (pr.status !== 0) throw new Error('audit py failed: ' + pr.stderr);
  return JSON.parse(pr.stdout);
}

function paulaColourVsTab(targetPath, label) {
  const script = path.join(OUT, '_paula_audit.py');
  fs.writeFileSync(script, `
import openpyxl, json
wb=openpyxl.load_workbook(${JSON.stringify(targetPath)}, data_only=True)
mism=[]; ok=0
def norm(s):
  return str(s or '').replace(' Etc.','').replace(' Etc','').strip().lower()
for sh in wb.sheetnames:
  # map Big Jobs -> Starch for agree checks
  sh_cmp = 'Starch' if sh == 'Big Jobs' else sh
  ws=wb[sh]
  for row in ws.iter_rows(min_row=3, values_only=True):
    item=str(row[0] or '')
    if not item or item in ('PAX','Item') or item.startswith('3 ') or item.startswith('2 ') or item.startswith('1 ') or item.startswith('4 ') or item.startswith('5 ') or item.startswith('6 '):
      # skip grouped dish titles loosely
      if item in ('PAX',) or (len(item)<40 and (' IMARC' in item or ' ESA' in item or ' CEO' in item or ' WLS' in item or ' TA' in item or ' SP' in item)):
        continue
    sec=str(row[6] or '')
    if not sec: continue
    sn, shn = norm(sec), norm(sh_cmp)
    match = sn==shn or sn.startswith(shn) or shn.startswith(sn) or (sn=='starch' and sh=='Big Jobs')
    if match: ok+=1
    else: mism.append({'sheet':sh,'section':sec,'item':item[:90]})
print(json.dumps({'label':${JSON.stringify(label)},'ok':ok,'mismatch':len(mism),'sample':mism[:25]}))
`);
  const pr = spawnSync('python3', [script], { encoding: 'utf8' });
  if (pr.status !== 0) throw new Error(pr.stderr);
  return JSON.parse(pr.stdout);
}

async function main() {
  let server = null;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('prepline.account.v2', JSON.stringify({ token: 'test-487' }));
    localStorage.setItem('prepline.signup.v1', JSON.stringify({ d: '2026-10-31', via: 'test' }));
  });
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.includes('script.google.com') || u.includes('macros/s/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'unlimited', token: 'test-487' }) });
      return;
    }
    await route.continue();
  });

  if (!LIVE) server = await startServer();

  // BEFORE numbers from previous LIVE organised exports if present
  const before = {};
  const prevLive = '/workspace/share/prepline-rules/organised-LIVE-WE-15.11.26.xlsx';
  const prevLocal = {
    'WE-15.11.26': '/workspace/share/prepline-rules/organised-WE-15.11.26.xlsx',
    'WE-08.11.26': '/workspace/share/prepline-rules/organised-WE-08.11.26.xlsx',
    'WE-01.11.26': '/workspace/share/prepline-rules/organised-WE-01.11.26.xlsx',
  };
  for (const [lab, pth] of Object.entries(prevLocal)) {
    if (fs.existsSync(pth)) before[lab] = auditXlsx(pth, lab + '-before');
  }
  if (fs.existsSync(prevLive)) before['WE-15.11.26-LIVE'] = auditXlsx(prevLive, 'WE-15.11.26-LIVE-before');

  const summary = { version: '4.8.7', before: {}, after: {}, colourVsPlacement: {}, paulaSortedSectionNeTab: {}, targets: {}, totalNeeded: {} };

  for (const w of WEEKS) {
    if (!fs.existsSync(w.source)) throw new Error('missing ' + w.source);
    const { outXlsx, preAudit } = await uploadAndExport(page, w.source, w.label);
    const after = auditXlsx(outXlsx, w.label + '-after');
    const paula = paulaColourVsTab(w.target, w.label);
    summary.before[w.label] = before[w.label] || null;
    summary.after[w.label] = after;
    summary.colourVsPlacement[w.label] = {
      count: preAudit.colourVsPlacement,
      sectionNeTabAfterFix: preAudit.sectionNeTab,
      sample: preAudit.mismatches.slice(0, 20),
    };
    summary.paulaSortedSectionNeTab[w.label] = paula;
    summary.targets[w.label] = preAudit.targets;
    console.log(w.label, 'AFTER section==tab ok', after.ok, 'mismatch', after.mismatch);
    const totScript = path.join(OUT, '_audit_total.py');
    fs.writeFileSync(totScript, [
      'import openpyxl, json',
      'wb=openpyxl.load_workbook(' + JSON.stringify(outXlsx) + ', data_only=True)',
      'wbF=openpyxl.load_workbook(' + JSON.stringify(outXlsx) + ', data_only=False)',
      'blank=0; filled=0; samples=[]; badprod=0',
      'for sh in wb.sheetnames:',
      '  ws=wb[sh]; wsF=wbF[sh]',
      '  for i in range(3, ws.max_row+1):',
      '    item=ws.cell(i,1).value; qty=ws.cell(i,2).value; pax=ws.cell(i,4).value; tot=ws.cell(i,5).value',
      '    if not item: continue',
      '    fcell=wsF.cell(i,5).value',
      '    qn=qty if isinstance(qty,(int,float)) else None',
      '    pn=pax if isinstance(pax,(int,float)) else None',
      '    if qn is not None and pn is not None:',
      '      if tot is None:',
      '        blank+=1',
      '        if len(samples)<8: samples.append({"sheet":sh,"row":i,"item":str(item)[:60],"qty":qty,"pax":pax,"tot":tot,"f":str(fcell)})',
      '      else:',
      '        filled+=1',
      '        if abs(float(tot)-float(qn)*float(pn))>0.01:',
      '          badprod+=1',
      '          if len(samples)<5: samples.append({"sheet":sh,"row":i,"mismatch_val":True,"tot":tot,"expect":qn*pn,"f":str(fcell)})',
      '        elif len(samples)<2:',
      '          samples.append({"sheet":sh,"row":i,"item":str(item)[:50],"qty":qty,"pax":pax,"tot":tot,"f":str(fcell)})',
      'print(json.dumps({"blank_when_should_have":blank,"filled":filled,"badprod":badprod,"samples":samples}))',
    ].join('\n'));
    const totPr = spawnSync('python3',[totScript],{encoding:'utf8',maxBuffer:5e6});
    if (totPr.status!==0) throw new Error('total audit failed '+totPr.stderr);
    const totAudit = JSON.parse(totPr.stdout);
    console.log(w.label, 'Total needed cached filled', totAudit.filled, 'blank_bug', totAudit.blank_when_should_have, 'sample', totAudit.samples[0]);
    summary.totalNeeded = summary.totalNeeded || {};
    summary.totalNeeded[w.label] = totAudit;
    if (totAudit.blank_when_should_have > 0) throw new Error(w.label+' Total needed missing cached result on '+totAudit.blank_when_should_have+' rows');
    if (totAudit.badprod > 0) throw new Error(w.label+' Total needed wrong product on '+totAudit.badprod+' rows');
    console.log(w.label, 'cashew', after.cashew);
  }

  // Before WE15 mismatch count known from earlier analysis if missing
  if (!summary.before['WE-15.11.26'] && before['WE-15.11.26-LIVE']) {
    summary.before['WE-15.11.26'] = before['WE-15.11.26-LIVE'];
  }

  fs.writeFileSync(path.join(OUT, 'AUDIT.json'), JSON.stringify(summary, null, 2));
  const lines = [
    'Prepline 4.8.7 — Section equals tab',
    '',
    'Root cause: organised export tab overrides (sheetForItem) moved rows (e.g. jus/puree/ponzu→Sauce, oils→Garnishes)',
    'but left the Section column as the colour/keyword classification. So Cashew Cream / Celeriac Puree / Thyme jus',
    'could sit on Sauce while Section said Garnishes; Davidson Plum Ponzu on Sauce while Section said Vegetables/Garnishes.',
    '',
    'Fix: sectionForSheet() — Section text always set from the tab after placement.',
    '',
  ];
  for (const w of WEEKS) {
    const b = summary.before[w.label];
    const a = summary.after[w.label];
    const cvp = summary.colourVsPlacement[w.label];
    lines.push(`${w.label}:`);
    lines.push(`  BEFORE section≠tab: ${b ? b.mismatch : 'n/a'} (of ${(b && (b.ok + b.mismatch)) || '?'})`);
    lines.push(`  AFTER  section≠tab: ${a.mismatch} (of ${a.ok + a.mismatch})`);
    lines.push(`  colour/keyword ≠ placement (still expected when heuristics override): ${cvp.count}`);
    lines.push(`  Paula Sorted section≠tab (her file): ${summary.paulaSortedSectionNeTab[w.label].mismatch}`);
  }
  lines.push('');
  lines.push('WE15 target rows after fix:');
  (summary.targets['WE-15.11.26'] || []).forEach((t) => {
    lines.push(`  [${t.sheet}] Section="${t.section}" colourWas="${t.colourSection}" :: ${String(t.item).slice(0, 70)}`);
  });
  if (summary.after['WE-15.11.26']?.cashew) {
    lines.push('Cashew Cream starts_ok=' + summary.after['WE-15.11.26'].cashew.starts_ok);
  }
  fs.writeFileSync(path.join(OUT, 'SUMMARY.txt'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));

  await browser.close();
  if (server) server.close();

  // Fail if any after mismatch
  for (const w of WEEKS) {
    if (summary.after[w.label].mismatch !== 0) {
      throw new Error(w.label + ' still has section≠tab: ' + summary.after[w.label].mismatch);
    }
    const cashew = summary.after[w.label].cashew;
    if (w.label === 'WE-15.11.26' && (!cashew || !cashew.starts_ok)) {
      throw new Error('Cashew Cream item text truncated or missing');
    }
  }
  console.log('DONE PASS');
}

main().catch((e) => { console.error(e); process.exit(1); });
