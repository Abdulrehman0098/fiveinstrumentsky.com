/* ============================================================
   astronomy.js — pure astronomy engine, no DOM, no globals.
   ============================================================ */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const J2000 = 2451545.0;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function normDeg(v) { const r = v % 360; return r < 0 ? r + 360 : r; }

function julianDateFromDate(d) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (m <= 2) {
    const d2 = new Date(Date.UTC(y - 1, 11, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
    return julianDateFromDate(d2);
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const hr = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + hr / 24 + B - 1524.5;
}

export function julianDate(dateOrMs) {
  if (typeof dateOrMs === 'number') return julianDateFromDate(new Date(dateOrMs));
  return julianDateFromDate(dateOrMs instanceof Date ? dateOrMs : new Date(dateOrMs));
}

function julianCenturies(jd) { return (jd - J2000) / 36525; }

export function gmstDeg(jd) {
  const T = julianCenturies(jd);
  return normDeg(280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * T * T - T * T * T / 38710000);
}

export function lstDeg(jd, lonEastDeg) {
  return normDeg(gmstDeg(jd) + lonEastDeg);
}

export function equatorialToHorizontal(raDeg, decDeg, latDeg, lstDegVal) {
  const lata = latDeg * DEG;
  const deca = decDeg * DEG;
  const lha = (lstDegVal - raDeg) * DEG;
  const sinAlt = Math.sin(deca) * Math.sin(lata) + Math.cos(deca) * Math.cos(lata) * Math.cos(lha);
  const alt = Math.asin(clamp(sinAlt, -1, 1));
  let az;
  const cosLat = Math.cos(lata);
  if (Math.abs(cosLat) < 1e-12) {
    az = 0;
  } else {
    const tanDec = Math.tan(deca);
    const y = Math.sin(lha);
    const x = Math.cos(lha) * Math.sin(lata) - tanDec * cosLat;
    az = Math.atan2(y, x) * RAD + 180;
  }
  return { alt: alt * RAD, az: normDeg(az) };
}

export function eclipticToEquatorial(lonDeg, latDeg, jd) {
  const T = julianCenturies(jd);
  const obl = 23.439291 - 0.0130042 * T;
  const lonR = lonDeg * DEG;
  const latR = latDeg * DEG;
  const oblR = obl * DEG;
  const ra = Math.atan2(Math.sin(lonR) * Math.cos(oblR) - Math.tan(latR) * Math.sin(oblR), Math.cos(lonR)) * RAD;
  const dec = Math.asin(Math.sin(latR) * Math.cos(oblR) + Math.cos(latR) * Math.sin(oblR) * Math.sin(lonR)) * RAD;
  return { ra: normDeg(ra), dec: clamp(dec, -90, 90) };
}

export function precessJ2000ToDate(raJ2000, decJ2000, jd) {
  const T = julianCenturies(jd);
  if (Math.abs(T) < 1e-10) return { ra: raJ2000, dec: decJ2000 };
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * DEG;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018086 * T * T * T) * DEG;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * DEG;
  const raR = raJ2000 * DEG;
  const decR = decJ2000 * DEG;
  const x = Math.cos(decR) * Math.cos(raR);
  const y = Math.cos(decR) * Math.sin(raR);
  const zCoord = Math.sin(decR);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const x1 = x * cosT + zCoord * sinT;
  const z1 = -x * sinT + zCoord * cosT;
  const y1 = y;
  const cosZ = Math.cos(zeta);
  const sinZ = Math.sin(zeta);
  const x2 = x1 * cosZ - y1 * sinZ;
  const y2 = x1 * sinZ + y1 * cosZ;
  const ra = Math.atan2(y2, x2) * RAD;
  const dec = Math.asin(clamp(z1, -1, 1)) * RAD;
  return { ra: normDeg(ra), dec: clamp(dec, -90, 90) };
}

export function sunPosition(jd) {
  const n = jd - J2000;
  const M = normDeg(357.5291092 + 0.9856002817 * n);
  const C = 1.914602 * Math.sin(M * DEG) + 0.020007 * Math.sin(2 * M * DEG) + 0.000331 * Math.sin(3 * M * DEG);
  const lambda = normDeg(M + C + 180 + 102.93735);
  const obl = 23.439291 - 0.0130042 * julianCenturies(jd);
  const eq = eclipticToEquatorial(lambda, 0, jd);
  const a = 1.000001018;
  const e = 0.016708634;
  const E_sun = (M + C) * DEG;
  const r = a * (1 - e * Math.cos(E_sun));
  return { ra: eq.ra, dec: eq.dec, distAU: r, lambda };
}

export function moonPosition(jd) {
  const T = julianCenturies(jd);
  const L = normDeg(218.3165 + 481267.8813 * T);
  const M = normDeg(134.9629 + 477198.8676 * T);
  const F = normDeg(93.2720 + 483202.0175 * T);
  const D = normDeg(297.8502 + 445267.1115 * T);
  const lon = L + 6.289 * Math.sin(F * DEG) + 1.274 * Math.sin((M - F) * DEG) + 0.658 * Math.sin((2 * D - F) * DEG);
  const lat = 5.128 * Math.sin(F * DEG) + 0.280 * Math.sin((M + F) * DEG) + 0.277 * Math.sin((M - F) * DEG);
  const obl = 23.439291 - 0.0130042 * T;
  const eq = eclipticToEquatorial(normDeg(lon), lat, jd);
  const ph = (1 + Math.cos(D * DEG)) / 2;
  return { ra: eq.ra, dec: eq.dec, phase: ph, lon: normDeg(lon), lat, distAU: 0.00257 };
}

export function moonPhase(jd) {
  const T = julianCenturies(jd);
  const D = normDeg(297.8502 + 445267.1115 * T);
  const illuminated = (1 + Math.cos(D * DEG)) / 2;
  const ageDays = ((jd - J2000) % 29.530588853 + 29.530588853) % 29.530588853;
  let name;
  if (illuminated < 0.025 || illuminated > 0.975) name = 'New Moon';
  else if (illuminated < 0.25) name = 'Waxing Crescent';
  else if (illuminated < 0.50) name = 'First Quarter';
  else if (illuminated < 0.75) name = 'Waxing Gibbous';
  else if (illuminated < 0.975) name = 'Full Moon';
  else name = 'Waning Gibbous';
  return { phaseAngle: D, illuminatedFraction: illuminated, ageDays, name, brightLimbAngle: D };
}

const PLANET_ELEMENTS = {
  Mercury: { a: 0.38709893, e: 0.20563069, i: 7.00487, L0: 252.25089, L1: 149472.674, M0: 174.7644, M1: 479571.86, w: 77.4561, Omega0: 48.5454 },
  Venus:   { a: 0.72333199, e: 0.00677323, i: 3.39471, L0: 181.9798, L1: 58517.815, M0: 50.4163, M1: 16258.61, w: 131.785, Omega0: 76.6806 },
  Mars:    { a: 1.52367934, e: 0.09340564, i: 1.85061, L0: 355.4532, L1: 68905.110, M0: 19.373, M1: 61355.37, w: 336.060, Omega0: 49.5581 },
  Jupiter: { a: 5.20260327, e: 0.04839266, i: 1.30530, L0: 34.3515, L1: 8707.392, M0: 20.0203, M1: 22321.65, w: 14.3313, Omega0: 100.4644 },
  Saturn:  { a: 9.53667594, e: 0.05386179, i: 2.48446, L0: 50.0774, L1: 5556.798, M0: 317.0236, M1: 12509.33, w: 93.0568, Omega0: 113.6655 }
};

function solveKepler(M, e, tol) {
  tol = tol || 1e-8;
  let E = M;
  for (let i = 0; i < 100; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < tol) break;
    if (!isFinite(E)) E = M + (i % 2 === 0 ? 0.1 : -0.1);
  }
  return E;
}

