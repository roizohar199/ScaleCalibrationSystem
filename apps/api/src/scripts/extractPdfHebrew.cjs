const fs = require('fs');
const path = require('path');

function latestPdf(dir) {
  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf'));
  if (!files.length) return null;
  files.sort((a,b) => fs.statSync(path.join(dir,b)).mtimeMs - fs.statSync(path.join(dir,a)).mtimeMs);
  return path.join(dir, files[0]);
}

const dir = path.resolve('storage/certificates');
if (!fs.existsSync(dir)) {
  console.error('No certificates directory found:', dir);
  process.exit(1);
}

const file = latestPdf(dir);
if (!file) {
  console.error('No PDF files found in', dir);
  process.exit(2);
}

console.log('Examining PDF:', file);

const buf = fs.readFileSync(file);
// Try to extract UTF-8 Hebrew runs from the binary by decoding as utf8 and matching Hebrew unicode block
const text = buf.toString('utf8');
const hebrewMatches = text.match(/[\u0590-\u05FF\uFB1D-\uFB4F\s]{4,}/g);
if (!hebrewMatches) {
  console.log('No obvious Hebrew UTF-8 runs found inside PDF binary. This may mean text is embedded with font-specific encoding.');
  process.exit(0);
}

console.log('Found Hebrew text snippets (first 10):');
console.log(hebrewMatches.slice(0,10).map(s => s.replace(/\s+/g,' ')).join('\n---\n'));
