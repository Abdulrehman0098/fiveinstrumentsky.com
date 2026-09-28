/* ============================================================
   instruments/altimeter.js — BAROMETRIC ALTIMETER
   ============================================================ */

import { Demo } from '../demo.js';
import { clamp, safeStorage } from '../utils.js';

let state = null;
let isActive = false;
let gpsWatchId = null;
let pressureSensor = null;
let gpsAltitudeEMA = new (require ? null : class { constructor(a) { this.alpha = a; this.value = 0; this.initialized = false; } update(v) { if (!this.initialized) { this.value = v; this.initialized = true; return v; } this.value = this.alpha * v + (1 - this.alpha) * this.value; return this.value; } get() { return this.initialized ? this.value : 0; } })(0.3);
let zeroAltitude = null;
let pressureHistory = new (class { constructor(c) { this.capacity = c; this.buf = new Array(c); this.len = 0; this.pos = 0; } push(v) { this.buf[this.pos] = v; this.pos = (this.pos + 1) % this.capacity; if (this.len < this.capacity) this.len++; } clear() { this.len = 0; this.pos = 0; } toArray() { const a = new Array(this.len); for (let i = 0; i < this.len; i++) { const idx = (this.pos - this.len + i + this.capacity) % this.capacity; a[i] = this.buf[idx]; } return a; } })(600);
let altitudeHistory = new (class { constructor(c) { this.capacity = c; this.buf = new Array(c); this.len = 0; this.pos = 0; } push(v) { this.buf[this.pos] = v; this.pos = (this.pos + 1) % this.capacity; if (this.len < this.capacity) this.len++; } clear() { this.len = 0; this.pos = 0; } toArray() { const a = new Array(this.len); for (let i = 0; i < this.len; i++) { const idx = (this.pos - this.len + i + this.capacity) % this.capacity; a[i] = this.buf[idx]; } return a; } })(600);
let weatherOptinChecked = false;
let csvData = [];

export function init() {
  state = {
    altitudeEl: null, altSourceEl: null, gpsAltEl: null, gpsUnitEl: null,
    gpsAccuracyEl: null, baroAltEl: null, baroUnitEl: null, deltaEl: null,
    pressureEl: null, pressureUnitEl: null, slpEl: null, slpInput: null,
    zeroBtn: null, weatherOptin: null,
    trendEl: null, trendArrowEl: null, vspeedEl: null, vspeedUnitEl: null,
    temperatureEl: null, tempUnitEl: null,
    historyCanvas: null, pressureHistoryCanvas: null,
    exportBtn: null, resetBtn: null, statusEl: null,
    gpsAlt: 0, gpsAccuracy: 0, baroAlt: 0,
    pressure: 1013.25, vspeed: 0,
    trend: 'collecting data', trendArrow: '—',
    temperature: null, seaLevelPressure: 1013.25,
    smoothedAlt: 0, prevAlt: 0, lastUpdateTime: 0,
    altSource: 'GPS + manual pressure'
  };
}

