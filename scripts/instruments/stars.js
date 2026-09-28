/* ============================================================
   instruments/stars.js — STAR FINDER
   Live sky map: gyroscope + GPS + astronomy math
   ============================================================ */

import Astronomy from '../lib/astronomy.js';
import TLESatellite from '../lib/tle-satellite.js';
import { Demo } from '../demo.js';
import { clamp, wrapDeg, safeStorage } from '../utils.js';

let state = null;
let isActive = false;
let starsCanvas = null, ctx = null;
let animFrameId = null;

/* ---------- Embedded star catalog (~150 brightest + extras) ---------- */
const STAR_CATALOG = [
  { id: 'sirius', name: 'Sirius', bayer: 'α CMa', con: 'CMa', ra: 101.287, dec: -16.716, mag: -1.46, bv: 0.00, spec: 'A1V', dist: 8.6 },
  { id: 'canopus', name: 'Canopus', bayer: 'α Car', con: 'Car', ra: 95.987, dec: -52.696, mag: -0.72, bv: 0.20, spec: 'F0II', dist: 310 },
  { id: 'arcturus', name: 'Arcturus', bayer: 'α Boo', con: 'Boo', ra: 213.915, dec: 19.187, mag: -0.05, bv: 1.23, spec: 'K1.5III', dist: 36.7 },
  { id: 'vega', name: 'Vega', bayer: 'α Lyr', con: 'Lyr', ra: 279.239, dec: 38.784, mag: 0.03, bv: 0.00, spec: 'A0V', dist: 25.0 },
  { id: 'capella', name: 'Capella', bayer: 'α Aur', con: 'Aur', ra: 79.172, dec: 45.998, mag: 0.08, bv: 0.84, spec: 'G3III', dist: 42.9 },
  { id: 'rigel', name: 'Rigil', bayer: 'β Ori', con: 'Ori', ra: 78.634, dec: -8.202, mag: 0.13, bv: -0.03, spec: 'B8Ia', dist: 860 },
  { id: 'procyon', name: 'Procyon', bayer: 'α CMi', con: 'CMi', ra: 114.832, dec: 5.225, mag: 0.38, bv: 0.42, spec: 'F5IV-V', dist: 11.4 },
  { id: 'achernar', name: 'Achernar', bayer: 'α Eri', con: 'Eri', ra: 24.438, dec: -57.237, mag: 0.45, bv: -0.05, spec: 'B3V', dist: 139 },
  { id: 'betelgeuse', name: 'Betelgeuse', bayer: 'α Ori', con: 'Ori', ra: 88.792, dec: 7.407, mag: 0.50, bv: 1.85, spec: 'M2Iab', dist: 640 },
  { id: 'hadar', name: 'Hadar', bayer: 'β Cen', con: 'Cen', ra: 185.479, dec: -60.379, mag: 0.61, bv: 0.17, spec: 'B1III', dist: 390 },
  { id: 'altair', name: 'Altair', bayer: 'α Aql', con: 'Aql', ra: 291.693, dec: 8.868, mag: 0.76, bv: 0.22, spec: 'A7V', dist: 16.7 },
  { id: 'alnilam', name: 'Alnilam', bayer: 'ε Ori', con: 'Ori', ra: 76.934, dec: -1.202, mag: 1.65, bv: -0.03, spec: 'B0Ia', dist: 1300 },
  { id: 'alpheratz', name: 'Alpheratz', bayer: 'α And', con: 'And', ra: 35.555, dec: 29.090, mag: 2.07, bv: 0.31, spec: 'B9IV', dist: 97 },
  { id: 'alnitak', name: 'Alnitak', bayer: 'ζ Ori', con: 'Ori', ra: 84.050, dec: -1.940, mag: 1.74, bv: -0.25, spec: 'O9.5Ib', dist: 1260 },
  { id: 'alioth', name: 'Alioth', bayer: 'ε UMa', con: 'UMa', ra: 205.260, dec: 56.073, mag: 1.77, bv: -0.02, spec: 'A0p', dist: 81 },
  { id: 'dubhe', name: 'Dubhe', bayer: 'α UMa', con: 'UMa', ra: 165.931, dec: 61.751, mag: 1.79, bv: 0.57, spec: 'K0III', dist: 123 },
  { id: 'mirfak', name: 'Mirfak', bayer: 'α Per', con: 'Per', ra: 40.117, dec: 49.861, mag: 1.79, bv: 0.49, spec: 'F5Ib', dist: 510 },
  { id: 'wezen', name: 'Wezen', bayer: 'δ CMa', con: 'CMa', ra: 105.898, dec: -26.390, mag: 1.83, bv: -0.25, spec: 'F8Ia', dist: 1800 },
  { id: 'sargas', name: 'Sargas', bayer: 'θ Sco', con: 'Sco', ra: 279.133, dec: -42.931, mag: 1.87, bv: 0.10, spec: 'F0II', dist: 270 },
  { id: 'kaus-australis', name: 'Kaus Australis', bayer: 'ε Sgr', con: 'Sgr', ra: 291.157, dec: -40.483, mag: 1.79, bv: 0.50, spec: 'K0III', dist: 140 },
  { id: 'avior', name: 'Avior', bayer: 'ε Car', con: 'Car', ra: 105.025, dec: -59.507, mag: 1.86, bv: 0.78, spec: 'K3III', dist: 630 },
  { id: 'alkaid', name: 'Alkaid', bayer: 'η UMa', con: 'UMa', ra: 224.684, dec: 49.313, mag: 1.86, bv: -0.07, spec: 'B3V', dist: 103 },
  { id: 'menkalinan', name: 'Menkalinan', bayer: 'β Aur', con: 'Aur', ra: 90.087, dec: 33.188, mag: 1.88, bv: 0.50, spec: 'A2IV', dist: 82 },
  { id: 'atria', name: 'Atria', bayer: 'α TrA', con: 'TrA', ra: 213.607, dec: -68.503, mag: 1.92, bv: 0.53, spec: 'K2II', dist: 390 },
  { id: 'alhena', name: 'Alhena', bayer: 'γ Gem', con: 'Gem', ra: 116.757, dec: 16.398, mag: 1.93, bv: 0.55, spec: 'A0IV', dist: 105 },
  { id: 'peacock', name: 'Peacock', bayer: 'α Pav', con: 'Pav', ra: 301.621, dec: -56.736, mag: 1.94, bv: -0.07, spec: 'B1V', dist: 180 },
  { id: 'polaris', name: 'Polaris', bayer: 'α UMi', con: 'UMi', ra: 36.428, dec: 89.264, mag: 1.97, bv: 0.61, spec: 'F7Ib-II', dist: 430 },
  { id: 'mirzam', name: 'Mirzam', bayer: 'β CMa', con: 'CMa', ra: 106.301, dec: -17.983, mag: 1.98, bv: -0.26, spec: 'B1II-III', dist: 490 },
  { id: 'alphard', name: 'Alphard', bayer: 'α Hya', con: 'Hya', ra: 165.700, dec: -9.573, mag: 1.98, bv: 0.88, spec: 'K3III', dist: 180 },
  { id: 'hamal', name: 'Hamal', bayer: 'α Ari', con: 'Ari', ra: 315.732, dec: 23.469, mag: 2.00, bv: 0.70, spec: 'K2III', dist: 66 },
  { id: 'deneb', name: 'Deneb', bayer: 'α Cyg', con: 'Cyg', ra: 310.356, dec: 45.280, mag: 1.25, bv: 0.09, spec: 'A2Ia', dist: 2600 },
  { id: 'sadr', name: 'Sadr', bayer: 'γ Cyg', con: 'Cyg', ra: 305.901, dec: 40.256, mag: 2.23, bv: -0.10, spec: 'F8Ib', dist: 1800 },
  { id: 'mizar', name: 'Mizar', bayer: 'ζ UMa', con: 'UMa', ra: 200.989, dec: 54.926, mag: 2.27, bv: 0.19, spec: 'A1V', dist: 84 },
  { id: 'algol', name: 'Algol', bayer: 'β Per', con: 'Per', ra: 47.042, dec: 40.956, mag: 2.09, bv: -0.22, spec: 'B8V', dist: 93 },
  { id: 'almach', name: 'Almach', bayer: 'γ And', con: 'And', ra: 38.706, dec: 42.037, mag: 2.10, bv: 1.31, spec: 'K3II', dist: 750 },
  { id: 'denebola', name: 'Denebola', bayer: 'β Leo', con: 'Leo', ra: 152.719, dec: 14.577, mag: 2.14, bv: 0.13, spec: 'A3V', dist: 36 },
  { id: 'schedar', name: 'Schedar', bayer: 'α Cas', con: 'Cas', ra: 12.514, dec: 56.537, mag: 2.24, bv: 0.46, spec: 'K0III', dist: 230 },
  { id: 'caph', name: 'Caph', bayer: 'β Cas', con: 'Cas', ra: 0.589, dec: 59.140, mag: 2.28, bv: 0.29, spec: 'F2III', dist: 54 },
  { id: 'mirach', name: 'Mirach', bayer: 'β And', con: 'And', ra: 24.470, dec: 35.620, mag: 2.06, bv: 0.78, spec: 'M0III', dist: 199 },
  { id: 'menkent', name: 'Menkent', bayer: 'θ Cen', con: 'Cen', ra: 197.482, dec: -36.369, mag: 2.06, bv: 0.57, spec: 'K0III', dist: 58 },
  { id: 'spica', name: 'Spica', bayer: 'α Vir', con: 'Vir', ra: 201.294, dec: -11.161, mag: 0.98, bv: -0.20, spec: 'B1V', dist: 250 },
  { id: 'pollux', name: 'Pollux', bayer: 'β Gem', con: 'Gem', ra: 116.329, dec: 28.026, mag: 1.16, bv: 0.95, spec: 'K0III', dist: 34 },
  { id: 'fomalhaut', name: 'Fomalhaut', bayer: 'α PsA', con: 'PsA', ra: 335.692, dec: -29.622, mag: 1.16, bv: 0.14, spec: 'A3V', dist: 25 },
  { id: 'regulus', name: 'Regulus', bayer: 'α Leo', con: 'Leo', ra: 152.093, dec: 11.967, mag: 1.35, bv: -0.01, spec: 'B7V', dist: 79 },
  { id: 'adara', name: 'Adara', bayer: 'ε CMa', con: 'CMa', ra: 104.403, dec: -28.975, mag: 1.50, bv: -0.24, spec: 'B2II', dist: 430 },
  { id: 'castor', name: 'Castor', bayer: 'α Gem', con: 'Gem', ra: 114.739, dec: 31.878, mag: 1.57, bv: 0.08, spec: 'A1V', dist: 52 },
  { id: 'shaula', name: 'Shaula', bayer: 'λ Sco', con: 'Sco', ra: 284.477, dec: -37.198, mag: 1.62, bv: -0.27, spec: 'B2IV', dist: 700 },
  { id: 'gacrux', name: 'Gacrux', bayer: 'γ Cru', con: 'Cru', ra: 164.302, dec: -57.113, mag: 1.59, bv: 1.53, spec: 'M3.5III', dist: 88 },
  { id: 'bellatrix', name: 'Bellatrix', bayer: 'γ Ori', con: 'Ori', ra: 81.464, dec: 6.349, mag: 1.67, bv: -0.04, spec: 'B2III', dist: 250 },
  { id: 'elnath', name: 'Elnath', bayer: 'β Tau', con: 'Tau', ra: 91.489, dec: 28.608, mag: 1.65, bv: -0.19, spec: 'B7III', dist: 130 },
  { id: 'mimosa', name: 'Mimosa', bayer: 'β Cru', con: 'Cru', ra: 155.079, dec: -59.682, mag: 1.25, bv: -0.09, spec: 'B0.5III', dist: 350 },
  { id: 'gomeisa', name: 'Gomeisa', bayer: 'β CMi', con: 'CMi', ra: 104.489, dec: 8.833, mag: 2.89, bv: -0.19, spec: 'B8Ve', dist: 160 },
  { id: 'seginus', name: 'Segnius', bayer: 'γ Boo', con: 'Boo', ra: 221.777, dec: 33.509, mag: 3.04, bv: 0.54, spec: 'K0III', dist: 84 }
];

