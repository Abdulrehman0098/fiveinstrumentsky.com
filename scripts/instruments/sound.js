/* ============================================================
   instruments/sound.js — SOUND LEVEL METER
   dB SPL, A-weighted, waveform + spectrum + history
   ============================================================ */

import FFT from '../lib/fft.js';

let soundState = null;
let isRunning = false;

// Active unit: 'spl' | 'a' | 'c'
let activeUnit = 'spl';

// Audio
let audioContext = null;
let analyserNode = null;
let mediaStream = null;
let sourceNode = null;

// Canvas
let waveCanvas = null, waveCtx = null;
let spectrumCanvas = null, spectrumCtx = null;
let historyCanvas = null, historyCtx = null;

// Data buffers
const HISTORY_LEN = 600; // 60 seconds at 10 samples/sec
const historyBuffer = new Float64Array(HISTORY_LEN);
let historyIdx = 0;
let historyCount = 0;

// FFT buffer
const FFT_SIZE = 8192;
let fftBuffer = new Float64Array(FFT_SIZE);
let fftIdx = 0;

// Display state
let currentDB = 0;
let currentDBa = 0;
let currentDBc = 0;
let peakHold = -Infinity;
let peakResetTime = 0;
let leqSum = 0;
let leqCount = 0;
let calibrationOffset = 0;

// A-weighting + display
let spectrumData = null;
let waveformData = null;

// Safety zones
const SAFETY_ZONES = [
  { max: 55, color: 'green', label: 'Safe' },
  { max: 75, color: 'yellow', label: 'Moderate' },
  { max: 85, color: 'orange', label: 'High' },
  { max: 120, color: 'red', label: 'Danger' },
];

// FPS
let waveFpsEl = null, lastFrameTime = 0, frameCount = 0, fpsTimer = 0, fps = 0;

// Last sample rate
let sampleRate = 44100;

/* ---------- Initialize ---------- */

function init(appState, bus, utils, perm) {
  soundState = { appState, bus, utils, perm };
  waveCanvas = document.getElementById('sound-wave-canvas');
  spectrumCanvas = document.getElementById('sound-spectrum-canvas');
  historyCanvas = document.getElementById('sound-history-canvas');
  waveFpsEl = document.getElementById('sound-wave-fps');

  // Guard: bail if critical elements missing
  if (!waveCanvas || !spectrumCanvas || !historyCanvas) {
    setStatus('Sound canvas elements not found in DOM', 'error');
    return;
  }
  waveCtx = waveCanvas.getContext('2d');
  spectrumCtx = spectrumCanvas.getContext('2d');
  historyCtx = historyCanvas.getContext('2d');
  if (!waveCtx || !spectrumCtx || !historyCtx) {
    setStatus('Sound canvas 2d contexts unavailable', 'error');
    return;
  }

  // React to unit system changes (metric/imperial)
  bus.on('unitschange', () => updateDisplay());

  wireControls();
  resetAll();
  updateStatus();
}

function destroy() {
  stopAudio();
  isRunning = false;
}

function activate(appState, bus, utils, perm) {
  soundState = { appState, bus, utils, perm };
}

/* ---------- Audio setup ---------- */

async function startAudio() {
  if (isRunning) return;
  if (!window.AudioContext && !window.webkitAudioContext) {
    setStatus('Web Audio API not supported', 'error');
    return;
  }

  try {
    mediaStream = await perm.requestMicrophone();
    if (!mediaStream) {
      setStatus('Microphone permission denied', 'error');
      return;
    }
  } catch (err) {
    setStatus('Microphone access failed: ' + err.message, 'error');
    return;
  }

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = FFT_SIZE;
    analyserNode.smoothingTimeConstant = 0.8;

    sourceNode.connect(analyserNode);
    sampleRate = audioContext.sampleRate;

    isRunning = true;
    document.getElementById('sound-toggle-btn').textContent = 'Stop Meter';
    document.getElementById('sound-toggle-btn').setAttribute('aria-pressed', 'true');
    setStatus('Meter active — speaking or noise will show here', 'ok');

    // Start render loops
    lastFrameTime = performance.now();
    frameCount = 0;
    fpsTimer = lastFrameTime;
    renderLoop();
  } catch (err) {
    setStatus('Audio setup failed: ' + err.message, 'error');
    stopAudio();
  }
}

