/* ============================================================
   galaxy.js — animated galaxy starfield on #galaxy-starfield
   ============================================================ */

import { safeStorage } from "./utils.js";

let canvas, ctx, canvasInfo;
let nebulaCache = null;
let milkyWayCache = null;
let stars = [];
let nebulaAngle = 0;
let shootingStar = null;
let shootingTimer = 0;
let reduceMotion = false;
let isDaylight = false;
let isNight = false;
let frameBudget = 3;
let renderEveryFrame = true;
let lastFrameTime = 0;
let pendingResize = false;
let pointerX = 0.5, pointerY = 0.5;

const STAR_LAYERS = [
  { count: 0, sizeRange: [0.3, 0.8], alphaRange: [0.10, 0.40], speed: [0.03, 0.07], colorRange: [[255,255,255],[255,255,255]] },
  { count: 0, sizeRange: [0.5, 1.5], alphaRange: [0.25, 0.70], speed: [0.08, 0.15], colorRange: [[200,220,255],[255,240,220]] },
  { count: 0, sizeRange: [0.8, 2.5], alphaRange: [0.50, 0.90], speed: [0.15, 0.30], colorRange: [[180,220,255],[255,200,150]] }
];

function randomColor(colorRange) {
  return [
    colorRange[0][0] + (colorRange[1][0] - colorRange[0][0]) * Math.random(),
    colorRange[0][1] + (colorRange[1][1] - colorRange[0][1]) * Math.random(),
    colorRange[0][2] + (colorRange[1][2] - colorRange[0][2]) * Math.random()
  ];
}

function buildStars(w, h) {
  const area = w * h;
  const starCountPerLayer = Math.max(80, Math.min(420, Math.round(area / 9000)));
  const hw = navigator.hardwareConcurrency;
  let halved = hw && hw < 4;
  for (const l of STAR_LAYERS) l.count = halved ? Math.round(starCountPerLayer / 2) : starCountPerLayer;
  stars = [];
  for (const layer of STAR_LAYERS) {
    for (let i = 0; i < layer.count; i++) {
      const x = Math.random() * w * 2 - w;
      const y = Math.random() * h * 2 - h;
      const size = layer.sizeRange[0] + Math.random() * (layer.sizeRange[1] - layer.sizeRange[0]);
      const alpha = layer.alphaRange[0] + Math.random() * (layer.alphaRange[1] - layer.alphaRange[0]);
      const speed = layer.speed[0] + Math.random() * (layer.speed[1] - layer.speed[0]);
      const dir = Math.random() * Math.PI * 2;
      const color = randomColor(layer.colorRange);
      const twinklePhase = Math.random() * Math.PI * 2;
      const twinkleRate = 0.8 + Math.random() * 2.5;
      let isColored = false;
      let colorOverride = null;
      if (Math.random() < 0.05) {
        isColored = true;
        const c = Math.random();
        if (c < 0.33) colorOverride = [120, 160, 255];
        else if (c < 0.66) colorOverride = [255, 200, 80];
        else colorOverride = [255, 120, 60];
      }
      stars.push({ x0: x, y0: y, layer, size, alpha, speed, dir, color, twinklePhase, twinkleRate, isColored, colorOverride });
    }
  }
}

