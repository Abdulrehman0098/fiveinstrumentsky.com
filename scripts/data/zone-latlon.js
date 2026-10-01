// IANA timezone to approximate lat/lon mapping
// Used when geolocation is unavailable
window.FI_ZONE_LATLNG = {
  "UTC":            { lat: 0, lon: 0, label: "UTC" },
  "GMT":            { lat: 0, lon: 0, label: "GMT" },
  "America/New_York":     { lat: 40.71, lon: -74.01, label: "New York" },
  "America/Chicago":      { lat: 41.88, lon: -87.63, label: "Chicago" },
  "America/Denver":       { lat: 39.74, lon: -104.99, label: "Denver" },
  "America/Los_Angeles":  { lat: 34.05, lon: -118.24, label: "Los Angeles" },
  "America/Sao_Paulo":    { lat: -23.55, lon: -46.63, label: "Sao Paulo" },
  "Europe/London":        { lat: 51.51, lon: -0.13, label: "London" },
  "Europe/Paris":         { lat: 48.86, lon: 2.35, label: "Paris" },
  "Europe/Berlin":        { lat: 52.52, lon: 13.41, label: "Berlin" },
  "Europe/Moscow":        { lat: 55.76, lon: 37.62, label: "Moscow" },
  "Africa/Cairo":         { lat: 30.04, lon: 31.24, label: "Cairo" },
  "Africa/Johannesburg":  { lat: -26.20, lon: 28.04, label: "Johannesburg" },
  "Asia/Dubai":           { lat: 25.20, lon: 55.27, label: "Dubai" },
  "Asia/Karachi":         { lat: 24.86, lon: 67.01, label: "Karachi" },
  "Asia/Kolkata":         { lat: 28.61, lon: 77.23, label: "Delhi" },
  "Asia/Dhaka":           { lat: 23.81, lon: 90.41, label: "Dhaka" },
  "Asia/Bangkok":         { lat: 13.76, lon: 100.50, label: "Bangkok" },
  "Asia/Shanghai":        { lat: 31.23, lon: 121.47, label: "Shanghai" },
  "Asia/Tokyo":           { lat: 35.68, lon: 139.76, label: "Tokyo" },
  "Asia/Seoul":           { lat: 37.57, lon: 126.98, label: "Seoul" },
  "Australia/Sydney":     { lat: -33.87, lon: 151.21, label: "Sydney" },
  "Pacific/Auckland":     { lat: -36.85, lon: 174.76, label: "Auckland" }
};

if (typeof Object.freeze === "function") Object.freeze(window.FI_ZONE_LATLNG);
