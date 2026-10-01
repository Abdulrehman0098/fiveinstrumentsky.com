// Planetary Keplerian elements for JPL approximate 1800-2050
// L0, L1: mean longitude at epoch (deg) and rate (deg/day)
// M0, M1: mean anomaly at epoch (deg) and rate (deg/day)
// ecc: eccentricity, sma: semi-major axis (AU)
window.FI_PLANETS = [
  { name: "Mercury", symbol: "\u263F", color: "#b5a38a",
    L0: 252.2509, L1: 1494.3396, M0: 174.7948, M1: 4.092334,
    ecc: 0.205631, sma: 0.387098, inc: 7.004, node: 48.331, argP: 29.125 },
  { name: "Venus", symbol: "\u2640", color: "#e8cda0",
    L0: 181.9798, L1: 58557.2496, M0: 104.1649, M1: 1602.9396,
    ecc: 0.006773, sma: 0.723332, inc: 3.394, node: 76.678, argP: 54.883 },
  { name: "Mars", symbol: "\u2642", color: "#c1440e",
    L0: 355.4530, L1: 6890.0679, M0: 19.3730, M1: 6.241998,
    ecc: 0.093394, sma: 1.523679, inc: 1.849, node: 49.558, argP: 286.502 },
  { name: "Jupiter", symbol: "\u2643", color: "#d4a574",
    L0: 34.3515, L1: 2026.1998, M0: 49.9475, M1: 20.805045,
    ecc: 0.048386, sma: 5.202603, inc: 1.303, node: 100.464, argP: 273.867 },
  { name: "Saturn", symbol: "\u2644", color: "#ead3a0",
    L0: 51.3892, L1: 1221.7076, M0: 316.7108, M1: 34.331993,
    ecc: 0.054224, sma: 9.554910, inc: 2.488, node: 113.665, argP: 339.391 }
];

if (typeof Object.freeze === "function") Object.freeze(window.FI_PLANETS);
