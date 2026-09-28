/* ============================================================
   instruments/altimeter.js — ALTIMETER / BAROMETER
   GPS + pressure altitude, history, vertical speed, CSV export
   ============================================================ */

let altState = null;
let isRunning = false;

// Sensors
let pressureSensor = null;
let gpsWatchId = null;

// Data
let lastGPSAlt = null;
let lastBaroAlt = null;
let lastPressure = null;
let lastTemperature = null;
let lastAccuracy = null;
let lastTimestamp = null;

// Smoothing
let gpsSmoother = null;
let baroSmoother = null;
let presSmoother = null;

// Pressure → altitude conversion
function pressureToAltitude(pressure_hPa, seaLevelPressure_hPa) {
  // hypsometric equation: h = 44330 * (1 - (P/P0)^(1/5.255))
  if (!pressure_hPa || !seaLevelPressure_hPa || seaLevelPressure_hPa <= 0) return null;
  return 44330 * (1 - Math.pow(pressure_hPa / seaLevelPressure_hPa, 1 / 5.255));
}

// Sea-level pressure estimation (using GPS altitude as reference)
function estimateSLP(gpsAlt_m, pressure_hPa) {
  if (gpsAlt_m === null || pressure_hPa === null || gpsAlt_m < -500 || gpsAlt_m > 10000) return null;
  // P0 = P * (1 + h/44330)^5.255
  return pressure_hPa / Math.pow(1 - gpsAlt_m / 44330, 5.255);
}

// History buffers
const HISTORY_DURATION = 10 * 60 * 1000; // 10 minutes
let altHistory = []; // [{ time, gpsAlt, baroAlt, pressure, slp }]
let pressureHistory = [];

// Vertical speed (m/s) — smoothed
let prevAlt = null;
let prevTime = null;
let vspeed = 0;
let vspeedSmoother = null;

// Trend
let trend = 'steady'; // 'rising' | 'falling' | 'steady'
let trendHistory = [];

// Altitude log for CSV export
let sessionLog = [];

// Display elements
let altitudeEl = null;
let altitudeSourceEl = null;
let gpsAltEl = null;
let gpsAccuracyEl = null;
let gpsUnitEl = null;
let baroAltEl = null;
let baroUnitEl = null;
let deltaEl = null;
let pressureEl = null;
let pressureUnitEl = null;
let slpEl = null;
let trendEl = null;
let trendArrowEl = null;
let vspeedEl = null;
let vspeedUnitEl = null;
let tempEl = null;
let tempUnitEl = null;
let altHistoryCanvas = null;
let altHistoryCtx = null;
let pressureHistoryCanvas = null;
let pressureHistoryCtx = null;

/* ---------- Initialize ---------- */

function init(appState, bus, utils, perm) {
  altState = { appState, bus, utils, perm };
  gpsSmoother = utils.createSmoother(0.2);
  baroSmoother = utils.createSmoother(0.15);
  presSmoother = utils.createSmoother(0.1);
  vspeedSmoother = utils.createSmoother(0.1);

  altitudeEl = document.getElementById('alt-altitude');
  altitudeSourceEl = document.getElementById('alt-altitude-source');
  gpsAltEl = document.getElementById('alt-gps-alt');
  gpsAccuracyEl = document.getElementById('alt-gps-accuracy');
  gpsUnitEl = document.getElementById('alt-gps-unit');
  baroAltEl = document.getElementById('alt-baro-alt');
  baroUnitEl = document.getElementById('alt-baro-unit');
  deltaEl = document.getElementById('alt-delta');
  pressureEl = document.getElementById('alt-pressure');
  pressureUnitEl = document.getElementById('alt-pressure-unit');
  slpEl = document.getElementById('alt-slp');
  trendEl = document.getElementById('alt-trend');
  trendArrowEl = document.getElementById('alt-trend-arrow');
  vspeedEl = document.getElementById('alt-vspeed');
  vspeedUnitEl = document.getElementById('alt-vspeed-unit');
  tempEl = document.getElementById('alt-temperature');
  tempUnitEl = document.getElementById('alt-temp-unit');
  altHistoryCanvas = document.getElementById('alt-history-canvas');
  pressureHistoryCanvas = document.getElementById('alt-pressure-history-canvas');

  // Guard: critical canvas elements
  if (!altHistoryCanvas || !pressureHistoryCanvas) {
    setStatus('Altimeter canvas elements not found', 'error');
    return;
  }
  altHistoryCtx = altHistoryCanvas.getContext('2d');
  pressureHistoryCtx = pressureHistoryCanvas.getContext('2d');
  if (!altHistoryCtx || !pressureHistoryCtx) {
    setStatus('Altimeter canvas contexts unavailable', 'error');
    return;
  }

  // React to unit system changes
  bus.on('unitschange', () => updateReadouts());

  wireControls();
  startSensors();
  updateStatus();
}