function stopAudio() {
  isRunning = false;
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch (_) {}
    sourceNode = null;
  }
  if (analyserNode) {
    try { analyserNode.disconnect(); } catch (_) {}
    analyserNode = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  document.getElementById('sound-toggle-btn').textContent = 'Start Meter';
  document.getElementById('sound-toggle-btn').setAttribute('aria-pressed', 'false');
  setStatus('Meter stopped', '');
}

/* ---------- Render loop (30 fps target) ---------- */

let animFrameId = null;

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

  if (analyserNode && isRunning) {
    // Sample at ~30Hz
    if (elapsed >= 33) {
      readAudioData();
      updateDisplay();
    }
  }

  drawWaveform();
  drawSpectrum();
  drawHistory();
}

/* ---------- Read audio data ---------- */

function readAudioData() {
  if (!analyserNode) return;

  const timeData = new Float32Array(analyserNode.fftSize);
  const freqData = new Uint8Array(analyserNode.frequencyBinCount);
  analyserNode.getFloatTimeDomainData(timeData);
  analyserNode.getFloatFrequencyData(freqData);

  waveformData = timeData;

  // Compute RMS dBFS
  let sumSquares = 0;
  for (let i = 0; i < timeData.length; i++) {
    sumSquares += timeData[i] * timeData[i];
  }
  const rms = Math.sqrt(sumSquares / timeData.length);
  // dBFS = 20 * log10(rms) — 0 dBFS = full scale
  const dbfs = rms > 0 ? 20 * Math.log10(rms) : -120;

  // Convert to approximate dB SPL using a reference of -20 dBFS = 94 dB SPL (calibration)
  // This is an approximation — real SPL requires calibration
  const dbSpl = dbfs + 94 + calibrationOffset;

  currentDB = clamp(dbSpl, 0, 140);

  // A-weighted dB from spectrum
  const freqMagnitudes = new Float64Array(freqData.length);
  for (let i = 0; i < freqData.length; i++) {
    // Convert from dB to linear
    const linear = Math.pow(10, freqData[i] / 20);
    freqMagnitudes[i] = linear;
  }

  // Apply A-weighting
  const awSum = FFT.aWeightedRMS(freqMagnitudes, sampleRate);
  currentDBa = awSum > 0 ? 20 * Math.log10(awSum) + 94 + calibrationOffset : -120;
  currentDBa = clamp(currentDBa, 0, 140);

  // C-weighted dB from spectrum
  const cwSum = FFT.cWeightedRMS(freqMagnitudes, sampleRate);
  currentDBc = cwSum > 0 ? 20 * Math.log10(cwSum) + 94 + calibrationOffset : -120;
  currentDBc = clamp(currentDBc, 0, 140);

  // Peak hold
  if (currentDB > peakHold) {
    peakHold = currentDB;
  }

  // Leq (equivalent continuous level)
  leqSum += currentDB * currentDB;
  leqCount++;

  // History
  historyBuffer[historyIdx] = currentDB;
  historyIdx = (historyIdx + 1) % HISTORY_LEN;
  if (historyCount < HISTORY_LEN) historyCount++;

  // Spectrum data for display (convert to dB)
  spectrumData = new Float64Array(freqData.length);
  for (let i = 0; i < freqData.length; i++) {
    spectrumData[i] = freqData[i]; // already dB
  }
}

/* ---------- Display update ---------- */

