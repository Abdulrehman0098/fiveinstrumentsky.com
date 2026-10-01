(function () {
  'use strict';
  window.FI = window.FI || {};

  var canvas, ctx, W = 0, H = 0;
  var lat = 0, lon = 0, locationSource = 'Default (equator)';

  var D2R = Math.PI / 180, R2D = 180 / Math.PI;

  var state = {
    active: false,
    showConstellations: true,
    showGrid: true,
    showCardinal: true,
    manualMode: false,
    rotationAz: 0,
    fov: 90,
    timeOffsetMin: 0,
    rafId: null
  };

  var normCatalog = null;   // [{id,name,con,ra(hours),dec(deg),mag}]
  var nameIndex = null;     // lowercase name -> star
  var segments = null;      // [[starA, starB], ...]

  /* ------------------------------------------------------------------ */
  /* Canvas                                                              */
  /* ------------------------------------------------------------------ */

  function sizeCanvas() {
    canvas = document.getElementById('stars-canvas');
    if (!canvas) return false;
    var r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = r.width; H = r.height;
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Astronomy                                                           */
  /* ------------------------------------------------------------------ */

  function julianDate(ms) {
    return 2440587.5 + (ms / 86400000);
  }

  function gmstDeg(jd) {
    var T = (jd - 2451545.0) / 36525;
    var g = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
          + 0.000387933 * T * T - (T * T * T) / 38710000;
    g = g % 360; if (g < 0) g += 360;
    return g;
  }

  // raHours: right ascension in HOURS. decDeg: declination in DEGREES.
  // Returns { alt, az } in degrees. Never throws.
  function altAz(raHours, decDeg, latDeg, lstDeg) {
    var raDeg = raHours * 15;
    var lha = ((lstDeg - raDeg + 540) % 360) - 180;

    var decR = decDeg * D2R;
    var latR = latDeg * D2R;
    var sinDec = Math.sin(decR), cosDec = Math.cos(decR);
    var sinLat = Math.sin(latR), cosLat = Math.cos(latR);
    var sinLHA = Math.sin(lha * D2R), cosLHA = Math.cos(lha * D2R);

    var sinAlt = sinDec * sinLat + cosDec * cosLat * cosLHA;
    if (sinAlt > 1) sinAlt = 1;
    if (sinAlt < -1) sinAlt = -1;

    var alt = Math.asin(sinAlt) * R2D;
    var cosAlt = Math.cos(Math.asin(sinAlt));

    var az;
    if (cosAlt < 1e-9 || cosLat < 1e-9) {
      az = 0;
    } else {
      var y = sinLHA;
      var x = cosLHA * sinLat - Math.tan(decR) * cosLat;
      az = Math.atan2(y, x) * R2D + 180;
      az = ((az % 360) + 360) % 360;
    }
    return { alt: alt, az: az };
  }

  /* ------------------------------------------------------------------ */
  /* Catalog                                                             */
  /* ------------------------------------------------------------------ */

  function getCatalog() {
    if (normCatalog) return normCatalog;

    var raw = window.FI_CATALOG || window.FI.catalog || [];
    if (!raw || !raw.length) { normCatalog = []; return normCatalog; }

    // Accept RA in either degrees or hours - detect by range.
    var maxRa = 0;
    for (var i = 0; i < raw.length; i++) {
      var v = raw[i] && raw[i].ra;
      if (typeof v === 'number' && isFinite(v) && v > maxRa) maxRa = v;
    }
    var divide = (maxRa > 24) ? 15 : 1;

    normCatalog = [];
    nameIndex = {};
    for (i = 0; i < raw.length; i++) {
      var s = raw[i];
      if (!s || typeof s.ra !== 'number' || typeof s.dec !== 'number') continue;
      if (!isFinite(s.ra) || !isFinite(s.dec)) continue;
      var star = {
        id: s.id,
        name: s.name,
        con: s.con,
        ra: s.ra / divide,
        dec: s.dec,
        mag: (typeof s.mag === 'number' && isFinite(s.mag)) ? s.mag : 4
      };
      normCatalog.push(star);
      if (star.name) nameIndex[String(star.name).toLowerCase()] = star;
    }
    return normCatalog;
  }

  function getSegments() {
    if (segments) return segments;
    segments = [];
    var cons = window.FI_CONSTELLATIONS || window.FI.constellations;
    if (!cons || !cons.length || !nameIndex) return segments;
    for (var i = 0; i < cons.length; i++) {
      var fig = cons[i];
      if (!fig || !fig.lines) continue;
      for (var j = 0; j < fig.lines.length; j++) {
        var seg = fig.lines[j];
        if (!seg || seg.length < 2) continue;
        var a = nameIndex[String(seg[0]).toLowerCase()];
        var b = nameIndex[String(seg[1]).toLowerCase()];
        if (a && b) segments.push([a, b]);
      }
    }
    return segments;
  }

  /* ------------------------------------------------------------------ */
  /* Projection                                                          */
  /* ------------------------------------------------------------------ */

  function project(star, cx, cy, radius, lst) {
    var aa = altAz(star.ra, star.dec, lat, lst);
    if (aa.alt <= 0) return null;
    var r = radius * (90 - aa.alt) / 90 * (90 / state.fov);
    var azRot = ((aa.az + state.rotationAz) % 360 + 360) % 360;
    var rad = (azRot - 90) * D2R;
    return { x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r, alt: aa.alt, az: aa.az };
  }

  /* ------------------------------------------------------------------ */
  /* Drawing                                                             */
  /* ------------------------------------------------------------------ */

  function drawSky() {
    if (!ctx) return;

    if (!drawSky._warned) {
      drawSky._warned = true;
      var rawCat = window.FI_CATALOG || window.FI.catalog;
      console.log('[stars] catalog length:', rawCat ? rawCat.length : 'UNDEFINED');
      console.log('[stars] catalog first entry:', rawCat ? rawCat[0] : undefined);
    }

    var bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
    bg.addColorStop(0, '#120e2e');
    bg.addColorStop(0.7, '#0a0d18');
    bg.addColorStop(1, '#02040a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    var cx = W / 2, cy = H / 2;
    var radius = Math.min(W, H) * 0.42;

    var jd = julianDate(Date.now() + state.timeOffsetMin * 60000);
    var lst = ((gmstDeg(jd) + lon) % 360 + 360) % 360;

    var catalog = getCatalog();

    // ---- Grid (gated) ----
    if (state.showGrid) {
      ctx.strokeStyle = 'rgba(0,240,255,0.18)';
      ctx.lineWidth = 0.8;
      [30, 60].forEach(function (altDeg) {
        var r = radius * (90 - altDeg) / 90;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 6.2832);
        ctx.stroke();
      });
      ctx.strokeStyle = 'rgba(0,240,255,0.10)';
      for (var a = 0; a < 360; a += 45) {
        var rad = (a - 90) * D2R;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius);
        ctx.stroke();
      }
    }

    // Everything inside the dome is clipped to the horizon circle.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 6.2832);
    ctx.clip();

    // ---- Constellation lines (gated) ----
    var segs = getSegments();
    if (state.showConstellations && segs.length) {
      ctx.strokeStyle = 'rgba(0,240,255,0.42)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var si = 0; si < segs.length; si++) {
        var pa = project(segs[si][0], cx, cy, radius, lst);
        var pb = project(segs[si][1], cx, cy, radius, lst);
        if (!pa || !pb) continue;
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
      }
      ctx.stroke();
    }

    // ---- Stars: ALWAYS drawn, never gated by a state flag ----
    var drawn = 0;
    var labels = [];   // {x,y,text} deferred until after all stars are plotted
    var boxes = [];    // collision boxes

    for (var i = 0; i < catalog.length; i++) {
      var s = catalog[i];
      var p = project(s, cx, cy, radius, lst);
      if (!p) continue;

      var size = Math.max(0.9, Math.min(5, 1.6 + (3 - s.mag) * 0.9));

      if (s.mag < 1.5) {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 6;
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, 6.2832);
      ctx.fill();
      ctx.shadowBlur = 0;
      drawn++;

      // Name for bright stars only (mag < 2.5), with overlap avoidance.
      if (s.name && s.mag < 2.5) {
        var lx = p.x + size + 6;
        var ly = p.y;
        var w = s.name.length * 5.6;
        var box = { x: lx, y: ly - 6, w: w, h: 12 };
        var clash = false;
        for (var b = 0; b < boxes.length; b++) {
          var o = boxes[b];
          if (box.x < o.x + o.w && box.x + box.w > o.x &&
              box.y < o.y + o.h && box.y + box.h > o.y) { clash = true; break; }
        }
        if (!clash) {
          boxes.push(box);
          labels.push({ x: lx, y: ly, text: s.name });
        }
      }
    }

    // Label pass (drawn last so stars never cover text)
    if (labels.length) {
      ctx.font = '11px ui-sans-serif, "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (var li = 0; li < labels.length; li++) {
        var L = labels[li];
        ctx.strokeStyle = 'rgba(255,215,0,0.45)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(L.x - 6, L.y);
        ctx.lineTo(L.x - 2, L.y);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,215,0,0.92)';
        ctx.fillText(L.text, L.x, L.y);
      }
    }

    ctx.restore();

    // ---- Cardinal points (gated) ----
    if (state.showCardinal) {
      var cards = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
      ctx.font = 'bold 12px ui-sans-serif, "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var c = 0; c < cards.length; c++) {
        var azC = ((cards[c][1] + state.rotationAz) % 360 + 360) % 360;
        var radC = (azC - 90) * D2R;
        var lx2 = cx + Math.cos(radC) * (radius + 14);
        var ly2 = cy + Math.sin(radC) * (radius + 14);
        ctx.fillStyle = 'rgba(255,215,0,0.9)';
        ctx.fillText(cards[c][0], lx2, ly2);
      }
    }

    // ---- Horizon ring on top ----
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 6.2832);
    ctx.strokeStyle = 'rgba(255,215,0,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ---- Bodies readout ----
    var sunA = null, moonA = null, marsA = null;
    if (window.FI && window.FI.astronomy) {
      try {
        var sun = window.FI.astronomy.sunPosition(jd);
        if (sun && typeof sun.ra === 'number') sunA = altAz(sun.ra / 15, sun.dec, lat, lst);
      } catch (e) {}
      try {
        var moon = window.FI.astronomy.moonPosition(jd);
        if (moon && typeof moon.ra === 'number') moonA = altAz(moon.ra / 15, moon.dec, lat, lst);
      } catch (e) {}
      try {
        var mars = window.FI.astronomy.planetPosition('Mars', jd);
        if (mars && typeof mars.ra === 'number') marsA = altAz(mars.ra / 15, mars.dec, lat, lst);
      } catch (e) {}
    }

    function bodyText(name, aa) {
      if (!aa || !isFinite(aa.alt)) return name + ': \u2014';
      var altS = (aa.alt >= 0 ? '+' : '') + aa.alt.toFixed(1);
      return name + ': ' + aa.az.toFixed(1) + '\u00b0 Az, ' + altS + '\u00b0 Alt';
    }

    var bodies = document.getElementById('stars-bodies');
    if (bodies) {
      bodies.textContent = [
        bodyText('Sun', sunA),
        bodyText('Moon', moonA),
        bodyText('Mars', marsA)
      ].join('  \u00b7  ');
    }

    var statusEl = document.getElementById('stars-status');
    if (statusEl) {
      statusEl.textContent = locationSource + ' \u00b7 ' + drawn + ' stars up \u00b7 FOV '
        + Math.round(state.fov) + '\u00b0';
    }

    // Draw the Sun / Moon / Mars markers inside the dome.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 6.2832);
    ctx.clip();
    [['Sun', sunA, '#ffd700', 6], ['Moon', moonA, '#e8edff', 5], ['Mars', marsA, '#ff6b4a', 3]].forEach(function (row) {
      var aa = row[1];
      if (!aa || aa.alt <= 0) return;
      var r = radius * (90 - aa.alt) / 90 * (90 / state.fov);
      var azRot = ((aa.az + state.rotationAz) % 360 + 360) % 360;
      var rad = (azRot - 90) * D2R;
      var px = cx + Math.cos(rad) * r;
      var py = cy + Math.sin(rad) * r;
      ctx.fillStyle = row[2];
      ctx.shadowColor = row[2];
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(px, py, row[3], 0, 6.2832);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Bindings                                                            */
  /* ------------------------------------------------------------------ */

  function bindStarsButtons() {
    if (bindStarsButtons._bound) return;
    bindStarsButtons._bound = true;

    function bindOnce(id, handler) {
      var el = document.getElementById(id);
      if (!el || el._bound) return;
      el._bound = true;
      el.addEventListener('click', handler);
    }

    bindOnce('constellation-toggle', function () {
      state.showConstellations = !state.showConstellations;
      this.setAttribute('aria-pressed', String(state.showConstellations));
      console.log('[stars] toggle constellations \u2192', state.showConstellations);
      drawSky();
    });
    bindOnce('grid-toggle', function () {
      state.showGrid = !state.showGrid;
      this.setAttribute('aria-pressed', String(state.showGrid));
      console.log('[stars] toggle grid \u2192', state.showGrid);
      drawSky();
    });
    bindOnce('cardinal-toggle', function () {
      state.showCardinal = !state.showCardinal;
      this.setAttribute('aria-pressed', String(state.showCardinal));
      console.log('[stars] toggle cardinal \u2192', state.showCardinal);
      drawSky();
    });
    bindOnce('stars-mode-btn', function () {
      state.manualMode = !state.manualMode;
      this.setAttribute('aria-pressed', String(state.manualMode));
      this.textContent = state.manualMode ? 'SENSOR' : 'MANUAL';
      console.log('[stars] toggle manual mode \u2192', state.manualMode);
      drawSky();
    });
  }

  function bindTimeScrubber() {
    if (bindTimeScrubber._bound) return;
    bindTimeScrubber._bound = true;

    var scrubber = document.getElementById('time-scrubber-range');
    var display = document.getElementById('time-scrubber-display');
    var resetBtn = document.getElementById('time-reset-btn');

    function updateTimeDisplay() {
      if (!display) return;
      if (state.timeOffsetMin === 0) { display.textContent = 'Now'; return; }
      var sign = state.timeOffsetMin >= 0 ? '+' : '-';
      var abs = Math.abs(state.timeOffsetMin);
      var h = Math.floor(abs / 60);
      var m = abs % 60;
      var then = new Date(Date.now() + state.timeOffsetMin * 60000);
      var hh = String(then.getHours()).padStart(2, '0');
      var mm = String(then.getMinutes()).padStart(2, '0');
      display.textContent = sign + h + 'h ' + m + 'm (' + hh + ':' + mm + ')';
    }

    if (scrubber) {
      scrubber.addEventListener('input', function () {
        state.timeOffsetMin = parseInt(scrubber.value, 10) || 0;
        updateTimeDisplay();
        console.log('[stars] time scrubber \u2192', state.timeOffsetMin, 'min');
        drawSky();
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        state.timeOffsetMin = 0;
        if (scrubber) scrubber.value = '0';
        updateTimeDisplay();
        drawSky();
      });
    }
    updateTimeDisplay();
  }

  var logThrottle = 0;
  function bindPointer() {
    if (!canvas || canvas._ptrBound) return;
    canvas._ptrBound = true;
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';

    var dragging = false, lastX = 0, lastY = 0;

    canvas.addEventListener('pointerdown', function (e) {
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      canvas.style.cursor = 'grabbing';
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      state.rotationAz = ((state.rotationAz + dx * 0.4) % 360 + 360) % 360;
      state.fov = Math.max(40, Math.min(120, state.fov - dy * 0.2));
      if (!logThrottle || performance.now() - logThrottle > 200) {
        logThrottle = performance.now();
        console.log('[stars] drag rotationAz =', state.rotationAz.toFixed(1));
      }
      drawSky();
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      canvas.style.cursor = 'grab';
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      state.fov = Math.max(40, Math.min(120, state.fov + e.deltaY * 0.05));
      drawSky();
    }, { passive: false });
  }

  /* ------------------------------------------------------------------ */
  /* Loop - throttled to ~30 fps                                         */
  /* ------------------------------------------------------------------ */

  var lastFrame = 0;
  function tick(ts) {
    if (!state.active) { state.rafId = null; return; }
    state.rafId = requestAnimationFrame(tick);
    if (ts - lastFrame < 33) return;
    lastFrame = ts;
    if (!canvas || canvas.width === 0) { if (!sizeCanvas()) return; }
    drawSky();
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  function locate() {
    if (!navigator.geolocation) return;
    try {
      navigator.geolocation.getCurrentPosition(function (pos) {
        lat = pos.coords.latitude || 0;
        lon = pos.coords.longitude || 0;
        locationSource = 'GPS ' + lat.toFixed(2) + ', ' + lon.toFixed(2);
        drawSky();
      }, function () {
        locationSource = 'Default (equator)';
      }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
    } catch (e) {}
  }

  function activate() {
    if (!sizeCanvas()) { requestAnimationFrame(activate); return; }
    getCatalog();
    getSegments();
    bindStarsButtons();
    bindTimeScrubber();
    bindPointer();
    state.active = true;
    drawSky();
    drawSky._warned = false;
    if (!state.rafId) {
      lastFrame = 0;
      state.rafId = requestAnimationFrame(tick);
    }
    if (!activate._located) { activate._located = true; locate(); }
  }

  function deactivate() {
    state.active = false;
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
  }

  window.FI.stars = {
    activate: activate,
    deactivate: deactivate,
    init: activate,
    state: state,
    getState: function () { return state; },
    redraw: drawSky
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { activate(); });
  } else {
    activate();
  }
})();
