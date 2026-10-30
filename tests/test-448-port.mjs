/**
 * Prepline 4.4.8 — Paula port checks:
 * section toggles, organised Section=tab / cached Total / STAFF blank / A–Z keep,
 * Week/Month/Year calendar + print not blank. NO smart-chef.
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_448_OUT || '/workspace/share/prepline-448';
const PORT = 8848 + Math.floor(Math.random() * 40);
const SHOTS = path.join(OUT, 'screenshots');
const SOURCE = process.env.PAULA_SOURCE
  || '/tmp/paula-448-sample/sample.xlsx'
  || '/workspace/share/prepline-rules/stripped/WE-15.11.26-For-Sorter-stripped.xlsx';

fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(path.join(OUT, 'exports'), { recursive: true });

const CHECKS = [];
function record(name, pass, detail) {
  CHECKS.push({ test: name, result: pass ? 'PASS' : 'FAIL', detail: detail || '' });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (p.endsWith('.png')) return 'image/png';
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
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => typeof XLSX !== 'undefined' && window.PreplineOrganisedExport && window.Prepline448 && window.Prepline486,
    null, { timeout: 60000 }
  );
  const ver = await page.evaluate(() => document.querySelector('meta[name="prepline-version"]')?.content || '');
  record('version-448', ver === '4.4.8', 'meta=' + ver);
  record('no-smart-chef', await page.evaluate(() => !window.Prepline488), 'Prepline488 absent');
  record('hide-team-ops-off', await page.evaluate(() => window.Prepline486 && Prepline486.HIDE_TEAM_OPS === false), '');

  // Load sample without edit-before-sort modal (no rawBytes)
  const tmpName = '_tmp_sample_448.xlsx';
  fs.copyFileSync(SOURCE, path.join(ROOT, tmpName));
  const loaded = await page.evaluate(async (name) => {
    const resp = await fetch('/' + name);
    const ab = await resp.arrayBuffer();
    const data = new Uint8Array(ab);
    const wbObj = XLSX.read(data, { type: 'array', cellDates: false, sheetStubs: false, cellStyles: true });
    handleWorkbookObject(wbObj, 'WE-15.11.26-For-Sorter.xlsx');
    return (typeof ROWS !== 'undefined' ? ROWS : []).length;
  }, tmpName);
  try { fs.unlinkSync(path.join(ROOT, tmpName)); } catch (e) {}
  record('sample-loaded', loaded > 50, 'rows=' + loaded);
  await page.screenshot({ path: path.join(SHOTS, 'after-load.png'), fullPage: false }).catch(() => {});

  if (loaded > 50) {
    // Section toggles
    await page.evaluate(() => { try { setView('section'); } catch (e) {} });
    await page.waitForTimeout(400);
    const toggles = await page.evaluate(() => {
      if (typeof Prepline448 !== 'undefined' && Prepline448.installSectionToggles) {
        try { Prepline448.installSectionToggles(); } catch (e) {}
      }
      if (typeof render === 'function') render();
      const cards = Array.from(document.querySelectorAll('.summary.no-print .sumcard'));
      const hasShowAll = cards.some(c => /^Show all sections$/i.test((c.textContent || '').replace(/\s+/g, ' ').trim()));
      const sections = (typeof SECTIONS !== 'undefined' ? SECTIONS : []);
      const target = sections.find(s => /protein/i.test(s)) || sections[0];
      if (target && typeof setFilter === 'function') setFilter(target);
      if (typeof render === 'function') render();
      const hidden = Prepline448.isSectionHidden(target);
      const offCard = !!document.querySelector('.sumcard.u448-sec-off');
      return { hasShowAll, target, hidden, offCard, cardCount: cards.length };
    });
    record('section-toggles-no-show-all', toggles.hasShowAll === false, JSON.stringify(toggles));
    record('section-toggle-hides', toggles.hidden === true, JSON.stringify(toggles));
    await page.screenshot({ path: path.join(SHOTS, 'section-toggles.png'), fullPage: false }).catch(() => {});

    // Organised export checks
    const exportResult = await page.evaluate(async () => {
      const helpers = {
        cleanDishName: typeof cleanDishName === 'function' ? cleanDishName : (d) => d,
        paxByDish: typeof paxByDish !== 'undefined' ? paxByDish : {},
        allergenText: typeof allergenText === 'function' ? allergenText : () => 'ALLERGEN-SHOULD-NOT-APPEAR',
        dayLabel: typeof dayLabel === 'function' ? dayLabel : (d) => d,
        srcName: typeof srcName === 'function' ? srcName : (r) => r.srcSheet || r.dish,
        exportPerPax: typeof exportPerPax === 'function' ? exportPerPax : undefined,
        getEventDay: typeof getEventDay === 'function' ? getEventDay : undefined,
        getEventDateStr: typeof getEventDateStr === 'function' ? getEventDateStr : undefined,
        returnBuffer: true
      };
      const rows = (typeof activeRows === 'function' ? activeRows() : ROWS);
      const paula = PreplineOrganisedExport.buildPaulaOrganisedRows
        ? PreplineOrganisedExport.buildPaulaOrganisedRows(rows, helpers)
        : null;
      const res = await PreplineOrganisedExport.exportOrganisedXlsx(rows, {}, helpers);
      let b64 = '';
      if (res && res.buffer) {
        const u8 = res.buffer instanceof ArrayBuffer ? new Uint8Array(res.buffer)
          : (res.buffer instanceof Uint8Array ? res.buffer : new Uint8Array(res.buffer));
        let s = '';
        const chunk = 0x8000;
        for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
        b64 = btoa(s);
      }
      // Sort check: dishKey then prep then event then item (A–Z keep) — not prep-first
      let azOk = true;
      if (paula && paula.length > 2) {
        for (let i = 1; i < Math.min(paula.length, 80); i++) {
          const a = paula[i - 1], b = paula[i];
          if (a.dishKey < b.dishKey) continue;
          if (a.dishKey > b.dishKey) { azOk = false; break; }
          if (a.prepSort < b.prepSort) continue;
          if (a.prepSort > b.prepSort) { azOk = false; break; }
        }
      }
      const staffNonBlank = (paula || []).filter(r => r.staff && String(r.staff).trim()).length;
      const sectionMismatch = (paula || []).filter(r => {
        if (r.sheet === 'Other') return false;
        // Section should equal canonical tab label (Garnishes Etc. ok)
        const tabs = {
          'Sauce, Purees and Gels': 'Sauce, Purees and Gels',
          'Vegetables': 'Vegetables',
          'Garnishes, Herbs, Powders, Oils': 'Garnishes, Herbs, Powders, Oils Etc.',
          'Starch': 'Starch',
          'Proteins': 'Proteins'
        };
        const expect = tabs[r.sheet];
        return expect && r.section !== expect;
      }).length;
      return {
        name: res?.name, rows: res?.rows, sheets: res?.sheets, engine: res?.engine, layout: res?.layout, b64,
        azOk, staffNonBlank, sectionMismatch, sample: (paula || []).slice(0, 5).map(r => ({
          item: r.item, section: r.section, sheet: r.sheet, staff: r.staff, dishKey: r.dishKey, prep: r.prepDay
        }))
      };
    });
    record('organised-xlsx', !!(exportResult.b64 && exportResult.rows > 50), 'rows=' + exportResult.rows + ' engine=' + exportResult.engine);
    record('layout-az-kept', exportResult.layout === 'paula-sorted-az', 'layout=' + exportResult.layout);
    record('sort-az-dish-first', exportResult.azOk === true, JSON.stringify(exportResult.sample));
    record('staff-blank', exportResult.staffNonBlank === 0, 'nonBlank=' + exportResult.staffNonBlank);
    record('section-equals-tab', exportResult.sectionMismatch === 0, 'mismatches=' + exportResult.sectionMismatch);
    const outXlsx = path.join(OUT, 'exports', 'WE-15.11.26-organised-448.xlsx');
    if (exportResult.b64) fs.writeFileSync(outXlsx, Buffer.from(exportResult.b64, 'base64'));
    record('xlsx-written', fs.existsSync(outXlsx) && fs.statSync(outXlsx).size > 5000, outXlsx);

    // Inspect Total formula+result via openpyxl in a follow-up; here check ExcelJS path via page if ExcelJS loaded
    // Week calendar
    await page.evaluate(() => { try { setView('week'); } catch (e) {} });
    await page.waitForTimeout(500);
    const cal = await page.evaluate(() => {
      const el = document.getElementById('u486Cal');
      const spans = Array.from(document.querySelectorAll('[data-cal-span]')).map(b => b.getAttribute('data-cal-span'));
      const printBtn = !!document.querySelector('[data-cal-print]');
      return { hasCal: !!el, spans, printBtn, htmlLen: el ? el.innerHTML.length : 0 };
    });
    record('week-calendar', cal.hasCal && cal.htmlLen > 100, JSON.stringify(cal));
    await page.screenshot({ path: path.join(SHOTS, 'week-calendar.png'), fullPage: false }).catch(() => {});

    // Month / Year
    for (const span of ['month', 'year']) {
      await page.evaluate((s) => {
        const b = document.querySelector('[data-cal-span="' + s + '"]');
        if (b) b.click();
      }, span);
      await page.waitForTimeout(300);
      const ok = await page.evaluate((s) => {
        const cal = document.getElementById('u486Cal');
        return !!(cal && cal.getAttribute('data-span') === s && cal.innerHTML.length > 50);
      }, span);
      record('calendar-' + span, ok, '');
      await page.screenshot({ path: path.join(SHOTS, 'calendar-' + span + '.png'), fullPage: false }).catch(() => {});
    }

    // Print calendar: ensure CSS does not blank (check computed print media / CSS rules)
    const printCss = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      let hasBlankBodyStar = false;
      let hasCalPrintVisible = false;
      for (const sh of sheets) {
        let rules;
        try { rules = sh.cssRules || sh.rules; } catch (e) { continue; }
        if (!rules) continue;
        for (const r of rules) {
          const txt = r.cssText || '';
          if (/body\s*\*\s*\{\s*visibility\s*:\s*hidden/i.test(txt) && !/u47-station-print/.test(txt)) hasBlankBodyStar = true;
          if (/u486-cal-print/.test(txt) && /u486Cal|#u486Cal|\.u486-cal/.test(txt)) hasCalPrintVisible = true;
        }
      }
      const styleEl = document.getElementById('u486Css');
      const cssText = styleEl ? styleEl.textContent : '';
      return {
        hasBlankBodyStar,
        hasCalPrintVisible: hasCalPrintVisible || /u486-cal-print/.test(cssText),
        cssHasCal: /#u486Cal|\.u486-cal/.test(cssText)
      };
    });
    record('print-calendar-not-blanked', printCss.hasBlankBodyStar === false && printCss.cssHasCal === true, JSON.stringify(printCss));
  }

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ version: '4.4.8', checks: CHECKS }, null, 2));
  const failed = CHECKS.filter(c => c.result === 'FAIL');
  console.log('\n' + CHECKS.length + ' checks, ' + failed.length + ' failed');
  await browser.close();
  server.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
