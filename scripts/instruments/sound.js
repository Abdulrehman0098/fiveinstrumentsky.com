(function () {
  'use strict';
  window.FI = window.FI || {};

  var state = {
    active: false,
    measuring: false,
    demo: false,
    live: false,
    audioCtx: null,
    analyser: null,
    stream: null,
    source: null,
    rafId: null,
    calOffset: 0,
    dbCurrent: 0,
    dbA: 0,
    dbC: 0,
    dbPeak: 0,
    dbPeakHold: 0,
    dbLeq: 0,
    leqCount: 0,
    rms: 0,
    peakFreq: 0,
    unit: 'spl',
    safetyLevel: 0,
    demoT: 0
  };

  var els = {};
  var lastFrame = 0;

  /* ------------------------------------------------------------------ */

  function updateStatus(msg, chip) {
    if (els.status) els.status.textContent = msg || 'Idle';
    var c = document.getElementById('panel-sound');
    if (c && chip) {
      var chipEl = c.querySelector('.mode-chip');
      if (chipEl) { chipEl.textContent = chip; chipEl.setAttribute('data-mode', chip.toLowerCase()); }
    }
  }

  function setBadge(visible) {
    var badge = document.querySelector('#panel-sound .sim-badge');
    if (badge) badge.classList.toggle('hidden', !visible);
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
    els.toggleBtn = document.getElementById('sound-toggle-btn');
    els.dbCurrent = document.getElementById('sound-db-current');
    els.dbUnit = document.getElementById('sound-db-unit');
    els.dbA = document.getElementById('sound-db-a');
    els.dbC = document.getElementById('sound-db-c');
    els.dbPeak = document.getElementById('sound-db-peak');
    els.peakReset = document.getElementById('sound-peak-reset');
    els.dbLeq = document.getElementById('sound-db-leq');
    els.rms = document.getElementById('sound-rms');
    els.peakFreq = document.getElementById('sound-peak-freq');
    els.calOffset = document.getElementById('sound-cal-offset');
    els.calApply = document.getElementById('sound-cal-apply');
    els.safetyFill = document.getElementById('sound-safety-fill');
    els.safetyIndicator = document.getElementById('sound-safety-indicator');
    els.waveCanvas = document.getElementById('sound-wave-canvas');
    els.spectrumCanvas = document.getElementById('sound-spectrum-canvas');
    els.historyCanvas = document.getElementById('sound-history-canvas');
    els.waveFps = document.getElementById('sound-wave-fps');
    els.status = document.getElementById('sound-status');
    els.privacyNotice = document.getElementById('sound-privacy-notice');

    if (els.toggleBtn && !els.toggleBtn._bound) {
      els.toggleBtn._bound = true;
      els.toggleBtn.addEventListener('click', toggleMeasurement);
    }
    if (els.peakReset) els.peakReset.addEventListener('click', function () {
      state.dbPeakHold = 0; state.dbPeak = 0; updateReadouts();
    });
    if (els.calApply) els.calApply.addEventListener('click', function () {
      state.calOffset = parseFloat(els.calOffset.value) || 0;
      updateReadouts();
    });

    if (els.privacyNotice) {
      els.privacyNotice.textContent = 'No audio is recorded, stored, or transmitted. All processing happens on this device.';
    }

    drawEmpty(els.waveCanvas, 'No data yet \u2014 press Start');
    drawEmpty(els.spectrumCanvas, 'No data yet \u2014 press Start');
    drawEmpty(els.historyCanvas, 'No data yet \u2014 press Start');
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

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      fallbackToDemo('Microphone API unavailable in this browser');
      startLoop();
      return;
    }

    updateStatus('Requesting microphone\u2026', 'idle');

    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    })
      .then(function (stream) {
        state.stream = stream;
        try {
          state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          state.source = state.audioCtx.createMediaStreamSource(stream);
          state.analyser = state.audioCtx.createAnalyser();
          state.analyser.fftSize = 2048;
          state.analyser.smoothingTimeConstant = 0;
          state.source.connect(state.analyser);
          state.live = true;
          state.demo = false;
          setBadge(false);
          updateStatus('Measuring live microphone', 'LIVE');
          startLoop();
        } catch (e) {
          console.warn('[sound] AudioContext failed', e);
          fallbackToDemo('AudioContext error');
          startLoop();
        }
      })
      .catch(function (e) {
        console.warn('[sound] getUserMedia denied', e && e.message);
        fallbackToDemo('Microphone denied \u2014 using synthetic audio');
        startLoop();
      });
  }

  function fallbackToDemo(reason) {
    state.demo = true;
    state.live = false;
    setBadge(true);
    updateStatus('Demo \u2014 ' + reason, 'demo');
  }

  function stopMeasurement() {
    state.measuring = false;
    state.demo = false;
    state.live = false;
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
    if (state.stream) {
      try { state.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      state.stream = null;
    }
    if (state.audioCtx) { try { state.audioCtx.close(); } catch (e) {} state.audioCtx = null; }
    state.source = null; state.analyser = null;
    if (els.toggleBtn) els.toggleBtn.textContent = 'Start Measurement';
    setBadge(false);
    updateStatus('Stopped', 'IDLE');
    drawEmpty(els.waveCanvas, 'No data yet \u2014 press Start');
    drawEmpty(els.spectrumCanvas, 'No data yet \u2014 press Start');
    drawEmpty(els.historyCanvas, 'No data yet \u2014 press Start');
  }

  /* ------------------------------------------------------------------ */
  /* Loop                                                                */
  /* ------------------------------------------------------------------ */

  function startLoop() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    lastFrame = 0;

    var bins = state.analyser ? state.analyser.frequencyBinCount : 1024;
    var freqData = new Float32Array(bins);
    var timeData = new Float32Array(bins);
    var sampleRate = state.audioCtx ? state.audioCtx.sampleRate : 48000;
    var history = new Array(600);
    var histIdx = 0;

    function draw(ts) {
      if (!state.measuring || !state.active) { state.rafId = null; return; }
      state.rafId = requestAnimationFrame(draw);
      if (ts - lastFrame < 33) return;
      lastFrame = ts;

      if (state.analyser) {
        state.analyser.getFloatTimeDomainData(timeData);
        state.analyser.getFloatFrequencyData(freqData);
      } else {
        // Synthetic audio: pink-ish noise + a wandering tone + bursts.
        state.demoT += 1 / 60;
        var t = state.demoT;
        var amp = 0.04 + 0.03 * (0.5 + 0.5 * Math.sin(t * 0.4));
        for (var i = 0; i < timeData.length; i++) {
          var noise = (Math.random() * 2 - 1) * amp;
          var tone = Math.sin(2 * Math.PI * (400 + 200 * Math.sin(t * 0.12)) * i / sampleRate) * amp * 0.8;
          timeData[i] = noise + tone;
        }
        for (i = 0; i < freqData.length; i++) {
          var f = i * sampleRate / (2 * freqData.length);
          var rolloff = -20 * Math.log10(Math.max(1, f / 1000));
          freqData[i] = -46 + rolloff + (Math.random() - 0.5) * 6;
        }
      }

      // ---- Levels ----
      var sumSq = 0, instPeak = 0;
      for (var k = 0; k < timeData.length; k++) {
        var v = timeData[k];
        sumSq += v * v;
        var av = Math.abs(v);
        if (av > instPeak) instPeak = av;
      }
      var rmsVal = Math.sqrt(sumSq / timeData.length);
      state.rms = rmsVal;
      var dBFS = 20 * Math.log10(rmsVal > 1e-7 ? rmsVal : 1e-7);
      state.dbCurrent = dBFS + state.calOffset + 94;   // dBFS -> approx dB SPL
      var peakDB = 20 * Math.log10(instPeak > 1e-7 ? instPeak : 1e-7) + state.calOffset + 94;
      if (peakDB > state.dbPeakHold) state.dbPeakHold = peakDB;
      state.dbPeakHold *= 0.999;
      state.dbPeak = state.dbPeakHold;
      state.dbA = state.dbCurrent - 2;
      state.dbC = state.dbCurrent + 1;

      // ---- Peak frequency ----
      var maxIdx = 0, maxVal = -Infinity;
      for (var fi = 1; fi < freqData.length; fi++) {
        if (freqData[fi] > maxVal) { maxVal = freqData[fi]; maxIdx = fi; }
      }
      state.peakFreq = maxIdx * sampleRate / (2 * freqData.length);

      // ---- Leq ----
      state.leqCount++;
      state.dbLeq = (state.dbLeq * (state.leqCount - 1) + state.dbCurrent) / state.leqCount;
      state.safetyLevel = Math.max(0, Math.min(120, state.dbCurrent));

      history[histIdx % history.length] = state.dbCurrent;
      histIdx++;

      if (els.waveFps) els.waveFps.textContent = '30 fps';

      updateReadouts();
      drawWaveform(timeData);
      drawSpectrum(freqData);
      drawHistory(history, histIdx);
    }
    state.rafId = requestAnimationFrame(draw);
  }

  /* ------------------------------------------------------------------ */
  /* Readouts                                                            */
  /* ------------------------------------------------------------------ */

  function updateReadouts() {
    var fmt = function (v) { return isFinite(v) ? v.toFixed(1) : '\u2014'; };
    var unitText = state.unit === 'a' ? 'dB(A)' : state.unit === 'c' ? 'dB(C)' : 'dB SPL';
    var displayVal = state.unit === 'a' ? state.dbA : state.unit === 'c' ? state.dbC : state.dbCurrent;
    if (els.dbCurrent) els.dbCurrent.textContent = fmt(displayVal);
    if (els.dbUnit) els.dbUnit.textContent = unitText;
    if (els.dbA) els.dbA.textContent = fmt(state.dbA);
    if (els.dbC) els.dbC.textContent = fmt(state.dbC);
    if (els.dbPeak) els.dbPeak.textContent = fmt(state.dbPeak);
    if (els.rms) els.rms.textContent = fmt(20 * Math.log10(state.rms > 1e-7 ? state.rms : 1e-7));
    if (els.peakFreq) els.peakFreq.textContent = isFinite(state.peakFreq) ? Math.round(state.peakFreq) : '\u2014';
    if (els.dbLeq) els.dbLeq.textContent = fmt(state.dbLeq);

    if (els.safetyFill) {
      els.safetyFill.style.width = Math.min(100, (state.safetyLevel / 120) * 100) + '%';
    }
    if (els.safetyIndicator) {
      var text = els.safetyIndicator.querySelector('.safety-text');
      var level = state.safetyLevel;
      if (text) text.textContent = level < 70 ? 'Safe' : level < 85 ? 'Moderate' : level < 100 ? 'High' : 'Danger';
      els.safetyIndicator.className = 'safety-indicator ' +
        (level < 70 ? 'safe' : level < 85 ? 'moderate' : level < 100 ? 'high' : 'danger');
    }
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

  function drawWaveform(data) {
    var p = prepCanvas(els.waveCanvas);
    if (!p) return;
    var c = p.ctx, w = p.w, h = p.h;
    var step = Math.max(1, Math.floor(data.length / w));
    c.strokeStyle = '#00f0ff';
    c.lineWidth = 1.3;
    c.shadowColor = '#00f0ff';
    c.shadowBlur = 6;
    c.beginPath();
    var n = 0;
    for (var i = 0; i < data.length; i += step) {
      var x = (n / (data.length / step)) * w;
      var y = h / 2 - data[i] * (h / 2) * 0.9;
      if (n === 0) c.moveTo(x, y); else c.lineTo(x, y);
      n++;
    }
    c.stroke();
    c.shadowBlur = 0;
  }

  function drawSpectrum(data) {
    var p = prepCanvas(els.spectrumCanvas);
    if (!p) return;
    var c = p.ctx, w = p.w, h = p.h;
    var bars = Math.min(Math.floor(data.length / 4), 160);
    var barW = w / bars;
    for (var i = 0; i < bars; i++) {
      var val = data[i * 4] || -100;
      var norm = Math.max(0, Math.min(1, (val + 100) / 70));
      var barH = Math.max(1, norm * h);
      var hue = 200 - (i / bars) * 180;
      c.fillStyle = 'hsla(' + hue + ', 100%, 60%, 0.6)';
      c.fillRect(i * barW, h - barH, Math.max(1, barW - 1), barH);
    }
  }

  function drawHistory(history, count) {
    var p = prepCanvas(els.historyCanvas);
    if (!p) return;
    if (count < 2) { drawEmpty(els.historyCanvas, 'No data yet \u2014 press Start'); return; }
    var c = p.ctx, w = p.w, h = p.h;
    var visible = Math.min(count, history.length);
    c.strokeStyle = '#00f0ff';
    c.lineWidth = 1.5;
    c.beginPath();
    for (var i = 0; i < visible; i++) {
      var idx = (count - visible + i) % history.length;
      var val = history[idx] || 0;
      var x = (i / (visible - 1)) * w;
      var y = h - ((val + 20) / 100) * h;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  function activate() {
    if (state.active) return;
    state.active = true;
    init();
    updateStatus('Idle');
    var badge = document.querySelector('#panel-sound .sim-badge');
    if (badge && !badge.classList.contains('hidden')) startMeasurement();
  }

  function deactivate() {
    state.active = false;
    if (state.measuring) stopMeasurement();
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
  }

  window.FI.sound = {
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
