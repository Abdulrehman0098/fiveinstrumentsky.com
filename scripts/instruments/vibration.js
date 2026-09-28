/* ============================================================
   instruments/vibration.js — VIBRATION ANALYZER
   ============================================================ */

import { Demo } from '../demo.js';
import { formatUnit, EMA, RingBuffer, safeStorage, clamp } from '../utils.js';
import FFT from '../lib/fft.js';

let state = null;
let isActive = false;
let accelSensor = null;
let lastSampleTime = 0;
let sampleBuffer = [];
let thresholdTriggered = false;
const FFT_SIZE = 128;

export function init() {
  state = {
    xEl: null, yEl: null, zEl: null, magEl: null, gTotalEl: null,
    rmsEl: null, peakEl: null, peakFreqEl: null, crestEl: null,
    sensitivityEl: null, sensitivityDisplayEl: null, spectrumRangeEl: null,
    spectrumCanvas: null, waveCanvas: null, fpsEl: null, eventsEl: null,
    peakResetBtn: null, statusEl: null,
    currentX: 0, currentY: 0, currentZ: 0,
    currentMagnitude: 0, currentRMS: 0, currentPeak: 0,
    currentPeakFreq: 0, currentCrest: 0, currentGTOTAL: 0,
    accelX: new RingBuffer(300), accelY: new RingBuffer(300), accelZ: new RingBuffer(300),
    fftBuffer: new RingBuffer(FFT_SIZE * 4),
    demoTime: 0, sensitivity: 1
  };
}

export function activate() {
  if (!state || isActive) return;
  isActive = true;
  state.xEl = document.getElementById('vib-x');
  state.yEl = document.getElementById('vib-y');
  state.zEl = document.getElementById('vib-z');
  state.magEl = document.getElementById('vib-magnitude');
  state.gTotalEl = document.getElementById('vib-g-total');
  state.rmsEl = document.getElementById('vib-rms');
  state.peakEl = document.getElementById('vib-peak');
  state.peakFreqEl = document.getElementById('vib-peak-freq');
  state.crestEl = document.getElementById('vib-crest');
  state.sensitivityEl = document.getElementById('vib-sensitivity');
  state.sensitivityDisplayEl = document.getElementById('vib-sensitivity-display');
  state.spectrumRangeEl = document.getElementById('vib-spectrum-range');
  state.spectrumCanvas = document.getElementById('vib-spectrum-canvas');
  state.waveCanvas = document.getElementById('vib-wave-canvas');
  state.fpsEl = document.getElementById('vib-wave-fps');
  state.eventsEl = document.getElementById('vib-events');
  state.peakResetBtn = document.getElementById('vib-peak-reset');
  state.statusEl = document.getElementById('vib-status');

  const sens = document.getElementById('vib-sensitivity');
  if (sens) state.sensitivity = parseFloat(sens.value) || 1;

  const chip = document.querySelector('#panel-vibration .mode-chip');
  const badge = document.querySelector('#panel-vibration .sim-badge');
  state.statusEl.textContent = 'Initializing…';

  if (location.protocol === 'file:') {
    state.statusEl.textContent = 'file:// — open via START.bat to use sensors';
    if (chip) chip.dataset.mode = 'unsupported';
    return;
  }

  const hasAccel = 'Accelerometer' in window || 'LinearAccelerationSensor' in window;
  if (!hasAccel) {
    if (!window.DeviceMotionEvent) {
      state.statusEl.textContent = 'No vibration sensor — use Demo';
      if (chip) chip.dataset.mode = 'unsupported';
      badge?.classList.remove('hidden');
      Demo.setEnabled(true);
      isActive = false;
      return;
    }
    startDeviceMotion(chip, badge);
  } else {
    try {
      accelSensor = new LinearAccelerationSensor({ frequency: 60 });
      accelSensor.addEventListener('reading', onAccelReading);
      accelSensor.addEventListener('error', onAccelError);
      accelSensor.start();
      if (chip) chip.dataset.mode = 'live';
      state.statusEl.textContent = 'Accelerometer active';
    } catch (e) {
      if (e.name === 'SecurityError' || e.name === 'NotAllowedError') {
        state.statusEl.textContent = 'Permission denied — use Demo';
        if (chip) chip.dataset.mode = 'denied';
        badge?.classList.remove('hidden');
        Demo.setEnabled(true);
        isActive = false;
        return;
      }
      try {
        accelSensor = new Accelerometer({ frequency: 60 });
        accelSensor.addEventListener('reading', onAccelReading);
        accelSensor.start();
        if (chip) chip.dataset.mode = 'live';
        state.statusEl.textContent = 'Accelerometer (with gravity) — active';
      } catch (_) {
        startDeviceMotion(chip, badge);
      }
    }
  }

  if (state.peakResetBtn) state.peakResetBtn.addEventListener('click', () => { state.currentPeak = 0; updateReadouts(); });
  Loop.register('vibration', drawFrame, 60);
}

