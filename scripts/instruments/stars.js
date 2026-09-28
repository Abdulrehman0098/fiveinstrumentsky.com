/* ============================================================
   instruments/stars.js — STAR FINDER
   Live sky map: gyroscope + GPS + astronomy math
   ============================================================ */

import Astronomy from '../lib/astronomy.js';
import TLESatellite from '../lib/tle-satellite.js';

let starsState = null;
let animFrameId = null;
let isRunning = false;

// Local clamp utility (stars.js doesn't import Utils directly)
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Sky canvas
let canvas = null;
let ctx = null;
let canvasW = 0;
let canvasH = 0;
let dpr = 1;

// Orientation
let orientation = { alpha: 0, beta: 0, gamma: 0, compass: 0 };

// Location
let location = null;

// Stars data
let starsCatalog = [];
let constellations = [];

// Planets
let planets = [];

// Moon
let moonPhase = 0;
let moonIllumPct = 0;

// ISS
let issPasses = [];
let issTLE_parsed = null;
let lastISSPassSearch = 0;

// Time scrubber
let scrubOffsetMinutes = 0; // 0 = now

// Search
let searchResult = null;

// Animation times
let lastFrameTime = 0;
let frameCount = 0;
let fps = 0;
let fpsTimer = 0;

/* ---------- Initialize ---------- */