function updateDisplay() {
  const currentEl = document.getElementById('sound-db-current');
  const unitEl = document.getElementById('sound-db-unit');
  const aEl = document.getElementById('sound-db-a');
  const cEl = document.getElementById('sound-db-c');
  const peakEl = document.getElementById('sound-db-peak');
  const leqEl = document.getElementById('sound-db-leq');
  const safetyFill = document.getElementById('sound-safety-fill');
  const safetyBar = document.getElementById('sound-safety-bar');
  const safetyIndicator = document.getElementById('sound-safety-indicator');

  // Determine which value to show based on current unit mode
  let displayValue = currentDB; // default: dB SPL
  if (activeUnit === 'a') displayValue = currentDBa;
  else if (activeUnit === 'c') displayValue = currentDBc;
  const dbUnitEl = document.querySelector('.unit-toggle-row .unit-toggle-btn.active');
  const activeDbUnit = dbUnitEl ? dbUnitEl.dataset.dbUnit : 'spl';

  if (currentEl) currentEl.textContent = displayValue.toFixed(1);
  if (unitEl) unitEl.textContent = activeDbUnit === 'a' ? 'dB(A)' : activeDbUnit === 'c' ? 'dB(C)' : 'dB SPL';
  if (aEl) aEl.textContent = currentDBa.toFixed(1);
  if (cEl) cEl.textContent = currentDBc.toFixed(1);
  if (peakEl) peakEl.textContent = peakHold > -Infinity ? peakHold.toFixed(1) : '—';

  // Leq
  if (leqCount > 0) {
    const leq = Math.sqrt(leqSum / leqCount);
    if (leqEl) leqEl.textContent = leq.toFixed(1);
  }

  // Safety bar
  if (safetyFill && safetyBar) {
    const pct = clamp((currentDB / 120) * 100, 0, 100);
    safetyFill.style.width = pct + '%';
    safetyBar.setAttribute('aria-valuenow', Math.round(currentDB));

    let zoneColor = 'var(--green)';
    let zoneLabel = 'Safe';
    if (currentDB > 85) { zoneColor = 'var(--red)'; zoneLabel = 'Danger'; }
    else if (currentDB > 75) { zoneColor = 'var(--orange)'; zoneLabel = 'High'; }
    else if (currentDB > 55) { zoneColor = 'var(--yellow)'; zoneLabel = 'Moderate'; }

    safetyFill.style.background = zoneColor;
    if (safetyIndicator) {
      const dot = safetyIndicator.querySelector('.safety-dot');
      const text = safetyIndicator.querySelector('.safety-text');
      if (dot) { dot.className = 'safety-dot ' + zoneLabel.toLowerCase(); }
      if (text) text.textContent = zoneLabel;
    }
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

  // Background — deep blue-black
  waveCtx.fillStyle = '#060912';
  waveCtx.fillRect(0, 0, w, h);

  // Grid — dark cyan
  waveCtx.strokeStyle = 'rgba(0,240,255,0.12)';
  waveCtx.lineWidth = 0.5;
  for (let i = 0; i < 8; i++) {
    const y = (i / 8) * h;
    waveCtx.beginPath();
    waveCtx.moveTo(0, y);
    waveCtx.lineTo(w, y);
    waveCtx.stroke();
  }

  if (!waveformData) return;

  const cssW = rect.width;
  const cssH = rect.height;
  const len = waveformData.length;
  const step = Math.max(1, Math.floor(len / cssW));

  // Electric cyan waveform — bright neon
  waveCtx.strokeStyle = '#00f0ff';
  waveCtx.lineWidth = 1.6;
  waveCtx.shadowColor = 'rgba(0,240,255,0.35)';
  waveCtx.shadowBlur = 6;
  waveCtx.beginPath();

  const midY = cssH / 2 * dpr;
  const amp = cssH * 0.4 * dpr;

  for (let x = 0; x < cssW; x++) {
    const idx = Math.floor(x * step);
    const idxClamped = Math.min(idx, len - 1);
    const val = waveformData[idxClamped];
    const y = midY - val * amp;
    if (x === 0) waveCtx.moveTo(x, y);
    else waveCtx.lineTo(x, y);
  }
  waveCtx.stroke();
  waveCtx.shadowBlur = 0;
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

  if (!spectrumData || spectrumData.length === 0) return;

  const cssW = rect.width;
  const cssH = rect.height;
  const len = spectrumData.length;
  const barCount = Math.min(128, len);
  const barWidth = cssW / barCount * dpr;
  const step = Math.max(1, Math.floor(len / barCount));

  // Draw 1/3 octave bands — hot neon gradient
  for (let i = 0; i < barCount; i++) {
    const idx = Math.floor(i * step);
    const idxClamped = Math.min(idx, len - 1);
    const dB = spectrumData[idxClamped];

    // Convert to 0-1 for drawing, clamp at -100 dB
    const height = clamp((dB + 100) / 100, 0, 1) * cssH * dpr;

    const x = i * barWidth;
    const y = cssH * dpr - height;

    // Neon gradient: cyan to violet to gold by frequency
    const freqIdx = (i / barCount) * (sampleRate / 2);
    const t = freqIdx / (sampleRate / 2);
    const hue = 190 + t * 80; // 190 (cyan) → 270 (violet)
    const sat = dB > -20 ? 90 : 50;
    const light = dB > -20 ? 55 : 35;

    spectrumCtx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
    spectrumCtx.fillRect(x, y, Math.max(1, barWidth - 1), height);
  }

  // Frequency labels — cyan
  spectrumCtx.fillStyle = 'rgba(0,240,255,0.55)';
  spectrumCtx.font = `${9 * dpr}px "IBM Plex Mono", monospace`;
  spectrumCtx.textAlign = 'center';
  const labels = [100, 1000, 10000];
  for (const freq of labels) {
    const x = (freq / (sampleRate / 2)) * cssW * dpr;
    if (x > 0 && x < w) {
      spectrumCtx.fillText(freq >= 1000 ? (freq/1000) + 'k' : String(freq), x, cssH * dpr - 4 * dpr);
    }
  }
}

/* ---------- History graph ---------- */

function drawHistory() {
  if (!historyCtx || !historyCanvas) return;
  const rect = historyCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);

  if (historyCanvas.width !== w || historyCanvas.height !== h) {
    historyCanvas.width = w;
    historyCanvas.height = h;
  }

  historyCtx.clearRect(0, 0, w, h);

  historyCtx.fillStyle = '#060912';
  historyCtx.fillRect(0, 0, w, h);

  if (historyCount < 2) return;

  const cssW = rect.width;
  const cssH = rect.height;
  const visible = Math.min(historyCount, HISTORY_LEN);
  const stepX = (cssW * dpr) / visible;

  // Draw line — cyan with glow
  historyCtx.strokeStyle = '#00f0ff';
  historyCtx.lineWidth = 1.6;
  historyCtx.shadowColor = 'rgba(0,240,255,0.30)';
  historyCtx.shadowBlur = 6;
  historyCtx.beginPath();

  const minDB = 0;
  const maxDB = 120;

  for (let i = 0; i < visible; i++) {
    const histIdx = (historyIdx - visible + i + HISTORY_LEN) % HISTORY_LEN;
    const val = historyBuffer[histIdx];
    const x = i * stepX;
    const y = cssH * dpr - ((val - minDB) / (maxDB - minDB)) * cssH * dpr;
    if (i === 0) historyCtx.moveTo(x, y);
    else historyCtx.lineTo(x, y);
  }
  historyCtx.stroke();
  historyCtx.shadowBlur = 0;

  // Fill under curve — subtle cyan
  historyCtx.lineTo((visible - 1) * stepX, cssH * dpr);
  historyCtx.lineTo(0, cssH * dpr);
  historyCtx.closePath();
  historyCtx.fillStyle = 'rgba(0,240,255,0.06)';
  historyCtx.fill();

  // Current value label — gold
  historyCtx.fillStyle = '#ffd700';
  historyCtx.font = `${10 * dpr}px "IBM Plex Mono", monospace`;
  historyCtx.textAlign = 'right';
  historyCtx.fillText(currentDB.toFixed(1) + ' dB', cssW * dpr - 4 * dpr, 12 * dpr);
}

