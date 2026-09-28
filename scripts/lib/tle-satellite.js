/* ============================================================
   tle-satellite.js — TLE parser + SGP4 propagator + ISS pass prediction
   ============================================================ */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const GM = 398600.4418;
const R_EARTH = 6371.0;
const MIN_PER_DAY = 1440;
const J2000 = 2451545.0;

function normDeg(v) { const r = v % 360; return r < 0 ? r + 360 : r; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function gmstDeg(jd) {
  const T = (jd - J2000) / 36525;
  return normDeg(280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * T * T - T * T * T / 38710000);
}

function lstDeg(jd, lonDeg) { return normDeg(gmstDeg(jd) + lonDeg); }

export function parseTLE(line1, line2) {
  const l1 = line1.trim();
  const l2 = line2.trim();
  if (l1.length < 60 || l2.length < 60) throw new Error('TLE lines too short');
  const catalog = l1.substring(2, 8).trim();
  const epochStr = l1.substring(18, 32).trim();
  const epochDays = parseFloat(epochStr);
  if (!isFinite(epochDays)) throw new Error('Invalid TLE epoch');
  const epochDate = new Date(Date.UTC(2000, 0, 1, 12, 0, 0) + epochDays * 86400000);
  const meanMotionDot = parseFloat(l1.substring(34, 43)) || 0;
  const meanMotionDDot = parseFloat(l1.substring(44, 50)) / 1e10 || 0;
  const bstarRaw = parseFloat(l1.substring(54, 60)) || 0;
  const bstarExp = parseInt(l1.substring(60, 63)) || 0;
  const bstar = bstarRaw * Math.pow(10, bstarExp);
  const inclination = parseFloat(l2.substring(8, 16));
  const raan = parseFloat(l2.substring(17, 25));
  const ecc = parseFloat('0.' + l2.substring(26, 33));
  const argPeri = parseFloat(l2.substring(34, 42));
  const meanAnom = parseFloat(l2.substring(43, 51));
  const n0 = parseFloat(l2.substring(52, 63));
  return {
    catalog, epoch: epochDays, epochDate, classification, bstar, meanMotionDot, meanMotionDDot,
    inclination: inclination * DEG, raan: raan * DEG, ecc, argPeri: argPeri * DEG,
    meanAnom: meanAnom * DEG, n0, line1: l1, line2: l2
  };
}

function solveKepler(M, e, tol) {
  tol = tol || 1e-8;
  let E = M;
  for (let i = 0; i < 50; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

function sgp4(tle, minutesSinceEpoch) {
  const { bstar, meanMotionDot, meanMotionDDot, ecc, n0, inclination, raan, argPeri, meanAnom } = tle;
  const n0_rad = n0 * 2 * Math.PI / MIN_PER_DAY;
  const a0 = Math.pow(GM / (n0_rad * n0_rad), 1 / 3);
  const deltaN = meanMotionDot * MIN_PER_DAY * 2 * Math.PI / MIN_PER_DAY;
  const n = n0_rad + deltaN;
  const a = Math.pow(GM / (n * n), 1 / 3);
  const M0 = meanAnom;
  const Mk = M0 + n * minutesSinceEpoch * (1 - meanMotionDDot * a0 / a);
  const Ek = solveKepler(Mk, ecc);
  const vk = 2 * Math.atan2(Math.sqrt(1 + ecc) * Math.sin(Ek / 2), Math.sqrt(1 - ecc) * Math.cos(Ek / 2));
  const rk = a * (1 - ecc * Math.cos(Ek));
  const omega_k = argPeri;
  const J2 = 1.082616e-3;
  const RAAN_k = raan + (-2.066e-3 * Math.pow(a / R_EARTH, 2) * n * Math.cos(inclination)) * minutesSinceEpoch;
  const incl_k = inclination;
  const cos_raan = Math.cos(RAAN_k);
  const sin_raan = Math.sin(RAAN_k);
  const cos_inc = Math.cos(incl_k);
  const sin_inc = Math.sin(incl_k);
  const x_orb = rk * Math.cos(vk + omega_k);
  const y_orb = rk * Math.sin(vk + omega_k);
  const x_ecf = x_orb * cos_raan - y_orb * sin_raan * cos_inc;
  const y_ecf = x_orb * sin_raan + y_orb * cos_raan * cos_inc;
  const z_ecf = y_orb * sin_inc;
  const r_mag = Math.sqrt(x_ecf * x_ecf + y_ecf * y_ecf + z_ecf * z_ecf);
  const lat = Math.atan2(z_ecf, Math.sqrt(x_ecf * x_ecf + y_ecf * y_ecf));
  const lon = Math.atan2(y_ecf, x_ecf);
  return { lat: lat * RAD, lon: lon * RAD, altitudeKm: r_mag - R_EARTH, x_ecf, y_ecf, z_ecf };
}

function ecefToTopocentric(x_sat, y_sat, z_sat, latA, lonA, hObsM) {
  const hObsKm = hObsM / 1000;
  const Re = R_EARTH + hObsKm;
  const cosL = Math.cos(lonA * DEG);
  const sinL = Math.sin(lonA * DEG);
  const cosLAT = Math.cos(latA * DEG);
  const sinLAT = Math.sin(latA * DEG);
  const x_obs = Re * cosLAT * cosL;
  const y_obs = Re * cosLAT * sinL;
  const z_obs = Re * sinLAT;
  const dx = x_sat - x_obs;
  const dy = y_sat - y_obs;
  const dz = z_sat - z_obs;
  return {
    S: -sinLAT * cosL * dx - sinLAT * sinL * dy + cosLAT * dz,
    E: -sinL * dx + cosL * dy,
    Z: cosLAT * cosL * dx + cosLAT * sinL * dy + sinLAT * dz
  };
}

export function computeISS(tle, timestamp, obs) {
  const obsLat = obs.lat;
  const obsLon = obs.lon;
  const obsHeightM = obs.heightM || 0;
  if (!tle || !isFinite(obsLat) || !isFinite(obsLon)) {
    return { ra: 0, dec: 0, alt: 0, az: 0, rangeKm: 0, rangeRateKmS: 0, subLat: 0, subLon: 0, altitudeKm: 0, sunlit: false, epochAgeDays: 0 };
  }
  const jdUTC = (timestamp.getTime() / 86400000) + 0.5;
  const minutesSinceEpoch = (jdUTC - tle.epoch) * MIN_PER_DAY;
  if (minutesSinceEpoch < 0) return { ra: 0, dec: 0, alt: 0, az: 0, rangeKm: 0, rangeRateKmS: 0, subLat: 0, subLon: 0, altitudeKm: 0, sunlit: false, epochAgeDays: Math.max(0, (Date.now() - tle.epochDate.getTime()) / 86400000) };
  const sat = sgp4(tle, minutesSinceEpoch);
  const gstDegVal = gmstDeg(jdUTC);
  const gstRad = gstDegVal * DEG;
  const cosG = Math.cos(gstRad);
  const sinG = Math.sin(gstRad);
  const x_eci = sat.x_ecf * cosG + sat.y_ecf * sinG;
  const y_eci = -sat.x_ecf * sinG + sat.y_ecf * cosG;
  const z_eci = sat.z_ecf;
  const sez = ecefToTopocentric(x_eci, y_eci, z_eci, obsLat, obsLon, obsHeightM);
  const range = Math.sqrt(sez.S * sez.S + sez.E * sez.E + sez.Z * sez.Z);
  const elevation = Math.atan2(sez.Z, Math.sqrt(sez.S * sez.S + sez.E * sez.E));
  let azSEZ = Math.atan2(sez.E, -sez.S);
  let azNorth = normDeg(azSEZ * RAD + 180);
  const latA = obsLat * DEG;
  const azFromNorth = azNorth * DEG;
  const decTopo = Math.asin(clamp(Math.sin(elevation) * Math.sin(latA) + Math.cos(elevation) * Math.cos(latA) * Math.cos(azFromNorth), -1, 1));
  const LHA = Math.atan2(Math.sin(azFromNorth), Math.cos(azFromNorth) * Math.sin(latA) - Math.tan(decTopo) * Math.cos(latA)) * RAD - 180;
  const raTopo = lstDeg(jdUTC, obsLon) - LHA;
  const sunlit = sat.altitudeKm > 150;
  const epochAgeDays = (Date.now() - tle.epochDate.getTime()) / 86400000;
  return {
    ra: normDeg(raTopo * RAD),
    dec: decTopo * RAD,
    alt: elevation * RAD,
    az: azNorth,
    rangeKm: range,
    rangeRateKmS: 0,
    subLat: sat.lat,
    subLon: sat.lon,
    altitudeKm: sat.altitudeKm,
    sunlit,
    epochAgeDays
  };
}

export function predictPasses(tle, observer, startTs, days = 3, minElDeg = 10) {
  const obsLat = observer.lat;
  const obsLon = observer.lon;
  const obsHeightM = observer.heightM || 0;
  const minElRad = minElDeg * DEG;
  const endTs = startTs + days * 86400000;
  const passes = [];
  const stepMin = 2;
  const totalMinutes = days * 1440;
  let currentMin = (startTs.getTime() - tle.epochDate.getTime()) / 60000;
  if (currentMin < 0) return passes;
  let prevElev = -999;
  let inPass = false;
  let passStart = null;
  let passBestElev = -999;
  let passBestTs = null;
  let passStartAz = 0;
  for (let m = 0; m <= totalMinutes; m += stepMin) {
    const ts = new Date(startTs.getTime() + m * 60000);
    const jd = ts.getTime() / 86400000 + 0.5;
    const minEpoch = (jd - tle.epoch) * MIN_PER_DAY;
    const sat = sgp4(tle, minEpoch);
    const sez = ecefToTopocentric(sat.x_ecf, sat.y_ecf, sat.z_ecf, obsLat, obsLon, obsHeightM);
    const range = Math.sqrt(sez.S * sez.S + sez.E * sez.E + sez.Z * sez.Z);
    const elev = Math.atan2(sez.Z, Math.sqrt(sez.S * sez.S + sez.E * sez.E));
    let azSEZ = Math.atan2(sez.E, -sez.S);
    let azNorth = normDeg(azSEZ * RAD + 180);
    const elevDeg = elev * RAD;
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
        const passEnd = new Date(startTs.getTime() + m * 60000);
        const durationS = (passEnd.getTime() - passStart.getTime()) / 1000;
        const sunAtPeak = sunAltitudeAtTime(passBestTs, obsLat, obsLon);
        const sunBelow6 = sunAtPeak < -6;
        const sunlit = sat.altitudeKm > 150;
        const visible = sunBelow6 && sunlit;
        passes.push({ riseTs: passStart, riseAz: passStartAz, peakTs: passBestTs, peakAlt: passBestElev, peakAz: azNorth, setTs: passEnd, setAz: azNorth, durationS, visible });
        inPass = false; passStart = null; passBestElev = -999;
      }
    }
    prevElev = elev;
  }
  passes.sort((a, b) => a.riseTs - b.riseTs);
  return passes;
}

function sunAltitudeAtTime(ts, lat, lon) {
  const jd = ts.getTime() / 86400000 + 0.5;
  const sun = sunPosition(jd);
  const lst = lstDeg(jd, lon);
  const az = equatorialToHorizontal(sun.ra, sun.dec, lat, lst);
  return az.alt;
}

function sunPosition(jd) {
  const n = jd - J2000;
  const M = (357.5291092 + 0.9856002817 * n) % 360;
  const C = 1.914602 * Math.sin(M * DEG) + 0.020007 * Math.sin(2 * M * DEG);
  const lambda = (M + C + 180 + 102.93735) % 360;
  const obl = 23.439291 - 0.0130042 * (jd - J2000) / 36525;
  const ra = Math.atan2(Math.sin(lambda * DEG) * Math.cos(obl * DEG), Math.cos(lambda * DEG)) * RAD;
  const dec = Math.asin(Math.sin(lambda * DEG) * Math.sin(obl * DEG)) * RAD;
  return { ra: ra % 360, dec, lambda };
}

function equatorialToHorizontal(raDeg, decDeg, latDeg, lstDegVal) {
  const lata = latDeg * DEG;
  const deca = decDeg * DEG;
  const lha = (lstDegVal - raDeg) * DEG;
  const sinAlt = Math.sin(deca) * Math.sin(lata) + Math.cos(deca) * Math.cos(lata) * Math.cos(lha);
  const alt = Math.asin(clamp(sinAlt, -1, 1));
  const y = Math.sin(lha);
  const x = Math.cos(lha) * Math.sin(lata) - (Math.tan(deca) || 0) * Math.cos(lata);
  let az = Math.atan2(y, x) * RAD + 180;
  return { alt: alt * RAD, az: normDeg(az) };
}

export function getDefaultTLE() {
  return {
    line1: '1 25544U 98067A   25176.50000000  .00000600  00000-0  10000-4 0  9999',
    line2: '2 25544  51.6400  75.0000 0001193 210.0000  90.0000 15.50000000   1234'
  };
}
