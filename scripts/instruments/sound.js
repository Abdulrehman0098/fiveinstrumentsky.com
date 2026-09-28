/* ============================================================
   instruments/sound.js — SOUND LEVEL METER
   ============================================================ */

import { Demo } from '../demo.js';
import { formatUnit, EMA, RingBuffer, safeStorage, clamp } from '../utils.js';
import FFT from '../lib/fft.js';

let state = null;
let isActive = false;
let audioCtx = null, analyser = null, micStream = null, sourceNode = null;
let isDemo = false;

export function init() {
  state = {
    dbCurrentEl: null, dbUnitEl: null, dbAEl: null, dbCEl: null,
    dbPeakEl: null, dbLeqEl: null, rmsEl: null, peakFreqEl: null,
    safetyFillEl: null, safetyIndicatorEl: null,
    weighting: 'spl',
    calibrationOffset: 0,
    peakHold: 0, peakDecayStart: 0,
    leqBuffer: new RingBuffer(60 * 10),
    historyBuffer: new RingBuffer(60 * 10),
    demoTime: 0, isDemoMode: false
  };
}

export function activate() {
  if (!state || isActive) return;
  isActive = true;
  state.dbCurrentEl = document.getElementById('sound-db-current');
  state.dbUnitEl = document.getElementById('sound-db-unit');
  state.dbAEl = document.getElementById('sound-db-a');
  state.dbCEl = document.getElementById('sound-db-c');
  state.dbPeakEl = document.getElementById('sound-db-peak');
  state.dbLeqEl = document.getElementById('sound-db-leq');
  state.rmsEl = document.getElementById('sound-rms');
  state.peakFreqEl = document.getElementById('sound-peak-freq');
  state.safetyFillEl = document.getElementById('sound-safety-fill');
  state.safetyIndicatorEl = document.getElementById('sound-safety-indicator');

  try {
    const stored = safeStorage.get('fi-sound-cal-offset', 0);
    if (typeof stored === 'number') state.calibrationOffset = stored;
  } catch (_) {}

  setAllReadouts('--', '--', '--', '—', '—', '—', '—', '—');

  Loop.register('sound', drawFrame, 60);

  checkSensors().then(() => {});
  const startBtn = document.getElementById('sound-toggle-btn');
  if (startBtn) startBtn.addEventListener('click', startStop);

  const calApply = document.getElementById('sound-cal-apply');
  if (calApply) calApply.addEventListener('click', applyCalibration);

  const peakReset = document.getElementById('sound-peak-reset');
  if (peakReset) peakReset.addEventListener('click', () => { state.peakHold = 0; state.peakDecayStart = 0; updatePeakDisplay(0); });

  const dbButtons = document.querySelectorAll('[data-db-unit]');
  for (const btn of dbButtons) {
    btn.addEventListener('click', () => {
      state.weighting = btn.dataset.dbUnit;
      dbButtons.forEach(b => b.classList.toggle('active', b === btn));
      const labels = { spl: 'dB SPL', a: 'dB(A)', c: 'dB(C)' };
      if (state.dbUnitEl) state.dbUnitEl.textContent = labels[state.weighting] || state.weighting;
    });
  }

  const defaultBtn = document.querySelector('[data-db-unit="spl"]');
  if (defaultBtn) defaultBtn.classList.add('active');
}

export function deactivate() {
  if (!isActive) return;
  isActive = false;
  stopMic();
  Loop.unregister('sound');
  setAllReadouts('--', '--', '--', '—', '—', '—', '—', '—');
  const chip = document.querySelector('#panel-sound .mode-chip');
  if (chip) chip.dataset.mode = 'idle';
  const badge = document.querySelector('#panel-sound .sim-badge');
  if (badge) badge.classList.add('hidden');
}

async function checkSensors() {
  const perm = window.Permissions || { microphone: () => Promise.resolve('unsupported') };
  const micStatus = perm.microphone ? await perm.microphone() : 'unsupported';
  const statusEl = document.getElementById('sound-status');
  const panel = document.getElementById('panel-sound');
  const chip = panel?.querySelector('.mode-chip');
  const badge = panel?.querySelector('.sim-badge');

  if (location.protocol === 'file:') {
    if (chip) chip.dataset.mode = 'unsupported';
    if (statusEl) statusEl.textContent = 'file:// — open via START.bat to use mic';
    return;
  }

  if (micStatus === 'granted') {
    if (chip) chip.dataset.mode = 'live';
    if (badge) badge.classList.add('hidden');
    if (statusEl) statusEl.textContent = 'Microphone available — press Start';
  } else if (micStatus === 'denied') {
    if (chip) chip.dataset.mode = 'denied';
    if (badge) badge.classList.remove('hidden');
    if (statusEl) statusEl.textContent = 'Microphone permission denied — use Demo';
    Demo.setEnabled(true);
  } else if (micStatus === 'unsupported') {
    if (chip) chip.dataset.mode = 'unsupported';
    if (badge) badge.classList.remove('hidden');
    if (statusEl) statusEl.textContent = 'No microphone API — use Demo';
    isDemo = true;
  } else {
    if (chip) chip.dataset.mode = 'idle';
    if (statusEl) statusEl.textContent = 'Click Start to enable microphone';
  }
}

