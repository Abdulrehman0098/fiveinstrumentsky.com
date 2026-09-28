/* ============================================================
   demo.js — realistic synthetic streams for Demo Mode.
   ============================================================ */

export const Demo = {
  enabled: false,
  starHeadingPhase: 0,
  soundTime: 0,
  vibrationTime: 0,
  magneticTime: 0,
  altimeterTime: 0,
  baseAltitude: 0,

  setEnabled(v) {
    this.enabled = !!v;
  },

  isEnabled() {
    return this.enabled;
  },

  generateSoundSample() {
    if (!this.enabled) return null;
    const t = this.soundTime;
    this.soundTime += 1 / 60;
    const noise = (Math.random() * 2 - 1) * 0.12;
    const burst = Math.sin(t * 0.15) * 0.18 * (0.5 + 0.5 * Math.sin(t * 0.4));
    const toneFreq = 400 + 200 * Math.sin(t * 0.12) + 80 * Math.sin(t * 0.4);
    const tone = Math.sin(t * toneFreq * Math.PI * 2 * 0.015) * 0.09 * (0.5 + 0.5 * Math.sin(t * 0.05));
    const sample = noise + burst + burst2 + tone;
    const rms = Math.sqrt(sample * sample);
    const peak = Math.max(0, sample);
    return { sample, rms, peak, toneFreq, now: performance.now() };
  },

  generateVibrationSample() {
    if (!this.enabled) return null;
    const t = this.vibrationTime;
    this.vibrationTime += 1 / 60;
    const impulse = Math.random() > 0.985 ? (Math.random() * 8 - 4) * 0.6 : 0;
    const x = 0.35 * Math.sin(t * 4 * Math.PI * 2) + 0.15 * Math.sin(t * 12 * Math.PI * 2 + 0.7) + 0.08 * Math.sin(t * 27 * Math.PI * 2 + 1.3) + impulse;
    const y = 0.30 * Math.sin(t * 4 * Math.PI * 2 + 0.5) + 0.12 * Math.sin(t * 12 * Math.PI * 2 + 1.1) + 0.06 * Math.sin(t * 27 * Math.PI * 2) + (impulse * 0.7);
    const z = 1.0 + 0.2 * Math.sin(t * 2 * Math.PI * 2) + 0.10 * Math.sin(t * 4 * Math.PI * 2 + 0.2) + 0.05 * Math.sin(t * 12 * Math.PI * 2 + 0.8);
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    const gTotal = magnitude / 9.80665;
    const rms = Math.sqrt((x * x + y * y + z * z) / 3);
    const peakFreq = 4 + 2 * Math.sin(t * 0.05) + (Math.random() * 1);
    return { x, y, z, magnitude, gTotal, rms, peakFreq, now: performance.now(), impulse };
  },

  generateMagneticSample(heatPointer) {
    if (!this.enabled) return null;
    const t = this.magneticTime;
    this.magneticTime += 1 / 60;
    const baseDx = 15 * Math.cos(t * 0.1);
    const baseDy = 10 * Math.sin(t * 0.08);
    const baseDz = 45 * Math.sin(t * 0.05 + 0.3);
    let anomalyStrength = 0;
    let ax = 0, ay = 0, az = 0;
    if (heatPointer !== null) {
      const an = 15 * Math.sin(heatPointer.x * 10) * Math.cos(heatPointer.y * 8);
      ax = an; ay = an * 0.6; az = an * 0.8;
      anomalyStrength = Math.abs(an);
    }
    const x = baseDx + ax + (Math.random() - 0.5) * 1.5;
    const y = baseDy + ay + (Math.random() - 0.5) * 1.5;
    const z = baseDz + az + (Math.random() - 0.5) * 1.5;
    const total = Math.sqrt(x * x + y * y + z * z);
    return { x, y, z, total, now: performance.now(), heatPointer, anomalyStrength };
  },

  generateAltimeterSample() {
    if (!this.enabled) return null;
    const t = this.altimeterTime;
    this.altimeterTime += 1 / 60;
    const walkedAlt = this.baseAltitude + 50 * Math.sin(t * 0.08) + 25 * Math.sin(t * 0.23);
    const P0 = 1013.25;
    const hNorm = clamp(walkedAlt / 44330.77, 0, 0.95);
    const pressure = P0 * Math.pow(1 - hNorm, 1 / 0.190263);
    const dt = 1 / 60;
    const vspeed = (walkedAlt - this.baseAltitude) / dt;
    this.baseAltitude += 0.15;
    return { altitude: walkedAlt, pressure, vspeed, now: performance.now() };
  },

  generateStarHeading(dt) {
    if (!this.enabled) return null;
    this.starHeadingPhase += dt * 0.2;
    const azimuth = 180 + 40 * Math.sin(this.starHeadingPhase) + 10 * Math.sin(this.starHeadingPhase * 0.4);
    const pitch = 20 * Math.sin(this.starHeadingPhase * 0.6) + 10;
    const roll = 10 * Math.sin(this.starHeadingPhase * 0.3);
    return { azimuth: wrapDeg(azimuth), pitch: clamp(pitch, -90, 90), roll: wrapDeg(roll), timestamp: performance.now() };
  }
};
