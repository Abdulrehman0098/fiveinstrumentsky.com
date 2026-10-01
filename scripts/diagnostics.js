/* ============================================================
   diagnostics.js — device info, sensor status, error log, GPS
   Classic IIFE, no imports, no exports.
   ============================================================ */

(function () {
'use strict';

var Diagnostics = {
  capabilitiesEl: null, permissionsEl: null, locationEl: null, copyBtn: null,
  instrumentsEl: null, errorLogEl: null, buildInfoEl: null,

  init: function () {
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
    var self = this;
    setInterval(function () { self.updatePermissions(); self.updateLocation(); }, 10000);
  },

  updateCapabilities: function () {
    if (!this.capabilitiesEl) return;
    var items = [
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
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      html += '<li><span class="dot ' + (item.ok ? 'green' : 'red') + '"></span>' + item.name + ' ' + (item.ok ? '\u2713' : '\u2717') + '</li>';
    }
    this.capabilitiesEl.innerHTML = html;
  },

  updatePermissions: function () {
    if (!this.permissionsEl) return;
    var self = this;
    var results = [];
    var tasks = [
      ['Geolocation', window.FI.permissions ? window.FI.permissions.geolocation : null],
      ['Microphone', window.FI.permissions ? window.FI.permissions.microphone : null],
      ['DeviceMotion', window.FI.permissions ? window.FI.permissions.deviceMotion : null],
      ['DeviceOrientation', window.FI.permissions ? window.FI.permissions.deviceOrientation : null],
      ['Magnetometer', window.FI.permissions ? window.FI.permissions.magnetometer : null],
      ['Accelerometer', window.FI.permissions ? window.FI.permissions.accelerometer : null],
      ['Barometer', window.FI.permissions ? window.FI.permissions.barometer : null]
    ];
    var completed = 0;
    for (var i = 0; i < tasks.length; i++) {
      (function (name, fn) {
        if (!fn) { results.push({ name: name, state: 'unsupported' }); completed++; return; }
        fn().then(function (state) { results.push({ name: name, state: state }); completed++; }).catch(function () { results.push({ name: name, state: 'unknown' }); completed++; });
      })(tasks[i][0], tasks[i][1]);
    }
    var checkDone = function () {
      if (completed < tasks.length) return;
      var stateColors = { granted: 'green', denied: 'red', prompt: 'yellow', unsupported: 'gray', insecure: 'red', unknown: 'gray' };
      var html = '';
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        html += '<li><span class="dot ' + (stateColors[r.state] || 'gray') + '"></span>' + r.name + ': ' + r.state + '</li>';
      }
      self.permissionsEl.innerHTML = html;
    };
    checkDone();
  },

  updateLocation: function () {
    if (!this.locationEl) return;
    var cached = window.safeStorage ? window.safeStorage.get('fi-last-gps', null) : null;
    if (cached && cached.lat != null) {
      this.locationEl.textContent = cached.lat.toFixed(5) + ', ' + cached.lon.toFixed(5);
      this.locationEl.dataset.lat = cached.lat;
      this.locationEl.dataset.lon = cached.lon;
    } else {
      this.locationEl.textContent = 'No cached location';
    }
  },

  updateInstruments: function () {
    if (!this.instrumentsEl) return;
    var panels = ['stars', 'sound', 'vibration', 'magnetic', 'altimeter'];
    var html = '';
    for (var i = 0; i < panels.length; i++) {
      var name = panels[i];
      var panel = document.getElementById('panel-' + name);
      if (!panel) { html += name + ': missing<br>'; continue; }
      var chip = panel.querySelector('.mode-chip');
      var badge = panel.querySelector('.sim-badge');
      var mode = chip ? chip.dataset.mode : 'missing';
      var sim = badge && !badge.classList.contains('hidden') ? ' (DEMO)' : '';
      html += name + ': ' + mode + sim + '<br>';
    }
    this.instrumentsEl.innerHTML = html;
  },

  updateBuildInfo: function () {
    if (!this.buildInfoEl) return;
    this.buildInfoEl.innerHTML = 'Field Instruments v1.0.0 NEON GALAXY<br><span style="font-size:0.65rem;color:var(--ink-faint)">' + new Date().toISOString().slice(0, 10) + ' \u00b7 ' + location.protocol + '</span>';
  },

  updateInstrumentState: function (name) { this.updateInstruments(); }
};

window.FI = window.FI || {};
window.FI.diagnostics = Diagnostics;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { Diagnostics.init(); });
} else {
  Diagnostics.init();
}

})();