export function activate() {
  if (!state || isActive) return;
  isActive = true;
  state.altitudeEl = document.getElementById('alt-altitude');
  state.altSourceEl = document.getElementById('alt-altitude-source');
  state.gpsAltEl = document.getElementById('alt-gps-alt');
  state.gpsUnitEl = document.getElementById('alt-gps-unit');
  state.gpsAccuracyEl = document.getElementById('alt-gps-accuracy');
  state.baroAltEl = document.getElementById('alt-baro-alt');
  state.baroUnitEl = document.getElementById('alt-baro-unit');
  state.deltaEl = document.getElementById('alt-delta');
  state.pressureEl = document.getElementById('alt-pressure');
  state.pressureUnitEl = document.getElementById('alt-pressure-unit');
  state.slpEl = document.getElementById('alt-slp');
  state.slpInput = document.getElementById('alt-slp-input');
  state.zeroBtn = document.getElementById('alt-zero-btn');
  state.weatherOptin = document.getElementById('alt-weather-optin');
  state.trendEl = document.getElementById('alt-trend');
  state.trendArrowEl = document.getElementById('alt-trend-arrow');
  state.vspeedEl = document.getElementById('alt-vspeed');
  state.vspeedUnitEl = document.getElementById('alt-vspeed-unit');
  state.temperatureEl = document.getElementById('alt-temperature');
  state.tempUnitEl = document.getElementById('alt-temp-unit');
  state.historyCanvas = document.getElementById('alt-history-canvas');
  state.pressureHistoryCanvas = document.getElementById('alt-pressure-history-canvas');
  state.exportBtn = document.getElementById('alt-export-btn');
  state.resetBtn = document.getElementById('alt-reset-btn');
  state.statusEl = document.getElementById('alt-status');

  const slpInput = document.getElementById('alt-slp-input');
  if (slpInput) state.seaLevelPressure = parseFloat(slpInput.value) || 1013.25;

  if (state.weatherOptin) {
    weatherOptinChecked = state.weatherOptin.checked;
    state.weatherOptin.addEventListener('change', () => { weatherOptinChecked = state.weatherOptin.checked; if (weatherOptinChecked) fetchSeaLevelPressure(); });
  }

  const chip = document.querySelector('#panel-altimeter .mode-chip');
  const badge = document.querySelector('#panel-altimeter .sim-badge');
  state.statusEl.textContent = 'Initializing…';

  if (location.protocol === 'file:') {
    state.statusEl.textContent = 'file:// — open via START.bat to use sensors';
    if (chip) chip.dataset.mode = 'unsupported';
    return;
  }

  const hasBarometer = 'Barometer' in window;
  if (hasBarometer) {
    try {
      pressureSensor = new Barometer({ frequency: 1 });
      pressureSensor.addEventListener('reading', onPressureReading);
      pressureSensor.addEventListener('error', onSensorError);
      pressureSensor.start();
      if (chip) chip.dataset.mode = 'live';
      state.altSource = 'Barometer';
      state.statusEl.textContent = 'Barometer active — rare device / WebView';
    } catch (e) {
      state.statusEl.textContent = 'Barometer unavailable — using GPS + manual pressure';
      if (chip) chip.dataset.mode = 'unsupported';
      badge?.classList.remove('hidden');
      Demo.setEnabled(true);
    }
  } else {
    state.altSource = 'GPS + manual pressure';
    state.statusEl.textContent = 'No barometer API — GPS altitude + manual sea-level pressure';
    checkGPSAndStart(chip, badge);
  }

  state.zeroBtn?.addEventListener('click', setZeroAltitude);
  state.exportBtn?.addEventListener('click', exportCSV);
  state.resetBtn?.addEventListener('click', resetLog);
  state.slpInput?.addEventListener('input', updateSeaLevelPressure);

  updateReadouts();
  drawAltitudeHistory();
  drawPressureHistory();
  Loop.register('altimeter', drawFrame, 30);
}

export function deactivate() {
  if (!isActive) return;
  isActive = false;
  stopGPS();
  if (pressureSensor) { try { if (typeof pressureSensor.stop === 'function') pressureSensor.stop(); } catch (_) {} pressureSensor = null; }
  Loop.unregister('altimeter');
  const chip = document.querySelector('#panel-altimeter .mode-chip');
  if (chip) chip.dataset.mode = 'idle';
  const badge = document.querySelector('#panel-altimeter .sim-badge');
  if (badge) badge.classList.add('hidden');
  updateReadouts();
}