/* ---------- Controls ---------- */

function wireControls() {
  const toggleBtn = document.getElementById('sound-toggle-btn');
  toggleBtn.addEventListener('click', async () => {
    if (isRunning) {
      stopAudio();
    } else {
      // Need user gesture for iOS
      await startAudio();
    }
    updateStatus();
  });

  // Peak reset
  document.getElementById('sound-peak-reset').addEventListener('click', () => {
    peakHold = -Infinity;
    document.getElementById('sound-db-peak').textContent = '—';
  });

  // Unit toggle — dB SPL / dB(A) / dB(C)
  const unitBtns = document.querySelectorAll('.unit-toggle-btn');
  unitBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      unitBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeUnit = btn.dataset.dbUnit || 'spl';
      updateDisplay();
    });
  });

  // Calibration
  document.getElementById('sound-cal-apply').addEventListener('click', () => {
    const input = document.getElementById('sound-cal-offset');
    if (input) {
      calibrationOffset = parseFloat(input.value) || 0;
      setStatus(`Calibration offset set to ${calibrationOffset} dB`, 'ok');
    }
  });
}

/* ---------- Status ---------- */

function setStatus(msg, type) {
  const el = document.getElementById('sound-status');
  if (el) {
    el.textContent = msg;
    el.className = 'sound-status' + (type ? ' ' + type : '');
    if (type === 'ok') el.style.color = 'var(--green)';
    else if (type === 'error') el.style.color = 'var(--red)';
    else el.style.color = 'var(--ink-dim)';
  }
}

function updateStatus() {
  setStatus(isRunning ? 'Meter running — speak or make noise to see readings' : 'Tap "Start Meter" to begin', isRunning ? 'ok' : '');
}

/* ---------- Resize ---------- */

function onResize(appState, bus, utils, perm) {
  // Canvases resize on next frame
}

export default {
  init,
  destroy,
  activate,
  onResize,
};
