// tests/verify-denied.js — force getUserMedia to reject and assert demo fallback.
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PAGE_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/').replace(/ /g, '%20');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-first-run']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // Deny the microphone BEFORE any app code runs.
  await page.evaluateOnNewDocument(() => {
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = function () {
        return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      };
    }
  });

  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 20000 });
  await sleep(3500);

  await page.evaluate(() => document.querySelector('.tab-btn[data-tab="sound"]').click());
  await sleep(400);
  await page.evaluate(() => document.getElementById('sound-toggle-btn').click());
  await sleep(3000);

  const res = await page.evaluate(() => {
    function contentCount(c) {
      if (!c || !c.width) return -1;
      try {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i+3] > 40 && (d[i]+d[i+1]+d[i+2]) > 160) n++;
        return n;
      } catch (e) { return -2; }
    }
    const t = (id) => { const e = document.getElementById(id); return e ? e.textContent : '(missing)'; };
    const chip = document.querySelector('#panel-sound .mode-chip');
    return {
      db: t('sound-db-current'),
      peakFreq: t('sound-peak-freq'),
      status: t('sound-status'),
      chip: chip ? chip.textContent + '/' + chip.getAttribute('data-mode') : '(missing)',
      badgeVisible: !document.querySelector('#panel-sound .sim-badge').classList.contains('hidden'),
      wavePixels: contentCount(document.getElementById('sound-wave-canvas')),
      specPixels: contentCount(document.getElementById('sound-spectrum-canvas')),
      histPixels: contentCount(document.getElementById('sound-history-canvas')),
      appErrors: (window.FI.__errors || []).length
    };
  });

  console.log(JSON.stringify(res, null, 2));
  console.log('console/page errors: ' + (errors.length ? JSON.stringify(errors) : 'NONE'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