function destroy() {
  stopSensors();
  isRunning = false;
}

function activate(appState, bus, utils, perm) {
  altState = { appState, bus, utils, perm };
}

/* ---------- Sensor management ---------- */

function startSensors() {
  // Barometer / pressure sensor
  if (typeof PressureSensor !== 'undefined') {
    try {
      pressureSensor = new PressureSensor({ frequency: 10 });
      pressureSensor.onreading = () => {
        const p = pressureSensor.pressure;
        if (p > 0 && p < 1100) {
          lastPressure = p;
          lastTimestamp = performance.now();
          updateFromPressure();
        }
      };
      pressureSensor.onerror = (err) => {
        console.warn('[altimeter] PressureSensor error:', err);
      };
      pressureSensor.start();
    } catch (err) {
      console.warn('[altimeter] PressureSensor init failed:', err.message);
    }
  }

  // Temperature from DeviceMotion (sometimes available) or just leave null
  // We'll approximate from pressure if needed

  // GPS
  if (navigator.geolocation) {
    gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const alt = pos.coords.altitude;
        const accuracy = pos.coords.accuracy;
        const altAcc = pos.coords.altitudeAccuracy;

        if (alt !== null && !isNaN(alt)) {
          lastGPSAlt = alt;
          lastAccuracy = accuracy;
          updateFromGPS();
        }
      },
      (err) => {
        if (err.code === 1) {
          setStatus('GPS permission denied — altimeter limited to barometer only', 'error');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      }
    );
  }

  isRunning = true;
  lastFrameTime = performance.now();
  frameCount = 0;
  fpsTimer = lastFrameTime;
  renderLoop();
}

let lastFrameTime = 0, frameCount = 0, fpsTimer = 0;
let animFrameId = null;

