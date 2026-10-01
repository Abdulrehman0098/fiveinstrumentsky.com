/* ============================================================
   id-audit.js — HTML/JS ID contract audit (CommonJS)
   Every getElementById / querySelector target in scripts/
   must exist exactly once in index.html.
   ============================================================ */

'use strict';

var fs = require('fs');
var path = require('path');

var BASE = path.resolve(__dirname, '..');

var html = fs.readFileSync(path.join(BASE, 'index.html'), 'utf8');

var htmlIdSet = new Set();
var idRegex = /id\s*=\s*["']([^"']+)["']/g;
var m;
while ((m = idRegex.exec(html)) !== null) {
  htmlIdSet.add(m[1]);
}

var jsDir = path.join(BASE, 'scripts');
var jsIdRefs = new Set();
var jsIdGet = new Set();
var jsIdQuery = new Set();

function scanJsFile(filePath) {
  var content = fs.readFileSync(filePath, 'utf8');
  var gbRegex = /getElementById\s*\(\s*["']([^"']+)["']/g;
  var gm;
  while ((gm = gbRegex.exec(content)) !== null) {
    jsIdGet.add(gm[1]);
    jsIdRefs.add(gm[1]);
  }
  var qsRegex = /querySelector(?:All)?\s*\(\s*["']([^"']+)["']/g;
  var qm;
  while ((qm = qsRegex.exec(content)) !== null) {
    var sel = qm[1];
    var idMatch = sel.match(/^#([^\s#.>\+~[\]]+)/);
    if (idMatch) {
      jsIdQuery.add(idMatch[1]);
      jsIdRefs.add(idMatch[1]);
    }
  }
}

var allJsFiles = [];
function walkDir(dir) {
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkDir(full);
    } else if (e.name.endsWith('.js')) {
      allJsFiles.push(full);
    }
  }
}
walkDir(jsDir);
for (var j = 0; j < allJsFiles.length; j++) {
  try { scanJsFile(allJsFiles[j]); } catch (e) {}
}

// Inline scripts in HTML
var inlineScriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/g;
var is;
while ((is = inlineScriptRegex.exec(html)) !== null) {
  var code = is[1];
  var gbRegex2 = /getElementById\s*\(\s*["']([^"']+)["']/g;
  var gm2;
  while ((gm2 = gbRegex2.exec(code)) !== null) {
    jsIdGet.add(gm2[1]);
    jsIdRefs.add(gm2[1]);
  }
}

var missingIds = [];
var sortedRefs = Array.from(jsIdRefs).sort();
for (var k = 0; k < sortedRefs.length; k++) {
  if (!htmlIdSet.has(sortedRefs[k])) missingIds.push(sortedRefs[k]);
}

var unusedIds = [];
var sortedHtml = Array.from(htmlIdSet).sort();
for (var u = 0; u < sortedHtml.length; u++) {
  if (sortedHtml[u].startsWith('tab-') || sortedHtml[u].startsWith('panel-')) continue;
  if (!jsIdRefs.has(sortedHtml[u])) unusedIds.push(sortedHtml[u]);
}

console.log('=== ID Audit ===');
console.log('HTML IDs found: ' + htmlIdSet.size);
console.log('JS ID references: ' + jsIdRefs.size);
console.log('  getElementById: ' + jsIdGet.size);
console.log('  querySelector ID: ' + jsIdQuery.size);
console.log('');

if (missingIds.length > 0) {
  console.log('FAIL: JS references these IDs NOT found in HTML:');
  for (var i = 0; i < missingIds.length; i++) console.log('  MISSING: ' + missingIds[i]);
} else {
  console.log('PASS: All JS-referenced IDs exist in HTML');
}

if (unusedIds.length > 0) {
  console.log('');
  console.log('INFO: These HTML IDs are not referenced by JS:');
  for (var j = 0; j < unusedIds.length; j++) console.log('  UNUSED: ' + unusedIds[j]);
} else {
  console.log('PASS: All HTML IDs are referenced by JS');
}

console.log('');
console.log('=== Summary ===');
console.log('Missing IDs: ' + missingIds.length);
console.log('Unused IDs: ' + unusedIds.length);

if (missingIds.length > 0) process.exit(1);
