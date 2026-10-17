#!/usr/bin/env python3
"""Build magnetic.js and altimeter.js"""

# ==================== magnetic.js ====================

mag_js = r'''/* ============================================================
   instruments/magnetic.js — Magnetic Field Mapper
   Classic script. No imports.
   ============================================================ */

(function() {
'use strict';

var Mag = {};
window.FI.magnetic = Mag;

var state = {
  active: false,
  measuring: false,
  x: 0, y: 0, z: 0,
  total: 0,
  baseline: null,
  anomaly: 0,
  threshold: 5,
  heatPoints: [],
  maxHeatPoints: 500,
  animId: null,
  toneOn: false,
  hapticOn: false,
  audioCtx: null,
  osc: null,
  usingSensor: false
};

var els = {};
var heatCanvas = null;
var heatCtx = null;

function init() {
  els.toggleBtn = document.getElementById('mag-toggle-btn');
  els.xEl = document.getElementById('mag-x');
  els.yEl = document.getElementById('mag-y');
  els.zEl = document.getElementById('mag-z');
  els.totalEl = document.getElementById('mag-total');
  els.vsEarth = document.getElementById('mag-vs-earth');
  els.deviationDir = document.getElementById('mag-deviation-dir');
  els.anomalyVal = document.getElementById('mag-anomaly-val');
  els.anomalyFill = document.getElementById('mag-anomaly-fill');
  els.thresholdSlider = document.getElementById('mag-threshold');
  els.thresholdDisplay = document.getElementById('mag-threshold-display');
  els.waveCanvas = document.getElementById('mag-wave-canvas');
  els.heatCanvas = document.getElementById('mag-heat-canvas');
  els.fpsEl = document.getElementById('mag-fps');
  els.calibrateBtn = document.getElementById('mag-calibrate-btn');
  els.resetTrailBtn = document.getElementById('mag-reset-trail-btn');
  els.toneBtn = document.getElementById('mag-tone-btn');
  els.hapticBtn = document.getElementById('mag-haptic-btn');
  els.status = document.getElementById('mag-status');

  heatCanvas = els.heatCanvas;
  heatCtx = heatCanvas ? heatCanvas.getContext('2d') : null;

  if (els.toggleBtn) els.toggleBtn.addEventListener('click', toggleMeasurement);
  if (els.calibrateBtn) els.calibrateBtn.addEventListener('click', calibrate);
  if (els.resetTrailBtn) els.resetTrailBtn.addEventListener('click', resetTrail);
  if (els.toneBtn) els.toneBtn.addEventListener('click', toggleTone);
  if (els.hapticBtn) els.hapticBtn.addEventListener('click', toggleHaptic);
  if (els.thresholdSlider) {
    els.thresholdSlider.addEventListener('input', function() {
      state.threshold = parseFloat(els.thresholdSlider.value);
      if (els.thresholdDisplay) els.thresholdDisplay.textContent = state.threshold.toFixed(1) + ' \u00b5T';
    });
  }

  // Heat canvas pointer events
  if (heatCanvas) {
    heatCanvas.addEventListener('pointermove', function(e) {
      if (state.measuring && e.pointerType === 'touch' || e.pointerType === 'mouse') {
        var rect = heatCanvas.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width;
        var py = (e.clientY - rect.top) / rect.height;
        paintHeatPixel(px, py, state.total);
      }
    });
    heatCanvas.addEventListener('pointerdown', function(e) {
      state.draggingHeat = true;
    });
    window.addEventListener('pointerup', function() {
      state.draggingHeat = false;
    });
  }
}

function toggleMeasurement() {
  if (state.measuring) stopMeasurement();
  else startMeasurement();
}

function startMeasurement() {
  if (state.measuring) return;
  els.toggleBtn.textContent = 'Stop Measurement';

  // Try Magnetometer (Generic Sensor)
  if (window.Magnetometer) {
    try {
      state.sensor = new Magnetometer({ frequency: 60 });
      state.sensor.onreading = function() {
        addSample(state.sensor.x, state.sensor.y, state.sensor.z);
      };
      state.sensor.start();
      state.usingSensor = true;
      updateStatus('Magnetometer active');
      startLoop();
      return;
    } catch (e) {}
  }

  // Try UncalibratedMagnetometer
  if (window.UncalibratedMagnetometer) {
    try {
      state.sensor = new UncalibratedMagnetometer({ frequency: 60 });
      state.sensor.onreading = function() {
        addSample(state.sensor.x, state.sensor.y, state.sensor.z);
      };
      state.sensor.start();
      state.usingSensor = true;
      updateStatus('UncalibratedMagnetometer active');
      startLoop();
      return;
    } catch (e) {}
  }

  // Fallback
  if (els.toggleBtn) els.toggleBtn.textContent = 'Start Measurement';
  if (window.FI.demo && window.FI.demo.isEnabled()) {
    startDemoSensor();
  } else {
    if (els.status) els.status.textContent = 'No magnetometer available on this device';
  }
}

function stopMeasurement() {
  state.measuring = false;
  if (state.sensor) {
    try { state.sensor.stop(); } catch (e) {}
    state.sensor = null;
  }
  if (state.animId) {
    cancelAnimationFrame(state.animId);
    state.animId = null;
  }
  if (state.osc) {
    try { state.osc.stop(); } catch (e) {}
    state.osc = null;
  }
  if (state.audioCtx) {
    try { state.audioCtx.close(); } catch (e) {}
    state.audioCtx = null;
  }
  els.toggleBtn.textContent = 'Start Measurement';
  updateStatus('Stopped');
}

function startDemoSensor() {
  state.measuring = true;
  els.toggleBtn.textContent = 'Stop Measurement';
  updateStatus('SIMULATED');
  startLoop();
}

function addSample(x, y, z) {
  state.x = x;
  state.y = y;
  state.z = z;
  state.total = Math.sqrt(x * x + y * y + z * z);

  // Baseline calibration
  if (state.baseline) {
    var diffX = x - state.baseline.x;
    var diffY = y - state.baseline.y;
    var diffZ = z - state.baseline.z;
    var diffTotal = Math.sqrt(diffX * diffX + diffY * diffY + diffZ * diffZ);
    state.anomaly = diffTotal;
  } else {
    state.anomaly = 0;
  }

  updateReadouts();
}

function calibrate() {
  state.baseline = { x: state.x, y: state.y, z: state.z, total: state.total };
  updateStatus('Calibrated at ' + state.total.toFixed(1) + ' \u00b5T');
}

function resetTrail() {
  state.heatPoints = [];
  if (heatCtx) {
    var rect = heatCanvas.getBoundingClientRect();
    heatCtx.clearRect(0, 0, rect.width, rect.height);
  }
}

function toggleTone() {
  state.toneOn = !state.toneOn;
  var label = els.toneBtn.querySelector('.label');
  if (label) label.textContent = state.toneOn ? 'Tone: On' : 'Tone: Off';
  if (state.toneOn && !state.audioCtx) {
    try {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      state.osc = state.audioCtx.createOscillator();
      state.osc.type = 'square';
      state.osc.frequency.value = 800;
      state.osc.connect(state.audioCtx.destination);
      state.osc.start();
    } catch (e) {
      state.toneOn = false;
      if (label) label.textContent = 'Tone: Off';
    }
  } else if (!state.toneOn && state.osc) {
    try { state.osc.stop(); } catch (e) {}
    state.osc = null;
  }
}

function toggleHaptic() {
  state.hapticOn = !state.hapticOn;
  var label = els.hapticBtn.querySelector('.label');
  if (label) label.textContent = state.hapticOn ? 'Haptic: On' : 'Haptic: Off';
}

function updateReadouts() {
  var fmt = function(v) { return isFinite(v) ? v.toFixed(2) : '\u2014'; };
  if (els.xEl) els.xEl.textContent = fmt(state.x);
  if (els.yEl) els.yEl.textContent = fmt(state.y);
  if (els.zEl) els.zEl.textContent = fmt(state.z);
  if (els.totalEl) els.totalEl.textContent = fmt(state.total);

  var earthField = 48;
  var vsEarth = state.total - earthField;
  if (els.vsEarth) els.vsEarth.textContent = fmt(vsEarth) + ' \u00b5T';

  var dirText = '';
  if (Math.abs(vsEarth) > 0.5) {
    if (vsEarth > 0) dirText = '\u2191 stronger than baseline';
    else dirText = '\u2193 weaker than baseline';
  } else {
    dirText = 'at baseline';
  }
  if (els.deviationDir) els.deviationDir.textContent = dirText;

  if (els.anomalyVal) els.anomalyVal.textContent = fmt(state.anomaly) + ' \u00b5T';

  // Anomaly bar
  if (els.anomalyFill) {
    var pct = Math.min(100, (state.anomaly / state.threshold) * 100);
    els.anomalyFill.style.width = pct + '%';
    var fill = els.anomalyFill.querySelector('.anomaly-bar-fill');
    if (fill) {
      if (state.anomaly > state.threshold) fill.className = 'anomaly-bar-fill danger';
      else if (state.anomaly > state.threshold * 0.7) fill.className = 'anomaly-bar-fill warning';
      else fill.className = 'anomaly-bar-fill';
    }
  }

  // Tone pitch
  if (state.toneOn && state.osc && state.audioCtx) {
    var pitch = 200 + (state.anomaly / state.threshold) * 800;
    try { state.osc.frequency.value = Math.min(1000, pitch); } catch (e) {}
  }

  // Haptic
  if (state.hapticOn && state.anomaly > state.threshold && navigator.vibrate) {
    navigator.vibrate(50);
  }
}

function paintHeatPixel(px, py, value) {
  if (!heatCtx || !heatCanvas) return;
  var rect = heatCanvas.getBoundingClientRect();
  var x = px * rect.width;
  var y = py * rect.height;
  var radius = 8;
  var intensity = Math.min(1, value / 100);

  // Color ramp: violet -> cyan -> gold -> white
  var r = Math.min(255, Math.floor(intensity * 255));
  var g = Math.min(255, Math.floor(intensity * 200));
  var b = Math.min(255, Math.floor((1 - intensity) * 168 + intensity * 255));

  heatCtx.globalAlpha = 0.4;
  heatCtx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
  heatCtx.beginPath();
  heatCtx.arc(x, y, radius, 0, 6.2831853);
  heatCtx.fill();
  heatCtx.globalAlpha = 1;

  state.heatPoints.push({ x: x, y: y, v: value });
  if (state.heatPoints.length > state.maxHeatPoints) {
    state.heatPoints.shift();
  }
}

function drawHeatTrail() {
  if (!heatCtx || !heatCanvas) return;
  var rect = heatCanvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  if (state.heatPoints.length > 0) {
    // Draw accumulated trail
    for (var i = 0; i < state.heatPoints.length; i++) {
      var p = state.heatPoints[i];
      var intensity = Math.min(1, p.v / 100);
      var r = Math.min(255, Math.floor(intensity * 255));
      var g = Math.min(255, Math.floor(intensity * 200));
      var b = Math.min(255, Math.floor((1 - intensity) * 168 + intensity * 255));
      heatCtx.globalAlpha = 0.3 * (1 - i / state.heatPoints.length);
      heatCtx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      heatCtx.beginPath();
      heatCtx.arc(p.x, p.y, 4, 0, 6.2831853);
      heatCtx.fill();
    }
    heatCtx.globalAlpha = 1;
  } else {
    // Idle rolling time-trail
    var now = performance.now() * 0.001;
    for (var t = 0; t < 50; t++) {
      var tx = (Math.sin(now * 0.5 + t * 0.1) * 0.3 + 0.5) * rect.width;
      var ty = (Math.cos(now * 0.3 + t * 0.15) * 0.3 + 0.5) * rect.height;
      var v = 20 + 10 * Math.sin(now + t);
      var intensity = Math.min(1, v / 100);
      var r = Math.floor(intensity * 200);
      var g = Math.floor(intensity * 150);
      var b = Math.floor((1 - intensity) * 168 + 50);
      heatCtx.globalAlpha = 0.15;
      heatCtx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      heatCtx.beginPath();
      heatCtx.arc(tx, ty, 3, 0, 6.2831853);
      heatCtx.fill();
    }
    heatCtx.globalAlpha = 1;
  }
}

function startLoop() {
  if (state.animId) cancelAnimationFrame(state.animId);
  var waveHistory = [];
  function draw() {
    if (!state.active || !state.measuring) return;
    var now = performance.now();

    // FPS
    if (els.fpsEl) els.fpsEl.textContent = '— fps';

    // Waveform
    if (els.waveCanvas) {
      var wRect = els.waveCanvas.getBoundingClientRect();
      if (wRect.width > 0 && wRect.height > 0) {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (els.waveCanvas.width !== Math.round(wRect.width * dpr) ||
            els.waveCanvas.height !== Math.round(wRect.height * dpr)) {
          els.waveCanvas.width = Math.round(wRect.width * dpr);
          els.waveCanvas.height = Math.round(wRect.height * dpr);
        }
        var ctx = els.waveCanvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, wRect.width, wRect.height);

        waveHistory.push({ x: state.x, y: state.y, z: state.z, t: now });
        if (waveHistory.length > 200) waveHistory.shift();

        var w = wRect.width, h = wRect.height;
        var range = Math.max(0.5, Math.max.apply(null, waveHistory.map(function(p) {
          return Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z));
        }))) * 1.2;

        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (var i = 0; i < waveHistory.length; i++) {
          var x = (i / waveHistory.length) * w;
          var y = h / 2 + (waveHistory[i].x / range) * (h / 2) * 0.8;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.strokeStyle = '#ffd700';
        ctx.beginPath();
        for (var i = 0; i < waveHistory.length; i++) {
          var x = (i / waveHistory.length) * w;
          var y = h / 2 + (waveHistory[i].y / range) * (h / 2) * 0.8;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.strokeStyle = '#a855f7';
        ctx.beginPath();
        for (var i = 0; i < waveHistory.length; i++) {
          var x = (i / waveHistory.length) * w;
          var y = h / 2 + (waveHistory[i].z / range) * (h / 2) * 0.8;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // Heat canvas
    drawHeatTrail();

    state.animId = requestAnimationFrame(draw);
  }
  state.animId = requestAnimationFrame(draw);
}

function updateStatus(msg) {
  if (els.status) els.status.textContent = msg || 'Idle';
}

function activate() {
  if (state.active) return;
  state.active = true;
  init();
  updateStatus('Idle');
}

function deactivate() {
  state.active = false;
  if (state.measuring) stopMeasurement();
  if (state.animId) {
    cancelAnimationFrame(state.animId);
    state.animId = null;
  }
}

function destroy() {
  state.active = false;
  deactivate();
  state.heatPoints = [];
  if (heatCtx && heatCanvas) {
    var rect = heatCanvas.getBoundingClientRect();
    heatCtx.clearRect(0, 0, rect.width, rect.height);
  }
}

Mag.init = init;
Mag.activate = activate;
Mag.deactivate = deactivate;
Mag.destroy = destroy;

})();
'''

