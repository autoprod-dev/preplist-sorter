/* Prepline 4.8.23 — trial: Wed↔Sat/Mon smart chef + move-next-day + Excel-style column menus.
 * Autoprod. TRIAL ONLY — do NOT port to Paula.
 *
 * 1) batching.js: Sat maxFwd=4 (Mon+Tue+Wed under saturdayCap); earliest-day ties (Thu+Fri→Monday);
 *    dayMoves override + moveGroupToNextDay.
 * 2) In-app "→ next day" on each prep-day batch group (views + export via buildBatches).
 * 3) Excel-style header dropdowns on By-item / organised table: Sort A–Z / Z–A / by colour /
 *    custom, filter by colour, text filter, search, tick list + Apply — carried into download
 *    via Prepline488 sheet state + item-view state.
 */
(function (root) {
  'use strict';

  var WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  /* ---------- Enhance sheet state (colour + text + ticks) ---------- */
  function ensureSheetExtras() {
    var P = root.Prepline488;
    if (!P) return;
    var st = P.getSheetState ? P.getSheetState() : null;
    if (!st) return;
    /* Patch applySheetState once for colour / text / search. */
    if (P._489SheetPatched) return;
    P._489SheetPatched = true;
    var origApply = P.applySheetState;
    P.applySheetState = function (rows, state) {
      var list = Array.isArray(rows) ? rows.slice() : [];
      var st2 = state || (P.getSheetState && P.getSheetState()) || {};
      var filters = st2.filters || {};
      Object.keys(filters).forEach(function (col) {
        var want = filters[col];
        if (want == null || want === '') return;
        if (typeof want === 'object' && !Array.isArray(want)) {
          var text = want.text != null ? String(want.text).toLowerCase() : '';
          var vals = Array.isArray(want.values) ? want.values : null;
          var colour = want.colour || want.color || '';
          list = list.filter(function (r) {
            var v = r[col];
            if (text && String(v || '').toLowerCase().indexOf(text) < 0) return false;
            if (vals && vals.length && vals.indexOf(v) < 0 && vals.indexOf(String(v)) < 0) return false;
            if (colour) {
              var cid = r.prepColourId || r.prepDay || '';
              if (String(cid) !== String(colour) && String(r.prepDay || '') !== String(colour)) return false;
            }
            return true;
          });
          return;
        }
        if (Array.isArray(want)) {
          if (!want.length) return;
          list = list.filter(function (r) {
            return want.indexOf(r[col]) >= 0 || want.indexOf(String(r[col])) >= 0;
          });
          return;
        }
        list = list.filter(function (r) { return String(r[col] || '') === String(want); });
      });
      if (st2.colourFilter) {
        var cf = st2.colourFilter;
        list = list.filter(function (r) {
          return String(r.prepColourId || '') === String(cf) || String(r.prepDay || '') === String(cf);
        });
      }
      if (st2.search) {
        var q = String(st2.search).toLowerCase();
        list = list.filter(function (r) {
          return JSON.stringify(r).toLowerCase().indexOf(q) >= 0;
        });
      }
      var col = st2.sortCol || 'actualPrep';
      var dir = st2.sortDir === 'desc' ? -1 : 1;
      var mode = st2.sortMode || '';
      if (mode === 'colour' || col === 'prepColourId') {
        list.sort(function (a, b) {
          var ca = String(a.prepColourId || a.prepDay || '');
          var cb = String(b.prepColourId || b.prepDay || '');
          if (ca < cb) return -1 * dir;
          if (ca > cb) return 1 * dir;
          if (a.itemNorm < b.itemNorm) return -1;
          if (a.itemNorm > b.itemNorm) return 1;
          var sa = String(a.sourceTab || '').toLowerCase();
          var sb = String(b.sourceTab || '').toLowerCase();
          if (sa < sb) return -1;
          if (sa > sb) return 1;
          return 0;
        });
        return list;
      }
      if (mode === 'custom' && Array.isArray(st2.customOrder) && st2.customOrder.length) {
        var order = {};
        st2.customOrder.forEach(function (k, i) { order[k] = i; });
        list.sort(function (a, b) {
          var ka = a.itemNorm + '|' + a.sourceTab;
          var kb = b.itemNorm + '|' + b.sourceTab;
          var ia = order.hasOwnProperty(ka) ? order[ka] : 99999;
          var ib = order.hasOwnProperty(kb) ? order[kb] : 99999;
          if (ia !== ib) return ia - ib;
          return 0;
        });
        return list;
      }
      /* Default / A–Z / Z–A — reuse original when possible */
      if (typeof origApply === 'function') {
        return origApply(list, {
          sortCol: col,
          sortDir: st2.sortDir || 'asc',
          filters: {}
        });
      }
      list.sort(function (a, b) {
        /* 4.8.19 Gerard Sheets H→A→I */
        var pa = String(a.prepDay || '').toLowerCase();
        var pb = String(b.prepDay || '').toLowerCase();
        if (pa < pb) return -1 * dir;
        if (pa > pb) return 1 * dir;
        if (a.itemNorm < b.itemNorm) return -1 * dir;
        if (a.itemNorm > b.itemNorm) return 1 * dir;
        var sa = String(a.sourceTab || '').toLowerCase();
        var sb = String(b.sourceTab || '').toLowerCase();
        if (sa < sb) return -1 * dir;
        if (sa > sb) return 1 * dir;
        return 0;
      });
      return list;
    };

    var origGet = P.getSheetState;
    var origSet = P.setSheetState;
    var extras = { colourFilter: '', search: '', sortMode: '', customOrder: null };
    P.getSheetState = function () {
      var base = origGet ? origGet() : {};
      return Object.assign({}, base, extras, {
        colourFilter: extras.colourFilter,
        search: extras.search,
        sortMode: extras.sortMode,
        customOrder: extras.customOrder
      });
    };
    P.setSheetState = function (next) {
      if (next && typeof next === 'object') {
        if (next.colourFilter != null) extras.colourFilter = next.colourFilter;
        if (next.search != null) extras.search = String(next.search);
        if (next.sortMode != null) extras.sortMode = String(next.sortMode);
        if (next.customOrder !== undefined) extras.customOrder = next.customOrder;
      }
      return origSet ? Object.assign(origSet(next) || {}, extras) : P.getSheetState();
    };
  }

  /* ---------- Move-to-next-day UI on batch rows ---------- */
  function moveNextDayBtnHtml(g) {
    if (!g || !g.batchKey || !g.day) return '';
    var key = encodeURIComponent(g.batchKey);
    var day = encodeURIComponent(g.day);
    return '<button type="button" class="ghost u489-move-next" data-u489-move="' + key +
      '" data-u489-day="' + day + '" title="Push this prep group to the next weekday">' +
      '→ next day</button>';
  }

  function installMoveNextDay() {
    if (typeof document === 'undefined') return;
    if (root._prepline489MoveInstalled) return;
    root._prepline489MoveInstalled = true;

    root.movePrepGroupNextDay = function (encodedKey, encodedDay) {
      var PB = root.PreplineBatch;
      if (!PB || typeof PB.moveGroupToNextDay !== 'function') return;
      var key = decodeURIComponent(encodedKey || '');
      var day = decodeURIComponent(encodedDay || '');
      var next = PB.moveGroupToNextDay(key, day);
      try {
        if (typeof root.showToast === 'function') {
          root.showToast('Moved prep to ' + next + ' (on the fly — Sat heavy? push Wed/Mon groups here)');
        } else if (typeof root.setStatus === 'function') {
          root.setStatus('Moved prep group to ' + next, 'ok');
        }
      } catch (e) {}
      if (typeof root.render === 'function') root.render();
    };

    /* Patch batchGroupRowHtml to inject the button */
    var prev = root.batchGroupRowHtml;
    if (typeof prev === 'function') {
      root.batchGroupRowHtml = function (g, opts) {
        var html = prev(g, opts);
        if (opts && opts.print) return html;
        if (!g || !g.batchKey) return html;
        var btn = moveNextDayBtnHtml(g);
        if (!btn) return html;
        /* Insert before closing </tr> in the prep-day cell area — append after unbatch/reason */
        if (html.indexOf('</td>') >= 0) {
          html = html.replace(
            /(<\/td>\s*<td class="dish">|<\/td>\s*<td class="dish)/,
            btn + '$1'
          );
          if (html.indexOf('u489-move-next') < 0) {
            html = html.replace('</tr>', '<td class="no-print">' + btn + '</td></tr>');
          }
        }
        return html;
      };
    }

    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var btn = t.closest('[data-u489-move]');
      if (!btn) return;
      ev.preventDefault();
      root.movePrepGroupNextDay(btn.getAttribute('data-u489-move'), btn.getAttribute('data-u489-day'));
    });

    ensureMoveCss();
  }

  function ensureMoveCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('u489MoveCss')) return;
    var s = document.createElement('style');
    s.id = 'u489MoveCss';
    s.textContent = [
      '.u489-move-next{font-size:10px;margin-left:6px;white-space:nowrap;border:1px dashed var(--line,#D9D3C3);}',
      '.u489-move-next:hover{background:var(--day1-bg,#E8F0FE);}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ---------- Excel-style column header menus (by-item / organised table) ---------- */
  var openMenu = null;

  function closeColMenu() {
    if (openMenu && openMenu.parentNode) openMenu.parentNode.removeChild(openMenu);
    openMenu = null;
  }

  function uniqueValues(rows, col) {
    var seen = {}, out = [];
    (rows || []).forEach(function (r) {
      var v = r.cells ? r.cells[col] : r[col];
      var s = v == null ? '' : String(v);
      if (!seen[s]) { seen[s] = true; out.push(s); }
    });
    out.sort(function (a, b) { return a.localeCompare(b); });
    return out;
  }

  function uniqueColours(rows) {
    var seen = {}, out = [];
    (rows || []).forEach(function (r) {
      var cells = r.cells || r;
      var c = cells.prepDay || r.prepDay || '';
      if (c && !seen[c]) { seen[c] = true; out.push(c); }
    });
    return out;
  }

  function buildColMenu(col, label, allRows, anchorBtn) {
    closeColMenu();
    var U = root.PreplineUpgrades47;
    var st = U && U.getItemViewState ? U.getItemViewState() : {};
    var filters = Object.assign({}, st.filters || {});
    var curFilter = filters[col] || '';
    var vals = uniqueValues(allRows, col);
    var colours = uniqueColours(allRows);
    var selected = {};
    if (typeof curFilter === 'object' && curFilter && Array.isArray(curFilter.values)) {
      curFilter.values.forEach(function (v) { selected[v] = true; });
    } else if (curFilter) {
      selected[String(curFilter)] = true;
    } else {
      vals.forEach(function (v) { selected[v] = true; });
    }

    var menu = document.createElement('div');
    menu.className = 'u489-colmenu';
    menu.setAttribute('role', 'dialog');
    menu.innerHTML = [
      '<div class="u489-colmenu-title">' + esc(label) + '</div>',
      '<button type="button" data-act="sort-asc">Sort A → Z</button>',
      '<button type="button" data-act="sort-desc">Sort Z → A</button>',
      '<button type="button" data-act="sort-colour">Sort by colour (prep day)</button>',
      '<button type="button" data-act="sort-custom">Custom sort (keep drag order)</button>',
      '<hr>',
      '<button type="button" data-act="filter-colour-clear">Clear colour filter</button>',
      colours.map(function (c) {
        return '<button type="button" data-act="filter-colour" data-colour="' + esc(c) + '">Filter colour: ' + esc(c) + '</button>';
      }).join(''),
      '<hr>',
      '<label class="u489-colmenu-search">Search<br><input type="search" data-act="search" placeholder="Contains…" value=""></label>',
      '<label class="u489-colmenu-text">Text filter<br><input type="search" data-act="text" placeholder="Text filter…" value="' +
        esc(typeof curFilter === 'object' ? (curFilter.text || '') : (typeof curFilter === 'string' ? curFilter : '')) + '"></label>',
      '<div class="u489-colmenu-ticks">',
      '<label><input type="checkbox" data-act="tick-all" checked> (Select all)</label>',
      vals.slice(0, 80).map(function (v) {
        var id = 'u489t_' + Math.random().toString(36).slice(2, 8);
        return '<label><input type="checkbox" data-act="tick" data-val="' + esc(v) + '"' +
          (selected[v] ? ' checked' : '') + '> ' + esc(v || '(blank)') + '</label>';
      }).join(''),
      '</div>',
      '<div class="u489-colmenu-actions">',
      '<button type="button" class="primary" data-act="apply">Apply</button>',
      '<button type="button" data-act="clear">Clear</button>',
      '<button type="button" data-act="close">Close</button>',
      '</div>'
    ].join('');

    document.body.appendChild(menu);
    openMenu = menu;
    var rect = anchorBtn.getBoundingClientRect();
    menu.style.left = Math.min(rect.left, window.innerWidth - 320) + 'px';
    menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - 40) + 'px';

    function sync488FromItem(patch) {
      ensureSheetExtras();
      var P = root.Prepline488;
      if (!P || !P.setSheetState) return;
      var next = {};
      if (patch.sortCol) {
        /* Map organised cols → Paula sheet cols roughly */
        var map = {
          prepDay: 'actualPrep', itemName: 'itemNorm', section: 'section',
          functionName: 'sourceTab', dishName: 'dishKey', staff: 'staff'
        };
        next.sortCol = map[patch.sortCol] || patch.sortCol;
        next.sortDir = patch.sortDir || 'asc';
      }
      if (patch.sortMode) next.sortMode = patch.sortMode;
      if (patch.colourFilter != null) next.colourFilter = patch.colourFilter;
      if (patch.search != null) next.search = patch.search;
      if (patch.filters) {
        var f = {};
        Object.keys(patch.filters).forEach(function (k) {
          var mk = k === 'prepDay' ? 'prepDay' : (k === 'itemName' ? 'item' : k);
          f[mk] = patch.filters[k];
        });
        next.filters = f;
      }
      P.setSheetState(next);
    }

    menu.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t) return;
      var act = t.getAttribute('data-act') || (t.closest && t.closest('[data-act]') && t.closest('[data-act]').getAttribute('data-act'));
      if (!act) return;
      if (act === 'close') { closeColMenu(); return; }
      if (act === 'sort-asc' || act === 'sort-desc') {
        var dir = act === 'sort-asc' ? 'asc' : 'desc';
        U.setItemViewState({ sortCol: col, sortDir: dir });
        sync488FromItem({ sortCol: col, sortDir: dir, sortMode: dir === 'asc' ? 'az' : 'za' });
        closeColMenu();
        if (typeof root.render === 'function') root.render();
        return;
      }
      if (act === 'sort-colour') {
        U.setItemViewState({ sortCol: 'prepDay', sortDir: 'asc' });
        sync488FromItem({ sortCol: 'prepDay', sortDir: 'asc', sortMode: 'colour' });
        closeColMenu();
        if (typeof root.render === 'function') root.render();
        return;
      }
      if (act === 'sort-custom') {
        sync488FromItem({ sortMode: 'custom' });
        U.setItemViewState({ sortCol: null });
        closeColMenu();
        if (typeof root.render === 'function') root.render();
        return;
      }
      if (act === 'filter-colour') {
        var c = t.getAttribute('data-colour') || (t.closest('[data-colour]') && t.closest('[data-colour]').getAttribute('data-colour'));
        sync488FromItem({ colourFilter: c });
        var f2 = Object.assign({}, U.getItemViewState().filters);
        f2.prepDay = c;
        U.setItemViewState({ filters: f2 });
        closeColMenu();
        if (typeof root.render === 'function') root.render();
        return;
      }
      if (act === 'filter-colour-clear') {
        sync488FromItem({ colourFilter: '' });
        var f3 = Object.assign({}, U.getItemViewState().filters);
        delete f3.prepDay;
        U.setItemViewState({ filters: f3 });
        closeColMenu();
        if (typeof root.render === 'function') root.render();
        return;
      }
      if (act === 'tick-all') {
        var on = t.checked;
        menu.querySelectorAll('input[data-act="tick"]').forEach(function (cb) { cb.checked = on; });
        return;
      }
      if (act === 'clear') {
        var f4 = Object.assign({}, U.getItemViewState().filters);
        delete f4[col];
        U.setItemViewState({ filters: f4, search: '' });
        sync488FromItem({ filters: f4, search: '', colourFilter: '' });
        closeColMenu();
        if (typeof root.render === 'function') root.render();
        return;
      }
      if (act === 'apply') {
        var textEl = menu.querySelector('input[data-act="text"]');
        var searchEl = menu.querySelector('input[data-act="search"]');
        var ticks = [];
        menu.querySelectorAll('input[data-act="tick"]').forEach(function (cb) {
          if (cb.checked) ticks.push(cb.getAttribute('data-val'));
        });
        var f5 = Object.assign({}, U.getItemViewState().filters);
        var payload = {
          text: textEl ? textEl.value.trim() : '',
          values: ticks
        };
        if (!payload.text && ticks.length === vals.length) {
          delete f5[col];
        } else {
          f5[col] = payload;
        }
        var search = searchEl ? searchEl.value.trim() : '';
        U.setItemViewState({ filters: f5, search: search });
        sync488FromItem({ filters: f5, search: search });
        closeColMenu();
        if (typeof root.render === 'function') root.render();
      }
    });

    setTimeout(function () {
      document.addEventListener('mousedown', function outside(ev) {
        if (openMenu && !openMenu.contains(ev.target) && ev.target !== anchorBtn) {
          closeColMenu();
          document.removeEventListener('mousedown', outside);
        }
      });
    }, 0);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function ensureColMenuCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('u489ColMenuCss')) return;
    var s = document.createElement('style');
    s.id = 'u489ColMenuCss';
    s.textContent = [
      '.u489-colmenu{position:fixed;z-index:9999;min-width:260px;max-width:320px;max-height:70vh;overflow:auto;',
      'background:#fff;border:1px solid #bbb;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.18);',
      'padding:8px;font:12.5px/1.35 "IBM Plex Sans",system-ui,sans-serif;}',
      '.u489-colmenu-title{font-weight:700;margin:0 0 6px;font-size:13px;}',
      '.u489-colmenu button{display:block;width:100%;text-align:left;margin:2px 0;padding:6px 8px;',
      'border:1px solid #ddd;border-radius:4px;background:#fafafa;cursor:pointer;font:inherit;}',
      '.u489-colmenu button.primary{background:#1C1B16;color:#fff;border-color:#1C1B16;text-align:center;font-weight:600;}',
      '.u489-colmenu button:hover{background:#eef3ff;}',
      '.u489-colmenu button.primary:hover{background:#333;}',
      '.u489-colmenu hr{border:none;border-top:1px solid #e5e5e5;margin:8px 0;}',
      '.u489-colmenu-ticks{max-height:160px;overflow:auto;border:1px solid #eee;padding:4px 6px;margin:6px 0;}',
      '.u489-colmenu-ticks label{display:block;font-size:12px;padding:2px 0;cursor:pointer;}',
      '.u489-colmenu-search,.u489-colmenu-text{display:block;margin:6px 0;font-size:11px;color:#555;}',
      '.u489-colmenu input[type=search]{width:100%;box-sizing:border-box;padding:5px 7px;margin-top:3px;',
      'border:1px solid #ccc;border-radius:4px;font:12.5px monospace;}',
      '.u489-colmenu-actions{display:flex;gap:6px;margin-top:8px;}',
      '.u489-colmenu-actions button{width:auto;flex:1;}',
      'th .u489-excel-btn{font:inherit;font-weight:700;background:transparent;border:none;cursor:pointer;',
      'padding:2px 4px;display:inline-flex;align-items:center;gap:4px;}',
      'th .u489-excel-btn::after{content:"▾";font-size:10px;opacity:.7;}'
    ].join('');
    document.head.appendChild(s);
  }

  function installExcelColMenus() {
    if (typeof document === 'undefined') return;
    if (root._prepline489ExcelInstalled) return;
    root._prepline489ExcelInstalled = true;
    ensureColMenuCss();
    ensureSheetExtras();

    var U = root.PreplineUpgrades47;
    if (!U) return;

    /* Enhance applyItemFiltersSort for object filters {text, values} */
    var origApplyItem = U.applyItemFiltersSort;
    if (typeof origApplyItem === 'function') {
      U.applyItemFiltersSort = function (rows, state) {
        state = state || (U.getItemViewState && U.getItemViewState()) || {};
        var filters = state.filters || {};
        var q = String(state.search || '').trim().toLowerCase();
        var COL_KEYS = U.COL_KEYS || [
          'functionName', 'dishName', 'paxPacks', 'prepDay', 'eventDay',
          'itemName', 'section', 'qtyEach', 'qtyTotal', 'batchNo', 'staff', 'notes'
        ];
        var filtered = (rows || []).filter(function (r) {
          if (q) {
            var hay = (r.values || []).join(' ').toLowerCase();
            if (hay.indexOf(q) < 0) return false;
          }
          return COL_KEYS.every(function (k) {
            var f = filters[k];
            if (!f) return true;
            var cell = String((r.cells && r.cells[k]) || '');
            if (typeof f === 'object' && !Array.isArray(f)) {
              if (f.text && cell.toLowerCase().indexOf(String(f.text).toLowerCase()) < 0) return false;
              if (Array.isArray(f.values) && f.values.length) {
                if (f.values.indexOf(cell) < 0) return false;
              }
              return true;
            }
            if (Array.isArray(f)) return f.indexOf(cell) >= 0;
            return cell.toLowerCase().indexOf(String(f).toLowerCase()) >= 0;
          });
        });
        /* Then sort via original on the filtered set by temporarily clearing filters */
        var sortState = Object.assign({}, state, { filters: {}, search: '' });
        if (typeof origApplyItem === 'function') {
          return origApplyItem(filtered, sortState);
        }
        return filtered;
      };
    }

    /* After bindByItemView, upgrade sort buttons to Excel menus */
    var origBind = U.bindByItemView;
    if (typeof origBind === 'function') {
      U.bindByItemView = function (rootEl, onChange) {
        origBind(rootEl, onChange);
        if (!rootEl) return;
        var allRows = [];
        try {
          /* Collect displayed row cells for tick lists */
          rootEl.querySelectorAll('[data-u47-key]').forEach(function (el) {
            var cells = {};
            var tds = el.querySelectorAll('td[data-u47-v]');
            var keys = U.COL_KEYS || [];
            tds.forEach(function (td, i) {
              if (keys[i]) cells[keys[i]] = td.getAttribute('data-u47-v') || td.textContent;
            });
            allRows.push({ cells: cells, values: Object.keys(cells).map(function (k) { return cells[k]; }) });
          });
        } catch (e) {}

        rootEl.querySelectorAll('[data-u47-sort]').forEach(function (btn) {
          btn.classList.add('u489-excel-btn');
          btn.title = 'Excel-style sort & filter';
          /* Replace click: open menu instead of instant toggle */
          var clone = btn.cloneNode(true);
          btn.parentNode.replaceChild(clone, btn);
          clone.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var col = clone.getAttribute('data-u47-sort');
            var label = clone.textContent.replace(/[↑↓▾]/g, '').trim();
            buildColMenu(col, label, allRows, clone);
          });
        });
      };
    }
  }

  /* ---------- Boot ---------- */
  function boot() {
    ensureSheetExtras();
    installMoveNextDay();
    installExcelColMenus();
    if (root.Prepline488) root.Prepline488.VERSION = '4.8.23';
    if (root.Prepline477) root.Prepline477.VERSION = '4.8.23';
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });
    } else {
      setTimeout(boot, 0);
    }
  } else {
    boot();
  }

  root.Prepline489 = {
    VERSION: '4.8.23',
    installMoveNextDay: installMoveNextDay,
    installExcelColMenus: installExcelColMenus,
    moveNextDayBtnHtml: moveNextDayBtnHtml,
    ensureSheetExtras: ensureSheetExtras,
    WEEKDAYS: WEEKDAYS
  };
})(typeof window !== 'undefined' ? window : globalThis);
