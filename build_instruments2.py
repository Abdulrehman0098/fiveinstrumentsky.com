#!/usr/bin/env python3
"""Build sound.js, vibration.js, magnetic.js, altimeter.js, main.js"""

# ==================== sound.js ====================

sound_js = r'''/* ============================================================
   instruments/sound.js — Sound Level Meter
   Classic script. No imports.
   ============================================================ */

(function() {
'use strict';

var Sound = {};
window.FI.sound = Sound;

var state = {
  active: false,
  measuring: false,
  audioCtx: null,
  analyser: null,
  stream: null,
  source: null,
  animId: null,
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
  calApplied: false
};

var els = {};
var FFT_BINS = 1024;

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

  if (els.toggleBtn) {
    els.toggleBtn.addEventListener('click', toggleMeasurement);
  }
  if (els.peakReset) {
    els.peakReset.addEventListener('click', function() {
      state.dbPeakHold = 0;
      state.dbPeak = 0;
      updateReadouts();
    });
  }
  if (els.calApply) {
    els.calApply.addEventListener('click', function() {
      state.calOffset = parseFloat(els.calOffset.value) || 0;
      state.calApplied = true;
      updateReadouts();
    });
  }
  // Unit buttons
  var unitBtns = document.querySelectorAll('[data-db-unit]');
  for (var i = 0; i < unitBtns.length; i++) {
    unitBtns[i].addEventListener('click', function() {
      state.unit = this.getAttribute('data-db-unit');
      for (var j = 0; j < unitBtns.length; j++) {
        unitBtns[j].classList.remove('active');
      }
      this.classList.add('active');
      updateReadouts();
    });
  }

  els.privacyNotice.textContent = 'No audio is recorded, stored, or transmitted. All processing happens on this device.';
}

function toggleMeasurement() {
  if (!state.measuring) {
    startMeasurement();
  } else {
    stopMeasurement();
  }
}

function startMeasurement() {
  if (state.measuring) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (els.status) els.status.textContent = 'getUserMedia not available';
    if (window.FI.demo && window.FI.demo.isEnabled()) {
      startDemoSound();
    }
    return;
  }

  els.toggleBtn.textContent = 'Stop Measurement';

  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    .then(function(s) {
      state.stream = s;
      try {
        state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        state.source = state.audioCtx.createMediaStreamSource(s);
        state.analyser = state.audioCtx.createAnalyser();
        state.analyser.fftSize = 2048;
        state.analyser.smoothingTimeConstant = 0;
        state.source.connect(state.analyser);
        state.measuring = true;
        updateStatus('Measuring');
        if (window.FI.demo) window.FI.demo.setEnabled(false);
        startLoop();
      } catch (e) {
        stopMeasurement();
        if (els.status) els.status.textContent = 'AudioContext error: ' + (e.message || e);
      }
    })
    .catch(function(e) {
      els.toggleBtn.textContent = 'Start Measurement';
      if (els.status) els.status.textContent = 'Microphone access denied';
      if (window.FI.demo && window.FI.demo.isEnabled()) {
        startDemoSound();
      }
    });
}

function stopMeasurement() {
  state.measuring = false;
  if (state.animId) {
    cancelAnimationFrame(state.animId);
    state.animId = null;
  }
  if (state.stream) {
    state.stream.getTracks().forEach(function(t) { t.stop(); });
    state.stream = null;
  }
  if (state.audioCtx) {
    state.audioCtx.close();
    state.audioCtx = null;
  }
  state.source = null;
  state.analyser = null;
  els.toggleBtn.textContent = 'Start Measurement';
  updateStatus('Stopped');
}

function startDemoSound() {
  state.measuring = true;
  els.toggleBtn.textContent = 'Stop Measurement';
  updateStatus('SIMULATED');
  startLoop();
}

function updateStatus(msg) {
  if (els.status) els.status.textContent = msg || 'Idle';
}

function startLoop() {
  if (state.animId) cancelAnimationFrame(state.animId);
  var bufferLength = state.analyser ? state.analyser.frequencyBinCount : FFT_BINS;
  var dataArray = new Float32Array(bufferLength || FFT_BINS);
  var timeData = new Float32Array(bufferLength || FFT_BINS);
  var history = new Array(600);
  var histIdx = 0;
  var sampleRate = state.audioCtx ? state.audioCtx.sampleRate : 44100;

  function draw() {
    if (!state.measuring || !state.active) return;

    var now = performance.now();

    if (state.analyser) {
      state.analyser.getFloatTimeDomainData(timeData);
      state.analyser.getFloatFrequencyData(dataArray);
    } else {
      // Demo mode
      var demo = window.FI.demo.generateSound(now);
      for (var i = 0; i < dataArray.length; i++) {
        dataArray[i] = demo * 40;
        timeData[i] = demo;
      }
    }

    // Compute RMS
    var sumSq = 0;
    for (var i = 0; i < timeData.length; i++) {
      sumSq += timeData[i] * timeData[i];
    }
    var rmsVal = Math.sqrt(sumSq / timeData.length);
    state.rms = rmsVal;

    // dBFS
    var dBFS = 20 * Math.log10(rmsVal || 0.00001);
    state.dbCurrent = dBFS + state.calOffset;

    // Peak hold with decay
    var instantPeak = Math.max.apply(null, timeData.map(function(v) { return Math.abs(v); }));
    var peakDB = 20 * Math.log10(instantPeak || 0.00001) + state.calOffset;
    if (peakDB > state.dbPeakHold) state.dbPeakHold = peakDB;
    state.dbPeakHold *= 0.999;

    state.dbPeak = state.dbPeakHold;

    // dB(A) and dB(C) - simplified weighting
    state.dbA = state.dbCurrent - 2;
    state.dbC = state.dbCurrent + 1;

    // Peak frequency
    var maxIdx = 0;
    var maxVal = -Infinity;
    for (var fi = 0; fi < dataArray.length; fi++) {
      if (dataArray[fi] > maxVal) {
        maxVal = dataArray[fi];
        maxIdx = fi;
      }
    }
    state.peakFreq = maxIdx * sampleRate / (2 * dataArray.length);

    // Leq
    state.leqCount++;
    state.dbLeq = (state.dbLeq * (state.leqCount - 1) + state.dbCurrent) / state.leqCount;

    // Safety
    state.safetyLevel = Math.max(0, Math.min(120, state.dbCurrent));

    // History
    history[histIdx % history.length] = state.dbCurrent;
    histIdx++;

    updateReadouts();
    drawWaveform(timeData);
    drawSpectrum(dataArray);
    drawHistory(history, histIdx);

    state.animId = requestAnimationFrame(draw);
  }
  state.animId = requestAnimationFrame(draw);
}

function updateReadouts() {
  var fmt = function(v) { return isFinite(v) ? v.toFixed(1) : '\u2014'; };

  var currentVal = fmt(state.dbCurrent);
  var unitText = state.unit === 'spl' ? 'dB SPL' : state.unit === 'a' ? 'dB(A)' : 'dB(C)';
  var displayVal = state.unit === 'a' ? state.dbA : state.unit === 'c' ? state.dbC : state.dbCurrent;

  if (els.dbCurrent) els.dbCurrent.textContent = fmt(displayVal);
  if (els.dbUnit) els.dbUnit.textContent = unitText;
  if (els.dbA) els.dbA.textContent = fmt(state.dbA);
  if (els.dbC) els.dbC.textContent = fmt(state.dbC);
  if (els.dbPeak) els.dbPeak.textContent = fmt(state.dbPeak);
  if (els.rms) els.rms.textContent = fmt(state.rms) + ' dBFS';
  if (els.peakFreq) els.peakFreq.textContent = isFinite(state.peakFreq) ? state.peakFreq.toFixed(0) + ' Hz' : '\u2014';
  if (els.dbLeq) els.dbLeq.textContent = fmt(state.dbLeq);

  // Safety
  if (els.safetyFill) {
    var pct = Math.min(100, (state.safetyLevel / 120) * 100);
    els.safetyFill.style.width = pct + '%';
  }
  if (els.safetyIndicator) {
    var dot = els.safetyIndicator.querySelector('.safety-dot');
    var text = els.safetyIndicator.querySelector('.safety-text');
    if (state.safetyLevel < 70) { if (dot) dot.className = 'safety-dot green'; if (text) text.textContent = 'Safe'; }
    else if (state.safetyLevel < 85) { if (dot) dot.className = 'safety-dot yellow'; if (text) text.textContent = 'Moderate'; }
    else if (state.safetyLevel < 100) { if (dot) dot.className = 'safety-dot orange'; if (text) text.textContent = 'High'; }
    else { if (dot) dot.className = 'safety-dot red'; if (text) text.textContent = 'Danger'; }
  }
}

function drawWaveform(data) {
  if (!els.waveCanvas) return;
  var rect = els.waveCanvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (els.waveCanvas.width !== Math.round(rect.width * dpr) ||
      els.waveCanvas.height !== Math.round(rect.height * dpr)) {
    els.waveCanvas.width = Math.round(rect.width * dpr);
    els.waveCanvas.height = Math.round(rect.height * dpr);
  }
  var ctx = els.waveCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  var w = rect.width, h = rect.height;
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (var i = 0; i < data.length; i++) {
    var x = (i / data.length) * w;
    var y = h / 2 + data[i] * (h / 2) * 0.9;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawSpectrum(data) {
  if (!els.spectrumCanvas) return;
  var rect = els.spectrumCanvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (els.spectrumCanvas.width !== Math.round(rect.width * dpr) ||
      els.spectrumCanvas.height !== Math.round(rect.height * dpr)) {
    els.spectrumCanvas.width = Math.round(rect.width * dpr);
    els.spectrumCanvas.height = Math.round(rect.height * dpr);
  }
  var ctx = els.spectrumCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  var w = rect.width, h = rect.height;
  var bars = Math.min(data.length / 2, 200);
  var barW = w / bars;

  for (var i = 0; i < bars; i++) {
    var idx = i * 2;
    var val = data[idx] || 0;
    var barH = Math.max(0, Math.min(h, (val + 100) / 100 * h));
    var hue = 200 - (i / bars) * 180;
    ctx.fillStyle = 'hsla(' + hue + ', 100%, 60%, 0.6)';
    ctx.fillRect(i * barW, h - barH, barW - 1, barH);
  }

  // Peak marker
  var peakIdx = 0;
  var peakVal = -Infinity;
  for (var pi = 0; pi < data.length; pi++) {
    if (data[pi] > peakVal) { peakVal = data[pi]; peakIdx = pi; }
  }
  if (peakVal > -80) {
    var px = (peakIdx / data.length) * w;
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
  }
}

function drawHistory(history, count) {
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
  var visible = Math.min(count, history.length);
  var step = w / visible;

  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (var i = 0; i < visible; i++) {
    var idx = (count - visible + i) % history.length;
    var val = history[idx] || 0;
    var x = i * step;
    var y = h - ((val + 60) / 80) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
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
}

Sound.init = init;
Sound.activate = activate;
Sound.deactivate = deactivate;
Sound.destroy = destroy;

})();
'''

