/* Prepline 4.4.8 — per-section show/hide toggles (session only). Autoprod.
 * Port of trial section-toggle behaviour: no Show-all card, no localStorage.
 * Does NOT include smart-chef / pastel / Autofilter / sheet-state.
 */
(function (root) {
  'use strict';

  var hiddenSections = Object.create(null);

  function isSectionHidden(name) {
    return !!hiddenSections[name];
  }

  function toggleSection(name) {
    if (!name || name === 'all' || name === 'REVIEW') return getVisibleSections();
    if (hiddenSections[name]) delete hiddenSections[name];
    else hiddenSections[name] = true;
    return getVisibleSections();
  }

  function showSection(name) {
    if (name) delete hiddenSections[name];
  }

  function hideSection(name) {
    if (name) hiddenSections[name] = true;
  }

  function getVisibleSections(allSections) {
    var all = allSections || (typeof root.SECTIONS !== 'undefined' ? root.SECTIONS : null);
    if (!all || !all.length) {
      return Object.keys(hiddenSections).filter(function (k) { return !hiddenSections[k]; });
    }
    return all.filter(function (s) { return !hiddenSections[s]; });
  }

  function resetSectionToggles() {
    hiddenSections = Object.create(null);
  }

  function installSectionToggles() {
    if (typeof document === 'undefined') return;
    if (root._prepline448TogglesInstalled) return;
    root._prepline448TogglesInstalled = true;

    var prevSetFilter = typeof root.setFilter === 'function' ? root.setFilter : null;
    root.setFilter = function (s) {
      if (s === 'REVIEW') {
        if (prevSetFilter) return prevSetFilter('REVIEW');
        return;
      }
      if (s === 'all') {
        /* No Show-all: treat as no-op. */
        return;
      }
      toggleSection(s);
      if (typeof root.render === 'function') root.render();
    };

    var prevRender = typeof root.render === 'function' ? root.render : null;
    if (prevRender) {
      root.render = function () {
        prevRender.apply(this, arguments);
        try { decorateSectionToggles(); } catch (e) {}
      };
    }
    decorateSectionToggles();
  }

  function decorateSectionToggles() {
    if (typeof document === 'undefined') return;
    var summary = document.querySelector('.summary.no-print');
    if (!summary) return;

    Array.prototype.slice.call(summary.querySelectorAll('.sumcard')).forEach(function (card) {
      var t = (card.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^Show all sections$/i.test(t)) card.parentNode.removeChild(card);
    });

    var SECS = typeof root.SECTIONS !== 'undefined' ? root.SECTIONS : [];
    SECS.forEach(function (s) {
      var hidden = isSectionHidden(s);
      Array.prototype.slice.call(summary.querySelectorAll('.sumcard')).forEach(function (card) {
        var lbl = card.querySelector('.lbl');
        if (lbl && lbl.textContent === s) {
          card.classList.toggle('u448-sec-off', hidden);
          card.classList.toggle('active', !hidden);
          card.title = hidden ? 'Show ' + s : 'Hide ' + s;
        }
      });
    });

    Array.prototype.slice.call(document.querySelectorAll('.section-head')).forEach(function (head) {
      var h3 = head.querySelector('h3');
      if (!h3) return;
      var name = h3.textContent.trim();
      var hide = isSectionHidden(name);
      head.style.display = hide ? 'none' : '';
      var wrap = head.nextElementSibling;
      if (wrap && wrap.classList && wrap.classList.contains('section-table-wrap')) {
        wrap.style.display = hide ? 'none' : '';
      }
    });

    ensureToggleCss();
  }

  function ensureToggleCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('u448ToggleCss')) return;
    var s = document.createElement('style');
    s.id = 'u448ToggleCss';
    s.textContent = [
      '.sumcard.u448-sec-off{opacity:.42;filter:grayscale(.35);}',
      '.sumcard.u448-sec-off .n{text-decoration:line-through;}'
    ].join('');
    document.head.appendChild(s);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(installSectionToggles, 0);
      });
    } else {
      setTimeout(installSectionToggles, 0);
    }
  }

  root.Prepline448 = {
    VERSION: '4.4.8',
    installSectionToggles: installSectionToggles,
    toggleSection: toggleSection,
    showSection: showSection,
    hideSection: hideSection,
    isSectionHidden: isSectionHidden,
    getVisibleSections: getVisibleSections,
    resetSectionToggles: resetSectionToggles
  };
})(typeof window !== 'undefined' ? window : globalThis);
