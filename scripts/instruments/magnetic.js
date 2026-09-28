/* ============================================================
   instruments/magnetic.js — MAGNETIC FIELD MAPPER
   ============================================================ */

import { Demo } from '../demo.js';
import { clamp } from '../utils.js';

let state = null;
let isActive = false;
let magSensor = null;
let heatPointer = null;

export function init() {
  state = {
    xEl: null, yEl: null, zEl: null, totalEl: null,
    vsEarthEl: null, deviationDirEl: null,
    anomalyFillEl: null, anomalyValEl: null,
    thresholdEl: null, thresholdDisplayEl: null,
    fpsEl: null, waveCanvas: null, heatCanvas: null,
    calibrateBtn: null, resetTrailBtn: null, toneBtn: null, hapticBtn: null,
    statusEl: null, hintEl: null,
    currentX: 0, currentY: 0, currentZ: 0, currentTotal: 0, currentAnomaly: 0,
    baselineX: 15, baselineY: 10, baselineZ: 45,
    baselineSamples: [],
    anomalyThreshold: 5,
    trailData: [],
    paintMode: false,
    toneActive: false, toneOsc: null, toneCtx: null,
    xBuf: new Float64Array(300), yBuf: new Float64Array(300), zBuf: new Float64Array(300),
    bufPos: 0
  };
}

export function activate() {
  if (!state || isActive) return;
  isActive = true;
  state.xEl = document.getElementById('mag-x');
  state.yEl = document.getElementById('mag-y');
  state.zEl = document.getElementById('mag-z');
  state.totalEl = document.getElementById('mag-total');
  state.vsEarthEl = document.getElementById('mag-vs-earth');
  state.deviationDirEl = document.getElementById('mag-deviation-dir');
  state.anomalyFillEl = document.getElementById('mag-anomaly-fill');
  state.anomalyValEl = document.getElementById('mag-anomaly-val');
  state.thresholdEl = document.getElementById('mag-threshold');
  state.thresholdDisplayEl = document.getElementById('mag-threshold-display');
  state.fpsEl = document.getElementById('mag-fps');
  state.waveCanvas = document.getElementById('mag-wave-canvas');
  state.heatCanvas = document.getElementById('mag-heat-canvas');
  state.calibrateBtn = document.getElementById('mag-calibrate-btn');
  state.resetTrailBtn = document.getElementById('mag-reset-trail-btn');
  state.toneBtn = document.getElementById('mag-tone-btn');
  state.hapticBtn = document.getElementById('mag-haptic-btn');
  state.statusEl = document.getElementById('mag-status');
  state.hintEl = document.querySelector('#panel-magnetic .heat-hint');

  const threshold = document.getElementById('mag-threshold');
  if (threshold) state.anomalyThreshold = parseFloat(threshold.value) || 5;

  const chip = document.querySelector('#panel-magnetic .mode-chip');
  const badge = document.querySelector('#panel-magnetic .sim-badge');
  state.statusEl.textContent = 'Initializing…';

  if (location.protocol === 'file:') {
    state.statusEl.textContent = 'file:// — open via START.bat to use sensors';
    if (chip) chip.dataset.mode = 'unsupported';
    return;
  }

  const hasMag = 'Magnetometer' in window || 'UncalibratedMagnetometer' in window;
  if (hasMag) {
    try {
      magSensor = new Magnetometer({ frequency: 60 });
      magSensor.addEventListener('reading', onMagReading);
      magSensor.addEventListener('error', onMagError);
      magSensor.start();
      if (chip) chip.dataset.mode = 'live';
      state.statusEl.textContent = 'Magnetometer active';
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
        magSensor = new UncalibratedMagnetometer({ frequency: 60 });
        magSensor.addEventListener('reading', onMagReading);
        magSensor.start();
        if (chip) chip.dataset.mode = 'live';
        state.statusEl.textContent = 'Uncalibrated magnetometer active';
      } catch (_) {
        state.statusEl.textContent = 'No magnetometer on this device — Demo mode';
        if (chip) chip.dataset.mode = 'unsupported';
        badge?.classList.remove('hidden');
        Demo.setEnabled(true);
        isActive = false;
      }
    }
  } else {
    state.statusEl.textContent = 'No magnetometer on this device — Demo mode';
    if (chip) chip.dataset.mode = 'unsupported';
    badge?.classList.remove('hidden');
    Demo.setEnabled(true);
    isActive = false;
  }

  state.calibrateBtn?.addEventListener('click', calibrate);
  state.resetTrailBtn?.addEventListener('click', resetTrail);
  state.toneBtn?.addEventListener('click', toggleTone);
  state.hapticBtn?.addEventListener('click', toggleHaptic);

  const thresholdInput = document.getElementById('mag-threshold');
  if (thresholdInput) thresholdInput.addEventListener('input', () => { state.anomalyThreshold = parseFloat(thresholdInput.value) || 5; if (state.thresholdDisplayEl) state.thresholdDisplayEl.textContent = (state.anomalyThreshold).toFixed(1) + ' µT'; });

  if (state.hintEl) state.hintEl.textContent = 'Drag across the heat canvas to paint a field map';
  setupHeatCanvas();
  Loop.register('magnetic', drawLoop, 30);
}

