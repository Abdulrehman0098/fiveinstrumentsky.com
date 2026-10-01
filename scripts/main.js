(function () {
  'use strict';
  window.__FI_BOOTED = true;
  window.FI = window.FI || {};
  window.FI.__errors = window.FI.__errors || [];
  window.addEventListener('error', function (e) {
    window.FI.__errors.push({ t: Date.now(), msg: e.message, src: e.filename, line: e.lineno });
  });
  window.addEventListener('unhandledrejection', function (e) {
    window.FI.__errors.push({ t: Date.now(), msg: String(e.reason) });
  });

  var currentTab = 'stars';

  function showTab(name) {
    var panels = document.querySelectorAll('.instrument-panel');
    var tabs = document.querySelectorAll('.tab-btn');
    var i;

    for (i = 0; i < tabs.length; i++) {
      tabs[i].classList.remove('active');
      tabs[i].setAttribute('aria-selected', 'false');
      tabs[i].setAttribute('tabindex', '-1');
    }
    for (i = 0; i < panels.length; i++) {
      panels[i].classList.add('hidden');
      panels[i].classList.remove('active');
    }

    var activeTab = document.querySelector('.tab-btn[data-tab="' + name + '"]');
    if (activeTab) {
      activeTab.classList.add('active');
      activeTab.setAttribute('aria-selected', 'true');
      activeTab.setAttribute('tabindex', '0');
    }

    var activePanel = document.getElementById('panel-' + name);
    if (activePanel) {
      activePanel.classList.remove('hidden');
      activePanel.classList.add('active');
    }

    // Deactivate previous instrument
    if (currentTab !== name) {
      var prev = window.FI[currentTab];
      if (prev && typeof prev.deactivate === 'function') {
        try { prev.deactivate(); } catch (e) {}
      }
    }

    // Activate new instrument
    var inst = window.FI[name];
    if (inst && typeof inst.activate === 'function') {
      try { inst.activate(); } catch (e) { console.error('[main] activate ' + name, e); }
    }

    // 0x0 canvas recovery
    window.dispatchEvent(new Event('resize'));

    if (location.hash !== '#' + name) {
      try { history.replaceState(null, '', '#' + name); } catch (e) {}
    }

    currentTab = name;
  }

  function bindTabs() {
    var tabs = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tabs.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          showTab(btn.getAttribute('data-tab'));
        });
        btn.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showTab(btn.getAttribute('data-tab'));
          }
        });
      })(tabs[i]);
    }
  }

  function bindHeaderButtons() {
    var unitBtn = document.getElementById('unit-toggle-btn');
    var demoBtn = document.getElementById('demo-toggle-btn');
    var themeBtn = document.getElementById('theme-toggle-btn');

    if (unitBtn) unitBtn.addEventListener('click', function () {
      var pressed = unitBtn.getAttribute('aria-pressed') === 'true';
      unitBtn.setAttribute('aria-pressed', String(!pressed));
      unitBtn.textContent = pressed ? 'Metric' : 'Imperial';
      try {
        window.dispatchEvent(new CustomEvent('unitschange', {
          detail: { system: pressed ? 'metric' : 'imperial' }
        }));
      } catch (e) {}
    });

    if (demoBtn) demoBtn.addEventListener('click', function () {
      var pressed = demoBtn.getAttribute('aria-pressed') === 'true';
      var turningOn = !pressed;
      demoBtn.setAttribute('aria-pressed', String(turningOn));
      var badges = document.querySelectorAll('.sim-badge');
      for (var i = 0; i < badges.length; i++) {
        if (turningOn) badges[i].classList.remove('hidden');
        else badges[i].classList.add('hidden');
      }
      if (window.FI && window.FI.demo && typeof window.FI.demo.setEnabled === 'function') {
        try { window.FI.demo.setEnabled(turningOn); } catch (e) {}
      }
      // Demo ON -> the visible instrument must start producing data immediately.
      if (turningOn) {
        var inst = window.FI[currentTab];
        if (inst && typeof inst.start === 'function') {
          try { inst.start(); } catch (e) {}
        }
      }
    });

    if (themeBtn) themeBtn.addEventListener('click', function () {
      var order = ['galaxy', 'daylight', 'night'];
      var cur = document.documentElement.getAttribute('data-theme') || 'galaxy';
      var next = order[(order.indexOf(cur) + 1) % order.length];
      document.documentElement.setAttribute('data-theme', next);
      themeBtn.setAttribute('aria-pressed', String(next !== 'galaxy'));
      try { localStorage.setItem('fi-theme', next); } catch (e) {}
    });
  }

  // Wire every instrument button that might be dead.
  function bindInstrumentButtons() {
    [
      ['sound-toggle-btn', '#sound-status', 'sound'],
      ['vib-toggle-btn', '#vib-status', 'vibration'],
      ['mag-toggle-btn', '#mag-status', 'magnetic'],
      ['alt-start-btn', '#alt-status', 'altimeter']
    ].forEach(function (row) {
      var btn = document.getElementById(row[0]);
      // Only wire buttons no instrument module has already claimed - binding a
      // second listener would fire toggle() twice (start then immediate stop).
      if (!btn || btn._wired || btn._bound) return;
      btn._wired = true;
      btn.addEventListener('click', function () {
        var inst = window.FI[row[2]];
        if (inst && typeof inst.toggle === 'function') {
          try { inst.toggle(); } catch (e) { console.error(e); }
        } else {
          var s = document.querySelector(row[1]);
          if (s) s.textContent = s.textContent === 'Idle' ? 'Starting\u2026' : 'Idle';
        }
      });
    });
  }

  function init() {
    bindTabs();
    bindHeaderButtons();
    bindInstrumentButtons();
    var initial = (location.hash || '#stars').replace('#', '');
    if (!document.getElementById('panel-' + initial)) initial = 'stars';
    showTab(initial);
    console.log('[main] booted, tab =', initial);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
