const path = require('path');

// Keep Puppeteer's downloaded Chrome INSIDE the project (server/.chrome) instead of
// the default hidden per-user cache (~/.cache/puppeteer). This is what makes the
// command-line server reliable: the browser is then tied to the app folder, not to
// one OS login, so it survives a folder copy (same OS) and can't be "found under the
// wrong user". Both the one-time download (scripts/setup.js -> `npx puppeteer
// browsers install chrome`) and the runtime launch (server/src/utils/htmlToPdf.js)
// read this file, so they always agree on where the browser lives.
//
// The .chrome folder is gitignored — the binary is large and OS-specific (a Linux
// build won't run on the Windows machine), so each machine fetches its own.
module.exports = {
  cacheDirectory: path.join(__dirname, '.chrome'),
};