function checkGPSAndStart(chip, badge) {
  if (!navigator.geolocation) {
    state.statusEl.textContent = 'No geolocation — Demo mode';
    if (chip) chip.dataset.mode = 'unsupported';
    badge?.classList.remove('hidden');
    Demo.setEnabled(true);
    isActive = false;
    return;
  }
  const perm = window.Permissions || { geolocation: () => Promise.resolve('unsupported') };
  perm.geolocation().then(status => {
    if (status === 'denied') {
      state.statusEl.textContent = 'GPS permission denied — use Demo';
      if (chip) chip.dataset.mode = 'denied';
      badge?.classList.remove('hidden');
      Demo.setEnabled(true);
      isActive = false;
    } else {
      startGPS();
      if (!gpsWatchId) {
        state.statusEl.textContent = 'GPS unavailable — Demo mode';
        if (chip) chip.dataset.mode = 'unsupported';
        Demo.setEnabled(true);
      }
    }
  }).catch(() => { startGPS(); });
}

function startGPS() {
  if (!navigator.geolocation) return;
  if (gpsWatchId) return;
  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const alt = pos.coords.altitude;
      const accuracy = pos.coords.altitudeAccuracy;
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      state.gpsAlt = isFinite(alt) ? alt : 0;
      state.gpsAccuracy = accuracy || 0;
      state.smoothedAlt = gpsAltitudeEMA.update(state.gpsAlt);
      const now = performance.now();
      const dt = Math.min(now - state.lastUpdateTime, 5000) / 1000;
      if (dt > 0.5) {
        const rawVspeed = (state.smoothedAlt - state.prevAlt) / dt;
        state.vspeed = Math.abs(rawVspeed) > 2 ? rawVspeed : 0;
        state.prevAlt = state.smoothedAlt;
        state.lastUpdateTime = now;
      }
      state.baroAlt = barometricAltitude(state.seaLevelPressure, state.seaLevelPressure);
      state.delta = state.gpsAlt - state.baroAlt;
      if (lat != null && lon != null) {
        csvData.push({ ts: new Date().toISOString(), lat, lon, gpsAltM: state.gpsAlt, baroAltM: state.baroAlt, pressureHpa: state.seaLevelPressure });
        if (csvData.length > 1000) csvData.shift();
      }
      altitudeHistory.push(state.gpsAlt);
      updateReadouts();
      drawAltitudeHistory();
      drawPressureHistory();
      const chip = document.querySelector('#panel-altimeter .mode-chip');
      if (chip) chip.dataset.mode = 'live';
      if (state.statusEl) state.statusEl.textContent = 'GPS active — ' + (state.gpsAccuracy > 0 ? state.gpsAccuracy.toFixed(0) + 'm accuracy' : 'altitude only');
    },
    (err) => {
      console.warn('GPS error:', err.message);
      if (err.code === 1) {
        if (state.statusEl) state.statusEl.textContent = 'GPS permission denied — use Demo mode';
        const chip = document.querySelector('#panel-altimeter .mode-chip');
        if (chip) chip.dataset.mode = 'denied';
        const badge = document.querySelector('#panel-altimeter .sim-badge');
        if (badge) badge.classList.remove('hidden');
        Demo.setEnabled(true);
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  ).then(id => { gpsWatchId = id; }).catch(() => {});
}

function stopGPS() {
  if (gpsWatchId) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
}

function onPressureReading(e) {
  if (!isActive) return;
  const p = e.reading.pressure !== null ? e.reading.pressure : 0;
  state.pressure = p;
  const P0 = seaLevelFromStation(p, state.gpsAlt);
  state.seaLevelPressure = P0;
  if (state.slpInput) state.slpInput.value = P0.toFixed(1);
  state.baroAlt = barometricAltitude(p, P0);
  state.delta = state.gpsAlt - state.baroAlt;
  pressureHistory.push(p);
  if (state.pressureHistory.len >= 180) computeTrend();
  state.altSource = 'Barometer';
  updateReadouts();
  drawPressureHistory();
  const chip = document.querySelector('#panel-altimeter .mode-chip');
  if (chip) chip.dataset.mode = 'live';
  if (state.statusEl) state.statusEl.textContent = 'Barometer active — pressure ' + p.toFixed(1) + ' hPa';
}

function onSensorError(e) { console.warn('Barometer error:', e); }

