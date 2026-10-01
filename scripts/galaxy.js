(function () {
  'use strict';
  window.FI = window.FI || {};

  var canvas, ctx, W = 0, H = 0;
  var lastFrame = 0;
  var running = false;

  function size() {
    canvas = document.getElementById('galaxy-starfield');
    if (!canvas) return false;
    var r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = r.width; H = r.height;
    return true;
  }

  function draw() {
    if (!ctx) return;
    var g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#160d33');
    g.addColorStop(0.55, '#0a0d18');
    g.addColorStop(1, '#02040a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Static backdrop: redraw only on resize, not every frame.
  function loop(ts) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (ts - lastFrame < 33) return;
    lastFrame = ts;
    if (!canvas || canvas.width === 0) { if (!size()) return; }
    draw();
  }

  function boot() {
    if (!size()) { requestAnimationFrame(boot); return; }
    draw();
    if (!running) {
      running = true;
      lastFrame = 0;
      requestAnimationFrame(loop);
    }
  }

  window.addEventListener('resize', function () {
    if (size()) draw();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