with open('scripts/instruments/sound.js', 'w') as f:
    f.write(sound_js)

# ==================== vibration.js ====================

vib_js = r'''/* ============================================================
   instruments/vibration.js — Vibration Analyzer
   Classic script. No imports.
   ============================================================ */

(function() {
'use strict';

var Vib = {};
window.FI.vibration = Vib;

var state = {
  active: false,
  measuring: false,
  samples: [],
  maxSamples: 300,
  sensitivity: 1,
  peak: 0,
  peakHold: 0,
  rms: 0,
  rmsBuf: [],
  magnitude: 0,
  x: 0, y: 0, z: 0,
  peakFreq: 0,
  sampleRate: 60,
  lastSampleTime: 0,
  animId: null,
  usingAccel: false,
  usingLinear: false
};

var els = {};

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

  if (els.toggleBtn) {
    els.toggleBtn.addEventListener('click', toggleMeasurement);
  }
  if (els.peakReset) {
    els.peakReset.addEventListener('click', function() {
      state.peakHold = 0;
      state.peak = 0;
      updateReadouts();
    });
  }
  if (els.sensitivitySlider) {
    els.sensitivitySlider.addEventListener('input', function() {
      state.sensitivity = parseFloat(els.sensitivitySlider.value);
      if (els.sensitivityDisplay) els.sensitivityDisplay.textContent = state.sensitivity.toFixed(1) + ' \u00d7';
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

  // Try Generic Sensor API first
  if (window.LinearAccelerationSensor) {
    try {
      state.sensor = new LinearAccelerationSensor({ frequency: 60 });
      state.sensor.onreading = function() {
        addSample(state.sensor.x, state.sensor.y, state.sensor.z, state.sensor.timestamp);
      };
      state.sensor.start();
      state.usingLinear = true;
      state.usingAccel = false;
      updateStatus('LinearAccelerationSensor active');
      startLoop();
      return;
    } catch (e) {}
  }

  // Try regular Accelerometer
  if (window.Accelerometer) {
    try {
      state.sensor = new Accelerometer({ frequency: 60 });
      state.sensor.onreading = function() {
        addSample(state.sensor.x, state.sensor.y, state.sensor.z, state.sensor.timestamp);
      };
      state.sensor.start();
      state.usingAccel = true;
      state.usingLinear = false;
      updateStatus('Accelerometer active (with gravity)');
      startLoop();
      return;
    } catch (e) {}
  }

  // Fallback to DeviceMotion
  if (window.DeviceMotionEvent) {
    window.addEventListener('devicemotion', function(e) {
      var acc = e.acceleration || e.accelerationIncludingGravity;
      if (acc) {
        addSample(acc.x || 0, acc.y || 0, acc.z || 0, performance.now());
      }
    });
    state.usingAccel = true;
    updateStatus('DeviceMotion active');
    startLoop();
    return;
  }

  if (els.toggleBtn) els.toggleBtn.textContent = 'Start Measurement';
  if (window.FI.demo && window.FI.demo.isEnabled()) {
    startDemoVib();
  } else {
    if (els.status) els.status.textContent = 'No accelerometer available';
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
  els.toggleBtn.textContent = 'Start Measurement';
  updateStatus('Stopped');
}

function startDemoVib() {
  state.measuring = true;
  els.toggleBtn.textContent = 'Stop Measurement';
  updateStatus('SIMULATED');
  startLoop();
}

function addSample(x, y, z, ts) {
  if (!state.measuring) return;
  var now = performance.now();
  if (ts) state.lastSampleTime = ts;
  var dt = (ts || now) - (state.lastSampleTime || now);
  state.sampleRate = dt > 0 ? 1000 / dt : 60;

  x *= state.sensitivity;
  y *= state.sensitivity;
  z *= state.sensitivity;

  state.x = x;
  state.y = y;
  state.z = z;
  state.magnitude = Math.sqrt(x * x + y * y + z * z);

  // Peak
  var peakVal = state.magnitude;
  if (peakVal > state.peakHold) state.peakHold = peakVal;
  state.peakHold *= 0.999;
  state.peak = state.peakHold;

  // RMS
  state.rmsBuf.push(state.magnitude);
  if (state.rmsBuf.length > 100) state.rmsBuf.shift();
  var sum = 0;
  for (var i = 0; i < state.rmsBuf.length; i++) sum += state.rmsBuf[i];
  state.rms = state.rmsBuf.length ? sum / state.rmsBuf.length : 0;

  // Crest factor
  state.crest = state.rms > 0 ? state.peak / state.rms : 0;

  state.samples.push({ x: x, y: y, z: z, t: ts || now });
  if (state.samples.length > state.maxSamples) state.samples.shift();

  updateReadouts();
}

function startLoop() {
  if (state.animId) cancelAnimationFrame(state.animId);
  function draw() {
    if (!state.active || !state.measuring) return;
    var now = performance.now();
    // FPS count
    if (state.waveFps) {
      state.waveFps.textContent = Math.round(state.sampleRate) + ' Hz';
    }
    if (els.spectrumRange) {
      els.spectrumRange.textContent = '0 \u2013 ' + Math.round(state.sampleRate / 2) + ' Hz';
    }
    drawWaveform();
    drawSpectrum();
    state.animId = requestAnimationFrame(draw);
  }
  state.animId = requestAnimationFrame(draw);
}

function updateReadouts() {
  var fmt = function(v) { return isFinite(v) ? v.toFixed(2) : '\u2014'; };
  if (els.magnitude) els.magnitude.textContent = fmt(state.magnitude);
  if (els.xEl) els.xEl.textContent = fmt(state.x);
  if (els.yEl) els.yEl.textContent = fmt(state.y);
  if (els.zEl) els.zEl.textContent = fmt(state.z);
  if (els.gTotal) els.gTotal.textContent = fmt(state.magnitude / 9.80665);
  if (els.crest) els.crest.textContent = fmt(state.crest);
  if (els.rmsEl) els.rmsEl.textContent = fmt(state.rms);
  if (els.peakEl) els.peakEl.textContent = fmt(state.peak);
  if (els.peakFreqEl) els.peakFreqEl.textContent = '—';
}

function drawWaveform() {
  if (!els.waveCanvas) return;
  var rect = els.waveCanvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (els.waveCanvas.width !== Math.round(rect.width * dpr) ||
      els.waveCanvas.height !== Math.round(rect.height * dpr)) {
    els.waveCanvas.width = Math.round(rect.width * dpr);
    els.waveCanvas.height = Math.round(rect.height * dpr);
  }
  var ctx = els.waveCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  var w = rect.width, h = rect.height;
  var samples = state.samples;
  if (samples.length < 2) {
    ctx.fillStyle = 'rgba(0,240,255,0.2)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Waiting for samples...', w / 2, h / 2);
    return;
  }

  var recent = samples.slice(-200);
  var range = Math.max(0.1, Math.max.apply(null, recent.map(function(s) { return Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)); }))) * 1.2;

  // X axis
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  for (var i = 0; i < recent.length; i++) {
    var x = (i / recent.length) * w;
    var y = h / 2 + (recent[i].x / range) * (h / 2) * 0.8;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Y axis
  ctx.strokeStyle = '#ffd700';
  ctx.beginPath();
  for (var i = 0; i < recent.length; i++) {
    var x = (i / recent.length) * w;
    var y = h / 2 + (recent[i].y / range) * (h / 2) * 0.8;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Z axis
  ctx.strokeStyle = '#a855f7';
  ctx.beginPath();
  for (var i = 0; i < recent.length; i++) {
    var x = (i / recent.length) * w;
    var y = h / 2 + (recent[i].z / range) * (h / 2) * 0.8;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Legend
  ctx.fillStyle = '#00f0ff';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('X', 4, 12);
  ctx.fillStyle = '#ffd700';
  ctx.fillText('Y', 4, 24);
  ctx.fillStyle = '#a855f7';
  ctx.fillText('Z', 4, 36);
}

function drawSpectrum() {
  if (!els.spectrumCanvas) return;
  var rect = els.spectrumCanvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  if (state.samples.length < 10) return;

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (els.spectrumCanvas.width !== Math.round(rect.width * dpr) ||
      els.spectrumCanvas.height !== Math.round(rect.height * dpr)) {
    els.spectrumCanvas.width = Math.round(rect.width * dpr);
    els.spectrumCanvas.height = Math.round(rect.height * dpr);
  }
  var ctx = els.spectrumCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  var w = rect.width, h = rect.height;
  var recent = state.samples.slice(-256);
  var mags = recent.map(function(s) { return Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z); });

  // Simple FFT approximation using magnitude differences
  var bins = 60;
  var binSize = mags.length / bins;
  var maxMag = Math.max.apply(null, mags) || 0.01;

  for (var i = 0; i < bins; i++) {
    var start = Math.floor(i * binSize);
    var end = Math.floor((i + 1) * binSize);
    var sum = 0;
    for (var j = start; j < end && j < mags.length; j++) sum += mags[j];
    var avg = sum / (end - start || 1);
    var barH = Math.max(1, (avg / maxMag) * h * 0.9);
    var hue = 200 - (i / bins) * 180;
    ctx.fillStyle = 'hsla(' + hue + ', 100%, 60%, 0.5)';
    ctx.fillRect(i * (w / bins), h - barH, w / bins - 1, barH);
  }
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
  state.samples = [];
  state.rmsBuf = [];
}

Vib.init = init;
Vib.activate = activate;
Vib.deactivate = deactivate;
Vib.destroy = destroy;

})();
'''

with open('scripts/instruments/vibration.js', 'w') as f:
    f.write(vib_js)

print('Wrote sound.js and vibration.js')
