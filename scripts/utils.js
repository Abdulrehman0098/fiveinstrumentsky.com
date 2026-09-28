/* ============================================================
   utils.js — shared math, formatting, coordinate helpers
   ============================================================ */

const Utils = (() => {
  'use strict';

  const R = 6371000; // Earth mean radius (m)
  const R_MI = 3958.8; // Earth radius (mi)
  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;

  /* ---------- Unit system state ---------- */

  let units = 'metric'; // 'metric' | 'imperial'

  const listeners = new Set();

  function setUnits(u) {
    units = u === 'imperial' ? 'imperial' : 'metric';
    listeners.forEach(fn => fn(units));
  }

  function onUnitsChange(fn) { listeners.add(fn); }
  function offUnitsChange(fn) { listeners.delete(fn); }

  function getUnits() { return units; }

  /* ---------- Unit conversion ---------- */

  function toImperialDistance(m) {
    if (units === 'imperial') return m / 1609.344; // m → mi
    return m;
  }

  function toImperialDistanceFt(m) {
    if (units === 'imperial') return m / 0.3048; // m → ft
    return m;
  }

  function toImperialSpeed(mps) {
    if (units === 'imperial') return mps * 2.23694; // m/s → mph
    return mps;
  }

  function toImperialSpeedFpm(mps) {
    if (units === 'imperial') return mps * 196.85; // m/s → ft/min
    return mps;
  }

  function toImperialAltitude(m) {
    if (units === 'imperial') return m / 0.3048; // m → ft
    return m;
  }

  function toImperialPressure(hpa) {
    if (units === 'imperial') return hpa * 0.02953; // hPa → inHg
    return hpa;
  }

  function toImperialTemp(c) {
    if (units === 'imperial') return c * 9/5 + 32; // °C → °F
    return c;
  }

  function toImperialAccel(ms2) {
    if (units === 'imperial') return ms2 / 0.3048; // m/s² → ft/s²
    return ms2;
  }

  // Pressure: return both metric and imperial strings
  function pressureStr(hpa) {
    const metric = hpa.toFixed(1) + ' hPa';
    if (units === 'imperial') return (hpa * 0.02953).toFixed(2) + ' inHg';
    return metric;
  }

  function altitudeStr(m) {
    if (units === 'imperial') {
      const ft = m / 0.3048;
      return ft.toFixed(1) + ' ft';
    }
    return m.toFixed(1) + ' m';
  }

  function altitudeShort(m) {
    if (units === 'imperial') {
      const ft = m / 0.3048;
      return ft.toFixed(0) + ' ft';
    }
    return m.toFixed(0) + ' m';
  }

  function speedStr(mps) {
    if (units === 'imperial') {
      const mph = mps * 2.23694;
      return mph.toFixed(1) + ' mph';
    }
    return (mps * 3.6).toFixed(1) + ' km/h';
  }

  function distanceStr(m) {
    if (units === 'imperial') {
      const mi = m / 1609.344;
      return mi.toFixed(2) + ' mi';
    }
    const km = m / 1000;
    return km.toFixed(2) + ' km';
  }

  function accelStr(ms2) {
    if (units === 'imperial') {
      return (ms2 / 0.3048).toFixed(2) + ' ft/s²';
    }
    return ms2.toFixed(2) + ' m/s²';
  }

  function accelG(ms2) {
    return ms2 / 9.80665;
  }

  function tempStr(c) {
    const f = c * 9/5 + 32;
    if (units === 'imperial') return f.toFixed(1) + ' °F';
    return c.toFixed(1) + ' °C';
  }

  /* ---------- Format value + unit ---------- */

  function formatUnit(value, type) {
    switch (type) {
      case 'distance': return distanceStr(value);
      case 'speed': return speedStr(value);
      case 'altitude': return altitudeStr(value);
      case 'altitude-short': return altitudeShort(value);
      case 'pressure': return pressureStr(value);
      case 'temperature': return tempStr(value);
      case 'acceleration': return accelStr(value);
      case 'g-force': return (value / 9.80665).toFixed(3) + ' g';
      case 'degrees': return value.toFixed(2) + '°';
      case 'percent': return value.toFixed(1) + '%';
      case 'raw': return value.toFixed(2);
      default: return String(value);
    }
  }

  /* ---------- Time ---------- */

  function getUTCEpochSeconds(date) {
    return date.getTime() / 1000;
  }

  function nowUTC() {
    return new Date();
  }

  function hmsFromSeconds(s) {
    s = ((s % 86400) + 86400) % 86400;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  function minutesSinceMidnight(date) {
    const d = new Date(date);
    return d.getUTCSeconds() / 60 + d.getUTCMinutes() + d.getUTCHours() * 60;
  }

  function timeOfDayLabel(date) {
    const d = new Date(date);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2,'0')} ${ampm} UTC`;
  }

  /* ---------- Smoothing (exponential moving average) ---------- */

  function createSmoother(alpha) {
    let value = 0;
    return function(input) {
      value = value === 0 ? input : value + alpha * (input - value);
      return value;
    };
  }

  function smoothArray(arr, window) {
    if (arr.length < window) return arr.slice();
    const out = [];
    let sum = 0;
    for (let i = 0; i < window; i++) sum += arr[i];
    out.push(sum / window);
    for (let i = window; i < arr.length; i++) {
      sum += arr[i] - arr[i - window];
      out.push(sum / window);
    }
    return out;
  }

  /* ---------- Haversine distance ---------- */

  function haversine(lat1, lon1, lat2, lon2) {
    return haversineDist(lat1, lon1, lat2, lon2);
  }

  function deg2rad(deg) { return deg * DEG; }
  function rad2deg(rad) { return rad * RAD; }

  function haversineDist(lat1, lon1, lat2, lon2) {
    const R_ = R;
    const dLat = (lat2 - lat1) * DEG;
    const dLon = (lon2 - lon1) * DEG;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*DEG) * Math.cos(lat2*DEG) * Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R_ * c;
  }

  /* ---------- Clamp, lerp, map ---------- */

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function mapRange(v, inLo, inHi, outLo, outHi) {
    const t = (v - inLo) / (inHi - inLo);
    return lerp(outLo, outHi, clamp(t, 0, 1));
  }

  /* ---------- Canvas helpers ---------- */

  function resizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h, dpr, cssW: rect.width, cssH: rect.height };
  }

  function clearCanvas(ctx, w, h, color) {
    ctx.fillStyle = color || '#060912';
    ctx.fillRect(0, 0, w, h);
  }

  /* ---------- Math constants ---------- */

  const TWO_PI = 2 * Math.PI;
  const PI = Math.PI;

  /* ---------- Angle normalization ---------- */

  function normAngle(deg) {
    return ((deg % 360) + 360) % 360;
  }

  function normRad(rad) {
    return ((rad % TWO_PI) + TWO_PI) % TWO_PI;
  }

  /* ---------- Mean of circular quantities ---------- */

  function meanAngle(degArray) {
    if (degArray.length === 0) return 0;
    let sumSin = 0, sumCos = 0;
    for (const d of degArray) {
      const r = d * DEG;
      sumSin += Math.sin(r);
      sumCos += Math.cos(r);
    }
    return Math.atan2(sumSin, sumCos) * RAD;
  }

  /* ---------- Detect spikes ---------- */

  function detectSpike(history, threshold, window) {
    if (history.length < window) return null;
    const recent = history.slice(-window);
    const mean = recent.reduce((a,b) => a+b, 0) / recent.length;
    const std = Math.sqrt(recent.reduce((a,b) => a + (b-mean)**2, 0) / recent.length);
    const latest = history[history.length - 1];
    if (std > 1e-9 && (latest - mean) > threshold * std) {
      return { value: latest, mean, std, time: performance.now() };
    }
    return null;
  }

  /* ---------- Format distance (latitude/longitude) ---------- */

  function formatLatLon(lat, lon, digits) {
    digits = digits || 6;
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(digits)}°${latDir}, ${Math.abs(lon).toFixed(digits)}°${lonDir}`;
  }

  /* ---------- Cross-browser event Listener options ---------- */

  function addListener(el, event, handler, opts) {
    if (opts && opts.passive === false && el.setPointerCapture) {
      // For touch events needing preventDefault, use addEventListener with passive:false
      el.addEventListener(event, handler, opts);
    } else {
      el.addEventListener(event, handler, opts || false);
    }
  }

  return {
    setUnits,
    onUnitsChange,
    offUnitsChange,
    getUnits,
    toImperialDistance,
    toImperialDistanceFt,
    toImperialSpeed,
    toImperialSpeedFpm,
    toImperialAltitude,
    toImperialPressure,
    toImperialTemp,
    toImperialAccel,
    pressureStr,
    altitudeStr,
    altitudeShort,
    speedStr,
    distanceStr,
    accelStr,
    accelG,
    tempStr,
    formatUnit,
    getUTCEpochSeconds,
    nowUTC,
    hmsFromSeconds,
    minutesSinceMidnight,
    timeOfDayLabel,
    createSmoother,
    smoothArray,
    haversineDist,
    clamp,
    lerp,
    mapRange,
    resizeCanvas,
    clearCanvas,
    TWO_PI,
    PI,
    DEG,
    RAD,
    R,
    R_MI,
    normAngle,
    normRad,
    meanAngle,
    detectSpike,
    formatLatLon,
    haversine,
    haversineDist,
    deg2rad,
    rad2deg,
    addListener,
  };
})();

export default Utils;
