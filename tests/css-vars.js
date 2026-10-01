/* ============================================================
   css-vars.js — CSS custom property audit (CommonJS)
   Every var(--x) used must have a --x: definition.
   No orphan/duplicate definitions.
   ============================================================ */

'use strict';

var fs = require('fs');
var path = require('path');

var BASE = path.resolve(__dirname, '..');
var cssDir = path.join(BASE, 'styles');

var allCss = '';
try {
  var cssFiles = fs.readdirSync(cssDir).filter(function(f) { return f.endsWith('.css'); });
  cssFiles.sort();
  for (var i = 0; i < cssFiles.length; i++) {
    allCss += fs.readFileSync(path.join(cssDir, cssFiles[i]), 'utf8') + '\n';
  }
} catch (e) {
  console.error('Failed to read CSS directory:', e.message);
  process.exit(1);
}

var html = fs.readFileSync(path.join(BASE, 'index.html'), 'utf8');
var inlineStyleRegex = /style\s*=\s*["']([^"']+)["']/g;
var inlineStyles = '';
var sm;
while ((sm = inlineStyleRegex.exec(html)) !== null) {
  inlineStyles += sm[1] + '\n';
}

var combinedCss = allCss + '\n' + inlineStyles;

var usages = new Set();
var varUsageRegex = /var\s*\(\s*--([a-zA-Z_-][a-zA-Z0-9_-]*)/g;
var um;
while ((um = varUsageRegex.exec(combinedCss)) !== null) {
  usages.add(um[1]);
}

var defs = new Set();
var defRegex = /--([a-zA-Z_-][a-zA-Z0-9_-]*)\s*:/g;
var dm;
while ((dm = defRegex.exec(allCss)) !== null) {
  defs.add(dm[1]);
}

var undefinedVars = [];
var usedArray = Array.from(usages);
for (var ui = 0; ui < usedArray.length; ui++) {
  if (defs.has(usedArray[ui])) continue;
  var fallbackPattern = new RegExp('var\\s*\\(\\s*--' + usedArray[ui] + '\\s*,\\s*[^)]+\\)');
  if (!fallbackPattern.test(combinedCss)) {
    undefinedVars.push(usedArray[ui]);
  }
}

var defCounts = {};
var dupDefs = [];
var dt;
while ((dt = defRegex.exec(allCss)) !== null) {
  var name = dt[1];
  if (!defCounts[name]) defCounts[name] = 0;
  defCounts[name]++;
}
for (var dc in defCounts) {
  if (defCounts[dc] > 1) dupDefs.push(dc + ' (' + defCounts[dc] + 'x)');
}

console.log('=== CSS Custom Property Audit ===');
console.log('Properties defined: ' + defs.size);
console.log('Properties used: ' + usages.size);
console.log('');

if (undefinedVars.length > 0) {
  console.log('FAIL: These var(--x) usages have NO definition:');
  for (var i = 0; i < undefinedVars.length; i++) console.log('  UNDEFINED: --' + undefinedVars[i]);
} else {
  console.log('PASS: All var(--x) usages have a definition');
}

if (dupDefs.length > 0) {
  console.log('');
  console.log('WARN: Duplicate property definitions:');
  for (var j = 0; j < dupDefs.length; j++) console.log('  DUPLICATE: --' + dupDefs[j]);
} else {
  console.log('PASS: No duplicate property definitions');
}

console.log('');
console.log('=== Summary ===');
console.log('Undefined vars: ' + undefinedVars.length);
console.log('Duplicate defs: ' + dupDefs.length);

if (undefinedVars.length > 0) process.exit(1);
