/* ============================================================
   main.js — app bootstrapping, tab switching, diagnostics,
   install prompt, service worker, wake lock.
   First statement sets window.__FI_BOOTED.
   ============================================================ */
import { Diagnostics } from "./diagnostics.js";

window.__FI_BOOTED = true;

const errorLog = {
  entries: [],
  MAX: 50,
  push(type, message, source, lineno, colno) {
    if (this.entries.length >= this.MAX) this.entries.shift();
    this.entries.push({ type, message: message || String(message), source: source || "", lineno: lineno || 0, colno: colno || 0, ts: new Date().toISOString() });
  },
  getAll() { return this.entries.slice(); }
};

window.addEventListener("error", (e) => {
  errorLog.push("error", e.message, e.filename || "", e.lineno || 0, e.colno || 0);
  toast(`Error: ${e.message}`, "warning");
});

window.addEventListener("unhandledrejection", (e) => {
  errorLog.push("unhandledrejection", e.reason ? String(e.reason) : "unhandled rejection", "", 0, 0);
  toast(`Unhandled: ${e.reason ? String(e.reason) : "unknown"}`, "warning");
});

function toast(msg, type = "info", duration = 4000) {
  const region = document.getElementById("toast-region");
  if (!region) return;
  const el = document.createElement("div");
  el.className = "toast";
  if (type === "warning") el.style.borderColor = "rgba(239,68,68,0.4)";
  if (type === "error") el.style.borderColor = "rgba(239,68,68,0.6)";
  el.textContent = msg;
  region.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, duration);
}

const moduleCache = new Map();

async function loadInstrument(name) {
  if (moduleCache.has(name)) return moduleCache.get(name);
  try {
    const mod = await import("./instruments/" + name + ".js");
    const inst = mod[name.charAt(0).toUpperCase() + name.slice(1)] || mod;
    moduleCache.set(name, inst);
    return inst;
  } catch (e) {
    errorLog.push("import-error", "Failed to load " + name + " : " + (e.message || ""), "", 0, 0);
    toast("Failed to load " + name + " instrument.", "error");
    return null;
  }
}

let currentInstrument = null;
let previousInstrument = null;
const instrumentStates = new Map();

async function activateInstrument(name) {
  const inst = await loadInstrument(name);
  if (!inst) return;
  try {
    if (typeof inst.activate === "function") await inst.activate();
    instrumentStates.set(name, { active: true, kind: inst.kind });
    Loop.setActive(name);
  } catch (e) {
    errorLog.push("activate-error", name + " activate failed: " + (e.message || ""), "", 0, 0);
    toast(name + " instrument failed to start. " + (e.message || ""), "error");
    const panel = document.getElementById("panel-" + name);
    if (panel) { const chip = panel.querySelector(".mode-chip"); if (chip) chip.dataset.mode = "error"; }
  }
}

async function deactivateInstrument(name) {
  const inst = instrumentStates.get(name);
  if (!inst || !inst.active) return;
  try {
    const mod = await loadInstrument(name);
    if (mod && typeof mod.deactivate === "function") await mod.deactivate();
    instrumentStates.set(name, { active: false, kind: mod ? mod.kind : undefined });
    Loop.setActive(null);
  } catch (e) {
    errorLog.push("deactivate-error", name + " deactivate failed: " + (e.message || ""), "", 0, 0);
  }
}

const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const panels = Array.from(document.querySelectorAll(".instrument-panel"));

function updateTabIndicator(activeTab) {
  const indicator = document.querySelector(".tab-indicator");
  if (!indicator || !activeTab) return;
  const parent = activeTab.parentElement;
  if (!parent) return;
  const rect = activeTab.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  const left = rect.left - parentRect.left + parentRect.width / 2 - 32;
  indicator.style.left = left + "px";
}