export function deactivate() {
  if (!isActive) return;
  isActive = false;
  if (accelSensor) { try { if (typeof accelSensor.stop === 'function') accelSensor.stop(); } catch (_) {} accelSensor = null; }
  window.removeEventListener('devicemotion', onDeviceMotion);
  Loop.unregister('vibration');
  const chip = document.querySelector('#panel-vibration .mode-chip');
  if (chip) chip.dataset.mode = 'idle';
  const badge = document.querySelector('#panel-vibration .sim-badge');
  if (badge) badge.classList.add('hidden');
  updateReadouts();
}

function startDeviceMotion(chip, badge) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS && typeof DeviceMotionEvent.requestPermission === 'function') {
    state.statusEl.textContent = 'Tap START to enable motion — iOS requires gesture';
    if (chip) chip.dataset.mode = 'idle';
    return;
  }
  window.addEventListener('devicemotion', onDeviceMotion);
  state.statusEl.textContent = 'DeviceMotion fallback — active';
  if (chip) chip.dataset.mode = 'live';
}

function onDeviceMotion(e) {
  if (!isActive) return;
  const accel = e.accelerationIncludingGravity || e.acceleration;
  if (!accel) return;
  const now = performance.now();
  lastSampleTime = now;
  state.currentX = accel.x || 0;
  state.currentY = accel.y || 0;
  state.currentZ = accel.z || 0;
  state.currentMagnitude = Math.sqrt(state.currentX ** 2 + state.currentY ** 2 + state.currentZ ** 2);
  state.currentGTOTAL = state.currentMagnitude / 9.80665;
  state.accelX.push(state.currentX);
  state.accelY.push(state.currentY);
  state.accelZ.push(state.currentZ);
  const n = state.accelX.len;
  if (n > 0) {
    let sumSq = 0;
    for (let i = 0; i < n; i++) sumSq += state.accelX.get(i) ** 2;
    state.currentRMS = Math.sqrt(sumSq / n);
  }
  if (state.currentMagnitude > state.currentPeak) state.currentPeak = state.currentMagnitude;
  state.currentCrest = state.currentRMS > 0.01 ? state.currentMagnitude / state.currentRMS : 0;
  computeFFT();
  updateReadouts();
  checkEvents();
}

function onAccelReading(e) {
  if (!isActive) return;
  const x = e.reading.x || 0;
  const y = e.reading.y || 0;
  const z = e.reading.z || 0;
  state.currentX = x; state.currentY = y; state.currentZ = z;
  state.currentMagnitude = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
  state.currentGTOTAL = state.currentMagnitude / 9.80665;
  state.accelX.push(x); state.accelY.push(y); state.accelZ.push(z);
  const n = state.accelX.len;
  if (n > 0) {
    let sumSq = 0;
    for (let i = 0; i < n; i++) sumSq += state.accelX.get(i) ** 2;
    state.currentRMS = Math.sqrt(sumSq / n);
  }
  if (state.currentMagnitude > state.currentPeak) state.currentPeak = state.currentMagnitude;
  state.currentCrest = state.currentRMS > 0.01 ? state.currentMagnitude / state.currentRMS : 0;
  computeFFT();
  updateReadouts();
  checkEvents();
}

function onAccelError(e) {
  if (!isActive) return;
  console.warn('Accelerometer error:', e);
  if (state.statusEl) state.statusEl.textContent = 'Sensor error — falling back to demo';
  Demo.setEnabled(true);
}

