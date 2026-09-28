/* ============================================================
   units.js — metric/imperial switch, persisted, emits unitschange
   ============================================================ */

const UNIT_KEY = "fi-unit";
const SYSTEMS = ["metric", "imperial"];

export const Units = {
  system: "metric",

  init() {
    const stored = safeStorage.get(UNIT_KEY, null);
    if (stored && SYSTEMS.includes(stored)) {
      this.system = stored;
    } else {
      this.system = SYSTEMS[0];
    }
    this.apply();
  },

  toggle() {
    this.system = this.system === "metric" ? "imperial" : "metric";
    this.apply();
  },

  set(system) {
    if (SYSTEMS.includes(system)) {
      this.system = system;
      this.apply();
    }
  },

  apply() {
    try {
      safeStorage.set(UNIT_KEY, this.system);
    } catch (_) {}
    SensorBus.emit("unitschange", this.system);
  },

  isMetric() { return this.system === "metric"; },
  getSystem() { return this.system; }
};

export function getUnits() { return Units.system; }
export function toggleUnits() { Units.toggle(); }
