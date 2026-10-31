/**
 * Prepline 4.7.7 — Organised export vs Paula's Sorted.xlsx (trial).
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_477_OUT || '/workspace/share/prepline-477';
const PORT = 8790 + Math.floor(Math.random() * 100);
const SOURCE = process.env.PAULA_SOURCE
  || '/home/box/prototypes/_private/paula-organised/WE 15.11.26 For Sorter.xlsx';
const TARGET = process.env.PAULA_TARGET
  || '/home/box/prototypes/_private/paula-organised/WE 15.11.26 Sorted.xlsx';

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js')) return 'application/javascript; charset=utf-8';
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
  if (!fs.existsSync(SOURCE)) throw new Error('missing source ' + SOURCE);
  if (!fs.existsSync(TARGET)) throw new Error('missing target ' + TARGET);

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('prepline.account.v2', JSON.stringify({ token: 'test-477' }));
    localStorage.setItem('prepline.signup.v1', JSON.stringify({ d: '2026-10-30', via: 'test' }));
  });
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.includes('script.google.com') || u.includes('macros/s/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'unlimited', token: 'test-477' })
      });
      return;
    }
    await route.continue();
  });

  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => typeof XLSX !== 'undefined' && window.PreplineUpgrades47 && window.Prepline477,
    null,
    { timeout: 60000 }
  );

  const ver = await page.evaluate(() => document.querySelector('meta[name="prepline-version"]')?.content || '');
  console.log('version meta:', ver);

  const input = await page.$('input[type=file]');
  if (!input) throw new Error('no file input');
  await input.setInputFiles(SOURCE);
  await page.waitForFunction(() => (window.ROWS || []).length > 50, null, { timeout: 180000 });
  const nRows = await page.evaluate(() => ROWS.length);
  console.log('parsed rows:', nRows);

  const exportResult = await page.evaluate(async () => {
    const helpers = {
      cleanDishName: typeof cleanDishName === 'function' ? cleanDishName : (d) => d,
      paxByDish: typeof paxByDish !== 'undefined' ? paxByDish : {},
      allergenText: typeof allergenText === 'function' ? allergenText : () => '',
      dayLabel: typeof dayLabel === 'function' ? dayLabel : (d) => d,
      srcName: typeof srcName === 'function' ? srcName : (r) => r.srcSheet || r.dish,
      exportPerPax: typeof exportPerPax === 'function' ? exportPerPax : undefined,
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
      const u8 = res.buffer instanceof ArrayBuffer
        ? new Uint8Array(res.buffer)
        : (res.buffer instanceof Uint8Array ? res.buffer : new Uint8Array(res.buffer));
      let s = '';
      const chunk = 0x8000;
      for (let i = 0; i < u8.length; i += chunk) {
        s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
      }
      b64 = btoa(s);
    }
    return {
      name: res && res.name,
      rows: res && res.rows,
      sheets: res && res.sheets,
      engine: res && res.engine,
      layout: res && res.layout,
      headers: res && res.headers,
      b64
    };
  });

  console.log('export:', {
    name: exportResult.name,
    rows: exportResult.rows,
    sheets: exportResult.sheets,
    engine: exportResult.engine,
    layout: exportResult.layout
  });
  if (!exportResult.b64) throw new Error('no buffer from export');

  const outXlsx = path.join(OUT, 'organised-export-paula-layout.xlsx');
  fs.writeFileSync(outXlsx, Buffer.from(exportResult.b64, 'base64'));
  console.log('wrote', outXlsx, fs.statSync(outXlsx).size);

  await page.screenshot({ path: path.join(OUT, 'screenshots', 'after-upload.png'), fullPage: false });

  await browser.close();
  server.close();

  const cmpPy = path.join(OUT, '_compare.py');
  fs.writeFileSync(cmpPy, `
import json, sys
from openpyxl import load_workbook
from collections import Counter

ours_path, target_path, out_json = sys.argv[1], sys.argv[2], sys.argv[3]
ours = load_workbook(ours_path, data_only=False)
tgt = load_workbook(target_path, data_only=False)
EXPECTED = [
  'Sauce, Purees and Gels',
  'Vegetables',
  'Garnishes, Herbs, Powders, Oils',
  'Starch',
  'Proteins',
]
report = {
  'ours_sheets': ours.sheetnames,
  'target_sheets': tgt.sheetnames,
  'per_sheet': {},
}

def dump_rows(ws):
    rows = []
    for r in range(3, ws.max_row + 1):
        vals = [ws.cell(r, c).value for c in range(1, 11)]
        if all(v is None or v == '' for v in vals):
            continue
        rows.append(vals)
    return rows

def norm_item(v):
    return str(v or '').strip().lower()

def cell_is_formula(cell):
    if cell.value is None:
        return False
    if getattr(cell, 'data_type', None) == 'f':
        return True
    if isinstance(cell.value, str) and (
        cell.value.startswith('=') or cell.value.startswith('B')
    ):
        return True
    return False

for name in EXPECTED:
    o = ours[name] if name in ours.sheetnames else None
    t = tgt[name] if name in tgt.sheetnames else None
    entry = {'ours_present': bool(o), 'target_present': bool(t)}
    if o:
        entry['ours_title'] = o['A1'].value
        entry['ours_headers'] = [o.cell(2, c).value for c in range(1, 11)]
        entry['ours_merged'] = [str(m) for m in o.merged_cells.ranges]
        entry['ours_autofilter'] = o.auto_filter.ref if o.auto_filter else None
        fg = getattr(o.cell(2, 1).fill.fgColor, 'rgb', None) if o.cell(2, 1).fill else None
        entry['ours_header_yellow'] = (str(fg) == 'FFFFFF00')
        orows = dump_rows(o)
        entry['ours_nrows'] = len(orows)
        entry['ours_total_formulas'] = sum(
            1 for r in range(3, o.max_row + 1) if cell_is_formula(o.cell(r, 5))
        )
        entry['ours_sample'] = [
            [str(x)[:60] if x is not None else None for x in row] for row in orows[:3]
        ]
        staff = [r[9] for r in orows if r[9]]
        entry['ours_staff_nonempty'] = len(staff)
        entry['ours_staff_sample'] = [str(s)[:80] for s in staff[:5]]
        # creator
        entry['creator'] = ours.properties.creator
    if t:
        trows = dump_rows(t)
        entry['target_nrows'] = len(trows)
        entry['target_headers'] = [t.cell(2, c).value for c in range(1, 11)]
        entry['target_title'] = t['A1'].value
    if o and t:
        entry['headers_match'] = entry['ours_headers'] == entry['target_headers']
        entry['title_match'] = entry.get('ours_title') == entry.get('target_title')
        oi = Counter(norm_item(r[0]) for r in dump_rows(o))
        ti = Counter(norm_item(r[0]) for r in dump_rows(t))
        common = sum((oi & ti).values())
        entry['item_overlap_pct'] = round(100.0 * common / (sum(ti.values()) or 1), 1)

        def key(row):
            return (
                norm_item(row[0]),
                str(row[8] or '').strip().lower(),
                str(row[1] or ''),
                str(row[3] or ''),
            )

        ok = set(key(r) for r in dump_rows(o))
        tk = set(key(r) for r in dump_rows(t))
        inter = len(ok & tk)
        entry['matched_keys'] = inter
        entry['row_key_match_pct'] = round(100.0 * inter / (len(tk) or 1), 1)
        entry['ours_only'] = len(ok - tk)
        entry['target_only'] = len(tk - ok)
    report['per_sheet'][name] = entry

matched = sum(report['per_sheet'][n].get('matched_keys', 0) for n in EXPECTED)
target_total = sum(report['per_sheet'][n].get('target_nrows', 0) for n in EXPECTED)
ours_total = sum(report['per_sheet'][n].get('ours_nrows', 0) for n in EXPECTED)
header_ok = all(
    report['per_sheet'][n].get('headers_match')
    for n in EXPECTED
    if report['per_sheet'][n].get('ours_present') and report['per_sheet'][n].get('target_present')
)
yellow_ok = all(
    report['per_sheet'][n].get('ours_header_yellow')
    for n in EXPECTED
    if report['per_sheet'][n].get('ours_present')
)
title_ok = all(
    report['per_sheet'][n].get('title_match')
    for n in EXPECTED
    if report['per_sheet'][n].get('ours_present') and report['per_sheet'][n].get('target_present')
)
sheet_ok = all(n in ours.sheetnames for n in EXPECTED)
f_ok = all(
    report['per_sheet'][n].get('ours_total_formulas', 0)
    >= (report['per_sheet'][n].get('ours_nrows', 0) or 1) * 0.5
    for n in EXPECTED
    if report['per_sheet'][n].get('ours_present')
)
score = 0
if sheet_ok:
    score += 15
if header_ok:
    score += 25
if yellow_ok:
    score += 10
if title_ok:
    score += 10
if f_ok:
    score += 10
score += int(round(30 * (matched / (target_total or 1))))
report['totals'] = {
    'matched_keys': matched,
    'target_rows': target_total,
    'ours_rows': ours_total,
    'row_match_pct': round(100.0 * matched / (target_total or 1), 1),
    'headers_all_match': header_ok,
    'yellow_headers_ok': yellow_ok,
    'sheet_names_ok': sheet_ok,
    'title_ok': title_ok,
    'formulas_ok': f_ok,
    'layout_match_pct': score,
    'creator': ours.properties.creator,
}
with open(out_json, 'w') as f:
    json.dump(report, f, indent=2, default=str)
print(json.dumps(report['totals'], indent=2))
`)

  const cmpPath = path.join(OUT, 'compare.json');
  const pyRes = spawnSync('python3', [cmpPy, outXlsx, TARGET, cmpPath], {
    encoding: 'utf8',
    maxBuffer: 5e6
  });
  console.log(pyRes.stdout);
  if (pyRes.status !== 0) {
    console.error(pyRes.stderr);
    process.exit(1);
  }
  console.log('compare written', cmpPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
