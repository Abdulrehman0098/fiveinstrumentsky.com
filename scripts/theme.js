(function() {
'use strict';

/* ============================================================
   theme.js — persisted theme cycle: galaxy -> daylight -> night
   ============================================================ */

const THEMES = ["galaxy", "daylight", "night"];
const STORAGE_KEY = "fi-theme";
const THEME_COLOR = {
  galaxy: "#02040a",
  daylight: "#e8eefa",
  night: "#000000"
};

const Theme = {
  current: "galaxy",

  init() {
    const stored = safeStorage.get(STORAGE_KEY, null);
    if (stored && THEMES.includes(stored)) {
      this.current = stored;
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      this.current = prefersDark ? "galaxy" : "daylight";
    }
    this.apply();
  },

  cycle() {
    const idx = THEMES.indexOf(this.current);
    this.current = THEMES[(idx + 1) % THEMES.length];
    this.apply();
  },

  set(theme) {
    if (THEMES.includes(theme)) {
      this.current = theme;
      this.apply();
    }
  },

  apply() {
    document.documentElement.setAttribute("data-theme", this.current);
    try {
      safeStorage.set(STORAGE_KEY, this.current);
    } catch (_) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = THEME_COLOR[this.current] || "#02040a";
    window.FI.bus.emit("themechange", this.current);
  },

  getCycleLabel() {
    const idx = THEMES.indexOf(this.current);
    const next = THEMES[(idx + 1) % THEMES.length];
    const labels = { galaxy: "Galaxy", daylight: "Daylight", night: "Night Vision" };
    return labels[this.current] + " → " + labels[next];
  }
};

function getThemeName() { return Theme.current; }
function cycleTheme() { Theme.cycle(); }

Theme.loadFromStorage = function() { Theme.init(); };
Theme.saveToStorage = function() { try { safeStorage.set(STORAGE_KEY, Theme.current); } catch(_) {} };

window.FI = window.FI || {};
window.FI.theme = Theme;
})();