function buildNebula(w, h) {
  const off = document.createElement("canvas");
  const size = Math.min(512, Math.max(128, Math.round(Math.min(w, h) / 2)));
  off.width = size; off.height = size;
  const oc = off.getContext("2d");
  const cx = size / 2, cy = size / 2;
  const grad = oc.createRadialGradient(cx, cy, 0, cx, cy, size * 0.7);
  grad.addColorStop(0, "rgba(8,12,24,1)"); grad.addColorStop(0.4, "rgba(6,10,20,1)"); grad.addColorStop(1, "rgba(2,4,10,1)");
  oc.fillStyle = grad; oc.fillRect(0, 0, size, size);
  const blobs = [
    { x: cx * 0.7, y: cy * 0.5, r: size * 0.35, color: [160, 60, 220], alpha: 0.18 },
    { x: cx * 0.5, y: cy * 0.7, r: size * 0.30, color: [0, 200, 220], alpha: 0.14 },
    { x: cx * 0.3, y: cy * 0.4, r: size * 0.25, color: [30, 40, 120], alpha: 0.20 },
    { x: cx * 0.8, y: cy * 0.7, r: size * 0.22, color: [200, 160, 80], alpha: 0.08 },
    { x: cx * 0.5, y: cy * 0.3, r: size * 0.20, color: [100, 50, 180], alpha: 0.10 }
  ];
  for (const b of blobs) {
    const g = oc.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    g.addColorStop(0, `rgba(${b.color[0]},${b.color[1]},${b.color[2]},${b.alpha})`);
    g.addColorStop(0.5, `rgba(${b.color[0]},${b.color[1]},${b.color[2]},${b.alpha * 0.4})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    oc.fillStyle = g; oc.fillRect(0, 0, size, size);
  }
  for (let i = 0; i < 40; i++) {
    const nx = Math.random() * size, ny = Math.random() * size, nr = 2 + Math.random() * 8;
    const r = Math.random() * 200 + 55, g2 = Math.random() * 20 + 10, b2 = Math.random() * 40 + 20;
    const ag = oc.createRadialGradient(nx, ny, 0, nx, ny, nr);
    ag.addColorStop(0, `rgba(${r},${g2},${b2},0.12)`); ag.addColorStop(1, "rgba(0,0,0,0)");
    oc.fillStyle = ag; oc.fillRect(0, 0, size, size);
  }
  nebulaCache = { canvas: off, size };
}

function buildMilkyWay(w, h) {
  const off = document.createElement("canvas");
  off.width = 512; off.height = 512;
  const oc = off.getContext("2d");
  oc.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    const x = t * 512;
    const y = 512 * (0.5 + 0.7 * Math.sin(t * Math.PI));
    const thickness = 180 * (0.5 + 0.5 * Math.sin(t * Math.PI * 3));
    const g = oc.createLinearGradient(x, y - thickness / 2, x, y + thickness / 2);
    g.addColorStop(0, "rgba(180,180,220,0.02)"); g.addColorStop(0.5, "rgba(210,200,240,0.06)"); g.addColorStop(1, "rgba(180,180,220,0.02)");
    oc.fillStyle = g;
    oc.fillRect(x - 2, y - thickness / 2, 4, thickness);
  }
  for (let i = 0; i < 12; i++) {
    const t = i / 12;
    const x = t * 512;
    const y = 512 * (0.5 + 0.7 * Math.sin(t * Math.PI));
    const dw = 20 + Math.random() * 40;
    const g = oc.createRadialGradient(x, y, 0, x, y, dw);
    g.addColorStop(0, "rgba(0,0,0,0.35)"); g.addColorStop(1, "rgba(0,0,0,0)");
    oc.fillStyle = g; oc.fillRect(0, 0, 512, 512);
  }
  milkyWayCache = { canvas: off };
}

function spawnShootingStar(w, h) {
  const angle = Math.random() * Math.PI * 2;
  const speed = 0.5 + Math.random() * 1.5;
  const x = Math.random() * w * 2 - w;
  const y = Math.random() * h * 2 - h;
  return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, tailLen: 30 + Math.random() * 60, life: 1.0, decay: 0.012 + Math.random() * 0.012 };
}

function renderGalaxy(now) {
  if (!canvas || !ctx || !canvasInfo) return;
  const { w, h } = canvasInfo;

  if (isNight) {
    ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, w, h);
    drawStars(ctx, w, h, true);
    drawShootingStar(ctx, w, h);
    return;
  } else if (isDaylight) {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    g.addColorStop(0, "rgba(140,170,220,0.15)"); g.addColorStop(0.3, "rgba(120,150,200,0.08)");
    g.addColorStop(0.6, "rgba(100,130,180,0.05)"); g.addColorStop(1, "rgba(180,200,230,0.12)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    drawAurora(ctx, w, h);
    return;
  }

  const g = ctx.createRadialGradient(w * 0.4, h * 0.35, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  g.addColorStop(0, "rgba(14,18,34,1)"); g.addColorStop(0.3, "rgba(8,12,22,1)");
  g.addColorStop(0.6, "rgba(4,6,14,1)"); g.addColorStop(1, "rgba(2,4,10,1)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  if (nebulaCache && w > 100 && h > 100) {
    const nSize = nebulaCache.size;
    const scale = Math.min(w / nSize, h / nSize) * 1.2;
    const nw = nSize * scale, nh = nSize * scale;
    nebulaAngle += 0.0004;
    ctx.save();
    ctx.translate(w * 0.5 + (pointerX - 0.5) * w * 0.2, h * 0.5 + (pointerY - 0.5) * h * 0.15);
    ctx.rotate(nebulaAngle);
    ctx.globalAlpha = 0.15 + 0.05 * Math.sin(now * 0.0005);
    ctx.drawImage(nebulaCache.canvas, -nw / 2, -nh / 2, nw, nh);
    ctx.restore();
  }

  if (milkyWayCache && w > 100 && h > 100) {
    const mw = milkyWayCache.canvas.width;
    const mScale = Math.min(w / mw, h / mw) * 0.7;
    const dim = mw * mScale;
    ctx.globalAlpha = 0.12 + 0.03 * Math.sin(now * 0.0003);
    ctx.drawImage(milkyWayCache.canvas, (w - dim) / 2, (h - dim) / 2, dim, dim);
    ctx.globalAlpha = 1;
  }

  drawShootingStar(ctx, w, h);
  drawStars(ctx, w, h, false);

  const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.max(w, h) * 0.6);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.30)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
}

function drawStars(ctx, w, h, redOnly) {
  const now = performance.now() / 1000;
  const dx = (pointerX - 0.5) * 40;
  const dy = (pointerY - 0.5) * 20;
  for (const s of stars) {
    const driftX = Math.cos(s.dir) * s.speed * 20;
    const driftY = Math.sin(s.dir) * s.speed * 20;
    const px = s.x0 + driftX + dx * s.layer.speed[0];
    const py = s.y0 + driftY + dy * s.layer.speed[0];
    if (px < -w * 0.3 || px > w * 1.3 || py < -h * 0.3 || py > h * 1.3) continue;
    let alpha = s.alpha;
    if (!reduceMotion) alpha *= 0.7 + 0.3 * Math.sin(now * s.twinkleRate + s.twinklePhase);
    const size = s.size;
    let color;
    if (redOnly || (s.isColored && isNight)) color = [255, 60, 60];
    else if (s.isColored && s.colorOverride) color = s.colorOverride;
    else color = s.color;
    const r = color[0], g = color[1], b = color[2];
    if (size > 1.2 && alpha > 0.3) {
      const glowR = size * 3;
      const gg = ctx.createRadialGradient(px, py, 0, px, py, glowR);
      gg.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.5})`);
      gg.addColorStop(0.4, `rgba(${r},${g},${b},${alpha * 0.15})`);
      gg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gg;
      ctx.fillRect(px - glowR, py - glowR, glowR * 2, glowR * 2);
    }
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.beginPath(); ctx.arc(px, py, size / 2, 0, Math.PI * 2); ctx.fill();
  }
}

