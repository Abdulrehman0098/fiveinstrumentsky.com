/* ============================================================
   scripts/galaxy.js — Procedural galaxy starfield background
   Three depth layers, twinkle, shooting stars, parallax drift.
   No image assets. Runs behind everything.
   ============================================================ */

const Galaxy = (() => {
  'use strict';

  const canvas = document.getElementById('galaxy-starfield');
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');
  let dpr = window.devicePixelRatio || 1;
  let W = 0, H = 0;

  // Reduced motion?
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Low-end device?
  const lowEnd = (navigator.hardwareConcurrency || 4) < 4;

  // Star layers
  const layers = [];
  const LAYER_DEFS = [
    { count: lowEnd ? 100 : 400, size: 0.5, opacity: 0.35, twinklePeriod: 8000, colorShift: 0.3,  speed: 0.0  },
    { count: 150,                 size: 1.0, opacity: 0.55, twinklePeriod: 5000, colorShift: 0.5,  speed: 0.0  },
    { count: 40,                  size: 2.0, opacity: 0.85, twinklePeriod: 7000, colorShift: 0.7,  speed: 0.02 },
  ];

  // Nebula clouds — multi-layer animated radial gradients
  const nebulae = [
    {
      cx: 0.25, cy: 0.30, radius: 0.35,
      color1: [120, 30, 180], color2: [60, 10, 120],
      pulseSpeed: 0.0003, phase: Math.random() * Math.PI * 2,
    },
    {
      cx: 0.75, cy: 0.65, radius: 0.30,
      color1: [0, 180, 220], color2: [0, 80, 140],
      pulseSpeed: 0.0004, phase: Math.random() * Math.PI * 2,
    },
    {
      cx: 0.45, cy: 0.78, radius: 0.25,
      color1: [80, 40, 200], color2: [30, 10, 100],
      pulseSpeed: 0.00025, phase: Math.random() * Math.PI * 2,
    },
    {
      cx: 0.80, cy: 0.25, radius: 0.20,
      color1: [200, 150, 50], color2: [120, 80, 20],
      pulseSpeed: 0.00035, phase: Math.random() * Math.PI * 2,
    },
    {
      cx: 0.10, cy: 0.70, radius: 0.18,
      color1: [40, 160, 200], color2: [10, 80, 140],
      pulseSpeed: 0.0002, phase: Math.random() * Math.PI * 2,
    },
  ];

  // Shooting star state
  let shootingStar = null;
  let lastShootTime = 0;

  // Animation
  let animId = null;
  let lastTime = 0;
  let running = false;

  /* ---------- Resize ---------- */

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    W = Math.round(rect.width);
    H = Math.round(rect.height);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    generateStars();
  }

  /* ---------- Star generation ---------- */

  function generateStars() {
    layers.length = 0;
    for (const def of LAYER_DEFS) {
      const stars = new Array(def.count);
      for (let i = 0; i < def.count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 1.4; // 0 = center, 1.4 = beyond edges
        stars[i] = {
          x: W / 2 + Math.cos(angle) * dist * W * 0.5,
          y: H / 2 + Math.sin(angle) * dist * H * 0.45,
          baseSize: def.size * (0.7 + Math.random() * 0.6),
          baseOpacity: def.opacity * (0.6 + Math.random() * 0.4),
          twinklePeriod: def.twinklePeriod * (0.7 + Math.random() * 0.6),
          twinkleOffset: Math.random() * def.twinklePeriod,
          colorShift: def.colorShift * (0.5 + Math.random()),
          driftX: (Math.random() - 0.5) * def.speed,
          driftY: (Math.random() - 0.5) * def.speed,
        };
      }
      layers.push({ def, stars });
    }
  }

  /* ---------- Shooting star ---------- */

  function spawnShootingStar() {
    const angle = Math.random() * Math.PI * 2;
    const len = 80 + Math.random() * 120;
    const speed = 8 + Math.random() * 12;
    shootingStar = {
      x: W / 2 + (Math.random() - 0.5) * W * 0.6,
      y: H / 2 + (Math.random() - 0.5) * H * 0.5,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      life: 0,
      maxLife: 200 + Math.random() * 150,
      tailLen: 2 + Math.random() * 2,
    };
  }

  function maybeSpawnShootingStar(now) {
    if (!reduceMotion && !shootingStar && now - lastShootTime > 15000 + Math.random() * 15000) {
      spawnShootingStar();
      lastShootTime = now;
    }
  }

  /* ---------- Nebula cloud rendering ---------- */

  function drawNebulae(time) {
    for (const n of nebulae) {
      const pulse = 0.7 + 0.3 * Math.sin(time * n.pulseSpeed + n.phase);
      const cx = n.cx * W;
      const cy = n.cy * H;
      const r = n.radius * Math.min(W, H) * pulse;

      // Outer glow — large, faint
      const grad1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6);
      const [r1, g1, b1] = n.color1;
      grad1.addColorStop(0, `rgba(${r1},${g1},${b1},${0.04 * pulse})`);
      grad1.addColorStop(0.5, `rgba(${r1},${g1},${b1},${0.02 * pulse})`);
      grad1.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, W, H);

      // Inner density — brighter core
      const grad2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.7);
      const [r2, g2, b2] = n.color2;
      grad2.addColorStop(0, `rgba(${r2},${g2},${b2},${0.06 * pulse})`);
      grad2.addColorStop(0.4, `rgba(${r2},${g2},${b2},${0.03 * pulse})`);
      grad2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, W, H);

      // Second harmonic — opposite phase for shimmer
      const pulse2 = 0.6 + 0.4 * Math.sin(time * n.pulseSpeed * 1.7 + n.phase + 1.2);
      const grad3 = ctx.createRadialGradient(cx + r * 0.15, cy - r * 0.1, 0, cx, cy, r * 0.4);
      grad3.addColorStop(0, `rgba(255,255,255,${0.015 * pulse2})`);
      grad3.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad3;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------- Drawing ---------- */

  function drawLayer(layer, time) {
    const { stars } = layer;
    for (const star of stars) {
      const twinkle = reduceMotion
        ? 1
        : 0.5 + 0.5 * Math.sin((time + star.twinkleOffset) / star.twinklePeriod * Math.PI * 2);
      const opacity = star.baseOpacity * twinkle;
      if (opacity < 0.02) continue;

      // Color: blue-white to warm brass variation
      const t = star.colorShift;
      const r = Math.round(180 + t * 75);
      const g = Math.round(190 + t * 30);
      const b = Math.round(220 - t * 60);
      const color = `rgba(${r},${g},${b},${opacity})`;

      const size = star.baseSize * (0.9 + 0.1 * twinkle);

      // Glow halo for brighter stars
      if (size > 1.0 && opacity > 0.3) {
        const glowSize = size * 3;
        const glow = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, glowSize);
        glow.addColorStop(0, `rgba(${r},${g},${b},${opacity * 0.15})`);
        glow.addColorStop(0.5, `rgba(${r},${g},${b},${opacity * 0.04})`);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(star.x, star.y, glowSize, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(star.x, star.y, Math.max(0.3, size), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawShootingStar() {
    if (!shootingStar) return;
    const s = shootingStar;
    const progress = s.life / s.maxLife;
    if (progress >= 1) { shootingStar = null; return; }

    const alpha = 1 - progress;
    const tail = s.tailLen * (1 + progress * 2);

    // Streak
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.8})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(s.x - s.dx * tail * 0.3, s.y - s.dy * tail * 0.3);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();

    // Head glow
    const headGrad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 3);
    headGrad.addColorStop(0, `rgba(255,255,240,${alpha})`);
    headGrad.addColorStop(0.5, `rgba(255,255,200,${alpha * 0.3})`);
    headGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const now = performance.now();

    // Nebula clouds behind stars
    drawNebulae(now);

    for (const layer of layers) {
      drawLayer(layer, now);
    }

    drawShootingStar();
  }

  function update(now) {
    // Drift
    if (!reduceMotion) {
      for (const layer of layers) {
        for (const star of layer.stars) {
          star.x += star.driftX;
          star.y += star.driftY;
          // Wrap around gently
          if (star.x < -W * 0.2) star.x = W * 1.2;
          if (star.x > W * 1.2) star.x = -W * 0.2;
          if (star.y < -H * 0.2) star.y = H * 1.2;
          if (star.y > H * 1.2) star.y = -H * 0.2;
        }
      }
    }

    // Shooting star
    if (shootingStar) {
      shootingStar.x += shootingStar.dx;
      shootingStar.y += shootingStar.dy;
      shootingStar.life += 16;
      if (shootingStar.life >= shootingStar.maxLife) {
        shootingStar = null;
      }
    }

    maybeSpawnShootingStar(now);
    draw();
  }

  function loop(now) {
    if (!lastTime) lastTime = now;
    update(now);
    animId = requestAnimationFrame(loop);
  }

  return { init, stop, resize };

  function init() {
    if (running) return;
    resize();
    window.addEventListener('resize', resize);
    running = true;
    if (!reduceMotion) {
      animId = requestAnimationFrame(loop);
    } else {
      draw();
    }
  }

  function stop() {
    running = false;
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    window.removeEventListener('resize', resize);
  }
})();

export default Galaxy;
