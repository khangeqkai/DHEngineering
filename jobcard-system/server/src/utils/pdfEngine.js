const logger = require('./logger');
const { probeBrowser, inElectron } = require('./htmlToPdf');

// Tracks whether the background browser that turns a job card into a PDF is actually
// usable on this machine. The standalone (command-line) server relies on a Chrome
// that Puppeteer downloads separately; if it's missing the card is silently dropped
// from every packet. We check once at startup so the problem surfaces loudly (in the
// log and on /health) instead of only when someone tries to print.
//
//   'pending'     — not checked yet
//   'ready'       — browser launched fine; PDFs will render
//   'unavailable' — browser could not start (needs downloading); cards will be skipped
//   'electron'    — running inside the packaged desktop app, which uses its own
//                   built-in browser, so this check doesn't apply
let status = 'pending';

function getPdfEngineStatus() {
  return status;
}

// Non-blocking: never delays or crashes server startup. Inside the packaged desktop
// app we skip entirely (Electron renders with its own browser). Outside it, we warm
// the shared browser; on failure we log a plain, actionable message with the exact
// one-line fix.
async function verifyPdfEngine() {
  if (inElectron()) {
    status = 'electron';
    return status;
  }
  try {
    await probeBrowser();
    status = 'ready';
    logger.info('PDF engine ready (card printing available)');
  } catch (err) {
    status = 'unavailable';
    logger.error(
      { err },
      'PDF engine could NOT start — printed job cards will be left out of packets. ' +
        'Fix it by downloading the renderer once: cd server && npx puppeteer browsers install chrome'
    );
  }
  return status;
}

module.exports = { verifyPdfEngine, getPdfEngineStatus };
