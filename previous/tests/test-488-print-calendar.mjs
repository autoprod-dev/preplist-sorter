/**
 * Prepline 4.8.8 — Print calendar must not be blank (Week/Month/Year).
 * Cause fixed: upgrades-47 stationPrintCss had unscoped body *{visibility:hidden}.
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_488_OUT || '/workspace/share/prepline-488';
const PORT = 8880 + Math.floor(Math.random() * 80);
const SHOTS = path.join(OUT, 'screenshots', 'print-calendar');
fs.mkdirSync(SHOTS, { recursive: true });

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

/** Non-white / non-near-white pixel ratio — blank pages are ~0. */
function inkRatio(pngPath) {
  // Use Python PIL if present; else ImageMagick identify; else raw heuristic via file size
  const py = `
from PIL import Image
im = Image.open(${JSON.stringify(pngPath)}).convert('RGB')
px = list(im.getdata())
n = len(px)
ink = sum(1 for r,g,b in px if r < 250 or g < 250 or b < 245)
print(f'{ink/n:.6f} {im.size[0]}x{im.size[1]} {ink}/{n}')
`;
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  if (r.status !== 0) {
    // fallback: file size
    const sz = fs.statSync(pngPath).size;
    return { ratio: sz > 15000 ? 0.05 : 0, detail: 'size=' + sz + ' err=' + (r.stderr || '') };
  }
  const parts = (r.stdout || '').trim().split(/\s+/);
  return { ratio: parseFloat(parts[0]), detail: (r.stdout || '').trim() };
}

async function loadSynthetic(page) {
  await page.evaluate(() => {
    const rows = [
      { dish: 'Gala Dinner', task: 'Dutch carrots / cook', qty: 80, unit: 'g', section: 'Vegetables', day: 'Wednesday', flagged: false, baseCategory: 'Vegetables' },
      { dish: 'Gala Dinner', task: 'Carrot puree', qty: 40, unit: 'g', section: 'Sauce, Purees and Gels', day: 'Tuesday', flagged: false, baseCategory: 'Sauce, Purees and Gels' },
      { dish: 'Gala Dinner', task: 'Duck Breast / SV', qty: 1, unit: 'ea', section: 'Proteins', day: 'Thursday', flagged: false, baseCategory: 'Proteins' },
      { dish: 'Gala Dinner', task: 'Torched Salmon', qty: 1, unit: 'ea', section: 'Proteins', day: 'Friday', flagged: false, baseCategory: 'Proteins' },
      { dish: 'Lunch Service', task: 'Baby carrots SV', qty: 60, unit: 'g', section: 'Vegetables', day: 'Wednesday', flagged: false, baseCategory: 'Vegetables' },
      { dish: 'Lunch Service', task: 'Baby spinach', qty: 40, unit: 'g', section: 'Vegetables', day: 'Thursday', flagged: false, baseCategory: 'Vegetables' },
      { dish: 'Lunch Service', task: 'Pea Puree', qty: 30, unit: 'g', section: 'Sauce, Purees and Gels', day: 'Tuesday', flagged: false, baseCategory: 'Sauce, Purees and Gels' },
      { dish: 'Gala Dinner', task: 'Green oil', qty: 10, unit: 'ml', section: 'Garnishes, Herbs, Powders, Oils Etc.', day: 'Monday', flagged: false, baseCategory: 'Garnishes, Herbs, Powders, Oils Etc.' }
    ];
    ROWS = rows;
    paxByDish = { 'Gala Dinner': 120, 'Lunch Service': 80 };
    eventDayOverride = { 'Gala Dinner': 'Friday', 'Lunch Service': 'Thursday' };
    eventDateByDish = { 'Gala Dinner': '31/10/2026', 'Lunch Service': '30/10/2026' };
    if (typeof render === 'function') render();
  });
}

