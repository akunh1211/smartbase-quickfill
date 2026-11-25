const fs = require('fs');
const path = require('path');

// 1. Copy userscript into chrome-extension/
const srcPath = path.join(__dirname, 'smartbase-quickfill.user.js');
const extPath = path.join(__dirname, 'chrome-extension', 'smartbase-quickfill.user.js');
const rawCode = fs.readFileSync(srcPath, 'utf8');
fs.writeFileSync(extPath, rawCode, 'utf8');

// 2. Build CSP-safe self-contained inline bookmarklet (no external <script src>, no eval/Function!)
// Minimal safe URL encoding for Chrome bookmarklets: only encode %, #, and newlines so
// it stays compact (~30KB instead of ~85KB) and well under Chrome Android's bookmark URL limit.
const lines = rawCode.split(/\r?\n/);
const compactLines = [];
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  if (trimmed.startsWith('//')) continue;
  compactLines.push(trimmed);
}
const compactCode = compactLines.join('\n');
const bookmarklet = 'javascript:' + compactCode
  .replace(/%/g, '%25')
  .replace(/#/g, '%23')
  .replace(/\n/g, '%0A');

const outBmPath = path.join(__dirname, 'chrome-bookmarklet.txt');
fs.writeFileSync(outBmPath, bookmarklet, 'utf8');

// 3. Inject into install.html if placeholder is present
const installPath = path.join(__dirname, 'install.html');
if (fs.existsSync(installPath)) {
  let html = fs.readFileSync(installPath, 'utf8');
  const startMarker = '/*__BM_START__*/';
  const endMarker = '/*__BM_END__*/';
  const sIdx = html.indexOf(startMarker);
  const eIdx = html.indexOf(endMarker);
  if (sIdx !== -1 && eIdx !== -1) {
    const replacement = `${startMarker}${JSON.stringify(bookmarklet)}${endMarker}`;
    html = html.slice(0, sIdx) + replacement + html.slice(eIdx + endMarker.length);
    fs.writeFileSync(installPath, html, 'utf8');
    fs.writeFileSync(path.join(__dirname, 'index.html'), html, 'utf8');
    console.log('Injected inline bookmarklet into install.html & index.html');
  }
}

console.log('Copied to chrome-extension/smartbase-quickfill.user.js');
console.log('Built chrome-bookmarklet.txt (' + bookmarklet.length + ' chars, raw compact: ' + compactCode.length + ' chars)');
