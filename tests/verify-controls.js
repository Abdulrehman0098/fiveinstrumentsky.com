// tests/verify-controls.js — regression check for the header controls
// (theme cycle, unit toggle, demo mode) after the UI upgrade.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PORT = 8797;
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
  const consoleErrors = [], pageErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await sleep(3000);

  const out = {};

  // ---- Theme cycle: galaxy -> daylight -> night -> galaxy ----
  const themeSeq = [];
  for (let i = 0; i < 4; i++) {
    await page.click('#theme-toggle-btn');
    await sleep(450);
    themeSeq.push(await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      pressed: document.getElementById('theme-toggle-btn').getAttribute('aria-pressed'),
      stored: (() => { try { return localStorage.getItem('fi-theme'); } catch (e) { return null; } })(),
      // confirm the theme actually applies a different background
      bodyBg: getComputedStyle(document.body).backgroundColor
    })));
  }
  out.theme = { seq: themeSeq.map(t => t.theme), pressed: themeSeq.map(t => t.pressed),
                stored: themeSeq.map(t => t.stored), bodyBg: themeSeq.map(t => t.bodyBg) };
  out.theme.cycles = themeSeq.map(t => t.theme).join('>') === 'daylight>night>galaxy>daylight';

  // ---- Unit toggle ----
  const unitSeq = [];
  for (let i = 0; i < 2; i++) {
    await page.click('#unit-toggle-btn');
    await sleep(400);
    unitSeq.push(await page.evaluate(() => ({
      label: document.getElementById('unit-toggle-btn').textContent.trim(),
      pressed: document.getElementById('unit-toggle-btn').getAttribute('aria-pressed')
    })));
  }
  out.unit = { seq: unitSeq.map(u => u.label), toggles: unitSeq[0].label !== unitSeq[1].label };

  // ---- Demo mode ----
  const before = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.sim-badge')).filter(b => !b.classList.contains('hidden')).length);
  await page.click('#demo-toggle-btn');
  await sleep(900);
  const after = await page.evaluate(() => ({
    visible: Array.from(document.querySelectorAll('.sim-badge')).filter(b => !b.classList.contains('hidden')).length,
    pressed: document.getElementById('demo-toggle-btn').getAttribute('aria-pressed'),
    demoEnabled: !!(window.FI && window.FI.demo && window.FI.demo.isEnabled && window.FI.demo.isEnabled())
  }));
  await page.click('#demo-toggle-btn');
  await sleep(600);
  const restored = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.sim-badge')).filter(b => !b.classList.contains('hidden')).length);
  out.demo = { badgesBefore: before, badgesAfter: after.visible, badgesRestored: restored,
               pressed: after.pressed, demoEnabled: after.demoEnabled };

  // ---- Tabs still switch panels ----
  const tabSeq = [];
  for (const t of ['sound', 'vibration', 'magnetic', 'altimeter', 'stars']) {
    await page.click(`.tab-btn[data-tab="${t}"]`);
    await sleep(450);
    tabSeq.push(await page.evaluate((name) => {
      const active = document.querySelector('.instrument-panel:not(.hidden)');
      return { wanted: name, shown: active ? active.getAttribute('data-tab') : null,
               tabActive: !!document.querySelector(`.tab-btn[data-tab="${name}"].active`) };
    }, t));
  }
  out.tabs = { seq: tabSeq, allMatch: tabSeq.every(t => t.wanted === t.shown && t.tabActive) };

  out.consoleErrors = consoleErrors;
  out.pageErrors = pageErrors;

  await browser.close();
  server.close();
  console.log(JSON.stringify(out, null, 2));
});