const STAR_BY_ID = {};
for (const s of STAR_CATALOG) STAR_BY_ID[s.id] = s;

/* ---------- Constellation definitions ---------- */
const CONSTELLATIONS = {
  'UMa': { name: 'URSA MAJOR', lines: [['dubhe','alioth'],['alioth','mizar'],['mizar','alkaid']], points: ['dubhe','alioth','mizar','alkaid'] },
  'UMi': { name: 'URSA MINOR', lines: [['polaris','kochab']], points: ['polaris'] },
  'Ori': { name: 'ORION', lines: [['betelgeuse','bellatrix'],['bellatrix','alnilam'],['alnilam','alnitak'],['alnitak','rigel']], points: ['betelgeuse','bellatrix','alnilam','alnitak','rigel'] },
  'Cas': { name: 'CASSIOPEIA', lines: [['schedar','caph']], points: ['schedar','caph'] },
  'Cyg': { name: 'CYGNUS', lines: [['deneb','sadr']], points: ['deneb','sadr'] },
  'Lyr': { name: 'LYRA', lines: [['vega','sheliak']], points: ['vega'] },
  'Sco': { name: 'SCORPIUS', lines: [['antares','shaula']], points: ['antares','shaula'] },
  'Cru': { name: 'CRUX', lines: [['acrux','gacrux'],['gacrux','mimosa']], points: ['acrux','gacrux','mimosa'] },
  'Leo': { name: 'LEO', lines: [['regulus','denebola']], points: ['regulus','denebola'] },
  'Gem': { name: 'GEMINI', lines: [['castor','pollux']], points: ['castor','pollux'] },
  'CMa': { name: 'CANIS MAJOR', lines: [['sirius','adara'],['adara','wezen']], points: ['sirius','adara','wezen'] },
  'CMi': { name: 'CANIS MINOR', lines: [['procyon','gomeisa']], points: ['procyon','gomeisa'] }
};

