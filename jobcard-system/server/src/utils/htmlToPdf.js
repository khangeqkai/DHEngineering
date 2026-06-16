const os = require('os');
const path = require('path');
const fs = require('fs');

const logger = require('./logger');

// Render a self-contained HTML page (the generated job card) to a PDF buffer,
// server-side, so the combined packet is built entirely on the server and both the
// desktop app and the browser build get the identical card-first packet.
//
// Two rendering paths, both Chromium-based so the output is the same:
//  - When the server runs in-process inside the packaged desktop app
//    (client/electron/main.js startServer), we drive Electron's own off-screen
//    renderer — Chromium is already there, nothing extra to ship.
//  - Otherwise (development, or the server run as its own background program) we
//    use Puppeteer's bundled headless Chromium.
// Same engine family, same options (A4, backgrounds on, zero margins — the card
// CSS sets @page margin 0 and self-pads), so the card looks identical everywhere.

const PDF_OPTS = { pageSize: 'A4', printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } };

function inElectron() {
  return !!process.versions.electron;
}

// Path 1: Electron's off-screen window (used by the installed desktop app).
async function renderWithElectron(html) {
  const { BrowserWindow } = require('electron');
  const tmpHtml = path.join(os.tmpdir(), `Job Card packet ${Date.now()}.html`);
  let win = null;
  try {
    await fs.promises.writeFile(tmpHtml, html, 'utf-8');
    win = new BrowserWindow({ show: false, webPreferences: { offscreen: false, sandbox: true } });
    await win.loadFile(tmpHtml); // resolves on did-finish-load
    // The card is fully self-contained; a small settle delay guards a first-layout race.
    await new Promise(resolve => setTimeout(resolve, 150));
    const pdf = await win.webContents.printToPDF(PDF_OPTS);
    return Buffer.from(pdf);
  } finally {
    if (win) win.destroy();
    fs.promises.unlink(tmpHtml).catch(() => {});
  }
}

// Path 2: Puppeteer's headless Chromium (development / standalone server).
// One browser is reused across requests and relaunched if it has died.
let browserPromise = null;

function launchBrowser() {
  const puppeteer = require('puppeteer');
  const p = puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  // If the launch itself fails, clear the cache so the next caller starts fresh —
  // but only if we're still the cached instance (don't clobber a newer relaunch).
  p.catch(() => { if (browserPromise === p) browserPromise = null; });
  return p;
}

// Drop the cached browser AND close the underlying instance. The cache slot is
// only cleared if it's still the instance that failed — so a relaunch already
// started by a concurrent request isn't thrown away (which would leave that fresh
// browser running with nothing pointing at it). The close, though, always runs on
// the failed instance: whether it's the still-cached one or an older one a
// concurrent relaunch already replaced, a dead/half-gone Chromium must be shut
// down or it lingers as an orphaned process.
function discardBrowser(failed) {
  if (browserPromise === failed) browserPromise = null;
  // `failed` is the launch promise; close the browser it resolved to, if any.
  // Swallow everything — the launch may have rejected (no browser) or the process
  // may already be gone.
  Promise.resolve(failed).then(b => b && b.close().catch(() => {})).catch(() => {});
}

// Returns { browser, promise } — `promise` is the exact launch this browser came
// from, so the caller can later discard *that* one and never the global slot (which
// a concurrent relaunch may have already replaced with a healthy browser).
async function getBrowser() {
  if (!browserPromise) browserPromise = launchBrowser();
  let mine = browserPromise;
  let browser;
  try {
    browser = await mine;
  } catch (err) {
    discardBrowser(mine);
    throw err;
  }
  if (browser.connected) return { browser, promise: mine };

  // Cached browser has died — discard it (which also closes it, in case it's only
  // half-gone) and relaunch once. The discard is guarded so two requests racing
  // here can't each spawn a browser and orphan one.
  discardBrowser(mine);
  if (!browserPromise) browserPromise = launchBrowser();
  mine = browserPromise;
  try {
    browser = await mine;
  } catch (err) {
    discardBrowser(mine);
    throw err;
  }
  return { browser, promise: mine };
}

async function renderWithPuppeteer(html) {
  let browser, mine;
  try {
    ({ browser, promise: mine } = await getBrowser());
  } catch (err) {
    logger.error({ err }, 'Failed to launch headless browser for PDF rendering');
    throw new Error('PDF engine unavailable on this server');
  }
  let page;
  try {
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
    return Buffer.from(pdf);
  } catch (err) {
    // A failure here (opening a page / loading / printing) can mean the browser
    // crashed mid-render. If it's no longer healthy, drop and close the instance so
    // the next request relaunches instead of silently reusing a broken one and
    // dropping the job card from every packet (and so the dead process doesn't
    // linger orphaned).
    if (!browser.connected) discardBrowser(mine);
    throw err;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

/**
 * @param {string} html - a fully self-contained HTML document (inline CSS, no external fetches)
 * @returns {Promise<Buffer>} the rendered PDF
 */
async function renderHtmlToPdf(html) {
  return inElectron() ? renderWithElectron(html) : renderWithPuppeteer(html);
}

module.exports = { renderHtmlToPdf };
