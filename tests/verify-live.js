// tests/verify-live.js — headless verification of the live app.
// node tests/verify-live.js
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PAGE_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/').replace(/ /g, '%20');
const SCREENSHOT = path.join(ROOT, '_verify.png');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-extensions',
      '--disable-background-networking', '--disable-default-apps', '--disable-sync',
      '--disable-translate', '--disable-dev-shm-usage', '--no-first-run',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--window-size=1440,1000'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 20000 });
  await sleep(5000);

  const R = {};

  R.boot = await page.evaluate(() => ({
    booted: window.__FI_BOOTED === true,
    catalog: (window.FI_CATALOG || []).length,
    constellations: (window.FI_CONSTELLATIONS || []).length,
    firstCatalog: (window.FI_CATALOG || [])[0] || null,
    errors: (window.FI.__errors || []).length
  }));

  // ---- STARS ----
  R.stars = await page.evaluate(() => {
    function brightCount(c) {
      if (!c || !c.width) return -1;
      try {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i+1] > 200 && d[i+2] > 200 && d[i+3] > 150) n++;
        return n;
      } catch (e) { return -2; }
    }
    // Any drawn ink: opaque pixel brighter than the dark chart background.
    function contentCount(c) {
      if (!c || !c.width) return -1;
      try {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i+3] > 40 && (d[i] + d[i+1] + d[i+2]) > 160) n++;
        }
        return n;
      } catch (e) { return -2; }
    }
    const c = document.getElementById('stars-canvas');
    return {
      bright: brightCount(c),
      w: c ? c.width : 0, h: c ? c.height : 0,
      status: (document.getElementById('stars-status') || {}).textContent,
      bodies: (document.getElementById('stars-bodies') || {}).textContent,
      rotationAz: window.FI.stars.getState().rotationAz
    };
  });

  // toggle tests
  R.toggles = await page.evaluate(async () => {
    const out = {};
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const before = () => JSON.stringify(window.FI.stars.getState());
    async function testToggle(id, key) {
      const el = document.getElementById(id);
      if (!el) return 'MISSING';
      const s0 = window.FI.stars.getState()[key];
      el.click(); await wait(250);
      const s1 = window.FI.stars.getState()[key];
      const pressed = el.getAttribute('aria-pressed');
      const ok = (s0 !== s1) && (pressed === String(s1));
      return ok ? 'pass' : 'fail(s0=' + s0 + ',s1=' + s1 + ',ap=' + pressed + ')';
    }
    out.constellations = await testToggle('constellation-toggle', 'showConstellations');
    out.grid = await testToggle('grid-toggle', 'showGrid');
    out.cardinal = await testToggle('cardinal-toggle', 'showCardinal');
    const mode = document.getElementById('stars-mode-btn');
    if (mode) {
      const m0 = window.FI.stars.getState().manualMode;
      mode.click(); await wait(250);
      const m1 = window.FI.stars.getState().manualMode;
      out.mode = (m0 !== m1) ? 'pass' : 'fail';
      out.modeLabel = mode.textContent;
    } else out.mode = 'MISSING';
    // restore pressed states to defaults
    document.getElementById('constellation-toggle').click();
    document.getElementById('grid-toggle').click();
    document.getElementById('cardinal-toggle').click();
    await wait(200);
    return out;
  });

  // scrubber
  R.scrubber = await page.evaluate(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const s = document.getElementById('time-scrubber-range');
    if (!s) return 'MISSING';
    const b0 = window.FI.stars.getState().timeOffsetMin;
    s.value = '600';
    s.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(300);
    const b1 = window.FI.stars.getState().timeOffsetMin;
    const label = (document.getElementById('time-scrubber-display') || {}).textContent;
    const ok = b1 === 600 && b0 === 0 && /600|10h/.test(label);
    // reset
    document.getElementById('time-reset-btn').click();
    await wait(200);
    return ok ? 'pass' : 'fail(v=' + b1 + ',label=' + label + ')';
  });

  // drag
  R.drag = await page.evaluate(() => ({ before: window.FI.stars.getState().rotationAz }));
  const box = await page.evaluate(() => {
    const r = document.getElementById('stars-canvas').getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const cy = box.y + box.h / 2;
  await page.mouse.move(box.x + box.w * 0.3, cy);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w * 0.3 + 100, cy, { steps: 10 });
  await page.mouse.up();
  await sleep(400);
  R.drag.after = await page.evaluate(() => window.FI.stars.getState().rotationAz);
  R.drag.pass = Math.abs(R.drag.after - R.drag.before) > 1;

  // ---- VIBRATION ----
  await page.evaluate(() => document.querySelector('.tab-btn[data-tab="vibration"]').click());
  await sleep(300);
  await page.evaluate(() => document.getElementById('vib-toggle-btn').click());
  await sleep(3000);
  R.vibration = await page.evaluate(() => {
    function brightCount(c) {
      if (!c || !c.width) return -1;
      try {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i+1] > 200 && d[i+2] > 200 && d[i+3] > 150) n++;
        return n;
      } catch (e) { return -2; }
    }
    // Any drawn ink: opaque pixel brighter than the dark chart background.
    function contentCount(c) {
      if (!c || !c.width) return -1;
      try {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i+3] > 40 && (d[i] + d[i+1] + d[i+2]) > 160) n++;
        }
        return n;
      } catch (e) { return -2; }
    }
    const t = (id) => { const e = document.getElementById(id); return e ? e.textContent : '(missing)'; };
    const chip = document.querySelector('#panel-vibration .mode-chip');
    return {
      x: t('vib-x'), y: t('vib-y'), z: t('vib-z'), magnitude: t('vib-magnitude'),
      rms: t('vib-rms'), peakFreq: t('vib-peak-freq'),
      status: t('vib-status'),
      chip: chip ? chip.textContent + '/' + chip.getAttribute('data-mode') : '(missing)',
      badgeVisible: !document.querySelector('#panel-vibration .sim-badge').classList.contains('hidden'),
      wavePixels: contentCount(document.getElementById('vib-wave-canvas')),
      specPixels: contentCount(document.getElementById('vib-spectrum-canvas')),
      btn: t('vib-toggle-btn')
    };
  });

  // ---- MAGNETIC ----
  await page.evaluate(() => document.querySelector('.tab-btn[data-tab="magnetic"]').click());
  await sleep(300);
  await page.evaluate(() => document.getElementById('mag-toggle-btn').click());
  await sleep(2500);
  R.magnetic = await page.evaluate(() => {
    const t = (id) => { const e = document.getElementById(id); return e ? e.textContent : '(missing)'; };
    const chip = document.querySelector('#panel-magnetic .mode-chip');
    const st = document.getElementById('mag-status');
    const cs = st ? getComputedStyle(st) : null;
    return {
      x: t('mag-x'), y: t('mag-y'), z: t('mag-z'), total: t('mag-total'),
      status: t('mag-status'),
      statusColor: cs ? cs.color : null,
      chip: chip ? chip.textContent + '/' + chip.getAttribute('data-mode') : '(missing)',
      badgeVisible: !document.querySelector('#panel-magnetic .sim-badge').classList.contains('hidden')
    };
  });

  // ---- SOUND ----
  await page.evaluate(() => document.querySelector('.tab-btn[data-tab="sound"]').click());
  await sleep(300);
  await page.evaluate(() => document.getElementById('sound-toggle-btn').click());
  await sleep(2500);
  R.sound = await page.evaluate(() => {
    function brightCount(c) {
      if (!c || !c.width) return -1;
      try {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i+1] > 200 && d[i+2] > 200 && d[i+3] > 150) n++;
        return n;
      } catch (e) { return -2; }
    }
    // Any drawn ink: opaque pixel brighter than the dark chart background.
    function contentCount(c) {
      if (!c || !c.width) return -1;
      try {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i+3] > 40 && (d[i] + d[i+1] + d[i+2]) > 160) n++;
        }
        return n;
      } catch (e) { return -2; }
    }
    const t = (id) => { const e = document.getElementById(id); return e ? e.textContent : '(missing)'; };
    const chip = document.querySelector('#panel-sound .mode-chip');
    return {
      db: t('sound-db-current'), rms: t('sound-rms'), peakFreq: t('sound-peak-freq'),
      status: t('sound-status'),
      chip: chip ? chip.textContent + '/' + chip.getAttribute('data-mode') : '(missing)',
      wavePixels: contentCount(document.getElementById('sound-wave-canvas')),
      specPixels: contentCount(document.getElementById('sound-spectrum-canvas'))
    };
  });

  // ---- ALTIMETER ----
  await page.evaluate(() => document.querySelector('.tab-btn[data-tab="altimeter"]').click());
  await sleep(300);
  R.altBeforeStart = await page.evaluate(() => {
    const t = (id) => { const e = document.getElementById(id); return e ? e.textContent : '(missing)'; };
    return { altitude: t('alt-altitude'), status: t('alt-status'), hasStartBtn: !!document.getElementById('alt-start-btn') };
  });
  const startBtn = await page.$('#alt-start-btn');
  if (startBtn) await page.evaluate(() => document.getElementById('alt-start-btn').click());
  await sleep(5000);   // long enough for the trend window (90 frames ~ 3s)
  R.altimeter = await page.evaluate(() => {
    function brightCount(c) {
      if (!c || !c.width) return -1;
      try {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i+1] > 200 && d[i+2] > 200 && d[i+3] > 150) n++;
        return n;
      } catch (e) { return -2; }
    }
    // Any drawn ink: opaque pixel brighter than the dark chart background.
    function contentCount(c) {
      if (!c || !c.width) return -1;
      try {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i+3] > 40 && (d[i] + d[i+1] + d[i+2]) > 160) n++;
        }
        return n;
      } catch (e) { return -2; }
    }
    const t = (id) => { const e = document.getElementById(id); return e ? e.textContent : '(missing)'; };
    const chip = document.querySelector('#panel-altimeter .mode-chip');
    return {
      altitude: t('alt-altitude'), gpsAlt: t('alt-gps-alt'), baroAlt: t('alt-baro-alt'),
      delta: t('alt-delta'), pressure: t('alt-pressure'), slp: t('alt-slp'),
      vspeed: t('alt-vspeed'), temperature: t('alt-temperature'), trend: t('alt-trend'),
      status: t('alt-status'), btn: t('alt-start-btn'),
      chip: chip ? chip.textContent + '/' + chip.getAttribute('data-mode') : '(missing)',
      histPixels: contentCount(document.getElementById('alt-history-canvas')),
      pressPixels: contentCount(document.getElementById('alt-pressure-history-canvas'))
    };
  });

  // ---- LAYOUT ----
  R.layout = await page.evaluate(() => {
    const shell = document.querySelector('.top-shell');
    const header = document.querySelector('.site-header');
    const tabs = document.querySelector('.tab-bar');
    const nested = document.querySelectorAll('.top-shell .top-shell').length;
    const hr = header.getBoundingClientRect();
    const tr = tabs.getBoundingClientRect();
    return {
      nestedShells: nested,
      gapHeaderToTabs: +(tr.top - hr.bottom).toFixed(2),
      shellChildren: shell ? Array.from(shell.children).map(c => c.className || c.tagName) : []
    };
  });

  // ---- SELFCHECK LINE ----
  R.selfcheck = await page.evaluate(() => window.__FI_SELFCHECK_LIVE || window.__FI_SELFCHECK || '(none)');

  // ---- FINAL ERRORS ----
  R.pageErrors = await page.evaluate(() => (window.FI.__errors || []).map(e => e.msg || String(e)));

  await page.screenshot({ path: SCREENSHOT, fullPage: true });
  await browser.close();

  console.log(JSON.stringify(R, null, 2));
  console.log('\n--- console errors (' + errors.length + ') ---');
  errors.forEach(e => console.log('  ' + e));
})().catch(e => { console.error('VERIFY FAILED:', e); process.exit(1); });
