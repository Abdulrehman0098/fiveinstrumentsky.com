/* ============================================================
   astronomy.js — coordinate transforms, rise/set, planet positions
   Vendored. No runtime network.
   ============================================================ */

const Astronomy = (() => {
  'use strict';

  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;
  const J2000 = 2451545.0; // Julian date of J2000.0

  /* ---------- Julian date helpers ---------- */

  function julianDate(date) {
    const d = new Date(date);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const hr = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    if (m <= 2) { y -= 1; }
    const A = Math.floor(y / 100);
    const B = 2 - A + Math.floor(A / 4);
    const JD = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + hr / 24 + B - 1524.5;
    return JD;
  }

  function julianCenturies(jd) {
    return (jd - J2000) / 36525;
  }

  /* ---------- Local Sidereal Time ---------- */

  function localSiderealTime(jd, lonDeg) {
    const T = julianCenturies(jd);
    const GST = 280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * T * T - T * T * T / 38710000;
    const gstNorm = ((GST % 360) + 360) % 360;
    const lst = (gstNorm + lonDeg) % 360;
    return ((lst % 360) + 360) % 360; // degrees
  }

  /* ---------- RA/Dec to Alt/Az ---------- */

  function raDecToAltAz(raDeg, decDeg, latDeg, lonDeg, date) {
    const jd = julianDate(date);
    const lst = localSiderealTime(jd, lonDeg);
    const ha = lst - raDeg; // hour angle in degrees

    const latR = latDeg * DEG;
    const decR = decDeg * DEG;
    const haR = ha * DEG;

    const sinAlt = Math.sin(decR) * Math.sin(latR) + Math.cos(decR) * Math.cos(latR) * Math.cos(haR);
    const alt = Math.asin(sinAlt) * RAD;

    const cosAz = (Math.sin(decR) - Math.sin(alt * DEG) * Math.sin(latR)) /
                  (Math.cos(alt * DEG) * Math.cos(latR));
    let az = Math.acos(clamp(cosAz, -1, 1)) * RAD;
    if (Math.sin(haR) > 0) az = 360 - az;

    return { alt, az: ((az % 360) + 360) % 360 };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ---------- Ecliptic to Equatorial (for planets) ---------- */

  function eclipticToEquatorial(lonDeg, latDeg, obliquityDeg) {
    const lonR = lonDeg * DEG;
    const latR = latDeg * DEG;
    const oblR = obliquityDeg * DEG;

    const ra = Math.atan2(
      Math.sin(lonR) * Math.cos(oblR) - Math.tan(latR) * Math.sin(oblR),
      Math.cos(lonR)
    ) * RAD;
    const dec = Math.asin(
      Math.sin(latR) * Math.cos(oblR) + Math.cos(latR) * Math.sin(oblR) * Math.sin(lonR)
    ) * RAD;

    return {
      ra: ((ra % 360) + 360) % 360,
      dec: clamp(dec, -90, 90),
    };
  }

  /* ---------- Kepler equation (solve for eccentric anomaly) ---------- */

  function solveKepler(M, e, tol) {
    tol = tol || 1e-8;
    let E = M;
    for (let i = 0; i < 100; i++) {
      const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
      E += dE;
      if (Math.abs(dE) < tol) break;
    }
    return E;
  }

  /* ---------- Planet position (simplified Keplerian) ---------- */

  function planetPosition(planet, date) {
    const d = new Date(date);
    const jd = julianDate(d);
    const T = julianCenturies(jd);
    const L0 = planet.L0 + planet.L1 * T; // mean longitude
    const M_deg = (planet.M0 + planet.M1 * T) % 360; // mean anomaly
    const M = M_deg * DEG;
    const e = planet.ecc;
    const E = solveKepler(M, e);


    // For inner planets we use a heliocentric approximation.
    // We'll compute heliocentric ecliptic longitude + latitude, then
    // convert to geocentric RA/Dec using a basic ecliptic-to-equatorial transform.

    const a = planet.sma; // semi-major axis (AU)
    const r = a * (1 - e * Math.cos(E)); // heliocentric distance (AU)
    const v = 2 * Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E / 2),
      Math.sqrt(1 - e) * Math.cos(E / 2)
    ) * RAD; // true anomaly

    // Heliocentric ecliptic longitude of planet
    const lonElong = L0 + v;
    const lonEcl = ((lonElong % 360) + 360) % 360;

    // Approximate geocentric position (for outer planets this is crude;
    // for inner planets it's also approximate but usable for sky display)
    // We treat the planet as being at its heliocentric position relative to Earth
    // by assuming Earth is at longitude L_Earth = 100.46 + 35999.3727 * T (mean longitude)
    const L_Earth = (100.46 + 35999.3727 * T) % 360;
    const earthLon = ((L_Earth % 360) + 360) % 360;

    // Geocentric ecliptic longitude via corrected vector geometry
    // Geocentric RA/Dec from heliocentric positions using vector difference
    const dlon = (lonEcl - earthLon) * DEG;
    const rPlanet = r;       // AU
    const rEarth = 1.0;      // AU
    const geoLonRad = earthLon * DEG + Math.atan2(
      rPlanet * Math.sin(dlon),
      rEarth - rPlanet * Math.cos(dlon)
    );
    const geoLon = ((geoLonRad * RAD) % 360 + 360) % 360;

    // Geocentric ecliptic latitude (approximate — assume near ecliptic)
    const latEcl = 0;

    // Convert to equatorial
    const obl = 23.439291 - 0.0130042 * T; // obliquity of ecliptic
    const eq = eclipticToEquatorial(geoLon, latEcl, obl);

    // Distance in AU
    const distAU = r;

    return {
      ra: eq.ra,
      dec: eq.dec,
      distAU,
      lonEcl: geoLon,
    };
  }

  /* ---------- Solar position ---------- */

  function sunPosition(date) {
    const d = new Date(date);
    const jd = julianDate(d);
    const n = jd - 2451545.0;
    const M = (357.5291092 + 0.9856002817 * n) % 360; // mean anomaly (deg)
    const C = 1.914602 * Math.sin(M * DEG) + 0.020007 * Math.sin(2 * M * DEG) + 0.000331 * Math.sin(3 * M * DEG);
    const lambda = (M + C + 180 + 102.93735) % 360; // ecliptic longitude
    const obl = 23.439291 - 0.0130042 * (jd - J2000) / 36525;
    const eq = eclipticToEquatorial(lambda, 0, obl);
    // Distance in AU
    const a = 1.000001018;
    const e = 0.016708634;
    const E_sun = M + C;
    const r = a * (1 - e * Math.cos(E_sun * DEG));
    return { ra: eq.ra, dec: eq.dec, distAU: r };
  }

  /* ---------- Moon position (simplified) ---------- */

  function moonPosition(date) {
    const d = new Date(date);
    const jd = julianDate(d);
    const T = julianCenturies(jd);
    const L = 218.3165 + 481267.8813 * T; // mean longitude
    const M = 134.9629 + 477198.8676 * T; // mean anomaly
    const F = 93.2720 + 483202.0175 * T; // argument of latitude
    const D = 297.8502 + 445267.1115 * T; // mean elongation

    const lon = L + 6.289 * Math.sin(F * DEG) + 1.274 * Math.sin((M - F) * DEG) +
                0.658 * Math.sin((2*D - F) * DEG);
    const lat = 5.128 * Math.sin(F * DEG) + 0.280 * Math.sin((M + F) * DEG) +
                 0.277 * Math.sin((M - F) * DEG);

    const obl = 23.439291 - 0.0130042 * T;
    const eq = eclipticToEquatorial(lon % 360, lat, obl);

    // Phase: illuminated fraction
    const ph = (1 + Math.cos(D * DEG)) / 2;

    return {
      ra: eq.ra,
      dec: eq.dec,
      phase: ph,
      lon: lon % 360,
      lat: lat,
    };
  }

  /* ---------- Rise/set times ---------- */

  function riseSetTimes(raDeg, decDeg, latDeg, lonDeg, date, searchWindowHours) {
    searchWindowHours = searchWindowHours || 24;
    const jd0 = julianDate(date);
    const results = [];

    // Sample every 4 minutes over the search window
    const steps = Math.ceil(searchWindowHours * 15); // 4-min steps
    let prevAltVal = -999;

    for (let i = 0; i <= steps; i++) {
      const dt = (i / steps) * searchWindowHours * 3600; // seconds from start
      const jd = jd0 + dt / 86400;
      const pos = raDecToAltAz(raDeg, decDeg, latDeg, lonDeg, new Date(jd * 86400000));
      const alt = pos.alt;

      // Horizon crossing (altitude 0) — check sign change
      if (i > 0 && ((prevAltVal < 0 && alt >= 0) || (prevAltVal >= 0 && alt < 0))) {
        // Linear interpolation for better accuracy
        const frac = prevAltVal / (prevAltVal - alt);
        const crossingSeconds = (i - 1 + frac) * (searchWindowHours * 3600 / steps);
        const crossingDate = new Date((jd0 * 86400000 + crossingSeconds * 1000));
        const event = prevAltVal < 0 ? 'rise' : 'set';
        results.push({ event, time: crossingDate, alt: 0 });
      }
      prevAltVal = alt;
    }

    return results;
  }

  /* ---------- Moon phase name ---------- */

  function moonPhaseName(phase) {
    // phase: 0..1 (0 = new, 0.5 = full)
    if (phase < 0.025 || phase > 0.975) return 'New Moon';
    if (phase < 0.225) return 'Waxing Crescent';
    if (phase < 0.275) return 'First Quarter';
    if (phase < 0.475) return 'Waxing Gibbous';
    if (phase < 0.525) return 'Full Moon';
    if (phase < 0.725) return 'Waning Gibbous';
    if (phase < 0.775) return 'Last Quarter';
    return 'Waning Crescent';
  }

  function moonIlluminationPhase(phase) {
    // Returns angle 0..2pi for the illuminated fraction visualization
    return phase * 2 * Math.PI;
  }

  /* ---------- Degrees to HMS (RA) ---------- */

  function raToHMS(raDeg) {
    const h = Math.floor(raDeg / 15);
    const m = Math.floor((raDeg % 15) * 4);
    const s = ((raDeg % 15) * 4 - m) * 60;
    return `${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${s.toFixed(1)}s`;
  }

  /* ---------- Degrees to DMS (Dec) ---------- */

  function decToDMS(decDeg) {
    const sign = decDeg >= 0 ? '+' : '-';
    const d = Math.floor(Math.abs(decDeg));
    const m = Math.floor((Math.abs(decDeg) - d) * 60);
    const s = ((Math.abs(decDeg) - d) * 60 - m) * 60;
    return `${sign}${d}° ${m}' ${s.toFixed(1)}"`;
  }

  return {
    julianDate,
    julianCenturies,
    localSiderealTime,
    raDecToAltAz,
    eclipticToEquatorial,
    planetPosition,
    sunPosition,
    moonPosition,
    riseSetTimes,
    moonPhaseName,
    moonIlluminationPhase,
    raToHMS,
    decToDMS,
    DEG,
    RAD,
  };
})();

export default Astronomy;
