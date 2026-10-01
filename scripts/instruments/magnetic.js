(function () {
  'use strict';
  window.FI = window.FI || {};

  var EARTH_FIELD = 48;   // uT, nominal total field

  var state = {
    active: false,
    measuring: false,
    demo: false,
    live: false,
    x: 0, y: 0, z: 0,
    total: 0,
    baseline: null,
    anomaly: 0,
    threshold: 150,
    heatPoints: [],
    maxHeatPoints: 500,
    rafId: null,
    toneOn: false,
    hapticOn: false,
    audioCtx: null,
    osc: null,
    demoT: 0,
    lastSampleAt: 0
  };

  var els = {};
  var heatCanvas = null, heatCtx = null;
  var waveHistory = [];
  var lastFrame = 0;

  /* ------------------------------------------------------------------ */

  function updateStatus(text, chip) {
    var s = document.getElementById('mag-status');
    if (s) s.textContent = text || '';
    var c = document.getElementById('panel-magnetic');
    if (c && chip) {
      var chipEl = c.querySelector('.mode-chip');
      if (chipEl) { chipEl.textContent = chip; chipEl.setAttribute('data-mode', chip.toLowerCase()); }
    }
  }

  function setBadge(visible) {
    var badge = document.querySelector('#panel-magnetic .sim-badge');
    if (badge) badge.classList.toggle('hidden', !visible);
  }

  function removeAlertBanner() {
    // Hardware absence is not an error state - it is demo mode.
    var banner = document.querySelector('#panel-magnetic .alert-banner, #panel-magnetic .warn-banner, #panel-magnetic .mag-banner');
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
  }

  function drawEmpty(canvas, message) {
    if (!canvas) return;
    var r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    var c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = 'rgba(2,4,10,0.7)'; c.fillRect(0, 0, r.width, r.height);
    c.strokeStyle = 'rgba(0,240,255,0.08)'; c.lineWidth = 1;
    for (var x = 0; x < r.width; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, r.height); c.stroke(); }
    for (var y = 0; y < r.height; y += 30) { c.beginPath(); c.moveTo(0, y); c.lineTo(r.width, y); c.stroke(); }
    c.fillStyle = 'rgba(232,237,255,0.4)'; c.font = '12px ui-sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(message, r.width / 2, r.height / 2);
  }

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

    if (els.toggleBtn && !els.toggleBtn._bound) {
      els.toggleBtn._bound = true;
      els.toggleBtn.addEventListener('click', toggleMeasurement);
    }
    if (els.calibrateBtn) els.calibrateBtn.addEventListener('click', calibrate);
    if (els.resetTrailBtn) els.resetTrailBtn.addEventListener('click', resetTrail);
    if (els.toneBtn) els.toneBtn.addEventListener('click', toggleTone);
    if (els.hapticBtn) els.hapticBtn.addEventListener('click', toggleHaptic);
    if (els.thresholdSlider) els.thresholdSlider.addEventListener('input', function () {
      state.threshold = parseFloat(els.thresholdSlider.value);
      if (els.thresholdDisplay) els.thresholdDisplay.textContent = state.threshold.toFixed(0) + ' \u00b5T';
    });

    if (heatCanvas) {
      heatCanvas.addEventListener('pointermove', function (e) {
        if (state.measuring) {
          var rect = heatCanvas.getBoundingClientRect();
          var px = (e.clientX - rect.left) / rect.width;
          var py = (e.clientY - rect.top) / rect.height;
          paintHeatPixel(px, py, state.total);
        }
      });
    }

    drawEmpty(els.waveCanvas, 'No data yet \u2014 press Start');
    drawEmpty(els.heatCanvas, 'No data yet \u2014 press Start');
  }

  /* ------------------------------------------------------------------ */
  /* Start / stop                                                        */
  /* ------------------------------------------------------------------ */

  function toggleMeasurement() {
    if (state.measuring) stopMeasurement(); else startMeasurement();
  }

  function startMeasurement() {
    if (state.measuring) return;
    if (els.toggleBtn) els.toggleBtn.textContent = 'Stop Measurement';
    state.measuring = true;
    state.live = false;
    state.demo = false;
    waveHistory = [];

    removeAlertBanner();
    updateStatus('Starting magnetometer\u2026', 'idle');

    var ok = false;

    if (typeof window.Magnetometer === 'function') {
      try {
        var sensor = new window.Magnetometer({ frequency: 60 });
        state.sensor = sensor;
        sensor.addEventListener('reading', function () {
          addSample(sensor.x, sensor.y, sensor.z);
          if (!state.live) {
            state.live = true; state.demo = false;
            setBadge(false);
            updateStatus('Magnetometer active', 'LIVE');
          }
        });
        sensor.addEventListener('error', function () { fallbackToDemo(); });
        sensor.start();
        ok = true;
        updateStatus('Magnetometer active', 'LIVE');
      } catch (e) {
        console.warn('[mag] Magnetometer failed', e);
        ok = false;
      }
    }

    if (!ok && typeof window.UncalibratedMagnetometer === 'function') {
      try {
        var raw = new window.UncalibratedMagnetometer({ frequency: 60 });
        state.sensor = raw;
        raw.addEventListener('reading', function () {
          addSample(raw.x, raw.y, raw.z);
          if (!state.live) {
            state.live = true; state.demo = false;
            setBadge(false);
            updateStatus('UncalibratedMagnetometer active', 'LIVE');
          }
        });
        raw.addEventListener('error', function () { fallbackToDemo(); });
        raw.start();
        ok = true;
        updateStatus('UncalibratedMagnetometer active', 'LIVE');
      } catch (e) {
        console.warn('[mag] UncalibratedMagnetometer failed', e);
        ok = false;
      }
    }

    if (!ok) fallbackToDemo();

    startLoop();
  }

  function fallbackToDemo() {
    if (state.demo) return;
    state.demo = true;
    state.live = false;
    removeAlertBanner();
    setBadge(true);
    updateStatus('Demo \u2014 synthetic 48 \u00b5T field (no magnetometer)', 'demo');
  }

  function stopMeasurement() {
    state.measuring = false;
    state.demo = false;
    state.live = false;
    if (state.sensor) { try { state.sensor.stop(); } catch (e) {} state.sensor = null; }
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
    if (state.osc) { try { state.osc.stop(); } catch (e) {} state.osc = null; }
    if (state.audioCtx) { try { state.audioCtx.close(); } catch (e) {} state.audioCtx = null; }
    if (els.toggleBtn) els.toggleBtn.textContent = 'Start Measurement';
    setBadge(false);
    updateStatus('Idle \u2014 press Start to begin', 'IDLE');
  }

  /* ------------------------------------------------------------------ */
  /* Samples                                                             */
  /* ------------------------------------------------------------------ */

  function addSample(x, y, z) {
    state.x = x; state.y = y; state.z = z;
    state.total = Math.sqrt(x * x + y * y + z * z);
    if (state.baseline) {
      var dx = x - state.baseline.x, dy = y - state.baseline.y, dz = z - state.baseline.z;
      state.anomaly = Math.sqrt(dx * dx + dy * dy + dz * dz);
    } else {
      state.anomaly = 0;
    }
    state.lastSampleAt = performance.now();
    updateReadouts();
  }

  // Synthetic 48 uT field: slow tilt + anomalies, constant magnitude.
  function nextDemoSample() {
    state.demoT += 1 / 60;
    var t = state.demoT;
    // Walk a unit vector around the sphere; scale to exactly EARTH_FIELD.
    var theta = t * 0.10;
    var phi = 0.9 + 0.35 * Math.sin(t * 0.05);
    var ux = Math.sin(phi) * Math.cos(theta);
    var uy = Math.sin(phi) * Math.sin(theta);
    var uz = Math.cos(phi);
    var burst = Math.random() > 0.95 ? 8 * (Math.random() - 0.5) : 0;
    return {
      x: ux * EARTH_FIELD + (Math.random() - 0.5) * 0.6,
      y: uy * EARTH_FIELD + (Math.random() - 0.5) * 0.6,
      z: uz * EARTH_FIELD + burst + (Math.random() - 0.5) * 0.6
    };
  }

  function calibrate() {
    state.baseline = { x: state.x, y: state.y, z: state.z, total: state.total };
    updateStatus('Calibrated at ' + state.total.toFixed(1) + ' \u00b5T');
  }

  function resetTrail() {
    state.heatPoints = [];
    if (heatCtx && heatCanvas) {
      var rect = heatCanvas.getBoundingClientRect();
      heatCtx.setTransform(1, 0, 0, 1, 0, 0);
      heatCtx.clearRect(0, 0, heatCanvas.width, heatCanvas.height);
      drawEmpty(heatCanvas, 'Heat map \u2014 drag here while measuring');
    }
  }

  function toggleTone() {
    state.toneOn = !state.toneOn;
    var label = els.toneBtn ? els.toneBtn.querySelector('.label') : null;
    if (label) label.textContent = state.toneOn ? 'Tone: On' : 'Tone: Off';
    if (state.toneOn && !state.audioCtx) {
      try {
        state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        state.osc = state.audioCtx.createOscillator();
        state.osc.type = 'square'; state.osc.frequency.value = 800;
        state.osc.connect(state.audioCtx.destination); state.osc.start();
      } catch (e) { state.toneOn = false; if (label) label.textContent = 'Tone: Off'; }
    } else if (!state.toneOn && state.osc) {
      try { state.osc.stop(); } catch (e) {} state.osc = null;
    }
  }

  function toggleHaptic() {
    state.hapticOn = !state.hapticOn;
    var label = els.hapticBtn ? els.hapticBtn.querySelector('.label') : null;
    if (label) label.textContent = state.hapticOn ? 'Haptic: On' : 'Haptic: Off';
  }

  function updateReadouts() {
    var fmt = function (v) { return isFinite(v) ? v.toFixed(2) : '\u2014'; };
    if (els.xEl) els.xEl.textContent = fmt(state.x);
    if (els.yEl) els.yEl.textContent = fmt(state.y);
    if (els.zEl) els.zEl.textContent = fmt(state.z);
    if (els.totalEl) els.totalEl.textContent = fmt(state.total);

    var vsEarth = state.total - EARTH_FIELD;
    if (els.vsEarth) els.vsEarth.textContent = fmt(vsEarth) + ' \u00b5T';
    var dirText = 'at baseline';
    if (Math.abs(vsEarth) > 0.5) dirText = vsEarth > 0 ? '\u2191 stronger than Earth' : '\u2193 weaker than Earth';
    if (els.deviationDir) els.deviationDir.textContent = dirText;

    if (els.anomalyVal) els.anomalyVal.textContent = fmt(state.anomaly) + ' \u00b5T';
    if (els.anomalyFill) {
      var pct = Math.min(100, (state.anomaly / state.threshold) * 100);
      els.anomalyFill.style.width = pct + '%';
      els.anomalyFill.classList.toggle('danger', state.anomaly > state.threshold);
      els.anomalyFill.classList.toggle('warning', state.anomaly > state.threshold * 0.7 && state.anomaly <= state.threshold);
    }

    if (state.toneOn && state.osc && state.audioCtx) {
      var pitch = 200 + (state.anomaly / state.threshold) * 800;
      try { state.osc.frequency.value = Math.min(1000, pitch); } catch (e) {}
    }
    if (state.hapticOn && state.anomaly > state.threshold && navigator.vibrate) navigator.vibrate(50);
  }

  /* ------------------------------------------------------------------ */
  /* Heat map                                                            */
  /* ------------------------------------------------------------------ */

  function paintHeatPixel(px, py, value) {
    if (!heatCtx || !heatCanvas) return;
    var rect = heatCanvas.getBoundingClientRect();
    var x = px * rect.width, y = py * rect.height;
    var intensity = Math.min(1, value / 100);
    heatCtx.globalAlpha = 0.4;
    heatCtx.fillStyle = 'rgb(' + Math.floor(intensity * 255) + ',' + Math.floor(intensity * 200) + ',' + Math.floor((1 - intensity) * 168 + intensity * 255) + ')';
    heatCtx.beginPath(); heatCtx.arc(x, y, 8, 0, 6.2831853); heatCtx.fill();
    heatCtx.globalAlpha = 1;
    state.heatPoints.push({ x: x, y: y, v: value });
    if (state.heatPoints.length > state.maxHeatPoints) state.heatPoints.shift();
  }

  function drawHeatTrail() {
    var p = prepCanvas(els.heatCanvas);
    if (!p) return;
    var c = p.ctx, w = p.w, h = p.h;

    if (state.heatPoints.length > 0) {
      for (var i = 0; i < state.heatPoints.length; i++) {
        var pt = state.heatPoints[i];
        var intensity = Math.min(1, pt.v / 100);
        c.globalAlpha = 0.3 * (1 - i / state.heatPoints.length);
        c.fillStyle = 'rgb(' + Math.floor(intensity * 255) + ',' + Math.floor(intensity * 200) + ',' + Math.floor((1 - intensity) * 168 + intensity * 255) + ')';
        c.beginPath(); c.arc(pt.x, pt.y, 4, 0, 6.2831853); c.fill();
      }
      c.globalAlpha = 1;
    } else {
      // Live trail: the field sample walks across the map.
      c.strokeStyle = 'rgba(168,85,247,0.65)';
      c.lineWidth = 1.4;
      c.beginPath();
      for (var k = 0; k < waveHistory.length; k++) {
        var v = waveHistory[k];
        var x = ((v.x / 60) + 1) / 2 * w;
        var y = ((v.z / 60) + 1) / 2 * h;
        if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
      var last = waveHistory[waveHistory.length - 1];
      if (last) {
        var lx = ((last.x / 60) + 1) / 2 * w;
        var ly = ((last.z / 60) + 1) / 2 * h;
        c.fillStyle = '#a855f7';
        c.shadowColor = '#a855f7'; c.shadowBlur = 8;
        c.beginPath(); c.arc(lx, ly, 4, 0, 6.2831853); c.fill();
        c.shadowBlur = 0;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Waveform                                                            */
  /* ------------------------------------------------------------------ */

  function prepCanvas(canvas) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    var c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, rect.width, rect.height);
    return { ctx: c, w: rect.width, h: rect.height };
  }

  function drawWave() {
    var p = prepCanvas(els.waveCanvas);
    if (!p) return;
    if (waveHistory.length < 2) { drawEmpty(els.waveCanvas, 'Waiting for samples\u2026'); return; }

    var c = p.ctx, w = p.w, h = p.h;
    var range = 1;
    for (var i = 0; i < waveHistory.length; i++) {
      var v = waveHistory[i];
      var m = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));
      if (m > range) range = m;
    }
    range *= 1.15;

    var axes = [{ k: 'x', col: '#00f0ff' }, { k: 'y', col: '#ffd700' }, { k: 'z', col: '#a855f7' }];
    for (var a = 0; a < axes.length; a++) {
      c.strokeStyle = axes[a].col;
      c.lineWidth = 1.4;
      c.shadowColor = axes[a].col;
      c.shadowBlur = 4;
      c.beginPath();
      for (i = 0; i < waveHistory.length; i++) {
        var x = (i / (waveHistory.length - 1)) * w;
        var y = h / 2 + (waveHistory[i][axes[a].k] / range) * (h / 2) * 0.85;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
    c.shadowBlur = 0;

    c.font = '9px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillStyle = '#00f0ff'; c.fillText('X', 4, 4);
    c.fillStyle = '#ffd700'; c.fillText('Y', 4, 16);
    c.fillStyle = '#a855f7'; c.fillText('Z', 4, 28);
  }

  /* ------------------------------------------------------------------ */
  /* Loop                                                                */
  /* ------------------------------------------------------------------ */

  function startLoop() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    lastFrame = 0;

    function draw(ts) {
      if (!state.measuring || !state.active) { state.rafId = null; return; }
      state.rafId = requestAnimationFrame(draw);
      if (ts - lastFrame < 33) return;
      lastFrame = ts;

      // Watchdog: never stay LIVE with no data.
      if (!state.demo && state.lastSampleAt && (performance.now() - state.lastSampleAt) > 500) {
        fallbackToDemo();
      }

      if (state.demo) {
        var s = nextDemoSample();
        addSample(s.x, s.y, s.z);
      }

      waveHistory.push({ x: state.x, y: state.y, z: state.z });
      if (waveHistory.length > 256) waveHistory.shift();

      if (els.fpsEl) els.fpsEl.textContent = '30 fps';
      drawWave();
      drawHeatTrail();
    }
    state.rafId = requestAnimationFrame(draw);
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  function activate() {
    if (state.active) return;
    state.active = true;
    init();
    updateStatus('Idle \u2014 press Start to begin', 'IDLE');
    // Demo mode on -> data flows immediately, no red banner, purple chip.
    var badge = document.querySelector('#panel-magnetic .sim-badge');
    if (badge && !badge.classList.contains('hidden')) startMeasurement();
  }

  function deactivate() {
    state.active = false;
    if (state.measuring) stopMeasurement();
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
  }

  window.FI.magnetic = {
    activate: activate,
    deactivate: deactivate,
    init: activate,
    destroy: deactivate,
    toggle: toggleMeasurement,
    start: startMeasurement,
    stop: stopMeasurement,
    state: state
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { activate(); });
  else activate();
})();