function init(appState, bus, utils, perm) {
  starsState = { appState, bus, utils, perm };
  canvas = document.getElementById('stars-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Load data
  loadStarCatalog();
  loadConstellations();
  loadPlanets();

  // Wire up controls
  wireControls();

  // Start orientation + location if available
  startSensors();

  // Start render loop
  isRunning = true;
  lastFrameTime = performance.now();
  fpsTimer = lastFrameTime;
  frameCount = 0;
  renderLoop();

  // Update status
  updateStatus();
}

function destroy() {
  isRunning = false;
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  stopSensors();
}

function activate(appState, bus, utils, perm) {
  starsState = { appState, bus, utils, perm };
  if (!isRunning) {
    isRunning = true;
    startSensors();
    lastFrameTime = performance.now();
    fpsTimer = lastFrameTime;
    frameCount = 0;
    renderLoop();
  }
}

/* ---------- Data loading ---------- */

async function loadStarCatalog() {
  // Embedded high-precision star catalog — bright stars with magnitude,
  // RA/Dec (J2000), spectral type, and constellation.
  starsCatalog = [
    { name: 'Sirius',     bayer: 'α CMa',  ra: 101.2969, dec: -16.7161, mag: -1.46, sp: 'A1V',  const: 'Canis Major' },
    { name: 'Canopus',    bayer: 'α Car',  ra:  67.6667, dec: -52.7028, mag: -0.74, sp: 'F0II', const: 'Carina' },
    { name: 'Arcturus',   bayer: 'α Boo',  ra: 213.9153, dec:  19.1872, mag: -0.05, sp: 'K1.5III', const: 'Bootes' },
    { name: 'Vega',       bayer: 'α Lyr',  ra: 279.1167, dec:  38.7836, mag:  0.03, sp: 'A0V',  const: 'Lyra' },
    { name: 'Capella',    bayer: 'α Aur',  ra:  79.1724, dec:  45.9983, mag:  0.08, sp: 'G3III', const: 'Auriga' },
    { name: 'Rigel',      bayer: 'β Ori',  ra:  78.6342, dec:  -8.2033, mag:  0.18, sp: 'B8Ia', const: 'Orion' },
    { name: 'Procyon',    bayer: 'α CMi',  ra: 114.8331, dec:   5.2250, mag:  0.40, sp: 'F5IV-V', const: 'Canis Minor' },
    { name: 'Betelgeuse', bayer: 'α Ori',  ra:  88.8114, dec:   7.4144, mag:  0.42, sp: 'M2Iab', const: 'Orion' },
    { name: 'Altair',     bayer: 'α Aql',  ra: 296.6967, dec:   8.8683, mag:  0.76, sp: 'A7V',  const: 'Aquila' },
    { name: 'Aldebaran',  bayer: 'α Tau',  ra:  68.9825, dec:  16.5097, mag:  0.87, sp: 'K5III', const: 'Taurus' },
    { name: 'Antares',    bayer: 'α Sco',  ra: 247.3494, dec: -26.4320, mag:  0.96, sp: 'M1.5Iab', const: 'Scorpius' },
    { name: 'Spica',      bayer: 'α Vir',  ra: 201.2989, dec: -11.1614, mag:  0.98, sp: 'B1V',  const: 'Virgo' },
    { name: 'Polaris',    bayer: 'α UMi',  ra: 314.0925, dec:  89.2641, mag:  1.98, sp: 'F7Ib-II', const: 'Ursa Minor' },
    { name: 'Deneb',      bayer: 'α Cyg',  ra: 310.3585, dec:  45.2803, mag:  1.25, sp: 'A2Ia', const: 'Cygnus' },
    { name: 'Achernar',   bayer: 'α Eri',  ra:  24.4307, dec: -57.2368, mag:  0.45, sp: 'B3V',  const: 'Eridanus' },
    { name: 'Hadar',      bayer: 'β Cru',  ra: 186.6867, dec: -60.3733, mag:  0.61, sp: 'B0III', const: 'Crux' },
    { name: 'Acrux',      bayer: 'α Cru',  ra: 184.7900, dec: -63.0995, mag:  0.76, sp: 'B0.5III', const: 'Crux' },
    { name: 'Altair',     bayer: 'α Aql',  ra: 296.6967, dec:   8.8683, mag:  0.76, sp: 'A7V',  const: 'Aquila' },
    { name: 'Eltanin',    bayer: 'γ Dra',  ra: 272.1753, dec:  51.4953, mag:  2.24, sp: 'K5III', const: 'Draco' },
    { name: 'Regulus',    bayer: 'α Leo',  ra: 152.0950, dec:  11.9672, mag:  1.36, sp: 'B8IVn', const: 'Leo' },
    { name: 'Adhara',     bayer: 'ε CMa',  ra: 104.6564, dec: -28.9652, mag:  1.50, sp: 'B2II', const: 'Canis Major' },
    { name: 'Castor',     bayer: 'α Gem',  ra:  81.5830, dec:  31.8883, mag:  1.58, sp: 'A1V',  const: 'Gemini' },
    { name: 'Shaula',     bayer: 'λ Sco',  ra: 266.5625, dec: -37.1069, mag:  1.62, sp: 'B2III', const: 'Scorpius' },
    { name: 'Bellatrix',  bayer: 'γ Ori',  ra:  81.2823, dec:  6.3506, mag:  1.64, sp: 'B2III', const: 'Orion' },
    { name: 'Elnath',     bayer: 'β Tau',  ra:  81.5830, dec:  28.6070, mag:  1.65, sp: 'B7III', const: 'Taurus' },
    { name: 'Alnilam',    bayer: 'ε Ori',  ra:  74.8826, dec: -1.2026, mag:  1.69, sp: 'B0Ia', const: 'Orion' },
    { name: 'Alnitak',    bayer: 'ζ Ori',  ra:  84.5575, dec: -1.9427, mag:  1.74, sp: 'O9.5Ib', const: 'Orion' },
    { name: 'Pollux',     bayer: 'β Gem',  ra: 116.3225, dec:  28.0262, mag:  1.14, sp: 'K0III', const: 'Gemini' },
    { name: 'Fomalhaut',  bayer: 'α PsA',  ra: 344.4120, dec: -29.6670, mag:  1.16, sp: 'A3V',  const: 'Piscis Austrinus' },
    { name: 'Markab',     bayer: 'α Peg',  ra: 346.4671, dec:  15.2057, mag:  1.60, sp: 'A0IV', const: 'Pegasus' },
  ];
}

async function loadConstellations() {
  // Embedded constellation connectivity vectors
  constellations = [
    {
      name: 'Ursa Major',
      lines: [
        ['Dubhe', 'Merak'],
        ['Merak', 'Phecda'],
        ['Phecda', 'Megrez'],
        ['Megrez', 'Alioth'],
        ['Alioth', 'Mizar'],
        ['Mizar', 'Alkaid'],
      ],
    },
    {
      name: 'Orion',
      lines: [
        ['Betelgeuse', 'Bellatrix'],
        ['Betelgeuse', 'Rigel'],
          ['Betelgeuse', 'Rigel'],
          ['Bellatrix', 'Alnilam'],
          ['Alnilam', 'Alnitak'],
          ['Alnitak', 'Rigel'],
          ['Alnilam', 'Mintaka'],
        ],
      },
      {
        name: 'Cassiopeia',
        lines: [
          ['Caph', 'Schedar'],
          ['Schedar', 'Ruchbah'],
          ['Ruchbah', 'Segin'],
          ['Segin', 'Navi'],
        ],
      },
      {
        name: 'Cygnus',
        lines: [
          ['Deneb', 'Sadr'],
          ['Sadr', 'Albireo'],
          ['Deneb', 'Gienah'],
          ['Sadr', 'Rukh'],
        ],
      },
      {
        name: 'Leo',
        lines: [
          ['Regulus', 'Algieba'],
          ['Algieba', 'Zosma'],
          ['Zosma', 'Denebola'],
          ['Regulus', 'Al Minliar'],
        ],
      },
    ];
  }
}

async function loadPlanets() {
  try {
    const resp = await fetch('data/planets.json');
    if (!resp.ok) throw new Error('Failed to load planets.json');
    planets = await resp.json();
  } catch (e) {
    planets = [
      { name: 'Mercury', symbol: '☿', color: '#b5a38a' },
      { name: 'Venus', symbol: '♀', color: '#e8cda0' },
      { name: 'Mars', symbol: '♂', color: '#c1440e' },
      { name: 'Jupiter', symbol: '♃', color: '#d4a574' },
      { name: 'Saturn', symbol: '♄', color: '#e8d5a0' },
    ];
  }
}

