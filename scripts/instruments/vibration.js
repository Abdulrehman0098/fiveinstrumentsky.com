/* ============================================================
   instruments/vibration.js — VIBRATION ANALYZER
   Accelerometer waveform + FFT, RMS, peak, events
   ============================================================ */

import FFT from '../lib/fft.js';
import Utils from '../utils.js';

let vibState = null;
let isRunning = false;

// Sensor
let motionHandler = null;

// Display state
let accelData = { x: 0, y: 0, z: 0, magnitude: 0 };
let accelHistory = { x: [], y: [], z: [], t: [] };
const MAX_HISTORY = 300;
let rmsValue = 0;
let peakValue = -Infinity;
let peakFreq = 0;
let sensitivity = 1.5;

// FFT
const FFT_BUFFER_SIZE = 1024;
let fftTimeBuffer = new Float64Array(FFT_BUFFER_SIZE);
let fftIdx = 0;
let fftResult = null;

// Canvas
let waveCanvas = null, waveCtx = null;
let spectrumCanvas = null, spectrumCtx = null;

// Event detection
let events = [];
const MAX_EVENTS = 10;
let waveFpsEl = null;
let lastFrameTime = 0, frameCount = 0, fpsTimer = 0, fps = 0;
let animFrameId = null;

// RMS smoother
let rmsSmoother = Utils.createSmoother(0.1);

// Display elements
let xEl, yEl, zEl, magEl, rmsEl, peakEl, peakFreqEl;

/* ---------- Initialize ---------- */

function init(appState, bus, utils, perm) {
  vibState = { appState, bus, utils, perm };
  waveCanvas = document.getElementById('vib-wave-canvas');
  spectrumCanvas = document.getElementById('vib-spectrum-canvas');
  waveFpsEl = document.getElementById('vib-wave-fps');
  xEl = document.getElementById('vib-x');
  yEl = document.getElementById('vib-y');
  zEl = document.getElementById('vib-z');
  magEl = document.getElementById('vib-magnitude');
  rmsEl = document.getElementById('vib-rms');
  peakEl = document.getElementById('vib-peak');
  peakFreqEl = document.getElementById('vib-peak-freq');

  // Guard: critical canvas elements
  if (!waveCanvas || !spectrumCanvas) {
    setStatus('Vibration canvas elements not found', 'error');
    return;
  }
  waveCtx = waveCanvas.getContext('2d');
  spectrumCtx = spectrumCanvas.getContext('2d');
  if (!waveCtx || !spectrumCtx) {
    setStatus('Vibration canvas contexts unavailable', 'error');
    return;
  }

  // React to unit system changes
  bus.on('unitschange', () => updateReadouts());

  wireControls();
  resetAll();
  updateStatus();
}

function destroy() {
  stopSensor();
  isRunning = false;
}

function activate(appState, bus, utils, perm) {
  vibState = { appState, bus, utils, perm };
}

/* ---------- Sensor management ---------- */

function startSensor() {
  if (isRunning) return;

  if (typeof DeviceMotionEvent === 'undefined') {
    setStatus('DeviceMotion not supported on this device', 'error');
    return;
  }

  // Request permission on iOS
  if (perm && perm.isIOS && perm.isIOS()) {
    perm.requestMotionPermission().then(granted => {
      if (!granted) {
        setStatus('Motion permission denied — cannot measure vibration', 'error');
        return;
      }
      attachMotionListener();
    });
  } else {
    attachMotionListener();
  }
}

