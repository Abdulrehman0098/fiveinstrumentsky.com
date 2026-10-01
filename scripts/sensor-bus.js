(function() {
'use strict';

/* ============================================================
   sensor-bus.js — tiny pub/sub with sticky last-value cache
   ============================================================ */

const handlers = new Map();
const lastValues = new Map();
let cbId = 0;

const SensorBus = {
  on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type).add(fn);
    return () => this.off(type, fn);
  },

  off(type, fn) {
    const set = handlers.get(type);
    if (set) { set.delete(fn); if (set.size === 0) handlers.delete(type); }
  },

  once(type, fn) {
    const unsub = this.on(type, (v) => { fn(v); unsub(); });
  },

  emit(type, value) {
    lastValues.set(type, value);
    const set = handlers.get(type);
    if (set) for (const fn of set) { try { fn(value); } catch (e) {} }
  },

  getLast(type) {
    return lastValues.get(type);
  },

  clear() {
    handlers.clear();
    lastValues.clear();
  }
};


window.FI = window.FI || {};
window.FI.sensorBus = SensorBus;
})();
