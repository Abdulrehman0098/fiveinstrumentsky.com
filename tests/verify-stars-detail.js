// tests/verify-stars-detail.js — precise measurement of the clear button,
// the slider right-hand zone, and whether the highlight ring actually paints.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PORT = 8795;
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

server.listen(PORT, '127.0.0.1', async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--no-first-run']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await sleep(3500);

  const out = {};

  // ---- Search: clear button geometry while text is present ----
  await page.click('#star-search-input');
  await page.type('#star-search-input', 'vega', { delay: 50 });
  await sleep(700);

  out.clearBtn = await page.evaluate(() => {
    const b = document.getElementById('star-search-clear');
    const i = document.getElementById('star-search-input');
    const br = b.getBoundingClientRect(), ir = i.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return {
      hidden: b.hasAttribute('hidden'),
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      w: Math.round(br.width), h: Math.round(br.height),
      right: Math.round(br.right), inputRight: Math.round(ir.right),
      insideInput: br.right <= ir.right + 1 && br.left >= ir.left,
      buttonCentreY: Math.round(br.top + br.height/2),
      inputCentreY: Math.round(ir.top + ir.height/2),
      verticallyCentred: Math.abs((br.top + br.height/2) - (ir.top + ir.height/2)) < 2
    };
  });

  // ---- Slider right-hand zone: full geometry, uncropped ----
  out.sliderZones = await page.evaluate(() => {
    const row = document.querySelector('.time-scrubber-row');
    const parts = {};
    [['label','.scrubber-label'],['track','.scrubber-track'],['actions','.scrubber-actions'],
     ['value','.scrubber-value'],['reset','#time-reset-btn']].forEach(([k,sel])=>{
      const e = row.querySelector(sel);
      const r = e.getBoundingClientRect();
      parts[k] = { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), text: (e.textContent||'').trim().slice(0,14) };
    });
    const rr = row.getBoundingClientRect();
    return { row: { l: Math.round(rr.left), r: Math.round(rr.right), w: Math.round(rr.width) }, parts,
             valueVisible: parts.value.w > 10 && parts.value.r <= rr.right + 1,
             resetVisible: parts.reset.w > 10 && parts.reset.r <= rr.right + 1,
             valueFullyInside: parts.value.l >= rr.left && parts.value.r <= rr.right,
             resetFullyInside: parts.reset.l >= rr.left && parts.reset.r <= rr.right };
  });

  // ---- Highlight ring: sample canvas pixels around a VISIBLE star ----
  out.ring = await page.evaluate(async () => {
    const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
    const canvas = document.getElementById('stars-canvas');
    const g = window.FI.stars.geom;
    const cat = window.FI.stars.getCatalog();

    function ringPixels(star) {
      const p = window.FI.stars.project(star, g.cx, g.cy, g.radius, g.lst);
      if (!p) return null;
      const dpr = canvas.width / g.cssW;
      const ctx = canvas.getContext('2d');
      const cx = p.x * dpr, cy = p.y * dpr;
      // Sample an annulus at the ring radius (11px CSS) +/- 3px
      let gold = 0, total = 0;
      for (let a = 0; a < 360; a += 3) {
        for (let dr = -3; dr <= 3; dr += 1) {
          const rad = a * Math.PI / 180;
          const R = (11 + dr) * dpr;
          const x = Math.round(cx + Math.cos(rad) * R);
          const y = Math.round(cy + Math.sin(rad) * R);
          if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
          const d = ctx.getImageData(x, y, 1, 1).data;
          total++;
          // gold-ish: high R, high G, low B
          if (d[0] > 150 && d[1] > 120 && d[2] < 120 && d[3] > 100) gold++;
        }
      }
      return { gold, total, ratio: +(gold / total).toFixed(3), x: Math.round(p.x), y: Math.round(p.y) };
    }

    // Baseline: a visible star with nothing selected
    let vis = null;
    for (const s of cat) {
      const p = window.FI.stars.project(s, g.cx, g.cy, g.radius, g.lst);
      if (p) { vis = s; break; }
    }
    if (!vis) return { error: 'no visible star' };

    const before = ringPixels(vis);
    window.FI.starsUI.highlight(vis);
    await sleep(300);
    const after = ringPixels(vis);

    // Also confirm a below-horizon star is correctly NOT drawn
    let below = null;
    for (const s of cat) {
      if (!window.FI.stars.project(s, g.cx, g.cy, g.radius, g.lst)) { below = s; break; }
    }
    const belowRing = below ? ringPixels(below) : null;

    return {
      star: vis.name,
      before, after,
      ringAppeared: after && before && after.gold > before.gold + 30,
      belowHorizonStar: below ? below.name : null,
      belowRingIsNull: belowRing === null
    };
  });

  await page.screenshot({ path: path.join(ROOT, '_stars-ring.png') });

  await browser.close();
  server.close();
  console.log(JSON.stringify(out, null, 2));
});