with open('scripts/instruments/magnetic.js', 'w') as f:
    f.write(mag_js)

# ==================== altimeter.js ====================

alt_js = r'''/* ============================================================
   instruments/altimeter.js — Barometric Altimeter
   Classic script. No imports.
   ============================================================ */

(function() {
'use strict';

var Alt = {};
window.FI.altimeter = Alt;

var state = {
  active: false,
  measuring: false,
  altitude: 0,
  gpsAlt: 0,
  gpsAccuracy: 0,
  baroAlt: 0,
  pressure: 0,
  slp: 1013.25,
  delta: 0,
  trend: '—',
  trendArrow: '\u2014',
  vspeed: 0,
  temperature: 0,
  source: 'Demo',
  watchId: null,
  history: [],
  maxHistory: 600,
  zeroAlt: 0,
  animId: null,
  calPressure: null,
  smoothedAlt: 0,
  prevAlt: 0,
  vspeedBuf: []
};

var els = {};

function init() {
  els.toggleBtn = document.getElementById('alt-export-btn');
  els.zeroBtn = document.getElementById('alt-zero-btn');
  els.resetBtn = document.getElementById('alt-reset-btn');
  els.altitude = document.getElementById('alt-altitude');
  els.altSource = document.getElementById('alt-altitude-source');
  els.gpsAlt = document.getElementById('alt-gps-alt');
  els.gpsUnit = document.getElementById('alt-gps-unit');
  els.gpsAccuracy = document.getElementById('alt-gps-accuracy');
  els.baroAlt = document.getElementById('alt-baro-alt');
  els.baroUnit = document.getElementById('alt-baro-unit');
  els.delta = document.getElementById('alt-delta');
  els.pressure = document.getElementById('alt-pressure');
  els.pressureUnit = document.getElementById('alt-pressure-unit');
  els.slp = document.getElementById('alt-slp');
  els.slpInput = document.getElementById('alt-slp-input');
  els.trend = document.getElementById('alt-trend');
  els.trendArrow = document.getElementById('alt-trend-arrow');
  els.vspeed = document.getElementById('alt-vspeed');
  els.vspeedUnit = document.getElementById('alt-vspeed-unit');
  els.temperature = document.getElementById('alt-temperature');
  els.tempUnit = document.getElementById('alt-temp-unit');
  els.historyCanvas = document.getElementById('alt-history-canvas');
  els.pressureHistoryCanvas = document.getElementById('alt-pressure-history-canvas');
  els.status = document.getElementById('alt-status');

  if (els.zeroBtn) els.zeroBtn.addEventListener('click', function() {
    state.zeroAlt = state.altitude;
    toast('Zero set at ' + state.altitude.toFixed(1) + ' m');
  });
  if (els.resetBtn) els.resetBtn.addEventListener('click', function() {
    state.history = [];
    toast('Log reset');
  });

  if (els.slpInput) {
    els.slpInput.addEventListener('change', function() {
      state.slp = parseFloat(els.slpInput.value) || 1013.25;
    });
  }
}

function toast(msg) {
  var region = document.getElementById('toast-region');
  if (!region) return;
  var el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  region.appendChild(el);
  setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 3000);
}

function startMeasurement() {
  state.measuring = true;
  updateStatus('Collecting data');

  // Check for barometer
  if ('Barometer' in window) {
    try {
      state.barometer = new Barometer({ frequency: 1 });
      state.barometer.onreading = function() {
        state.pressure = state.barometer.value;
        state.temperature = state.barometer.temperature || 20;
        computeBaroAlt();
      };
      state.barometer.start();
      state.source = 'Barometer';
      updateStatus('Barometer active');
      startLoop();
      return;
    } catch (e) {
      state.source = 'GPS + manual pressure';
    }
  }

  // GPS altitude
  if (navigator.geolocation) {
    state.watchId = navigator.geolocation.watchPosition(function(pos) {
      state.gpsAlt = pos.coords.altitude || 0;
      state.gpsAccuracy = pos.coords.altitudeAccuracy || 0;
      state.altitude = state.gpsAlt;
      state.source = 'GPS';
      computeBaroAlt();
    }, function(err) {
      state.source = 'Demo';
      if (window.FI.demo && window.FI.demo.isEnabled()) {
        startDemoAlt();
      } else {
        updateStatus('GPS unavailable — using manual pressure');
      }
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    startLoop();
    return;
  }

  state.source = 'Demo';
  startDemoAlt();
  startLoop();
}

function stopMeasurement() {
  state.measuring = false;
  if (state.watchId) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
  if (state.barometer) {
    try { state.barometer.stop(); } catch (e) {}
    state.barometer = null;
  }
  if (state.animId) {
    cancelAnimationFrame(state.animId);
    state.animId = null;
  }
  updateStatus('Stopped');
}

function startDemoAlt() {
  state.source = 'Demo';
  updateStatus('SIMULATED');
  if (!state.measuring) {
    state.measuring = true;
    startLoop();
  }
}

function computeBaroAlt() {
  if (state.pressure > 0 && state.slp > 0) {
    state.baroAlt = 44330.77 * (1 - Math.pow(state.pressure / state.slp, 0.190263));
  } else {
    state.baroAlt = 0;
  }
  state.delta = state.gpsAlt - state.baroAlt;
  state.altitude = state.baroAlt || state.gpsAlt || 0;
}

function updateStatus(msg) {
  if (els.status) els.status.textContent = msg || 'Idle';
}

function baroFormula(P, P0) {
  if (P <= 0 || P0 <= 0) return 0;
  return 44330.77 * (1 - Math.pow(P / P0, 0.190263));
}

function startLoop() {
  if (state.animId) cancelAnimationFrame(state.animId);
  var hist = state.history;

  function draw() {
    if (!state.active) return;

    var now = performance.now();

    // Demo mode altitude walk
    if (state.source === 'Demo' && state.measuring) {
      var demo = window.FI.demo.generateAlt(now);
      state.altitude = demo.altitude;
      state.pressure = demo.pressure;
      state.slp = demo.slp;
      if (els.slpInput) els.slpInput.value = state.slp.toFixed(2);
      state.gpsAlt = demo.altitude + (Math.random() - 0.5) * 5;
    }

    // Smoothing
    if (state.prevAlt === 0) state.prevAlt = state.altitude;
    var alpha = 0.15;
    state.smoothedAlt = state.smoothedAlt + alpha * (state.altitude - state.smoothedAlt);
    state.prevAlt = state.altitude;

    // Vertical speed
    var dt = 1;
    var rawVspeed = (state.smoothedAlt - state.prevAltSmoothed || 0) / dt;
    state.vspeedBuf.push(rawVspeed);
    if (state.vspeedBuf.length > 30) state.vspeedBuf.shift();
    var avgVspeed = 0;
    for (var i = 0; i < state.vspeedBuf.length; i++) avgVspeed += state.vspeedBuf[i];
    avgVspeed /= state.vspeedBuf.length;
    state.vspeed = avgVspeed;
    state.prevAltSmoothed = state.smoothedAlt;

    // Trend (only if >= 30 min data)
    if (hist.length > 1800) {
      var oldAlt = hist[0].alt || 0;
      var newAlt = state.altitude;
      var change = newAlt - oldAlt;
      if (change > 2) { state.trend = 'Rising'; state.trendArrow = '\u2191'; }
      else if (change < -2) { state.trend = 'Falling'; state.trendArrow = '\u2193'; }
      else { state.trend = 'Stable'; state.trendArrow = '\u2192'; }
    } else {
      state.trend = 'collecting data';
      state.trendArrow = '\u2014';
    }

    // Record history
    hist.push({ alt: state.altitude, pressure: state.pressure, t: now });
    if (hist.length > state.maxHistory) hist.shift();

    updateReadouts();
    drawHistory();
    drawPressureHistory();

    state.animId = requestAnimationFrame(draw);
  }
  state.animId = requestAnimationFrame(draw);
}

function updateReadouts() {
  var fmt = function(v) { return isFinite(v) ? v.toFixed(2) : '\u2014'; };
  var sys = window.FI.units ? window.FI.units.getSystem() : 'metric';
  var altUnit = sys === 'imperial' ? 'ft' : 'm';
  var pressUnit = sys === 'imperial' ? 'inHg' : 'hPa';
  var tempUnit = sys === 'imperial' ? '\u00b0F' : '\u00b0C';
  var speedUnit = sys === 'imperial' ? 'ft/s' : 'm/s';

  var altVal = state.altitude - state.zeroAlt;

  if (els.altitude) els.altitude.textContent = fmt(altVal) + ' ' + altUnit;
  if (els.altSource) els.altSource.textContent = state.source;
  if (els.gpsAlt) {
    var gpsDisplay = sys === 'imperial' ? (state.gpsAlt * 3.28084).toFixed(1) : state.gpsAlt.toFixed(2);
    els.gpsAlt.textContent = gpsDisplay;
    els.gpsUnit.textContent = sys === 'imperial' ? 'ft' : 'm';
    if (els.gpsAccuracy) els.gpsAccuracy.textContent = isFinite(state.gpsAccuracy) ? ''\u00b1' + state.gpsAccuracy.toFixed(1) + ' ' + altUnit : '\u2014';
  }
  if (els.baroAlt) {
    var baroDisplay = sys === 'imperial' ? (state.baroAlt * 3.28084).toFixed(1) : state.baroAlt.toFixed(2);
    els.baroAlt.textContent = baroDisplay;
    els.baroUnit.textContent = altUnit;
  }
  if (els.delta) els.delta.textContent = fmt(state.delta) + ' ' + altUnit;

  var pressDisplay = sys === 'imperial' ? (state.pressure * 0.02953).toFixed(2) : state.pressure.toFixed(2);
  if (els.pressure) els.pressure.textContent = pressDisplay;
  if (els.pressureUnit) els.pressureUnit.textContent = pressUnit;

  if (els.slp) els.slp.textContent = state.slp.toFixed(2);
  if (els.trend) els.trend.textContent = state.trend;
  if (els.trendArrow) els.trendArrow.textContent = state.trendArrow;

  var speedVal = sys === 'imperial' ? (state.vspeed * 3.28084).toFixed(2) : state.vspeed.toFixed(2);
  if (els.vspeed) els.vspeed.textContent = speedVal;
  if (els.vspeedUnit) els.vspeedUnit.textContent = speedUnit;

  var tempVal = sys === 'imperial' ? (state.temperature * 9 / 5 + 32).toFixed(1) : state.temperature.toFixed(1);
  if (els.temperature) els.temperature.textContent = tempVal;
  if (els.tempUnit) els.tempUnit.textContent = tempUnit;
}

function drawHistory() {
  if (!els.historyCanvas) return;
  var rect = els.historyCanvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (els.historyCanvas.width !== Math.round(rect.width * dpr) ||
      els.historyCanvas.height !== Math.round(rect.height * dpr)) {
    els.historyCanvas.width = Math.round(rect.width * dpr);
    els.historyCanvas.height = Math.round(rect.height * dpr);
  }
  var ctx = els.historyCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  var w = rect.width, h = rect.height;
  var visible = state.history.slice(-600);
  if (visible.length < 2) return;

  var minAlt = Infinity, maxAlt = -Infinity;
  for (var i = 0; i < visible.length; i++) {
    if (visible[i].alt < minAlt) minAlt = visible[i].alt;
    if (visible[i].alt > maxAlt) maxAlt = visible[i].alt;
  }
  var range = Math.max(1, maxAlt - minAlt);

  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  for (var i = 0; i < visible.length; i++) {
    var x = (i / visible.length) * w;
    var y = h - ((visible[i].alt - minAlt) / range) * (h - 10) - 5;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Labels
  ctx.fillStyle = 'rgba(168,85,247,0.5)';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(maxAlt.toFixed(1) + ' m', 4, 12);
  ctx.fillText(minAlt.toFixed(1) + ' m', 4, h - 4);
}

function drawPressureHistory() {
  if (!els.pressureHistoryCanvas) return;
  var rect = els.pressureHistoryCanvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (els.pressureHistoryCanvas.width !== Math.round(rect.width * dpr) ||
      els.pressureHistoryCanvas.height !== Math.round(rect.height * dpr)) {
    els.pressureHistoryCanvas.width = Math.round(rect.width * dpr);
    els.pressureHistoryCanvas.height = Math.round(rect.height * dpr);
  }
  var ctx = els.pressureHistoryCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  var w = rect.width, h = rect.height;
  var visible = state.history.slice(-600);
  if (visible.length < 2) return;

  var minP = Infinity, maxP = -Infinity;
  for (var i = 0; i < visible.length; i++) {
    if (visible[i].pressure < minP) minP = visible[i].pressure;
    if (visible[i].pressure > maxP) maxP = visible[i].pressure;
  }
  var range = Math.max(1, maxP - minP);

  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  for (var i = 0; i < visible.length; i++) {
    var x = (i / visible.length) * w;
    var y = h - ((visible[i].pressure - minP) / range) * (h - 10) - 5;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,215,0,0.5)';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(maxP.toFixed(1) + ' hPa', 4, 12);
  ctx.fillText(minP.toFixed(1) + ' hPa', 4, h - 4);
}

function activate() {
  if (state.active) return;
  state.active = true;
  init();
  updateStatus('Idle');
  startMeasurement();
}

function deactivate() {
  state.active = false;
  if (state.measuring) stopMeasurement();
  if (state.animId) {
    cancelAnimationFrame(state.animId);
    state.animId = null;
  }
}

function destroy() {
  state.active = false;
  deactivate();
  state.history = [];
  state.vspeedBuf = [];
}

Alt.init = init;
Alt.activate = activate;
Alt.deactivate = deactivate;
Alt.destroy = destroy;

})();
'''

with open('scripts/instruments/altimeter.js', 'w') as f:
    f.write(alt_js)

print('Wrote magnetic.js and altimeter.js')
