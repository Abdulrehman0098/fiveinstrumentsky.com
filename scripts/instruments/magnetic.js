/* ============================================================
   instruments/magnetic.js — MAGNETIC FIELD MAPPER
   Magnetometer anomaly detection with heat map trail
   ============================================================ */

let magState = null;
let isRunning = false;

// Sensor
let magSensor = null;
let magHandler = null;

// Display state
let magData = { x: 0, y: 0, z: 0, total: 0 };
let baseline = { x: 0, y: 0, z: 0, total: 0 };
let baselineSet = false;
let anomaly = 0;

// Heat map trail
const heatPoints = [];
const MAX_HEAT_POINTS = 200;
let heatCanvas = null, heatCtx = null;
let waveCanvas = null, waveCtx = null;

// Audio
let audioCtx = null;
let toneOsc = null;
let toneGain = null;
let toneEnabled = false;

// Haptic
let hapticEnabled = false;

// Threshold
let threshold = 150;

// FPS
let fpsEl = null;
let lastFrameTime = 0, frameCount = 0, fpsTimer = 0, fps = 0;
let animFrameId = null;

// Display elements
let xEl, yEl, zEl, totalEl, vsEarthEl, deviationDirEl, anomalyFillEl, anomalyValEl;

/* ---------- Initialize ---------- */

function init(appState, bus, utils, perm) {
  magState = { appState, bus, utils, perm };
  heatCanvas = document.getElementById('mag-heat-canvas');
  waveCanvas = document.getElementById('mag-wave-canvas');
  fpsEl = document.getElementById('mag-fps');
  xEl = document.getElementById('mag-x');
  yEl = document.getElementById('mag-y');
  zEl = document.getElementById('mag-z');
  totalEl = document.getElementById('mag-total');
  vsEarthEl = document.getElementById('mag-vs-earth');
  deviationDirEl = document.getElementById('mag-deviation-dir');
  anomalyFillEl = document.getElementById('mag-anomaly-fill');
  anomalyValEl = document.getElementById('mag-anomaly-val');

  // Guard: critical canvas elements
  if (!heatCanvas || !waveCanvas) {
    setStatus('Magnetic canvas elements not found', 'error');
    return;
  }
  heatCtx = heatCanvas.getContext('2d');
  waveCtx = waveCanvas.getContext('2d');
  if (!heatCtx || !waveCtx) {
    setStatus('Magnetic canvas contexts unavailable', 'error');
    return;
  }

  wireControls();
  resetBaseline();
  updateStatus();
}

function destroy() {
  stopSensor();
  stopAudio();
  isRunning = false;
}

function activate(appState, bus, utils, perm) {
  magState = { appState, bus, utils, perm };
}

/* ---------- Sensor management ---------- */

