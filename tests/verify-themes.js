// tests/verify-themes.js — confirm each theme applies distinct colours.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PORT = 8799;
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
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await sleep(2500);

  const rows = [];
  for (const t of ['galaxy', 'daylight', 'night']) {
    await page.evaluate(th => document.documentElement.setAttribute('data-theme', th), t);
    await sleep(500);
    const r = await page.evaluate(() => {
      const c = getComputedStyle(document.documentElement);
      const panel = getComputedStyle(document.querySelector('.instrument-panel'));
      const faq = getComputedStyle(document.querySelector('.faq-item'));
      return {
        htmlBg: c.backgroundColor,
        bgImg: c.backgroundImage.slice(0, 44),
        ink: c.getPropertyValue('--ink').trim(),
        gold: c.getPropertyValue('--gold').trim(),
        panelBg: panel.backgroundColor,
        panelBlur: panel.backdropFilter,
        faqBg: faq.backgroundColor,
        font: getComputedStyle(document.body).fontFamily.split(',')[0]
      };
    });
    rows.push({ theme: t, ...r });
  }

  await browser.close();
  server.close();

  rows.forEach(r => {
    console.log(r.theme.padEnd(9) + ' htmlBg=' + String(r.htmlBg).padEnd(20) +
      ' ink=' + String(r.ink).padEnd(9) + ' gold=' + String(r.gold).padEnd(9) +
      ' font=' + r.font);
    console.log('          panel=' + String(r.panelBg).padEnd(24) + ' faq=' + r.faqBg);
    console.log('          bgImg=' + r.bgImg);
  });

  const distinctBg = new Set(rows.map(r => r.htmlBg)).size;
  const distinctInk = new Set(rows.map(r => r.ink)).size;
  console.log('\ndistinct html backgrounds: ' + distinctBg + '/3');
  console.log('distinct ink colours: ' + distinctInk + '/3');
  console.log('glass blur active: ' + rows.every(r => r.panelBlur && r.panelBlur !== 'none'));
  if (distinctBg < 3 || distinctInk < 3) { console.log('FAIL: themes not distinct'); process.exit(1); }
  console.log('PASS: all three themes render distinctly');
});
