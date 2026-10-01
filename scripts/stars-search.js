/* ============================================================
   stars-search.js — search filtering, map highlighting and
   click-to-info for the Star Finder.

   Sits alongside scripts/instruments/stars.js rather than inside
   it, so the working star module is not rewritten. It reuses the
   projection that stars.js already leaves on window.FI.stars.geom
   instead of duplicating the astronomy.

   Features
   - Type-to-filter over name / constellation / Bayer designation
   - Matching star pulses with a ring on the circular map
   - Click (or tap) near a star to open a detail panel
   - Escape / X to dismiss

   Classic IIFE, no imports. Exposes window.FI.starsUI.
   ============================================================ */

(function () {
  'use strict';

  var D2R = Math.PI / 180;

  var HIT_RADIUS = 14;      // px: click tolerance around a star
  var PULSE_MS = 2600;      // how long a searched star keeps pulsing

  var input, clearBtn, resultEl, panel, panelBody, closeBtn;
  var selected = null;      // star currently highlighted / shown
  var pulseUntil = 0;       // timestamp; drives the pulse animation
  var pulseRaf = null;
  var lastResults = [];
  var activeIndex = -1;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */

  function geom() {
    return (window.FI && window.FI.stars && window.FI.stars.geom) || null;
  }

  function catalog() {
    return (window.FI && window.FI.stars && window.FI.stars.getCatalog()) || [];
  }

  function redraw() {
    if (window.FI && window.FI.stars && window.FI.stars.redraw) {
      window.FI.stars.redraw();
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtCoord(v, digits) {
    return (typeof v === 'number' && isFinite(v)) ? v.toFixed(digits) : '\u2014';
  }

  // Current alt/az for a star, using the same inputs the map uses.
  function altAzOf(star) {
    var g = geom();
    if (!g || !window.FI.stars || !window.FI.stars.altAz) return null;
    try {
      return window.FI.stars.altAz(star.ra, star.dec, g.lat, g.lst);
    } catch (e) { return null; }
  }

  // Screen position of a star, or null when below the horizon.
  function screenPos(star) {
    var g = geom();
    if (!g || !window.FI.stars || !window.FI.stars.project) return null;
    try {
      return window.FI.stars.project(star, g.cx, g.cy, g.radius, g.lst);
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------------ */
  /* Info panel                                                         */
  /* ------------------------------------------------------------------ */

  function openPanel(star, opts) {
    if (!panel || !panelBody) return;
    var stellar = (window.FI_STELLAR && window.FI_STELLAR.lookup)
      ? window.FI_STELLAR.lookup(star) : null;
    var aa = altAzOf(star);

    var colour = stellar ? stellar.rgb : '#ffffff';
    var colourName = stellar ? stellar.colorName : 'Unknown';
    var sptype = stellar && stellar.sptype ? stellar.sptype : '\u2014';

    var azTxt = aa ? fmtCoord(aa.az, 1) + '\u00b0' : '\u2014';
    var altTxt = aa ? (aa.alt >= 0 ? '+' : '') + fmtCoord(aa.alt, 1) + '\u00b0' : '\u2014';
    var visibility = !aa ? 'Unknown'
      : (aa.alt > 0 ? 'Above horizon' : 'Below horizon');

    var rows = [
      ['Constellation', esc(star.con || '\u2014')],
      ['Spectral type', esc(sptype)],
      ['Azimuth', esc(azTxt)],
      ['Altitude', esc(altTxt)],
      ['Magnitude', esc(fmtCoord(star.mag, 2))],
      ['Visibility', esc(visibility)]
    ];

    var html = '' +
      '<div class="star-info-head">' +
        '<span class="star-info-dot" style="background:' + colour + ';box-shadow:0 0 12px ' + colour + '"></span>' +
        '<div>' +
          '<h3 class="star-info-name">' + esc(star.name) + '</h3>' +
          '<p class="star-info-sub">' + esc(star.bayer || '') +
            (star.bayer ? ' \u00b7 ' : '') + esc(star.con || '') + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="star-info-swatch-row">' +
        '<span class="star-info-swatch" style="background:' + colour + '"></span>' +
        '<span class="star-info-colour">' + esc(colourName) + '</span>' +
      '</div>' +
      '<dl class="star-info-grid">' +
        rows.map(function (r) {
          return '<div class="star-info-row"><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
        }).join('') +
      '</dl>';

    panelBody.innerHTML = html;
    panel.removeAttribute('hidden');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function closePanel() {
    if (!panel) return;
    panel.setAttribute('hidden', '');
    selected = null;
    pulseUntil = 0;
    redraw();
  }

  function isPanelOpen() {
    return panel && !panel.hasAttribute('hidden');
  }

  /* ------------------------------------------------------------------ */
  /* Highlight / pulse                                                  */
  /* ------------------------------------------------------------------ */

  function highlight(star, opts) {
    selected = star;
    if (star) {
      pulseUntil = performance.now() + PULSE_MS;
      startPulse();
    } else {
      pulseUntil = 0;
    }
    redraw();
    if (star && (!opts || opts.openPanel !== false)) openPanel(star);
  }

  // The map is on a ~30fps rAF loop while active, but it stops when the
  // panel is hidden. Drive our own short-lived loop so the pulse is
  // visible even in that case.
  function startPulse() {
    if (pulseRaf) return;
    function step() {
      if (performance.now() > pulseUntil || !selected) {
        pulseRaf = null;
        redraw();
        return;
      }
      redraw();
      pulseRaf = requestAnimationFrame(step);
    }
    pulseRaf = requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------ */
  /* Search                                                             */
  /* ------------------------------------------------------------------ */

  function renderResults(list, query) {
    lastResults = list;
    activeIndex = -1;

    if (!query) {
      resultEl.textContent = '';
      resultEl.removeAttribute('data-state');
      if (input) input.setAttribute('aria-expanded', 'false');
      return;
    }

    if (!list.length) {
      resultEl.textContent = 'No match for \u201c' + query + '\u201d';
      resultEl.setAttribute('data-state', 'empty');
      if (input) input.setAttribute('aria-expanded', 'false');
      return;
    }

    var html = list.map(function (r, i) {
      var s = r.star;
      var stellar = (window.FI_STELLAR && window.FI_STELLAR.lookup)
        ? window.FI_STELLAR.lookup(s) : null;
      var dot = stellar ? stellar.rgb : '#fff';
      return '<button type="button" class="search-hit" data-index="' + i + '" role="option">' +
        '<span class="search-hit-dot" style="background:' + dot + '"></span>' +
        '<span class="search-hit-name">' + esc(s.name) + '</span>' +
        '<span class="search-hit-con">' + esc(s.con || '') + '</span>' +
        '<span class="search-hit-mag">' + fmtCoord(s.mag, 2) + '</span>' +
      '</button>';
    }).join('');

    resultEl.innerHTML = html;
    resultEl.setAttribute('data-state', 'results');
    if (input) input.setAttribute('aria-expanded', 'true');
  }

  function runSearch() {
    var q = input ? input.value : '';
    if (clearBtn) {
      if (q) clearBtn.removeAttribute('hidden');
      else clearBtn.setAttribute('hidden', '');
    }
    var list = (window.FI_STELLAR && window.FI_STELLAR.search)
      ? window.FI_STELLAR.search(q, catalog(), 6) : [];
    renderResults(list, q.trim());

    if (q.trim() && list.length) {
      // Auto-highlight the best match as the user types.
      highlight(list[0].star, { openPanel: false });
    } else if (!q.trim()) {
      selected = null;
      pulseUntil = 0;
      closePanel();
      redraw();
    }
  }

  function clearSearch() {
    if (input) input.value = '';
    if (clearBtn) clearBtn.setAttribute('hidden', '');
    lastResults = [];
    activeIndex = -1;
    renderResults([], '');
    selected = null;
    pulseUntil = 0;
    closePanel();
    redraw();
    if (input) input.focus();
  }

  /* ------------------------------------------------------------------ */
  /* Click-to-info                                                      */
  /* ------------------------------------------------------------------ */

  function nearestStar(clientX, clientY) {
    var canvas = document.getElementById('stars-canvas');
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    // Canvas CSS pixels -> our projection coordinate space.
    var sx = (clientX - rect.left) * (W() / rect.width);
    var sy = (clientY - rect.top) * (H() / rect.height);

    var g = geom();
    if (!g) return null;

    var best = null, bestD = Infinity;
    var list = catalog();
    for (var i = 0; i < list.length; i++) {
      var p = screenPos(list[i]);
      if (!p) continue;
      var dx = p.x - sx, dy = p.y - sy;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = list[i]; }
    }
    if (!best || bestD > HIT_RADIUS) return null;
    return { star: best, dist: bestD };
  }

  function W() {
    var g = geom();
    return g && g.cssW ? g.cssW : 0;
  }
  function H() {
    var g = geom();
    return g && g.cssH ? g.cssH : 0;
  }

  function bindCanvas() {
    var canvas = document.getElementById('stars-canvas');
    if (!canvas || canvas._clickBound) return;
    canvas._clickBound = true;

    var downX = 0, downY = 0, downT = 0, moved = false;

    canvas.addEventListener('pointerdown', function (e) {
      downX = e.clientX; downY = e.clientY;
      downT = performance.now();
      moved = false;
    });

    canvas.addEventListener('pointermove', function (e) {
      // Any real drag is a sky rotation, not a click.
      if (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6) {
        moved = true;
      }
      if (moved || e.pointerType !== 'mouse') return;
      // Hover affordance: show a pointer when over a star.
      var hit = nearestStar(e.clientX, e.clientY);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
    });

    canvas.addEventListener('pointerup', function (e) {
      var dt = performance.now() - downT;
      if (moved || dt > 600) return;
      var hit = nearestStar(e.clientX, e.clientY);
      if (hit) {
        highlight(hit.star);
      } else if (isPanelOpen()) {
        closePanel();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Keyboard                                                           */
  /* ------------------------------------------------------------------ */

  function bindKeyboard() {
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (!lastResults.length) {
          if (e.key === 'Escape') clearSearch();
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          activeIndex = Math.min(activeIndex + 1, lastResults.length - 1);
          syncActive();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          activeIndex = Math.max(activeIndex - 1, 0);
          syncActive();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          var pick = lastResults[activeIndex > -1 ? activeIndex : 0];
          if (pick) highlight(pick.star);
        } else if (e.key === 'Escape') {
          clearSearch();
        }
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isPanelOpen()) closePanel();
    });
  }

  function syncActive() {
    if (!resultEl) return;
    var hits = resultEl.querySelectorAll('.search-hit');
    for (var i = 0; i < hits.length; i++) {
      var on = i === activeIndex;
      hits[i].classList.toggle('active', on);
      if (on) highlight(lastResults[i].star, { openPanel: false });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Public draw hook                                                   */
  /* ------------------------------------------------------------------ */

  // Called by stars.js at the end of every drawSky().
  function overlay(c, ctx, g) {
    if (!selected) return;

    var p = screenPos(selected);
    if (!p) return;

    var now = performance.now();
    var pulsing = now < pulseUntil;
    var t = pulsing ? (1 - (pulseUntil - now) / PULSE_MS) : 0;

    ctx.save();

    // Soft halo
    var halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 34);
    halo.addColorStop(0, 'rgba(255,215,0,0.30)');
    halo.addColorStop(1, 'rgba(255,215,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 34, 0, 6.2832);
    ctx.fill();

    // Ring: expands and fades while pulsing, then holds steady.
    var ringR = pulsing ? (10 + t * 16) : 11;
    ctx.strokeStyle = pulsing
      ? 'rgba(255,215,0,' + (0.85 * (1 - t)) + ')'
      : 'rgba(255,215,0,0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ringR, 0, 6.2832);
    ctx.stroke();

    // Crosshair ticks
    ctx.strokeStyle = 'rgba(255,215,0,0.75)';
    ctx.lineWidth = 1.2;
    var tick = 7;
    ctx.beginPath();
    ctx.moveTo(p.x - ringR - tick, p.y); ctx.lineTo(p.x - ringR, p.y);
    ctx.moveTo(p.x + ringR, p.y);        ctx.lineTo(p.x + ringR + tick, p.y);
    ctx.moveTo(p.x, p.y - ringR - tick); ctx.lineTo(p.x, p.y - ringR);
    ctx.moveTo(p.x, p.y + ringR);        ctx.lineTo(p.x, p.y + ringR + tick);
    ctx.stroke();

    // Name tag
    ctx.font = '600 11px "Inter", ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var label = selected.name || '';
    var tw = ctx.measureText(label).width;
    var ly = p.y - ringR - 22;
    ctx.fillStyle = 'rgba(6,9,18,0.88)';
    ctx.beginPath();
    var bw = tw + 16, bh = 18, bx = p.x - bw / 2, by = ly - bh / 2;
    if (ctx.roundRect) {
      ctx.roundRect(bx, by, bw, bh, 6);
    } else {
      ctx.rect(bx, by, bw, bh);
    }
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,0,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffd700';
    ctx.fillText(label, p.x, ly);

    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                               */
  /* ------------------------------------------------------------------ */

  function init() {
    input = document.getElementById('star-search-input');
    clearBtn = document.getElementById('star-search-clear');
    resultEl = document.getElementById('stars-search-result');
    panel = document.getElementById('stars-info-panel');
    panelBody = document.getElementById('stars-info-body');
    closeBtn = document.getElementById('stars-info-close');

    if (!input || !resultEl) return;

    input.addEventListener('input', runSearch);

    if (clearBtn) {
      clearBtn.addEventListener('click', function (e) {
        e.preventDefault();
        clearSearch();
      });
    }

    if (resultEl) {
      resultEl.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.search-hit') : null;
        if (!btn) return;
        var idx = parseInt(btn.getAttribute('data-index'), 10);
        var pick = lastResults[idx];
        if (pick) highlight(pick.star);
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', closePanel);

    bindCanvas();
    bindKeyboard();

    // Register the draw hook so the highlight is painted on top of the
    // star field. Set after DOM ready; stars.js re-reads it each frame.
    window.FI = window.FI || {};
    window.FI.stars = window.FI.stars || {};
    window.FI.stars.drawOverlay = overlay;
  }

  window.FI = window.FI || {};
  window.FI.starsUI = {
    init: init,
    highlight: highlight,
    clear: clearSearch,
    closePanel: closePanel,
    nearestStar: nearestStar,
    overlay: overlay,
    getSelected: function () { return selected; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