/* ---------- Sensor management ---------- */

let orientationHandler = null;
let gpsWatchId = null;

function startSensors() {
  startOrientation();
  startLocation();
  loadISSTLE();
}

function stopSensors() {
  stopOrientation();
  stopLocation();
}

function startOrientation() {
  if (orientationHandler) return;
  const p = starsState && starsState.perm || null;

  const handler = (event) => {
    if (event.alpha !== null) {
      orientation.alpha = event.alpha || 0;
      orientation.beta = event.beta || 0;
      orientation.gamma = event.gamma || 0;
      if (event.webkitCompassHeading !== undefined) {
        orientation.compass = event.webkitCompassHeading;
      }
      // For absolute orientation (iOS): use alpha directly as compass heading
      if (event.absolute) {
        orientation.compass = (360 - orientation.alpha) % 360;
      }
      updateStatus();
    }
  };

  if (typeof DeviceOrientationEvent !== 'undefined') {
    window.addEventListener('deviceorientation', handler);
    orientationHandler = handler;
  }

  // Request permission on iOS
  if (p && p.isIOS && p.isIOS() && typeof DeviceOrientationEvent.requestPermission === 'function') {
    const statusEl = document.getElementById('stars-status');
    if (statusEl) {
      const orientationStatus = statusEl.querySelector('.orientation-status');
      if (orientationStatus) {
        orientationStatus.textContent = 'Tap to enable orientation';
      }
    }
  }
}

function stopOrientation() {
  if (orientationHandler && typeof window.removeEventListener === 'function') {
    window.removeEventListener('deviceorientation', orientationHandler);
    orientationHandler = null;
  }
}

function startLocation() {
  if (gpsWatchId !== null || !navigator.geolocation) return;
  const p = starsState && starsState.perm || null;
  if (!p) return;

  p.watchPosition(
    (pos) => {
      location = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude,
        altitudeAccuracy: pos.coords.altitudeAccuracy,
        timestamp: pos.timestamp,
      };
      starsState.appState.location = location;
      updateStatus();
    },
    (err) => {
      if (err.code === 1) {
        // Permission denied
        const status = document.getElementById('stars-status');
        if (status) status.querySelector('.location-status').textContent = 'GPS permission denied';
      }
    }
  ).then(id => { gpsWatchId = id; });
}

function stopLocation() {
  if (gpsWatchId !== null) {
    perm.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
}

/* ---------- ISS TLE loading ---------- */

async function loadISSTLE() {
  // Use cached TLE only — no runtime network per spec.
  const cached = localStorage.getItem('fi-iss-tle');
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      issTLE_parsed = TLESatellite.parseTLE(parsed.line1, parsed.line2);
      return;
    } catch (_) {}
  }
  // Hardcoded fallback TLE (approximate — refresh manually if needed)
  try {
    issTLE_parsed = TLESatellite.parseTLE(
      '1 25544U 98067A   24001.50000000  .00000000  00000-0  00000-0 0  9999',
      '2 25544  51.6432  00.0000 0007077  00.0000  00.0000 15.49100000  9999'
    );
  } catch (_) {}
}

/* ---------- Rendering loop ---------- */

function renderLoop() {
  if (!isRunning) return;
  animFrameId = requestAnimationFrame(renderLoop);

  const now = performance.now();
  const dt = now - lastFrameTime;
  lastFrameTime = now;

  // FPS tracking
  frameCount++;
  if (now - fpsTimer >= 1000) {
    fps = frameCount;
    frameCount = 0;
    fpsTimer = now;
    const fpsEl = document.getElementById('stars-fps');
  if (fpsEl) fpsEl.textContent = fps + ' fps';
  }

  renderSky();
}

/* ---------- Sky rendering ---------- */