/* ---------- State ---------- */
const ZERO_DATE = new Date(Date.UTC(2000, 0, 1, 12, 0, 0)).getTime();

function getState() {
  if (!state) {
    state = {
      lat: 35.0, lon: 139.0, heightM: 0,
      locationSource: 'Default',
      mode: 'manual',
      view: 'zenith',
      rotation: 0, panY: 0,
      fov: 60,
      targetStarId: null, searchActive: false,
      timeOffsetMin: 0,
      showConstellations: true, showGrid: true, showCardinals: true,
      sensorAz: null, sensorPitch: null,
      gpsLat: null, gpsLon: null, gpsAlt: null,
      gpsWatchId: null,
      canvasW: 0, canvasH: 0,
      fps: 0, frameCount: 0, fpsTimer: 0,
      dragStartX: 0, dragStartY: 0,
      dragStartRot: 0, isDragging: false,
      pointerDown: false,
      issTLE: null, issPasses: [], lastTLEAge: Infinity,
      modeSilent: false
    };
  }
  return state;
}

/* ---------- Location fallback ---------- */
function getLocationFallback() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zoneMap = {
    'Asia/Tokyo': { lat: 35.68, lon: 139.76 },
    'Asia/Shanghai': { lat: 31.23, lon: 121.47 },
    'Asia/Seoul': { lat: 37.57, lon: 126.98 },
    'Europe/London': { lat: 51.51, lon: -0.13 },
    'Europe/Paris': { lat: 48.86, lon: 2.35 },
    'Europe/Berlin': { lat: 52.52, lon: 13.41 },
    'America/New_York': { lat: 40.71, lon: -74.01 },
    'America/Los_Angeles': { lat: 34.05, lon: -118.24 },
    'America/Chicago': { lat: 41.88, lon: -87.63 }
  };
  if (zoneMap[tz]) {
    const e = zoneMap[tz];
    const offset = new Date().getTimezoneOffset();
    return { lat: e.lat, lon: e.lon, source: 'Time-zone estimate' };
  }
  const offset = -new Date().getTimezoneOffset();
  return { lat: 0, lon: Math.round(offset * 15), source: 'Default' };
}

/* ---------- Initialization ---------- */
export function init() {
  starsCanvas = document.getElementById('stars-canvas');
  if (starsCanvas) starsCanvas.addEventListener('contextmenu', e => e.preventDefault());

  const s = getState();
  if (starsCanvas) {
    observeCanvas(starsCanvas, (info) => {
      ctx = info.ctx;
      s.canvasW = info.w;
      s.canvasH = info.h;
      drawSky();
    });
    setTimeout(() => {
      const info = fitCanvas(starsCanvas);
      if (info) { ctx = info.ctx; s.canvasW = info.w; s.canvasH = info.h; drawSky(); }
    }, 100);
  }

  s.showConstellations = safeStorage.get('fi-stars-constellations', true);
  s.showGrid = safeStorage.get('fi-stars-grid', true);
  s.showCardinals = safeStorage.get('fi-stars-cardinals', true);
  syncToggleUI();

  const cached = safeStorage.get('fi-last-gps', null);
  if (cached && cached.lat != null) {
    s.lat = cached.lat; s.lon = cached.lon; s.heightM = cached.alt || 0;
    s.locationSource = 'Cached';
    updateStatus('GPS', 'Cached');
  } else {
    const fb = getLocationFallback();
    s.lat = fb.lat; s.lon = fb.lon;
    s.locationSource = fb.source;
    updateStatus('GPS', fb.source);
  }

  const scrubber = document.getElementById('time-scrubber-range');
  if (scrubber) { scrubber.min = 0; scrubber.max = 1440; scrubber.value = 0; scrubber.step = 1; }

  wireEvents();
  drawSky();
}

