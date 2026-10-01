// tests/verify-shots.js — capture desktop + mobile screenshots for review.
// node tests/verify-shots.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PORT = 8783;

const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

server.listen(PORT, '127.0.0.1', async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--no-first-run']
  });

  // ---- Desktop ----
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await sleep(3500);
  await page.screenshot({ path: path.join(ROOT, '_verify.png') });

  // FAQ open, scrolled into view
  await page.evaluate(() => {
    document.querySelectorAll('.faq-question')[0].click();
    document.querySelector('#faq').scrollIntoView({ block: 'center' });
  });
  await sleep(900);
  await page.screenshot({ path: path.join(ROOT, '_verify-faq.png') });

  // Full page
  await page.screenshot({ path: path.join(ROOT, '_verify-full.png'), fullPage: true });

  // ---- Mobile ----
  const m = await browser.newPage();
  await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await m.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await sleep(3500);
  await m.screenshot({ path: path.join(ROOT, '_verify-mobile.png') });
  await m.evaluate(() => {
    document.querySelectorAll('.faq-question')[1].click();
    document.querySelector('#faq').scrollIntoView({ block: 'center' });
  });
  await sleep(900);
  await m.screenshot({ path: path.join(ROOT, '_verify-mobile-faq.png') });

  await browser.close();
  server.close();
  console.log('saved _verify.png _verify-faq.png _verify-full.png _verify-mobile.png _verify-mobile-faq.png');
});