async function fetchSeaLevelPressure() {
  if (!state.gpsAlt && state.gpsAlt === 0) {
    if (state.statusEl) state.statusEl.textContent = 'GPS needed for weather fetch';
    return;
  }
  const lat = state.gpsAlt ? 35.0 : 35.0; // use GPS lat if available
  const lon = 139.0;
  try {
    const resp = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&pressure_msl=true&forecast_days=1');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const msl = data?.daily?.pressure_msl?.[0];
    if (isFinite(msl)) {
      state.seaLevelPressure = msl;
      if (state.slpInput) state.slpInput.value = msl.toFixed(1);
      if (state.statusEl) { state.statusEl.textContent = 'Sea-level pressure updated: ' + msl.toFixed(1) + ' hPa from Open-Meteo'; state.statusEl.classList.add('ok'); setTimeout(() => state.statusEl.classList.remove('ok'), 3000); }
    }
  } catch (e) {
    if (state.statusEl) { state.statusEl.textContent = 'Weather fetch failed — using manual pressure'; state.statusEl.classList.add('info'); setTimeout(() => state.statusEl.classList.remove('info'), 3000); }
  }
}

function seaLevelFromStation(stationP, altitudeM) {
  if (!isFinite(stationP) || !isFinite(altitudeM) || stationP <= 0) return 1013.25;
  const P0 = stationP / Math.pow(1 - altitudeM / 44330.77, 1 / 0.190263);
  return clamp(P0, 800, 1050);
}

function barometricAltitude(stationP, seaLevelP) {
  if (!isFinite(stationP) || !isFinite(seaLevelP) || stationP <= 0 || seaLevelP <= 0) return 0;
  return 44330.77 * (1 - Math.pow(stationP / seaLevelP, 0.190263));
}

function computeTrend() {
  if (state.pressureHistory.len < 180) return;
  const first = state.pressureHistory.toArray()[0];
  const last = state.pressureHistory.toArray()[state.pressureHistory.len - 1];
  if (!isFinite(first) || !isFinite(last)) return;
  const diff = last - first;
  const hours = (state.pressureHistory.len - 1) / 60;
  const rate = diff / hours;
  if (hours < 0.5) { state.trend = 'collecting data'; state.trendArrow = '—'; }
  else if (rate > 3) { state.trend = 'Rising fast'; state.trendArrow = 'up'; }
  else if (rate > 0.3) { state.trend = 'Rising slowly'; state.trendArrow = 'up'; }
  else if (rate < -3) { state.trend = 'Falling fast'; state.trendArrow = 'down'; }
  else if (rate < -0.3) { state.trend = 'Falling slowly'; state.trendArrow = 'down'; }
  else { state.trend = 'Steady'; state.trendArrow = 'steady'; }
}

function setZeroAltitude() {
  zeroAltitude = state.gpsAlt;
  if (state.statusEl) { state.statusEl.textContent = 'Relative altitude zero set at ' + state.gpsAlt.toFixed(0) + ' m'; state.statusEl.classList.add('ok'); setTimeout(() => state.statusEl.classList.remove('ok'), 3000); }
}

function exportCSV() {
  if (csvData.length === 0) { if (state.statusEl) state.statusEl.textContent = 'No data to export yet'; return; }
  const header = 'timestamp,lat,lon,gps_alt_m,baro_alt_m,pressure_hpa\n';
  const rows = csvData.map(d => d.ts + ',' + (isFinite(d.lat) ? d.lat.toFixed(6) : '') + ',' + (isFinite(d.lon) ? d.lon.toFixed(6) : '') + ',' + (isFinite(d.gpsAltM) ? d.gpsAltM.toFixed(3) : '') + ',' + (isFinite(d.baroAltM) ? d.baroAltM.toFixed(3) : '') + ',' + (isFinite(d.pressureHpa) ? d.pressureHpa.toFixed(2) : '') + '\n').join('');
  const csv = header + rows;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'altimeter-export-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  if (state.statusEl) { state.statusEl.textContent = 'CSV exported — ' + csvData.length + ' rows'; state.statusEl.classList.add('ok'); setTimeout(() => state.statusEl.classList.remove('ok'), 3000); }
}