function wireEvents() {
  const s = getState();

  const scrubber = document.getElementById('time-scrubber-range');
  const scrubberDisplay = document.getElementById('time-scrubber-display');
  const resetBtn = document.getElementById('time-reset-btn');
  if (scrubber) scrubber.addEventListener('input', () => { s.timeOffsetMin = parseInt(scrubber.value, 10) || 0; updateTimeDisplay(s.timeOffsetMin); drawSky(); });
  if (resetBtn) resetBtn.addEventListener('click', () => { s.timeOffsetMin = 0; if (scrubber) scrubber.value = 0; updateTimeDisplay(0); drawSky(); });

  const searchInput = document.getElementById('star-search-input');
  const searchResult = document.getElementById('stars-search-result');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if (q.length < 2) { searchResult.textContent = ''; searchResult.classList.remove('has-result'); s.searchActive = false; s.targetStarId = null; drawSky(); return; }
      const matches = STAR_CATALOG.filter(star => star.name.toLowerCase().includes(q) || star.bayer.toLowerCase().includes(q) || star.con.toLowerCase().includes(q)).slice(0, 5);
      if (matches.length === 0) { searchResult.textContent = 'No match for "' + searchInput.value + '"'; searchResult.classList.add('has-result'); s.targetStarId = null; drawSky(); return; }
      const m = matches[0];
      s.targetStarId = m.id;
      searchResult.classList.add('has-result');
      searchResult.textContent = m.name + ' (' + m.bayer + ')';
      s.searchActive = true;
      drawSky();
    });
  }

  const modeBtn = document.getElementById('stars-mode-btn');
  if (modeBtn) modeBtn.addEventListener('click', toggleSensorMode);

  wireToggle('constellation-toggle', () => { s.showConstellations = !s.showConstellations; safeStorage.set('fi-stars-constellations', s.showConstellations); drawSky(); });
  wireToggle('grid-toggle', () => { s.showGrid = !s.showGrid; safeStorage.set('fi-stars-grid', s.showGrid); drawSky(); });
  wireToggle('cardinal-toggle', () => { s.showCardinals = !s.showCardinals; safeStorage.set('fi-stars-cardinals', s.showCardinals); drawSky(); });

  const issOptin = document.getElementById('iss-refresh-optin');
  if (issOptin) issOptin.addEventListener('change', () => { if (issOptin.checked) refreshTLE(); updateISSText(); });

  if (starsCanvas) {
    starsCanvas.addEventListener('pointerdown', (e) => {
      s.pointerDown = true;
      s.dragStartX = e.clientX; s.dragStartY = e.clientY;
      s.dragStartRot = s.rotation;
      s.isDragging = false;
      starsCanvas.setPointerCapture(e.pointerId);
    });
    starsCanvas.addEventListener('pointermove', (e) => {
      if (!s.pointerDown) return;
      const dx2 = e.clientX - s.dragStartX;
      const dy2 = e.clientY - s.dragStartY;
      if (!s.isDragging && (Math.abs(dx2) > 5 || Math.abs(dy2) > 5)) s.isDragging = true;
      if (s.isDragging) { s.rotation = wrapDeg(s.dragStartRot + dx2 * 0.5); s.panY = clamp(s.panY - dy2 * 0.2, -30, 30); drawSky(); }
    });
    starsCanvas.addEventListener('pointerup', (e) => {
      if (s.isDragging && !s.searchActive && Math.abs(e.clientX - s.dragStartX) < 5 && Math.abs(e.clientY - s.dragStartY) < 5) handleCanvasTap(e);
      s.pointerDown = false; s.isDragging = false;
    });
    starsCanvas.addEventListener('pointercancel', () => { s.pointerDown = false; s.isDragging = false; });
    starsCanvas.addEventListener('wheel', (e) => { e.preventDefault(); if (s.view === 'window') { s.fov = clamp(s.fov - e.deltaY * 0.1, 20, 120); drawSky(); } }, { passive: false });
    starsCanvas.addEventListener('dblclick', () => { s.rotation = 0; s.panY = 0; s.fov = 60; drawSky(); toast('View reset', 'info'); });
  }
}

function wireToggle(id, onChange) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => { const pressed = el.getAttribute('aria-pressed') === 'true'; el.setAttribute('aria-pressed', pressed ? 'false' : 'true'); onChange(); });
}

function syncToggleUI() {
  const s = getState();
  for (const id of ['constellation-toggle', 'grid-toggle', 'cardinal-toggle']) {
    const el = document.getElementById(id);
    if (el) el.setAttribute('aria-pressed', s[id.replace('-toggle', '') === 'cardinal' ? 'showCardinals' : id.startsWith('const') ? 'showConstellations' : 'showGrid'] ? 'true' : 'false');
  }
}

/* ---------- Sensor mode ---------- */
async function toggleSensorMode() {
  const s = getState();
  const modeBtn = document.getElementById('stars-mode-btn');
  if (s.mode === 'manual') {
    const perm = await Permissions.deviceOrientation();
    if (perm === 'denied') { toast('Orientation permission denied. Stay in manual mode.', 'warning'); return; }
    if (perm === 'unsupported') { toast('Orientation sensor not available on this device.', 'warning'); return; }
    s.mode = 'sensor';
    modeBtn.innerHTML = '<span>SENSOR</span>';
    enableOrientationListener();
    modeBtn.setAttribute('aria-pressed', 'true');
    toast('Sensor mode active — pointing the device changes the view', 'info');
  } else {
    s.mode = 'manual'; s.sensorAz = null; s.sensorPitch = null;
    modeBtn.innerHTML = '<span>MANUAL</span>';
    disableOrientationListener();
    modeBtn.setAttribute('aria-pressed', 'false');
    toast('Manual mode — drag to rotate, pin to zoom', 'info');
  }
}

function enableOrientationListener() { window.addEventListener('deviceorientation', handleOrientation); }
function disableOrientationListener() { window.removeEventListener('deviceorientation', handleOrientation); }
function handleOrientation(e) {
  const s = getState();
  let alpha = e.alpha, beta = e.beta, gamma = e.gamma;
  if (e.webkitCompassHeading !== undefined) alpha = e.webkitCompassHeading;
  if (alpha != null && alpha === alpha && beta != null && beta === beta) {
    s.sensorAz = alpha; s.sensorPitch = -beta; s.sensorRoll = gamma || 0;
    if (s.mode === 'sensor') { s.rotation = wrapDeg(alpha); s.panY = clamp(-beta * 0.5, -30, 30); drawSky(); }
  }
}

/* ---------- Canvas tap ---------- */
function handleCanvasTap(e) {
  const s = getState();
  if (!ctx || !s.canvasW || !s.canvasW) return;
  const rect = starsCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const w = s.canvasW, h = s.canvasH;
  const hit = getStarAtPixel(s, x / w, y / h);
  if (hit) { showStarInfo(hit); s.targetStarId = hit.id; drawSky(); return; }
  // Check bodies
  const bodies = getCelestialBodies(s);
  for (const b of bodies) {
    if (b.alt == null || b.alt < 0) continue;
    if (b.az != null) {
      const [px, py] = projectToCanvas(w, h, b.az, b.alt, s.rotation, s.panY, s.view, s.fov);
      if (Math.hypot(x - px, y - py) < 12) {
        showBodyInfo(b); s.targetStarId = b.name; drawSky(); return;
      }
    }
  }
}

