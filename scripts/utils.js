/* ============================================================
   utils.js — pure helpers, fitCanvas, observeCanvas
   No DOM side effects at import time.
   ============================================================ */

/* ---------- Pure math ---------- */
export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mapRange = (v, a, b, c, d) => c + (v - a) * (d - c) / (b - a || 1e-9);
export const wrapDeg = (v) => { const r = v % 360; return r < 0 ? r + 360 : r; };
export const wrapPi = (v) => { const r = v % (2 * Math.PI); return r < 0 ? r + 2 * Math.PI : r; };
export const deg2rad = (d) => d * Math.PI / 180;
export const rad2deg = (r) => r * 180 / Math.PI;
export const haversineKm = (lat1, lon1, lat2, lon2) => {
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/* ---------- Unit formatting ---------- */
const M_PER_FT = 0.3048;
const HPA_PER_INHG = 33.8639;
export function formatUnit(value, kind, system = "metric") {
  if (value == null || !isFinite(value)) return "—";
  switch (kind) {
    case "length": {
      const m = value;
      if (system === "imperial") return (m / M_PER_FT).toFixed(1) + " ft";
      return m.toFixed(1) + " m";
    }
    case "lengthShort": {
      const m = value;
      if (system === "imperial") return (m / M_PER_FT).toFixed(1) + " ft";
      return m.toFixed(0) + " m";
    }
    case "speed": {
      const ms = value;
      if (system === "imperial") return (ms * 3.28084).toFixed(1) + " ft/s";
      return (ms * 3.6).toFixed(1) + " km/h";
    }
    case "speedShort": {
      const ms = value;
      if (system === "imperial") return (ms * 3.28084).toFixed(1) + " ft/s";
      return ms.toFixed(1) + " m/s";
    }
    case "accel": {
      const ms2 = value;
      if (system === "imperial") return (ms2 / 9.80665).toFixed(3) + " g";
      return ms2.toFixed(2) + " m/s²";
    }
    case "pressure": {
      const hpa = value;
      if (system === "imperial") return (hpa / HPA_PER_INHG).toFixed(2) + " inHg";
      return hpa.toFixed(1) + " hPa";
    }
    case "pressureShort": {
      const hpa = value;
      if (system === "imperial") return (hpa / HPA_PER_INHG).toFixed(2) + " inHg";
      return hpa.toFixed(1) + " hPa";
    }
    case "temp": {
      const c = value;
      if (system === "imperial") return (c * 9 / 5 + 32).toFixed(1) + " °F";
      return c.toFixed(1) + " °C";
    }
    case "db": {
      return value.toFixed(1) + " dB";
    }
    case "microtesla": {
      return value.toFixed(2) + " µT";
    }
    case "mstotal": {
      const m = value;
      if (system === "imperial") return (m / 1609.344).toFixed(3) + " mi";
      return m.toFixed(1) + " m";
    }
    case "alt": {
      const m = value;
      if (system === "imperial") return (m / M_PER_FT).toFixed(1) + " ft";
      return m.toFixed(0) + " m";
    }
    case "deg": {
      const d = value;
      const dir = ["N","NE","E","SE","S","SW","W","NW"][Math.round(wrapDeg(d) / 45) % 8];
      return d.toFixed(1) + "° " + dir;
    }
    default:
      return String(value);
  }
}

export function formatSafe(value) {
  if (value === null || value === undefined || !isFinite(value)) return "—";
  return String(value);
}

/* ---------- Smoothing ---------- */
export class EMA {
  constructor(alpha = 0.5) { this.alpha = alpha; this.value = 0; this.initialized = false; }
  update(v) {
    if (!this.initialized) { this.value = v; this.initialized = true; return v; }
    this.value = this.alpha * v + (1 - this.alpha) * this.value;
    return this.value;
  }
  get() { return this.initialized ? this.value : 0; }
  reset() { this.value = 0; this.initialized = false; }
}

export class OneEuroFilter {
  constructor(minCutoff = 0.2, beta = 1.0) {
    this.x = new EMA(1 - Math.exp(-2 * Math.PI * minCutoff));
    this.dx = new EMA(1 - Math.exp(-2 * Math.PI * (minCutoff + beta)));
    this.lastTime = 0;
    this.prevX = 0;
    this.initialized = false;
  }
  update(x, ts) {
    if (!this.initialized) { this.prevX = x; this.initialized = true; return x; }
    const dt = ts === 0 ? 0.01 : 1 / ts;
    const est = this.x.update(x);
    const edx = this.dx.update((x - this.prevX) / dt);
    this.prevX = x;
    return est;
  }
}

/* ---------- Ring buffer ---------- */
export class RingBuffer {
  constructor(capacity) { this.capacity = capacity; this.buf = new Array(capacity); this.len = 0; this.pos = 0; }
  push(v) { this.buf[this.pos] = v; this.pos = (this.pos + 1) % this.capacity; if (this.len < this.capacity) this.len++; }
  get(i) { if (this.len === 0) return null; const idx = (this.pos - this.len + i + this.capacity) % this.capacity; return this.buf[idx]; }
  getLast() { return this.len === 0 ? null : this.buf[(this.pos - 1 + this.capacity) % this.capacity]; }
  clear() { this.len = 0; this.pos = 0; this.buf.fill(0); }
  toArray() { const a = new Array(this.len); for (let i = 0; i < this.len; i++) a[i] = this.get(i); return a; }
  get max() { if (this.len === 0) return 0; let m = -Infinity; for (let i = 0; i < this.len; i++) { const v = this.get(i); if (isFinite(v) && v > m) m = v; } return m; }
  get min() { if (this.len === 0) return 0; let m = Infinity; for (let i = 0; i < this.len; i++) { const v = this.get(i); if (isFinite(v) && v < m) m = v; } return m; }
  get mean() { if (this.len === 0) return 0; let s = 0; for (let i = 0; i < this.len; i++) s += this.get(i); return s / this.len; }
}

/* ---------- Throttle/debounce ---------- */
export function throttle(fn, ms) {
  let last = 0, pending = null;
  return (...args) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) { last = now; fn(...args); }
    else if (!pending) { pending = setTimeout(() => { last = Date.now(); pending = null; fn(...args); }, remaining); }
  };
}