function resetLog() {
  csvData = [];
  pressureHistory.clear();
  altitudeHistory.clear();
  if (state.statusEl) { state.statusEl.textContent = 'Log cleared'; state.statusEl.classList.add('info'); setTimeout(() => state.statusEl.classList.remove('info'), 2000); }
}

function updateSeaLevelPressure() {
  const val = parseFloat(state.slpInput.value);
  if (isFinite(val) && val > 0) {
    state.seaLevelPressure = val;
    state.baroAlt = barometricAltitude(state.pressure, val);
    state.delta = state.gpsAlt - state.baroAlt;
    updateReadouts();
    drawPressureHistory();
  }
}

function updateReadouts() {
  if (state.altitudeEl) {
    const shownAlt = state.gpsAlt || state.baroAlt || (Demo.isEnabled() ? (Demo.generateAltimeterSample ? Demo.generateAltimeterSample().altitude : 0) : 0);
    state.altitudeEl.textContent = formatAlt(shownAlt);
  }
  if (state.altSourceEl) state.altSourceEl.textContent = state.altSource;
  if (state.gpsAltEl) state.gpsAltEl.textContent = isFinite(state.gpsAlt) ? state.gpsAlt.toFixed(3) + ' m' : '—';
  if (state.gpsUnitEl) state.gpsUnitEl.textContent = 'm';
  if (state.gpsAccuracyEl) state.gpsAccuracyEl.textContent = isFinite(state.gpsAccuracy) ? state.gpsAccuracy.toFixed(0) + ' m' : '—';
  if (state.baroAltEl) {
    const val = state.baroAlt || (Demo.isEnabled() ? (Demo.generateAltimeterSample ? Demo.generateAltimeterSample().altitude : 0) : 0);
    state.baroAltEl.textContent = isFinite(val) ? val.toFixed(0) + ' m' : '—';
  }
  if (state.baroUnitEl) state.baroUnitEl.textContent = 'm';
  if (state.deltaEl) state.deltaEl.textContent = isFinite(state.delta) ? state.delta.toFixed(2) + ' m' : '—';
  if (state.pressureEl) state.pressureEl.textContent = isFinite(state.seaLevelPressure) ? state.seaLevelPressure.toFixed(1) : '—';
  if (state.pressureUnitEl) state.pressureUnitEl.textContent = 'hPa';
  if (state.slpEl) state.slpEl.textContent = state.seaLevelPressure.toFixed(1) + ' hPa';
  if (state.trendEl) state.trendEl.textContent = state.trend;
  if (state.trendArrowEl) {
    state.trendArrowEl.textContent = state.trendArrow;
    state.trendArrowEl.className = 'trend-arrow ' + (state.trendArrow || '');
  }
  if (state.vspeedEl) state.vspeedEl.textContent = isFinite(state.vspeed) ? (state.vspeed > 0 ? '+' : '') + state.vspeed.toFixed(1) + ' m/s' : '—';
  if (state.vspeedUnitEl) state.vspeedUnitEl.textContent = 'm/s';
  if (state.temperatureEl) state.temperatureEl.textContent = '—';
  if (state.tempUnitEl) state.tempUnitEl.textContent = '°C';
  const badge = document.querySelector('#panel-altimeter .sim-badge');
  if (badge && Demo.isEnabled()) badge.classList.remove('hidden');
  else if (badge) badge.classList.add('hidden');
}

function formatAlt(m) {
  if (!isFinite(m)) return '—';
  return m.toFixed(0) + ' m';
}

function drawFrame() {
  if (!isActive) { drawAltitudeHistory(); drawPressureHistory(); return; }
  drawAltitudeHistory();
  drawPressureHistory();
  updateReadouts();
}

