// Messier objects with J2000 positions
window.FI_MESSIER = [
  { id: "M31", name: "Andromeda Galaxy", ra: 0.7125, dec: 41.2992, type: "Galaxy", size: "3.2 x 1.0 deg" },
  { id: "M42", name: "Orion Nebula", ra: 5.5883, dec: -5.3911, type: "Nebula", size: "85 x 60 arcmin" },
  { id: "M45", name: "Pleiades", ra: 3.5000, dec: 24.1000, type: "Cluster", size: "110 arcmin" },
  { id: "M13", name: "Hercules Globular", ra: 16.6958, dec: 36.4617, type: "Cluster", size: "20 arcmin" },
  { id: "M44", name: "Beehive Cluster", ra: 8.6667, dec: 20.0833, type: "Cluster", size: "95 arcmin" },
  { id: "M8", name: "Lagoon Nebula", ra: 18.2333, dec: -24.3833, type: "Nebula", size: "90 x 40 arcmin" },
  { id: "M27", name: "Dumbbell Nebula", ra: 19.9958, dec: 22.7167, type: "Nebula", size: "8 x 5 arcmin" },
  { id: "M57", name: "Ring Nebula", ra: 18.8975, dec: 33.0283, type: "Nebula", size: "1.4 x 1.0 arcmin" }
];

if (typeof Object.freeze === "function") Object.freeze(window.FI_MESSIER);
