/* ============================================================
   diagnostics.js — device info, sensor status, error log, GPS
   ============================================================ */

import { Permissions } from './permissions.js';
import { safeStorage } from './utils.js';

export const Diagnostics = {
  capabilitiesEl: null, permissionsEl: null, locationEl: null, copyBtn: null,
  instrumentsEl: null, errorLogEl: null, buildInfoEl: null,

  init() {
    this.capabilitiesEl = document.getElementById('diagnostics-capabilities');
    this.permissionsEl = document.getElementById('diagnostics-permissions');
    this.locationEl = document.getElementById('diagnostics-location');
    this.copyBtn = document.getElementById('diagnostics-copy-location');
    this.instrumentsEl = document.getElementById('diagnostics-instruments');
    this.errorLogEl = document.getElementById('diagnostics-error-log');
    this.buildInfoEl = document.getElementById('diagnostics-app-info');
    this.updateCapabilities();
    this.updatePermissions();
    this.updateLocation();
    this.updateInstruments();
    this.updateBuildInfo();
    setInterval(() => { this.updatePermissions(); this.updateLocation(); }, 10000);
  },

  updateCapabilities() {
    if (!this.capabilitiesEl) return;
    const items = [
      { name: 'Secure context', ok: location.protocol === 'https:' || (location.protocol === 'http:' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) },
      { name: 'Geolocation', ok: 'geolocation' in navigator },
      { name: 'Microphone', ok: 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices },
      { name: 'DeviceMotion', ok: 'DeviceMotionEvent' in window },
      { name: 'DeviceOrientation', ok: 'DeviceOrientationEvent' in window },
      { name: 'Accelerometer', ok: 'Accelerometer' in window },
      { name: 'LinearAccel.', ok: 'LinearAccelerationSensor' in window },
      { name: 'Magnetometer', ok: 'Magnetometer' in window || 'UncalibratedMagnetometer' in window },
      { name: 'Barometer', ok: 'Barometer' in window },
      { name: 'Screen Wake Lock', ok: 'wakeLock' in navigator },
      { name: 'Service Worker', ok: 'serviceWorker' in navigator },
      { name: 'Audio', ok: 'AudioContext' in window || 'webkitAudioContext' in window },
      { name: 'Haptic', ok: 'vibrate' in navigator }
    ];
    this.capabilitiesEl.innerHTML = items.map(i => `<li><span class="dot ${i.ok ? 'green' : 'red'}"></span>${i.name} ${i.ok ? '✓' : '✗'}</li>`).join('');
  },

  async updatePermissions() {
    if (!this.permissionsEl) return;
    const results = [];
    for (const [name, fn] of [['Geolocation', Permissions.geolocation], ['Microphone', Permissions.microphone], ['DeviceMotion', Permissions.deviceMotion], ['DeviceOrientation', Permissions.deviceOrientation], ['Magnetometer', Permissions.magnetometer], ['Accelerometer', Permissions.accelerometer], ['Barometer', Permissions.barometer]]) {
      try { results.push({ name, state: await fn() }); } catch (_) { results.push({ name, state: 'unknown' }); }
    }
    const stateColors = { granted: 'green', denied: 'red', prompt: 'yellow', unsupported: 'gray', insecure: 'red', unknown: 'gray' };
    this.permissionsEl.innerHTML = results.map(r => `<li><span class="dot ${stateColors[r.state] || 'gray'}"></span>${r.name}: ${r.state}</li>`).join('');
  },

  updateLocation() {
    if (!this.locationEl) return;
    const cached = safeStorage.get('fi-last-gps', null);
    if (cached && cached.lat != null) {
      this.locationEl.textContent = cached.lat.toFixed(5) + ', ' + cached.lon.toFixed(5);
      this.locationEl.dataset.lat = cached.lat;
      this.locationEl.dataset.lon = cached.lon;
    } else {
      this.locationEl.textContent = 'No cached location';
    }
  },

  updateInstruments() {
    if (!this.instrumentsEl) return;
    const panels = ['stars', 'sound', 'vibration', 'magnetic', 'altimeter'];
    this.instrumentsEl.innerHTML = panels.map(name => {
      const panel = document.getElementById('panel-' + name);
      if (!panel) return name + ': missing';
      const chip = panel.querySelector('.mode-chip');
      const badge = panel.querySelector('.sim-badge');
      const mode = chip ? chip.dataset.mode : 'missing';
      const sim = badge && !badge.classList.contains('hidden') ? ' (DEMO)' : '';
      return name + ': ' + mode + sim;
    }).join('<br>');
  },

  updateBuildInfo() {
    if (!this.buildInfoEl) return;
    this.buildInfoEl.innerHTML = 'Field Instruments v1.0.0 NEON GALAXY<br><span style="font-size:0.65rem;color:var(--ink-faint)">' + new Date().toISOString().slice(0, 10) + ' · ' + location.protocol + '</span>';
  },

  updateInstrumentState(name) { this.updateInstruments(); }
};