function drawAurora(ctx, w, h) {
  const t = performance.now() / 1000;
  for (let i = 0; i < 3; i++) {
    const yBase = h * (0.4 + i * 0.12);
    const amp = 30 + i * 15;
    const speed = 0.1 + i * 0.03;
    ctx.beginPath();
    ctx.moveTo(0, yBase + Math.sin(t * speed + i) * amp);
    for (let x = 0; x <= w; x += 20) {
      const y = yBase + Math.sin(x * 0.01 + t * speed + i * 2) * amp * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    const hue = [160, 180, 140][i];
    const g = ctx.createLinearGradient(0, yBase - 10, 0, yBase + 40);
    g.addColorStop(0, `rgba(${hue - 20},${hue + 20},220,0.02)`);
    g.addColorStop(0.5, `rgba(${hue},${hue + 30},230,0.04)`);
    g.addColorStop(1, `rgba(${hue - 10},${hue + 10},220,0)`);
    ctx.fillStyle = g; ctx.fill();
  }
}

function drawShootingStar(ctx, w, h) {
  if (!shootingStar) return;
  const s = shootingStar;
  s.x += s.vx; s.y += s.vy; s.life -= s.decay;
  if (s.life <= 0) { shootingStar = null; return; }
  const tailLen = s.tailLen * s.life;
  const tailAngle = Math.atan2(s.vy, s.vx);
  ctx.save();
  ctx.globalAlpha = s.life * 0.8;
  const tg = ctx.createLinearGradient(s.x, s.y, s.x - Math.cos(tailAngle) * tailLen, s.y - Math.sin(tailAngle) * tailLen);
  tg.addColorStop(0, "rgba(255,255,255,0.9)"); tg.addColorStop(0.2, "rgba(180,200,255,0.5)");
  tg.addColorStop(0.5, "rgba(120,150,255,0.2)"); tg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.strokeStyle = tg; ctx.lineWidth = 1.5 * s.life;
  ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(tailAngle) * tailLen, s.y - Math.sin(tailAngle) * tailLen); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.beginPath(); ctx.arc(s.x, s.y, 1.5 * s.life, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function bootGalaxy() {
  if (typeof window === "undefined") return;
  canvas = document.getElementById("galaxy-starfield");
  if (!canvas) return;
  reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  canvasInfo = fitCanvasFromAny(canvas);
  if (canvasInfo) buildStars(canvasInfo.w, canvasInfo.h);
  buildNebula(canvasInfo ? canvasInfo.w : 800, canvasInfo ? canvasInfo.h : 600);
  buildMilkyWay(canvasInfo ? canvasInfo.w : 800, canvasInfo ? canvasInfo.h : 600);

  SensorBus.on("themechange", (theme) => {
    isDaylight = theme === "daylight";
    isNight = theme === "night";
  });

  window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    pointerX = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    pointerY = clamp((e.clientY - rect.top) / rect.height, 0, 1);
  });

  lastFrameTime = performance.now();
  requestAnimationFrame(galaxyLoop);
}

function galaxyLoop(now) {
  if (document.hidden) { requestAnimationFrame(galaxyLoop); return; }
  const dt = now - lastFrameTime;
  lastFrameTime = now;
  if (!shootingStar) {
    shootingTimer += dt;
    if (shootingTimer > 12000 + Math.random() * 13000) {
      shootingTimer = 0;
      if (canvasInfo) shootingStar = spawnShootingStar(canvasInfo.w, canvasInfo.h);
    }
  }
  renderGalaxy(now);
  if (pendingResize) {
    pendingResize = false;
    const info = fitCanvasFromAny(canvas);
    if (info) { canvasInfo = info; buildStars(info.w, info.h); buildNebula(info.w, info.h); buildMilkyWay(info.w, info.h); }
  }
  requestAnimationFrame(galaxyLoop);
}

function fitCanvasFromAny(canvas) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height, dpr };
}

export function observeGalaxy() {
  if (!canvas) return;
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => { pendingResize = true; });
    ro.observe(canvas);
    window.addEventListener("resize", () => { pendingResize = true; });
  }
}