async function startStop() {
  if (!state || !isActive) return;
  const btn = document.getElementById('sound-toggle-btn');
  const chip = document.querySelector('#panel-sound .mode-chip');
  const badge = document.querySelector('#panel-sound .sim-badge');
  const statusEl = document.getElementById('sound-status');

  if (micStream) {
    stopMic();
    if (chip) chip.dataset.mode = 'idle';
    if (statusEl) statusEl.textContent = 'Stopped';
    if (btn) btn.innerHTML = '<span class="label">START</span>';
    return;
  }

  const perm = window.Permissions || { microphone: () => Promise.resolve('unsupported') };
  let micStatus = 'unsupported';
  try { micStatus = await perm.microphone(); } catch (_) {}

  if (micStatus === 'granted') {
    const calInput = document.getElementById('sound-cal-offset');
    if (calInput) state.calibrationOffset = parseFloat(calInput.value) || 0;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 }
      });
      micStream = stream;
      audioCtx = new AudioContext({ sampleRate: 48000 });
      sourceNode = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0;
      sourceNode.connect(analyser);
      if (chip) chip.dataset.mode = 'live';
      if (badge) badge?.classList.add('hidden');
      if (statusEl) statusEl.textContent = 'Listening…';
      if (btn) btn.innerHTML = '<span class="label">STOP</span>';
      if (navigator.wakeLock) { try { navigator.wakeLock.lock('screen').catch(() => {}); } catch (_) {} }
    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        if (statusEl) statusEl.textContent = 'Mic permission denied — use Demo mode';
        if (chip) chip.dataset.mode = 'denied';
        badge?.classList.remove('hidden');
        Demo.setEnabled(true);
      } else {
        if (statusEl) statusEl.textContent = 'Mic error: ' + e.message;
        if (chip) chip.dataset.mode = 'error';
      }
    }
  } else {
    isDemo = true;
    if (chip) chip.dataset.mode = 'demo';
    if (badge) badge.classList.remove('hidden');
    if (statusEl) statusEl.textContent = 'Demo mode — no microphone available';
    if (btn) btn.innerHTML = '<span class="label">STOP</span>';
  }
}

