#!/usr/bin/env python3
"""Build all core JS files for FIELD INSTRUMENTS — classic scripts only."""

import os

# Ensure directories exist
os.makedirs('scripts/data', exist_ok=True)
os.makedirs('scripts/lib', exist_ok=True)
os.makedirs('scripts/instruments', exist_ok=True)
os.makedirs('tests', exist_ok=True)

###############################################################################
# scripts/utils.js
###############################################################################
utils_js = r'''/* ============================================================
   utils.js — Pure utility functions, no DOM
   All functions pure math where possible.
   fitCanvas is the ONLY HiDPI routine.
   ============================================================ */

window.FI = window.FI || {};

(function() {
'use strict';

var utils = window.FI.utils = {};

// ---- Math helpers ----

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}
utils.clamp = clamp;

function lerp(a, b, t) {
  return a + (b - a) * t;
}
utils.lerp = lerp;

function mapRange(v, inLo, inHi, outLo, outHi) {
  if (inHi === inLo) return outLo;
  return outLo + ((v - inLo) / (inHi - inLo)) * (outHi - outLo);
}
utils.mapRange = mapRange;

function wrapDeg(d) {
  d = d % 360;
  if (d < 0) d += 360;
  return d;
}
utils.wrapDeg = wrapDeg;

function wrapPi(r) {
  r = r % (2 * Math.PI);
  if (r < 0) r += 2 * Math.PI;
  return r;
}
utils.wrapPi = wrapPi;

function deg2rad(d) { return d * Math.PI / 180; }
utils.deg2rad = deg2rad;

function rad2deg(r) { return r * 180 / Math.PI; }
utils.rad2deg = rad2deg;

// Haversine distance in km
function haversine(lat1, lon1, lat2, lon2) {
  var R = 6371;
  var dLat = deg2rad(lat2 - lat1);
  var dLon = deg2rad(lon2 - lon1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
utils.haversine = haversine;

// ---- Safe formatting ----

function formatSafe(v) {
  if (v === null || v === undefined || typeof v === 'number' && (isNaN(v) || !isFinite(v))) {
    return '\u2014';
  }
  return v;
}
utils.formatSafe = formatSafe;

// Unit kinds: 'length', 'pressure', 'temperature', 'velocity', 'accel'
function formatUnit(value, kind, system) {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return '\u2014';
  var v = value;
  var unit = '';
  switch (kind) {
    case 'length':
      if (system === 'imperial') { v = v * 3.28084; unit = 'ft'; }
      else { unit = 'm'; }
      break;
    case 'altitude':
      if (system === 'imperial') { v = v * 3.28084; unit = 'ft'; }
      else { unit = 'm'; }
      break;
    case 'pressure':
      if (system === 'imperial') { v = v * 0.02953; unit = 'inHg'; }
      else { unit = 'hPa'; }
      break;
    case 'temperature':
      if (system === 'imperial') { v = v * 9 / 5 + 32; unit = '\u00b0F'; }
      else { unit = '\u00b0C'; }
      break;
    case 'velocity':
      if (system === 'imperial') { v = v * 3.28084; unit = 'ft/s'; }
      else { unit = 'm/s'; }
      break;
    case 'accel':
      if (system === 'imperial') { v = v / 9.80665; unit = 'g'; }
      else { unit = 'm/s\u00b2'; }
      break;
    default:
      unit = '';
  }
  if (typeof v === 'number') {
    if (Math.abs(v) >= 1000) return v.toFixed(0) + ' ' + unit;
    if (Math.abs(v) >= 100) return v.toFixed(1) + ' ' + unit;
    if (Math.abs(v) >= 10) return v.toFixed(1) + ' ' + unit;
    return v.toFixed(2) + ' ' + unit;
  }
  return v + ' ' + unit;
}
utils.formatUnit = formatUnit;

// ---- EMA (exponential moving average) ----

function EMA(alpha) {
  this.alpha = alpha;
  this.value = null;
  this.initialized = false;
}
EMA.prototype.update = function(v) {
  if (!this.initialized) { this.value = v; this.initialized = true; return v; }
  this.value = this.value + this.alpha * (v - this.value);
  return this.value;
};
EMA.prototype.get = function() { return this.initialized ? this.value : null; };
EMA.prototype.reset = function() { this.value = null; this.initialized = false; };

// ---- OneEuro filter (low-pass with frequency-dependent cutoff) ----

function OneEuro(freq, minCutoff) {
  this.freq = freq || 60;
  this.minCutoff = minCutoff || 0.5;
  this.xPrev = null;
  this.dxPrev = null;
  this.xSmooth = null;
  this.dxSmooth = null;
}
OneEuro.prototype.update = function(x) {
  var dt = 1 / this.freq;
  if (this.xPrev === null) {
    this.xPrev = x;
    this.dxPrev = 0;
    this.xSmooth = x;
    this.dxSmooth = 0;
    return x;
  }
  var dx = (x - this.xPrev) / dt;
  this.xPrev = x;
  var sigma = Math.sqrt(dt) / (0.003 + dt);
  var cutoff = Math.sqrt(this.minCutoff * this.minCutoff + sigma * sigma);
  var alpha = this.freq / cutoff / (2 * Math.PI) + 1;
  alpha = 1 / alpha;
  this.dxSmooth = this.dxSmooth + alpha * (dx - this.dxSmooth);
  this.xSmooth = this.xSmooth + alpha * (x - this.xSmooth);
  return this.xSmooth;
};
OneEuro.prototype.get = function() { return this.xSmooth; };
OneEuro.prototype.reset = function() { this.xPrev = null; this.dxPrev = null; this.xSmooth = null; this.dxSmooth = null; };

// ---- RingBuffer ----

function RingBuffer(max) {
  this.max = max || 60;
  this.buf = new Array(this.max);
  this.head = 0;
  this.count = 0;
}
RingBuffer.prototype.push = function(v) {
  this.buf[this.head] = v;
  this.head = (this.head + 1) % this.max;
  if (this.count < this.max) this.count++;
};
RingBuffer.prototype.get = function(i) {
  if (i < 0 || i >= this.count) return null;
  return this.buf[(this.head - this.count + i + this.max) % this.max];
};
RingBuffer.prototype.toArray = function() {
  var a = [];
  for (var i = 0; i < this.count; i++) a.push(this.get(i));
  return a;
};
RingBuffer.prototype.clear = function() { this.head = 0; this.count = 0; };
RingBuffer.prototype.average = function() {
  if (this.count === 0) return 0;
  var sum = 0;
  for (var i = 0; i < this.count; i++) sum += this.get(i);
  return sum / this.count;
};

// ---- Throttle / Debounce ----

function throttle(fn, ms) {
  var last = 0;
  var timer = null;
  return function() {
    var now = Date.now();
    var remaining = ms - (now - last);
    if (remaining <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      last = now;
      return fn.apply(this, arguments);
    }
    if (!timer) {
      timer = setTimeout(function() {
        last = Date.now();
        timer = null;
        fn.apply(utils._context || this, utils._args || []);
      }, remaining);
    }
  };
}
// Note: proper throttle with context is complex; use debounce for most UI cases

function debounce(fn, ms) {
  var timer = null;
  return function() {
    var ctx = this;
    var args = arguments;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function() { fn.apply(ctx, args); }, ms);
  };
}
utils.debounce = debounce;

// ---- Storage (try/catch wrapped) ----

var storage = {
  get: function(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v !== null ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set: function(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
};
utils.storage = storage;

// ---- DOM tween (for theme transitions etc) ----

function tween(el, to, duration) {
  duration = duration || 150;
  if (!el || !el.style) return;
  var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    for (var k in to) el.style[k] = to[k];
    return;
  }
  var from = {};
  for (var k in to) {
    var cs = window.getComputedStyle(el);
    from[k] = cs[k] || '';
  }
  var start = Date.now();
  function frame() {
    var t = Math.min((Date.now() - start) / duration, 1);
    for (var k in to) {
      if (typeof to[k] === 'number') {
        el.style[k] = (t * (to[k] - parseFloat(from[k] || 0)) + parseFloat(from[k] || 0)) + 'px';
      } else {
        el.style[k] = to[k];
      }
    }
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
utils.rtween = tween;

// ---- HiDPI canvas setup (the ONLY routine that touches dpr) ----

function fitCanvas(canvas) {
  if (!canvas || !canvas.getBoundingClientRect) return null;
  var rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  var dpr = Math.min(window.devicePixelRatio || 1, 3);
  var w = Math.round(rect.width * dpr);
  var h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  var ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx: ctx, w: rect.width, h: rect.height, dpr: dpr };
}
utils.fitCanvas = fitCanvas;

// ---- Canvas resize observer ----

function observeCanvas(canvas, cb) {
  if (!canvas || !cb) return;
  var ro = new ResizeObserver(function() { cb(); });
  ro.observe(canvas);
  // Store observer on canvas for cleanup
  canvas._fi_ro = ro;
  // Also listen to window resize as fallback
  var handler = function() { cb(); };
  canvas._fi_resizeHandler = handler;
  window.addEventListener('resize', handler);
}
utils.observeCanvas = observeCanvas;

// ---- Unobserve canvas ----

function unobserveCanvas(canvas) {
  if (!canvas) return;
  if (canvas._fi_ro) { canvas._fi_ro.disconnect(); canvas._fi_ro = null; }
  if (canvas._fi_resizeHandler) {
    window.removeEventListener('resize', canvas._fi_resizeHandler);
    canvas._fi_resizeHandler = null;
  }
}
utils.unobserveCanvas = unobserveCanvas;

// ---- Build info ----

utils.buildInfo = {
  version: '1.0.0',
  build: 'file://-native',
  date: new Date().toISOString().slice(0, 10),
  platform: navigator.platform || 'unknown',
  ua: navigator.userAgent.slice(0, 80)
};

})();
'''

with open('scripts/utils.js', 'w') as f:
    f.write(utils_js)

print('Wrote scripts/utils.js')
