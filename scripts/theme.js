/* ============================================================
   theme.js — dark/light theme toggle, persisted to localStorage
   ============================================================ */

const Theme = (() => {
  'use strict';

  const STORAGE_KEY = 'fi-theme';
  const DARK = 'dark';
  const LIGHT = 'light';

  let current = DARK;

  function loadSaved() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === LIGHT || saved === DARK) {
        current = saved;
      } else {
        // Respect system preference
        const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        current = prefersLight ? LIGHT : DARK;
      }
    } catch (_) {
      current = DARK;
    }
    apply(current);
  }

  function apply(theme) {
    current = theme;
    document.body.classList.remove(DARK, LIGHT);
    document.body.classList.add(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
    // Update header toggle button state
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      btn.setAttribute('aria-pressed', theme === LIGHT ? 'true' : 'false');
      btn.setAttribute('data-theme', theme);
    }
    // Dispatch event
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  function toggle() {
    const next = current === DARK ? LIGHT : DARK;
    apply(next);
  }

  function set(theme) {
    if (theme === DARK || theme === LIGHT) apply(theme);
  }

  function get() { return current; }

  // Listen for system preference changes
  function watchSystemPreference() {
    try {
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      mq.addEventListener('change', (e) => {
        // Only change if user hasn't explicitly saved a preference
        const saved = '';
        try { saved = localStorage.getItem(STORAGE_KEY); } catch (_) {}
        if (!saved) {
          apply(e.matches ? LIGHT : DARK);
        }
      });
    } catch (_) {}
  }

  return {
    loadSaved,
    apply,
    toggle,
    set,
    get,
    watchSystemPreference,
  };
})();

export default Theme;