export function deactivate() {
  if (!isActive) return;
  isActive = false;
  if (magSensor) { try { if (typeof magSensor.stop === 'function') magSensor.stop(); } catch (_) {} magSensor = null; }
  if (state.toneActive) stopTone();
  Loop.unregister('magnetic');
  const chip = document.querySelector('#panel-magnetic .mode-chip');
  if (chip) chip.dataset.mode = 'idle';
  const badge = document.querySelector('#panel-magnetic .sim-badge');
  if (badge) badge.classList.add('hidden');
  updateReadouts();
  drawWaveFrame();
  drawHeatFrame();
}

function onMagReading(e) {
  if (!isActive) return;
  const x = e.reading.x !== null ? e.reading.x : 0;
  const y = e.reading.y !== null ? e.reading.y : 0;
  const z = e.reading.z !== null ? e.reading.z : 0;
  state.currentX = x; state.currentY = y; state.currentZ = z;
  state.currentTotal = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
  state.baselineSamples.push(x, y, z);
  if (state.baselineSamples.length > 500) state.baselineSamples.splice(0, state.baselineSamples.length - 500);
  if (state.baselineSamples.length >= 100 && state.baselineSamples.length % 100 === 0) updateBaselines();
  const diffX = x - state.baselineX, diffY = y - state.baselineY, diffZ = z - state.baselineZ;
  state.currentAnomaly = Math.sqrt(diffX ** 2 + diffY ** 2 + diffZ ** 2);
  state.xBuf[state.bufPos % 300] = x;
  state.yBuf[state.bufPos % 300] = y;
  state.zBuf[state.bufPos % 300] = z;
  state.bufPos++;
  updateReadouts();
  drawWaveFrame();
  drawHeatFrame();
  updateAnomalyMeter(state.currentAnomaly);
}