export function planetPosition(name, jd) {
  const el = PLANET_ELEMENTS[name];
  if (!el) return null;
  const T = julianCenturies(jd);
  const L = normDeg(el.L0 + el.L1 * T);
  const a = el.a;
  const e = el.e;
  const i = el.i * DEG;
  const w = el.w * DEG;
  const M_deg = (el.M0 + el.M1 * T) % 360;
  const M = M_deg * DEG;
  const E = solveKepler(M, e);
  const v = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const r = a * (1 - e * Math.cos(E));
  const helioLon = L + v - M_deg - el.w;
  const earthLon = normDeg(100.46 + 35999.3727 * T);
  const dlon = helioLon * DEG - earthLon * DEG;
  const geoLon = Math.atan2(r * Math.sin(dlon), 1.0 - r * Math.cos(dlon)) * RAD + earthLon;
  const dist = Math.sqrt(1 + r * r - 2 * r * Math.cos(dlon));
  const obl = 23.439291 - 0.0130042 * T;
  const eq = eclipticToEquatorial(normDeg(geoLon), 0, jd);
  const sunEclLon = sunPosition(jd).lambda;
  let elongation = Math.abs(normDeg(geoLon) - normDeg(sunEclLon));
  if (elongation > 180) elongation = 360 - elongation;
  let mag;
  switch (name) {
    case 'Mercury': mag = -0.5 + 5 * Math.log10(dist) + 0.3; break;
    case 'Venus': mag = -4.4 + 5 * Math.log10(dist) - 0.5; break;
    case 'Mars': mag = -2.5 + 5 * Math.log10(dist) - 0.3; break;
    case 'Jupiter': mag = -9.0 + 5 * Math.log10(dist) + 0.5; break;
    case 'Saturn': mag = -8.0 + 5 * Math.log10(dist) + 1.0; break;
    default: mag = 0;
  }
  mag = clamp(mag, -29, 15);
  return { ra: eq.ra, dec: eq.dec, distAU: dist, lonEcl: normDeg(geoLon), mag, elongation };
}