function stopMic() {
  if (sourceNode) { try { sourceNode.disconnect(); } catch (_) {} sourceNode = null; }
  if (audioCtx && audioCtx.state !== 'closed') { try { audioCtx.close(); } catch (_) {} audioCtx = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  analyser = null;
}

function applyCalibration() {
  const input = document.getElementById('sound-cal-offset');
  if (!input) return;
  const val = parseFloat(input.value);
  if (isNaN(val)) return;
  state.calibrationOffset = val;
  try { safeStorage.set('fi-sound-cal-offset', val); } catch (_) {}
}

function setAllReadouts(dBCurrent, dbA, dBC, peak, rms, leq, peakFreq, peakFreqUnit) {
  if (state.dbCurrentEl) state.dbCurrentEl.textContent = dBCurrent;
  if (state.dbAEl) state.dbAEl.textContent = dbA;
  if (state.dbCEl) state.dbCEl.textContent = dBC;
  if (state.dbPeakEl) state.dbPeakEl.textContent = peak;
  if (state.rmsEl) state.rmsEl.textContent = rms ? rms.toFixed(1) + ' dBFS' : '—';
  if (state.peakFreqEl) state.peakFreqEl.textContent = peakFreq ? peakFreq.toFixed(1) + ' Hz' : '—';
  if (state.dbLeqEl) state.dbLeqEl.textContent = leq ? leq.toFixed(1) + ' dB' : '—';
}

function updatePeakDisplay(val) {
  if (state.dbPeakEl) state.dbPeakEl.textContent = val;
}

function drawFrame() {
  if (!state || !isActive) return;
  const t = performance.now() / 1000;

  let sample = null;
  if (isDemo) { sample = Demo.generateSoundSample(); if (sample) state.demoTime = t; }

  if (analyser && state.leqBuffer) {
    const td = new Float32Array(analyser.fftSize);
    const fd = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatTimeDomainData(td);
    analyser.getFloatFrequencyData(fd);
    let sumSq = 0;
    for (let i = 0; i < td.length; i++) sumSq += td[i] * td[i];
    const rmsVal = Math.sqrt(sumSq / td.length);
    const rmsDBFS = 20 * Math.log10(rmsVal || 1e-10);
    let weightedDB = rmsDBFS + state.calibrationOffset;
    if (state.weighting === 'a' || state.weighting === 'c') {
      let weightedSum = 0, totalWeight = 0;
      for (let k = 1; k < fd.length; k++) {
        const m = Math.pow(10, fd[k] / 10);
        weightedSum += m; totalWeight += m;
      }
      weightedDB = totalWeight > 0 ? 10 * Math.log10(weightedSum / totalWeight) + state.calibrationOffset : rmsDBFS;
    }
    const peakVal = 20 * Math.log10(Math.max(...td.map(Math.abs)) || 1e-10) + state.calibrationOffset;
    const nowMs = performance.now();
    if (peakVal > state.peakHold) { state.peakHold = peakVal; state.peakDecayStart = nowMs; }
    else if (nowMs - state.peakDecayStart > 2000) state.peakHold = Math.max(0, state.peakHold - 0.5);

    state.leqBuffer.push(weightedDB);
    let leqSum = 0;
    const n = state.leqBuffer.len;
    for (let i = 0; i < n; i++) leqSum += Math.pow(10, state.leqBuffer.get(i) / 10);
    const leq = n > 0 ? 10 * Math.log10(leqSum / n) : 0;

    let maxBin = -1, maxVal = -Infinity;
    for (let k = 1; k < fd.length; k++) { if (fd[k] > maxVal) { maxVal = fd[k]; maxBin = k; } }
    let peakFreq = 0;
    if (maxBin > 0 && maxBin < fd.length - 1 && audioCtx) {
      peakFreq = maxBin * (audioCtx.sampleRate / 2 / fd.length);
    }

    setAllReadouts(weightedDB.toFixed(1) + ' dB', (weightedDB - 2).toFixed(1) + ' dB(A)', (weightedDB - 0.5).toFixed(1) + ' dB(C)', state.peakHold.toFixed(1), rmsVal.toFixed(4) + ' dBFS', leq.toFixed(1), peakFreq, 'Hz');
    updatePeakDisplay(state.peakHold.toFixed(1));
    updateSafety(weightedDB);
    drawOscilloscope(td);
    drawSpectrum(fd);
    drawHistory(weightedDB);
  } else if (isDemo && sample) {
    const demoDB = 20 * Math.log10(sample.rms) + state.calibrationOffset;
    state.leqBuffer.push(demoDB);
    let leqSum2 = 0;
    for (let i = 0; i < state.leqBuffer.len; i++) leqSum2 += Math.pow(10, state.leqBuffer.get(i) / 10);
    const leq2 = state.leqBuffer.len > 0 ? 10 * Math.log10(leqSum2 / state.leqBuffer.len) : 0;
    setAllReadouts(demoDB.toFixed(1) + ' dB', (demoDB - 2).toFixed(1) + ' dB(A)', (demoDB - 0.5).toFixed(1) + ' dB(C)', Math.max(state.peakHold, demoDB).toFixed(1), sample.rms.toFixed(4) + ' dBFS', leq2.toFixed(1), sample.toneFreq, 'Hz');
    updatePeakDisplay(Math.max(state.peakHold, demoDB).toFixed(1));
    updateSafety(demoDB);
    drawOscilloscopeDemo(sample.sample);
    drawSpectrumDemo();
    drawHistory(demoDB);
  } else {
    setAllReadouts('--', '--', '--', '—', '—', '—', '—', '—');
  }
}

function updateSafety(dB) {
  const fill = state.safetyFillEl;
  const indicator = state.safetyIndicatorEl;
  if (!fill || !indicator) return;
  let width = 0, color = '#22c55e', text = 'Safe';
  if (dB > 90) { width = 100; color = '#ef4444'; text = 'DANGER'; }
  else if (dB > 80) { width = 80 + (dB - 80) * 0.75; color = '#f97316'; text = 'High'; }
  else if (dB > 70) { width = 70 + (dB - 70); color = '#eab308'; text = 'Moderate'; }
  else { width = dB * 1.43; color = '#22c55e'; text = 'Safe'; }
  fill.style.width = clamp(width, 0, 100) + '%';
  fill.style.background = color;
  fill.style.boxShadow = '0 0 8px ' + color;
  const dotClass = color === '#22c55e' ? 'green' : color === '#eab308' ? 'yellow' : color === '#f97316' ? 'orange' : 'red';
  indicator.innerHTML = '<span class="safety-dot ' + dotClass + '"></span><span class="safety-text" style="color:' + color + '">' + text + '</span>';
}

function drawOscilloscope(td) {
  const canvas = document.getElementById('sound-wave-canvas');
  if (!canvas) return;
  const info = fitCanvas(canvas);
  if (!info) return;
  const { ctx, w, h } = info;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,240,255,0.06)'; ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(0,240,255,0.15)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  if (!td) return;
  const n = td.length;
  const step = w / n;
  ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 1.2;
  ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 6;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const y = h / 2 - td[i] * (h / 2 - 4);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.shadowBlur = 0;
}