export function debounce(fn, ms) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------- Safe storage ---------- */
export const safeStorage = {
  get(key, def) {
    try {
      const v = localStorage.getItem(key);
      if (v == null) return def;
      return JSON.parse(v);
    } catch (_) { return def; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (_) { return false; }
  }
};

/* ---------- Tween ---------- */
export function tween(el, from, to, dur = 150, opts = {}) {
  if (!el) return;
  const start = performance.now();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) { el.textContent = to; return; }
  (function step(t) {
    const p = clamp((t - start) / dur, 0, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (from + (to - from) * eased).toFixed(opts.decimals ?? 1);
    if (p < 1) requestAnimationFrame(step);
  })(start);
}

/* ---------- Format number with fixed decimals ---------- */
export function fmtNum(v, decimals = 1) {
  if (v == null || !isFinite(v)) return "—";
  return Number(v.toFixed(decimals));
}

/* ---------- Angle helpers ---------- */
export function angleDelta(a, b) {
  let d = wrapDeg(b - a);
  if (d > 180) d -= 360;
  return d;
}
export function absAngleDelta(a, b) {
  return Math.abs(angleDelta(a, b));
}

/* ---------- Unique id ---------- */
export let uid = 0;
export function uidGen() { return "fi-" + (uid++); }

/* ============================================================
   fitCanvas — THE canonical HiDPI routine.
   Reads getBoundingClientRect; if 0x0 (hidden) returns null.
   Sets canvas.width/height to rect * dpr (capped at 3).
   Uses ctx.setTransform(dpr,0,0,dpr,0,0) — NOT ctx.scale.
   Returns { ctx, w (CSS px), h (CSS px), dpr }.
   ============================================================ */
export function fitCanvas(canvas) {
  if (!canvas || !canvas.getContext) return null;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (w <= 0 || h <= 0) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { ctx, w, h, dpr };
}

/* ============================================================
   observeCanvas — ResizeObserver per canvas + window resize
   fallback. Re-runs fitCanvas and calls cb whenever the
   canvas size changes.
   ============================================================ */
const activeObservers = new WeakMap();

export function observeCanvas(canvas, cb, opts = {}) {
  if (!canvas) return;
  if (activeObservers.has(canvas)) {
    const obs = activeObservers.get(canvas);
    obs.disconnect();
  }
  const debouncedCb = debounce(() => {
    if (!document.contains(canvas)) return;
    const info = fitCanvas(canvas);
    if (info) cb(info);
  }, 60);
  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => debouncedCb());
    ro.observe(canvas);
  } else {
    window.addEventListener("resize", debouncedCb);
  }
  const info = fitCanvas(canvas);
  if (info) cb(info);
  activeObservers.set(canvas, {
    disconnect() {
      if (ro) try { ro.disconnect(); } catch (_) {}
      window.removeEventListener("resize", debouncedCb);
      activeObservers.delete(canvas);
    }
  });
}