function computeFFT() {
  const buf = state.fftBuffer;
  buf.push(state.currentX);
  buf.push(state.currentY);
  buf.push(state.currentZ);
  buf.push(state.currentMagnitude);
  if (buf.len < FFT_SIZE) return;
  const data = buf.toArray().slice(-FFT_SIZE);
  if (data.length < FFT_SIZE) return;
  const windowed = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) windowed[i] = data[i] * (0.5 * (1 - Math.cos(2 * Math.PI * i / (FFT_SIZE - 1))));
  const spectrum = FFT.default ? FFT.default(windowed) : fftSimple(windowed);
  const sampleRate = 60;
  let maxMag = 0, maxIdx = 0;
  for (let i = 0; i < spectrum.length / 2; i++) {
    const mag = Math.sqrt(spectrum[i].re ** 2 + spectrum[i].im ** 2);
    if (mag > maxMag) { maxMag = mag; maxIdx = i; }
  }
  const nyquist = sampleRate / 2;
  state.currentPeakFreq = maxIdx > 0 ? (maxIdx * nyquist / (spectrum.length / 2)) : 0;
  if (state.spectrumRangeEl) state.spectrumRangeEl.textContent = '0 – ' + nyquist.toFixed(0) + ' Hz';
  drawSpectrum(spectrum, sampleRate);
}

function fftSimple(signal) {
  const n = signal.length;
  const m = Math.ceil(Math.log2(n));
  const M = 1 << m;
  const re = new Float64Array(M);
  const im = new Float64Array(M);
  for (let i = 0; i < n; i++) re[i] = signal[i];
  for (let i = n; i < M; i++) re[i] = 0;
  for (let len = 2; len <= M; len *= 2) {
    const halfLen = len / 2;
    const wRe = Math.cos(-2 * Math.PI / len);
    const wIm = Math.sin(-2 * Math.PI / len);
    for (let i = 0; i < M; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < halfLen; j++) {
        const tRe = curRe * re[i + j + halfLen] - curIm * im[i + j + halfLen];
        const tIm = curRe * im[i + j + halfLen] + curIm * re[i + j + halfLen];
        re[i + j + halfLen] = re[i + j] - tRe;
        im[i + j + halfLen] = im[i + j] - tIm;
        re[i + j] += tRe;
        im[i + j] += tIm;
        const newRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newRe;
      }
    }
  }
  const result = [];
  for (let i = 0; i < M; i++) result.push({ re: re[i], im: im[i] });
  return result;
}

function checkEvents() {
  const eventsEl = state.eventsEl;
  if (!eventsEl) return;
  const threshold = 0.5 * state.sensitivity;
  const magnitude = state.currentMagnitude;
  if (magnitude > threshold && !thresholdTriggered) {
    thresholdTriggered = true;
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 12);
    const item = document.createElement('div');
    item.className = 'event-item';
    item.innerHTML = '<span class="time">' + timeStr + '</span><span>' + magnitude.toFixed(2) + ' m/s² peak @ ' + (isFinite(state.currentPeakFreq) ? state.currentPeakFreq.toFixed(1) : '—') + ' Hz</span>';
    eventsEl.prepend(item);
    while (eventsEl.children.length > 20) eventsEl.lastChild?.remove();
  } else if (magnitude < threshold * 0.8) thresholdTriggered = false;
}

function updateReadouts() {
  if (state.xEl) state.xEl.textContent = isFinite(state.currentX) ? state.currentX.toFixed(2) : '—';
  if (state.yEl) state.yEl.textContent = isFinite(state.currentY) ? state.currentY.toFixed(2) : '—';
  if (state.zEl) state.zEl.textContent = isFinite(state.currentZ) ? state.currentZ.toFixed(2) : '—';
  if (state.magEl) state.magEl.textContent = isFinite(state.currentMagnitude) ? state.currentMagnitude.toFixed(2) : '—';
  if (state.gTotalEl) state.gTotalEl.textContent = isFinite(state.currentGTOTAL) ? state.currentGTOTAL.toFixed(3) + ' g' : '—';
  if (state.rmsEl) state.rmsEl.textContent = isFinite(state.currentRMS) ? state.currentRMS.toFixed(3) : '—';
  if (state.peakEl) state.peakEl.textContent = isFinite(state.currentPeak) ? state.currentPeak.toFixed(2) : '—';
  if (state.peakFreqEl) state.peakFreqEl.textContent = isFinite(state.currentPeakFreq) ? state.currentPeakFreq.toFixed(1) + ' Hz' : '—';
  if (state.crestEl) state.crestEl.textContent = isFinite(state.currentCrest) ? state.currentCrest.toFixed(2) : '—';
  if (state.sensitivityDisplayEl) state.sensitivityDisplayEl.textContent = (state.sensitivity * 100).toFixed(0) + '%';
}