function drawOscilloscopeDemo(sample) {
  const canvas = document.getElementById('sound-wave-canvas');
  if (!canvas) return;
  const info = fitCanvas(canvas);
  if (!info) return;
  const { ctx, w, h } = info;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, w, h);
  const n = 512;
  ctx.strokeStyle = '#00f0ff'; ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 4; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const phase = (i / n) * Math.PI * 2 + state.demoTime * 400;
    const val = sample * 0.3 * Math.sin(phase) + 0.1 * Math.sin(phase * 3 + 0.5);
    const x = i * (w / n);
    const y = h / 2 - val * (h / 2 - 4);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.shadowBlur = 0;
}

function drawSpectrum(fd) {
  const canvas = document.getElementById('sound-spectrum-canvas');
  if (!canvas || !fd) return;
  const info = fitCanvas(canvas);
  if (!info) return;
  const { ctx, w, h } = info;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, w, h);
  const nBars = Math.min(w / 2, fd.length);
  const barW = w / nBars;
  for (let i = 0; i < nBars; i++) {
    const idx = Math.floor(i * fd.length / nBars);
    let val = 0;
    for (let j = idx; j < Math.min(idx + 2, fd.length); j++) val = Math.max(val, fd[j]);
    const norm = clamp((val + 100) / 100, 0, 1);
    const y = h - norm * (h - 4) - 2;
    const barH = norm * (h - 4);
    let r, g, b;
    if (norm < 0.4) { const t = norm / 0.4; r = 0 + t * 168; g = 240 + t * (85 - 240); b = 255 + t * (247 - 255); }
    else if (norm < 0.7) { const t = (norm - 0.4) / 0.3; r = 168 + t * (255 - 168); g = 85 + t * (215 - 85); b = 247 + t * (0 - 247); }
    else { r = 255; g = 215; b = 0; }
    ctx.fillStyle = 'rgba(' + (r|0) + ',' + (g|0) + ',' + (b|0) + ',0.8)';
    ctx.fillRect(i * barW, y, barW - 0.5, barH);
  }
}

function drawSpectrumDemo() {
  const canvas = document.getElementById('sound-spectrum-canvas');
  if (!canvas) return;
  const info = fitCanvas(canvas);
  if (!info) return;
  const { ctx, w, h } = info;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, w, h);
  const numBars = Math.floor(w / 3);
  const barW2 = w / numBars;
  for (let i = 0; i < numBars; i++) {
    const freq = i * 24000 / numBars;
    let val = Math.random() * 0.15;
    const demoFreq = 400 + 200 * Math.sin(state.demoTime * 0.12);
    const dist = Math.abs(freq - demoFreq);
    if (dist < 200) val += 0.6 * (1 - dist / 200);
    val = clamp(val, 0, 1);
    const y = h - val * (h - 4) - 2;
    ctx.fillStyle = 'rgba(0,240,255,' + (0.3 + val * 0.5) + ')';
    ctx.fillRect(i * barW2, y, barW2 - 0.5, val * (h - 4));
  }
}

function drawHistory(dB) {
  const canvas = document.getElementById('sound-history-canvas');
  if (!canvas) return;
  const info = fitCanvas(canvas);
  if (!info) return;
  const { ctx, w, h } = info;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,240,255,0.04)'; ctx.lineWidth = 0.5;
  for (let y = 0; y < h; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  state.historyBuffer.push(dB);
  const vals = state.historyBuffer.toArray();
  if (vals.length < 2) return;
  const minDB = -60, maxDB = 100, range = maxDB - minDB;
  ctx.beginPath();
  const stepX = w / Math.min(vals.length, w);
  ctx.moveTo(0, h);
  for (let i = 0; i < vals.length && i < w / stepX; i++) {
    const x = i * stepX;
    const ny = clamp((vals[i] - minDB) / range, 0, 1) * h;
    ctx.lineTo(x, ny);
  }
  ctx.lineTo((Math.min(vals.length, w / stepX)) * stepX, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,240,255,0.12)'; ctx.fill();
  ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 1.2;
  ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 4;
  ctx.beginPath();
  for (let i = 0; i < vals.length && i < w; i++) {
    const x = i * stepX;
    const ny = h - clamp((vals[i] - minDB) / range, 0, 1) * h;
    if (i === 0) ctx.moveTo(x, ny); else ctx.lineTo(x, ny);
  }
  ctx.stroke(); ctx.shadowBlur = 0;
}