function stopSensors() {
  isRunning = false;
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  if (pressureSensor) {
    try { pressureSensor.stop(); } catch (_) {}
    pressureSensor = null;
  }
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

/* ---------- Update functions ---------- */

function updateFromGPS() {
  // Smooth GPS altitude
  const smoothed = gpsSmoother(lastGPSAlt);
  gpsAltEl.textContent = smoothed.toFixed(1);

  const units = altState?.appState?.units || 'metric';
  if (units === 'imperial') {
    gpsUnitEl.textContent = 'ft';
    gpsAltEl.textContent = (smoothed / 0.3048).toFixed(1);
  } else {
    gpsUnitEl.textContent = 'm';
  }

  if (lastAccuracy !== null) {
    const accUnit = units === 'imperial' ? 'ft' : 'm';
    const accVal = units === 'imperial' ? lastAccuracy * 3.28084 : lastAccuracy;
    gpsAccuracyEl.textContent = accVal.toFixed(0);
  } else {
    gpsAccuracyEl.textContent = '—';
  }

  // Compute sea level pressure from GPS altitude if we have pressure
  if (lastPressure !== null && smoothed > -100) {
    const slp = estimateSLP(smoothed, lastPressure);
    if (slp !== null) {
      lastSLP = slp;
    }
  }

  // Vertical speed
  const now = performance.now();
  if (prevAlt !== null && now - prevTime > 500) {
    const dt = (now - prevTime) / 1000;
    const dv = (smoothed - prevAlt) / dt;
    vspeed = vspeedSmoother(dv);
    prevAlt = smoothed;
    prevTime = now;

    if (vspeedEl) {
      vspeedEl.textContent = vspeed.toFixed(2);
      if (units === 'imperial') {
        vspeedUnitEl.textContent = 'ft/min';
        vspeedEl.textContent = (vspeed / 0.3048 * 60).toFixed(1);
      } else {
        vspeedUnitEl.textContent = 'm/s';
      }
    }
  }

  // Update altitude (use GPS as primary, baro as secondary)
  if (lastBaroAlt !== null) {
    const baroSmoothed = baroSmoother(lastBaroAlt);
    const delta = smoothed - baroSmoothed;
    deltaEl.textContent = delta.toFixed(1);
    if (units === 'imperial') {
      deltaEl.textContent = (delta / 0.3048).toFixed(1);
    }
  }

  // Main altitude readout uses GPS
  if (altitudeEl) {
    const displayAlt = units === 'imperial' ? smoothed / 0.3048 : smoothed;
    altitudeEl.textContent = displayAlt.toFixed(1);
    altitudeSourceEl.textContent = 'GPS';
  }

  // Log for CSV
  const logEntry = {
    time: new Date().toISOString(),
    gpsAlt_m: smoothed,
    baroAlt_m: lastBaroAlt !== null ? baroSmoother(lastBaroAlt) : null,
    pressure_hPa: lastPressure,
    slp_hPa: lastSLP,
    temperature_C: lastTemperature,
    vspeed_ms: vspeed,
  };
  sessionLog.push(logEntry);
  altHistory.push({
    time: now,
    gpsAlt: smoothed,
    baroAlt: lastBaroAlt !== null ? baroSmoother(lastBaroAlt) : null,
    pressure: lastPressure,
    slp: lastSLP,
  });

  // Prune history
  const cutoff = now - HISTORY_DURATION;
  while (altHistory.length > 0 && altHistory[0].time < cutoff) altHistory.shift();
  while (pressureHistory.length > 0 && pressureHistory[0].time < cutoff) pressureHistory.shift();
}

let lastSLP = null;

function updateFromPressure() {
  lastPressure = pressureSensor ? pressureSensor.pressure : null;
  if (lastPressure === null || lastPressure <= 0) return;

  const smoothed = presSmoother(lastPressure);

  // Display pressure
  if (pressureEl) {
    pressureEl.textContent = smoothed.toFixed(1);
    const units = altState?.appState?.units || 'metric';
    if (units === 'imperial') {
      pressureUnitEl.textContent = 'inHg';
      pressureEl.textContent = (smoothed * 0.02953).toFixed(2);
    } else {
      pressureUnitEl.textContent = 'hPa';
    }
  }

  // Barometric altitude
  if (lastSLP !== null) {
    const baroAlt = pressureToAltitude(smoothed, lastSLP);
    if (baroAlt !== null) {
      lastBaroAlt = baroAlt;
      const smBaro = baroSmoother(baroAlt);
      baroAltEl.textContent = smBaro.toFixed(1);
      const units = altState?.appState?.units || 'metric';
      if (units === 'imperial') {
        baroUnitEl.textContent = 'ft';
        baroAltEl.textContent = (smBaro / 0.3048).toFixed(1);
      } else {
        baroUnitEl.textContent = 'm';
      }
    }
  } else {
    baroAltEl.textContent = '—';
  }

  // SLP display
  if (lastSLP !== null) {
    slpEl.textContent = lastSLP.toFixed(1);
    const units = altState?.appState?.units || 'metric';
    if (units === 'imperial') {
      slpEl.textContent = (lastSLP * 0.02953).toFixed(2);
    }
  }

  // Temperature — approximated from pressure lapse rate (≈ -0.0065°C/m)
  if (lastGPSAlt !== null && lastPressure !== null && lastSLP !== null) {
    // Standard atmosphere: T = T0 - L * h, where T0 = 288.15 K, L = 0.0065 K/m
    // We can estimate altitude from pressure, get temp from that
    const h = pressureToAltitude(smoothed, lastSLP);
    if (h !== null) {
      const approxTemp = 15 - 0.0065 * h; // °C at sea level 15°C
      lastTemperature = approxTemp;
      if (tempEl) {
        tempEl.textContent = approxTemp.toFixed(1);
        const units = altState?.appState?.units || 'metric';
        if (units === 'imperial') {
          tempUnitEl.textContent = '°F';
          tempEl.textContent = (approxTemp * 9/5 + 32).toFixed(1);
        } else {
          tempUnitEl.textContent = '°C';
        }
      }
    }
  }

  // Pressure trend
  pressureHistory.push({ time: performance.now(), pressure: smoothed });
  const cutoff = performance.now() - 5 * 60 * 1000;
  while (pressureHistory.length > 0 && pressureHistory[0].time < cutoff) pressureHistory.shift();

  if (pressureHistory.length >= 2) {
    const recent = pressureHistory.slice(-5);
    const avgChange = (recent[recent.length - 1].pressure - recent[0].pressure) / (recent.length - 1);
    if (avgChange > 0.05) {
      trend = 'rising';
    } else if (avgChange < -0.05) {
      trend = 'falling';
    } else {
      trend = 'steady';
    }

    if (trendEl) {
      const labels = { rising: 'Rising', falling: 'Falling', steady: 'Steady' };
      trendEl.textContent = labels[trend] || 'Steady';
    }
    if (trendArrowEl) {
      trendArrowEl.className = 'trend-arrow ' + trend;
      const arrows = { rising: '▲', falling: '▼', steady: '—' };
      trendArrowEl.textContent = arrows[trend] || '—';
    }
  }

  // Update from GPS side too (if GPS alt changed due to this pressure update)
  if (lastGPSAlt !== null) {
    updateFromGPS();
  }
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
    frameCount = 0;
    fpsTimer = now;
  }

  drawAltHistory();
  drawPressureHistory();
}