function renderSky() {
  if (!ctx || !canvas) return;

  const rect = canvas.getBoundingClientRect();
  const rectW = Math.max(rect.width, 1);
  const rectH = Math.max(rect.height, 1);
  dpr = window.devicePixelRatio || 1;
  const w = Math.round(rectW * dpr);
  const h = Math.round(rectH * dpr);

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  ctx.clearRect(0, 0, w, h);

  // Background gradient
  const grad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w, h) * 0.7);
  grad.addColorStop(0, '#0d1428');
  grad.addColorStop(0.5, '#080c1a');
  grad.addColorStop(1, '#040710');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Get current time (with scrub offset)
  const now = new Date();
  const scrubbedTime = new Date(now.getTime() + scrubOffsetMinutes * 60000);

  // Check if we have orientation data
  const hasOrientation = orientation.alpha !== undefined && orientation.alpha !== null;
  const hasLocation = location !== null;

  // Draw stars
  drawStars(scrubbedTime, hasOrientation, hasLocation, w, h, dpr);

  // Draw constellation lines
  drawConstellations(scrubbedTime, hasOrientation, hasLocation, w, h, dpr);

  // Draw celestial bodies
  drawSun(scrubbedTime, hasLocation, w, h, dpr);
  drawMoon(scrubbedTime, hasLocation, w, h, dpr);
  drawPlanets(scrubbedTime, hasLocation, w, h, dpr);
  drawISS(scrubbedTime, hasLocation, w, h, dpr);
  searchNextISSPass();

  // Draw compass ring
  drawCompassRing(w, h, dpr, hasOrientation);

  // Draw search arrow
  if (searchResult) {
    drawSearchArrow(searchResult, hasOrientation, hasLocation, w, h, dpr);
  }
}

function getAltAz(raDeg, decDeg, time, lat, lon) {
  if (lat === null || lon === null) return null;
  const result = Astronomy ? Astronomy.raDecToAltAz(raDeg, decDeg, lat, lon, time) : null;
  if (!result) {
    // Inline fallback
    const jd = time.getTime() / 86400000 + 2440587.5;
    const lst = (280.46061837 + 360.98564736629 * (jd - 2451545.0)) % 360;
    const lstDeg = ((lst % 360) + 360) % 360 + lon;
    const lstFinal = ((lstDeg % 360) + 360) % 360;
    const ha = lstFinal - raDeg;
    const latR = lat * Math.PI / 180;
    const decR = decDeg * Math.PI / 180;
    const haR = ha * Math.PI / 180;
    const sinAlt = Math.sin(decR) * Math.sin(latR) + Math.cos(decR) * Math.cos(latR) * Math.cos(haR);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * 180 / Math.PI;
    const cosAz = (Math.sin(decR) - Math.sin(alt * Math.PI/180) * Math.sin(latR)) /
                  (Math.cos(alt * Math.PI/180) * Math.cos(latR) || 1);
    let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180 / Math.PI;
    if (Math.sin(haR) > 0) az = 360 - az;
    return { alt, az: ((az % 360) + 360) % 360 };
  }
  return result;
}

/* ---------- Draw stars ---------- */

