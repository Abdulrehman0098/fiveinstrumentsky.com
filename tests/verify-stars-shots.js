// tests/verify-stars-shots.js — visual capture of the new star UI.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PORT = 8793;
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

  // Search active
  await page.click('#star-search-input');
  await page.type('#star-search-input', 'betel', { delay: 50 });
  await sleep(900);
  await page.screenshot({ path: path.join(ROOT, '_stars-search.png') });

  // Info panel open via click on a bright star
  await page.evaluate(() => {
    const g = window.FI.stars.geom;
    const cat = window.FI.stars.getCatalog();
    const c = document.getElementById('stars-canvas');
    const rect = c.getBoundingClientRect();
    for (const s of cat) {
      const p = window.FI.stars.project(s, g.cx, g.cy, g.radius, g.lst);
      if (!p) continue;
      const sx = rect.left + p.x * (rect.width / g.cssW);
      const sy = rect.top + p.y * (rect.height / g.cssH);
      if (sx > rect.left + 50 && sx < rect.right - 50 && sy > rect.top + 50 && sy < rect.bottom - 50) {
        window.FI.starsUI.highlight(s);
        return s.name;
      }
    }
    return null;
  });
  await sleep(900);
  await page.screenshot({ path: path.join(ROOT, '_stars-info.png') });

  // Crop of the slider row + controls
  const clip = await page.evaluate(() => {
    const el = document.querySelector('.stars-controls');
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.left - 10), y: Math.max(0, r.top - 10), width: Math.min(560, r.width + 20), height: Math.min(600, r.height + 20) };
  });
  await page.screenshot({ path: path.join(ROOT, '_stars-controls.png'), clip });

  // Mobile
  const m = await browser.newPage();
  await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await m.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await sleep(3500);
  await m.evaluate(() => {
    document.querySelector('.time-scrubber-row').scrollIntoView({ block: 'center' });
  });
  await sleep(600);
  await m.screenshot({ path: path.join(ROOT, '_stars-mobile.png') });

  await browser.close();
  server.close();
  console.log('saved _stars-search.png _stars-info.png _stars-controls.png _stars-mobile.png');
});
