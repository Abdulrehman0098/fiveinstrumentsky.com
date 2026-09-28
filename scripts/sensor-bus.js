/* ============================================================
   scripts/sensor-bus.js — Event bus for cross-instrument events
   ============================================================ */

export class SensorBus {
  constructor() {
    this._listeners = {};
  }

  on(event, handler) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(handler);
  }

  off(event, handler) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(h => h !== handler);
  }

  emit(event, data) {
    if (!this._listeners[event]) return;
    const handlers = this._listeners[event];
    for (let i = handlers.length - 1; i >= 0; i--) {
      try {
        handlers[i](data);
      } catch (e) {
        console.warn(`[SensorBus] handler for '${event}' threw:`, e);
      }
    }
  }
}
