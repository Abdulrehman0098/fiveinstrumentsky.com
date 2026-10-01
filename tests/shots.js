// tests/shots.js — capture one screenshot per instrument panel.
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PAGE_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/').replace(/ /g, '%20');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--no-first-run', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
           '--window-size=1440,1000']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 20000 });
  await sleep(4000);

  const tabs = ['stars', 'sound', 'vibration', 'magnetic', 'altimeter'];
  for (const t of tabs) {
    await page.evaluate((tab) => {
      const b = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
      if (b) b.click();
    }, t);
    await sleep(400);
    // start measurement for the sensor panels
    if (t !== 'stars') {
      const id = { sound: 'sound-toggle-btn', vibration: 'vib-toggle-btn',
                   magnetic: 'mag-toggle-btn', altimeter: 'alt-start-btn' }[t];
      await page.evaluate((bid) => { const b = document.getElementById(bid); if (b) b.click(); }, id);
      await sleep(2500);
    } else {
      await sleep(1200);
    }
    const out = path.join(ROOT, '_shot-' + t + '.png');
    await page.screenshot({ path: out });
    console.log('saved', out);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
