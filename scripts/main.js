/* ============================================================
   main.js — FIELD INSTRUMENTS app entry, router, sensor bus,
             shared state, lazy-load instruments
   ============================================================ */

import Permissions from './permissions.js';
import Theme from './theme.js';
import Utils from './utils.js';
import { bus } from './sensor-bus.js';
import Galaxy from './galaxy.js';

/* ============================================================
   SENSOR BUS — lightweight pub/sub
   ============================================================ */

const SensorBus = {
  _listeners: new Map(),

  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
  },

  off(event, handler) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(handler);
      if (this._listeners.get(event).size === 0) this._listeners.delete(event);
    }
  },

  emit(event, data) {
    if (this._listeners.has(event)) {
      // Use a snapshot to allow handler removal during iteration
      const handlers = Array.from(this._listeners.get(event));
      for (const h of handlers) {
        try { h(data); } catch (e) { console.warn('[SensorBus] handler error:', e); }
      }
    }
  },

  once(event, handler) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      handler(data);
    };
    this.on(event, wrapper);
  },
};

/* ============================================================
   SHARED STATE
   ============================================================ */

const state = {
  get units() { return state._units; },
  set units(v) {
    state._units = v;
    state._initialized = true;
    window.dispatchEvent(new CustomEvent('unitschange', { detail: v }));
  },
  _units: 'metric',
  _initialized: false,
  theme: 'dark',
  activeTab: 'stars',
  location: null, // { lat, lon, accuracy, timestamp }
  orientationData: null, // { alpha, beta, gamma, absolute }
  motionData: null, // { accelerationIncludingGravity, rotationRate, timestamp }
  gpsWatchId: null,
  caps: null,
};

export { state };

/* ============================================================
   DIAGNOSTICS PANEL
   ============================================================ */

let diagnosticsOpen = false;

function updateDiagnostics() {
  const capList = document.getElementById('diagnostics-capabilities');
  const permList = document.getElementById('diagnostics-permissions');
  const locEl = document.getElementById('diagnostics-location');
  const copyBtn = document.getElementById('diagnostics-copy-location');
  const instList = document.getElementById('diagnostics-instruments');

  if (!capList || !permList || !locEl) return;

  // Capabilities
  const caps = Permissions.detectCapabilities();
  state.caps = caps;
  capList.innerHTML = '';
  const capItems = [
    ['Accelerometer (DeviceMotion)', caps.hasMotion],
    ['Magnetometer', caps.hasMagnetometer],
    ['Barometer / PressureSensor', caps.hasPressureSensor],
    ['GPS / Geolocation', caps.hasGeolocation],
    ['Microphone (getUserMedia)', caps.hasMicrophone],
    ['DeviceOrientation', caps.hasOrientation],
  ];
  for (const [name, ok] of capItems) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot ${ok ? 'green' : 'gray'}"></span>${name}${ok ? '' : ' — not available'}`;
    capList.appendChild(li);
  }

  // Permissions
  const permState = Permissions.allPermissions();
  permList.innerHTML = '';
  const permItems = [
    ['Orientation', permState.orientation],
    ['Motion', permState.motion],
    ['Microphone', permState.microphone],
    ['Geolocation', permState.geolocation],
  ];
  const permLabels = { granted: 'Granted', denied: 'Denied', unknown: 'Unknown', unsupported: 'Unsupported' };
  for (const [name, st] of permItems) {
    const li = document.createElement('li');
    const color = st === 'granted' ? 'green' : st === 'denied' ? 'red' : st === 'unknown' ? 'yellow' : 'gray';
    li.innerHTML = `<span class="dot ${color}"></span>${name}: ${permLabels[st] || st}`;
    permList.appendChild(li);
  }

  // Location
  if (state.location) {
    const { lat, lon, accuracy } = state.location;
    const accUnit = Utils.getUnits() === 'imperial' ? 'ft' : 'm';
    const accVal = Utils.getUnits() === 'imperial' ? accuracy * 3.28084 : accuracy;
    locEl.innerHTML = `
      <span class="diagnostics-muted">Lat/Lon:</span>
      <span class="text-mono">${Utils.formatLatLon(lat, lon, 8)}</span>
      <span class="diagnostics-muted">accuracy ±${accVal.toFixed(0)} ${accUnit}</span>
      <span class="diagnostics-muted">| timestamp: ${new Date(state.location.timestamp).toISOString()}</span>
    `;
    copyBtn.style.display = 'inline-block';
  } else {
    locEl.innerHTML = '<span class="diagnostics-muted">No location yet — open Star Finder and grant GPS access.</span>';
    copyBtn.style.display = 'none';
  }

  // Instrumentation status
  instList.innerHTML = '';
  const tabState = [
    ['Stars', state.activeTab === 'stars' ? 'Active' : 'Loaded'],
    ['Sound', state.activeTab === 'sound' ? 'Active' : 'Loaded'],
    ['Vibration', state.activeTab === 'vibration' ? 'Active' : 'Loaded'],
    ['Magnetic', state.activeTab === 'magnetic' ? 'Active' : 'Loaded'],
    ['Altimeter', state.activeTab === 'altimeter' ? 'Active' : 'Loaded'],
  ];
  for (const [name, status] of tabState) {
    const li = document.createElement('li');
    const color = status === 'Active' ? 'green' : 'gray';
    li.innerHTML = `<span class="dot ${color}"></span>${name}: ${status}`;
    instList.appendChild(li);
  }
}

