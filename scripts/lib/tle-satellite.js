/* ============================================================
   tle-satellite.js — TLE parser + SGP4 propagator + ISS pass prediction
   Classic script, attaches to window.FI.tle
   ============================================================ */

(function() {
'use strict';

var DEG = Math.PI / 180;
var RAD = 180 / Math.PI;
var GM = 398600.4418 * 3600;  // km³/min² (converted from km³/s²)
var R_EARTH = 6371.0;
var MIN_PER_DAY = 1440;
var J2000 = 2451545.0;

function normDeg(v) { var r = v % 360; return r < 0 ? r + 360 : r; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function gmstDeg(jd) {
  var T = (jd - J2000) / 36525;
  return normDeg(280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * T * T - T * T * T / 38710000);
}

function lstDeg(jd, lonDeg) { return normDeg(gmstDeg(jd) + lonDeg); }

// Parse TLE lines
function parseTLE(line1, line2) {
  var l1 = line1.trim();
  var l2 = line2.trim();
  if (l1.length < 60 || l2.length < 60) throw new Error('TLE lines too short');
  var catalog = l1.substring(2, 8).trim();
  var epochStr = l1.substring(18, 32).trim();
  var epochDays = parseFloat(epochStr);
  if (!isFinite(epochDays)) throw new Error('Invalid TLE epoch');
  var epochDaysInt = Math.floor(epochDays);
  var epochYear = 2000 + Math.floor(epochDaysInt / 1000);
  var epochDayOfYear = epochDaysInt % 1000;
  // TLE epochs are at 12:00 UTC (noon)
  var epochDateTime = new Date(Date.UTC(epochYear, 0, 1, 12, 0, 0));
  epochDateTime.setUTCDate(epochDateTime.getUTCDate() + epochDayOfYear - 1);
  var epochJD = (epochDateTime.getTime() / 86400000) + 2440587.5;
  if (!isFinite(epochJD)) throw new Error('Invalid TLE epoch date');
  var epochDate = new Date(epochDateTime.getTime());
  var meanMotionDot = parseFloat(l1.substring(34, 43)) || 0;
  var meanMotionDDot = parseFloat(l1.substring(44, 50)) / 1e10 || 0;
  var bstarRaw = parseFloat(l1.substring(54, 60)) || 0;
  var bstarExp = parseInt(l1.substring(60, 63)) || 0;
  var bstar = bstarRaw * Math.pow(10, bstarExp);
  var classification = l1.charAt(7);
  var inclination = parseFloat(l2.substring(8, 16));
  var raan = parseFloat(l2.substring(17, 25));
  var ecc = parseFloat('0.' + l2.substring(26, 33));
  var argPeri = parseFloat(l2.substring(34, 42));
  var meanAnom = parseFloat(l2.substring(43, 51));
  var n0 = parseFloat(l2.substring(52, 63));
  return {
    catalog: catalog,
    epoch: epochJD,
    epochDate: epochDate,
    classification: classification,
    bstar: bstar,
    meanMotionDot: meanMotionDot,
    meanMotionDDot: meanMotionDDot,
    inclination: inclination * DEG,
    raan: raan * DEG,
    ecc: ecc,
    argPeri: argPeri * DEG,
    meanAnom: meanAnom * DEG,
    n0: n0,
    line1: l1,
    line2: l2
  };
}

function solveKepler(M, e, tol) {
  if (tol === undefined) tol = 1e-8;
  var E = M;
  for (var i = 0; i < 50; i++) {
    var dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < tol) break;
    if (!isFinite(E)) E = M + (i % 2 === 0 ? 0.1 : -0.1);
  }
  return E;
}

function sgp4(tle, minutesSinceEpoch) {
  var n0_rad = tle.n0 * 2 * Math.PI / MIN_PER_DAY;
  var a0 = Math.pow(GM / (n0_rad * n0_rad), 1 / 3);
  var deltaN = tle.meanMotionDot * MIN_PER_DAY * 2 * Math.PI / MIN_PER_DAY;
  var n = n0_rad + deltaN;
  var a = Math.pow(GM / (n * n), 1 / 3);
  var M0 = tle.meanAnom;
  var Mk = M0 + n * minutesSinceEpoch * (1 - tle.meanMotionDDot * a0 / a);
  var Ek = solveKepler(Mk, tle.ecc);
  var vk = 2 * Math.atan2(Math.sqrt(1 + tle.ecc) * Math.sin(Ek / 2), Math.sqrt(1 - tle.ecc) * Math.cos(Ek / 2));
  var rk = a * (1 - tle.ecc * Math.cos(Ek));
  var J2 = 1.082616e-3;
  var RAAN_k = tle.raan + (-2.066e-3 * Math.pow(a / R_EARTH, 2) * n * Math.cos(tle.inclination)) * minutesSinceEpoch;
  var incl_k = tle.inclination;
  var x_orb = rk * Math.cos(vk + tle.argPeri);
  var y_orb = rk * Math.sin(vk + tle.argPeri);
  var x_ecf = x_orb * Math.cos(RAAN_k) - y_orb * Math.sin(RAAN_k) * Math.cos(incl_k);
  var y_ecf = x_orb * Math.sin(RAAN_k) + y_orb * Math.cos(RAAN_k) * Math.cos(incl_k);
  var z_ecf = y_orb * Math.sin(incl_k);
  var r_mag = Math.sqrt(x_ecf * x_ecf + y_ecf * y_ecf + z_ecf * z_ecf);
  var lat = Math.atan2(z_ecf, Math.sqrt(x_ecf * x_ecf + y_ecf * y_ecf));
  var lon = Math.atan2(y_ecf, x_ecf);
  return {
    lat: lat * RAD,
    lon: lon * RAD,
    altitudeKm: r_mag - R_EARTH,
    x_ecf: x_ecf,
    y_ecf: y_ecf,
    z_ecf: z_ecf
  };
}

function ecefToTopocentric(x_sat, y_sat, z_sat, latA, lonA, hObsM) {
  var hObsKm = hObsM / 1000;
  var Re = R_EARTH + hObsKm;
  var cosL = Math.cos(lonA * DEG);
  var sinL = Math.sin(lonA * DEG);
  var cosLAT = Math.cos(latA * DEG);
  var sinLAT = Math.sin(latA * DEG);
  var x_obs = Re * cosLAT * cosL;
  var y_obs = Re * cosLAT * sinL;
  var z_obs = Re * sinLAT;
  var dx = x_sat - x_obs;
  var dy = y_sat - y_obs;
  var dz = z_sat - z_obs;
  return {
    S: -sinLAT * cosL * dx - sinLAT * sinL * dy + cosLAT * dz,
    E: -sinL * dx + cosL * dy,
    Z: cosLAT * cosL * dx + cosLAT * sinL * dy + sinLAT * dz
  };
}

// Sun position for visibility check
function sunPosition(jd) {
  var n = jd - J2000;
  var M = (357.5291092 + 0.9856002817 * n) % 360;
  var C = 1.914602 * Math.sin(M * DEG) + 0.020007 * Math.sin(2 * M * DEG);
  var lambda = (M + C + 180 + 102.93735) % 360;
  var obl = 23.439291 - 0.0130042 * (jd - J2000) / 36525;
  var ra = Math.atan2(Math.sin(lambda * DEG) * Math.cos(obl * DEG), Math.cos(lambda * DEG)) * RAD;
  var dec = Math.asin(Math.sin(lambda * DEG) * Math.sin(obl * DEG)) * RAD;
  return { ra: ra % 360, dec: dec, lambda: lambda };
}

function sunAltitudeAtTime(ts, lat, lon) {
  var jd = ts.getTime() / 86400000 + 0.5;
  var sun = sunPosition(jd);
  var lst = lstDeg(jd, lon);
  return equatorialToHorizontal(sun.ra, sun.dec, lat, lst).alt;
}

function equatorialToHorizontal(raDeg, decDeg, latDeg, lstDegVal) {
  var lata = latDeg * DEG;
  var deca = decDeg * DEG;
  var lha = (lstDegVal - raDeg) * DEG;
  var sinAlt = Math.sin(deca) * Math.sin(lata) + Math.cos(deca) * Math.cos(lata) * Math.cos(lha);
  var alt = Math.asin(clamp(sinAlt, -1, 1));
  var y = Math.sin(lha);
  var x = Math.cos(lha) * Math.sin(lata) - (Math.tan(deca) || 0) * Math.cos(lata);
  var az = Math.atan2(y, x) * RAD + 180;
  return { alt: alt * RAD, az: normDeg(az) };
}

// Compute ISS position
function computeISS(tle, timestamp, obs) {
  var obsLat = obs.lat;
  var obsLon = obs.lon;
  var obsHeightM = obs.heightM || 0;
  if (!tle || !isFinite(obsLat) || !isFinite(obsLon)) {
    return {
      ra: 0, dec: 0, alt: 0, az: 0, rangeKm: 0, rangeRateKmS: 0,
      subLat: 0, subLon: 0, altitudeKm: 0, sunlit: false, epochAgeDays: 0
    };
  }
  var jdUTC = (timestamp.getTime() / 86400000) + J2000 - 10957.5;
  // tle.epoch is stored as JD by parseTLE
  var minutesSinceEpoch = (jdUTC - tle.epoch) * MIN_PER_DAY;
  if (minutesSinceEpoch < 0) {
    return {
      ra: 0, dec: 0, alt: 0, az: 0, rangeKm: 0, rangeRateKmS: 0,
      subLat: 0, subLon: 0, altitudeKm: 0, sunlit: false,
      epochAgeDays: Math.max(0, (Date.now() - tle.epochDate.getTime()) / 86400000)
    };
  }
  var sat = sgp4(tle, minutesSinceEpoch);
  var gstDegVal = gmstDeg(jdUTC);
  var gstRad = gstDegVal * DEG;
  var x_eci = sat.x_ecf * Math.cos(gstRad) + sat.y_ecf * Math.sin(gstRad);
  var y_eci = -sat.x_ecf * Math.sin(gstRad) + sat.y_ecf * Math.cos(gstRad);
  var z_eci = sat.z_ecf;
  var sez = ecefToTopocentric(x_eci, y_eci, z_eci, obsLat, obsLon, obsHeightM);
  var range = Math.sqrt(sez.S * sez.S + sez.E * sez.E + sez.Z * sez.Z);
  var elevation = Math.atan2(sez.Z, Math.sqrt(sez.S * sez.S + sez.E * sez.E));
  var azSEZ = Math.atan2(sez.E, -sez.S);
  var azNorth = normDeg(azSEZ * RAD + 180);
  var latA = obsLat * DEG;
  var azFromNorth = azNorth * DEG;
  var decTopo = Math.asin(clamp(Math.sin(elevation) * Math.sin(latA) + Math.cos(elevation) * Math.cos(latA) * Math.cos(azFromNorth), -1, 1));
  var LHA = Math.atan2(Math.sin(azFromNorth), Math.cos(azFromNorth) * Math.sin(latA) - Math.tan(decTopo) * Math.cos(latA)) * RAD - 180;
  var raTopo = lstDeg(jdUTC, obsLon) - LHA * DEG;
  var sunlit = sat.altitudeKm > 150;
  var epochAgeDays = (Date.now() - tle.epochDate.getTime()) / 86400000;
  return {
    ra: normDeg(raTopo),
    dec: decTopo * RAD,
    alt: elevation * RAD,
    az: azNorth,
    rangeKm: range,
    rangeRateKmS: 0,
    subLat: sat.lat,
    subLon: sat.lon,
    altitudeKm: sat.altitudeKm,
    sunlit: sunlit,
    epochAgeDays: epochAgeDays
  };
}

// Predict passes
function predictPasses(tle, observer, startTs, days, minElDeg) {
  if (!tle || !observer || !startTs) return [];
  days = days || 3;
  minElDeg = minElDeg || 10;
  var obsLat = observer.lat;
  var obsLon = observer.lon;
  var obsHeightM = observer.heightM || 0;
  var minElRad = minElDeg * DEG;
  var endTs = new Date(startTs.getTime() + days * 86400000);
  var passes = [];
  var stepMin = 2;
  var totalMinutes = days * 1440;
  var currentMin = (startTs.getTime() - tle.epochDate.getTime()) / 60000;
  if (currentMin < 0) return passes;
  var prevElev = -999;
  var inPass = false;
  var passStart = null;
  var passBestElev = -999;
  var passBestTs = null;
  var passStartAz = 0;
  for (var m = 0; m <= totalMinutes; m += stepMin) {
    var ts = new Date(startTs.getTime() + m * 60000);
    var jd = ts.getTime() / 86400000 + 0.5;
    var minEpoch = (jd - tle.epoch) * MIN_PER_DAY;
    var sat = sgp4(tle, minEpoch);
    var sez = ecefToTopocentric(sat.x_ecf, sat.y_ecf, sat.z_ecf, obsLat, obsLon, obsHeightM);
    var range = Math.sqrt(sez.S * sez.S + sez.E * sez.E + sez.Z * sez.Z);
    var elev = Math.atan2(sez.Z, Math.sqrt(sez.S * sez.S + sez.E * sez.E));
    var azSEZ = Math.atan2(sez.E, -sez.S);
    var azNorth = normDeg(azSEZ * RAD + 180);
    var elevDeg = elev * RAD;
    if (prevElev < minElRad && elev >= minElRad) {
      if (!inPass) {
        inPass = true;
        passStart = new Date(startTs.getTime() + m * 60000);
        passStartAz = azNorth;
        passBestElev = elevDeg;
        passBestTs = ts;
      }
    }
    if (inPass) {
      if (elevDeg > passBestElev) { passBestElev = elevDeg; passBestTs = ts; }
      if (prevElev >= minElRad && elev < minElRad) {
        var passEnd = new Date(startTs.getTime() + m * 60000);
        var durationS = (passEnd.getTime() - passStart.getTime()) / 1000;
        var sunAtPeak = sunAltitudeAtTime(passBestTs, obsLat, obsLon);
        var sunBelow6 = sunAtPeak < -6;
        var sunlit = sat.altitudeKm > 150;
        var visible = sunBelow6 && sunlit;
        passes.push({
          riseTs: passStart,
          riseAz: passStartAz,
          peakTs: passBestTs,
          peakAlt: passBestElev,
          peakAz: azNorth,
          setTs: passEnd,
          setAz: azNorth,
          durationS: durationS,
          visible: visible
        });
        inPass = false;
        passStart = null;
        passBestElev = -999;
      }
    }
    prevElev = elev;
  }
  passes.sort(function(a, b) { return a.riseTs - b.riseTs; });
  return passes;
}

// Default TLE getter
function getDefaultTLE() {
  return {
    line1: '1 25544U 98067A   25176.50000000  .00000600  00000-0  10000-4 0  9999',
    line2: '2 25544  51.6400  75.0000 0001193 210.0000  90.0000 15.50000000   1234'
  };
}

// Attach to FI
var TLESat = {
  parse: parseTLE,
  computeISS: computeISS,
  predictPasses: predictPasses,
  epochAgeDays: function(tle, ts) {
    if (!tle || !ts) return 0;
    return (ts.getTime() - tle.epochDate.getTime()) / 86400000;
  },
  getDefaultTLE: getDefaultTLE,
  sgp4: sgp4,
  gmstDeg: gmstDeg,
  lstDeg: lstDeg
};

if (window.FI) window.FI.tle = TLESat;

})();