/* ---------- Altitude history drawing ---------- */

function drawAltHistory() {
  if (!altHistoryCtx || !altHistoryCanvas) return;
  const rect = altHistoryCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);

  if (altHistoryCanvas.width !== w || altHistoryCanvas.height !== h) {
    altHistoryCanvas.width = w;
    altHistoryCanvas.height = h;
  }

  altHistoryCtx.clearRect(0, 0, w, h);
  altHistoryCtx.fillStyle = '#060912';
  altHistoryCtx.fillRect(0, 0, w, h);

  if (altHistory.length < 2) {
    altHistoryCtx.fillStyle = 'rgba(0,240,255,0.40)';
    altHistoryCtx.font = `${11 * dpr}px "IBM Plex Sans", sans-serif`;
    altHistoryCtx.textAlign = 'center';
    altHistoryCtx.fillText('Waiting for GPS data…', w / 2, h / 2);
    return;
  }

  const cssW = rect.width;
  const cssH = rect.height;
  const now = performance.now();
  const cutoff = now - HISTORY_DURATION;

  // GPS altitude line — gold neon
  const gpsPoints = altHistory.filter(p => p.gpsAlt !== null);
  if (gpsPoints.length < 2) return;

  const minAlt = Math.min(...gpsPoints.map(p => p.gpsAlt)) - 10;
  const maxAlt = Math.max(...gpsPoints.map(p => p.gpsAlt)) + 10;
  const range = maxAlt - minAlt || 1;

  const step = (cssW * dpr) / gpsPoints.length;

  altHistoryCtx.strokeStyle = '#ffd700';
  altHistoryCtx.lineWidth = 1.6;
  altHistoryCtx.shadowColor = 'rgba(255,215,0,0.30)';
  altHistoryCtx.shadowBlur = 6;
  altHistoryCtx.beginPath();

  for (let i = 0; i < gpsPoints.length; i++) {
    const p = gpsPoints[i];
    const x = i * step;
    const y = cssH * dpr - ((p.gpsAlt - minAlt) / range) * cssH * dpr;
    if (i === 0) altHistoryCtx.moveTo(x, y);
    else altHistoryCtx.lineTo(x, y);
  }
  altHistoryCtx.stroke();
  altHistoryCtx.shadowBlur = 0;

  // Fill under GPS line
  const lastIdx = gpsPoints.length - 1;
  altHistoryCtx.lineTo((lastIdx) * step, cssH * dpr);
  altHistoryCtx.lineTo(0, cssH * dpr);
  altHistoryCtx.closePath();
  altHistoryCtx.fillStyle = 'rgba(255,215,0,0.06)';
  altHistoryCtx.fill();

  // Current altitude label — gold
  const last = gpsPoints[gpsPoints.length - 1];
  const units = altState?.appState?.units || 'metric';
  const displayAlt = units === 'imperial' ? last.gpsAlt / 0.3048 : last.gpsAlt;

  altHistoryCtx.fillStyle = '#ffd700';
  altHistoryCtx.font = `${10 * dpr}px "IBM Plex Mono", monospace`;
  altHistoryCtx.textAlign = 'right';
  altHistoryCtx.fillText(displayAlt.toFixed(1) + ' ' + (units === 'imperial' ? 'ft' : 'm'), cssW * dpr - 4 * dpr, 12 * dpr);

  // Min/Max labels
  altHistoryCtx.fillStyle = 'rgba(0,240,255,0.55)';
  altHistoryCtx.font = `${8 * dpr}px "IBM Plex Mono", monospace`;
  altHistoryCtx.textAlign = 'left';
  altHistoryCtx.fillText(minAlt.toFixed(0) + ' ' + (units === 'imperial' ? 'ft' : 'm'), 4 * dpr, cssH * dpr - 4 * dpr);
  altHistoryCtx.textAlign = 'right';
  altHistoryCtx.fillText(maxAlt.toFixed(0) + ' ' + (units === 'imperial' ? 'ft' : 'm'), cssW * dpr - 4 * dpr, 14 * dpr);
}