function toggleDiagnostics() {
  diagnosticsOpen = !diagnosticsOpen;
  const content = document.getElementById('diagnostics-content');
  const toggle = document.getElementById('diagnostics-toggle');
  if (content) content.hidden = !diagnosticsOpen;
  if (toggle) toggle.setAttribute('aria-expanded', diagnosticsOpen ? 'true' : 'false');
  if (diagnosticsOpen) updateDiagnostics();
}

/* ============================================================
   HTTPS GUARD
   ============================================================ */

function checkHTTPS() {
  const isSecure = window.location.protocol === 'https:' ||
                   window.location.hostname === 'localhost' ||
                   window.location.hostname === '127.0.0.1';
  const banner = document.getElementById('insecure-banner');
  if (banner) {
    banner.classList.toggle('hidden', isSecure);
  }
  return isSecure;
}

/* ============================================================
   VIEWPORT LOCK — iOS Safari pinch/double-tap prevention
   ============================================================ */

function installViewportLock() {
  const html = document.documentElement;
  const body = document.body;

  // CSS-based lock (already in meta, but reinforce via JS)
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    const content = meta.getAttribute('content') || '';
    if (!content.includes('maximum-scale=1.0')) {
      meta.setAttribute('content',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover'
      );
    }
  }

  // Touch + gesture handlers — passive:false so preventDefault works
  let lastTouchEnd = 0;
  let pinchStartDist = 0;
  let pinchStartScale = 1;

  function preventDefault(e) { e.preventDefault(); }

  // Double-tap prevention
  body.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

  // iOS gesture events
  if (typeof document.documentElement.gesturestart !== 'undefined') {
    document.addEventListener('gesturestart', preventDefault, { passive: false });
  }
  if (typeof document.documentElement.gesturechange !== 'undefined') {
    document.addEventListener('gesturechange', preventDefault, { passive: false });
  }
  if (typeof document.documentElement.gestureend !== 'undefined') {
    document.addEventListener('gestureend', preventDefault, { passive: false });
  }

  // Multi-touch pinch detection on touchmove
  body.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist = Math.sqrt(dx * dx + dy * dy);
      if (window.visualViewport) {
        pinchStartScale = window.visualViewport.scale;
      }
      e.preventDefault();
    }
  }, { passive: false });

  // Wheel with ctrl/meta (zoom attempt)
  body.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  }, { passive: false });

  // Visual viewport scale reset
  if (window.visualViewport) {
    let resizeTimer = null;
    window.visualViewport.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (window.visualViewport.scale !== 1) {
          window.visualViewport.scale = 1;
        }
      }, 50);
    });
    window.visualViewport.addEventListener('scroll', () => {
      if (window.visualViewport.scale !== 1) {
        window.visualViewport.scale = 1;
      }
    });
  }
}

