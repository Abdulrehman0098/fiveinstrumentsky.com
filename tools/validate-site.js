'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const INDEX = read('index.html');
const TOOL_SLUGS = [
  'star-finder',
  'sound-level-meter',
  'vibration-analyzer',
  'magnetic-field-mapper',
  'barometric-altimeter',
];

let failures = [];
const check = (ok, label) => {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label);
  if (!ok) failures.push(label);
};

check(exists('assets/css/premium.css'), 'premium glass stylesheet exists');
check(INDEX.includes('<title>Field Instruments'), 'index has SEO title');
check(/<meta name="description"/.test(INDEX), 'index has meta description');
check(INDEX.includes('rel="canonical"'), 'index has canonical link');
check(INDEX.includes('application/ld+json'), 'index has JSON-LD');
check(INDEX.includes('guide-section'), 'index has tool guide sections');
check((INDEX.match(/<h1[\s>]/g) || []).length === 1, 'index has exactly one h1');
check((INDEX.match(/<h2[\s>]/g) || []).length > 0, 'index has h2 headings for guides');
check((INDEX.match(/<h3[\s>]/g) || []).length > 0, 'index has h3 headings for guides');

for (const slug of TOOL_SLUGS) {
  const page = read(slug + '.html');
  check(page.includes('<title>'), slug + '.html has a title');
  check(/<meta name="description"/.test(page), slug + '.html has meta description');
  check((page.match(/<h1[\s>]/g) || []).length === 1, slug + '.html has exactly one h1');
  check(page.includes('application/ld+json'), slug + '.html has JSON-LD');
  check(page.includes('"@type": "WebApplication"'), slug + '.html has WebApplication JSON-LD');
  check(page.includes('"operatingSystem": "Any"'), slug + '.html WebApplication operatingSystem Any');
  check(page.includes('"price": "0"'), slug + '.html WebApplication offers price 0');
  check(page.includes('This tool is for educational purposes'), slug + '.html has educational disclaimer');
}

const PRIVACY = read('privacy.html');
check(PRIVACY.includes('AdSense'), 'privacy policy mentions AdSense');
check(PRIVACY.includes('DoubleClick'), 'privacy policy mentions DoubleClick DART');
check(PRIVACY.includes('locally'), 'privacy policy states local processing');
check(PRIVACY.includes('not stored') || PRIVACY.includes('never written to a server'), 'privacy policy states no server storage');

const ABOUT = read('about.html');
check(ABOUT.includes('educational project dedicated'), 'about page uses mission tone');

const TERMS = read('terms.html');
check(TERMS.includes('Terms of Service'), 'terms page has title');

const CONTACT = read('contact.html');
check(CONTACT.includes('mailto:'), 'contact page has contact email');

const KB = read('knowledge-base.html');
check(KB.includes('Knowledge Base'), 'knowledge base page exists');

if (failures.length) {
  console.error('\nValidation FAILED with ' + failures.length + ' issue(s):');
  failures.forEach((f) => console.error(' - ' + f));
  process.exit(1);
}
console.log('\nSite validation passed: 0 failures.');
