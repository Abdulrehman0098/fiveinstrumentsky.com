/* ============================================================
   permissions.js — orchestrator for all sensor states.
   Returns friendly states: granted | denied | prompt | unsupported | insecure
   ============================================================ */

const isInsecure = location.protocol === "http:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1";

export const Permissions = {
  secureContext: !isInsecure,
  isFile: location.protocol === "file:",

  async geolocation() {
    if (this.isFile) return "insecure";
    if (!navigator.geolocation) return "unsupported";
    try {
      const p = await navigator.permissions.query({ name: "geolocation" }).catch(() => null);
      if (p) {
        if (p.state === "granted") return "granted";
        if (p.state === "denied") return "denied";
        return "prompt";
      }
      return "prompt";
    } catch (_) {
      return "prompt";
    }
  },

  async microphone() {
    if (this.isFile) return "insecure";
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return "unsupported";
    try {
      const p = await navigator.permissions.query({ name: "microphone" }).catch(() => null);
      if (p) {
        if (p.state === "granted") return "granted";
        if (p.state === "denied") return "denied";
        return "prompt";
      }
      return "prompt";
    } catch (_) {
      return "prompt";
    }
  },

  async deviceMotion() {
    if (this.isFile) return "insecure";
    if (!window.DeviceMotionEvent) return "unsupported";
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) {
      try {
        const p = await navigator.permissions.query({ name: "device-motion" }).catch(() => null);
        if (p && p.state === "denied") return "denied";
        if (p && p.state === "granted") return "granted";
      } catch (_) {}
      return "prompt";
    }
    try {
      const p = await navigator.permissions.query({ name: "device-motion" }).catch(() => null);
      if (p) {
        if (p.state === "granted") return "granted";
        if (p.state === "denied") return "denied";
        return "prompt";
      }
      return "prompt";
    } catch (_) {
      return "prompt";
    }
  },

  async deviceOrientation() {
    if (this.isFile) return "insecure";
    if (!window.DeviceOrientationEvent) return "unsupported";
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) {
      try {
        const p = await navigator.permissions.query({ name: "device-orientation" }).catch(() => null);
        if (p && p.state === "denied") return "denied";
        if (p && p.state === "granted") return "granted";
      } catch (_) {}
      return "prompt";
    }
    try {
      const p = await navigator.permissions.query({ name: "device-orientation" }).catch(() => null);
      if (p) {
        if (p.state === "granted") return "granted";
        if (p.state === "denied") return "denied";
        return "prompt";
      }
      return "prompt";
    } catch (_) {
      return "prompt";
    }
  },

  async magnetometer() {
    if (this.isFile) return "insecure";
    if (!("Magnetometer" in window) && !("UncalibratedMagnetometer" in window)) return "unsupported";
    try {
      const p = await navigator.permissions.query({ name: "magnetometer" }).catch(() => null);
      if (p) {
        if (p.state === "granted") return "granted";
        if (p.state === "denied") return "denied";
        return "prompt";
      }
    } catch (_) {}
    return "prompt";
  },

  async accelerometer() {
    if (this.isFile) return "insecure";
    if (!("Accelerometer" in window)) return "unsupported";
    try {
      const p = await navigator.permissions.query({ name: "accelerometer" }).catch(() => null);
      if (p) {
        if (p.state === "granted") return "granted";
        if (p.state === "denied") return "denied";
        return "prompt";
      }
    } catch (_) {}
    return "prompt";
  },

  async linearAcceleration() {
    if (this.isFile) return "insecure";
    if (!("LinearAccelerationSensor" in window)) return "unsupported";
    try {
      const p = await navigator.permissions.query({ name: "accelerometer" }).catch(() => null);
      if (p) {
        if (p.state === "granted") return "granted";
        if (p.state === "denied") return "denied";
        return "prompt";
      }
    } catch (_) {}
    return "prompt";
  },

  async barometer() {
    if (this.isFile) return "insecure";
    if (!("Barometer" in window)) return "unsupported";
    return "prompt";
  },

  async wakeLock() {
    if (this.isFile) return "insecure";
    if (!navigator.wakeLock) return "unsupported";
    return "supported";
  }
};

export async function requestIOSMotionPermission() {
  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      const r = await DeviceMotionEvent.requestPermission();
      return r;
    } catch (_) { return "denied"; }
  }
  return "denied";
}

export async function requestIOSOrientationPermission() {
  if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    try {
      const r = await DeviceOrientationEvent.requestPermission();
      return r;
    } catch (_) { return "denied"; }
  }
  return "denied";
}