/* ============================================================
   TAB ROUTER
   ============================================================ */

let activeInstrument = null;
const instrumentModules = new Map();

async function switchTab(tabId) {
  // Update URL hash
  if (location.hash !== '#' + tabId) {
    history.replaceState(null, '', '#' + tabId);
  }

  // Update UI
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  document.querySelectorAll('.instrument-panel').forEach(p => p.classList.add('hidden'));
  const panel = document.getElementById('panel-' + tabId);
  if (panel) panel.classList.remove('hidden');

  // Force canvas recalculation on tab switch
  window.dispatchEvent(new Event('resize'));

  state.activeTab = tabId;

  // Lazy-load instrument module
  if (!instrumentModules.has(tabId)) {
    try {
      let mod;
      switch (tabId) {
        case 'stars': mod = await import('./instruments/stars.js'); break;
        case 'sound': mod = await import('./instruments/sound.js'); break;
        case 'vibration': mod = await import('./instruments/vibration.js'); break;
        case 'magnetic': mod = await import('./instruments/magnetic.js'); break;
        case 'altimeter': mod = await import('./instruments/altimeter.js'); break;
        default: mod = null;
      }
      if (mod) instrumentModules.set(tabId, mod);
    } catch (err) {
      console.error(`[main] Failed to load instrument ${tabId}:`, err);
    }
  }

  const mod = instrumentModules.get(tabId);
  if (mod && mod.init) {
    if (activeInstrument && activeInstrument.destroy) {
      try { activeInstrument.destroy(); } catch (_) {}
    }
    activeInstrument = mod;
    try { mod.init(state, SensorBus, Utils, Permissions); } catch (err) {
      console.error(`[main] Instrument ${tabId} init error:`, err);
    }
  } else if (mod && mod.activate) {
    try { mod.activate(state, SensorBus, Utils, Permissions); } catch (err) {
      console.error(`[main] Instrument ${tabId} activate error:`, err);
    }
  }

  updateDiagnostics();
}

/* ============================================================
   UNIT TOGGLE
   ============================================================ */

function setupUnitToggle() {
  const btn = document.getElementById('unit-toggle-btn');
  const labels = document.querySelectorAll('.switch-label');

  function updateUI() {
    const isImperial = state.units === 'imperial';
    btn.setAttribute('aria-pressed', isImperial ? 'true' : 'false');
    btn.setAttribute('data-unit', isImperial ? 'imperial' : 'metric');
    labels.forEach(l => {
      const isActive = l.dataset.unit === state.units;
      l.classList.toggle('active', isActive);
    });
  }

  btn.addEventListener('click', () => {
    state.units = state.units === 'metric' ? 'imperial' : 'metric';
    Utils.setUnits(state.units);
    updateUI();
    SensorBus.emit('unitschange', state.units);
    updateDiagnostics();
  });

  Utils.onUnitsChange((u) => {
    state.units = u;
    updateUI();
  });

  updateUI();
}

/* ============================================================
   THEME TOGGLE
   ============================================================ */

function setupThemeToggle() {
  Theme.loadSaved();
  const btn = document.getElementById('theme-toggle-btn');
  btn.addEventListener('click', () => {
    Theme.toggle();
    const isLight = Theme.get() === 'light';
    btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
    btn.setAttribute('data-theme', isLight ? 'light' : 'dark');
    document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  });
  window.addEventListener('themechange', () => {
    const isLight = Theme.get() === 'light';
    if (btn) {
      btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
      btn.setAttribute('data-theme', isLight ? 'light' : 'dark');
    }
    document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
    updateDiagnostics();
  });
}

/* ============================================================
   TAB BAR WIRING
   ============================================================ */