function drawFrame() {
  if (!isActive) return;
  drawWave();
}

function drawWave() {
  const canvas = state.waveCanvas;
  if (!canvas || !canvas.parentElement) return;
  const info = fitCanvas(canvas);
  if (!info) return;
  const { ctx, w, h } = info;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,240,255,0.06)'; ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(0,240,255,0.12)'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  ctx.fillStyle = 'rgba(136,146,184,0.4)'; ctx.font = '7px ui-monospace, monospace'; ctx.textAlign = 'left';
  ctx.fillText('+g', 2, 12); ctx.fillText('0', 2, h / 2 + 3); ctx.fillText('-g', 2, h - 4);
  const n = Math.min(state.accelX.len + state.accelY.len + state.accelZ.len, 200);
  if (n > 1) {
    const stepX = w / n;
    const scale = h * 0.4 / Math.max(1, state.currentPeak * 1.5 || 1);
    const axes = [
      { buf: state.accelX, color: '#00f0ff', width: 1.5 },
      { buf: state.accelY, color: '#ffd700', width: 1.2 },
      { buf: state.accelZ, color: '#a855f7', width: 1.2 }
    ];
    for (const ax of axes) {
      ctx.strokeStyle = ax.color; ctx.lineWidth = ax.width;
      ctx.shadowColor = ax.color; ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const v = ax.buf.get(i);
        if (v == null) continue;
        const xPos = i * stepX;
        const yPos = h / 2 - v * scale;
        if (i === 0) ctx.moveTo(xPos, yPos); else ctx.lineTo(xPos, yPos);
      }
      ctx.stroke(); ctx.shadowBlur = 0;
    }
  }
  if (state.fpsEl) state.fpsEl.textContent = Loop.getFPS() + ' FPS';
  ctx.font = '7px ui-monospace, monospace';
  ctx.fillStyle = '#00f0ff'; ctx.fillText('X', w - 30, 12);
  ctx.fillStyle = '#ffd700'; ctx.fillText('Y', w - 50, 12);
  ctx.fillStyle = '#a855f7'; ctx.fillText('Z', w - 70, 12);
}

function drawSpectrum(spectrum, sampleRate) {
  const canvas = state.spectrumCanvas;
  if (!canvas) return;
  const info = fitCanvas(canvas);
  if (!info) return;
  const { ctx, w, h } = info;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, w, h);
  const half = spectrum.length / 2;
  const maxBin = Math.min(half, w);
  const stepX = w / maxBin;
  let maxMag = 0;
  for (let i = 0; i < half; i++) { const m = Math.sqrt(spectrum[i].re ** 2 + spectrum[i].im ** 2); if (m > maxMag) maxMag = m; }
  for (let i = 0; i < maxBin; i++) {
    const mag = Math.sqrt(spectrum[i].re ** 2 + spectrum[i].im ** 2);
    const norm = maxMag > 0 ? mag / maxMag : 0;
    const y = h - norm * (h - 4) - 2;
    const barH = norm * (h - 4);
    const t = i / maxBin;
    let r, g, b;
    if (t < 0.4) { r = 0; g = 240; b = 255; }
    else if (t < 0.7) { r = 168 * (t - 0.4) / 0.3; g = 240 - 155 * (t - 0.4) / 0.3; b = 255 - 8 * (t - 0.4) / 0.3; }
    else { r = 168 + 87 * (t - 0.7) / 0.3; g = 85 + 130 * (t - 0.7) / 0.3; b = 247 - 247 * (t - 0.7) / 0.3; }
    ctx.fillStyle = 'rgba(' + (r|0) + ',' + (g|0) + ',' + (b|0) + ',' + (0.5 + norm * 0.4) + ')';
    ctx.fillRect(i * stepX, y, stepX - 0.5, barH);
    if (i === Math.round(state.currentPeakFreq / sampleRate * 2 * maxBin) && state.currentPeakFreq > 0) {
      ctx.fillStyle = '#ffd700'; ctx.fillRect(i * stepX - 0.5, 0, stepX + 0.5, 4);
    }
  }
}