function attachMotionListener() {
  if (motionHandler) return;

  motionHandler = (event) => {
    if (event.accelerationIncludingGravity) {
      const acc = event.accelerationIncludingGravity;
      accelData.x = acc.x || 0;
      accelData.y = acc.y || 0;
      accelData.z = acc.z || 0;
      accelData.magnitude = Math.sqrt(
        (acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2
      );
      // Apply sensitivity
      const sens = parseFloat(document.getElementById('vib-sensitivity')?.value) || 1.5;
      sensitivity = sens;

      // Push to history
      accelHistory.x.push(accelData.x);
      accelHistory.y.push(accelData.y);
      accelHistory.z.push(accelData.z);
      accelHistory.t.push(performance.now());
      if (accelHistory.x.length > MAX_HISTORY) {
        accelHistory.x.shift();
        accelHistory.y.shift();
        accelHistory.z.shift();
        accelHistory.t.shift();
      }

      // Push to FFT buffer
      fftTimeBuffer[fftIdx] = accelData.magnitude;
      fftIdx = (fftIdx + 1) % FFT_BUFFER_SIZE;

      // Update RMS
      const sampleRms = Math.sqrt(
        (accelData.x ** 2 + accelData.y ** 2 + accelData.z ** 2) / 3
      );
      rmsValue = rmsSmoother(sampleRms);

      // Peak
      if (accelData.magnitude > peakValue) {
        peakValue = accelData.magnitude;
      }

      // Event detection
      const spike = Utils.detectSpike(
        Array.from(accelHistory.x), 2.5, 20
      );
      if (spike) {
        addEvent(spike);
      }

      if (!isRunning) {
        isRunning = true;
        document.getElementById('vib-toggle-btn').textContent = 'Stop Sensor';
        document.getElementById('vib-toggle-btn').setAttribute('aria-pressed', 'true');
        setStatus('Vibration sensor active', 'ok');
        lastFrameTime = performance.now();
        frameCount = 0;
        fpsTimer = lastFrameTime;
        renderLoop();
      }
    }
  };

  window.addEventListener('devicemotion', motionHandler);
  isRunning = true;
  document.getElementById('vib-toggle-btn').textContent = 'Stop Sensor';
  document.getElementById('vib-toggle-btn').setAttribute('aria-pressed', 'true');
  setStatus('Waiting for motion data…', 'ok');
  lastFrameTime = performance.now();
  frameCount = 0;
  fpsTimer = lastFrameTime;
  renderLoop();
}

function stopSensor() {
  if (motionHandler) {
    window.removeEventListener('devicemotion', motionHandler);
    motionHandler = null;
  }
  isRunning = false;
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  document.getElementById('vib-toggle-btn').textContent = 'Start Sensor';
  document.getElementById('vib-toggle-btn').setAttribute('aria-pressed', 'false');
  setStatus('Sensor stopped', '');
}

/* ---------- Render loop ---------- */

function renderLoop() {
  if (!isRunning) return;
  animFrameId = requestAnimationFrame(renderLoop);

  const now = performance.now();
  const elapsed = now - lastFrameTime;
  lastFrameTime = now;

  frameCount++;
  if (now - fpsTimer >= 1000) {
    fps = Math.round(frameCount * 1000 / (now - fpsTimer));
    frameCount = 0;
    fpsTimer = now;
    if (waveFpsEl) waveFpsEl.textContent = fps + ' fps';
  }

  updateReadouts();
  drawWaveform();
  drawSpectrum();
}

/* ---------- Update readouts ---------- */

function updateReadouts() {
  if (xEl) xEl.textContent = accelData.x.toFixed(2);
  if (yEl) yEl.textContent = accelData.y.toFixed(2);
  if (zEl) zEl.textContent = accelData.z.toFixed(2);
  if (magEl) magEl.textContent = accelData.magnitude.toFixed(2);

  if (rmsEl) rmsEl.textContent = rmsValue.toFixed(3);
  if (peakEl) peakEl.textContent = peakValue > -Infinity ? peakValue.toFixed(2) : '—';

  // Peak frequency from FFT
  if (fftResult) {
    if (peakFreqEl) peakFreqEl.textContent = fftResult.frequency.toFixed(1);
  }
}

/* ---------- Waveform drawing ---------- */

function drawWaveform() {
  if (!waveCtx || !waveCanvas) return;
  const rect = waveCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);

  if (waveCanvas.width !== w || waveCanvas.height !== h) {
    waveCanvas.width = w;
    waveCanvas.height = h;
  }

  waveCtx.clearRect(0, 0, w, h);
  waveCtx.fillStyle = '#060912';
  waveCtx.fillRect(0, 0, w, h);

  // Grid — dark cyan
  waveCtx.strokeStyle = 'rgba(0,240,255,0.08)';
  waveCtx.lineWidth = 0.5;
  for (let i = 0; i < 6; i++) {
    const y = (i / 6) * h;
    waveCtx.beginPath();
    waveCtx.moveTo(0, y);
    waveCtx.lineTo(w, y);
    waveCtx.stroke();
  }

  if (accelHistory.x.length < 2) return;

  const cssW = rect.width;
  const cssH = rect.height;
  const len = accelHistory.x.length;
  const step = Math.max(1, Math.floor(len / cssW));

  // Neon axis colors: red (X), cyan (Y), violet (Z)
  const colors = ['#ef4444', '#00f0ff', '#a855f7'];
  const axes = ['x', 'y', 'z'];

  for (let a = 0; a < 3; a++) {
    const data = accelHistory[axes[a]];
    waveCtx.strokeStyle = colors[a];
    waveCtx.lineWidth = 1.3;
    waveCtx.shadowColor = colors[a] + '40';
    waveCtx.shadowBlur = 4;
    waveCtx.beginPath();

    const midY = cssH / 2 * dpr;
    const amp = cssH * 0.38 * dpr * sensitivity;

    for (let i = 0; i < cssW; i++) {
      const idx = Math.floor(i * step);
      const idxClamped = Math.min(idx, data.length - 1);
      const val = data[idxClamped];
      const y = midY - val * amp;
      if (i === 0) waveCtx.moveTo(i * dpr, y);
      else waveCtx.lineTo(i * dpr, y);
    }
    waveCtx.stroke();
    waveCtx.shadowBlur = 0;
  }
}

