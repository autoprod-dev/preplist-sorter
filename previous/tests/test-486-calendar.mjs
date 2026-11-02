/**
 * Prepline 4.8.6 — calendar grids + Team ops hidden.
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_486_OUT || '/workspace/share/prepline-486';
const PORT = 8860 + Math.floor(Math.random() * 80);
fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });

const CHECKS = [];
function record(feature, testName, pass, detail) {
  CHECKS.push({ feature, test: testName, result: pass ? 'PASS' : 'FAIL', detail: detail || '' });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${feature} :: ${testName}${detail ? ' — ' + detail : ''}`);
}

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

async function unlockGate(page) {
  await page.addInitScript(() => {
    localStorage.setItem('prepline.account.v2', JSON.stringify({ token: 'test-token-486' }));
    localStorage.setItem('prepline.signup.v1', JSON.stringify({ d: '2026-10-31', via: 'test' }));
    localStorage.setItem('prepline.calSpan.v1', 'week');
    localStorage.setItem('prepline.calAnchor.v1', '2026-10-27'); // Mon of trial week
  });
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.includes('script.google.com') || u.includes('macros/s/')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ status: 'unlimited', token: 'test-token-486' })
      });
      return;
    }
    await route.continue();
  });
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

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await unlockGate(page);
  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);
    await loadSynthetic(page);
    await page.waitForTimeout(600);

    // Team ops hidden
    const teamVisible = await page.evaluate(() => {
      const team = document.getElementById('u480Team');
      const brief = document.getElementById('brief47ViewBtn');
      const roster = document.getElementById('roster47ViewBtn');
      const styleHidden = (el) => {
        if (!el) return true;
        const cs = getComputedStyle(el);
        return cs.display === 'none' || cs.visibility === 'hidden' || !el.offsetParent;
      };
      return {
        teamExists: !!team,
        teamHidden: !team || styleHidden(team),
        briefGone: !brief || styleHidden(brief),
        rosterGone: !roster || styleHidden(roster),
        bodyClass: document.body.classList.contains('u486-hide-team'),
        groupsText: (document.getElementById('u480Groups') || {}).innerText || ''
      };
    });
    record('team_ops', 'group_hidden', teamVisible.teamHidden && !/Team ops|Morning brief|Roster/i.test(teamVisible.groupsText), JSON.stringify(teamVisible));
    record('team_ops', 'morning_brief_gone', teamVisible.briefGone, JSON.stringify(teamVisible));

    // Screenshot toolbar area (no Team ops)
    await page.screenshot({ path: path.join(OUT, 'screenshots', '01-no-team-ops.png'), fullPage: false });

    // Open week calendar (button lives inside collapsed "More views")
    await page.evaluate(() => {
      const d = document.getElementById('u480ViewsMore');
      if (d) d.open = true;
      if (typeof setView === 'function') setView('week');
      else if (typeof render === 'function') { viewMode = 'week'; render(); }
    });
    await page.waitForTimeout(500);
    const week = await page.evaluate(() => {
      const cal = document.getElementById('u486Cal');
      const grid = document.querySelector('.u486-weekgrid');
      const chips = document.querySelectorAll('.u486-chip').length;
      const cols = document.querySelectorAll('.u486-daycol').length;
      const spans = [...document.querySelectorAll('[data-cal-span]')].map(b => b.textContent.trim());
      return {
        hasCal: !!cal,
        hasGrid: !!grid,
        chips, cols, spans,
        listPanels: document.querySelectorAll('.u47-daypanel').length,
        htmlSnippet: (cal && cal.innerText || '').slice(0, 200)
      };
    });
    record('calendar', 'week_grid', week.hasGrid && week.cols === 7 && week.chips > 0 && week.listPanels === 0, JSON.stringify(week));
    await page.locator('#u486Cal').screenshot({ path: path.join(OUT, 'screenshots', '02-week-calendar.png') }).catch(async () => {
      await page.screenshot({ path: path.join(OUT, 'screenshots', '02-week-calendar.png') });
    });

    // Month
    await page.click('[data-cal-span="month"]');
    await page.waitForTimeout(400);
    const month = await page.evaluate(() => ({
      has: !!document.querySelector('.u486-monthgrid'),
      cells: document.querySelectorAll('.u486-mcell').length,
      chips: document.querySelectorAll('.u486-chip').length
    }));
    record('calendar', 'month_grid', month.has && month.cells >= 28, JSON.stringify(month));
    await page.locator('#u486Cal').screenshot({ path: path.join(OUT, 'screenshots', '03-month-calendar.png') }).catch(async () => {
      await page.screenshot({ path: path.join(OUT, 'screenshots', '03-month-calendar.png') });
    });

    // Year
    await page.click('[data-cal-span="year"]');
    await page.waitForTimeout(400);
    const year = await page.evaluate(() => ({
      has: !!document.querySelector('.u486-yeargrid'),
      months: document.querySelectorAll('.u486-yminimonth').length,
      hasDays: document.querySelectorAll('.u486-yday.has').length
    }));
    record('calendar', 'year_grid', year.has && year.months === 12, JSON.stringify(year));
    await page.locator('#u486Cal').screenshot({ path: path.join(OUT, 'screenshots', '04-year-calendar.png') }).catch(async () => {
      await page.screenshot({ path: path.join(OUT, 'screenshots', '04-year-calendar.png') });
    });

    // Version
    const ver = await page.evaluate(() => (document.getElementById('appVersion') || {}).textContent || '');
    record('version', 'shows_486', /4\.8\.6/.test(ver), ver);

    // Prepline486 loaded
    const loaded = await page.evaluate(() => !!(window.Prepline486 && window.PreplineUpgrades47 && PreplineUpgrades47.renderWeekView && PreplineUpgrades47.renderWeekView.__u486));
    record('calendar', 'patch_active', loaded);

  } catch (e) {
    console.error('TEST ERROR', e);
    record('runner', 'uncaught', false, String(e && e.stack || e));
  } finally {
    await browser.close();
    server.close();
  }

  const summary = { version: '4.8.6', checks: CHECKS, out: OUT };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
  const failed = CHECKS.filter(c => c.result === 'FAIL').length;
  console.log(`\n${CHECKS.length - failed}/${CHECKS.length} passed → ${OUT}`);
  process.exit(failed ? 1 : 0);
}

main();