async function printSpan(page, span) {
  await page.evaluate((sp) => {
    if (window.PreplineUpgrades47 && PreplineUpgrades47.setCalSpan) PreplineUpgrades47.setCalSpan(sp);
    else try { localStorage.setItem('prepline.calSpan.v1', sp); } catch (e) {}
    if (typeof setView === 'function') setView('week');
    else { viewMode = 'week'; render(); }
  }, span);
  await page.waitForTimeout(400);

  // Confirm grid on screen first
  const onScreen = await page.evaluate((sp) => {
    const cal = document.getElementById('u486Cal');
    const sel = sp === 'week' ? '.u486-weekgrid' : sp === 'month' ? '.u486-monthgrid' : '.u486-yeargrid';
    const grid = document.querySelector(sel);
    const chips = document.querySelectorAll('.u486-chip').length;
    return { hasCal: !!cal, hasGrid: !!grid, chips, textLen: (cal && cal.innerText || '').length };
  }, span);
  record(span + '_onscreen_grid', onScreen.hasGrid && onScreen.textLen > 40, JSON.stringify(onScreen));

  // Emulate print media with cal-print class (same as Print calendar button)
  await page.evaluate(() => document.body.classList.add('u486-cal-print'));
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);

  // Check computed visibility of calendar under print CSS
  const vis = await page.evaluate(() => {
    const cal = document.getElementById('u486Cal');
    if (!cal) return { ok: false, reason: 'no cal' };
    const cs = getComputedStyle(cal);
    const chip = document.querySelector('.u486-chip');
    const chipCs = chip ? getComputedStyle(chip) : null;
    // Sample a few descendants
    const hidden = [];
    cal.querySelectorAll('.u486-weekgrid, .u486-monthgrid, .u486-yeargrid, .u486-chip, .u486-daycol, .u486-mcell, .u486-yminimonth').forEach((el) => {
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none') hidden.push(el.className);
    });
    return {
      ok: cs.visibility !== 'hidden' && cs.display !== 'none',
      visibility: cs.visibility,
      display: cs.display,
      hiddenCount: hidden.length,
      hidden: hidden.slice(0, 8),
      chipBg: chipCs ? chipCs.backgroundColor : null,
      stationRuleScoped: !/body\s+\*\s*\{\s*visibility\s*:\s*hidden/i.test(
        (document.getElementById('u47Css') || {}).textContent || ''
      )
    };
  });
  record(span + '_print_visibility', vis.ok && vis.hiddenCount === 0, JSON.stringify(vis));

  const pdfPath = path.join(SHOTS, span + '-print.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    landscape: span === 'week' || span === 'month',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' }
  });

  // Render PDF → PNG
  const prefix = path.join(SHOTS, span + '-print');
  const conv = spawnSync('pdftoppm', ['-png', '-r', '110', '-singlefile', pdfPath, prefix], { encoding: 'utf8' });
  const pngPath = prefix + '.png';
  if (conv.status !== 0 || !fs.existsSync(pngPath)) {
    record(span + '_pdf_to_png', false, (conv.stderr || conv.stdout || 'missing png').slice(0, 200));
  } else {
    const ink = inkRatio(pngPath);
    // Blank page ≈ < 0.5% ink; a real calendar with grids/chips is typically > 2%
    const pass = ink.ratio >= 0.015;
    record(span + '_print_nonblank', pass, ink.detail + ' png=' + pngPath);
  }

  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => document.body.classList.remove('u486-cal-print'));
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('prepline.account.v2', JSON.stringify({ token: 'test-token-488' }));
    localStorage.setItem('prepline.signup.v1', JSON.stringify({ d: '2026-10-31', via: 'test' }));
    localStorage.setItem('prepline.calSpan.v1', 'week');
    localStorage.setItem('prepline.calAnchor.v1', '2026-10-27');
  });
  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(600);
    await loadSynthetic(page);
    await page.waitForTimeout(400);

    // Confirm station CSS is scoped
    const scoped = await page.evaluate(() => {
      const css = (document.getElementById('u47Css') || {}).textContent || '';
      return {
        hasUnscoped: /body\s+\*\s*\{\s*visibility\s*:\s*hidden/i.test(css),
        hasScoped: /body\.u47-station-print\s+\*\s*\{\s*visibility\s*:\s*hidden/i.test(css),
        hasCalPrint: /u486-cal-print/.test((document.getElementById('u486Css') || {}).textContent || '')
      };
    });
    // ensureCss may not have run yet — force boot
    await page.evaluate(() => {
      if (window.PreplineUpgrades47 && PreplineUpgrades47.ensureCss) PreplineUpgrades47.ensureCss();
      if (window.Prepline486 && Prepline486.ensureCss) Prepline486.ensureCss();
    });
    const scoped2 = await page.evaluate(() => {
      const css = (document.getElementById('u47Css') || {}).textContent || '';
      const c486 = (document.getElementById('u486Css') || {}).textContent || '';
      return {
        hasUnscoped: /body\s+\*\s*\{\s*visibility\s*:\s*hidden/i.test(css),
        hasScoped: /body\.u47-station-print\s+\*\s*\{\s*visibility\s*:\s*hidden/i.test(css),
        hasCalPrintExact: /print-color-adjust\s*:\s*exact/i.test(c486),
        hasCalVisibility: /#u486Cal[^{]*\{[^}]*visibility\s*:\s*visible/i.test(c486) ||
          /u486-cal-print #u486Cal/.test(c486)
      };
    });
    record('station_css_scoped', !scoped2.hasUnscoped && scoped2.hasScoped, JSON.stringify(scoped2));
    record('cal_print_css_present', scoped2.hasCalPrintExact && scoped2.hasCalVisibility, JSON.stringify(scoped2));

    await page.evaluate(() => {
      const d = document.getElementById('u480ViewsMore');
      if (d) d.open = true;
      if (typeof setView === 'function') setView('week');
      else { viewMode = 'week'; render(); }
    });
    await page.waitForTimeout(500);

    for (const span of ['week', 'month', 'year']) {
      await printSpan(page, span);
    }
  } catch (e) {
    console.error('TEST ERROR', e);
    record('runner', false, String(e && e.stack || e));
  } finally {
    await browser.close();
    server.close();
  }

  fs.writeFileSync(path.join(OUT, 'print-calendar-results.json'), JSON.stringify({ checks: CHECKS }, null, 2));
  const failed = CHECKS.filter(c => c.result === 'FAIL').length;
  console.log(`\n${CHECKS.length - failed}/${CHECKS.length} passed → ${OUT}`);
  process.exit(failed ? 1 : 0);
}

main();
