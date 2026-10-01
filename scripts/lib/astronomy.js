/* ============================================================
   astronomy.js — Pure math astronomy library
   Classic script, attaches to window.FI.astronomy
   No DOM, no globals besides that namespace.
   Every variable declared — no implicit globals.
   ============================================================ */

(function() {
'use strict';

var DEG = Math.PI / 180;
var RAD = 180 / Math.PI;
var J2000 = 2451545.0;
var JULIAN_CENTURY = 36525;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function normDeg(v) { var r = v % 360; return r < 0 ? r + 360 : r; }

// Julian Date from Date or ms
function julianDate(dateOrMs) {
  var ms;
  if (dateOrMs instanceof Date) ms = dateOrMs.getTime();
  else if (typeof dateOrMs === 'number') ms = dateOrMs;
  else ms = Date.now();
  return (ms / 86400000) + 2440587.5;
}

function julianCenturies(jd) { return (jd - J2000) / JULIAN_CENTURY; }

// GMST in degrees [0,360)
function gmstDeg(jd) {
  var T = julianCenturies(jd);
  var g = 280.46061837 + 360.98564736629 * (jd - J2000) +
          0.000387933 * T * T - T * T * T / 38710000;
  return normDeg(g);
}

// LST in degrees (east positive)
function lstDeg(jd, lonEastDeg) {
  return normDeg(gmstDeg(jd) + lonEastDeg);
}

// Equatorial to Horizontal
// Returns { alt, az } with az in [0,360), alt in [-90,90]
function equatorialToHorizontal(raDeg, decDeg, latDeg, lstDegVal) {
  var lata = latDeg * DEG;
  var deca = decDeg * DEG;
  var lha = (lstDegVal - raDeg) * DEG;
  var sinAlt = Math.sin(deca) * Math.sin(lata) + Math.cos(deca) * Math.cos(lata) * Math.cos(lha);
  var alt = Math.asin(clamp(sinAlt, -1, 1));
  var az;
  var cosLat = Math.cos(lata);
  if (Math.abs(cosLat) < 1e-12) {
    az = 0;
  } else {
    var tanDec = Math.tan(deca);
    var y = Math.sin(lha);
    var x = Math.cos(lha) * Math.sin(lata) - tanDec * cosLat;
    az = Math.atan2(y, x) * RAD + 180;
  }
  return { alt: alt * RAD, az: normDeg(az) };
}

// Horizontal to Equatorial (inverse)
function horizontalToEquatorial(altDeg, azDeg, latDeg, lstDegVal) {
  var alt = altDeg * DEG;
  var az = azDeg * DEG;
  var lat = latDeg * DEG;
  var lstRad = lstDegVal * DEG;
  var dec = Math.asin(clamp(Math.sin(alt) * Math.sin(lat) + Math.cos(alt) * Math.cos(lat) * Math.cos(az), -1, 1));
  var lha = Math.atan2(Math.sin(az), Math.cos(az) * Math.sin(lat) - Math.tan(alt) * Math.cos(lat));
  var ra = lstRad - lha;
  return { ra: normDeg(ra * RAD), dec: dec * RAD };
}

// Ecliptic to Equatorial
function eclipticToEquatorial(lonDeg, latDeg, jd) {
  var T = julianCenturies(jd);
  var obl = 23.439291 - 0.0130042 * T;
  var oblR = obl * DEG;
  var lonR = lonDeg * DEG;
  var latR = latDeg * DEG;
  var ra = Math.atan2(Math.sin(lonR) * Math.cos(oblR) - Math.tan(latR) * Math.sin(oblR), Math.cos(lonR)) * RAD;
  var dec = Math.asin(Math.sin(latR) * Math.cos(oblR) + Math.cos(latR) * Math.sin(oblR) * Math.sin(lonR)) * RAD;
  return { ra: normDeg(ra), dec: clamp(dec, -90, 90) };
}

// Precession J2000 to date
function precessJ2000ToDate(raJ2000, decJ2000, jd) {
  var T = julianCenturies(jd);
  if (Math.abs(T) < 1e-10) return { ra: raJ2000, dec: decJ2000 };
  var zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * DEG;
  var z = (2306.2181 * T + 1.09468 * T * T + 0.018086 * T * T * T) * DEG;
  var theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * DEG;
  var raR = raJ2000 * DEG;
  var decR = decJ2000 * DEG;
  var x = Math.cos(decR) * Math.cos(raR);
  var y = Math.cos(decR) * Math.sin(raR);
  var zCoord = Math.sin(decR);
  var cosT = Math.cos(theta);
  var sinT = Math.sin(theta);
  var x1 = x * cosT + zCoord * sinT;
  var z1 = -x * sinT + zCoord * cosT;
  var y1 = y;
  var cosZ = Math.cos(zeta);
  var sinZ = Math.sin(zeta);
  var x2 = x1 * cosZ - y1 * sinZ;
  var y2 = x1 * sinZ + y1 * cosZ;
  var ra = Math.atan2(y2, x2) * RAD;
  var dec = Math.asin(clamp(z1, -1, 1)) * RAD;
  return { ra: normDeg(ra), dec: clamp(dec, -90, 90) };
}

// Sun position (Meeus Ch. 25, low precision ~0.02 deg)
function sunPosition(jd) {
  var n = jd - J2000;
  var M = normDeg(357.5291092 + 0.9856002817 * n);
  var C = 1.914602 * Math.sin(M * DEG) + 0.020007 * Math.sin(2 * M * DEG) + 0.000331 * Math.sin(3 * M * DEG);
  var lambda = normDeg(M + C + 180 + 102.93735);
  var obl = 23.439291 - 0.0130042 * julianCenturies(jd);
  var eq = eclipticToEquatorial(lambda, 0, jd);
  var a = 1.000001018;
  var e = 0.016708634;
  var E_sun = (M + C) * DEG;
  var r = a * (1 - e * Math.cos(E_sun));
  return { ra: eq.ra, dec: eq.dec, distAU: r, lambda: lambda, eclipticLon: lambda };
}

// Moon position (Meeus Ch. 47 truncated series ~0.3 deg)
function moonPosition(jd) {
  var T = julianCenturies(jd);
  var L = normDeg(218.3165 + 481267.8813 * T);
  var M = normDeg(134.9629 + 477198.8676 * T);
  var F = normDeg(93.2720 + 483202.0175 * T);
  var D = normDeg(297.8502 + 445267.1115 * T);
  var Ms = normDeg(357.5291 + 35999.0503 * T);
  var lon = L + 6.289 * Math.sin(F * DEG) + 1.274 * Math.sin((M - F) * DEG) + 0.658 * Math.sin((2 * D - F) * DEG);
  var lat = 5.128 * Math.sin(F * DEG) + 0.280 * Math.sin((M + F) * DEG) + 0.277 * Math.sin((M - F) * DEG);
  var obl = 23.439291 - 0.0130042 * T;
  var eq = eclipticToEquatorial(normDeg(lon), lat, jd);
  var phase = (1 + Math.cos(D * DEG)) / 2;
  return { ra: eq.ra, dec: eq.dec, phase: phase, lon: normDeg(lon), lat: lat, distAU: 0.00257 };
}

// Moon phase
function moonPhase(jd) {
  var T = julianCenturies(jd);
  var D = normDeg(297.8502 + 445267.1115 * T);
  var illuminated = (1 + Math.cos(D * DEG)) / 2;
  var ageDays = ((jd - J2000) % 29.530588853 + 29.530588853) % 29.530588853;
  var name;
  if (illuminated < 0.025 || illuminated > 0.975) name = 'New Moon';
  else if (illuminated < 0.25) name = 'Waxing Crescent';
  else if (illuminated < 0.50) name = 'First Quarter';
  else if (illuminated < 0.75) name = 'Waxing Gibbous';
  else if (illuminated < 0.975) name = 'Full Moon';
  else name = 'Waning Gibbous';
  return {
    phaseAngle: D,
    illuminatedFraction: illuminated,
    ageDays: ageDays,
    name: name,
    brightLimbAngle: D
  };
}

// Planet position (Keplerian, approximate 1800-2050)
var PLANET_ELEMENTS = {
  Mercury: { a: 0.38709893, e: 0.20563069, i: 7.00487, L0: 252.25089, L1: 149472.674, M0: 174.7644, M1: 479571.86, w: 77.4561, Omega0: 48.5454 },
  Venus:   { a: 0.72333199, e: 0.00677323, i: 3.39471, L0: 181.9798, L1: 58517.815, M0: 50.4163, M1: 16258.61, w: 131.785, Omega0: 76.6806 },
  Mars:    { a: 1.52367934, e: 0.09340564, i: 1.85061, L0: 355.4532, L1: 68905.110, M0: 19.373, M1: 61355.37, w: 336.060, Omega0: 49.5581 },
  Jupiter: { a: 5.20260327, e: 0.04839266, i: 1.30530, L0: 34.3515, L1: 8707.392, M0: 20.0203, M1: 22321.65, w: 14.3313, Omega0: 100.4644 },
  Saturn:  { a: 9.53667594, e: 0.05386179, i: 2.48446, L0: 50.0774, L1: 5556.798, M0: 317.0236, M1: 12509.33, w: 93.0568, Omega0: 113.6655 }
};

function solveKepler(M, e, tol) {
  if (tol === undefined) tol = 1e-8;
  var E = M;
  for (var i = 0; i < 100; i++) {
    var dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < tol) break;
    if (!isFinite(E)) E = M + (i % 2 === 0 ? 0.1 : -0.1);
  }
  return E;
}

function planetPosition(name, jd) {
  var el = PLANET_ELEMENTS[name];
  if (!el) return null;
  var T = julianCenturies(jd);
  var L = normDeg(el.L0 + el.L1 * T);
  var a = el.a;
  var e = el.e;
  var i = el.i * DEG;
  var w = el.w * DEG;
  var M_deg = (el.M0 + el.M1 * T) % 360;
  var M = M_deg * DEG;
  var E = solveKepler(M, e);
  var v = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  var r = a * (1 - e * Math.cos(E));
  var helioLon = L + v - M_deg - el.w;
  var earthLon = normDeg(100.46 + 35999.3727 * T);
  var dlon = helioLon * DEG - earthLon * DEG;
  var geoLon = Math.atan2(r * Math.sin(dlon), 1.0 - r * Math.cos(dlon)) * RAD + earthLon;
  var dist = Math.sqrt(1 + r * r - 2 * r * Math.cos(dlon));
  var obl = 23.439291 - 0.0130042 * T;
  var eq = eclipticToEquatorial(normDeg(geoLon), 0, jd);
  var sunEclLon = sunPosition(jd).lambda;
  var elongation = Math.abs(normDeg(geoLon) - normDeg(sunEclLon));
  if (elongation > 180) elongation = 360 - elongation;
  var mag;
  switch (name) {
    case 'Mercury': mag = -0.5 + 5 * Math.log10(dist) + 0.3; break;
    case 'Venus': mag = -4.4 + 5 * Math.log10(dist) - 0.5; break;
    case 'Mars': mag = -2.5 + 5 * Math.log10(dist) - 0.3; break;
    case 'Jupiter': mag = -9.0 + 5 * Math.log10(dist) + 0.5; break;
    case 'Saturn': mag = -8.0 + 5 * Math.log10(dist) + 1.0; break;
    default: mag = 0;
  }
  mag = clamp(mag, -29, 15);
  return { ra: eq.ra, dec: eq.dec, distAU: dist, lonEcl: normDeg(geoLon), mag: mag, elongation: elongation };
}

// Rise, Transit, Set
function riseTransitSet(star, jd, latDeg, lonDeg) {
  var h0 = (star.name && (star.name === 'Sun' || star.name === 'Moon')) ? -0.833 : -0.5667;
  var latA = latDeg * DEG;
  var raH = star.ra != null ? star.ra * DEG : null;
  var decH = star.dec != null ? star.dec * DEG : null;
  if (raH == null || decH == null) return { rise: null, transit: null, set: null, isCircumpolar: false, neverRises: false };
  var result = { rise: null, transit: null, set: null, isCircumpolar: false, neverRises: false };
  var altUpper = Math.asin(clamp(Math.sin(decH) * Math.sin(latA) + Math.cos(decH) * Math.cos(latA), -1, 1)) * RAD;
  if (altUpper < h0) { result.neverRises = true; return result; }
  var jdStart = Math.floor(jd);
  var dtStep = 180;
  var prevAlt = -999;
  var transitTime = null, transitAlt = -999;
  for (var t = 0; t < 86400; t += dtStep) {
    var jdNow = jdStart + t / 86400;
    var lst = lstDeg(jdNow, lonDeg);
    var alt = equatorialToHorizontal(star.ra, star.dec, latDeg, lst).alt;
    if (alt > transitAlt) { transitAlt = alt; transitTime = new Date(Date.UTC(2000, 0, 1, 12, 0, 0) + t * 1000); }
    if (t > 0 && prevAlt < h0 && alt >= h0) {
      var frac = (h0 - prevAlt) / (alt - prevAlt);
      var riseSec = (t - dtStep) + frac * dtStep;
      result.rise = new Date(Date.UTC(2000, 0, 1, 12, 0, 0) + riseSec * 1000);
    }
    if (t > 0 && prevAlt >= h0 && alt < h0) {
      var frac2 = (h0 - prevAlt) / (alt - prevAlt);
      var setSec = (t - dtStep) + frac2 * dtStep;
      result.set = new Date(Date.UTC(2000, 0, 1, 12, 0, 0) + setSec * 1000);
    }
    prevAlt = alt;
  }
  result.transit = transitTime;
  return result;
}

// Attach to FI
var Astro = {
  julianDate: julianDate,
  gmstDeg: gmstDeg,
  lstDeg: lstDeg,
  equatorialToHorizontal: equatorialToHorizontal,
  horizontalToEquatorial: horizontalToEquatorial,
  eclipticToEquatorial: eclipticToEquatorial,
  precessJ2000ToDate: precessJ2000ToDate,
  sunPosition: sunPosition,
  moonPosition: moonPosition,
  moonPhase: moonPhase,
  planetPosition: planetPosition,
  riseTransitSet: riseTransitSet,
  clamp: clamp,
  normDeg: normDeg
};

if (window.FI) window.FI.astronomy = Astro;
if (window.FI_ASTRO_TEST) window.FI_ASTRO_TEST = Astro;

})();
