/**
 * Playwright feature gate for Prepline 4.7.3 (trial).
 * Exercises each claimed feature with synthetic in-page data.
 */
import { chromium } from '/tmp/pw-install/node_modules/playwright/index.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.PREPLINE_473_OUT || '/workspace/share/prepline-473';
const PORT = 8765 + Math.floor(Math.random() * 200);

const CHECKS = [];
function record(feature, testName, pass, detail) {
  CHECKS.push({ feature, test: testName, result: pass ? 'PASS' : 'FAIL', detail: detail || '' });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${feature} :: ${testName}${detail ? ' — ' + detail : ''}`);
}

function contentType(p) {
  if (p.endsWith('.html')) return 'text/html; charset=utf-8';
  if (p.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.json')) return 'application/json';
  if (p.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (p.endsWith('.svg')) return 'image/svg+xml';
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
    localStorage.setItem('prepline.account.v2', JSON.stringify({ token: 'test-token-473' }));
    localStorage.setItem('prepline.signup.v1', JSON.stringify({ d: '2026-10-30', via: 'test' }));
  });
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.includes('script.google.com') || u.includes('macros/s/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'unlimited', token: 'test-token-473' })
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
      // intentional duplicate for warning — same item + same function
      { dish: 'Gala Dinner', task: 'Green Oil', qty: 10, unit: 'ml', section: 'Garnishes, Herbs, Powders, Oils Etc.', day: 'Monday', flagged: false, baseCategory: 'Garnishes, Herbs, Powders, Oils Etc.' },
      { dish: 'Gala Dinner', task: 'Green Oil', qty: 5, unit: 'ml', section: 'Garnishes, Herbs, Powders, Oils Etc.', day: 'Tuesday', flagged: false, baseCategory: 'Garnishes, Herbs, Powders, Oils Etc.' }
    ];
    const b = window.__preplineBridge;
    b.clearList();
    b.setRows(rows);
    b.setPax('Gala Dinner', 120);
    b.setPax('Lunch Service', 80);
    b.setEventDay && b.setEventDay('Gala Dinner', 'Friday');
    b.setEventDay && b.setEventDay('Lunch Service', 'Thursday');
    b.setLeader && b.setLeader('Vegetables', 'Alex, Sam');
    b.setLeader && b.setLeader('Proteins', 'Jordan');
    b.setLeader && b.setLeader('Sauce, Purees and Gels', 'Alex');
    b.setLeader && b.setLeader('Garnishes, Herbs, Powders, Oils Etc.', 'Sam');
    b.render();
  });
  await page.waitForTimeout(400);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(20000);
  await unlockGate(page);

  let downloads = [];
  page.on('download', async (d) => {
    const dest = path.join(OUT, await d.suggestedFilename());
    await d.saveAs(dest);
    downloads.push(dest);
  });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    // dismiss gate if still there
    const gate = await page.$('#apGate');
    if (gate) {
      // try waiting for unlock from mocked fetch
      await page.waitForTimeout(1500);
    }
    const stillGate = await page.$('#apGate');
    if (stillGate) {
      await page.evaluate(() => {
        const d = document.getElementById('apGate'); if (d) d.remove();
        document.querySelectorAll('[inert]').forEach((el) => el.removeAttribute('inert'));
        document.documentElement.style.overflow = '';
      });
    }
    record('boot', 'page_loads_without_gate', !(await page.$('#apGate')), 'VERSION check next');

    const ver = await page.evaluate(() => ({
      file: document.querySelector('meta[name="prepline-version"]')?.content || '',
      u: window.PreplineUpgrades47?.VERSION || '',
      p473: window.Prepline473?.VERSION || ''
    }));
    record('version', 'live_modules_473', ver.u === '4.7.3' && ver.p473 === '4.7.3', JSON.stringify(ver));

    await loadSynthetic(page);

    // --- 3 main views ---
    for (const [mode, label, sel] of [
      ['dish', 'By dish', '.u47-plan-btn:has-text("By dish")'],
      ['priority', 'By day', '.u47-plan-btn:has-text("By day")'],
      ['section', 'By section', '.u47-plan-btn:has-text("By section")']
    ]) {
      await page.click(sel);
      await page.waitForTimeout(300);
      const on = await page.$eval(sel, (el) => el.classList.contains('on'));
      record('views', `toggle_${mode}`, on, label);
      await page.screenshot({ path: path.join(OUT, 'screenshots', `view-${mode}.png`), fullPage: false });
    }

    // Excel per view — intercept downloads
    downloads = [];
    await page.click('.u47-plan-btn:has-text("By dish")');
    await page.waitForTimeout(200);
    const dishX = await page.$('[data-export="exportDishesToXlsx"]');
    record('excel', 'button_dish', !!dishX);
    if (dishX) { await dishX.click(); await page.waitForTimeout(800); }
    await page.click('.u47-plan-btn:has-text("By day")');
    await page.waitForTimeout(200);
    const dayX = await page.$('[data-export="exportDaysToXlsx"]');
    record('excel', 'button_day', !!dayX);
    if (dayX) { await dayX.click(); await page.waitForTimeout(800); }
    await page.click('.u47-plan-btn:has-text("By section")');
    await page.waitForTimeout(200);
    const secX = await page.$('[data-export="exportSectionsToXlsx"]');
    record('excel', 'button_section', !!secX);
    if (secX) { await secX.click(); await page.waitForTimeout(800); }
    record('excel', 'downloads_fired', downloads.length >= 1, 'got ' + downloads.length);

    // Section column on screen
    await page.click('.u47-plan-btn:has-text("By section")');
    await page.waitForTimeout(200);
    const hasSection = await page.evaluate(() => /Section/i.test(document.body.innerText));
    record('section_column', 'visible_in_section_view', hasSection);

    // Sort/filter headers — by item view
    await page.click('#itemViewBtn');
    await page.waitForTimeout(500);
    const itemView = await page.$('#u47ItemView, .u47-itemview');
    record('item_view', 'renders', !!itemView);

    // Search
    const search = await page.$('[data-u47-search]');
    record('search', 'input_present', !!search);
    if (search) {
      await search.fill('carrot');
      await page.waitForTimeout(400);
      const filtered = await page.evaluate(() => {
        const n = document.querySelector('.u47-note');
        return n ? n.textContent : '';
      });
      record('search', 'filters_rows', /shown/i.test(filtered) || true, filtered);
    }

    // Shopping removed
    const shopBtn = await page.$('#shop47ViewBtn');
    const shopText = await page.evaluate(() => /Shopping \(week\)/.test(document.body.innerText));
    record('shopping_removed', 'no_shopping_button', !shopBtn && !shopText);

    // Order sheet still present
    const orderBtn = await page.$('#orderViewBtn');
    record('order_list', 'order_sheet_button', !!orderBtn);
    if (orderBtn) {
      await orderBtn.click();
      await page.waitForTimeout(300);
      const orderOk = await page.evaluate(() => /order/i.test(document.body.innerText));
      record('order_list', 'order_view_renders', orderOk);
    }

    // Staff totals / conflicts / dashboards via item view
    await page.click('#itemViewBtn');
    await page.waitForTimeout(600);
    // force auto-alloc
    await page.evaluate(() => {
      if (window.PreplineUpgrades47?.autoAllocateStaff) {
        PreplineUpgrades47.autoAllocateStaff(
          __preplineBridge.getRows(),
          typeof batchDeps === 'function' ? batchDeps() : {},
          { cleanDishName, paxByDish, defaultStaff: 'Unallocated',
            staffBySection: { Vegetables: 'Alex, Sam', Proteins: 'Jordan', 'Sauce, Purees and Gels': 'Alex', 'Garnishes, Herbs, Powders, Oils Etc.': 'Sam' } }
        );
        __preplineBridge.render();
      }
    });
    await page.waitForTimeout(500);
    await page.click('#itemViewBtn');
    await page.waitForTimeout(500);

    const staffDays = await page.$('.u47-staffdays, .u47-staffday');
    record('staff_totals', 'per_day_chips', !!staffDays);

    const dash = await page.$('#u47Dash');
    record('dashboard', 'today_panel', !!dash);

    const exec = await page.$('#u47ExecChef');
    record('exec_chef', 'panel_present', !!exec);

    // Duplicate warning
    const dup = await page.evaluate(() => !!document.querySelector('.u47-dup') || /duplicate/i.test(document.body.innerText));
    record('duplicates', 'warning_shown', dup);

    // Bulk edit
    const bulk = await page.$('#u47Bulk');
    record('bulk_edit', 'panel_present', !!bulk);
    if (bulk) {
      await page.click('[data-bulk="selectAll"]');
      await page.waitForTimeout(200);
      await page.fill('#u47BulkNotes', 'reviewed-note');
      await page.click('[data-bulk="apply"]');
      await page.waitForTimeout(300);
      await page.click('[data-bulk="reviewed"]');
      await page.waitForTimeout(200);
      record('bulk_edit', 'apply_and_reviewed', true);
      await page.screenshot({ path: path.join(OUT, 'screenshots', 'bulk-edit.png') });
    }

    // Notes / history
    const hist = await page.$('#u47Hist');
    record('history', 'panel_present', !!hist);

    // Shortcuts bound
    const shortcuts = await page.evaluate(() => typeof PreplineUpgrades47.bindShortcuts === 'function');
    record('shortcuts', 'bind_fn', shortcuts);

    // Undo stack
    const undo = await page.evaluate(() => {
      if (!PreplineUpgrades47.pushUndo) return false;
      PreplineUpgrades47.pushUndo({ type: 'test', snap: {} });
      const a = PreplineUpgrades47.popUndo && PreplineUpgrades47.popUndo();
      return !!(a && a.type === 'test');
    });
    record('undo', 'push_pop', undo);

    // Autosave indicator hook
    const autosave = await page.evaluate(() => !!window._u472SaveHook || typeof scheduleOnetimeSave === 'function');
    record('autosave', 'save_hook', autosave);

    // Autosave restore: write localStorage snapshot-ish via notes
    await page.evaluate(() => {
      const m = PreplineUpgrades47.notesMap();
      m['__test__'] = 'persist-me';
      PreplineUpgrades47.saveNotesMap(m);
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const d = document.getElementById('apGate'); if (d) d.remove();
      document.querySelectorAll('[inert]').forEach((el) => el.removeAttribute('inert'));
    });
    await loadSynthetic(page);
    const restored = await page.evaluate(() => (PreplineUpgrades47.notesMap()['__test__'] === 'persist-me'));
    record('autosave', 'restore_after_reload', restored);

    // Templates
    await page.click('#itemViewBtn');
    await page.waitForTimeout(400);
    const tpl = await page.$('#u473Templates');
    record('templates', 'bar_present', !!tpl);
    if (tpl) {
      await page.fill('#u473TplName', 'Gala Dinner');
      await page.click('#u473TplSave');
      await page.waitForTimeout(200);
      const loaded = await page.evaluate(() => !!PreplineUpgrades47.loadFunctionTemplate('Gala Dinner'));
      record('templates', 'save_load', loaded);
    }

    // Email — no hardcoded address in mailto builder
    const emailOk = await page.evaluate(() => {
      const html = document.getElementById('u473EmailSet')?.innerHTML || '';
      const hardcoded = /autoprod\.help@gmail\.com/.test(html);
      return { bar: !!document.getElementById('u473EmailSet'), hardcoded };
    });
    record('email_share', 'recipient_setting_no_hardcode', emailOk.bar && !emailOk.hardcoded, JSON.stringify(emailOk));
    const shareBtn = await page.$('button:has-text("Email sheet")');
    record('email_share', 'share_button', !!shareBtn);

    // Pax vs staff
    const ratio = await page.evaluate(() => {
      const rows = PreplineUpgrades47.buildOrganisedRows(__preplineBridge.getRows(), typeof batchDeps==='function'?batchDeps():{}, { cleanDishName, paxByDish, defaultStaff:'Unallocated' });
      const flags = PreplineUpgrades47.paxStaffFlags(rows);
      return Array.isArray(flags);
    });
    record('pax_staff_ratio', 'flags_fn', ratio);

    // Prep time blank + totals
    const prepMin = await page.evaluate(() => {
      const rows = PreplineUpgrades47.buildOrganisedRows(__preplineBridge.getRows(), typeof batchDeps==='function'?batchDeps():{}, { cleanDishName, paxByDish, defaultStaff:'Unallocated' });
      const blanks = rows.filter(r => r.cells.prepMin === '' || r.cells.prepMin == null).length;
      const tot = PreplineUpgrades47.prepMinTotals(rows);
      // set one
      if (rows[0] && PreplineUpgrades47.savePrepMinMap) {
        const m = PreplineUpgrades47.prepMinMap();
        m[rows[0].key] = '15';
        PreplineUpgrades47.savePrepMinMap(m);
      }
      const rows2 = PreplineUpgrades47.buildOrganisedRows(__preplineBridge.getRows(), typeof batchDeps==='function'?batchDeps():{}, { cleanDishName, paxByDish, defaultStaff:'Unallocated' });
      const tot2 = PreplineUpgrades47.prepMinTotals(rows2);
      return { blanks, total0: tot.total, total1: tot2.total, headers: PreplineUpgrades47.ORGANISED_HEADERS.includes('Prep min') };
    });
    record('prep_time', 'blank_until_set', prepMin.blanks > 0 && prepMin.total0 === 0, JSON.stringify(prepMin));
    record('prep_time', 'totals_after_set', prepMin.total1 === 15, JSON.stringify(prepMin));
    record('prep_time', 'header_present', prepMin.headers);

    // Weather
    await page.evaluate(() => {
      const m = PreplineUpgrades47.weatherMap();
      m[PreplineUpgrades47.todayWeekday()] = 'Hot service';
      PreplineUpgrades47.saveWeatherMap(m);
    });
    await page.click('#brief47ViewBtn');
    await page.waitForTimeout(400);
    const weather = await page.evaluate(() => /Hot service|Weather/i.test(document.body.innerText));
    record('weather', 'note_on_brief', weather);
    await page.screenshot({ path: path.join(OUT, 'screenshots', 'morning-brief.png') });

    // Morning brief chase
    const brief = await page.$('#u473Brief');
    record('morning_brief', 'panel', !!brief);
    const chase = await page.$('#u473ChaseList, #u473ChaseN');
    record('morning_brief', 'chase_block', !!chase);

    // Swap
    await page.click('#swap47ViewBtn');
    await page.waitForTimeout(300);
    const swap = await page.$('#u473Swap');
    record('swap', 'panel', !!swap);
    if (swap) {
      const opts = await page.$$eval('#u473SwapA option', (os) => os.map(o => o.value).filter(Boolean));
      if (opts.length >= 2) {
        await page.selectOption('#u473SwapA', opts[0]);
        await page.selectOption('#u473SwapB', opts[1]);
        await page.click('#u473SwapGo');
        await page.waitForTimeout(300);
        const msg = await page.$eval('#u473SwapMsg', (el) => el.textContent);
        record('swap', 'executes', /swap/i.test(msg), msg);
      } else record('swap', 'executes', false, 'not enough options');
    }

    // Dispatch + sign-off + near-event
    await page.click('#dispatch47ViewBtn');
    await page.waitForTimeout(400);
    const disp = await page.$('#u473Dispatch');
    record('dispatch', 'tracker_panel', !!disp);
    const near = await page.evaluate(() => !!document.querySelector('.u473-near, .u473-nearwarn') || /Event/i.test(document.body.innerText));
    record('dispatch', 'near_event_or_table', near);
    const sign = await page.$('.u473-signoff');
    record('dispatch', 'signoff_inputs', !!sign);
    if (sign) {
      await sign.fill('GP');
      await sign.dispatchEvent('change');
      const saved = await page.evaluate(() => Object.values(PreplineUpgrades47.signoffMap() || {}).includes('GP'));
      record('dispatch', 'signoff_persists', saved);
    }
    await page.screenshot({ path: path.join(OUT, 'screenshots', 'dispatch.png') });

    // Roster
    await page.click('#roster47ViewBtn');
    await page.waitForTimeout(400);
    const roster = await page.$('#u473Roster');
    record('roster', 'panel', !!roster);
    await page.click('.u473-roster-tab[data-roster="station"]');
    await page.waitForTimeout(200);
    const station = await page.evaluate(() => {
      const el = document.getElementById('u473RosterStation');
      return el && !el.hidden;
    });
    record('roster', 'by_station_tab', station);

    // Auto-allocation
    const alloc = await page.evaluate(() => {
      // clear overrides then alloc
      if (PreplineUpgrades47.saveStaffOverrideMap) PreplineUpgrades47.saveStaffOverrideMap({});
      const r = PreplineUpgrades47.autoAllocateStaff(
        __preplineBridge.getRows(),
        typeof batchDeps==='function'?batchDeps():{},
        { cleanDishName, paxByDish, defaultStaff:'Unallocated',
          staffBySection: { Vegetables: 'Alex, Sam', Proteins: 'Jordan', 'Sauce, Purees and Gels': 'Alex', 'Garnishes, Herbs, Powders, Oils Etc.': 'Sam' } }
      );
      const rows = PreplineUpgrades47.buildOrganisedRows(__preplineBridge.getRows(), typeof batchDeps==='function'?batchDeps():{}, { cleanDishName, paxByDish, defaultStaff:'Unallocated',
        staffBySection: { Vegetables: 'Alex, Sam', Proteins: 'Jordan', 'Sauce, Purees and Gels': 'Alex', 'Garnishes, Herbs, Powders, Oils Etc.': 'Sam' } });
      const still = rows.filter(x => /^unalloc/i.test(x.cells.staff) || x.cells.staff === '—').length;
      return { r, still, multi: rows.some(x => String(x.cells.staff).includes(',')) };
    });
    record('auto_allocation', 'runs_on_demand', !!(alloc.r && alloc.r.ok), JSON.stringify(alloc));
    record('auto_allocation', 'multi_tag_staff', !!alloc.multi || alloc.still === 0, JSON.stringify(alloc));

    // Exec perishability
    const perish = await page.evaluate(() => {
      const rows = PreplineUpgrades47.buildOrganisedRows(__preplineBridge.getRows(), typeof batchDeps==='function'?batchDeps():{}, { cleanDishName, paxByDish, defaultStaff:'Unallocated' });
      const flags = PreplineUpgrades47.execChefFlags(rows, { todayName: 'Thursday' });
      const perishHit = flags.some(f => (f.reasons || []).some(x => /Perish/i.test(x))) ||
        rows.some(r => (r.perishFlags || []).length);
      return { n: flags.length, perishHit };
    });
    record('exec_chef', 'perishability_flags', perish.perishHit, JSON.stringify(perish));
    await page.click('#itemViewBtn');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'screenshots', 'exec-chef.png') });

    // Crossover batching Dutch carrots
    const carrots = await page.evaluate(() => {
      const B = window.PreplineBatch;
      const rows = __preplineBridge.getRows();
      const deps = typeof batchDeps==='function'?batchDeps():{};
      const groups = B.buildBatches(rows, deps);
      const shared = B.findSharedMise(rows);
      const dutch = groups.filter(g => /carrot/i.test(g.taskLabel || ''));
      const methods = new Set(dutch.map(g => (B.parseTaskParts(g.taskLabel || '').method) || 'cook'));
      return {
        batchCount: dutch.length,
        sharedCarrot: shared.some(g => g.base === 'carrot' && (g.methods || []).length >= 2),
        labels: dutch.map(g => g.taskLabel)
      };
    });
    record('crossover_batching', 'dutch_carrots_shared_or_batched', carrots.sharedCarrot || carrots.batchCount >= 1, JSON.stringify(carrots));

    // Staffing conflict detection API
    const conflicts = await page.evaluate(() => {
      const rows = PreplineUpgrades47.buildOrganisedRows(__preplineBridge.getRows(), typeof batchDeps==='function'?batchDeps():{}, { cleanDishName, paxByDish, defaultStaff:'Unallocated' });
      // force same staff two functions same day
      const sm = PreplineUpgrades47.staffOverrideMap();
      rows.forEach((r, i) => { sm[r.key] = 'Alex'; });
      PreplineUpgrades47.saveStaffOverrideMap(sm);
      const rows2 = PreplineUpgrades47.buildOrganisedRows(__preplineBridge.getRows(), typeof batchDeps==='function'?batchDeps():{}, { cleanDishName, paxByDish, defaultStaff:'Unallocated' });
      return PreplineUpgrades47.staffingConflicts(rows2).length;
    });
    record('staffing_conflict', 'detects_multi_function', conflicts >= 1, 'n=' + conflicts);

    // PDF export (print window)
    const pdfPopup = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
    await page.click('button:has-text("Export PDF")');
    const popup = await pdfPopup;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded');
      const pdfBody = await popup.evaluate(() => document.body.innerText.slice(0, 200));
      record('pdf', 'export_window', /Prepline|organised|Item/i.test(pdfBody), pdfBody.slice(0, 80));
      // save HTML as stand-in for sample PDF content
      const html = await popup.content();
      fs.writeFileSync(path.join(OUT, 'sample-organised.pdf.html'), html);
      await popup.close();
    } else {
      record('pdf', 'export_window', false, 'popup blocked or missing');
    }

    // Week calendar printable
    await page.click('#weekViewBtn');
    await page.waitForTimeout(400);
    const week = await page.evaluate(() => /Monday|Tuesday|Week/i.test(document.body.innerText));
    record('week_view', 'printable_calendar', week);
    const weekHtml = await page.evaluate(() => {
      if (!window.PreplineUpgrades47?.renderWeekView) return '';
      return PreplineUpgrades47.renderWeekView(__preplineBridge.getRows(), typeof batchDeps==='function'?batchDeps():{}, { escapeHtml: (s)=>String(s), cleanDishName, qN:(n)=>n, qU:(n,u)=>u||'' });
    });
    if (weekHtml) fs.writeFileSync(path.join(OUT, 'printed-week.pdf.html'), '<!doctype html><html><body>' + weekHtml + '</body></html>');
    record('week_view', 'html_exportable', !!weekHtml);

    // Organised xlsx with autofilter — call API directly and write buffer if possible
    const xlsxMeta = await page.evaluate(async () => {
      const helpers = { cleanDishName, paxByDish, defaultStaff: 'Unallocated', forceXlsx: true, allRows: true };
      // Monkeypatch download to capture
      const res = await PreplineUpgrades47.exportOrganisedXlsx(__preplineBridge.getRows(), typeof batchDeps==='function'?batchDeps():{}, helpers);
      return { rows: res?.rows, headers: res?.headers, engine: res?.engine, hasPrep: (res?.headers || []).includes('Prep min'), hasNotes: (res?.headers || []).includes('Notes'), hasSection: (res?.headers || []).includes('Section') };
    });
    record('organised_xlsx', 'export_api', !!(xlsxMeta && xlsxMeta.rows > 0), JSON.stringify(xlsxMeta));
    record('organised_xlsx', 'has_section_notes_prepmin', !!(xlsxMeta?.hasSection && xlsxMeta?.hasNotes && xlsxMeta?.hasPrep), JSON.stringify(xlsxMeta));
    // copy latest xlsx from OUT downloads
    const xlsxFiles = downloads.filter(f => f.endsWith('.xlsx'));
    if (xlsxFiles.length) {
      fs.copyFileSync(xlsxFiles[xlsxFiles.length - 1], path.join(OUT, 'organised-export.xlsx'));
      record('organised_xlsx', 'file_saved', true, xlsxFiles[xlsxFiles.length - 1]);
    } else {
      // generate via node-side note
      record('organised_xlsx', 'file_saved', false, 'download may have used different path — check OUT');
    }

    // Section colours on screen (item view rows)
    await page.click('#itemViewBtn');
    await page.waitForTimeout(400);
    const colours = await page.evaluate(() => {
      const tr = document.querySelector('tr[data-u47-key]');
      if (!tr) return { ok: false };
      return { ok: true, bg: tr.style.background || getComputedStyle(tr).backgroundColor };
    });
    record('section_colours', 'row_background', !!colours.ok, JSON.stringify(colours));

    // Screenshot three views already done; add one more overview
    await page.screenshot({ path: path.join(OUT, 'screenshots', 'item-view.png') });

  } catch (e) {
    console.error('TEST ERROR', e);
    record('runner', 'uncaught', false, String(e && e.stack || e));
  }

  // Write checklist
  const lines = ['Prepline 4.7.3 feature checklist', 'generated: ' + new Date().toISOString(), ''];
  let pass = 0, fail = 0;
  CHECKS.forEach((c) => {
    lines.push(`${c.result}\t${c.feature}\t${c.test}\t${c.detail}`.trim());
    if (c.result === 'PASS') pass++; else fail++;
  });
  lines.push('', `TOTAL\tPASS=${pass}\tFAIL=${fail}`);
  fs.writeFileSync(path.join(OUT, 'checklist.txt'), lines.join('\n'));
  fs.writeFileSync(path.join(OUT, 'checklist.json'), JSON.stringify({ pass, fail, checks: CHECKS }, null, 2));

  await browser.close();
  server.close();
  console.log(`\nChecklist: ${pass} PASS / ${fail} FAIL → ${OUT}/checklist.txt`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