/* ---------- Pressure history drawing ---------- */

function drawPressureHistory() {
  if (!pressureHistoryCtx || !pressureHistoryCanvas) return;
  const rect = pressureHistoryCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);

  if (pressureHistoryCanvas.width !== w || pressureHistoryCanvas.height !== h) {
    pressureHistoryCanvas.width = w;
    pressureHistoryCanvas.height = h;
  }

  pressureHistoryCtx.clearRect(0, 0, w, h);
  pressureHistoryCtx.fillStyle = '#060912';
  pressureHistoryCtx.fillRect(0, 0, w, h);

  if (pressureHistory.length < 2) return;

  const cssW = rect.width;
  const cssH = rect.height;

  const pressures = pressureHistory.map(p => p.pressure);
  const minP = Math.min(...pressures) - 2;
  const maxP = Math.max(...pressures) + 2;
  const range = maxP - minP || 1;

  const step = (cssW * dpr) / pressureHistory.length;

  // Cyan neon line with glow
  pressureHistoryCtx.strokeStyle = '#00f0ff';
  pressureHistoryCtx.lineWidth = 1.6;
  pressureHistoryCtx.shadowColor = 'rgba(0,240,255,0.30)';
  pressureHistoryCtx.shadowBlur = 6;
  pressureHistoryCtx.beginPath();

  for (let i = 0; i < pressureHistory.length; i++) {
    const p = pressureHistory[i];
    const x = i * step;
    const y = cssH * dpr - ((p.pressure - minP) / range) * cssH * dpr;
    if (i === 0) pressureHistoryCtx.moveTo(x, y);
    else pressureHistoryCtx.lineTo(x, y);
  }
  pressureHistoryCtx.stroke();
  pressureHistoryCtx.shadowBlur = 0;

  const last = pressureHistory[pressureHistory.length - 1];
  const units = altState?.appState?.units || 'metric';

  // Label — cyan
  pressureHistoryCtx.fillStyle = '#00f0ff';
  pressureHistoryCtx.font = `${10 * dpr}px "IBM Plex Mono", monospace`;
  pressureHistoryCtx.textAlign = 'right';
  if (units === 'imperial') {
    pressureHistoryCtx.fillText((last.pressure * 0.02953).toFixed(2) + ' inHg', cssW * dpr - 4 * dpr, 12 * dpr);
  } else {
    pressureHistoryCtx.fillText(last.pressure.toFixed(1) + ' hPa', cssW * dpr - 4 * dpr, 12 * dpr);
  }
}

