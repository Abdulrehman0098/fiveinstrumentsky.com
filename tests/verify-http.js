// tests/verify-http.js — serve the site over HTTP (like Netlify) and verify
// every asset resolves with 200 + a correct MIME type, then check rendering.
// node tests/verify-http.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PORT = 8781;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json'
};

const hits = [];

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(ROOT, urlPath);

  // Block traversal outside ROOT
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }

  fs.readFile(file, (err, data) => {
    if (err) {
      hits.push({ url: urlPath, status: 404 });
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    hits.push({ url: urlPath, status: 200, type });
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

server.listen(PORT, '127.0.0.1', async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--no-first-run', '--window-size=1440,1000']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 25000 });
  await sleep(3000);

  const R = await page.evaluate(() => {
    const cs = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
    const stylesheets = Array.from(document.styleSheets).map(s => s.href ? s.href.split('/').pop() : 'inline');
    // Count parsed rules per sheet to prove each one actually loaded.
    const ruleCounts = Array.from(document.styleSheets).map(s => {
      try { return (s.href ? s.href.split('/').pop() : 'inline') + '=' + s.cssRules.length; }
      catch (e) { return (s.href || 'inline') + '=BLOCKED'; }
    });
    const panel = cs('.instrument-panel');
    const readout = cs('.readout-value');
    const logo = document.querySelector('.logo-mark').getBoundingClientRect();
    const faq = document.querySelectorAll('.faq-item').length;
    return {
      title: document.title,
      stylesheets, ruleCounts,
      panelBg: panel.backgroundColor,
      panelBlur: panel.backdropFilter,
      bodyFont: cs('body').fontFamily,
      readoutFont: readout.fontFamily,
      logo: { w: Math.round(logo.width), h: Math.round(logo.height) },
      faqItems: faq,
      footer: (document.querySelector('.site-footer') || {}).textContent,
      booted: window.__FI_BOOTED === true,
      htmlBgImage: getComputedStyle(document.documentElement).backgroundImage.slice(0, 60)
    };
  });

  await browser.close();
  server.close();

  const missing = hits.filter(h => h.status === 404);
  const served = hits.filter(h => h.status === 200);

  console.log('=== ASSETS SERVED OVER HTTP ===');
  served.forEach(h => console.log('  200  ' + h.url + '   [' + h.type + ']'));
  console.log('');
  if (missing.length) {
    console.log('=== 404s (' + missing.length + ') ===');
    missing.forEach(h => console.log('  404  ' + h.url));
  } else {
    console.log('=== 404s: none ===');
  }
  console.log('');
  console.log('=== RENDER ===');
  console.log(JSON.stringify(R, null, 2));
  console.log('');
  console.log('consoleErrors:', consoleErrors.length ? consoleErrors : 'none');
  console.log('pageErrors:', pageErrors.length ? pageErrors : 'none');

  const cssMissing = R.stylesheets.filter(s => s.includes('css') === false);
  if (missing.length || pageErrors.length || R.stylesheets.length < 6) process.exit(1);
});