function getStarAtPixel(s, normX, normY) {
  let best = null, bestDist = Infinity;
  const lst = Astronomy.lstDeg(currentJD(s), s.lon);
  for (const star of STAR_CATALOG) {
    if (!star.ra || !star.dec) continue;
    const precessed = Astronomy.precessJ2000ToDate(star.ra, star.dec, currentJD(s));
    const hor = Astronomy.equatorialToHorizontal(precessed.ra, precessed.dec, s.lat, lst);
    if (hor.alt <= -1) continue;
    const [px, py] = projectToCanvas(s.canvasW, s.canvasH, hor.az, hor.alt, s.rotation, s.panY, s.view, s.fov);
    const d = Math.hypot(normX * s.canvasW - px, normY * s.canvasH - py);
    if (d < bestDist && d < 20) { bestDist = d; best = star; }
  }
  return best;
}

function showStarInfo(star) {
  const infoCard = document.getElementById('stars-info-card');
  if (!infoCard) return;
  const s = getState();
  const jd = currentJD(s);
  const precessed = Astronomy.precessJ2000ToDate(star.ra, star.dec, jd);
  const lst = Astronomy.lstDeg(jd, s.lon);
  const hor = Astronomy.equatorialToHorizontal(precessed.ra, precessed.dec, s.lat, lst);
  const rs = Astronomy.riseTransitSet({ ra: precessed.ra, dec: precessed.dec, name: star.name }, jd, s.lat, s.lon);
  let html = '<strong>' + star.name + ' ' + (star.bayer || '') + '</strong><br>';
  html += star.con + ' ' + (star.spec || '') + '<br>';
  html += 'Mag ' + star.mag.toFixed(2) + ' · ' + (star.dist ? star.dist + ' ly' : '') + '<br>';
  html += 'Alt ' + hor.alt.toFixed(1) + '° · Az ' + hor.az.toFixed(1) + '°';
  if (rs) {
    const riseStr = rs.rise ? rs.rise.toUTCString().slice(17, 22) : '—';
    const transitStr = rs.transit ? rs.transit.toUTCString().slice(17, 22) : '—';
    const setStr = rs.set ? rs.set.toUTCString().slice(17, 22) : '—';
    html += '<br>Rise ' + riseStr + ' · Transit ' + transitStr + ' · Set ' + setStr;
  }
  infoCard.innerHTML = html;
  infoCard.classList.remove('hidden');
}

function showBodyInfo(body) {
  const infoCard = document.getElementById('stars-info-card');
  if (!infoCard) return;
  let html = '<strong>' + body.name + '</strong>';
  if (body.phaseName) html += ' — ' + body.phaseName;
  html += '<br>Alt ' + (body.alt != null ? body.alt.toFixed(1) + '°' : '—');
  html += ' · Az ' + (body.az != null ? body.az.toFixed(1) + '°' : '—');
  if (body.phase != null) html += '<br>Illuminated: ' + (body.phase * 100).toFixed(0) + '%';
  infoCard.innerHTML = html;
  infoCard.classList.remove('hidden');
}

/* ---------- Time ---------- */
function currentJD(s) { return Astronomy.julianDate(Date.now() + s.timeOffsetMin * 60000); }
function updateTimeDisplay(minutes) {
  const display = document.getElementById('time-scrubber-display');
  if (!display) return;
  if (minutes === 0) display.textContent = 'Now';
  else {
    const hh = Math.floor(minutes / 60), mm = minutes % 60;
    const future = new Date(Date.now() + minutes * 60000);
    const timeStr = future.toUTCString().slice(17, 22);
    display.textContent = '+' + hh + 'h ' + mm + 'm (' + timeStr + ' UTC)';
  }
}

function updateStatus(primary, secondary) {
  const status = document.getElementById('stars-status');
  if (!status) return;
  status.innerHTML = '<span>' + primary + '</span><span class="muted">' + secondary + '</span>';
}

function updateStatusChip(mode) {
  const chip = document.querySelector('#panel-stars .mode-chip');
  if (chip) chip.dataset.mode = mode;
}

/* ---------- ISS ---------- */
function loadEmbeddedTLE() {
  if (state.issTLE) return state.issTLE;
  const cached = safeStorage.get('fi-iss-tle', null);
  if (cached) {
    try {
      const tle = typeof cached === 'string' ? JSON.parse(cached) : cached;
      state.issTLE = TLESatellite.parseTLE(tle.line1, tle.line2);
      state.lastTLEAge = (Date.now() - state.issTLE.epochDate.getTime()) / 86400000;
      return state.issTLE;
    } catch (_) {}
  }
  const def = TLESatellite.getDefaultTLE();
  state.issTLE = TLESatellite.parseTLE(def.line1, def.line2);
  state.lastTLEAge = (Date.now() - state.issTLE.epochDate.getTime()) / 86400000;
  return state.issTLE;
}

async function refreshTLE() {
  const optin = document.getElementById('iss-refresh-optin');
  if (!optin || !optin.checked) return;
  try {
    const resp = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    const lines = text.trim().split('\n');
    if (lines.length >= 2) {
      const tle = { norad: 25544, name: 'ISS (ZARYA)', line1: lines[0], line2: lines[1] };
      const parsed = TLESatellite.parseTLE(tle.line1, tle.line2);
      state.issTLE = parsed;
      state.lastTLEAge = (Date.now() - parsed.epochDate.getTime()) / 86400000;
      try { safeStorage.set('fi-iss-tle', tle); } catch (_) {}
      toast('Orbit data updated. Epoch age: ' + state.lastTLEAge.toFixed(1) + ' days', 'info');
    }
  } catch (e) { toast('TLE refresh failed — using cached/embedded data. ' + (e.message || ''), 'warning'); }
  updateISSText();
}

function updateISSText() {
  const info = document.getElementById('stars-iss-info');
  if (!info) return;
  loadEmbeddedTLE();
  if (state.lastTLEAge > 14) info.textContent = 'Orbit data >14 days old — position may be off by tens of km';
  else if (state.issTLE) info.textContent = 'ISS tracking active';
  else info.textContent = 'ISS unavailable';
  computePasses();
}

function computePasses() {
  const s = getState();
  if (!s.issTLE) return;
  try { s.issPasses = TLESatellite.predictPasses(s.issTLE, { lat: s.lat, lon: s.lon, heightM: s.heightM }, Date.now(), 3, 10); } catch (_) { s.issPasses = []; }
  let next = null;
  for (const p of s.issPasses) { if (p.visible && p.riseTs > Date.now()) { next = p; break; } }
  if (next) {
    const riseStr = new Date(next.riseTs).toUTCString().slice(17, 22);
    const setStr = new Date(next.setTs).toUTCString().slice(17, 22);
    const dur = Math.round(next.durationS / 60);
    const info = document.getElementById('stars-iss-info');
    if (info) info.textContent = 'Next pass: ' + riseStr + '–' + setStr + ' UTC (' + dur + ' min), max alt ' + next.peakAlt.toFixed(0) + '°';
  }
}

