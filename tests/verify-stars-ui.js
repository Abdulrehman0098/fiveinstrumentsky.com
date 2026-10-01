// tests/verify-stars-ui.js — Parts 1-3: slider layout, search, click-to-info.
// node tests/verify-stars-ui.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const PORT = 8791;
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png',
  '.woff2':'font/woff2' };

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

  const reqFail = [], consoleErrors = [], pageErrors = [];
  page.on('requestfailed', r => reqFail.push(r.url().split('/').pop()));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 25000 });
  await sleep(3500);

  const out = {};

  /* ---------- FONTS ---------- */
  out.fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [];
    document.fonts.forEach(f => loaded.push(f.family + ' ' + f.weight + ' ' + f.status));
    const bodyF = getComputedStyle(document.body).fontFamily;
    const monoF = getComputedStyle(document.querySelector('.scrubber-value')).fontFamily;
    return { loaded, bodyF, monoF, interReady: document.fonts.check('16px Inter'), jbReady: document.fonts.check('16px "JetBrains Mono"') };
  });

  /* ---------- PART 1: SLIDER LAYOUT ---------- */
  out.slider = await page.evaluate(() => {
    const row = document.querySelector('.time-scrubber-row');
    const label = row.querySelector('.scrubber-label');
    const track = row.querySelector('.scrubber-track');
    const actions = row.querySelector('.scrubber-actions');
    const r = row.getBoundingClientRect(), l = label.getBoundingClientRect();
    const t = track.getBoundingClientRect(), a = actions.getBoundingClientRect();
    const rs = getComputedStyle(row);
    return {
      display: rs.display,
      cols: rs.gridTemplateColumns,
      rowLeft: Math.round(r.left), rowRight: Math.round(r.right),
      labelLeft: Math.round(l.left), labelRight: Math.round(l.right),
      trackLeft: Math.round(t.left), trackRight: Math.round(t.right), trackW: Math.round(t.width),
      actLeft: Math.round(a.left), actRight: Math.round(a.right),
      // label is left of track, track is left of actions
      ordered: (l.right <= t.left + 1) && (t.right <= a.left + 1),
      insideRow: (l.left >= r.left - 1) && (a.right <= r.right + 1),
      overflow: row.scrollWidth > row.clientWidth + 1
    };
  });

  /* ---------- PART 2: SEARCH ---------- */
  await page.click('#star-search-input');
  await page.type('#star-search-input', 'sir', { delay: 60 });
  await sleep(700);

  out.search = await page.evaluate(() => {
    const res = document.getElementById('stars-search-result');
    const hits = Array.from(res.querySelectorAll('.search-hit'));
    const clearBtn = document.getElementById('star-search-clear');
    return {
      state: res.getAttribute('data-state'),
      count: hits.length,
      first: hits[0] ? hits[0].querySelector('.search-hit-name').textContent : null,
      names: hits.map(h => h.querySelector('.search-hit-name').textContent),
      clearVisible: !clearBtn.hasAttribute('hidden'),
      inputExpanded: document.getElementById('star-search-input').getAttribute('aria-expanded'),
      selected: window.FI.starsUI && window.FI.starsUI.getSelected() ? window.FI.starsUI.getSelected().name : null
    };
  });

  // Clear button
  await page.click('#star-search-clear');
  await sleep(500);
  out.afterClear = await page.evaluate(() => {
    const res = document.getElementById('stars-search-result');
    return {
      value: document.getElementById('star-search-input').value,
      count: res.querySelectorAll('.search-hit').length,
      clearHidden: document.getElementById('star-search-clear').hasAttribute('hidden'),
      selected: window.FI.starsUI.getSelected()
    };
  });

  // No-match state
  await page.type('#star-search-input', 'zzzz', { delay: 30 });
  await sleep(600);
  out.noMatch = await page.evaluate(() => {
    const res = document.getElementById('stars-search-result');
    return { state: res.getAttribute('data-state'), text: res.textContent.trim() };
  });
  await page.click('#star-search-clear');
  await sleep(400);

  /* ---------- PART 3: CLICK-TO-INFO ---------- */
  // Find a visible star and compute its on-screen position.
  const target = await page.evaluate(() => {
    const g = window.FI.stars.geom;
    const cat = window.FI.stars.getCatalog();
    for (const s of cat) {
      const p = window.FI.stars.project(s, g.cx, g.cy, g.radius, g.lst);
      if (!p) continue;
      const c = document.getElementById('stars-canvas');
      const rect = c.getBoundingClientRect();
      const sx = rect.left + p.x * (rect.width / g.cssW);
      const sy = rect.top + p.y * (rect.height / g.cssH);
      if (sx > rect.left + 40 && sx < rect.right - 40 && sy > rect.top + 40 && sy < rect.bottom - 40) {
        return { name: s.name, con: s.con, mag: s.mag, sx: Math.round(sx), sy: Math.round(sy) };
      }
    }
    return null;
  });
  out.clickTarget = target;

  if (target) {
    await page.mouse.click(target.sx, target.sy);
    await sleep(800);
    out.infoPanel = await page.evaluate(() => {
      const panel = document.getElementById('stars-info-panel');
      const q = (s) => { const e = panel.querySelector(s); return e ? e.textContent.trim() : null; };
      const rows = {};
      panel.querySelectorAll('.star-info-row').forEach(r => {
        rows[r.querySelector('dt').textContent] = r.querySelector('dd').textContent;
      });
      return {
        open: !panel.hasAttribute('hidden'),
        name: q('.star-info-name'),
        sub: q('.star-info-sub'),
        colour: q('.star-info-colour'),
        rows,
        swatchBg: panel.querySelector('.star-info-swatch') ? panel.querySelector('.star-info-swatch').style.background : null
      };
    });

    // Close via X
    await page.click('#stars-info-close');
    await sleep(400);
    out.afterClose = await page.evaluate(() => ({
      open: !document.getElementById('stars-info-panel').hasAttribute('hidden'),
      selected: window.FI.starsUI.getSelected()
    }));
  }

  // Click empty sky should not open a panel
  await page.mouse.click(30, 600);
  await sleep(400);
  out.emptyClick = await page.evaluate(() => ({
    open: !document.getElementById('stars-info-panel').hasAttribute('hidden')
  }));

  await page.screenshot({ path: path.join(ROOT, '_verify-stars.png') });

  /* ---------- RESPONSIVE SLIDER ---------- */
  out.responsive = [];
  for (const w of [320, 390, 768, 1440]) {
    await page.setViewport({ width: w, height: 900 });
    await sleep(900);
    const r = await page.evaluate(() => {
      const row = document.querySelector('.time-scrubber-row');
      const label = row.querySelector('.scrubber-label');
      const track = row.querySelector('.scrubber-track');
      const actions = row.querySelector('.scrubber-actions');
      const rr = row.getBoundingClientRect();
      const l = label.getBoundingClientRect(), t = track.getBoundingClientRect(), a = actions.getBoundingClientRect();
      return {
        overflow: row.scrollWidth > row.clientWidth + 1,
        insideRow: (l.left >= rr.left - 1) && (a.right <= rr.right + 1) && (t.left >= rr.left - 1) && (t.right <= rr.right + 1),
        trackW: Math.round(t.width),
        docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        stacked: l.top < t.top
      };
    });
    out.responsive.push({ w, ...r });
  }

  await browser.close();
  server.close();

  console.log(JSON.stringify({ ...out, reqFail, consoleErrors, pageErrors }, null, 2));
});