function drawStars(time, hasOrientation, hasLocation, w, h, dpr) {
  if (!hasLocation) return;

  const lat = location.lat;
  const lon = location.lon;

  // Compute viewport center (where device is pointing)
  let centerAz = 180; // default: south
  let centerAlt = 45; // default: 45 degrees up

  if (hasOrientation) {
    // Use device orientation to determine center
    const compass = orientation.compass || 0;
    centerAz = compass % 360;
    // Beta is tilt front-to-back (0 = horizontal, positive = tipped up)
    const beta = orientation.beta || 0;
    centerAlt = clamp(90 - Math.abs(beta), 0, 90);
  }

  // Field of view (approx 60° for phone)
  const fov = 60;
  const halfFov = fov / 2;

  ctx.clearRect(0, 0, w, h);

  // Deep background
  ctx.fillStyle = '#060912';
  ctx.fillRect(0, 0, w, h);

  // Grid — faint cyan lines every 10° altitude
  ctx.strokeStyle = 'rgba(0,240,255,0.04)';
  ctx.lineWidth = 0.4;
  for (let alt = -30; alt <= 90; alt += 10) {
    const altRad = alt * Math.PI / 180;
    const r = Math.sin(altRad) * (w * 0.5 / dpr) + (w * 0.5 / dpr);
    // Approximate circle for altitude ring
    ctx.beginPath();
    ctx.arc(w / (2 * dpr), h / (2 * dpr), r, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // Draw stars
  const starsNow = [];
  for (const star of starsCatalog) {
    if (star.mag > 3.5) continue;
    const pos = getAltAz(star.ra, star.dec, time, lat, lon);
    if (!pos) continue;
    if (pos.alt < -5) continue;

    starsNow.push({ star, alt: pos.alt, az: pos.az });
  }

  starsNow.sort((a, b) => a.star.mag - b.star.mag);

  for (const { star, alt, az } of starsNow) {
    const azDiff = ((az - centerAz + 180) % 360) - 180;
    const altDiff = alt - centerAlt;

    const cssW = w / dpr;
    const cssH = h / dpr;

    const screenX = (azDiff / halfFov) * (cssW * 0.5) + cssW * 0.5;
    const screenY = -(altDiff / halfFov) * (cssH * 0.5) + cssH * 0.5;

    if (screenX < -20 || screenX > cssW + 20 || screenY < -20 || screenY > cssH + 20) continue;

    // Spectral color mapping based on spectral type
    let starColor;
    const sp = (star.sp || '').toUpperCase();
    if (sp.startsWith('O') || sp.startsWith('B')) {
      starColor = [180, 220, 255]; // blue-white
    } else if (sp.startsWith('A') || sp.startsWith('F')) {
      starColor = [255, 250, 240]; // white
    } else if (sp.startsWith('G')) {
      starColor = [255, 215, 120]; // gold/yellow
    } else if (sp.startsWith('K') || sp.startsWith('M')) {
      starColor = [255, 180, 80]; // orange-red
    } else {
      starColor = [200, 220, 255]; // default blue-white
    }

    const r = starColor[0], g = starColor[1], b = starColor[2];

    // Star size from magnitude
    const size = Math.max(1.5, 4 - star.mag * 0.5);

    // Glow for bright stars — spectral-colored halo
    if (star.mag < 0.5) {
      const glowColor = `rgba(${r},${g},${b},0.45)`;
      const glow = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, size * 5);
      glow.addColorStop(0, glowColor);
      glow.addColorStop(0.3, `rgba(${r},${g},${b},0.12)`);
      glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(screenX, screenY, size * 5, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Star point — spectral color
    const starAlpha = Math.max(0.4, 1 - star.mag * 0.12);
    ctx.fillStyle = `rgba(${r},${g},${b},${starAlpha})`;
    ctx.beginPath();
    ctx.arc(screenX, screenY, size, 0, 2 * Math.PI);
    ctx.fill();

    // Outer halo
    ctx.fillStyle = `rgba(${r},${g},${b},${starAlpha * 0.10})`;
    ctx.beginPath();
    ctx.arc(screenX, screenY, size * 2.5, 0, 2 * Math.PI);
    ctx.fill();

    // Cross flare for bright stars
    if (star.mag < 0.5) {
      ctx.strokeStyle = `rgba(${r},${g},${b},0.35)`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(screenX - size * 3, screenY);
      ctx.lineTo(screenX + size * 3, screenY);
      ctx.moveTo(screenX, screenY - size * 3);
      ctx.lineTo(screenX, screenY + size * 3);
      ctx.stroke();
    }

    // Label for bright stars — gold with shadow
    if (star.mag < 1.5) {
      ctx.fillStyle = 'rgba(255,215,0,0.9)';
      ctx.font = '10px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(star.name, screenX, screenY - size - 3);
    }
  }

  ctx.restore();
}

/* ---------- Draw constellations ---------- */

function drawConstellations(time, hasOrientation, hasLocation, w, h, dpr) {
  if (!hasLocation || constellations.length === 0) return;

  const lat = location.lat;
  const lon = location.lon;

  ctx.save();
  ctx.scale(dpr, dpr);

  // Compute screen positions for all named stars used in constellations
  // Use same projection as drawStars (60° FOV)
  const fov = 60;
  const halfFov = fov / 2;
  const centerAz = (orientation.compass || 180) % 360;
  const centerAlt = 45;

  const starPositions = {};
  for (const star of starsCatalog) {
    const pos = getAltAz(star.ra, star.dec, time, lat, lon);
    if (pos && pos.alt > -5) {
      const azDiff = ((pos.az - centerAz + 180) % 360) - 180;
      const altDiff = pos.alt - centerAlt;
      const cssW = w / dpr;
      const cssH = h / dpr;
      starPositions[star.name] = {
        x: (azDiff / halfFov) * (cssW * 0.5) + cssW * 0.5,
        y: -(altDiff / halfFov) * (cssH * 0.5) + cssH * 0.5,
        visible: pos.alt > 0,
      };
    }
  }

  // Draw constellation lines — cyan-neon
  ctx.strokeStyle = 'rgba(0,240,255,0.30)';
  ctx.lineWidth = 0.9;

  for (const constellation of constellations) {
    for (const [a, b] of constellation.lines) {
      const pa = starPositions[a];
      const pb = starPositions[b];
      if (pa && pb && pa.visible && pb.visible) {
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }

    // Constellation label at centroid — gold
    let cx = 0, cy = 0, count = 0;
    for (const [a, b] of constellation.lines) {
      const pa = starPositions[a];
      const pb = starPositions[b];
      if (pa && pa.visible) { cx += pa.x; cy += pa.y; count++; }
      if (pb && pb.visible) { cx += pb.x; cy += pb.y; count++; }
    }
    if (count > 0) {
      cx /= count;
      cy /= count;
      ctx.fillStyle = 'rgba(255,215,0,0.45)';
      ctx.font = '8px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(constellation.name.toUpperCase(), cx, cy - 4);
    }
  }

  ctx.restore();
}

/* ---------- Draw Sun ---------- */

function drawSun(time, hasLocation, w, h, dpr) {
  if (!hasLocation) return;
  const pos = Astronomy ? Astronomy.sunPosition(time) : null;
  if (!pos) return;
  const altAz = getAltAz(pos.ra, pos.dec, time, location.lat, location.lon);
  if (!altAz || altAz.alt < -5) return;

  drawCelestialBody('sun', altAz.alt, altAz.az, w, h, dpr);
}

/* ---------- Draw Moon ---------- */

function drawMoon(time, hasLocation, w, h, dpr) {
  if (!hasLocation) return;
  const pos = Astronomy ? Astronomy.moonPosition(time) : null;
  if (!pos) return;
  const altAz = getAltAz(pos.ra, pos.dec, time, location.lat, location.lon);
  if (!altAz || altAz.alt < -5) return;

  moonPhase = pos.phase;
  moonIllumPct = Math.round(pos.phase * 100);

  drawCelestialBody('moon', altAz.alt, altAz.az, w, h, dpr);
}

/* ---------- Draw planets ---------- */

function drawPlanets(time, hasLocation, w, h, dpr) {
  if (!hasLocation || planets.length === 0) return;

  for (const planet of planets) {
    try {
      const pos = Astronomy ? Astronomy.planetPosition(planet, time) : null;
      if (!pos) continue;
      const altAz = getAltAz(pos.ra, pos.dec, time, location.lat, location.lon);
      if (!altAz || altAz.alt < -5) continue;
      drawCelestialBody(planet.name.toLowerCase(), altAz.alt, altAz.az, w, h, dpr, planet.color);
    } catch (_) {}
  }
}

/* ---------- Draw ISS ---------- */

function drawISS(time, hasLocation, w, h, dpr) {
  if (!hasLocation || !issTLE_parsed) return;

  // Compute ISS position via SGP4 — returns { ra, dec, altitude, azimuth, latitude, longitude }
  const issPos = TLESatellite.computeISS(issTLE_parsed, time, location.lat, location.lon);
  if (!issPos) return;

  // ISS alt/az from returned spatial properties
  const issAlt = issPos.altitude;
  const issAz = issPos.azimuth;

  // Draw ISS on sky map
  if (issAlt > -1 && issAz !== undefined) {
    drawCelestialBody('iss', issAlt, issAz, w, h, dpr, '#00f0ff');
  }

  // Predict passes for status display
  const passes = TLESatellite.predictPasses(issTLE_parsed, location.lat, location.lon, 24);
  if (passes) {
    issPasses.length = 0;
    for (const p of passes) issPasses.push(p);
  }
}

function searchNextISSPass() {
  if (!issTLE_parsed || !location) return;
  const now = performance.now();
  if (now - lastISSPassSearch < 30000) return; // throttle to 30s
  lastISSPassSearch = now;
  const passes = TLESatellite.predictPasses(issTLE_parsed, location.lat, location.lon, 24);
  if (passes) {
    issPasses.length = 0;
    for (const p of passes) issPasses.push(p);
  }
}

function drawCelestialBody(type, alt, az, w, h, dpr, color) {
  const compass = orientation.compass || 180;
  const centerAz = compass % 360;
  const centerAlt = 45;
  const fov = 60;
  const halfFov = fov / 2;

  const azDiff = ((az - centerAz + 180) % 360) - 180;
  const altDiff = alt - centerAlt;

  const screenX = (azDiff / halfFov) * (w * 0.5 / dpr) + w / (2 * dpr);
  const screenY = -(altDiff / halfFov) * (h * 0.5 / dpr) + h / (2 * dpr);

  if (screenX < -30 || screenX > w/dpr + 30 || screenY < -30 || screenY > h/dpr + 30) return;

  ctx.save();
  ctx.scale(dpr, dpr);

  const isSun = type === 'sun';
  const isMoon = type === 'moon';
  const isISS = type === 'iss';
  const bodyColor = color || (isSun ? '#fff4c4' : isMoon ? '#d4d4d4' : '#ffffff');
  const bodySize = isISS ? 4 : isSun ? 6 : 3;

  // Glow — cyan for ISS, gold for sun, silver for moon
  const glowColor = isISS ? 'rgba(0,240,255,' : isSun ? 'rgba(255,215,0,' : 'rgba(212,212,212,';
  const glowSize = isSun ? 24 : isMoon ? 10 : 6;
  const glow = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, glowSize);
  glow.addColorStop(0, glowColor + '0.6)');
  glow.addColorStop(0.4, glowColor + '0.2)');
  glow.addColorStop(1, glowColor + '0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(screenX, screenY, glowSize, 0, 2 * Math.PI);
  ctx.fill();

  // Body
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(screenX, screenY, bodySize, 0, 2 * Math.PI);
  ctx.fill();

  // Name label — gold
  const label = type === 'sun' ? 'Sun' : type === 'moon' ? 'Moon' : type === 'iss' ? 'ISS' : type;
  ctx.fillStyle = 'rgba(255,215,0,0.92)';
  ctx.font = '9px "IBM Plex Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, screenX, screenY - bodySize - 3);

  ctx.restore();
}

/* ---------- Draw compass ring ---------- */

function drawCompassRing(w, h, dpr, hasOrientation) {
  ctx.save();
  ctx.scale(dpr, dpr);

  const cx = w / 2 / dpr;
  const cy = h / 2 / dpr;
  const r = Math.min(w, h) / dpr * 0.44;

  // Ring — cyan neon
  ctx.strokeStyle = 'rgba(0,240,255,0.40)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();

  // Tick marks every 30°
  for (let deg = 0; deg < 360; deg += 30) {
    const rad = (deg - 90) * Math.PI / 180;
    const isCardinal = deg % 90 === 0;
    const inner = isCardinal ? r - 8 : r - 4;
    const outer = r - 1;
    const x1 = cx + inner * Math.cos(rad);
    const y1 = cy + inner * Math.sin(rad);
    const x2 = cx + outer * Math.cos(rad);
    const y2 = cy + outer * Math.sin(rad);
    ctx.strokeStyle = isCardinal ? 'rgba(255,215,0,0.70)' : 'rgba(0,240,255,0.25)';
    ctx.lineWidth = isCardinal ? 1.8 : 0.8;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Cardinal labels — gold with glow
  const labels = [
    { text: 'N', az: 0 },
    { text: 'E', az: 90 },
    { text: 'S', az: 180 },
    { text: 'W', az: 270 },
  ];

  ctx.fillStyle = 'rgba(255,215,0,0.80)';
  ctx.font = '12px "Cormorant Garamond", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const { text, az } of labels) {
    const rad = (az - 90) * Math.PI / 180;
    const lx = cx + (r + 10) * Math.cos(rad);
    const ly = cy + (r + 10) * Math.sin(rad);
    ctx.fillText(text, lx, ly);
  }

  // Compass needle (if orientation available) — gold
  if (hasOrientation && orientation.compass !== undefined) {
    const heading = orientation.compass || 0;
    const needleRad = (heading - 90) * Math.PI / 180;
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + (r - 6) * Math.cos(needleRad), cy + (r - 6) * Math.sin(needleRad));
    ctx.stroke();

    // Center dot
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, 2 * Math.PI);
    ctx.fill();
  }

  ctx.restore();
}

/* ---------- Draw search arrow ---------- */

function drawSearchArrow(result, hasOrientation, hasLocation, w, h, dpr) {
  if (!result || !hasLocation) return;

  const { alt, az } = result;
  const compass = orientation.compass || 180;
  const centerAz = compass % 360;
  const centerAlt = 45;
  const halfFov = 60;

  const azDiff = ((az - centerAz + 180) % 360) - 180;
  const altDiff = alt - centerAlt;

  const screenX = (azDiff / halfFov) * (w * 0.5 / dpr) + w / (2 * dpr);
  const screenY = -(altDiff / halfFov) * (h * 0.5 / dpr) + h / (2 * dpr);

  if (screenX < -50 || screenX > w/dpr + 50 || screenY < -50 || screenY > h/dpr + 50) return;

  ctx.save();
  ctx.scale(dpr, dpr);

  // Pulsing arrow — cyan neon
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
  ctx.fillStyle = `rgba(0,240,255,${0.4 + 0.4 * pulse})`;
  ctx.strokeStyle = `rgba(0,240,255,${0.85})`;
  ctx.lineWidth = 1.5;

  // Arrow pointing from center to target
  const cx = w / 2 / dpr;
  const cy = h / 2 / dpr;

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(screenX, screenY);
  ctx.stroke();

  // Arrowhead
  const angle = Math.atan2(screenY - cy, screenX - cx);
  const headLen = 8;
  ctx.beginPath();
  ctx.moveTo(screenX, screenY);
  ctx.lineTo(screenX - headLen * Math.cos(angle - 0.5), screenY - headLen * Math.sin(angle - 0.5));
  ctx.moveTo(screenX, screenY);
  ctx.lineTo(screenX - headLen * Math.cos(angle + 0.5), screenY - headLen * Math.sin(angle + 0.5));
  ctx.stroke();

  // Target circle — dashed cyan
  ctx.strokeStyle = `rgba(0,240,255,${0.3 + 0.3 * pulse})`;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(screenX, screenY, 8, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

/* ---------- Controls wiring ---------- */

function wireControls() {
  // Subscribe to sensor bus for live redraws
  // The render loop runs continuously and reads the latest orientation/location

  // Time scrubber
  const scrubber = document.getElementById('stars-time');
  const scrubberDisplay = document.getElementById('stars-time-display');
  if (scrubber) {
    scrubber.addEventListener('input', () => {
      scrubOffsetMinutes = parseInt(scrubber.value, 10) - 720; // center at now
      const totalMin = Math.abs(scrubOffsetMinutes);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      const dir = scrubOffsetMinutes >= 0 ? 'in ' : 'ago';
      scrubberDisplay.textContent = scrubOffsetMinutes === 0 ? 'Now' :
        `${h}h ${m}m ${dir}`;
      updateStatus();
    });
  }

  // Search
  const searchInput = document.getElementById('stars-search');
  const searchResultEl = document.getElementById('stars-search-result');
  if (searchInput && searchResultEl) {
    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = searchInput.value.trim().toLowerCase();
      if (q.length < 2) {
        searchResultEl.textContent = '';
        searchResultEl.className = 'search-result dry';
        searchResult = null;
        return;
      }
      searchTimer = setTimeout(() => performSearch(q, searchResultEl), 300);
    });
  }

  const statusEl = document.getElementById('stars-status');
  if (statusEl) {
    statusEl.addEventListener('click', async () => {
      const p = starsState && starsState.perm;
      if (p && p.isIOS && p.isIOS() && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const result = await p.requestOrientationPermission();
        if (result) {
          startOrientation();
        }
        updateStatus();
      }
    });
  }
}

async function performSearch(query, resultEl) {
  const match = starsCatalog.find(star =>
    star.name.toLowerCase().includes(query) ||
    star.bayer.toLowerCase().includes(query)
  );

  if (!match) {
    resultEl.textContent = `No star found matching "${query}"`;
    resultEl.className = 'search-result dry';
    searchResult = null;
    return;
  }

  const lat = location ? location.lat : 40.7128; // NYC fallback
  const lon = location ? location.lon : -74.0060;
  const now = new Date();
  const pos = getAltAz(match.ra, match.dec, now, lat, lon);

  searchResult = {
    name: match.name,
    bayer: match.bayer,
    alt: pos ? pos.alt : 0,
    az: pos ? pos.az : 0,
    mag: match.mag,
    const: match.const,
    visible: pos ? pos.alt > 0 : false,
  };

  const dir = searchResult.visible ? 'visible' : 'below horizon';
  const altStr = starsState && starsState.utils ? starsState.utils.formatUnit(searchResult.alt, 'degrees') : `${searchResult.alt.toFixed(1)}°`;
  const azStr = starsState && starsState.utils ? starsState.utils.formatUnit(searchResult.az, 'degrees') : `${searchResult.az.toFixed(1)}°`;

  resultEl.innerHTML = `
    <strong style="color:var(--gold)">${searchResult.name}</strong>
    (${searchResult.bayer}) · ${searchResult.const}
    <br>
    ${altStr} · ${azStr} · mag ${searchResult.mag.toFixed(2)} · ${dir}
  `;
  resultEl.className = 'search-result has-result';
}

/* ---------- Status display ---------- */

function updateStatus() {
  const el = document.getElementById('stars-status');
  if (!el) return;

  const hasOrientation = orientation.alpha !== undefined;
  const hasLocation = location !== null;

  let html = '';

  // Orientation
  html += `<div class="status-row">
    <span class="label">Orientation</span>
    <span class="value">${hasOrientation
      ? `heading ${Math.round((orientation.compass||0))}° · tilt ${Math.round(Math.abs(orientation.beta||0))}°`
      : 'waiting…'}</span>
  </div>`;

  // Location
  html += `<div class="status-row">
    <span class="label">Location</span>
    <span class="value">${hasLocation
      ? starsState && starsState.utils ? starsState.utils.formatLatLon(location.lat, location.lon, 4) + ` ±${Math.round(location.accuracy)}m`
      : 'waiting for GPS…'}</span>
  </div>`;

  // Time/date
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
  html += `<div class="status-row">
    <span class="label">Time (UTC)</span>
    <span class="value">${now.toISOString().slice(0,16).replace('T',' ')} UTC</span>
  </div>`;

  // Moon
  if (moonIllumPct !== undefined) {
    const phaseName = Astronomy ? Astronomy.moonPhaseName(moonPhase) : 'Moon';
    html += `<div class="status-row">
      <span class="label">Moon</span>
      <span class="value">${phaseName} · ${moonIllumPct}% illuminated</span>
    </div>`;
  }

  // ISS passes
  if (issPasses && issPasses.length > 0) {
    const next = issPasses[0];
    const t = next.time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    html += `<div class="status-row">
      <span class="label">ISS pass</span>
      <span class="value">Next: ${t} · max elev ${next.maxElevation.toFixed(1)}°</span>
    </div>`;
  } else if (issTLE_parsed) {
    html += `<div class="status-row">
      <span class="label">ISS</span>
      <span class="value">Searching for next pass…</span>
    </div>`;
  }

  // Fallback message
  if (!hasOrientation && !hasLocation) {
    html += `<div class="status-row">
      <span class="label">Note</span>
      <span class="value" style="color:var(--yellow)">Point your device at the sky, or allow GPS + motion access.</span>
    </div>`;
  }

  el.innerHTML = html;
}

/* ---------- Export for cleanup ---------- */

function onResize(appState, bus, utils, perm) {
  if (canvas && ctx) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
}

export default {
  init,
  destroy,
  activate,
  onResize,
};
