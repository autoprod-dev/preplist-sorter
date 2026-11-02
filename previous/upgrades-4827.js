/* Prepline 4.8.27 — trial aesthetic cleanup (visual only; features stay).
 * 1) Hide empty original-viewer overlay (was leaking Print/Close/Prev/Next).
 * 2) Every feature panel gets a working Show/Hide (label flips both ways),
 *    including Cooking yield, Requisitions (PO), Food cost, More views,
 *    Yield library / Voice when those views are open, and the footer howto.
 * 3) Soften classic-days banner wording so it is not confused with Revert.
 */
(function (root) {
  'use strict';

  var VERSION = '4.8.27';
  var CSS_ID = 'u4827-css';
  var openState = Object.create(null);

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      /* Empty original viewer was in document flow — keep it a real overlay */
      '#origViewerOverlay{display:none!important;position:fixed;inset:0;z-index:10050;',
      'align-items:center;justify-content:center;padding:24px;background:rgba(28,30,27,.55);}',
      '#origViewerOverlay.u4827-open{display:flex!important;}',
      '#origViewerOverlay .orig-viewer-card{background:var(--panel,#F7F4EA);border-radius:12px;',
      'max-width:min(960px,96vw);max-height:92vh;overflow:auto;padding:16px 18px;',
      'box-shadow:0 18px 48px rgba(0,0,0,.28);width:100%;}',
      '#origViewerOverlay .orig-viewer-head{display:flex;justify-content:space-between;',
      'align-items:flex-start;gap:12px;margin-bottom:10px;}',
      '#origViewerOverlay .orig-viewer-title{font-weight:600;font-size:16px;}',
      '#origViewerOverlay .orig-viewer-sub{font-size:12px;color:var(--ink-soft,#6b675c);}',
      '#origViewerOverlay .orig-viewer-body{text-align:center;}',
      '#origViewerOverlay .orig-viewer-body img{max-width:100%;height:auto;border:1px solid var(--line,#E3DFD3);',
      'background:#fff;border-radius:6px;}',
      '#origViewerOverlay .orig-viewer-nav{display:flex;justify-content:space-between;gap:8px;margin-top:12px;}',
      /* Collapsible wraps (match u4821 / u480 bars) */
      'body.u480-sorted .u4827-wrap.u480-settings-collapsed > *:not(.u480-settings-bar){display:none!important;}',
      'body.u480-sorted .u4827-wrap > .u480-settings-bar{display:flex!important;}',
      '.u4827-wrap{margin:0 0 10px;border:1px solid var(--line,#E3DFD3);border-radius:10px;',
      'background:var(--panel,#F7F4EA);padding:8px 12px;}',
      '.u4827-wrap > .u480-settings-bar{display:none;justify-content:space-between;align-items:center;gap:8px;margin:0;}',
      '.u4827-wrap > .u480-settings-bar h2{margin:0;font-size:14px;font-weight:600;}',
      '.u4827-body{margin-top:8px;}',
      'details.u480-group.u4827-converted{display:none!important;}',
      /* Footer howto collapsed by default */
      '#u4827HowtoWrap.u480-settings-collapsed #u4827HowtoBody{display:none!important;}',
      '#u4827HowtoWrap > .u480-settings-bar{display:flex!important;justify-content:space-between;',
      'align-items:center;gap:8px;margin:8px 0 0;}',
      '#u4827HowtoWrap > .u480-settings-bar h2{margin:0;font-size:13px;font-weight:600;}',
      '#u4827HowtoBody{margin-top:8px;font-size:12.5px;line-height:1.45;color:var(--ink-soft,#6b675c);}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function makeBar(title, hint, key) {
    var open = !!openState[key];
    return (
      '<div class="u480-settings-bar no-print">' +
        '<div><h2>' + title + '</h2>' +
        (hint
          ? '<div class="small" style="font-size:12px;color:var(--ink-soft,#6b675c);">' + hint + '</div>'
          : '') +
        '</div>' +
        '<button type="button" class="ghost u4827-toggle">' + (open ? 'Hide' : 'Show') + '</button>' +
      '</div>'
    );
  }

  function wireToggle(wrap, key) {
    if (!wrap || wrap.__u4827Toggle) return;
    wrap.__u4827Toggle = true;
    var btn = wrap.querySelector('.u4827-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var collapsed = wrap.classList.toggle('u480-settings-collapsed');
      openState[key] = !collapsed;
      btn.textContent = collapsed ? 'Show' : 'Hide';
    });
  }

  function ensureCollapsible(el, key, title, hint, extraClass) {
    if (!el || !el.parentNode) return null;
    var parent = el.parentNode;
    if (parent.classList && parent.classList.contains('u4827-wrap') &&
        parent.getAttribute('data-u4827') === key) {
      parent.classList.toggle('u480-settings-collapsed', !openState[key]);
      var b = parent.querySelector('.u4827-toggle');
      if (b) b.textContent = openState[key] ? 'Hide' : 'Show';
      wireToggle(parent, key);
      return parent;
    }
    /* Already wrapped by 4821? Don't double-wrap. */
    if (parent.classList && parent.classList.contains('u4821-wrap')) {
      return parent;
    }
    var wrap = document.createElement('div');
    wrap.className = 'u4827-wrap no-print' + (extraClass ? ' ' + extraClass : '');
    wrap.setAttribute('data-u4827', key);
    if (!openState[key]) wrap.classList.add('u480-settings-collapsed');
    wrap.innerHTML = makeBar(title, hint, key);
    parent.insertBefore(wrap, el);
    wrap.appendChild(el);
    wireToggle(wrap, key);
    return wrap;
  }

  function convertDetails(detailsId, key, title, hint) {
    var d = document.getElementById(detailsId);
    if (!d || !d.parentNode) return null;
    var existing = document.querySelector('.u4827-wrap[data-u4827="' + key + '"]');
    if (existing) {
      existing.classList.toggle('u480-settings-collapsed', !openState[key]);
      var b = existing.querySelector('.u4827-toggle');
      if (b) b.textContent = openState[key] ? 'Hide' : 'Show';
      wireToggle(existing, key);
      d.classList.add('u4827-converted');
      return existing;
    }
    /* Prefer 4821 wrap if already converted */
    var by4821 = document.querySelector('.u4821-wrap[data-u4821="' + key + '"]');
    if (by4821) {
      d.classList.add('u4827-converted');
      return by4821;
    }
    var bodySrc = d.querySelector('.u480-group-body');
    var wrap = document.createElement('div');
    wrap.className = 'u4827-wrap no-print';
    wrap.setAttribute('data-u4827', key);
    if (!openState[key]) wrap.classList.add('u480-settings-collapsed');
    wrap.innerHTML = makeBar(title, hint, key);
    var body = document.createElement('div');
    body.className = 'u4827-body u480-group-body';
    if (bodySrc) {
      while (bodySrc.firstChild) body.appendChild(bodySrc.firstChild);
    }
    wrap.appendChild(body);
    d.parentNode.insertBefore(wrap, d);
    d.classList.add('u4827-converted');
    wireToggle(wrap, key);
    return wrap;
  }

  /** Cooking yield: wrap live panel, or offer a stub so the feature always has Show/Hide after load. */
  function ensureYieldSection() {
    var panel = document.getElementById('yieldPanel');
    if (panel) {
      ensureCollapsible(panel, 'cookingYield', 'Cooking yield check',
        'Raw PO weight vs cooked / required · edit ranges');
      return;
    }
    if (!document.body.classList.contains('u480-sorted')) return;
    var rowCount = 0;
    try { if (typeof ROWS !== 'undefined' && ROWS) rowCount = ROWS.length; } catch (e) {}
    try { if (!rowCount && root.ROWS) rowCount = root.ROWS.length; } catch (e) {}
    if (!rowCount) return;
    var existing = document.querySelector('.u4827-wrap[data-u4827="cookingYield"]');
    if (existing) return;
    var host = document.getElementById('u480Groups') || document.getElementById('resultsArea');
    if (!host) return;
    var wrap = document.createElement('div');
    wrap.className = 'u4827-wrap no-print';
    wrap.setAttribute('data-u4827', 'cookingYield');
    if (!openState.cookingYield) wrap.classList.add('u480-settings-collapsed');
    wrap.innerHTML = makeBar('Cooking yield check',
      'Upload a purchase order / requisition to compare raw vs cooked weights', 'cookingYield');
    var body = document.createElement('div');
    body.className = 'u4827-body';
    body.innerHTML =
      '<div class="meta" style="font-size:12.5px;">No requisition weights loaded yet. ' +
      'Drop a purchase order PDF with the production tools, or open <b>Yield library</b> under More views ' +
      'to browse yield ranges.</div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px;">' +
      '<button type="button" class="secondary" id="u4827OpenYieldLib">Open Yield library</button>' +
      '</div>';
    wrap.appendChild(body);
    host.parentNode.insertBefore(wrap, host.nextSibling);
    wireToggle(wrap, 'cookingYield');
    var btn = body.querySelector('#u4827OpenYieldLib');
    if (btn) {
      btn.addEventListener('click', function () {
        try {
          openState.cookingYield = true;
          if (typeof setView === 'function') setView('recipes');
        } catch (e) {}
      });
    }
  }

  function wrapFooterHowto() {
    var foot = document.querySelector('#preplistTab footer.no-print, footer.no-print');
    if (!foot || foot.__u4827Howto) return;
    var links = foot.querySelector('.footer-links');
    var ver = foot.querySelector('#appVersion');
    /* Collect leftover text nodes / unmarked content after links */
    var nodes = [];
    var start = links || ver;
    if (!start) return;
    var n = start.nextSibling;
    while (n) {
      var next = n.nextSibling;
      if (n.nodeType === 1 && (n.id === 'u4827HowtoWrap' || n.classList && n.classList.contains('u480-settings-bar'))) {
        n = next; continue;
      }
      nodes.push(n);
      n = next;
    }
    if (!nodes.length) return;
    var wrap = document.createElement('div');
    wrap.id = 'u4827HowtoWrap';
    wrap.className = 'u4827-wrap no-print';
    wrap.setAttribute('data-u4827', 'howto');
    if (!openState.howto) wrap.classList.add('u480-settings-collapsed');
    wrap.innerHTML =
      '<div class="u480-settings-bar no-print">' +
        '<div><h2>How Prepline sorts &amp; schedules</h2>' +
        '<div class="small" style="font-size:12px;color:var(--ink-soft,#6b675c);">One-time sort · Recipe database · prep lead days</div></div>' +
        '<button type="button" class="ghost u4827-toggle">' + (openState.howto ? 'Hide' : 'Show') + '</button>' +
      '</div>';
    var body = document.createElement('div');
    body.id = 'u4827HowtoBody';
    nodes.forEach(function (node) { body.appendChild(node); });
    wrap.appendChild(body);
    foot.appendChild(wrap);
    foot.__u4827Howto = true;
    wireToggle(wrap, 'howto');
  }

  function softenClassicDaysBanner() {
    var row = document.querySelector('.version-switch');
    if (!row || row.__u4827Soft) return;
    row.__u4827Soft = true;
    var meta = row.querySelector('.meta');
    var btn = row.querySelector('#versionSwitchBtn');
    if (meta && /New: days numbered/i.test(meta.textContent || '')) {
      meta.textContent = 'Day labels: 1 Monday–7 Sunday, with Copy prep days.';
    }
    if (btn && /Switch back to previous version/i.test(btn.textContent || '')) {
      btn.textContent = 'Use plain day names';
      btn.title = 'Turn off numbered days (1 Monday … 7 Sunday) and Copy prep days';
    }
    if (meta && /Showing the previous version/i.test(meta.textContent || '')) {
      meta.textContent = 'Using plain day names (no numbered days, no Copy prep days).';
    }
    if (btn && /Switch to the new version/i.test(btn.textContent || '')) {
      btn.textContent = 'Use numbered days (1–7)';
    }
  }

  function patchOriginalViewer() {
    ensureCss();
    var ov = document.getElementById('origViewerOverlay');
    if (ov) {
      ov.classList.remove('hidden');
      ov.classList.remove('u4827-open');
      try { ov.hidden = true; } catch (e) {}
    }
    function openOv() {
      var el = document.getElementById('origViewerOverlay');
      if (!el) return;
      el.classList.add('u4827-open');
      try { el.hidden = false; } catch (e) {}
    }
    function closeOv() {
      var el = document.getElementById('origViewerOverlay');
      if (!el) return;
      el.classList.remove('u4827-open');
      try { el.hidden = true; } catch (e) {}
    }
    if (typeof root.openOriginalViewer === 'function' && !root.openOriginalViewer.__u4827) {
      var origOpen = root.openOriginalViewer;
      root.openOriginalViewer = function () {
        var ret = origOpen.apply(this, arguments);
        openOv();
        return ret;
      };
      root.openOriginalViewer.__u4827 = true;
      try { openOriginalViewer = root.openOriginalViewer; } catch (e) {}
    }
    if (typeof root.closeOriginalViewer === 'function' && !root.closeOriginalViewer.__u4827) {
      var origClose = root.closeOriginalViewer;
      root.closeOriginalViewer = function () {
        var ret = origClose.apply(this, arguments);
        closeOv();
        return ret;
      };
      root.closeOriginalViewer.__u4827 = true;
      try { closeOriginalViewer = root.closeOriginalViewer; } catch (e) {}
    }
    /* Also patch bare functions if they exist in global scope separately */
    try {
      if (typeof openOriginalViewer === 'function' && !openOriginalViewer.__u4827) {
        /* already assigned above when same ref */
      }
    } catch (e) {}
  }

  /** renderIngPanel() wipes the u480 settings bar; restore a working Show/Hide.
   *  Clone the button so u480/u4821 one-way listeners cannot double-toggle with ours. */
  function repairIngPanelToggle() {
    var wrap = document.getElementById('ingPanelWrap');
    if (!wrap || wrap.style.display === 'none') return;
    var bar = wrap.querySelector(':scope > .u480-settings-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'u480-settings-bar no-print';
      bar.innerHTML =
        '<div><h2 style="margin:0;font-size:15px;">4 · Ingredients: allergens, suppliers and prices</h2>' +
        '<div class="small" style="font-size:12px;color:var(--ink-soft,#6b675c);">Allergens · suppliers · prices</div></div>' +
        '<button type="button" class="ghost u4827-toggle">Show</button>';
      wrap.insertBefore(bar, wrap.firstChild);
      wrap.dataset.u480Bar = '1';
    }
    var btn = bar.querySelector('button');
    if (!btn) return;
    if (!btn.__u4827Ing) {
      var fresh = btn.cloneNode(true);
      fresh.__u4827Ing = true;
      fresh.classList.add('u4827-toggle');
      fresh.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        ev.stopPropagation();
        var willOpen = wrap.classList.contains('u480-settings-collapsed');
        if (willOpen) {
          wrap.classList.remove('u480-settings-collapsed');
          wrap.classList.add('u480-settings-open');
          fresh.textContent = 'Hide';
          try {
            if (typeof ingPanelOpen !== 'undefined') ingPanelOpen = true;
            localStorage.setItem('preplinePref_ingPanelOpen_v1', '1');
          } catch (e) {}
          try { if (typeof setIngPanelOpen === 'function') setIngPanelOpen(true); } catch (e) {}
        } else {
          wrap.classList.add('u480-settings-collapsed');
          wrap.classList.remove('u480-settings-open');
          fresh.textContent = 'Show';
          try {
            if (typeof ingPanelOpen !== 'undefined') ingPanelOpen = false;
            localStorage.setItem('preplinePref_ingPanelOpen_v1', '0');
          } catch (e) {}
          try { if (typeof setIngPanelOpen === 'function') setIngPanelOpen(false); } catch (e) {}
        }
        /* setIngPanelOpen → renderIngPanel wipes the bar; rebuild on next tick */
        setTimeout(repairIngPanelToggle, 0);
      });
      btn.parentNode.replaceChild(fresh, btn);
      btn = fresh;
    }
    btn.textContent = wrap.classList.contains('u480-settings-collapsed') ? 'Show' : 'Hide';
    var dup = wrap.querySelector('#ingPanelToggle');
    if (dup) dup.style.display = 'none';
  }

  function patchRenderIngPanel() {
    var g = root;
    if (typeof g.renderIngPanel !== 'function' || g.renderIngPanel.__u4827) return false;
    var orig = g.renderIngPanel;
    function wrapped() {
      var wrap = document.getElementById('ingPanelWrap');
      var wasCollapsed = !!(wrap && wrap.classList.contains('u480-settings-collapsed'));
      var wasOpen = !!(wrap && wrap.classList.contains('u480-settings-open'));
      var ret = orig.apply(this, arguments);
      wrap = document.getElementById('ingPanelWrap');
      if (wrap) {
        try { delete wrap.dataset.u480Bar; } catch (e) { wrap.dataset.u480Bar = ''; }
        if (wasOpen) {
          wrap.classList.add('u480-settings-open');
          wrap.classList.remove('u480-settings-collapsed');
        } else if (wasCollapsed) {
          wrap.classList.add('u480-settings-collapsed');
          wrap.classList.remove('u480-settings-open');
        }
        repairIngPanelToggle();
      }
      return ret;
    }
    wrapped.__u4827 = true;
    g.renderIngPanel = wrapped;
    try { renderIngPanel = wrapped; } catch (e) {}
    return true;
  }

  function applyFeatureToggles() {
    ensureCss();
    patchOriginalViewer();
    patchRenderIngPanel();
    repairIngPanelToggle();

    /* More views — same Show/Hide style as Export / Print */
    convertDetails('u480ViewsMore', 'moreViews', 'More views',
      'item · week · order · yield · voice');

    /* Cooking yield (panel or stub) */
    ensureYieldSection();

    /* Requisitions / PO */
    var po = document.getElementById('poPanel');
    if (po) {
      ensureCollapsible(po, 'requisitions', 'Requisitions (purchase orders)',
        'Match ingredients · delivery window · Ref #');
    }

    /* Food cost */
    var cost = document.getElementById('costSummary');
    if (cost) {
      ensureCollapsible(cost, 'foodCost', 'Food cost',
        'Ticked dishes · prices from Ingredients panel');
    }

    /* Yield library / voice / originals when those panels are in results */
    var origTab = document.getElementById('origTab');
    if (origTab) {
      ensureCollapsible(origTab, 'originals', 'Original production tools',
        'View / print uploaded pages');
    }
    var voice = document.getElementById('u47Voice') || document.querySelector('.u47-voice, #voicePanel');
    if (voice) {
      ensureCollapsible(voice, 'voice', 'Voice notes', 'Record / playback kitchen notes');
    }
    var recipeLib = document.getElementById('u47RecipeLib') || document.querySelector('.u47-recipe-lib, #recipeLib');
    if (recipeLib) {
      ensureCollapsible(recipeLib, 'yieldLibrary', 'Yield library',
        'Expected cooking yields by category');
    }

    wrapFooterHowto();
    softenClassicDaysBanner();
  }

  function syncVersion() {
    try {
      if (root.Prepline477) root.Prepline477.VERSION = VERSION;
      if (root.Prepline4821) root.Prepline4821.VERSION = VERSION;
      if (root.Prepline4826) root.Prepline4826.VERSION = VERSION;
      var meta = document.querySelector('meta[name="prepline-version"]');
      if (meta) {
        /* Path-only: older 4823–4826 used to force -trial into meta; ignore cur. */
        var trial = /trial/i.test((typeof location !== 'undefined' && location.pathname) || '');
        meta.setAttribute('content', trial ? (VERSION + '-trial') : VERSION);
      }
      var badge = document.getElementById('appVersion');
      if (badge && /Prepline v/.test(badge.textContent || '')) {
        badge.textContent = 'Prepline v' + VERSION;
      }
    } catch (e) {}
  }

  function patchRender() {
    var g = root;
    if (typeof g.render !== 'function') return false;
    if (g.render.__u4827) return true;
    var orig = g.render;
    function wrapped() {
      var ret = orig.apply(this, arguments);
      setTimeout(function () {
        try { applyFeatureToggles(); } catch (e) {
          try { console.warn('[u4827]', e); } catch (_) {}
        }
      }, 0);
      return ret;
    }
    wrapped.__u4827 = true;
    if (orig.__u480) wrapped.__u480 = true;
    if (orig.__u4821) wrapped.__u4821 = true;
    if (orig.__u486cal) wrapped.__u486cal = true;
    try { render = wrapped; } catch (e) {}
    g.render = wrapped;
    return true;
  }

  function boot() {
    ensureCss();
    syncVersion();
    patchOriginalViewer();
    patchRenderIngPanel();
    patchRender();
    applyFeatureToggles();
    try {
      var ra = document.getElementById('resultsArea');
      if (ra && !ra.__u4827Obs) {
        ra.__u4827Obs = true;
        new MutationObserver(function () {
          setTimeout(function () {
            try { applyFeatureToggles(); } catch (e) {}
          }, 0);
        }).observe(ra, { childList: true, subtree: false });
      }
    } catch (e) {}
    try {
      new MutationObserver(function () {
        if (document.body.classList.contains('u480-sorted')) {
          setTimeout(function () {
            try { applyFeatureToggles(); } catch (e) {}
          }, 0);
        }
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
  }

  root.Prepline4827 = {
    VERSION: VERSION,
    apply: applyFeatureToggles,
    syncVersion: syncVersion
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  setTimeout(boot, 0);
  setTimeout(boot, 50);
  setTimeout(boot, 250);
  setTimeout(function () { patchRender(); applyFeatureToggles(); syncVersion(); }, 500);
  setTimeout(function () { patchRender(); applyFeatureToggles(); syncVersion(); }, 1500);
})(typeof window !== 'undefined' ? window : this);
