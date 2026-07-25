/* ============================================================
   ØKT — site behaviour
   · language switching (EN / NO) with persistence + auto-detect
   · hamburger drawer (built once, shared by every page)
   · scroll reveal, sticky-nav state, stat counters, FAQ accordion
   ============================================================ */

(function () {
  'use strict';

  var S = window.OKT_STRINGS || {};
  var STORE_KEY = 'okt-lang';
  var lang = 'en';

  /* ── flags ───────────────────────────────────────────── */

  var FLAG_GB =
    '<svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<rect width="60" height="40" fill="#012169"/>' +
    '<path d="M0 0l60 40M60 0L0 40" stroke="#fff" stroke-width="8"/>' +
    '<path d="M0 0l60 40M60 0L0 40" stroke="#C8102E" stroke-width="4"/>' +
    '<path d="M30 0v40M0 20h60" stroke="#fff" stroke-width="13"/>' +
    '<path d="M30 0v40M0 20h60" stroke="#C8102E" stroke-width="8"/></svg>';

  var FLAG_NO =
    '<svg viewBox="0 0 22 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<rect width="22" height="16" fill="#BA0C2F"/>' +
    '<rect x="6" width="4" height="16" fill="#fff"/><rect y="6" width="22" height="4" fill="#fff"/>' +
    '<rect x="7" width="2" height="16" fill="#00205B"/><rect y="7" width="22" height="2" fill="#00205B"/></svg>';

  var MARK =
    '<svg viewBox="176 139 678 745" aria-hidden="true">' +
    '<g fill="currentColor"><rect x="339" y="147" width="352" height="82" rx="8"/>' +
    '<path d="M730 273 L848 273 L304 876 L186 876 Z"/></g>' +
    '<ellipse cx="512.5" cy="577" rx="246.5" ry="251" fill="none" stroke="currentColor" stroke-width="90"/></svg>';

  window.OKT_MARK_SVG = MARK;

  /* ── translation ─────────────────────────────────────── */

  function t(key) {
    var entry = S[key];
    if (!entry) return '';
    return entry[lang] != null ? entry[lang] : entry.en;
  }

  function detectLang() {
    var stored = null;
    try { stored = localStorage.getItem(STORE_KEY); } catch (e) {}
    if (stored === 'en' || stored === 'no') return stored;

    var params = new URLSearchParams(window.location.search);
    var q = params.get('lang');
    if (q === 'no' || q === 'nb' || q === 'nn') return 'no';
    if (q === 'en') return 'en';

    var navLangs = navigator.languages || [navigator.language || 'en'];
    for (var i = 0; i < navLangs.length; i++) {
      var l = (navLangs[i] || '').toLowerCase();
      if (l.indexOf('nb') === 0 || l.indexOf('nn') === 0 || l.indexOf('no') === 0) return 'no';
      if (l.indexOf('en') === 0) return 'en';
    }
    return 'en';
  }

  function applyLang(next, persist) {
    lang = next;
    if (persist) { try { localStorage.setItem(STORE_KEY, next); } catch (e) {} }

    document.documentElement.lang = next === 'no' ? 'nb' : 'en';

    // text nodes
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var val = t(el.getAttribute('data-i18n'));
      if (val) el.innerHTML = val;
    });

    // attributes:  data-i18n-attr="placeholder:cta.email;aria-label:drawer.open"
    document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var bits = pair.split(':');
        if (bits.length !== 2) return;
        var val = t(bits[1].trim());
        if (val) el.setAttribute(bits[0].trim(), val.replace(/<[^>]+>/g, ''));
      });
    });

    // document title + meta
    var titleKey = document.body.getAttribute('data-title-key');
    var descKey  = document.body.getAttribute('data-desc-key');
    if (titleKey && t(titleKey)) document.title = t(titleKey);
    if (descKey && t(descKey)) {
      ['meta[name="description"]', 'meta[property="og:description"]'].forEach(function (sel) {
        var m = document.querySelector(sel);
        if (m) m.setAttribute('content', t(descKey));
      });
    }
    if (titleKey && t(titleKey)) {
      var ogt = document.querySelector('meta[property="og:title"]');
      if (ogt) ogt.setAttribute('content', t(titleKey));
    }
    var ogl = document.querySelector('meta[property="og:locale"]');
    if (ogl) ogl.setAttribute('content', next === 'no' ? 'nb_NO' : 'en_GB');

    // switcher state
    document.querySelectorAll('.lang-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === next));
    });

    document.dispatchEvent(new CustomEvent('okt:lang', { detail: { lang: next } }));
  }

  /* ── drawer ──────────────────────────────────────────── */

  var LINKS = {
    home: [
      { href: '#features',     key: 'nav.features' },
      { href: '#session',      key: 'nav.session' },
      { href: '#log',          key: 'nav.history' },
      { href: '#watch',        key: 'nav.watch' },
      { href: '#achievements', key: 'nav.achievements' },
      { href: '#faq',          key: 'nav.faq' },
      { href: 'privacy.html',  key: 'nav.privacy' }
    ],
    privacy: [
      { href: '/',                 key: 'nav.home' },
      { href: '/#features',        key: 'nav.features' },
      { href: '/#watch',           key: 'nav.watch' },
      { href: '/#achievements',    key: 'nav.achievements' },
      { href: '/#faq',             key: 'nav.faq' },
      { href: 'privacy.html',      key: 'nav.privacy', current: true }
    ]
  };

  var CHEV = '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
             'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
             '<polyline points="9 18 15 12 9 6"/></svg>';

  function buildDrawer() {
    var page = document.body.getAttribute('data-page') || 'home';
    var links = LINKS[page] || LINKS.home;

    var scrim = document.createElement('div');
    scrim.className = 'drawer-scrim';

    var drawer = document.createElement('aside');
    drawer.className = 'drawer';
    drawer.id = 'okt-drawer';
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('aria-label', 'Menu');

    drawer.innerHTML =
      '<div class="drawer-head">' +
        '<span class="drawer-label" style="margin:0" data-i18n="drawer.menu"></span>' +
        '<button class="drawer-close" type="button" data-i18n-attr="aria-label:drawer.close">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="drawer-body">' +
        '<ul class="drawer-nav">' +
          links.map(function (l) {
            return '<li' + (l.current ? ' class="is-current"' : '') + '>' +
                   '<a href="' + l.href + '"><span data-i18n="' + l.key + '"></span>' + CHEV + '</a></li>';
          }).join('') +
        '</ul>' +
        '<p class="drawer-label" data-i18n="drawer.lang"></p>' +
        '<div class="lang-switch">' +
          '<button class="lang-btn" type="button" data-lang="en" aria-pressed="false" aria-label="English">' +
            '<span class="flag">' + FLAG_GB + '</span></button>' +
          '<button class="lang-btn" type="button" data-lang="no" aria-pressed="false" aria-label="Norsk">' +
            '<span class="flag">' + FLAG_NO + '</span></button>' +
        '</div>' +
        '<a class="drawer-cta" href="' + (page === 'home' ? '#download' : '/#download') + '" ' +
          'data-i18n="drawer.cta"></a>' +
      '</div>' +
      '<div class="drawer-foot" data-i18n="drawer.foot"></div>';

    document.body.appendChild(scrim);
    document.body.appendChild(drawer);

    var btn = document.querySelector('.hamburger');
    var lastFocus = null;

    function open() {
      lastFocus = document.activeElement;
      drawer.classList.add('open');
      scrim.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
      if (btn) btn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('no-scroll');
      var first = drawer.querySelector('a, button');
      if (first) first.focus();
    }

    function close() {
      drawer.classList.remove('open');
      scrim.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('no-scroll');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    if (btn) {
      btn.addEventListener('click', function () {
        drawer.classList.contains('open') ? close() : open();
      });
    }
    scrim.addEventListener('click', close);
    drawer.querySelector('.drawer-close').addEventListener('click', close);

    drawer.querySelectorAll('.drawer-nav a').forEach(function (a) {
      a.addEventListener('click', function () { setTimeout(close, 120); });
    });

    drawer.querySelectorAll('.lang-btn').forEach(function (b) {
      b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang'), true); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !drawer.classList.contains('open')) return;
      close();
    });

    // focus trap
    drawer.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = drawer.querySelectorAll('a[href], button:not([disabled])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ── nav shadow on scroll ────────────────────────────── */

  function stickyNav() {
    var nav = document.querySelector('.site-nav');
    if (!nav) return;
    var tick = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
    tick();
    window.addEventListener('scroll', tick, { passive: true });
  }

  /* ── scroll reveal ───────────────────────────────────── */

  function reveal() {
    var els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ── stat counters ───────────────────────────────────── */

  function counters() {
    var nums = document.querySelectorAll('[data-count]');
    if (!nums.length) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var run = function (el) {
      var target = parseInt(el.getAttribute('data-count'), 10) || 0;
      if (reduce || !target) { el.textContent = String(target); return; }
      var start = performance.now(), dur = 1100;
      var step = function (now) {
        var p = Math.min((now - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    if (!('IntersectionObserver' in window)) { nums.forEach(run); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        run(en.target);
        io.unobserve(en.target);
      });
    }, { threshold: 0.5 });
    nums.forEach(function (n) { io.observe(n); });
  }

  /* ── FAQ accordion ───────────────────────────────────── */

  function faq() {
    document.querySelectorAll('.faq-q').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('.faq-item');
        var open = item.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(open));
      });
    });
  }

  /* ── boot ────────────────────────────────────────────── */

  function init() {
    document.querySelectorAll('[data-mark]').forEach(function (el) { el.innerHTML = MARK; });
    buildDrawer();
    applyLang(detectLang(), false);
    stickyNav();
    reveal();
    counters();
    faq();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
