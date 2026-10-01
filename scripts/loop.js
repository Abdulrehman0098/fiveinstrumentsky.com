(function() {
'use strict';

/* ============================================================
   loop.js — ONE shared rAF scheduler.
   Only the ACTIVE panel's callbacks run.  Pauses on hidden.
   ============================================================ */

const callbacks = new Map();
let activePanel = null;
let rafId = null;
let lastFrameTime = 0;
let frameCount = 0;
let fpsAccum = 0;
let fpsDisplay = 0;
const FPS_UPDATE_INTERVAL = 1000;

const Loop = {
  register(name, fn, targetFps = 60) {
    callbacks.set(name, { fn, fps: targetFps, lastDraw: 0, accumulator: 0 });
  },

  unregister(name) {
    callbacks.delete(name);
  },

  setActive(name) {
    activePanel = name;
  },

  getActive() {
    return activePanel;
  },

  start() {
    if (rafId !== null) return;
    lastFrameTime = performance.now();
    frameCount = 0;
    fpsAccum = 0;
    fpsDisplay = 0;
    (function tick(nextTime) {
      const now = nextTime;
      const dt = now - lastFrameTime;
      lastFrameTime = now;
      frameCount++;
      fpsAccum += dt;
      if (fpsAccum >= FPS_UPDATE_INTERVAL) {
        fpsDisplay = Math.round(frameCount * 1000 / fpsAccum);
        frameCount = 0;
        fpsAccum = 0;
      }

      if (document.hidden) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const active = activePanel;
      if (active !== null && callbacks.size > 0) {
        const nowTs = performance.now() / 1000;
        for (const [name, cb] of callbacks) {
          if (name !== active) continue;
          cb.accumulator += dt / 1000;
          const interval = 1 / cb.fps;
          while (cb.accumulator >= interval) {
            cb.accumulator -= interval;
            try { cb.fn(nowTs, fpsDisplay); } catch (e) {}
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    })(performance.now());
  },

  stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  },

  getFPS() {
    return fpsDisplay;
  },

  updateFPS(readoutEl) {
    if (readoutEl) {
      readoutEl.textContent = fpsDisplay + " FPS";
    }
  },

  triggerNow(name) {
    const cb = callbacks.get(name);
    if (cb) try { cb.fn(performance.now() / 1000, fpsDisplay); } catch (e) {}
  }
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    Loop.stop();
  } else {
    Loop.start();
  }
});


window.FI = window.FI || {};
window.FI.loop = Loop;
})();