async function startSensor() {
  if (isRunning) return;

  // Try new Magnetometer API first
  if (typeof Magnetometer !== 'undefined') {
    try {
      magSensor = new Magnetometer({ frequency: 60 });
      magSensor.onreading = () => {
        magData.x = magSensor.x;
        magData.y = magSensor.y;
        magData.z = magSensor.z;
        magData.total = Math.sqrt(
          magData.x ** 2 + magData.y ** 2 + magData.z ** 2
        );
        // Estimate Earth field ~ 50 µT for deviation calc
        updateAnomaly();
        if (!isRunning) {
          isRunning = true;
          document.getElementById('mag-toggle-btn').textContent = 'Stop Sensor';
          document.getElementById('mag-toggle-btn').setAttribute('aria-pressed', 'true');
          setStatus('Magnetometer active', 'ok');
          lastFrameTime = performance.now();
          frameCount = 0;
          fpsTimer = lastFrameTime;
          renderLoop();
        }
      };
      magSensor.onerror = (err) => {
        setStatus('Magnetometer error: ' + err.message, 'error');
        stopSensor();
      };
      magSensor.start();
      setStatus('Magnetometer started — move device to map', 'ok');
      return;
    } catch (err) {
      // Fall through to DeviceOrientation fallback
    }
  }

  // Fallback: DeviceOrientationEvent magnetic data
  if (typeof DeviceOrientationEvent !== 'undefined') {
    magHandler = (event) => {
      if (event.magneticField) {
        // Some browsers expose magneticField directly
        magData.x = event.magneticField.x || 0;
        magData.y = event.magneticField.y || 0;
        magData.z = event.magneticField.z || 0;
        magData.total = Math.sqrt(magData.x**2 + magData.y**2 + magData.z**2);
      } else if (event.webkitCompassHeading !== undefined && event.magneticHeading !== undefined) {
        // Less precise fallback
        magData.total = event.magneticHeading || 0;
        magData.x = 0; magData.y = 0; magData.z = 0;
      } else {
        return; // No magnetic data available
      }
      updateAnomaly();
      if (!isRunning) {
        isRunning = true;
        document.getElementById('mag-toggle-btn').textContent = 'Stop Sensor';
        document.getElementById('mag-toggle-btn').setAttribute('aria-pressed', 'true');
        setStatus('Magnetic data active (DeviceOrientation fallback)', 'ok');
        lastFrameTime = performance.now();
        frameCount = 0;
        fpsTimer = lastFrameTime;
        renderLoop();
      }
    };
    window.addEventListener('deviceorientation', magHandler);
    isRunning = true;
    document.getElementById('mag-toggle-btn').textContent = 'Stop Sensor';
    document.getElementById('mag-toggle-btn').setAttribute('aria-pressed', 'true');
    setStatus('Listening for magnetic data…', 'ok');
    lastFrameTime = performance.now();
    frameCount = 0;
    fpsTimer = lastFrameTime;
    renderLoop();
    return;
  }

  setStatus('No magnetometer or magnetic sensor available on this device', 'error');
}

function stopSensor() {
  if (magSensor) {
    try { magSensor.stop(); } catch (_) {}
    magSensor = null;
  }
  if (magHandler) {
    window.removeEventListener('deviceorientation', magHandler);
    magHandler = null;
  }
  isRunning = false;
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  document.getElementById('mag-toggle-btn').textContent = 'Start Sensor';
  document.getElementById('mag-toggle-btn').setAttribute('aria-pressed', 'false');
  setStatus('Sensor stopped', '');
}

/* ---------- Anomaly calculation ---------- */