/* ---------- Controls ---------- */

function wireControls() {
  // Export CSV
  document.getElementById('alt-export-btn').addEventListener('click', exportCSV);

  // Reset
  document.getElementById('alt-reset-btn').addEventListener('click', () => {
    altHistory = [];
    pressureHistory = [];
    sessionLog = [];
    lastGPSAlt = null;
    lastBaroAlt = null;
    lastPressure = null;
    lastSLP = null;
    prevAlt = null;
    prevTime = null;
    vspeed = 0;
    setStatus('Logs reset', 'ok');
    updateStatus();
  });
}

function exportCSV() {
  if (sessionLog.length === 0) {
    setStatus('No session data to export — use the altimeter for a while first', 'warn');
    return;
  }

  const units = altState?.appState?.units || 'metric';
  const isImperial = units === 'imperial';
  const altUnit = isImperial ? 'ft' : 'm';
  const speedUnit = isImperial ? 'ft/min' : 'm/s';
  const tempUnit = isImperial ? '°F' : '°C';
  const pressUnit = isImperial ? 'inHg' : 'hPa';

  const header = [
    'Time (ISO 8601)',
    `GPS Altitude (${altUnit})`,
    `Barometric Altitude (${altUnit})`,
    `Pressure (${pressUnit})`,
    `Sea-Level Pressure (${pressUnit})`,
    `Temperature (${tempUnit})`,
    `Vertical Speed (${speedUnit})`,
  ];

  const rows = sessionLog.map(row => {
    const gpsAlt = isImperial ? (row.gpsAlt_m / 0.3048).toFixed(2) : row.gpsAlt_m.toFixed(2);
    const baroAlt = row.baroAlt_m !== null
      ? (isImperial ? (row.baroAlt_m / 0.3048).toFixed(2) : row.baroAlt_m.toFixed(2))
      : '';
    const pressure = isImperial ? (row.pressure_hPa * 0.02953).toFixed(3) : row.pressure_hPa.toFixed(2);
    const slp = row.slp_hPa !== null
      ? (isImperial ? (row.slp_hPa * 0.02953).toFixed(3) : row.slp_hPa.toFixed(2))
      : '';
    const temp = row.temperature_C !== null
      ? (isImperial ? (row.temperature_C * 9/5 + 32).toFixed(1) : row.temperature_C.toFixed(1))
      : '';
    const vspeed = isImperial ? (row.vspeed_ms * 196.85).toFixed(1) : row.vspeed_ms.toFixed(2);
    return [row.time, gpsAlt, baroAlt, pressure, slp, temp, vspeed].join(',');
  });

  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'field-instruments-altimeter-' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  setStatus(`Exported ${sessionLog.length} rows to CSV`, 'ok');
}

/* ---------- Status ---------- */

function setStatus(msg, type) {
  const el = document.getElementById('altimeter-status');
  if (el) {
    el.textContent = msg;
    el.className = 'altimeter-status' + (type ? ' ' + type : '');
    if (type === 'ok') el.style.color = 'var(--green)';
    else if (type === 'error') el.style.color = 'var(--red)';
    else if (type === 'warn') el.style.color = 'var(--yellow)';
    else el.style.color = 'var(--ink-dim)';
  }
}

function updateStatus() {
  const gpsOk = lastGPSAlt !== null;
  const baroOk = lastPressure !== null;

  if (gpsOk && baroOk) {
    setStatus('GPS + barometer active', 'ok');
  } else if (gpsOk) {
    setStatus('GPS altitude only — barometer not available on this device', 'warn');
  } else if (baroOk) {
    setStatus('Barometric altitude only — GPS not available', 'warn');
  } else {
    setStatus('Waiting for GPS and/or barometer…', '');
  }
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
