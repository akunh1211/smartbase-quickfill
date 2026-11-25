const fs = require('fs');
const path = require('path');

// 1. Copy userscript into chrome-extension/
const srcPath = path.join(__dirname, 'smartbase-quickfill.user.js');
const extPath = path.join(__dirname, 'chrome-extension', 'smartbase-quickfill.user.js');
const rawCode = fs.readFileSync(srcPath, 'utf8');
fs.writeFileSync(extPath, rawCode, 'utf8');

// 2. Build tiny (~240 chars) auto-updating Chrome Bookmarklet loader with diagnostic error alert.
// Huge inline bookmarklets (>30KB) get silently truncated by Android Chrome's Edit Bookmark field.
const hostedScriptUrl = 'https://akunh1211.github.io/smartbase-quickfill/smartbase-quickfill.user.js';
const bookmarklet = `javascript:(function(){if(window.__SMARTBASE_QUICKFILL_LOADED__){var h=document.getElementById('sb-qf-host');if(h&&h.shadowRoot){var f=h.shadowRoot.getElementById('qf-fab');if(f)f.click();}return;}var s=document.createElement('script');s.src='${hostedScriptUrl}?t='+Date.now();s.onerror=function(){alert('האתר חוסם טעינה חיצונית בכרום (CSP). מומלץ לפתוח דרך Edge או Firefox + Tampermonkey.');};document.head.appendChild(s);})();`;

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
console.log('Built chrome-bookmarklet.txt (' + bookmarklet.length + ' chars)');