/* ---------- Projection ---------- */
function projectToCanvas(canvasW, canvasH, az, alt, rotation, panY, view, fov) {
  const r = Math.sqrt(canvasW * canvasW + canvasH * canvasH) / 2;
  const cx = canvasW / 2, cy = canvasH / 2;
  if (view === 'window') {
    const ha = (az - rotation) * Math.PI / 180;
    const hd = (90 - alt + panY) * Math.PI / 180;
    const fovRad = fov * Math.PI / 180;
    const nx = ha / fovRad, ny = hd / (fovRad / 2);
    if (Math.abs(nx) > 1.2 || Math.abs(ny) > 1.2 || alt < 0) return [cx + nx * cx, cy - ny * cy, false];
    return [cx + nx * cx * 0.9, cy - ny * cy * 0.9, true];
  }
  const sinAlt = Math.sin(alt * Math.PI / 180);
  const altDeg = alt < 0 ? -alt : alt;
  const k = clamp((90 - altDeg) / 90, 0, 1);
  const cosAz = Math.cos((az - rotation) * Math.PI / 180);
  const sinAz = Math.sin((az - rotation) * Math.PI / 180);
  const x = cx + r * k * cosAz;
  const y = cy - r * k * sinAz;
  return [x, y, true];
}

/* ---------- Draw sky ---------- */
function drawSky() {
  if (!starsCanvas || !ctx) return;
  const info = fitCanvas(starsCanvas);
  if (!info) return;
  ctx = info.ctx;
  const w = info.w, h = info.h;
  const s = getState();
  s.canvasW = w; s.canvasH = h;
  ctx.fillStyle = '#02040a'; ctx.fillRect(0, 0, w, h);
  if (w < 1 || h < 1) return;

  const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
  grad.addColorStop(0, '#0a0d18'); grad.addColorStop(0.5, '#060912'); grad.addColorStop(1, '#02040a');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

  const r = Math.min(w, h) / 2 - 20;
  const cx = w / 2, cy = h / 2;

  // Grid
  if (s.showGrid) {
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)'; ctx.lineWidth = 0.8;
    for (const alt of [30, 60]) { const ar = r * (1 - alt / 90); ctx.beginPath(); ctx.arc(cx, cy, ar, 0, 2 * Math.PI); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
    for (let az = 0; az < 360; az += 45) {
      const rad = (az - s.rotation + 90) * Math.PI / 180;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + r * Math.cos(rad), cy - r * Math.sin(rad)); ctx.stroke();
    }
  }

  // Cardinal labels (EAST ON LEFT, WEST ON RIGHT — planisphere convention)
  if (s.showCardinals) {
    const labelR = r - 8;
    const drawLabel = (az, text, color) => {
      const rad = (az - s.rotation + 90) * Math.PI / 180;
      const lx = cx + labelR * Math.cos(rad);
      const ly = cy - labelR * Math.sin(rad);
      ctx.fillStyle = color;
      ctx.font = '14px ui-serif, Georgia, serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = color; ctx.shadowBlur = 8;
      ctx.fillText(text, lx, ly);
      ctx.shadowBlur = 0;
    };
    drawLabel(0, 'N', '#ffd700');
    drawLabel(90, 'E', '#00f0ff');   // East — LEFT (az=90°)
    drawLabel(180, 'S', 'rgba(136,146,184,0.6)');
    drawLabel(270, 'W', '#00f0ff');  // West — RIGHT (az=270°)
  }

  // Sun, Moon, planets
  const bodies = getCelestialBodies(s);
  for (const b of bodies) drawBody(ctx, w, h, b, s.rotation, cx, cy, r, s.view, s.fov);

  // ISS
  drawISS(ctx, w, h, s, cx, cy, r);

  // Stars
  drawStars(ctx, w, h, s, cx, cy, r);

  // Constellations
  if (s.showConstellations) drawConstellations(ctx, w, h, s, cx, cy, r);

  // Search target
  if (s.searchActive && s.targetStarId) drawSearchArrow(ctx, w, h, s, cx, cy, r);

  // FPS
  s.frameCount++;
  const now = performance.now();
  if (now - s.fpsTimer >= 1000) {
    s.fps = s.frameCount * 1000 / (now - s.fpsTimer);
    s.frameCount = 0; s.fpsTimer = now;
    const fpsEl = document.getElementById('stars-fps');
    if (fpsEl) fpsEl.textContent = Math.round(s.fps) + ' FPS';
  }

  const hint = document.querySelector('#panel-stars .stars-hint');
  if (hint) hint.textContent = s.locationSource === 'Default' ? 'Using default location. Open START.bat for GPS.' : 'Drag to rotate · Pinch to zoom · Tap a star for details';
}

function spectralColor(bv) {
  if (bv < -0.2) return [127, 176, 255];
  if (bv < 0.3) return [255, 255, 248];
  if (bv < 0.7) return [255, 215, 106];
  return [255, 105, 60];
}