function setActiveTab(name) {
  for (const btn of tabButtons) {
    const isActive = btn.dataset.tab === name;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
    btn.tabIndex = isActive ? 0 : -1;
  }
  for (const panel of panels) {
    const isPanel = panel.dataset.tab === name;
    panel.classList.toggle("hidden", !isPanel);
    panel.classList.toggle("active", isPanel);
  }
  updateTabIndicator(tabButtons.find(b => b.dataset.tab === name));
  window.dispatchEvent(new Event("resize"));
  if (previousInstrument) deactivateInstrument(previousInstrument).catch(() => {});
  if (name !== previousInstrument) previousInstrument = currentInstrument;
  currentInstrument = name;
  activateInstrument(name).catch(() => {});
  Diagnostics.updateInstrumentState(name);
}

for (const btn of tabButtons) {
  btn.addEventListener("click", () => {
    const name = btn.dataset.tab;
    if (name && currentInstrument !== name) setActiveTab(name);
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
  });
  btn.addEventListener("keydown", (e) => {
    const tabs = tabButtons;
    const idx = tabs.indexOf(btn);
    if (e.key === "ArrowRight") { e.preventDefault(); const next = tabs[(idx + 1) % tabs.length]; next.focus(); if (currentInstrument !== next.dataset.tab) setActiveTab(next.dataset.tab); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); const prev = tabs[(idx - 1 + tabs.length) % tabs.length]; prev.focus(); if (currentInstrument !== prev.dataset.tab) setActiveTab(prev.dataset.tab); }
    else if (e.key === "Home") { e.preventDefault(); const first = tabs[0]; first.focus(); if (currentInstrument !== first.dataset.tab) setActiveTab(first.dataset.tab); }
    else if (e.key === "End") { e.preventDefault(); const last = tabs[tabs.length - 1]; last.focus(); if (currentInstrument !== last.dataset.tab) setActiveTab(last.dataset.tab); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const name = btn.dataset.tab; if (name && currentInstrument !== name) setActiveTab(name); }
  });
}

window.addEventListener("hashchange", () => {
  const hash = location.hash.replace("#", "");
  const valid = ["stars", "sound", "vibration", "magnetic", "altimeter"];
  if (hash && valid.includes(hash) && currentInstrument !== hash) setActiveTab(hash);
});

(function initHash() {
  const hash = location.hash.replace("#", "");
  const defaultTab = hash && ["stars", "sound", "vibration", "magnetic", "altimeter"].includes(hash) ? hash : "stars";
  for (const btn of tabButtons) {
    const isActive = btn.dataset.tab === defaultTab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
    btn.tabIndex = isActive ? 0 : -1;
  }
  for (const panel of panels) {
    const isPanel = panel.dataset.tab === defaultTab;
    panel.classList.toggle("hidden", !isPanel);
    panel.classList.toggle("active", isPanel);
  }
  updateTabIndicator(tabButtons.find(b => b.dataset.tab === defaultTab));
  currentInstrument = defaultTab;
  previousInstrument = null;
  window.dispatchEvent(new Event("resize"));
  activateInstrument(defaultTab).catch(() => {});
})();

const unitBtn = document.getElementById("unit-toggle-btn");
unitBtn.addEventListener("click", () => {
  toggleUnits();
  const isImperial = Units.system === "imperial";
  unitBtn.setAttribute("data-unit", isImperial ? "imperial" : "metric");
  const label = unitBtn.querySelector(".label");
  if (label) label.textContent = isImperial ? "IMPERIAL" : "METRIC";
});

const demoBtn = document.getElementById("demo-toggle-btn");
demoBtn.addEventListener("click", () => {
  Demo.setEnabled(!Demo.isEnabled());
  demoBtn.setAttribute("aria-pressed", Demo.isEnabled() ? "true" : "false");
  const label = demoBtn.querySelector(".label");
  if (label) label.textContent = Demo.isEnabled() ? "DEMO ON" : "DEMO OFF";
  for (const panel of panels) {
    const chip = panel.querySelector(".mode-chip");
    const badge = panel.querySelector(".sim-badge");
    if (Demo.isEnabled()) { if (chip) chip.dataset.mode = "demo"; if (badge) badge.classList.remove("hidden"); }
    else { if (chip) chip.dataset.mode = "idle"; if (badge) badge.classList.add("hidden"); }
  }
  toast(Demo.isEnabled() ? "Demo mode enabled — sensor data is simulated." : "Demo mode disabled.", "info");
});

