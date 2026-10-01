(function () {
  'use strict';
  window.FI = window.FI || {};

  var state = {
    active: false,
    measuring: false,
    demo: false,
    altitude: 0,
    gpsAlt: 0,
    gpsAccuracy: 0,
    baroAlt: 0,
    pressure: 0,
    slp: 1013.25,
    delta: 0,
    trend: '\u2014',
    trendArrow: '\u2014',
    vspeed: 0,
    temperature: 20,
    source: 'Demo',
    watchId: null,
    barometer: null,
    history: [],
    maxHistory: 600,
    zeroAlt: 0,
    rafId: null,
    smoothedAlt: 0,
    prevAltSmoothed: 0,
    prevAlt: 0,
    prevDemoAlt: 0,
    vspeedBuf: [],
    demoT: 0,
    startedAt: 0,
    lastSampleAt: 0
  };

  var els = {};
  var lastFrame = 0;

  /* ------------------------------------------------------------------ */

  function toast(msg) {
    var region = document.getElementById('toast-region');
    if (!region) return;
    var el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    region.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3000);
  }

  function updateStatus(msg, chip) {
    if (els.status) els.status.textContent = msg || 'Idle';
    var c = document.getElementById('panel-altimeter');
    if (c && chip) {
      var chipEl = c.querySelector('.mode-chip');
      if (chipEl) { chipEl.textContent = chip; chipEl.setAttribute('data-mode', chip.toLowerCase()); }
    }
  }

  function setBadge(visible) {
    var badge = document.querySelector('#panel-altimeter .sim-badge');
    if (badge) badge.classList.toggle('hidden', !visible);
  }

  function isDemoBadgeVisible() {
    var badge = document.querySelector('#panel-altimeter .sim-badge');
    return !!badge && !badge.classList.contains('hidden');
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
    els.startBtn = document.getElementById('alt-start-btn');
    els.exportBtn = document.getElementById('alt-export-btn');
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

    if (els.startBtn && !els.startBtn._bound) {
      els.startBtn._bound = true;
      els.startBtn.addEventListener('click', toggleMeasurement);
    }
    if (els.zeroBtn) els.zeroBtn.addEventListener('click', function () {
      state.zeroAlt = state.altitude;
      toast('Zero set at ' + state.altitude.toFixed(1) + ' m');
    });
    if (els.resetBtn) els.resetBtn.addEventListener('click', function () {
      state.history = [];
      toast('Log reset');
    });
    if (els.exportBtn) els.exportBtn.addEventListener('click', exportCsv);
    if (els.slpInput) els.slpInput.addEventListener('change', function () {
      state.slp = parseFloat(els.slpInput.value) || 1013.25;
    });

    drawEmpty(els.historyCanvas, 'No data yet \u2014 press Start');
    drawEmpty(els.pressureHistoryCanvas, 'No data yet \u2014 press Start');
  }

  function exportCsv() {
    if (!state.history.length) { toast('Nothing to export yet'); return; }
    var rows = ['t_ms,altitude_m,pressure_hpa'];
    for (var i = 0; i < state.history.length; i++) {
      var h = state.history[i];
      rows.push([Math.round(h.t), h.alt.toFixed(2), h.pressure.toFixed(2)].join(','));
    }
    var blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'altimeter-log.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    toast('Exported ' + state.history.length + ' rows');
  }

  /* ------------------------------------------------------------------ */
  /* Start / stop                                                        */
  /* ------------------------------------------------------------------ */

  function toggleMeasurement() {
    if (state.measuring) stopMeasurement(); else startMeasurement();
  }

  function startMeasurement() {
    if (state.measuring) return;

    state.measuring = true;
    state.startedAt = performance.now();
    state.vspeedBuf = [];
    state.prevAltSmoothed = 0;
    state.smoothedAlt = 0;
    if (els.startBtn) els.startBtn.textContent = 'Stop Measurement';

    var live = false;

    // 1. Barometer (Generic Sensor API)
    if (typeof window.Barometer === 'function') {
      try {
        var barometer = new window.Barometer({ frequency: 4 });
        state.barometer = barometer;
        barometer.addEventListener('reading', function () {
          state.pressure = barometer.pressure;
          if (typeof barometer.temperature === 'number') state.temperature = barometer.temperature;
          computeBaroAlt();
          state.source = 'Barometer';
          state.demo = false;
          state.lastSampleAt = performance.now();
          setBadge(false);
          updateStatus('Barometer active', 'LIVE');
        });
        barometer.addEventListener('error', function () { fallbackToDemo(); });
        barometer.start();
        live = true;
        updateStatus('Barometer active', 'LIVE');
      } catch (e) {
        console.warn('[alt] Barometer failed', e);
        live = false;
      }
    }

    // 2. GPS
    if (!live && navigator.geolocation) {
      try {
        state.watchId = navigator.geolocation.watchPosition(function (pos) {
          state.gpsAlt = pos.coords.altitude || 0;
          state.gpsAccuracy = pos.coords.altitudeAccuracy || 0;
          state.source = 'GPS';
          state.demo = false;
          state.lastSampleAt = performance.now();
          setBadge(false);
          computeBaroAlt();
          if (!live) { live = true; updateStatus('GPS altitude active', 'LIVE'); }
        }, function () {
          fallbackToDemo();
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
        updateStatus('Acquiring GPS\u2026', 'idle');
      } catch (e) {
        console.warn('[alt] geolocation failed', e);
      }
    }

    // 3. Demo
    if (!live && !state.watchId) fallbackToDemo();

    startLoop();
  }

  function fallbackToDemo() {
    if (state.demo) return;
    state.demo = true;
    state.source = 'Simulated';
    setBadge(true);
    updateStatus('Demo \u2014 synthetic altitude (no barometer/GPS)', 'demo');
  }

  function stopMeasurement() {
    state.measuring = false;
    state.demo = false;
    if (state.watchId) { try { navigator.geolocation.clearWatch(state.watchId); } catch (e) {} state.watchId = null; }
    if (state.barometer) { try { state.barometer.stop(); } catch (e) {} state.barometer = null; }
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
    if (els.startBtn) els.startBtn.textContent = 'Start Measurement';
    setBadge(false);
    updateStatus('Stopped', 'IDLE');
  }

  /* ------------------------------------------------------------------ */
  /* Physics                                                             */
  /* ------------------------------------------------------------------ */

  function computeBaroAlt() {
    if (state.pressure > 0 && state.slp > 0) {
      state.baroAlt = 44330.77 * (1 - Math.pow(state.pressure / state.slp, 0.190263));
    } else {
      state.baroAlt = 0;
    }
    if (state.gpsAlt && state.baroAlt) state.delta = state.gpsAlt - state.baroAlt;
    else state.delta = 0;
    if (state.source === 'Barometer') state.altitude = state.baroAlt;
    else if (state.source === 'GPS') state.altitude = state.gpsAlt;
  }

  function altDemoSample(t) {
    var altitude = 120 + 5 * Math.sin(t / 20) + (Math.random() - 0.5) * 0.4;
    var pressure = 1013.25 * Math.pow(1 - altitude / 44330.77, 5.2559);
    return { altitude: altitude, pressure: pressure, t: t };
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
      var dt = lastFrame ? (ts - lastFrame) / 1000 : 0.033;
      lastFrame = ts;

      // Watchdog: barometer/GPS may never deliver (no hardware, denied
      // permission, no fix). Never sit at "Acquiring" with no data.
      if (!state.demo) {
        var since = state.lastSampleAt ? (performance.now() - state.lastSampleAt) : Infinity;
        if (since > 2500) fallbackToDemo();
      }

      if (state.demo) {
        var t = (performance.now() - state.startedAt) / 1000;
        var s = altDemoSample(t);
        state.altitude = s.altitude;
        state.pressure = s.pressure;
        state.slp = 1013.25;
        if (els.slpInput) els.slpInput.value = state.slp.toFixed(2);
        state.gpsAlt = state.altitude + (Math.random() - 0.5) * 4;
        state.gpsAccuracy = 3;
        state.baroAlt = 44330.77 * (1 - Math.pow(state.pressure / state.slp, 0.190263));
        state.delta = state.gpsAlt - state.baroAlt;
        state.temperature = 20 + Math.sin(t / 30);
        state.source = 'Simulated';
      }

      // Smooth
      var alpha = 0.2;
      if (state.smoothedAlt === 0) state.smoothedAlt = state.altitude;
      state.smoothedAlt = state.smoothedAlt + alpha * (state.altitude - state.smoothedAlt);

      // Real vertical speed: d(alt)/dt, smoothed
      if (state.prevAltSmoothed) {
        var raw = (state.smoothedAlt - state.prevAltSmoothed) / (dt || 0.033);
        state.vspeedBuf.push(raw);
        if (state.vspeedBuf.length > 30) state.vspeedBuf.shift();
        var sum = 0;
        for (var i = 0; i < state.vspeedBuf.length; i++) sum += state.vspeedBuf[i];
        state.vspeed = sum / state.vspeedBuf.length;
      }
      state.prevAltSmoothed = state.smoothedAlt;

      // Trend from the actual log window
      var hist = state.history;
      if (hist.length > 90) {
        var oldAlt = hist[0].alt || 0;
        var change = state.altitude - oldAlt;
        if (change > 1) { state.trend = 'Rising'; state.trendArrow = '\u2191'; }
        else if (change < -1) { state.trend = 'Falling'; state.trendArrow = '\u2193'; }
        else { state.trend = 'Stable'; state.trendArrow = '\u2192'; }
      } else {
        state.trend = 'collecting\u2026'; state.trendArrow = '\u2014';
      }

      hist.push({ alt: state.altitude, pressure: state.pressure, t: performance.now() });
      if (hist.length > state.maxHistory) hist.shift();

      updateReadouts();
      drawHistory();
      drawPressureHistory();
    }
    state.rafId = requestAnimationFrame(draw);
  }

  /* ------------------------------------------------------------------ */
  /* Readouts                                                            */
  /* ------------------------------------------------------------------ */

  function updateReadouts() {
    var fmt = function (v) { return isFinite(v) ? v.toFixed(2) : '\u2014'; };
    var sys = (window.FI.units && window.FI.units.getSystem) ? window.FI.units.getSystem() : 'metric';
    var altUnit = sys === 'imperial' ? 'ft' : 'm';
    var pressUnit = sys === 'imperial' ? 'inHg' : 'hPa';
    var tempUnit = sys === 'imperial' ? '\u00b0F' : '\u00b0C';
    var speedUnit = sys === 'imperial' ? 'ft/s' : 'm/s';

    var altVal = state.altitude - state.zeroAlt;
    if (els.altitude) els.altitude.textContent = fmt(altVal) + ' ' + altUnit;
    if (els.altSource) els.altSource.textContent = state.source;
    if (els.gpsAlt) {
      els.gpsAlt.textContent = sys === 'imperial' ? (state.gpsAlt * 3.28084).toFixed(1) : state.gpsAlt.toFixed(2);
      if (els.gpsUnit) els.gpsUnit.textContent = altUnit;
      if (els.gpsAccuracy) els.gpsAccuracy.textContent = isFinite(state.gpsAccuracy) ? state.gpsAccuracy.toFixed(1) + ' ' + altUnit : '\u2014';
    }
    if (els.baroAlt) {
      els.baroAlt.textContent = sys === 'imperial' ? (state.baroAlt * 3.28084).toFixed(1) : state.baroAlt.toFixed(2);
      if (els.baroUnit) els.baroUnit.textContent = altUnit;
    }
    if (els.delta) els.delta.textContent = fmt(state.delta) + ' ' + altUnit;

    if (els.pressure) els.pressure.textContent = sys === 'imperial' ? (state.pressure * 0.02953).toFixed(2) : state.pressure.toFixed(2);
    if (els.pressureUnit) els.pressureUnit.textContent = pressUnit;
    if (els.slp) els.slp.textContent = state.slp.toFixed(2);
    if (els.trend) els.trend.textContent = state.trend;
    if (els.trendArrow) els.trendArrow.textContent = state.trendArrow;

    if (els.vspeed) els.vspeed.textContent = sys === 'imperial' ? (state.vspeed * 3.28084).toFixed(2) : state.vspeed.toFixed(2);
    if (els.vspeedUnit) els.vspeedUnit.textContent = speedUnit;
    if (els.temperature) els.temperature.textContent = sys === 'imperial' ? (state.temperature * 9 / 5 + 32).toFixed(1) : state.temperature.toFixed(1);
    if (els.tempUnit) els.tempUnit.textContent = tempUnit;
  }

  /* ------------------------------------------------------------------ */
  /* Charts                                                              */
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

  function drawSeries(canvas, key, color, unit, emptyMsg) {
    var p = prepCanvas(canvas);
    if (!p) return;
    var visible = state.history.slice(-600);
    if (visible.length < 2) { drawEmpty(canvas, emptyMsg); return; }

    var min = Infinity, max = -Infinity;
    for (var i = 0; i < visible.length; i++) {
      var v = visible[i][key];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    var range = Math.max(0.001, max - min);

    var c = p.ctx, w = p.w, h = p.h;
    c.strokeStyle = color;
    c.lineWidth = 1.5;
    c.shadowColor = color;
    c.shadowBlur = 4;
    c.beginPath();
    for (i = 0; i < visible.length; i++) {
      var x = (i / (visible.length - 1)) * w;
      var y = h - ((visible[i][key] - min) / range) * (h - 16) - 8;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
    c.shadowBlur = 0;

    c.fillStyle = color; c.font = '9px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText(max.toFixed(1) + ' ' + unit, 4, 3);
    c.textBaseline = 'bottom';
    c.fillText(min.toFixed(1) + ' ' + unit, 4, h - 3);
  }

  function drawHistory() {
    drawSeries(els.historyCanvas, 'alt', '#00f0ff', 'm', 'No data yet \u2014 press Start');
  }

  function drawPressureHistory() {
    drawSeries(els.pressureHistoryCanvas, 'pressure', '#ffd700', 'hPa', 'No data yet \u2014 press Start');
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  function activate() {
    if (state.active) return;
    state.active = true;
    init();
    updateStatus('Idle');
    // If demo mode is on, data must flow without the user pressing Start.
    if (isDemoBadgeVisible()) startMeasurement();
  }

  function deactivate() {
    state.active = false;
    if (state.measuring) stopMeasurement();
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
  }

  window.FI.altimeter = {
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