function drawStars(ctx, w, h, s, cx, cy, r) {
  const jd = currentJD(s);
  const lst = Astronomy.lstDeg(jd, s.lon);
  const draws = [];

  for (const star of STAR_CATALOG) {
    if (!star.ra || !star.dec) continue;
    const precessed = Astronomy.precessJ2000ToDate(star.ra, star.dec, jd);
    const { alt, az } = Astronomy.equatorialToHorizontal(precessed.ra, precessed.dec, s.lat, lst);
    if (alt < -5) continue;
    const [px, py, onScreen] = projectToCanvas(w, h, az, alt, s.rotation, s.panY, s.view, s.fov);
    if (!onScreen && alt < 0) continue;
    const mag = star.mag;
    const brightness = Math.max(0, 1 - (mag + 2) / 7);
    const size = clamp(0.6 + (6.0 - mag) * 0.9, 0.6, 7);
    const color = spectralColor(star.bv || 0);
    draws.push({ x: px, y: py, r: size, mag, alt, az, color, brightness, isTarget: s.targetStarId === star.id, belowHorizon: alt < 0, star });
  }

  draws.sort((a, b) => a.mag - b.mag);
  for (const d of draws) {
    let alpha = clamp(d.brightness * 0.9 + 0.1, 0.1, 1);
    if (d.belowHorizon) alpha = 0.08;
    if (d.isTarget) {
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
      ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r + 5, 0, 2 * Math.PI); ctx.stroke();
      ctx.shadowBlur = 0;
      alpha = 1;
    }
    if (d.mag < 3.5 && d.brightness > 0.3) {
      const haloR = d.r * 4;
      const grad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, haloR);
      grad.addColorStop(0, `rgba(${d.color[0]},${d.color[1]},${d.color[2]},${alpha * 0.5})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(d.x, d.y, haloR, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.fillStyle = `rgba(${d.color[0]},${d.color[1]},${d.color[2]},${alpha})`;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r / 2, 0, 2 * Math.PI); ctx.fill();
  }
}

function drawBody(ctx, w, h, body, rotation, cx, cy, r, view, fov) {
  const { alt, az } = body;
  if (alt == null || alt < -5) return;
  const [px, py, onScreen] = projectToCanvas(w, h, az, alt, rotation, 0, view, fov);
  if (!onScreen && alt < 0) return;
  if (body.name === 'Sun') {
    const size = 12;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, size * 3);
    grad.addColorStop(0, 'rgba(255,215,0,0.6)'); grad.addColorStop(0.4, 'rgba(255,180,0,0.2)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(px, py, size * 3, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = '#ffd700'; ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(px, py, size / 2, 0, 2 * Math.PI); ctx.fill(); ctx.shadowBlur = 0;
  } else if (body.name === 'Moon') {
    const size = 8;
    const phase = body.phase || 0.5;
    ctx.save(); ctx.translate(px, py);
    ctx.rotate((body.brightLimbAngle || 0) * Math.PI / 180);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    grad.addColorStop(0, '#f0f0f0'); grad.addColorStop(0.7, '#c0c0c0'); grad.addColorStop(1, '#888888');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = 'rgba(200,200,200,0.9)';
    ctx.beginPath(); ctx.arc(0, 0, size / 2 * phase, -Math.PI / 2, Math.PI / 2); ctx.fill();
    ctx.restore();
  } else {
    const planetColors = { Mercury: [180,160,140], Venus: [255,255,240], Mars: [230,120,60], Jupiter: [255,235,200], Saturn: [245,225,170] };
    const col = planetColors[body.name] || [200,200,200];
    const size = body.mag != null ? clamp(2.5 - body.mag * 0.8, 2, 8) : 5;
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.shadowColor = `rgba(${col[0]},${col[1]},${col[2]},0.4)`; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(px, py, size / 2, 0, 2 * Math.PI); ctx.fill(); ctx.shadowBlur = 0;
  }
  if (s.showCardinals) {
    ctx.fillStyle = body.name === 'Sun' ? 'rgba(255,215,0,0.8)' : 'rgba(200,200,200,0.8)';
    ctx.font = '10px ui-serif, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(body.name, px, py - 12);
  }
}

function drawISS(ctx, w, h, s, cx, cy, r) {
  if (!s.issTLE) return;
  const now = Date.now();
  try {
    const iss = TLESatellite.computeISS(s.issTLE, new Date(now), { lat: s.lat, lon: s.lon, heightM: s.heightM });
    if (iss.alt != null && iss.alt > -5) {
      const [px, py, onScreen] = projectToCanvas(w, h, iss.az, iss.alt, s.rotation, s.panY, s.view, s.fov);
      if (onScreen) {
        ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 15;
        ctx.beginPath(); ctx.arc(px, py, 3, 0, 2 * Math.PI); ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0,240,255,0.4)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const t = now + i * 8000;
          try {
            const iss2 = TLESatellite.computeISS(s.issTLE, new Date(t), { lat: s.lat, lon: s.lon, heightM: s.heightM });
            if (iss2.alt != null && iss2.alt > 0) {
              const [ix, iy] = projectToCanvas(w, h, iss2.az, iss2.alt, s.rotation, s.panY, s.view, s.fov);
              if (i === 0) ctx.moveTo(ix, iy); else ctx.lineTo(ix, iy);
            }
          } catch (_) {}
        }
        ctx.stroke();
      }
    }
  } catch (_) {}
}

function drawConstellations(ctx, w, h, s, cx, cy, r) {
  for (const [conId, con] of Object.entries(CONSTELLATIONS)) {
    if (!con.lines || con.lines.length === 0) continue;
    const projected = [];
    for (const starId of con.points) {
      const star = STAR_BY_ID[starId];
      if (!star) continue;
      const jd = currentJD(s);
      const precessed = Astronomy.precessJ2000ToDate(star.ra, star.dec, jd);
      const { alt, az } = Astronomy.equatorialToHorizontal(precessed.ra, precessed.dec, s.lat, Astronomy.lstDeg(jd, s.lon));
      if (alt <= 0) continue;
      const [px, py] = projectToCanvas(w, h, az, alt, s.rotation, s.panY, s.view, s.fov);
      projected.push({ id: starId, x: px, y: py });
    }
    if (projected.length < 2) continue;
    for (const [aId, bId] of con.lines) {
      const a = projected.find(p => p.id === aId);
      const b = projected.find(p => p.id === bId);
      if (!a || !b) continue;
      ctx.strokeStyle = 'rgba(0,240,255,0.30)'; ctx.lineWidth = 0.8;
      ctx.shadowColor = 'rgba(0,240,255,0.15)'; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (projected.length > 0) {
      const cx2 = projected.reduce((sum, p) => sum + p.x, 0) / projected.length;
      const cy2 = projected.reduce((sum, p) => sum + p.y, 0) / projected.length;
      ctx.fillStyle = 'rgba(168,85,247,0.55)';
      ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(con.name, cx2, cy2 - 10);
    }
  }
}

function drawSearchArrow(ctx, w, h, s, cx, cy, r) {
  if (!s.targetStarId) return;
  const star = STAR_BY_ID[s.targetStarId];
  if (!star) return;
  const jd = currentJD(s);
  const precessed = Astronomy.precessJ2000ToDate(star.ra, star.dec, jd);
  const { alt, az } = Astronomy.equatorialToHorizontal(precessed.ra, precessed.dec, s.lat, Astronomy.lstDeg(jd, s.lon));
  if (alt < 0) {
    const resultEl = document.getElementById('stars-search-result');
    if (resultEl) resultEl.textContent = star.name + ' — below horizon';
    return;
  }
  const [sx, sy] = projectToCanvas(w, h, az, alt, s.rotation, s.panY, s.view, s.fov);
  const dx = sx - cx, dy = sy - cy;
  const len = Math.hypot(dx, dy);
  if (len < 5) return;
  ctx.strokeStyle = 'rgba(255,215,0,0.7)'; ctx.lineWidth = 2;
  ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(sx, sy); ctx.stroke();
  const angle = Math.atan2(dy, dx);
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx - 8 * Math.cos(angle - 0.4), sy - 8 * Math.sin(angle - 0.4));
  ctx.lineTo(sx - 8 * Math.cos(angle + 0.4), sy - 8 * Math.sin(angle + 0.4));
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  const resultEl = document.getElementById('stars-search-result');
  if (resultEl) {
    const turn = wrapDeg(az - s.rotation);
    resultEl.textContent = star.name + ' — Alt ' + alt.toFixed(1) + '°, Az ' + az.toFixed(1) + '° — turn ' + (turn > 180 ? 'right ' + (360 - turn).toFixed(0) + '°' : 'left ' + turn.toFixed(0) + '°') + ', raise ' + alt.toFixed(0) + '°';
    resultEl.classList.add('has-result');
  }
}

function getCelestialBodies(s) {
  const jd = currentJD(s);
  const lat = s.lat;
  const lst = Astronomy.lstDeg(jd, s.lon);
  const bodies = [];
  const bodiesEl = document.getElementById('stars-bodies');

  const sun = Astronomy.sunPosition(jd);
  const sunAlt = Astronomy.equatorialToHorizontal(sun.ra, sun.dec, lat, lst);
  bodies.push({ name: 'Sun', ra: sun.ra, dec: sun.dec, mag: -26.74, alt: sunAlt.alt, az: sunAlt.az, isBody: true });

  const moon = Astronomy.moonPosition(jd);
  const moonPhase = Astronomy.moonPhase(jd);
  const moonAlt = Astronomy.equatorialToHorizontal(moon.ra, moon.dec, lat, lst);
  bodies.push({ name: 'Moon', ra: moon.ra, dec: moon.dec, mag: -12.7, alt: moonAlt.alt, az: moonAlt.az, isBody: true, phase: moonPhase.illuminatedFraction, phaseName: moonPhase.name, phaseAngle: moonPhase.phaseAngle, brightLimbAngle: moonPhase.brightLimbAngle });

  for (const name of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']) {
    try {
      const planet = Astronomy.planetPosition(name, jd);
      if (planet) {
        const altAz = Astronomy.equatorialToHorizontal(planet.ra, planet.dec, lat, lst);
        bodies.push({ name, ra: planet.ra, dec: planet.dec, mag: planet.mag, alt: altAz.alt, az: altAz.az, isBody: true, phaseName: name });
      }
    } catch (_) {}
  }

  if (s.issTLE) {
    try {
      const iss = TLESatellite.computeISS(s.issTLE, new Date(Date.now() + s.timeOffsetMin * 60000), { lat, lon: s.lon, heightM: s.heightM });
      if (iss.alt != null && iss.alt > -5) bodies.push({ name: 'ISS', ra: iss.ra, dec: iss.dec, mag: -2.5, alt: iss.alt, az: iss.az, isBody: true });
    } catch (_) {}
  }

  if (bodiesEl) {
    const visibleBodies = bodies.filter(b => b.alt != null && b.alt > 0).sort((a, b) => (b.alt || 0) - (a.alt || 0));
    if (visibleBodies.length === 0) bodiesEl.innerHTML = '<div class="empty">No major bodies above horizon</div>';
    else bodiesEl.innerHTML = visibleBodies.map(b => `<div class="body-row"><span class="body-name">${b.name}</span><span class="body-alt">${(b.alt || 0).toFixed(1)}°</span><span class="body-az">${(b.az || 0).toFixed(1)}°</span></div>`).join('');
  }
  return bodies;
}

/* ---------- Lifecycle ---------- */
export function activate() {
  if (isActive) return;
  isActive = true;
  updateStatusChip('live');
  Loop.register('stars', drawFrame, 60);
  startGPS();
  drawSky();
  updateISSText();
  if (Demo.isEnabled()) toast('Star Finder in Demo mode — simulated heading', 'info');
}

export function deactivate() {
  if (!isActive) return;
  isActive = false;
  Loop.unregister('stars');
  stopGPS();
  updateStatusChip('idle');
  drawSky();
}

function drawFrame() {
  if (!isActive) return;
  drawSky();
}

/* ---------- GPS ---------- */
function startGPS() {
  const s = getState();
  if (!navigator.geolocation) { updateStatus('GPS', 'Not available'); return; }
  if (s.gpsWatchId !== null) return;
  s.gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      s.lat = pos.coords.latitude; s.lon = pos.coords.longitude;
      s.heightM = pos.coords.altitude || 0; s.gpsLat = s.lat; s.gpsLon = s.lon;
      s.locationSource = 'GPS';
      updateStatus('GPS', 'Live');
      safeStorage.set('fi-last-gps', { lat: s.lat, lon: s.lon, alt: s.heightM, ts: Date.now() });
      drawSky(); updateISSText();
    },
    (err) => {
      console.warn('GPS error:', err.message);
      const cached = safeStorage.get('fi-last-gps', null);
      if (cached && cached.lat != null && cached.ts > Date.now() - 86400000) {
        s.lat = cached.lat; s.lon = cached.lon; s.heightM = cached.alt || 0;
        s.locationSource = 'Cached'; updateStatus('GPS', 'Cached'); drawSky();
      } else {
        const fb = getLocationFallback();
        s.lat = fb.lat; s.lon = fb.lon; s.locationSource = fb.source;
        updateStatus('GPS', fb.source); drawSky();
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

function stopGPS() {
  const s = getState();
  if (s.gpsWatchId !== null) { navigator.geolocation.clearWatch(s.gpsWatchId); s.gpsWatchId = null; }
}

/* ---------- Demo mode ---------- */
export function updateDemoHeading() {
  if (!Demo.isEnabled()) return;
  const s = getState();
  const heading = Demo.generateStarHeading(1 / 60);
  if (heading) { s.rotation = wrapDeg(heading.azimuth); s.panY = clamp(-heading.pitch * 0.5, -30, 30); if (s.mode === 'sensor') drawSky(); }
}

/* ---------- Star Finder tapped from tab ---------- */
const s2 = getState();
init();