function updateBaselines() {
  const samples = state.baselineSamples;
  if (samples.length < 50) return;
  const xs = samples.filter((_, i) => i % 3 === 0);
  const ys = samples.filter((_, i) => i % 3 === 1);
  const zs = samples.filter((_, i) => i % 3 === 2);
  state.baselineX = median(xs);
  state.baselineY = median(ys);
  state.baselineZ = median(zs);
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function onMagError(e) {
  if (!isActive) return;
  console.warn('Magnetometer error:', e);
  if (state.statusEl && isActive) state.statusEl.textContent = 'Sensor error — ' + e.message;
}

function updateReadouts() {
  if (state.xEl) state.xEl.textContent = isFinite(state.currentX) ? state.currentX.toFixed(2) + ' µT' : '—';
  if (state.yEl) state.yEl.textContent = isFinite(state.currentY) ? state.currentY.toFixed(2) + ' µT' : '—';
  if (state.zEl) state.zEl.textContent = isFinite(state.currentZ) ? state.currentZ.toFixed(2) + ' µT' : '—';
  if (state.totalEl) state.totalEl.textContent = isFinite(state.currentTotal) ? state.currentTotal.toFixed(2) + ' µT' : '—';
  const bTotal = Math.sqrt(state.baselineX ** 2 + state.baselineY ** 2 + state.baselineZ ** 2);
  const diffTotal = Math.abs(state.currentTotal - bTotal);
  if (state.vsEarthEl) state.vsEarthEl.textContent = bTotal > 0 ? (diffTotal).toFixed(2) + ' µT (' + (diffTotal / bTotal * 100).toFixed(1) + '%)' : '—';
  const dx = state.currentX - state.baselineX;
  const dy = state.currentY - state.baselineY;
  let dirDeg = 0;
  if (dx !== 0 || dy !== 0) dirDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  if (state.deviationDirEl) state.deviationDirEl.textContent = dirDeg.toFixed(0) + '° ' + dirToCompass(dirDeg);
}

function dirToCompass(deg) {
  const dirs = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const i = Math.round(((deg + 360) % 360) / 45) % 8;
  return dirs[i];
}

function updateAnomalyMeter(anomaly) {
  const fill = state.anomalyFillEl;
  const valEl = state.anomalyValEl;
  if (!fill || !valEl) return;
  const pct = clamp(anomaly / (state.anomalyThreshold || 5) * 100, 0, 100);
  fill.style.width = pct + '%';
  if (pct > 80) { fill.style.background = '#ef4444'; fill.style.boxShadow = '0 0 8px rgba(239,68,68,0.3)'; }
  else if (pct > 50) { fill.style.background = '#eab308'; fill.style.boxShadow = '0 0 8px rgba(234,179,8,0.3)'; }
  else { fill.style.background = '#00f0ff'; fill.style.boxShadow = '0 0 8px rgba(0,240,255,0.2)'; }
  valEl.textContent = anomaly.toFixed(2) + ' µT';
}

function calibrate() {
  state.baselineX = state.currentX;
  state.baselineY = state.currentY;
  state.baselineZ = state.currentZ;
  state.baselineSamples = [];
  state.statusEl.textContent = 'Calibrated: ' + state.baselineX.toFixed(1) + ', ' + state.baselineY.toFixed(1) + ', ' + state.baselineZ.toFixed(1) + ' µT (Earth field)';
  state.statusEl.classList.add('ok');
  setTimeout(() => state.statusEl.classList.remove('ok'), 3000);
  const chip = document.querySelector('#panel-magnetic .mode-chip');
  if (chip) chip.dataset.mode = 'live';
  updateReadouts();
  updateAnomalyMeter(0);
}

function resetTrail() {
  state.trailData = [];
  drawHeatFrame();
  if (state.statusEl) { state.statusEl.textContent = 'Heat map trail cleared'; setTimeout(() => { state.statusEl.textContent = 'Magnetometer active'; }, 2000); }
}

function toggleTone() {
  if (state.toneActive) { stopTone(); state.toneBtn.setAttribute('aria-pressed', 'false'); const label = state.toneBtn.querySelector('.label'); if (label) label.textContent = 'Tone OFF'; }
  else { startTone(); state.toneBtn.setAttribute('aria-pressed', 'true'); const label = state.toneBtn.querySelector('.label'); if (label) label.textContent = 'Tone ON'; }
}

function startTone() {
  try {
    state.toneCtx = new AudioContext();
    state.toneOsc = state.toneCtx.createOscillator();
    state.toneOsc.type = 'sawtooth';
    state.toneOsc.frequency.value = 80;
    const gain = state.toneCtx.createGain();
    gain.gain.value = 0.05;
    state.toneOsc.connect(gain);
    gain.connect(state.toneCtx.destination);
    state.toneOsc.start();
    state.toneActive = true;
  } catch (_) {}
}

function stopTone() {
  if (state.toneOsc) { try { state.toneOsc.stop(); } catch (_) {} state.toneOsc = null; }
  if (state.toneCtx && state.toneCtx.state !== 'closed') { try { state.toneCtx.close(); } catch (_) {} state.toneCtx = null; }
  state.toneActive = false;
}

function toggleHaptic() {
  if (navigator.vibrate) {
    navigator.vibrate(200);
    state.hapticBtn.setAttribute('aria-pressed', state.hapticBtn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    const label = state.hapticBtn.querySelector('.label');
    if (label) label.textContent = navigator.vibrate ? 'Vibrate ON' : 'Vibrate OFF';
  } else {
    if (state.statusEl) { state.statusEl.textContent = 'Vibration API not available on this device'; state.statusEl.classList.add('info'); setTimeout(() => state.statusEl.classList.remove('info'), 3000); }
  }
}

function setupHeatCanvas() {
  const heatCanvas = state.heatCanvas;
  if (!heatCanvas) return;
  heatCanvas.addEventListener('pointerdown', (e) => { heatCanvas.setPointerCapture(e.pointerId); heatPointer = { x: e.offsetX / heatCanvas.width, y: e.offsetY / heatCanvas.height }; state.paintMode = true; });
  heatCanvas.addEventListener('pointermove', (e) => {
    if (!state.paintMode) return;
    heatPointer = { x: e.offsetX / heatCanvas.width, y: e.offsetY / heatCanvas.height };
    const canvasW = heatCanvas.width / (window.devicePixelRatio || 1);
    const canvasH = heatCanvas.height / (window.devicePixelRatio || 1);
    const px = (e.offsetX / (heatCanvas.width / canvasW));
    const py = (e.offsetY / (heatCanvas.height / canvasH));
    state.trailData.push({ x: px, y: py, val: state.currentAnomaly });
    if (state.trailData.length > 500) state.trailData.splice(0, 100);
    drawHeatFrame();
  });
  heatCanvas.addEventListener('pointerup', () => { state.paintMode = false; heatPointer = null; });
  heatCanvas.addEventListener('pointercancel', () => { state.paintMode = false; heatPointer = null; });
}

function drawHeatFrame() {
  const canvas = state.heatCanvas;
  if (!canvas) return;
  const info = fitCanvas(canvas);
  if (!info) return;
  const { ctx, w, h } = info;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, w, h);
  for (const pt of state.trailData) {
    const val = clamp(pt.val / (state.anomalyThreshold || 5), 0, 1);
    let r, g, b;
    if (val < 0.4) { const t = val / 0.4; r = 160 + 60 * t; g = 30 + 100 * t; b = 200 + 20 * t; }
    else if (val < 0.7) { const t = (val - 0.4) / 0.3; r = 220 + 35 * t; g = 130 + 120 * t; b = 220 - 200 * t; }
    else { const t = (val - 0.7) / 0.3; r = 255; g = 250 + 5 * t; b = 20 + 235 * t; }
    const radius = 3 + val * 8;
    const alpha = 0.3 + val * 0.5;
    ctx.fillStyle = 'rgba(' + (r|0) + ',' + (g|0) + ',' + (b|0) + ',' + alpha + ')';
    ctx.beginPath(); ctx.arc(pt.x * w, pt.y * h, radius, 0, 2 * Math.PI); ctx.fill();
  }
  const legendY = h - 16, legendH = 6, legendW = w - 20, legendX = 10;
  for (let i = 0; i < legendW; i++) {
    const t = i / legendW;
    let r, g, b;
    if (t < 0.4) { const lt = t / 0.4; r = 160 + 60 * lt; g = 30 + 100 * lt; b = 200 + 20 * lt; }
    else if (t < 0.7) { const lt = (t - 0.4) / 0.3; r = 220 + 35 * lt; g = 130 + 120 * lt; b = 220 - 200 * lt; }
    else { const lt = (t - 0.7) / 0.3; r = 255; g = 250 + 5 * lt; b = 20 + 235 * lt; }
    ctx.fillStyle = 'rgb(' + (r|0) + ',' + (g|0) + ',' + (b|0) + ')';
    ctx.fillRect(legendX + i, legendY, 1, legendH);
  }
  ctx.fillStyle = 'rgba(136,146,184,0.6)'; ctx.font = '6px ui-monospace, monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('low', legendX, legendY - 1);
  ctx.textAlign = 'right'; ctx.fillText('high', legendX + legendW, legendY - 1);
  if (!state.paintMode && performance.now() % 100 < 5) {
    state.trailData.push({ x: 0.5 + 0.3 * Math.sin(performance.now() * 0.001), y: 0.5 + 0.3 * Math.cos(performance.now() * 0.0015), val: state.currentAnomaly * 0.3 });
  }
}

function drawWaveFrame() {
  const canvas = state.waveCanvas;
  if (!canvas) return;
  const info = fitCanvas(canvas);
  if (!info) return;
  const { ctx, w, h } = info;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,240,255,0.04)'; ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(0,240,255,0.1)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  ctx.fillStyle = 'rgba(136,146,184,0.4)'; ctx.font = '7px ui-monospace, monospace';
  ctx.fillText('+', 2, 10); ctx.fillText('0', 2, h / 2 + 3); ctx.fillText('-', 2, h - 4);
  const n = Math.min(state.bufPos, 200);
  if (n < 2) return;
  const scale = h * 0.38 / Math.max(1, (state.baselineZ || 45) * 1.2);
  const axes = [
    { buf: state.xBuf, color: '#00f0ff', width: 1.5 },
    { buf: state.yBuf, color: '#ffd700', width: 1.2 },
    { buf: state.zBuf, color: '#a855f7', width: 1.2 }
  ];
  for (const ax of axes) {
    ctx.strokeStyle = ax.color; ctx.lineWidth = ax.width;
    ctx.shadowColor = ax.color; ctx.shadowBlur = 4;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = ax.buf[(state.bufPos - n + i) % 300];
      if (v == null) continue;
      const xPos = (state.bufPos - n + i) / state.bufPos * w;
      const yPos = h / 2 - v * scale;
      if (i === 0) ctx.moveTo(xPos, yPos); else ctx.lineTo(xPos, yPos);
    }
    ctx.stroke(); ctx.shadowBlur = 0;
  }
  if (state.fpsEl) state.fpsEl.textContent = Loop.getFPS() + ' FPS';
}

function drawLoop() {
  if (!isActive) return;
  if (state.toneActive && state.toneOsc && state.toneCtx) {
    try { state.toneOsc.frequency.setTargetAtTime(60 + state.currentAnomaly * 8, state.toneCtx.currentTime, 0.05); } catch (_) {}
  }
  drawWaveFrame();
  drawHeatFrame();
}