function updateAnomaly() {
  if (!baselineSet) return;

  const diff = Math.abs(magData.total - baseline.total);
  const earthField = 50; // µT — approximate local Earth field
  anomaly = diff;

  // vs Earth field
  if (vsEarthEl) {
    const pct = ((magData.total - earthField) / earthField * 100);
    vsEarthEl.textContent = (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
    if (deviationDirEl) {
      deviationDirEl.textContent = pct > 0 ? 'above' : 'below' + ' Earth avg';
    }
  }

  // Anomaly bar
  if (anomalyFillEl && anomalyValEl) {
    const maxDisplay = 500; // µT
    const pct = clamp((anomaly / maxDisplay) * 100, 0, 100);
    anomalyFillEl.style.width = pct + '%';
    anomalyValEl.textContent = Math.round(anomaly) + ' µT';

    if (anomaly > threshold * 2) {
      anomalyFillEl.className = 'anomaly-bar-fill danger';
    } else if (anomaly > threshold) {
      anomalyFillEl.className = 'anomaly-bar-fill warning';
    } else {
      anomalyFillEl.className = 'anomaly-bar-fill';
    }
  }

  // Tone feedback
  if (toneEnabled && audioCtx && toneOsc && anomaly > threshold) {
    const freq = 200 + (anomaly / threshold) * 800;
    try {
      toneOsc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      toneGain.gain.setValueAtTime(Math.min(0.3, anomaly / threshold * 0.2), audioCtx.currentTime);
    } catch (_) {}
  } else if (toneEnabled && audioCtx) {
    try {
      toneGain.gain.setValueAtTime(0, audioCtx.currentTime);
    } catch (_) {}
  }

  // Haptic feedback
  if (hapticEnabled && anomaly > threshold && navigator.vibrate) {
    const duration = Math.min(100, Math.max(10, anomaly / threshold * 50));
    navigator.vibrate(duration);
  }

  // Record heat map point
  if (anomaly > threshold * 0.3) {
    recordHeatPoint(anomaly);
  }
}

function recordHeatPoint(strength) {
  const rect = heatCanvas.getBoundingClientRect();
  // Record at random position within canvas (movement-based would require GPS/pointercal)
  // Since we can't track actual position, record near center with strength-based radius
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const angle = Math.random() * 2 * Math.PI;
  const dist = Math.min(rect.width, rect.height) * 0.3 * (strength / threshold);
  const x = cx + Math.cos(angle) * dist;
  const y = cy + Math.sin(angle) * dist;

  heatPoints.push({ x, y, strength, time: Date.now() });
  if (heatPoints.length > MAX_HEAT_POINTS) heatPoints.shift();
}

function resetBaseline() {
  baseline.x = magData.x;
  baseline.y = magData.y;
  baseline.z = magData.z;
  baseline.total = magData.total;
  baselineSet = true;
  if (vsEarthEl) vsEarthEl.textContent = '0.0%';
  if (deviationDirEl) deviationDirEl.textContent = 'at baseline';
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
    if (fpsEl) fpsEl.textContent = fps + ' fps';
  }

  updateReadouts();
  drawWaveform();
  drawHeatMap();
}

function updateReadouts() {
  if (xEl) xEl.textContent = magData.x.toFixed(1);
  if (yEl) yEl.textContent = magData.y.toFixed(1);
  if (zEl) zEl.textContent = magData.z.toFixed(1);
  if (totalEl) totalEl.textContent = magData.total.toFixed(1);
}

/* ---------- Waveform drawing (3-axis over time) ---------- */

let magHistory = { x: [], y: [], z: [], t: [] };
const MAX_MAG_HISTORY = 200;

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

  // Add current data to history
  magHistory.x.push(magData.x);
  magHistory.y.push(magData.y);
  magHistory.z.push(magData.z);
  magHistory.t.push(performance.now());
  if (magHistory.x.length > MAX_MAG_HISTORY) {
    magHistory.x.shift();
    magHistory.y.shift();
    magHistory.z.shift();
    magHistory.t.shift();
  }

  if (magHistory.x.length < 2) return;

  const cssW = rect.width;
  const cssH = rect.height;
  const len = magHistory.x.length;
  const step = Math.max(1, Math.floor(len / cssW));
  const midY = cssH / 2 * dpr;
  const amp = cssH * 0.4 * dpr;

  // Neon axis colors: cyan (X), green (Y), red (Z)
  const colors = ['#00f0ff', '#22c55e', '#ef4444'];
  const axes = ['x', 'y', 'z'];

  for (let a = 0; a < 3; a++) {
    const data = magHistory[axes[a]];
    waveCtx.strokeStyle = colors[a];
    waveCtx.lineWidth = 1.3;
    waveCtx.shadowColor = colors[a] + '40';
    waveCtx.shadowBlur = 4;
    waveCtx.beginPath();

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

  // Baseline reference — gold dashed
  waveCtx.strokeStyle = 'rgba(255,215,0,0.35)';
  waveCtx.lineWidth = 0.8;
  waveCtx.setLineDash([3, 3]);
  waveCtx.beginPath();
  waveCtx.moveTo(0, midY - baseline.total * amp);
  waveCtx.lineTo(cssW * dpr, midY - baseline.total * amp);
  waveCtx.stroke();
  waveCtx.setLineDash([]);
}