function drawAltitudeHistory() {
  const canvas = state.historyCanvas;
  if (!canvas) return;
  const info = fitCanvas(canvas);
  if (!info) return;
  const { ctx, w, h } = info;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, w, h);
  const vals = altitudeHistory.toArray();
  if (vals.length < 2) {
    ctx.fillStyle = 'rgba(136,146,184,0.3)'; ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.fillText('Collecting altitude data…', w / 2, h / 2);
    return;
  }
  const minAlt = Math.min(...vals);
  const maxAlt = Math.max(...vals);
  const range = Math.max(1, maxAlt - minAlt);
  ctx.beginPath();
  ctx.moveTo(0, h);
  const stepX = w / vals.length;
  for (let i = 0; i < vals.length; i++) {
    const x = i * stepX;
    const norm = (vals[i] - minAlt) / range;
    const y = h - norm * (h - 4) - 2;
    ctx.lineTo(x, y);
  }
  ctx.lineTo((vals.length - 1) * stepX, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,215,0,0.12)'; ctx.fill();
  ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1.5;
  ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 6;
  ctx.beginPath();
  for (let i = 0; i < vals.length; i++) {
    const x = i * stepX;
    const norm = (vals[i] - minAlt) / range;
    const y = h - norm * (h - 4) - 2;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(136,146,184,0.5)'; ctx.font = '7px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(maxAlt.toFixed(0) + ' m', 4, 10);
  ctx.fillText(minAlt.toFixed(0) + ' m', 4, h - 4);
  ctx.textAlign = 'right';
  ctx.fillText('Now', w - 4, 10);
  ctx.fillText('10 min ago', w - 4, h - 4);
}

function drawPressureHistory() {
  const canvas = state.pressureHistoryCanvas;
  if (!canvas) return;
  const info = fitCanvas(canvas);
  if (!info) return;
  const { ctx, w, h } = info;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, w, h);
  const vals = pressureHistory.toArray();
  if (vals.length < 2) {
    ctx.fillStyle = 'rgba(136,146,184,0.3)'; ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.fillText('Collecting pressure data…', w / 2, h / 2);
    return;
  }
  const minP = Math.min(...vals);
  const maxP = Math.max(...vals);
  const range = Math.max(1, maxP - minP);
  ctx.beginPath();
  ctx.moveTo(0, h);
  const stepX = w / vals.length;
  for (let i = 0; i < vals.length; i++) {
    const x = i * stepX;
    const norm = (vals[i] - minP) / range;
    const y = h - norm * (h - 4) - 2;
    ctx.lineTo(x, y);
  }
  ctx.lineTo((vals.length - 1) * stepX, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,240,255,0.10)'; ctx.fill();
  ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 1.2;
  ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 4;
  ctx.beginPath();
  for (let i = 0; i < vals.length; i++) {
    const x = i * stepX;
    const norm = (vals[i] - minP) / range;
    const y = h - norm * (h - 4) - 2;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(136,146,184,0.5)'; ctx.font = '7px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(maxP.toFixed(0) + ' hPa', 4, 10);
  ctx.fillText(minP.toFixed(0) + ' hPa', 4, h - 4);
  ctx.textAlign = 'right';
  ctx.fillText('Now', w - 4, 10);
  ctx.fillText('10 min ago', w - 4, h - 4);
}

export function updateDemoAltitude() {
  if (!Demo.isEnabled() || !state || !Demo.generateAltimeterSample) return;
  const sample = Demo.generateAltimeterSample();
  if (sample) {
    state.gpsAlt = sample.altitude;
    state.pressure = sample.pressure;
    state.vspeed = sample.vspeed;
    state.smoothedAlt = gpsAltitudeEMA.update(sample.altitude);
    state.prevAlt = state.smoothedAlt;
    state.lastUpdateTime = performance.now();
    updateReadouts();
    altitudeHistory.push(sample.altitude);
    drawAltitudeHistory();
  }
}