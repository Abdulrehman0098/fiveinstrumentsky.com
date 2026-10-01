(function () {
  'use strict';
  window.FI = window.FI || {};

  var RING = 512;          // ring buffer size (samples)
  var READOUT_MS = 100;    // readout refresh interval
  var WATCHDOG_MS = 500;   // no-sample timeout before downgrading LIVE -> DEMO

  var state = {
    active: false,
    measuring: false,
    demo: false,
    live: false,
    sensitivity: 1.5,
    sampleRate: 60,
    peakHold: 0,
    peak: 0,
    rms: 0,
    crest: 0,
    magnitude: 0,
    x: 0, y: 0, z: 0,
    peakFreq: 0,
    lastSampleAt: 0,
    rafId: null,
    demoTimer: null,
    demoT: 0
  };

  // Ring buffer
  var ring = new Float32Array(RING * 3);
  var times = new Float64Array(RING);
  var head = 0;
  var count = 0;

  var els = {};
  var lastReadout = 0;
  var fpsAccum = 0, fpsCount = 0, fpsShown = 0, fpsAt = 0;

  /* ------------------------------------------------------------------ */

  function pushSample(x, y, z, t) {
    if (!state.measuring) return;
    var i3 = head * 3;
    ring[i3] = x; ring[i3 + 1] = y; ring[i3 + 2] = z;
    times[head] = t;
    head = (head + 1) % RING;
    if (count < RING) count++;
    state.lastSampleAt = performance.now();
  }

  // newest-first index -> ring slot
  function slotAgo(ago) { return (head - 1 - ago + RING * 2) % RING; }

  /* ------------------------------------------------------------------ */

  function updateStatus(text, chip) {
    var s = document.getElementById('vib-status');
    if (s) s.textContent = text || '';
    var c = document.getElementById('panel-vibration');
    if (c) {
      var chipEl = c.querySelector('.mode-chip');
      if (chipEl && chip) {
        chipEl.textContent = chip;
        chipEl.setAttribute('data-mode', chip.toLowerCase());
      }
    }
  }

  function setBadge(visible) {
    var badge = document.querySelector('#panel-vibration .sim-badge');
    if (badge) badge.classList.toggle('hidden', !visible);
  }

  function init() {
    els.toggleBtn = document.getElementById('vib-toggle-btn');
    els.magnitude = document.getElementById('vib-magnitude');
    els.xEl = document.getElementById('vib-x');
    els.yEl = document.getElementById('vib-y');
    els.zEl = document.getElementById('vib-z');
    els.gTotal = document.getElementById('vib-g-total');
    els.crest = document.getElementById('vib-crest');
    els.rmsEl = document.getElementById('vib-rms');
    els.peakEl = document.getElementById('vib-peak');
    els.peakReset = document.getElementById('vib-peak-reset');
    els.peakFreqEl = document.getElementById('vib-peak-freq');
    els.sensitivitySlider = document.getElementById('vib-sensitivity');
    els.sensitivityDisplay = document.getElementById('vib-sensitivity-display');
    els.spectrumRange = document.getElementById('vib-spectrum-range');
    els.waveCanvas = document.getElementById('vib-wave-canvas');
    els.spectrumCanvas = document.getElementById('vib-spectrum-canvas');
    els.waveFps = document.getElementById('vib-wave-fps');
    els.events = document.getElementById('vib-events');
    els.status = document.getElementById('vib-status');

    if (els.toggleBtn && !els.toggleBtn._bound) {
      els.toggleBtn._bound = true;
      els.toggleBtn.addEventListener('click', toggleMeasurement);
    }
    if (els.peakReset) els.peakReset.addEventListener('click', function () {
      state.peakHold = 0; state.peak = 0; updateReadouts(true);
    });
    if (els.sensitivitySlider) els.sensitivitySlider.addEventListener('input', function () {
      state.sensitivity = parseFloat(els.sensitivitySlider.value) || 1;
      if (els.sensitivityDisplay) els.sensitivityDisplay.textContent = state.sensitivity.toFixed(1) + ' \u00d7';
    });

    if (els.sensitivitySlider) {
      state.sensitivity = parseFloat(els.sensitivitySlider.value) || 1.5;
      if (els.sensitivityDisplay) els.sensitivityDisplay.textContent = state.sensitivity.toFixed(1) + ' \u00d7';
    }

    drawEmpty(els.waveCanvas, 'No data yet \u2014 press Start');
    drawEmpty(els.spectrumCanvas, 'No data yet \u2014 press Start');
  }

  function drawEmpty(canvas, message) {
    if (!canvas) return;
    var r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
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
    state.demo = false;
    state.live = false;
    count = 0; head = 0;

    updateStatus('Starting sensors\u2026', 'idle');

    var ok = false;

    // 1. Generic Sensor API
    if (typeof window.LinearAccelerationSensor === 'function') {
      try {
        var sensor = new window.LinearAccelerationSensor({ frequency: 60 });
        state.sensor = sensor;
        sensor.addEventListener('reading', function () {
          pushSample(sensor.x, sensor.y, sensor.z, performance.now());
        });
        sensor.addEventListener('error', function (e) {
          console.warn('[vib] sensor error', e && e.error);
          fallbackToDemo();
        });
        sensor.start();
        ok = true;
        updateStatus('LinearAccelerationSensor active', 'LIVE');
      } catch (e) {
        console.warn('[vib] LinearAccelerationSensor failed', e);
        ok = false;
      }
    }

    // 2. DeviceMotionEvent
    if (!ok && typeof window.DeviceMotionEvent === 'function') {
      var onMotion = function (e) {
        var a = e.acceleration || e.accelerationIncludingGravity;
        if (a && a.x !== null && a.x !== undefined) {
          pushSample(a.x || 0, a.y || 0, a.z || 0, performance.now());
          if (!state.live) {
            state.live = true;
            state.demo = false;
            setBadge(false);
            updateStatus('DeviceMotion active', 'LIVE');
          }
        }
      };
      if (typeof window.DeviceMotionEvent.requestPermission === 'function') {
        window.DeviceMotionEvent.requestPermission()
          .then(function (r) {
            if (r === 'granted') {
              window.addEventListener('devicemotion', onMotion);
              state.motionHandler = onMotion;
            } else {
              fallbackToDemo();
            }
          })
          .catch(function () { fallbackToDemo(); });
      } else {
        window.addEventListener('devicemotion', onMotion);
        state.motionHandler = onMotion;
      }
    }

    // 3. Last resort
    if (!ok && typeof window.DeviceMotionEvent !== 'function' &&
        typeof window.LinearAccelerationSensor !== 'function') {
      fallbackToDemo();
    }

    startDrawLoop();
  }

  function fallbackToDemo() {
    if (state.demo) return;
    state.demo = true;
    state.live = false;
    setBadge(true);
    updateStatus('Demo \u2014 synthetic vibration (no hardware sensor)', 'demo');
    startDemoGenerator();
  }

  function startDemoGenerator() {
    if (state.demoTimer) return;
    state.demoT = 0;
    state.demoTimer = setInterval(function () {
      if (!state.measuring) return;
      state.demoT += 1 / 60;
      var t = state.demoT;
      pushSample(
        0.3 * Math.sin(2 * Math.PI * 4 * t) + 0.05 * (Math.random() - 0.5),
        0.2 * Math.sin(2 * Math.PI * 12 * t) + 0.05 * (Math.random() - 0.5),
        9.81 + 0.15 * Math.sin(2 * Math.PI * 27 * t),
        performance.now()
      );
    }, 16);
  }

  function stopDemoGenerator() {
    if (state.demoTimer) { clearInterval(state.demoTimer); state.demoTimer = null; }
  }

  function stopMeasurement() {
    state.measuring = false;
    state.live = false;
    state.demo = false;
    stopDemoGenerator();
    if (state.sensor) { try { state.sensor.stop(); } catch (e) {} state.sensor = null; }
    if (state.motionHandler) {
      try { window.removeEventListener('devicemotion', state.motionHandler); } catch (e) {}
      state.motionHandler = null;
    }
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
    if (els.toggleBtn) els.toggleBtn.textContent = 'Start Measurement';
    setBadge(false);
    updateStatus('Idle \u2014 press Start to begin', 'IDLE');
    drawEmpty(els.waveCanvas, 'No data yet \u2014 press Start');
    drawEmpty(els.spectrumCanvas, 'No data yet \u2014 press Start');
  }

  /* ------------------------------------------------------------------ */
  /* Draw loop                                                           */
  /* ------------------------------------------------------------------ */

  function startDrawLoop() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    var lastFrame = 0;

    function draw(ts) {
      if (!state.measuring || !state.active) { state.rafId = null; return; }
      state.rafId = requestAnimationFrame(draw);
      if (ts - lastFrame < 33) return;
      lastFrame = ts;

      // ---- Watchdog: never claim LIVE without data ----
      var since = state.lastSampleAt ? (performance.now() - state.lastSampleAt) : Infinity;
      if (since > WATCHDOG_MS && !state.demo) {
        fallbackToDemo();
      }

      // fps
      fpsAccum += ts; fpsCount++;
      if (ts - fpsAt > 1000) {
        fpsShown = fpsAt ? Math.round(fpsCount * 1000 / (ts - fpsAt)) : fpsCount;
        fpsAccum = 0; fpsCount = 0; fpsAt = ts;
        if (els.waveFps) els.waveFps.textContent = fpsShown + ' fps';
      }

      if (ts - lastReadout > READOUT_MS) {
        lastReadout = ts;
        updateReadouts(false);
      }

      drawWaveform();
      drawSpectrum();
    }
    state.rafId = requestAnimationFrame(draw);
  }

  /* ------------------------------------------------------------------ */
  /* Stats                                                               */
  /* ------------------------------------------------------------------ */

  function updateReadouts(force) {
    var n = count;
    if (n === 0) return;

    var s = state.sensitivity;
    var newest = slotAgo(0);
    var x = ring[newest * 3] * s;
    var y = ring[newest * 3 + 1] * s;
    var z = ring[newest * 3 + 2] * s;
    state.x = x; state.y = y; state.z = z;
    state.magnitude = Math.sqrt(x * x + y * y + z * z);

    // RMS / peak / crest over the whole ring
    var sumSq = 0, peak = 0;
    var n3 = n * 3;
    for (var i = 0; i < n; i++) {
      var i3 = slotAgo(i) * 3;
      var ax = ring[i3], ay = ring[i3 + 1], az = ring[i3 + 2];
      var m2 = ax * ax + ay * ay + az * az;
      sumSq += m2;
      if (m2 > peak) peak = m2;
    }
    var rms = Math.sqrt(sumSq / n);
    var peakVal = Math.sqrt(peak);
    state.rms = rms;
    if (peakVal > state.peakHold) state.peakHold = peakVal;
    state.peak = state.peakHold;
    state.crest = rms > 1e-9 ? state.peak / rms : 0;

    // Sample rate from the two newest timestamps
    if (n >= 2) {
      var t0 = times[slotAgo(0)], t1 = times[slotAgo(1)];
      var dt = Math.abs(t0 - t1);
      if (dt > 0.0001 && dt < 1000) state.sampleRate = 1000 / dt;
    }

    // Peak frequency: dominant non-DC bin of the magnitude spectrum
    state.peakFreq = dominantFreq();

    var fmt = function (v) { return isFinite(v) ? v.toFixed(2) : '\u2014'; };
    if (els.magnitude) els.magnitude.textContent = fmt(state.magnitude);
    if (els.xEl) els.xEl.textContent = fmt(state.x);
    if (els.yEl) els.yEl.textContent = fmt(state.y);
    if (els.zEl) els.zEl.textContent = fmt(state.z);
    if (els.gTotal) els.gTotal.textContent = fmt(state.magnitude / 9.80665);
    if (els.crest) els.crest.textContent = fmt(state.crest);
    if (els.rmsEl) els.rmsEl.textContent = fmt(state.rms);
    if (els.peakEl) els.peakEl.textContent = fmt(state.peak);
    if (els.peakFreqEl) els.peakFreqEl.textContent = isFinite(state.peakFreq) ? state.peakFreq.toFixed(1) : '\u2014';
    if (els.spectrumRange) {
      var nyq = state.sampleRate / 2;
      els.spectrumRange.textContent = '0 \u2013 ' + (nyq >= 1000 ? (nyq / 1000).toFixed(1) + ' kHz' : Math.round(nyq) + ' Hz');
    }
  }

  // Real DFT on the magnitude series (N=128). Cheap enough at 10 Hz.
  function dominantFreq() {
    var N = Math.min(128, count);
    if (N < 16) return 0;
    var sig = new Float64Array(N);
    var mean = 0;
    for (var i = 0; i < N; i++) {
      var i3 = slotAgo(N - 1 - i) * 3;   // oldest -> newest
      var v = Math.sqrt(ring[i3] * ring[i3] + ring[i3 + 1] * ring[i3 + 1] + ring[i3 + 2] * ring[i3 + 2]);
      sig[i] = v; mean += v;
    }
    mean /= N;
    for (i = 0; i < N; i++) sig[i] -= mean;

    var bestBin = 0, bestMag = 0;
    var bins = N / 2;
    for (var k = 1; k < bins; k++) {
      var re = 0, im = 0;
      var w = 2 * Math.PI * k / N;
      for (var t = 0; t < N; t++) {
        re += sig[t] * Math.cos(w * t);
        im -= sig[t] * Math.sin(w * t);
      }
      var mag = re * re + im * im;
      if (mag > bestMag) { bestMag = mag; bestBin = k; }
    }
    if (!bestBin) return 0;
    var fs = state.sampleRate > 1 ? state.sampleRate : 60;
    return bestBin * fs / N;
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

  function drawWaveform() {
    var p = prepCanvas(els.waveCanvas);
    if (!p) return;
    if (count < 2) { drawEmpty(els.waveCanvas, 'Waiting for samples\u2026'); return; }

    var n = Math.min(256, count);
    var c = p.ctx, w = p.w, h = p.h;

    // Range from the visible tail only
    var range = 0.01;
    for (var i = 0; i < n; i++) {
      var i3 = slotAgo(n - 1 - i) * 3;
      var m = Math.max(Math.abs(ring[i3]), Math.abs(ring[i3 + 1]), Math.abs(ring[i3 + 2]));
      if (m > range) range = m;
    }
    range *= 1.2;

    var axes = [
      { off: 0, color: '#00f0ff' },
      { off: 1, color: '#ffd700' },
      { off: 2, color: '#a855f7' }
    ];
    for (var a = 0; a < axes.length; a++) {
      c.strokeStyle = axes[a].color;
      c.lineWidth = 1.4;
      c.shadowColor = axes[a].color;
      c.shadowBlur = 4;
      c.beginPath();
      for (var k = 0; k < n; k++) {
        var idx = slotAgo(n - 1 - k) * 3 + axes[a].off;
        var px = (k / (n - 1)) * w;
        var py = h / 2 + (ring[idx] / range) * (h / 2) * 0.85;
        if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.stroke();
    }
    c.shadowBlur = 0;

    c.font = '9px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillStyle = '#00f0ff'; c.fillText('X', 4, 4);
    c.fillStyle = '#ffd700'; c.fillText('Y', 4, 16);
    c.fillStyle = '#a855f7'; c.fillText('Z', 4, 28);
  }

  function drawSpectrum() {
    var p = prepCanvas(els.spectrumCanvas);
    if (!p) return;
    if (count < 32) { drawEmpty(els.spectrumCanvas, 'Waiting for samples\u2026'); return; }

    var c = p.ctx, w = p.w, h = p.h;
    var N = Math.min(128, count);
    var sig = new Float64Array(N);
    var mean = 0;
    for (var i = 0; i < N; i++) {
      var i3 = slotAgo(N - 1 - i) * 3;
      var v = Math.sqrt(ring[i3] * ring[i3] + ring[i3 + 1] * ring[i3 + 1] + ring[i3 + 2] * ring[i3 + 2]);
      sig[i] = v; mean += v;
    }
    mean /= N;
    for (i = 0; i < N; i++) sig[i] -= mean;

    var bins = N / 2;
    var mags = new Float64Array(bins);
    var maxMag = 1e-9;
    for (var k = 1; k < bins; k++) {
      var re = 0, im = 0;
      var wv = 2 * Math.PI * k / N;
      for (var t = 0; t < N; t++) {
        re += sig[t] * Math.cos(wv * t);
        im -= sig[t] * Math.sin(wv * t);
      }
      var mag = Math.sqrt(re * re + im * im) / N;
      mags[k] = mag;
      if (mag > maxMag) maxMag = mag;
    }

    var bw = w / bins;
    for (k = 1; k < bins; k++) {
      var barH = Math.max(1, (mags[k] / maxMag) * h * 0.9);
      var hue = 200 - (k / bins) * 180;
      c.fillStyle = 'hsla(' + hue + ', 100%, 60%, 0.6)';
      c.fillRect((k - 1) * bw, h - barH, Math.max(1, bw - 1), barH);
    }

    // Mark the dominant bin
    var bestBin = 0, best = 0;
    for (k = 1; k < bins; k++) if (mags[k] > best) { best = mags[k]; bestBin = k; }
    if (bestBin) {
      var px = (bestBin - 0.5) * bw;
      c.strokeStyle = '#ffd700'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(px, 0); c.lineTo(px, h); c.stroke();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  function activate() {
    if (state.active) return;
    state.active = true;
    init();
    updateStatus('Idle \u2014 press Start to begin', 'IDLE');
    drawEmpty(els.waveCanvas, 'No data yet \u2014 press Start');
    drawEmpty(els.spectrumCanvas, 'No data yet \u2014 press Start');
  }

  function deactivate() {
    state.active = false;
    if (state.measuring) stopMeasurement();
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
  }

  window.FI.vibration = {
    activate: activate,
    deactivate: deactivate,
    init: activate,
    destroy: deactivate,
    toggle: toggleMeasurement,
    state: state
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { activate(); });
  else activate();
})();
