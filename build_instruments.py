#!/usr/bin/env python3
"""Build instruments/stars.js - classic script, no imports."""

stars_js = r'''/* ============================================================
   instruments/stars.js — Star Finder
   THE HERO instrument. Must never be blank.
   Classic script, no imports.
   ============================================================ */

(function() {
'use strict';

var Stars = {};
window.FI.stars = Stars;

var state = {
  canvas: null,
  ctx: null,
  active: false,
  lat: 35,
  lon: -100,
  locationSource: 'Default',
  az: 0,
  zoom: 1,
  fov: 100,
  drag: false,
  dragStartX: 0,
  dragStartY: 0,
  dragStartAz: 0,
  mode: 'MANUAL',
  showConstellations: true,
  showGrid: true,
  showCardinal: true,
  timeOffset: 0,
  scrubberVal: 0,
  searchQuery: '',
  searchResult: null,
  fps: 0,
  frameCount: 0,
  lastFpsTime: 0,
  issData: null,
  issActive: false,
  sensorsEnabled: false,
  orientationHandler: null,
  pointerHandler: null
};

var els = {};

function init() {
  state.canvas = document.getElementById('stars-canvas');
  if (!state.canvas) return;

  var rect = state.canvas.getBoundingClientRect();
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.canvas.width = Math.round(rect.width * dpr);
  state.canvas.height = Math.round(rect.height * dpr);
  state.ctx = state.canvas.getContext('2d');
  state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  state.canvas.style.touchAction = 'none';

  state.pointerHandler = function(e) {
    if (e.pointerType === 'mouse' || e.pointerType === 'touch') {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!state.drag) {
        state.drag = true;
        state.dragStartX = e.clientX;
        state.dragStartY = e.clientY;
        state.dragStartAz = state.az;
      } else {
        var dx = e.clientX - state.dragStartX;
        var dy = e.clientY - state.dragStartY;
        state.az = state.dragStartAz - dx * 0.5;
        state.az = ((state.az % 360) + 360) % 360;
        drawFrame();
      }
    }
  };
  state.canvas.addEventListener('pointerdown', state.pointerHandler);
  state.canvas.addEventListener('pointermove', state.pointerHandler);
  state.canvas.addEventListener('pointerup', function(e) { state.drag = false; });
  state.canvas.addEventListener('pointercancel', function(e) { state.drag = false; });
  state.canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    state.zoom = Math.max(0.3, Math.min(3, state.zoom + (e.deltaY > 0 ? -0.1 : 0.1)));
    drawFrame();
  }, { passive: false });
  state.canvas.addEventListener('dblclick', function() {
    state.az = 0;
    state.zoom = 1;
    drawFrame();
  });

  var modeBtn = document.getElementById('stars-mode-btn');
  if (modeBtn) {
    modeBtn.addEventListener('click', function() {
      if (state.mode === 'MANUAL') {
        state.mode = 'SENSOR';
        modeBtn.textContent = 'SENSOR';
        modeBtn.setAttribute('aria-pressed', 'true');
        enableSensors();
      } else {
        state.mode = 'MANUAL';
        modeBtn.textContent = 'MANUAL';
        modeBtn.setAttribute('aria-pressed', 'false');
        disableSensors();
      }
      updateModeChip();
    });
  }

  var constToggle = document.getElementById('constellation-toggle');
  if (constToggle) {
    constToggle.addEventListener('click', function() {
      state.showConstellations = !state.showConstellations;
      constToggle.setAttribute('aria-pressed', state.showConstellations ? 'true' : 'false');
      drawFrame();
    });
  }
  var gridToggle = document.getElementById('grid-toggle');
  if (gridToggle) {
    gridToggle.addEventListener('click', function() {
      state.showGrid = !state.showGrid;
      gridToggle.setAttribute('aria-pressed', state.showGrid ? 'true' : 'false');
      drawFrame();
    });
  }
  var cardinalToggle = document.getElementById('cardinal-toggle');
  if (cardinalToggle) {
    cardinalToggle.addEventListener('click', function() {
      state.showCardinal = !state.showCardinal;
      cardinalToggle.setAttribute('aria-pressed', state.showCardinal ? 'true' : 'false');
      drawFrame();
    });
  }

  var scrubber = document.getElementById('time-scrubber-range');
  var scrubberDisplay = document.getElementById('time-scrubber-display');
  if (scrubber) {
    scrubber.addEventListener('input', function() {
      state.scrubberVal = parseInt(scrubber.value);
      updateTimeDisplay();
      drawFrame();
    });
  }
  var resetBtn = document.getElementById('time-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      state.scrubberVal = 0;
      if (scrubber) scrubber.value = '0';
      updateTimeDisplay();
      drawFrame();
    });
  }

  var searchInput = document.getElementById('star-search-input');
  var searchResult = document.getElementById('stars-search-result');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      state.searchQuery = searchInput.value.trim().toLowerCase();
      doSearch();
    });
  }

  var locInput = document.getElementById('stars-location-input');
  if (locInput) {
    locInput.addEventListener('change', function() {
      var parts = locInput.value.trim().split(',');
      var lat = parseFloat(parts[0]);
      var lon = parseFloat(parts[1]);
      if (isFinite(lat) && isFinite(lon)) {
        state.lat = Math.max(-90, Math.min(90, lat));
        state.lon = Math.max(-180, Math.min(180, lon));
        state.locationSource = 'Manual';
        updateStatus('Manual position set');
        drawFrame();
        updateBodies();
      }
    });
  }

  window.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') { state.az -= 5; drawFrame(); }
    else if (e.key === 'ArrowRight') { state.az += 5; drawFrame(); }
    else if (e.key === 'ArrowUp') { state.zoom = Math.max(0.3, state.zoom - 0.1); drawFrame(); }
    else if (e.key === 'ArrowDown') { state.zoom = Math.min(3, state.zoom + 0.1); drawFrame(); }
  });
}

function getCurrentJD() {
  var now = new Date().getTime() + state.scrubberVal * 60000;
  return (now / 86400000) + 2440587.5;
}

function updateTimeDisplay() {
  var el = document.getElementById('time-scrubber-display');
  if (!el) return;
  if (state.scrubberVal === 0) el.textContent = 'Now';
  else {
    var h = Math.floor(state.scrubberVal / 60);
    var m = state.scrubberVal % 60;
    el.textContent = '+' + h + 'h ' + String(m).padStart(2, '0') + 'm';
  }
}

function updateStatus(msg) {
  var el = document.getElementById('stars-status');
  if (el) { el.textContent = msg || state.locationSource; el.style.display = msg ? 'block' : 'none'; }
}

function updateModeChip() {
  var chip = document.querySelector('#panel-stars .mode-chip');
  if (chip) {
    if (state.mode === 'SENSOR') { chip.setAttribute('data-mode', 'live'); chip.textContent = 'LIVE'; }
    else { chip.setAttribute('data-mode', 'idle'); chip.textContent = 'IDLE'; }
  }
}

function enableSensors() {
  if (state.sensorsEnabled) return;
  state.sensorsEnabled = true;
  if (window.DeviceOrientationEvent) {
    var handler = function(e) {
      if (e.alpha !== null && e.alpha !== undefined) {
        state.az = e.alpha;
        drawFrame();
      }
    };
    window.addEventListener('deviceorientation', handler);
    state.orientationHandler = handler;
  }
  updateStatus('Sensors enabled');
}

function disableSensors() {
  state.sensorsEnabled = false;
  if (state.orientationHandler) {
    window.removeEventListener('deviceorientation', state.orientationHandler);
    state.orientationHandler = null;
  }
  updateStatus('Sensors disabled');
}

function doSearch() {
  var q = state.searchQuery;
  var resultEl = document.getElementById('stars-search-result');
  if (!resultEl || !q) { if (resultEl) resultEl.style.display = 'none'; state.searchResult = null; return; }
  resultEl.style.display = 'block';

  var catalog = window.FI_CATALOG || [];
  var found = null;

  for (var i = 0; i < catalog.length; i++) {
    var s = catalog[i];
    if (s.name && s.name.toLowerCase().indexOf(q) === 0) { found = s; break; }
    if (s.bayer && s.bayer.toLowerCase().indexOf(q) === 0) { found = s; break; }
  }

  if (!found) {
    for (var j = 0; j < catalog.length; j++) {
      var s2 = catalog[j];
      if (s2.name && s2.name.toLowerCase().indexOf(q) >= 0) { found = s2; break; }
    }
  }

  if (!found) {
    resultEl.textContent = 'No matching star or planet found';
    state.searchResult = null;
    return;
  }

  state.searchResult = found;
  var jd = getCurrentJD();
  var Astro = window.FI_astronomy;
  var altAz = Astro ? Astro.equatorialToHorizontal(found.ra, found.dec, state.lat, Astro.lstDeg(jd, state.lon)) : { alt: 0, az: 0 };
  var alt = altAz.alt;
  var az = altAz.az;

  var dirText = '';
  if (alt < 0) { dirText = 'below horizon'; }
  else {
    var relAz = ((az - state.az + 540) % 360) - 180;
    var turn = Math.abs(relAz) > 5 ? (relAz > 0 ? 'turn right ' : 'turn left ') + Math.round(Math.abs(relAz)) + '\u00b0' : '';
    var raise = alt > 5 ? 'raise ' + Math.round(alt) + '\u00b0' : 'in view';
    dirText = turn ? turn + ', ' + raise : raise;
  }

  resultEl.textContent = found.name + ' \u2014 Alt ' + alt.toFixed(1) + '\u00b0, Az ' + az.toFixed(0) + '\u00b0 \u2014 ' + dirText;

  // Draw guide arrow
  drawGuideArrow(az, alt);
}

function drawGuideArrow(targetAz, targetAlt) {
  var canvas = state.canvas;
  var ctx = state.ctx;
  if (!canvas || !ctx) return;
  var rect = canvas.getBoundingClientRect();
  var cx = rect.width / 2;
  var cy = rect.height / 2;
  var r = Math.min(cx, cy) * state.zoom;
  var relAz = ((targetAz - state.az + 540) % 360) - 180;
  var azRad = relAz * Math.PI / 180;
  var altFactor = Math.max(0, Math.min(1, (targetAlt + 90) / 180));
  var dist = r * (1 - altFactor * 0.5);
  var px = cx + Math.sin(azRad) * dist;
  var py = cy - Math.cos(azRad) * dist * 0.8;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,215,0,0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(px, py);
  ctx.stroke();
  ctx.setLineDash([]);
  var angle = Math.atan2(py - cy, px - cx);
  ctx.fillStyle = 'rgba(255,215,0,0.8)';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px - 8 * Math.cos(angle - 0.5), py - 8 * Math.sin(angle - 0.5));
  ctx.lineTo(px - 8 * Math.cos(angle + 0.5), py - 8 * Math.sin(angle + 0.5));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFrame() {
  if (!state.active || !state.ctx || !state.canvas) return;
  var ctx = state.ctx;
  var canvas = state.canvas;
  var rect = canvas.getBoundingClientRect();
  var w = rect.width;
  var h = rect.height;

  ctx.clearRect(0, 0, w, h);

  // Background sky
  var bg = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.7);
  bg.addColorStop(0, '#0a0d18');
  bg.addColorStop(0.5, '#060912');
  bg.addColorStop(1, '#02040a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  var jd = getCurrentJD();
  var Astro = window.FI_astronomy;
  var lst = Astro ? Astro.lstDeg(jd, state.lon) : 0;

  var centerX = w / 2;
  var centerY = h / 2;
  var radius = Math.min(centerX, centerY) * state.zoom;

  // Horizon ring
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 6.2831853);
  ctx.strokeStyle = 'rgba(255,215,0,0.2)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Altitude circles
  if (state.showGrid) {
    for (var a = 30; a < 90; a += 30) {
      var ringR = radius * Math.tan((90 - a) * Math.PI / 360);
      if (ringR < radius) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, Math.abs(ringR), 0, 6.2831853);
        ctx.strokeStyle = 'rgba(0,240,255,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    // Azimuth spokes
    for (var sp = 0; sp < 360; sp += 45) {
      var spRad = sp * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + radius * Math.sin(spRad), centerY - radius * Math.cos(spRad));
      ctx.strokeStyle = 'rgba(0,240,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Cardinal labels
  if (state.showCardinal) {
    var cards = [['N',0,'rgba(255,215,0,0.7)'],['E',90,'rgba(0,240,255,0.4)'],['S',180,'rgba(168,85,247,0.35)'],['W',270,'rgba(0,240,255,0.4)']];
    for (var ci = 0; ci < cards.length; ci++) {
      var ca = cards[ci];
      var caz = ca[1] * Math.PI / 180;
      var cd = radius * 0.92;
      var cx2 = centerX + cd * Math.sin(caz);
      var cy2 = centerY - cd * Math.cos(caz);
      ctx.fillStyle = ca[2];
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ca[0], cx2, cy2);
    }
  }

  // Constellations
  if (state.showConstellations) {
    var consts = window.FI_CONSTELLATIONS || [];
    ctx.strokeStyle = 'rgba(168,85,247,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    for (var cn = 0; cn < consts.length; cn++) {
      var lines = consts[cn].lines || [];
      for (var ln = 0; ln < lines.length; ln++) {
        var s1n = lines[ln][0];
        var s2n = lines[ln][1];
        var s1 = findStar(s1n);
        var s2 = findStar(s2n);
        if (!s1 || !s2) continue;
        var sa1 = Astro ? Astro.equatorialToHorizontal(s1.ra, s1.dec, state.lat, lst) : { alt: -90, az: 0 };
        var sa2 = Astro ? Astro.equatorialToHorizontal(s2.ra, s2.dec, state.lat, lst) : { alt: -90, az: 0 };
        if (sa1.alt < -5 || sa2.alt < -5) continue;
        var r1 = radius * Math.tan((90 - sa1.alt) * Math.PI / 360);
        var r2 = radius * Math.tan((90 - sa2.alt) * Math.PI / 360);
        var a1r = (sa1.az - 180) * Math.PI / 180;
        var a2r = (sa2.az - 180) * Math.PI / 180;
        var sx1 = centerX + r1 * Math.sin(a1r), sy1 = centerY - r1 * Math.cos(a1r);
        var sx2 = centerX + r2 * Math.sin(a2r), sy2 = centerY - r2 * Math.cos(a2r);
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  // Stars
  var catalog = window.FI_CATALOG || [];
  for (var i = 0; i < catalog.length; i++) {
    var s = catalog[i];
    var sa = Astro ? Astro.equatorialToHorizontal(s.ra, s.dec, state.lat, lst) : { alt: -90, az: 0 };
    var alt = sa.alt;
    var az = sa.az;
    if (alt < -2) continue;

    var tanHalf = Math.tan((90 - alt) * Math.PI / 360);
    var projR = radius * tanHalf;
    var azRad = (az - 180) * Math.PI / 180;
    var px = centerX + projR * Math.sin(azRad);
    var py = centerY - projR * Math.cos(azRad);

    if (px < -10 || px > w + 10 || py < -10 || py > h + 10) continue;

    var rad = Math.max(0.5, Math.min(5, 0.6 + (6 - s.mag) * 0.8)) * state.zoom * 0.5;
    var bv = s.bv || 0;
    var col = bv < -0.3 ? 'rgba(140,180,255,1)' : bv < 0.5 ? 'rgba(255,255,255,1)' : bv < 1.5 ? 'rgba(255,215,106,1)' : 'rgba(255,140,80,1)';
    var bright = Math.max(0.2, Math.min(1, 0.3 + (3 - s.mag) * 0.15));

    ctx.globalAlpha = bright * (alt < 0 ? 0.15 : 1);
    if (s.mag < 3 && alt > 0) {
      var glowR = rad * 3;
      var glow = ctx.createRadialGradient(px, py, 0, px, py, glowR);
      glow.addColorStop(0, col.replace('1)', '0.2)'));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, glowR, 0, 6.2831853);
      ctx.fill();
    }
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, 6.2831853);
    ctx.fill();

    if (state.searchResult && state.searchResult.id === s.id) {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, rad + 3, 0, 6.2831853);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Planets
  var planets = window.FI_PLANETS || [];
  for (var pi = 0; pi < planets.length; pi++) {
    var pla = planets[pi];
    var pp = Astro ? Astro.planetPosition(pla.name, jd) : null;
    if (!pp) continue;
    var pa = Astro ? Astro.equatorialToHorizontal(pp.ra, pp.dec, state.lat, lst) : { alt: -90, az: 0 };
    if (pa.alt < -5) continue;
    var prad = radius * Math.tan((90 - pa.alt) * Math.PI / 360);
    var paz = (pa.az - 180) * Math.PI / 180;
    var px2 = centerX + prad * Math.sin(paz);
    var py2 = centerY - prad * Math.cos(paz);
    if (px2 < -20 || px2 > w + 20 || py2 < -20 || py2 > h + 20) continue;
    var psize = Math.max(2, Math.min(6, 3 + pp.mag * 0.3)) * state.zoom * 0.4;
    ctx.fillStyle = pla.color || '#fff';
    ctx.globalAlpha = Math.max(0.3, Math.min(1, 0.4 + pa.alt / 90));
    ctx.beginPath();
    ctx.arc(px2, py2, psize, 0, 6.2831853);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,215,0,0.5)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pla.name, px2, py2 - psize - 3);
    ctx.globalAlpha = 1;
  }

  // Moon
  var mp = Astro ? Astro.moonPosition(jd) : null;
  if (mp) {
    var ma = Astro ? Astro.equatorialToHorizontal(mp.ra, mp.dec, state.lat, lst) : { alt: -90, az: 0 };
    if (ma.alt > -5) {
      var mrad = radius * Math.tan((90 - ma.alt) * Math.PI / 360);
      var maz = (ma.az - 180) * Math.PI / 180;
      var mx = centerX + mrad * Math.sin(maz);
      var my = centerY - mrad * Math.cos(maz);
      if (mx > -30 && mx < w + 30 && my > -30 && my < h + 30) {
        var ms = 5 * state.zoom * 0.4;
        ctx.fillStyle = '#e8e8d0';
        ctx.globalAlpha = Math.max(0.3, Math.min(1, 0.4 + ma.alt / 90));
        ctx.beginPath();
        ctx.arc(mx, my, ms, 0, 6.2831853);
        ctx.fill();
        var phase = Astro ? Astro.moonPhase(jd).illuminatedFraction : 1;
        ctx.save();
        ctx.beginPath();
        ctx.arc(mx, my, ms, 0, 6.2831853);
        ctx.clip();
        ctx.fillStyle = '#02040a';
        ctx.fillRect(mx - ms, my - ms * phase, ms * 2, ms * 2);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,215,0,0.5)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Moon', mx, my - ms - 3);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ISS
  if (state.issActive && state.issData) {
    var iData = state.issData;
    if (iData.alt > 0) {
      var iaz = (iData.az - 180) * Math.PI / 180;
      var ir = radius * Math.tan((90 - iData.alt) * Math.PI / 360);
      var ix = centerX + ir * Math.sin(iaz);
      var iy = centerY - ir * Math.cos(iaz);
      if (ix > -20 && ix < w + 20 && iy > -20 && iy < h + 20) {
        var iSize = 3 * state.zoom * 0.4;
        var iglow = ctx.createRadialGradient(ix, iy, 0, ix, iy, iSize * 4);
        iglow.addColorStop(0, 'rgba(0,240,255,0.3)');
        iglow.addColorStop(1, 'rgba(0,240,255,0)');
        ctx.fillStyle = iglow;
        ctx.beginPath();
        ctx.arc(ix, iy, iSize * 4, 0, 6.2831853);
        ctx.fill();
        ctx.fillStyle = '#00f0ff';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(ix, iy, iSize, 0, 6.2831853);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,240,255,0.6)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ISS', ix, iy - iSize - 3);
        ctx.globalAlpha = 1;
      }
    }
  }

  // FPS
  var now = performance.now();
  state.frameCount++;
  if (now - state.lastFpsTime >= 1000) {
    state.fps = state.frameCount;
    state.frameCount = 0;
    state.lastFpsTime = now;
    var fpsEl = document.getElementById('stars-fps');
    if (fpsEl) fpsEl.textContent = state.fps + ' fps';
  }
}

function findStar(name) {
  var catalog = window.FI_CATALOG || [];
  for (var i = 0; i < catalog.length; i++) {
    var s = catalog[i];
    if (s.name && s.name.toLowerCase() === name.toLowerCase()) return s;
    if (s.bayer && s.bayer.toLowerCase().indexOf(name.toLowerCase()) === 0) return s;
  }
  return null;
}

function updateBodies() {
  var el = document.getElementById('stars-bodies');
  if (!el) return;
  var jd = getCurrentJD();
  var Astro = window.FI_astronomy;
  var lst = Astro ? Astro.lstDeg(jd, state.lon) : 0;

  var parts = [];
  var sun = Astro ? Astro.sunPosition(jd) : null;
  if (sun) {
    var sa = Astro.equatorialToHorizontal(sun.ra, sun.dec, state.lat, lst);
    if (sa.alt > -6) parts.push('Sun: ' + sa.alt.toFixed(1) + '\u00b0, ' + sa.az.toFixed(0) + '\u00b0');
  }
  var moon = Astro ? Astro.moonPosition(jd) : null;
  if (moon) {
    var ma = Astro.equatorialToHorizontal(moon.ra, moon.dec, state.lat, lst);
    var phase = Astro ? Astro.moonPhase(jd).name : '';
    if (ma.alt > -6) parts.push('Moon (' + phase + '): ' + ma.alt.toFixed(1) + '\u00b0, ' + ma.az.toFixed(0) + '\u00b0');
  }
  var planets = window.FI_PLANETS || [];
  for (var i = 0; i < planets.length; i++) {
    var pp = Astro ? Astro.planetPosition(planets[i].name, jd) : null;
    if (pp) {
      var pa = Astro.equatorialToHorizontal(pp.ra, pp.dec, state.lat, lst);
      if (pa.alt > -6) parts.push(planets[i].name + ': ' + pa.alt.toFixed(1) + '\u00b0, ' + pa.az.toFixed(0) + '\u00b0');
    }
  }
  if (state.issActive && state.issData && state.issData.alt > 0) {
    parts.push('ISS: ' + state.issData.alt.toFixed(1) + '\u00b0, ' + state.issData.az.toFixed(0) + '\u00b0');
  }
  el.innerHTML = parts.length ? parts.join('<br>') : 'No bodies visible';
}

// ISS update loop
function updateISS() {
  if (!state.issActive) return;
  var tle = window.FI_ISS_TLE;
  if (tle) {
    var result = window.FI_tle ? window.FI_tle.computeISS(tle, new Date(), { lat: state.lat, lon: state.lon, heightM: 0 }) : null;
    if (result) state.issData = result;
  }
  setTimeout(updateISS, 30000);
}

// Lifecycle
function activate() {
  if (state.active) return;
  state.active = true;
  init();
  updateStatus(state.locationSource);
  updateModeChip();
  updateTimeDisplay();
  updateBodies();
  drawFrame();
  if (window.FI && window.FI.Loop) {
    window.FI.Loop.register({ name: 'stars', draw: drawFrame });
    window.FI.Loop.setActive('stars');
  }
  // Start ISS updates
  state.issActive = true;
  setTimeout(updateISS, 5000);
}

function deactivate() {
  state.active = false;
  if (window.FI && window.FI.Loop) {
    window.FI.Loop.unregister('stars');
  }
  if (state.mode === 'SENSOR') disableSensors();
}

function destroy() {
  state.active = false;
  if (state.canvas) {
    if (state.pointerHandler && state.canvas) {
      state.canvas.removeEventListener('pointerdown', state.pointerHandler);
      state.canvas.removeEventListener('pointermove', state.pointerHandler);
      state.canvas.removeEventListener('pointerup', state.pointerHandler);
    }
    state.canvas = null;
  }
  if (state.mode === 'SENSOR') disableSensors();
}

Stars.init = init;
Stars.activate = activate;
Stars.deactivate = deactivate;
Stars.destroy = destroy;

})();
'''

with open('scripts/instruments/stars.js', 'w') as f:
    f.write(stars_js)
print('Wrote stars.js')