/* ---------- Heat map drawing ---------- */

function drawHeatMap() {
  if (!heatCtx || !heatCanvas) return;
  const rect = heatCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);

  if (heatCanvas.width !== w || heatCanvas.height !== h) {
    heatCanvas.width = w;
    heatCanvas.height = h;
  }

  heatCtx.clearRect(0, 0, w, h);
  heatCtx.fillStyle = '#060912';
  heatCtx.fillRect(0, 0, w, h);

  // Grid
  heatCtx.strokeStyle = 'rgba(30,40,66,0.3)';
  heatCtx.lineWidth = 0.5;
  for (let i = 0; i < 10; i++) {
    const x = (i / 10) * w;
    heatCtx.beginPath();
    heatCtx.moveTo(x, 0);
    heatCtx.lineTo(x, h);
    heatCtx.stroke();
    const y = (i / 10) * h;
    heatCtx.beginPath();
    heatCtx.moveTo(0, y);
    heatCtx.lineTo(w, y);
    heatCtx.stroke();
  }

  if (heatPoints.length === 0) {
    heatCtx.fillStyle = 'rgba(136,146,168,0.4)';
    heatCtx.font = `${11 * dpr}px "IBM Plex Sans", sans-serif`;
    heatCtx.textAlign = 'center';
    heatCtx.fillText('Move device to record magnetic field', w / 2, h / 2);
    return;
  }

  // Draw heat points with intensity-based radius and color — neon palette
  for (const pt of heatPoints) {
    const age = (Date.now() - pt.time) / 1000;
    const alpha = Math.max(0, 1 - age / 30); // fade over 30s
    if (alpha < 0.05) continue;

    const radius = Math.max(4, Math.min(15, pt.strength / threshold * 10)) * dpr;
    const intensity = clamp(pt.strength / threshold, 0, 2);

    let color;
    if (intensity < 0.5) {
      color = `rgba(0,240,255,${alpha * 0.45})`; // cyan — weak
    } else if (intensity < 1.0) {
      color = `rgba(255,215,0,${alpha * 0.60})`; // gold — moderate
    } else {
      color = `rgba(239,68,68,${alpha * 0.75})`; // red — strong
    }

    heatCtx.fillStyle = color;
    heatCtx.shadowColor = color;
    heatCtx.shadowBlur = 6;
    heatCtx.beginPath();
    heatCtx.arc(pt.x * dpr, pt.y * dpr, radius, 0, 2 * Math.PI);
    heatCtx.fill();
    heatCtx.shadowBlur = 0;
  }

  // Draw trail lines — gold
  if (heatPoints.length > 1) {
    heatCtx.strokeStyle = 'rgba(255,215,0,0.18)';
    heatCtx.lineWidth = 0.9;
    heatCtx.beginPath();
    heatCtx.moveTo(heatPoints[0].x * dpr, heatPoints[0].y * dpr);
    for (let i = 1; i < heatPoints.length; i++) {
      heatCtx.lineTo(heatPoints[i].x * dpr, heatPoints[i].y * dpr);
    }
    heatCtx.stroke();
  }
}

/* ---------- Audio tone ---------- */

function startAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    toneOsc = audioCtx.createOscillator();
    toneGain = audioCtx.createGain();
    toneOsc.type = 'sine';
    toneOsc.frequency.setValueAtTime(200, audioCtx.currentTime);
    toneGain.gain.setValueAtTime(0, audioCtx.currentTime);
    toneOsc.connect(toneGain);
    toneGain.connect(audioCtx.destination);
    toneOsc.start();
  } catch (err) {
    setStatus('Audio for tone feedback not available: ' + err.message, 'error');
  }
}

function stopAudio() {
  if (toneOsc) {
    try { toneOsc.stop(); } catch (_) {}
    toneOsc = null;
  }
  if (toneGain) {
    try { toneGain.disconnect(); } catch (_) {}
    toneGain = null;
  }
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.close().catch(() => {});
  }
  audioCtx = null;
}

