/* Prepline 4.8.0 — Collapsible grouped controls (trial only).
 * - After a successful sort: collapse load chrome; sticky File chip · Change.
 * - Results toolbar: primary By dish/day/section stay visible; More views /
 *   Export / Print / Team ops are <details> groups, collapsed by default.
 * - Every previous control is kept (same handlers / ids).
 */
(function (root) {
  'use strict';

  var CSS_ID = 'u480-css';
  var DID_SCROLL = false;
  var groupOpen = Object.create(null); // persist open state across re-renders

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      '.u480-file-chip{position:sticky;top:0;z-index:40;display:flex;align-items:center;gap:10px;flex-wrap:wrap;',
      'background:var(--panel,#F7F4EA);border:1px solid var(--line,#E3DFD3);border-radius:10px;',
      'padding:8px 12px;margin:0 0 12px;box-shadow:0 1px 0 rgba(0,0,0,.04);}',
      '.u480-file-chip[hidden]{display:none!important;}',
      '.u480-file-chip .u480-file-label{font-size:13px;color:var(--ink,#1a1a1a);}',
      '.u480-file-chip .u480-file-label b{font-weight:600;}',
      '.u480-file-chip .ghost{font-size:12.5px;}',
      'body.u480-sorted #dbPanel.u480-collapsed > .u480-load-body{display:none;}',
      'body.u480-sorted #dbPanel .u480-load-summary{display:flex!important;}',
      '#dbPanel .u480-load-summary{display:none;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px;}',
      '#dbPanel.u480-open .u480-load-body{display:block!important;}',
      '#dbPanel.u480-open .u480-load-summary{display:none!important;}',
      'body.u480-sorted #paxPanelWrap.u480-settings-collapsed > *:not(.u480-settings-bar){display:none!important;}',
      'body.u480-sorted #staffingPanelWrap.u480-settings-collapsed > *:not(.u480-settings-bar){display:none!important;}',
      'body.u480-sorted #ingPanelWrap.u480-settings-collapsed > *:not(.u480-settings-bar){display:none!important;}',
      '.u480-settings-bar{display:none;justify-content:space-between;align-items:center;gap:8px;margin:0;}',
      'body.u480-sorted .u480-settings-collapsed > .u480-settings-bar{display:flex!important;}',
      '.u480-groups{display:flex;flex-direction:column;gap:6px;margin:8px 0 14px;}',
      '.u480-group{border:1px solid var(--line,#E3DFD3);border-radius:10px;background:#fff;padding:0;}',
      '.u480-group > summary{cursor:pointer;list-style:none;padding:9px 12px;font-size:13px;font-weight:600;',
      'display:flex;align-items:center;justify-content:space-between;user-select:none;}',
      '.u480-group > summary::-webkit-details-marker{display:none;}',
      '.u480-group > summary::after{content:"▸";font-weight:400;color:var(--ink-soft,#6b675c);font-size:12px;}',
      '.u480-group[open] > summary::after{content:"▾";}',
      '.u480-group-body{padding:4px 10px 10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;}',
      '.u480-group-body.viewtoggle{gap:6px;}',
      '.u480-hint{font-size:11px;color:var(--ink-soft,#6b675c);font-weight:400;margin-left:8px;}'
    ].join('');
    document.head.appendChild(s);
  }

  function fileLabel() {
    var tag = document.getElementById('fileTag');
    var t = (tag && tag.textContent || '').trim();
    if (!t || t === 'no file loaded') return 'sorted list';
    return t;
  }

  function ensureFileChip() {
    var wrap = document.querySelector('#preplistTab .wrap');
    if (!wrap) return null;
    var chip = document.getElementById('u480FileChip');
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'u480FileChip';
      chip.className = 'u480-file-chip no-print';
      chip.hidden = true;
      chip.innerHTML =
        '<span class="u480-file-label">File: <b id="u480FileName"></b></span>' +
        '<button type="button" class="ghost" id="u480ChangeFileBtn">Change</button>' +
        '<button type="button" class="ghost" id="u480ExpandSettingsBtn">Pax / settings</button>';
      var results = document.getElementById('resultsArea');
      if (results && results.parentNode === wrap) wrap.insertBefore(chip, results);
      else wrap.appendChild(chip);
      chip.querySelector('#u480ChangeFileBtn').addEventListener('click', function () {
        expandLoadChrome();
        var dz = document.getElementById('dropzone');
        if (dz) dz.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      chip.querySelector('#u480ExpandSettingsBtn').addEventListener('click', function () {
        expandSettings();
        var p = document.getElementById('paxPanelWrap');
        if (p && p.style.display !== 'none') p.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    return chip;
  }

  function wrapLoadBody() {
    var panel = document.getElementById('dbPanel');
    if (!panel || panel.dataset.u480Wrapped) return panel;
    var kids = Array.prototype.slice.call(panel.children);
    var summary = document.createElement('div');
    summary.className = 'u480-load-summary';
    summary.innerHTML =
      '<span class="small" style="font-size:12.5px;color:var(--ink-soft);">Load chrome collapsed — list is ready below.</span>' +
      '<button type="button" class="secondary" id="u480ShowLoadBtn">Show load / paste</button>';
    var body = document.createElement('div');
    body.className = 'u480-load-body';
    kids.forEach(function (ch) {
      // keep the title row (first .row with h2) outside the collapsible body? Keep all in body; title stays.
      body.appendChild(ch);
    });
    // Pull the title row back out so the panel still shows "Load a preplist"
    var titleRow = body.querySelector(':scope > .row');
    if (titleRow && titleRow.querySelector('#dbPanelTitle, h2')) {
      panel.appendChild(titleRow);
    }
    panel.appendChild(summary);
    panel.appendChild(body);
    panel.dataset.u480Wrapped = '1';
    summary.querySelector('#u480ShowLoadBtn').addEventListener('click', function () {
      expandLoadChrome();
    });
    return panel;
  }

  function ensureSettingsBar(wrapId, label) {
    var wrap = document.getElementById(wrapId);
    if (!wrap || wrap.dataset.u480Bar) return wrap;
    var bar = document.createElement('div');
    bar.className = 'u480-settings-bar no-print';
    bar.innerHTML =
      '<h2 style="margin:0;font-size:15px;">' + label + '</h2>' +
      '<button type="button" class="ghost u480-expand-settings" data-target="' + wrapId + '">Show</button>';
    wrap.insertBefore(bar, wrap.firstChild);
    wrap.dataset.u480Bar = '1';
    bar.querySelector('button').addEventListener('click', function () {
      wrap.classList.remove('u480-settings-collapsed');
      wrap.classList.add('u480-settings-open');
    });
    return wrap;
  }

  function expandLoadChrome() {
    var panel = document.getElementById('dbPanel');
    if (!panel) return;
    panel.classList.remove('u480-collapsed');
    panel.classList.add('u480-open');
  }

  function expandSettings() {
    ['paxPanelWrap', 'staffingPanelWrap', 'ingPanelWrap'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.classList.remove('u480-settings-collapsed');
        el.classList.add('u480-settings-open');
      }
    });
  }

  function syncChrome() {
    ensureCss();
    wrapLoadBody();
    ensureSettingsBar('paxPanelWrap', '2 · Pax per dish');
    ensureSettingsBar('staffingPanelWrap', '3 · Chef-hours settings');
    ensureSettingsBar('ingPanelWrap', 'Ingredients');
    var chip = ensureFileChip();
    var hasRows = typeof ROWS !== 'undefined' && ROWS && ROWS.length > 0;
    var panel = document.getElementById('dbPanel');
    if (hasRows) {
      document.body.classList.add('u480-sorted');
      if (panel && !panel.classList.contains('u480-open')) panel.classList.add('u480-collapsed');
      ['paxPanelWrap', 'staffingPanelWrap', 'ingPanelWrap'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el && !el.classList.contains('u480-settings-open')) el.classList.add('u480-settings-collapsed');
      });
      if (chip) {
        chip.hidden = false;
        var nameEl = document.getElementById('u480FileName');
        if (nameEl) nameEl.textContent = fileLabel();
      }
      if (!DID_SCROLL) {
        DID_SCROLL = true;
        setTimeout(function () {
          var ra = document.getElementById('resultsArea');
          if (ra) ra.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      }
    } else {
      document.body.classList.remove('u480-sorted');
      DID_SCROLL = false;
      if (panel) {
        panel.classList.remove('u480-collapsed', 'u480-open');
      }
      ['paxPanelWrap', 'staffingPanelWrap', 'ingPanelWrap'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('u480-settings-collapsed', 'u480-settings-open');
      });
      if (chip) chip.hidden = true;
    }
  }

  function captureGroupOpen() {
    document.querySelectorAll('#u480Groups details.u480-group[id]').forEach(function (d) {
      groupOpen[d.id] = !!d.open;
    });
  }

  function restoreGroupOpen() {
    document.querySelectorAll('#u480Groups details.u480-group[id]').forEach(function (d) {
      if (groupOpen[d.id]) d.open = true;
      d.addEventListener('toggle', function () {
        groupOpen[d.id] = !!d.open;
      });
    });
  }

  function patchRender() {
    var g = root;
    if (typeof g.render !== 'function' || g.render.__u480) return;
    var orig = g.render;
    function wrapped() {
      captureGroupOpen();
      var ret = orig.apply(this, arguments);
      try { syncChrome(); restoreGroupOpen(); } catch (e) {}
      return ret;
    }
    wrapped.__u480 = true;
    try { render = wrapped; } catch (e) {}
    g.render = wrapped;
  }

  /** HTML helper used by index.html render() for the grouped toolbar. */
  function groupsHtml(parts) {
    // parts: { moreViews, exportBtns, printBtns, teamBtns }
    parts = parts || {};
    return (
      '<div class="u480-groups no-print" id="u480Groups">' +
        '<details class="u480-group" id="u480ViewsMore">' +
          '<summary>More views<span class="u480-hint">item · week · order · yield · voice</span></summary>' +
          '<div class="u480-group-body viewtoggle">' + (parts.moreViews || '') + '</div>' +
        '</details>' +
        '<details class="u480-group" id="u480Export">' +
          '<summary>Export<span class="u480-hint">Excel · PDF · email</span></summary>' +
          '<div class="u480-group-body row">' + (parts.exportBtns || '') + '</div>' +
        '</details>' +
        '<details class="u480-group" id="u480Print">' +
          '<summary>Print<span class="u480-hint">sections · days · method</span></summary>' +
          '<div class="u480-group-body row print-row">' + (parts.printBtns || '') + '</div>' +
        '</details>' +
        '<details class="u480-group" id="u480Team">' +
          '<summary>Team ops<span class="u480-hint">roster · dispatch · brief · swap</span></summary>' +
          '<div class="u480-group-body row">' + (parts.teamBtns || '') + '</div>' +
        '</details>' +
      '</div>'
    );
  }

  root.Prepline480 = {
    VERSION: '4.8.0',
    ensureCss: ensureCss,
    syncChrome: syncChrome,
    groupsHtml: groupsHtml,
    expandLoadChrome: expandLoadChrome,
    expandSettings: expandSettings
  };
  root.u480GroupsHtml = groupsHtml;

  function boot() {
    ensureCss();
    patchRender();
    try { syncChrome(); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(boot, 0);
  setTimeout(boot, 50);
  setTimeout(boot, 250);
})(typeof window !== 'undefined' ? window : this);