function setupTabBar() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (tabId && tabId !== state.activeTab) {
        switchTab(tabId);
      }
    });
  });
}

/* ============================================================
   GEOLOCATION — shared for all instruments
   ============================================================ */

function startLocationTracking() {
  if (state.gpsWatchId !== null) return;
  const permState = Permissions.getPermission('geolocation');
  if (permState !== 'granted') {
    // Try to request it
    Permissions.requestGeolocation().then(granted => {
      if (granted) startLocationTracking();
    });
    return;
  }

  Permissions.watchPosition(
    (pos) => {
      state.location = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude,
        altitudeAccuracy: pos.coords.altitudeAccuracy,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        timestamp: pos.timestamp,
      };
      SensorBus.emit('location', state.location);
    },
    (err) => {
      if (err.code === 1) {
        Permissions.setPermission('geolocation', 'denied');
        SensorBus.emit('locationdenied');
      }
    }
  ).then(id => { state.gpsWatchId = id; });
}

/* ============================================================
   PERMISSION CHANGE ANNOUNCEMENTS (ARIA)
   ============================================================ */

function setupPermissionAnnouncements() {
  let previousState = Permissions.allPermissions();

  Permissions.onPermissionChange((permState) => {
    updateDiagnostics();

    // ARIA live region for screen readers
    const announcer = document.getElementById('perm-announcer') ||
      (() => {
        const el = document.createElement('div');
        el.id = 'perm-announcer';
        el.className = 'sr-only';
        el.setAttribute('aria-live', 'assertive');
        document.body.appendChild(el);
        return el;
      })();

    const changes = [];
    for (const sensor of ['orientation', 'motion', 'microphone', 'geolocation']) {
      if (permState[sensor] !== previousState[sensor]) {
        changes.push(`${sensor}: ${permState[sensor]}`);
      }
    }
    if (changes.length > 0) {
      announcer.textContent = `Sensor permission changed: ${changes.join(', ')}`;
    }
    previousState = permState;
  });
}

/* ============================================================
   INIT
   ============================================================ */

let permissions = Permissions; // alias for the permission announcer

async function init() {
  // HTTPS check
  checkHTTPS();

  // Viewport lock
  installViewportLock();

  // Load saved theme
  Theme.loadSaved();

  // Galaxy background — guard against null (not loaded on light theme)
  if (Galaxy && typeof Galaxy.init === 'function') {
    try { Galaxy.init(); } catch (_) {}
  }

  // Detect capabilities early
  state.caps = Permissions.detectCapabilities();

  // Handle URL hash — restore tab on back/forward/refresh
  const initTab = location.hash.replace('#', '') || 'stars';

  // Logo click — reset to STARS tab
  const logoLink = document.querySelector('.logo-link');
  if (logoLink) {
    logoLink.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('stars');
    });
  }

  // Set up UI
  setupTabBar();
  setupUnitToggle();
  setupThemeToggle();

  // Handle hash changes (back/forward navigation)
  window.addEventListener('hashchange', () => {
    const tab = location.hash.replace('#', '');
    if (tab && tab !== state.activeTab && ['stars','sound','vibration','magnetic','altimeter'].includes(tab)) {
      switchTab(tab);
    }
  });

  // Switch to default tab (if not already switched via hash)
  if (!location.hash || location.hash === '#stars') {
    switchTab('stars');
  } else if (initTab !== 'stars') {
    switchTab(initTab);
  }

  // Permission announcements
  setupPermissionAnnouncements();

  // Start location if already granted
  Permissions.queryGeolocationPermission().then(state => {
    if (state === 'granted') startLocationTracking();
  });

  // Periodic diagnostics refresh
  setInterval(updateDiagnostics, 30000);

  // Handle resize — re-render active instrument
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (activeInstrument && activeInstrument.onResize) {
        try { activeInstrument.onResize(state, SensorBus, Utils, Permissions); } catch (_) {}
      }
    }, 100);
  });
}

// Boot
document.addEventListener('DOMContentLoaded', init);
// Also boot immediately if DOM already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
}