/* ---------- Spectrum drawing ---------- */

function drawSpectrum() {
  if (!spectrumCtx || !spectrumCanvas) return;
  const rect = spectrumCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);

  if (spectrumCanvas.width !== w || spectrumCanvas.height !== h) {
    spectrumCanvas.width = w;
    spectrumCanvas.height = h;
  }

  spectrumCtx.clearRect(0, 0, w, h);
  spectrumCtx.fillStyle = '#060912';
  spectrumCtx.fillRect(0, 0, w, h);

  // Compute FFT when buffer is full
  if (fftIdx === 0 && fftTimeBuffer.length > 0) {
    const result = FFT.analyze(Array.from(fftTimeBuffer), 60);
    fftResult = FFT.findPeak(result.magnitudes, 60);
  }

  // Draw spectrum from FFT buffer (rolling)
  const cssW = rect.width;
  const cssH = rect.height;

  // Use recent buffer (last 1024 samples)
  const recent = [];
  const start = (fftIdx + 1) % FFT_BUFFER_SIZE;
  for (let i = 0; i < FFT_BUFFER_SIZE; i++) {
    const idx = (start + i) % FFT_BUFFER_SIZE;
    recent.push(fftTimeBuffer[idx]);
  }

  const result = FFT.analyze(recent, 60);
  const mags = result.magnitudes;
  const bins = result.frequencyBins;

  if (!mags || mags.length === 0) return;

  const barCount = Math.min(64, mags.length);
  const step = Math.max(1, Math.floor(mags.length / barCount));
  const barWidth = (cssW * dpr) / barCount;

  spectrumCtx.fillStyle = '#060912';
  spectrumCtx.fillRect(0, 0, w, h);

  for (let i = 0; i < barCount; i++) {
    const idx = Math.min(i * step, mags.length - 1);
    const mag = mags[idx];

    // Convert magnitude to dB (approximate)
    const dB = 20 * Math.log10(mag + 1e-10);
    const norm = clamp((dB + 60) / 60, 0, 1);

    const barH = norm * cssH * dpr;
    const x = i * barWidth;
    const y = cssH * dpr - barH;

    // Neon gradient: red (low) → gold → cyan (high)
    const t = i / barCount;
    const r = Math.round(239 * (1 - t) + 34 * t);
    const g = Math.round(68 * (1 - t) + 240 * t);
    const b = Math.round(68 * (1 - t) + 255 * t);

    spectrumCtx.fillStyle = `rgb(${r},${g},${b})`;
    spectrumCtx.shadowColor = `rgba(${r},${g},${b},0.25)`;
    spectrumCtx.shadowBlur = 4;
    spectrumCtx.fillRect(x, y, Math.max(1, barWidth - 1), barH);
    spectrumCtx.shadowBlur = 0;
  }

  // Peak frequency label — gold
  if (fftResult && fftResult.frequency > 0) {
    spectrumCtx.fillStyle = '#ffd700';
    spectrumCtx.font = `${10 * dpr}px "IBM Plex Mono", monospace`;
    spectrumCtx.textAlign = 'right';
    spectrumCtx.fillText(fftResult.frequency.toFixed(1) + ' Hz', cssW * dpr - 4 * dpr, 12 * dpr);
  }
}

