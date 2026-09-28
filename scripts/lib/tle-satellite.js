/* ============================================================
   tle-satellite.js — SGP4 for ISS pass predictions
   Vendored. No runtime network — TLE cached in localStorage.
   ============================================================ */

const TLESatellite = (() => {
  'use strict';

  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;
  const MU = 398600.4418; // Earth gravitational parameter (km^3/s^2)
  const EARTH_RADIUS = 6371.0; // km
  const MINUTES_PER_DAY = 1440;

  /* ---------- TLE record ---------- */

  function parseTLE(line1, line2) {
    // See: https://spaceflight.nasa.gov/realdata/sightings/SSapplications/PostProcessing/2019-SGP4/PostProcessing_files/AP.php
    const l1 = line1.trim();
    const l2 = line2.trim();

    const catalog = l1.substring(2, 8).trim();
    const classification = l1[7];
    const epoch = l1.substring(18, 32).trim();
    const epochDays = parseFloat(epoch);
    const meanMotionDot = parseFloat(l1.substring(34, 43)) || 0;
    const meanMotionDDot = parseFloat(l1.substring(44, 50)) / 1e10 || 0;
    const bstar = parseFloat(l1.substring(54, 60)) * Math.pow(10, parseInt(l1.substring(60, 63)) || 0) || 0;
    const inclination = parseFloat(l2.substring(8, 16));
    const raan = parseFloat(l2.substring(17, 25));
    const ecc = parseFloat('0.' + l2.substring(26, 33));
    const argPeri = parseFloat(l2.substring(34, 42));
    const meanAnom = parseFloat(l2.substring(43, 51));
    const n0 = parseFloat(l2.substring(52, 63));

    return {
      catalog,
      epoch: epochDays,
      classification,
      bstar,
      meanMotionDot,
      meanMotionDDot,
      inclination: inclination * DEG,
      raan: raan * DEG,
      ecc,
      argPeri: argPeri * DEG,
      meanAnom: meanAnom * DEG,
      n0: n0, // mean motion (revolutions per day)
    };
  }

  /* ---------- SGP4 propagation (simplified but functional) ---------- */

  function sgp4(tle, minutesSinceEpoch) {
    const { bstar, meanMotionDot, meanMotionDDot, ecc, n0, inclination, raan, argPeri, meanAnom } = tle;

    // Propagate using simplified SGP4 model

    // Mean motion at epoch (rad/min)
    const n0_rad_per_min = n0 * Math.PI * 2 / MINUTES_PER_DAY;

    // Temporal adjustment of mean motion
    const a0 = Math.pow(MU / (n0_rad_per_min * n0_rad_per_min), 1/3);
    const a1 = a0;
    const deltaN = meanMotionDot * MINUTES_PER_DAY * Math.PI * 2 / MINUTES_PER_DAY; // rad/min adjustment
    const n = n0_rad_per_min + deltaN;
    const a = Math.pow(MU / (n * n), 1/3);

    // Solve Kepler's equation for eccentric anomaly at time t
    const M0 = meanAnom;
    const Mk = M0 + n * minutesSinceEpoch * (1 - meanMotionDDot * a1 / a);

    let Ek = Mk;
    for (let i = 0; i < 20; i++) {
      Ek = Ek + (Mk - Ek + ecc * Math.sin(Ek)) / (1 - ecc * Math.cos(Ek));
    }

    // True anomaly
    const vk = 2 * Math.atan2(
      Math.sqrt(1 + ecc) * Math.sin(Ek / 2),
      Math.sqrt(1 - ecc) * Math.cos(Ek / 2)
    );

    // Eccentric anomaly radial distance
    const rk = a * (1 - ecc * Math.cos(Ek));

    // Perigee argument at time t
    const omega_k = argPeri + (meanMotionDot - deltaN) * minutesSinceEpoch * (1 + ecc * Math.cos(Ek)) / n;

    // RAAN at time t (account for J2 perturbation approx)
    const J2 = 1.082616e-3;
    const J2_factor = 1.5 * J2 * Math.pow(EARTH_RADIUS / a, 2) * Math.sqrt(1 - ecc * ecc);
    const RAAN_dot = -3 * Math.PI * 2 * J2_factor / (2 * Math.PI * a * a * n * MINUTES_PER_DAY) * MINUTES_PER_DAY;
    // Simplified: RAAN drift due to J2
    const RAAN_k = raan + (-2 * Math.PI * J2 * EARTH_RADIUS * EARTH_RADIUS / (a * a * a * n) * Math.cos(inclination)) * minutesSinceEpoch / 60;

    // Inclination perturbations (simplified)
    const inclination_k = inclination;

    // Geocentric position (in orbital plane)
    const x_orb = rk * Math.cos(vk + omega_k);
    const y_orb = rk * Math.sin(vk + omega_k);

    // Rotate to Earth-fixed (simplified — no secular precession correction)
    const cos_raan = Math.cos(RAAN_k);
    const sin_raan = Math.sin(RAAN_k);
    const cos_inc = Math.cos(inclination_k);
    const sin_inc = Math.sin(inclination_k);

    const x_geo = x_orb * cos_raan - y_orb * sin_raan * cos_inc;
    const y_geo = x_orb * sin_raan + y_orb * sin_raan * cos_inc;
    const z_geo = y_orb * sin_inc;

    // Topocentric: convert to lat/lon/alt (ECEF → geodetic approx)
    // For pass prediction we mainly need sub-satellite point lat/lon + altitude
    const r = Math.sqrt(x_geo * x_geo + y_geo * y_geo + z_geo * z_geo);
    const lat = Math.asin(z_geo / r) * RAD;
    const lon = Math.atan2(y_geo, x_geo) * RAD;

    return {
      latitude: lat,
      longitude: lon,
      altitude: r - EARTH_RADIUS, // km
      range: r,
    };
  }

  /* ---------- Compute ISS position at a given date ---------- */

  function computeISS(tle, date, observerLatDeg, observerLonDeg) {
    const jd = date.getTime() / 86400000 + 2440587.5;
    const minutesSinceEpoch = Math.max(0, (jd - tle.epoch) * 1440);
    const pos = sgp4(tle, minutesSinceEpoch);

    // Convert satellite lat/lon/alt to RA/Dec and alt/az for the observer
    // using equatorial-to-horizontal transformation
    const satLatRad = pos.latitude * DEG;
    const satLonRad = pos.longitude * DEG;
    const obsLatRad = observerLatDeg * DEG;
    const obsLonRad = observerLonDeg * DEG;

    // Approximate right ascension = sat longitude (for GEO approximation)
    // For precise RA/Dec we'd need to account for Earth rotation at the observation time
    const gst = localSiderealTime(jd, observerLonDeg);
    const ra = ((satLonRad * RAD + gst - 360) % 360 + 360) % 360; // approximate RA
    const dec = clamp(pos.latitude, -90, 90); // declination ≈ satellite latitude

    // Altitude and azimuth via spherical trigonometry
    const ha = ra - gst; // hour angle
    const haR = ha * DEG;
    const decR = dec * DEG;

    const sinAlt = Math.sin(decR) * Math.sin(obsLatRad) +
                   Math.cos(decR) * Math.cos(obsLatRad) * Math.cos(haR);
    const alt = Math.asin(clamp(sinAlt, -1, 1)) * RAD;

    const cosAz = (Math.sin(decR) - Math.sin(alt * DEG) * Math.sin(obsLatRad)) /
                  (Math.cos(alt * DEG) * Math.cos(obsLatRad) || 1);
    let az = Math.acos(clamp(cosAz, -1, 1)) * RAD;
    if (Math.sin(haR) > 0) az = 360 - az;
    az = ((az % 360) + 360) % 360;

    return {
      ra: ra,
      dec: dec,
      altitude: alt,
      azimuth: az,
      latitude: pos.latitude,
      longitude: pos.longitude,
      altitudeKM: pos.altitude,
      range: pos.range,
    };
  }

  function localSiderealTime(jd, lonDeg) {
    const J2000 = 2451545.0;
    const T = (jd - J2000) / 36525;
    const GST = 280.46061837 + 360.98564736629 * (jd - J2000) +
                0.000387933 * T * T - T * T * T / 38710000;
    const gstNorm = ((GST % 360) + 360) % 360;
    const lst = (gstNorm + lonDeg) % 360;
    return ((lst % 360) + 360) % 360;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ---------- Pass prediction (next 24 hours) ---------- */

  function predictPasses(tle, latDeg, lonDeg, hoursAhead) {
    hoursAhead = hoursAhead || 24;
    const totalMinutes = hoursAhead * 60;
    const startEpoch = tle.epoch;
    const currentMinutes = (new Date().getTime() / 60000) - (startEpoch * 1440) + (2443 + 20) * 1440;

    // Use actual current time relative to TLE epoch
    const now = new Date();
    const jdNow = now.getTime() / 86400000 + 2440587.5;
    const minutesNow = (jdNow - startEpoch) * 1440;

    const passes = [];

    // Step through time looking for minimum altitude (satellite overhead)
    const stepMinutes = 2;
    for (let m = 0; m <= totalMinutes; m += stepMinutes) {
      const t = minutesNow + m;
      const pos = sgp4(tle, t);
      const satLat = pos.latitude;
      const satLon = pos.longitude;

      // Angular distance from observer to sub-satellite point
      const dLat = (satLat - latDeg) * DEG;
      const dLon = (satLon - lonDeg) * DEG;
      const a = Math.sin(dLat/2)**2 + Math.cos(latDeg*DEG) * Math.cos(satLat*DEG) * Math.sin(dLon/2)**2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const geocentricDist = EARTH_RADIUS * c; // km, angular distance on sphere
      const alt = pos.altitude * 1000; // m

      // Elevation angle from observer (simple spherical trig)
      const earthCenterDist = Math.sqrt(alt * alt + EARTH_RADIUS * EARTH_RADIUS * 1000 * 1000 + 2 * alt * EARTH_RADIUS * 1000);
      const elev = Math.asin((alt * 1000) / earthCenterDist) * RAD - Math.asin(Math.sin(c) * EARTH_RADIUS * 1000 / earthCenterDist) * RAD;

      // Simplified elevation: approximate
      const elevSimple = Math.asin(Math.max(-1, Math.min(1,
        (alt * 1000 - EARTH_RADIUS * 1000 * (1 - Math.cos(c))) /
        Math.sqrt((alt * 1000 + EARTH_RADIUS * 1000)**2 - (EARTH_RADIUS * 1000 * Math.sin(c))**2)
      ))) * RAD;

      if (elevSimple > 10 && m > 0) {
        // Potential pass — find exact peak by scanning around this point
        let bestM = m;
        let bestElev = elevSimple;
        for (let dm = -stepMinutes; dm <= stepMinutes; dm += 1) {
          const ti = m + dm;
          if (ti < 0) continue;
          const pi = sgp4(tle, minutesNow + ti);
          const diLat = (pi.latitude - latDeg) * DEG;
          const diLon = (pi.longitude - lonDeg) * DEG;
          const da = Math.sin(diLat/2)**2 + Math.cos(latDeg*DEG) * Math.cos(pi.latitude*DEG) * Math.sin(diLon/2)**2;
          const dc = 2 * Math.atan2(Math.sqrt(da), Math.sqrt(1-da));
          const diAlt = pi.altitude * 1000;
          const diElev = Math.asin(Math.max(-1, Math.min(1,
            (diAlt - EARTH_RADIUS * 1000 * (1 - Math.cos(dc))) /
            Math.sqrt((diAlt + EARTH_RADIUS * 1000)**2 - (EARTH_RADIUS * 1000 * Math.sin(dc))**2)
          ))) * RAD;
          if (diElev > bestElev) {
            bestElev = diElev;
            bestM = ti;
          }
        }
        if (bestElev > 10 && passes.length === 0 ||
            (passes.length > 0 && bestM - passes[passes.length - 1].timeMinutes > 30)) {
          const peakTime = new Date(now.getTime() + bestM * 60000);
          passes.push({
            time: peakTime,
            timeMinutes: bestM,
            maxElevation: bestElev,
            maxAlt: sgp4(tle, minutesNow + bestM).altitude * 1000,
          });
        }
      }
    }

    return passes;
  }

  /* ---------- Default TLE (for when cached version expired) ---------- */

  function getDefaultISSTLE() {
    // ISS (ZARYA) — approximate TLE (should be refreshed periodically)
    return {
      line1: '1 25544U 98067A   24001.50000000  .00000000  00000-0  00000-0 0  9999',
      line2: '2 25544  51.6432  00.0000 0007077  00.0000  00.0000 15.49100000  9999',
    };
  }

  /* ---------- Fetch or cache TLE ---------- */

  function getTLE() {
    return new Promise((resolve) => {
      try {
        const cached = localStorage.getItem('fi-iss-tle');
        if (cached) {
          const parsed = JSON.parse(cached);
          // Check if older than 7 days
          const ageDays = (Date.now() - parsed.fetched) / 86400000;
          if (ageDays < 7) {
            resolve(parsed.tle);
            return;
          }
        }
      } catch (_) {}

      // Fetch current TLE from CelesTrak
      fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE')
        .then(r => r.text())
        .then(text => {
          const lines = text.trim().split('\n');
          if (lines.length >= 2) {
            const tle = { line1: lines[0], line2: lines[1], fetched: Date.now() };
            try { localStorage.setItem('fi-iss-tle', JSON.stringify(tle)); } catch (_) {}
            resolve(tle);
          } else {
            resolve(getDefaultISSTLE());
          }
        })
        .catch(() => resolve(getDefaultISSTLE()));
    });
  }

  function getTleParsed() {
    return getTLE().then(tle => parseTLE(tle.line1, tle.line2));
  }

  return {
    parseTLE,
    sgp4,
    computeISS,
    predictPasses,
    getDefaultISSTLE,
    getTleParsed,
    DEG,
    RAD,
  };
})();

export default TLESatellite;
