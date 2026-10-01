// tests/verify-header.js — measure header layout + logo at several widths.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PORT = 8785;
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png' };

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

  for (const w of [320, 390, 768, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: 900 });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    await sleep(2500);

    const R = await page.evaluate(() => {
      const hdr = document.querySelector('.site-header');
      const left = document.querySelector('.header-left');
      const right = document.querySelector('.header-right');
      const logo = document.querySelector('.logo-mark');
      const lr = logo.getBoundingClientRect();
      const hr = hdr.getBoundingClientRect();
      const rr = right.getBoundingClientRect();
      const btns = Array.from(document.querySelectorAll('.header-right .icon-btn')).map(b => {
        const r = b.getBoundingClientRect();
        return { txt: b.textContent.trim(), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) };
      });
      return {
        docScrollW: document.documentElement.scrollWidth,
        docClientW: document.documentElement.clientWidth,
        hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        headerW: Math.round(hr.width),
        logo: { w: Math.round(lr.width), h: Math.round(lr.height), left: Math.round(lr.left), top: Math.round(lr.top) },
        rightEdge: Math.round(rr.right),
        buttons: btns,
        wordmarkVisible: (() => {
          const wm = document.querySelector('.wordmark-title');
          const r = wm.getBoundingClientRect();
          return { w: Math.round(r.width), right: Math.round(r.right) };
        })()
      };
    });
    console.log('--- viewport ' + w + 'px ---');
    console.log(JSON.stringify(R, null, 2));
    if (w === 390 || w === 1440) {
      await page.screenshot({ path: path.join(ROOT, '_hdr-' + w + '.png'), clip: { x: 0, y: 0, width: w, height: 120 } });
    }
    await page.close();
  }

  await browser.close();
  server.close();
});