/* ---------- Controls ---------- */

function wireControls() {
  const toggleBtn = document.getElementById('mag-toggle-btn');
  toggleBtn.addEventListener('click', async () => {
    if (isRunning) {
      stopSensor();
      stopAudio();
    } else {
      await startSensor();
      if (toneEnabled) startAudio();
    }
    updateStatus();
  });

  // Calibrate
  document.getElementById('mag-calibrate-btn').addEventListener('click', () => {
    resetBaseline();
    const el = document.getElementById('mag-status');
    if (el) {
      el.textContent = 'Baseline calibrated at ' + magData.total.toFixed(1) + ' µT';
      el.className = 'magnetic-status ok';
    }
  });

  // Reset trail
  document.getElementById('mag-reset-trail-btn').addEventListener('click', () => {
    heatPoints.length = 0;
  });

  // Threshold
  const thresholdSlider = document.getElementById('mag-threshold');
  const thresholdDisplay = document.getElementById('mag-threshold-display');
  if (thresholdSlider && thresholdDisplay) {
    thresholdSlider.addEventListener('input', () => {
      threshold = parseInt(thresholdSlider.value, 10);
      thresholdDisplay.textContent = threshold + ' µT';
    });
  }

  // Tone toggle
  const toneBtn = document.getElementById('mag-tone-btn');
  toneBtn.addEventListener('click', () => {
    toneEnabled = !toneEnabled;
    toneBtn.setAttribute('aria-pressed', toneEnabled ? 'true' : 'false');
    const svg = toneBtn.querySelector('svg');
    if (svg) svg.style.display = toneEnabled ? 'none' : 'block';
    // Update text node (first text child after svg)
    const textNode = toneBtn.childNodes.find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (textNode) textNode.textContent = '  ' + (toneEnabled ? 'Tone: On' : 'Tone: Off');
    if (toneEnabled) {
      startAudio();
      setStatus('Tone feedback on', 'info');
    } else {
      if (audioCtx) {
        try { toneGain.gain.setValueAtTime(0, audioCtx.currentTime); } catch (_) {}
      }
      setStatus('Tone feedback off', 'info');
    }
  });

  // Haptic toggle
  const hapticBtn = document.getElementById('mag-haptic-btn');
  hapticBtn.addEventListener('click', () => {
    hapticEnabled = !hapticEnabled;
    hapticBtn.setAttribute('aria-pressed', hapticEnabled ? 'true' : 'false');
    const svg = hapticBtn.querySelector('svg');
    if (svg) svg.style.display = hapticEnabled ? 'none' : 'block';
    const textNode = hapticBtn.childNodes.find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (textNode) textNode.textContent = '  ' + (hapticEnabled ? 'Haptic: On' : 'Haptic: Off');
    if (hapticEnabled) {
      setStatus('Haptic feedback on', 'info');
    } else {
      setStatus('Haptic feedback off', 'info');
    }
  });
}

/* ---------- Status ---------- */

function setStatus(msg, type) {
  const el = document.getElementById('mag-status');
  if (el) {
    el.textContent = msg;
    el.className = 'magnetic-status' + (type ? ' ' + type : '');
    if (type === 'ok') el.style.color = 'var(--green)';
    else if (type === 'error') el.style.color = 'var(--red)';
    else if (type === 'info') el.style.color = 'var(--cyan)';
    else el.style.color = 'var(--ink-dim)';
  }
}

function updateStatus() {
  setStatus(isRunning ? 'Magnetometer active — move device around to build heat map' : 'Tap "Start Sensor" to begin', isRunning ? 'ok' : '');
}

/* ---------- Resize ---------- */

function onResize(appState, bus, utils, perm) {}

export default {
  init,
  destroy,
  activate,
  onResize,
};