const themeBtn = document.getElementById("theme-toggle-btn");
if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    Theme.cycle();
    const label = themeBtn.querySelector(".label");
    if (label) label.textContent = Theme.getCycleLabel();
    toast("Theme: " + Theme.current, "info");
  });
  themeBtn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); themeBtn.click(); } });
}

const installBtn = document.getElementById("install-btn");
let beforeInstallPromptEvent = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  beforeInstallPromptEvent = e;
  installBtn.classList.remove("hidden");
  installBtn.addEventListener("click", async () => {
    try {
      if (beforeInstallPromptEvent) {
        beforeInstallPromptEvent.prompt();
        const { outcome } = await beforeInstallPromptEvent.userChoice;
        toast(outcome === "accepted" ? "App installed." : "Install dismissed.", "info");
        beforeInstallPromptEvent = null;
      }
    } catch (_) { toast("Install not available on this browser.", "warning"); }
  }, { once: true });
});

let wakeLock = null;
async function acquireWakeLock() {
  if (!navigator.wakeLock || document.hidden) return;
  try { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } catch (_) {}
}
async function releaseWakeLock() {
  if (wakeLock) { try { wakeLock.release(); } catch (_) {} wakeLock = null; }
}
document.addEventListener("visibilitychange", () => { if (document.hidden) releaseWakeLock(); });
setInterval(() => { if (currentInstrument && !document.hidden && navigator.wakeLock) acquireWakeLock().catch(() => {}); }, 5000);

if (location.protocol === "http:" || location.protocol === "https:") {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).then(reg => {
      if (reg.waiting) toast("Update available — reload to apply.", "info");
    }).catch(() => {});
  }
}

import("./galaxy.js").then(({ bootGalaxy, observeGalaxy }) => { bootGalaxy(); observeGalaxy(); }).catch(() => {});

async function autoDemo() {
  setTimeout(async () => {
    const results = {};
    let anyAvailable = false;
    try { const g = await Permissions.geolocation(); results.geolocation = g; if (g === "granted") anyAvailable = true; } catch (_) { results.geolocation = "unsupported"; }
    try { const m = await Permissions.microphone(); results.microphone = m; if (m === "granted") anyAvailable = true; } catch (_) { results.microphone = "unsupported"; }
    try { const dm = await Permissions.deviceMotion(); results.deviceMotion = dm; if (dm === "granted") anyAvailable = true; } catch (_) { results.deviceMotion = "unsupported"; }
    try { const mo = await Permissions.deviceOrientation(); results.deviceOrientation = mo; if (mo === "granted") anyAvailable = true; } catch (_) { results.deviceOrientation = "unsupported"; }
    try { const mg = await Permissions.magnetometer(); results.magnetometer = mg; if (mg === "granted") anyAvailable = true; } catch (_) { results.magnetometer = "unsupported"; }
    if (!anyAvailable && !Demo.isEnabled()) {
      Demo.setEnabled(true);
      demoBtn.setAttribute("aria-pressed", "true");
      const label = demoBtn.querySelector(".label");
      if (label) label.textContent = "DEMO ON";
      for (const panel of panels) {
        const chip = panel.querySelector(".mode-chip");
        const badge = panel.querySelector(".sim-badge");
        if (chip) chip.dataset.mode = "demo";
        if (badge) badge.classList.remove("hidden");
      }
      toast("No sensors available — Demo mode enabled.", "info");
    }
  }, 1500);
}

autoDemo();
