// tests/verify-faq.js — verifies the Netlify fix + FAQ + footer + logo.
// node tests/verify-faq.js
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
           '--no-first-run', '--window-size=1440,1000']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  const failed = [];
  page.on('requestfailed', r => failed.push(r.url().split('/').pop() + ' :: ' + r.failure().errorText));
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 20000 });
  await sleep(2500);

  const R = await page.evaluate(() => {
    const cs = (el) => el ? getComputedStyle(el) : null;
    const sheets = Array.from(document.styleSheets).map(s => {
      try { return { href: (s.href || 'inline').split('/').slice(-2).join('/'), rules: s.cssRules.length }; }
      catch (e) { return { href: (s.href || 'inline'), rules: -1 }; }
    });

    // 1. Is the CSS actually applied? (proves stylesheets resolved)
    const bodyCS = cs(document.body);
    const panel = document.querySelector('.instrument-panel');
    const panelCS = cs(panel);
    const header = document.querySelector('.site-header');
    const headerCS = cs(header);

    // 2. Logo size — the "giant yellow circle" check
    const logo = document.querySelector('.logo-mark');
    const lr = logo ? logo.getBoundingClientRect() : null;
    const logoCS = cs(logo);

    // 3. FAQ presence + wiring
    const faqItems = document.querySelectorAll('.faq-item');
    const faqQs = document.querySelectorAll('.faq-question');
    const faqAs = document.querySelectorAll('.faq-answer');
    const firstAnswerCS = cs(faqAs[0]);

    // 4. Footer
    const footer = document.querySelector('.site-footer');
    const footerText = footer ? footer.textContent.trim() : '(missing)';

    // 5. Yellow circle anywhere oversized?
    const bigYellow = [];
    document.querySelectorAll('svg, canvas, div, span').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 260 && r.height > 260) {
        const c = cs(el);
        const s = (c.stroke || '') + (c.background || '') + (c.backgroundColor || '') + (c.borderColor || '');
        if (/255,\s*215,\s*0|#ffd700|rgb\(255, 215, 0\)/i.test(s)) {
          bigYellow.push({ tag: el.tagName, cls: el.className.toString().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) });
        }
      }
    });

    return {
      sheets,
      cssApplied: {
        bodyFont: bodyCS.fontFamily,
        panelBg: panelCS ? panelCS.backgroundColor : null,
        panelBlur: panelCS ? panelCS.backdropFilter : null,
        panelRadius: panelCS ? panelCS.borderRadius : null,
        headerBg: headerCS ? headerCS.backgroundColor : null,
        readoutFont: (() => { const r = document.querySelector('.readout-value'); return r ? cs(r).fontFamily : null; })(),
        monoFont: bodyCS.getPropertyValue('--font-mono').trim(),
        sansFont: bodyCS.getPropertyValue('--font-sans').trim()
      },
      logo: lr ? { w: Math.round(lr.width), h: Math.round(lr.height),
                   cssW: logoCS.width, cssH: logoCS.height,
                   attrW: logo.getAttribute('width'), attrH: logo.getAttribute('height') } : null,
      faq: {
        items: faqItems.length,
        questions: faqQs.length,
        answers: faqAs.length,
        firstHidden: faqAs[0] ? faqAs[0].hasAttribute('hidden') : null,
        firstExpanded: faqQs[0] ? faqQs[0].getAttribute('aria-expanded') : null,
        firstDisplay: firstAnswerCS ? firstAnswerCS.display : null,
        firstMaxHeight: faqAs[0] ? faqAs[0].style.maxHeight : null,
        texts: Array.from(faqQs).map(q => q.textContent.trim()),
        answersText: Array.from(faqAs).map(a => a.textContent.trim().slice(0, 60))
      },
      footerText,
      bigYellow,
      booted: window.__FI_BOOTED === true
    };
  });

  // ---- Interaction test: click each FAQ question ----
  const faqInteraction = [];
  const count = await page.evaluate(() => document.querySelectorAll('.faq-question').length);
  for (let i = 0; i < count; i++) {
    await page.evaluate((idx) => document.querySelectorAll('.faq-question')[idx].click(), i);
    await sleep(420);
    const state = await page.evaluate((idx) => {
      const item = document.querySelectorAll('.faq-item')[idx];
      const btn = item.querySelector('.faq-question');
      const ans = item.querySelector('.faq-answer');
      const r = ans.getBoundingClientRect();
      return {
        open: item.classList.contains('open'),
        expanded: btn.getAttribute('aria-expanded'),
        height: Math.round(r.height),
        opacity: getComputedStyle(ans).opacity
      };
    }, i);
    faqInteraction.push({ q: i + 1, ...state });
    // close it again
    await page.evaluate((idx) => document.querySelectorAll('.faq-question')[idx].click(), i);
    await sleep(400);
    const closed = await page.evaluate((idx) => {
      const item = document.querySelectorAll('.faq-item')[idx];
      const ans = item.querySelector('.faq-answer');
      return { open: item.classList.contains('open'), height: Math.round(ans.getBoundingClientRect().height) };
    }, i);
    faqInteraction[faqInteraction.length - 1].closedHeight = closed.height;
    faqInteraction[faqInteraction.length - 1].closedOk = !closed.open && closed.height < 5;
  }

  await page.screenshot({ path: path.join(ROOT, '_verify.png'), fullPage: true });

  // screenshot with first FAQ open
  await page.evaluate(() => document.querySelectorAll('.faq-question')[0].click());
  await sleep(500);
  await page.screenshot({ path: path.join(ROOT, '_verify-faq.png'), fullPage: true });

  await browser.close();

  console.log(JSON.stringify({ ...R, faqInteraction, failedRequests: failed, consoleErrors }, null, 2));
})().catch(e => { console.error('VERIFY FAILED:', e); process.exit(1); });