export function riseTransitSet(star, jd, latDeg, lonDeg) {
  const h0 = (star.name && (star.name === 'Sun' || star.name === 'Moon')) ? -0.833 : -0.5667;
  const latA = latDeg * DEG;
  const raH = star.ra != null ? star.ra * DEG : null;
  const decH = star.dec != null ? star.dec * DEG : null;
  if (raH == null || decH == null) return null;
  const result = { rise: null, transit: null, set: null, isCircumpolar: false, isNeverRises: false };
  const altUpper = Math.asin(clamp(Math.sin(decH) * Math.sin(latA) + Math.cos(decH) * Math.cos(latA), -1, 1)) * RAD;
  if (altUpper < h0) { result.isNeverRises = true; return result; }
  const jdStart = Math.floor(jd);
  const dtStep = 180;
  let prevAlt = -999;
  let transitTime = null, transitAlt = -999;
  for (let t = 0; t < 86400; t += dtStep) {
    const jdNow = jdStart + t / 86400;
    const lst = lstDeg(jdNow, lonDeg);
    const alt = equatorialToHorizontal(star.ra, star.dec, latDeg, lst).alt;
    if (alt > transitAlt) { transitAlt = alt; transitTime = new Date(Date.UTC(2000, 0, 1, 12, 0, 0) + t * 1000); }
    if (t > 0 && prevAlt < h0 && alt >= h0) {
      const frac = (h0 - prevAlt) / (alt - prevAlt);
      const riseSec = (t - dtStep) + frac * dtStep;
      result.rise = new Date(Date.UTC(2000, 0, 1, 12, 0, 0) + riseSec * 1000);
    }
    if (t > 0 && prevAlt >= h0 && alt < h0) {
      const frac = (h0 - prevAlt) / (alt - prevAlt);
      const setSec = (t - dtStep) + frac * dtStep;
      result.set = new Date(Date.UTC(2000, 0, 1, 12, 0, 0) + setSec * 1000);
    }
    prevAlt = alt;
  }
  result.transit = transitTime;
  return result;
}

export { clamp, normDeg, wrapDeg, wrapPi, deg2rad, rad2deg };
function wrapDeg(v) { const r = v % 360; return r < 0 ? r + 360 : r; }
function wrapPi(v) { const r = v % (2 * Math.PI); return r < 0 ? r + 2 * Math.PI : r; }
function deg2rad(d) { return d * Math.PI / 180; }
function rad2deg(r) { return r * 180 / Math.PI; }