/* ---------- Event detection ---------- */

function addEvent(spike) {
  const elapsed = (performance.now() - (events.length > 0 ? events[events.length - 1].time : performance.now() + 1000)) / 1000;
  if (elapsed < 1) return; // debounce

  const ev = {
    time: performance.now(),
    value: spike.value,
    mean: spike.mean,
    std: spike.std,
  };
  events.push(ev);
  if (events.length > MAX_EVENTS) events.shift();

  const el = document.getElementById('vib-events');
  if (el) {
    const timeStr = new Date().toLocaleTimeString();
    el.innerHTML = events.map(e =>
      `<div class="event-item"><span class="time">${new Date(e.time).toLocaleTimeString()}</span> spike: ${e.value.toFixed(2)} m/s² (rms: ${e.mean.toFixed(2)})</div>`
    ).join('');
  }
}

/* ---------- Controls ---------- */

function wireControls() {
  const toggleBtn = document.getElementById('vib-toggle-btn');
  toggleBtn.addEventListener('click', () => {
    if (isRunning) {
      stopSensor();
    } else {
      startSensor();
    }
    updateStatus();
  });

  // Sensitivity slider
  const sensSlider = document.getElementById('vib-sensitivity');
  const sensDisplay = document.getElementById('vib-sensitivity-display');
  if (sensSlider && sensDisplay) {
    sensSlider.addEventListener('input', () => {
      sensitivity = parseFloat(sensSlider.value);
      sensDisplay.textContent = sensitivity.toFixed(1) + '×';
    });
  }

  // Peak reset
  document.getElementById('vib-peak-reset').addEventListener('click', () => {
    peakValue = -Infinity;
    if (peakEl) peakEl.textContent = '—';
    events = [];
    const el = document.getElementById('vib-events');
    if (el) el.innerHTML = '';
  });
}

/* ---------- Status ---------- */

function setStatus(msg, type) {
  const el = document.getElementById('vib-status');
  if (el) {
    el.textContent = msg;
    el.className = 'vibration-status' + (type ? ' ' + type : '');
    if (type === 'ok') el.style.color = 'var(--green)';
    else if (type === 'error') el.style.color = 'var(--red)';
    else el.style.color = 'var(--ink-dim)';
  }
}

function updateStatus() {
  setStatus(isRunning ? 'Vibration sensor active — shake or tap the device' : 'Tap "Start Sensor" to begin', isRunning ? 'ok' : '');
}

/* ---------- Resize ---------- */

function onResize(appState, bus, utils, perm) {}

export default {
  init,
  destroy,
  activate,
  onResize,
};
