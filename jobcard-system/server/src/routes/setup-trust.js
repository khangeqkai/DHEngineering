/**
 * Trust-bootstrap routes — the one-time "set up this computer" flow for the
 * OTHER PCs on the office network (the main computer's own app window already
 * trusts the local certificate).
 *
 * These paths are deliberately PUBLIC (no login) and secretless, so they are
 * mounted BEFORE the login-guarded routers and are ALSO served over plain HTTP
 * so a browser that does not yet trust the main computer can load them WITHOUT
 * the scary warning — that warning is exactly what this flow removes, so the
 * page that removes it must not itself trip it.
 *
 * What is served:
 *   GET /setup            – a plain-language walk-through page
 *   GET /rootca.crt       – the PUBLIC trust file only (ca.crt); never a key
 *   GET /setup-helper.bat – a one-click Windows helper that does the setup
 *   GET /setup-shortcut.url – a desktop shortcut to the secure web address
 *
 * SECURITY: only the public certificate (config.certPaths.caCert) is ever
 * served here. The private keys (ca.key / server.key) are never referenced.
 */

const express = require('express');
const fs = require('fs');
const config = require('../config');
const logger = require('../utils/logger');
const { hostWithoutPort, safeHost } = require('../utils/netHost');

const router = express.Router();

// Friendly, human-readable name shown when the trust file is downloaded.
const TRUST_FILE_NAME = 'DH Engineering Job Cards.crt';
const HELPER_FILE_NAME = 'Set up this computer.bat';
const SHORTCUT_FILE_NAME = 'DH Engineering Job Cards.url';

// The Windows trusted list ("store") name is a literal a user must read on their
// own screen while following the manual steps, so it is kept verbatim there.
const WINDOWS_STORE_NAME = 'Trusted Root Certification Authorities';

// The download link the helper and page use to fetch the public trust file.
// Kept on plain HTTP with the original host (port and all) so it works BEFORE
// this computer trusts the main computer.
function plainTrustFileUrl(req) {
  return `http://${safeHost(req.headers.host)}/rootca.crt`;
}

// The secure web address a shortcut should point at (no port — the padlock
// address lives on the default secure port).
function secureAddress(req) {
  return `https://${hostWithoutPort(safeHost(req.headers.host))}/`;
}

// ---------------------------------------------------------------------------
// The public trust file (ca.crt only). Never serves any private key.
// ---------------------------------------------------------------------------
router.get('/rootca.crt', (req, res) => {
  const filePath = config.certPaths.caCert;
  if (!filePath || !fs.existsSync(filePath)) {
    // Happens on a plain development machine that never turned on the secure
    // web address. Plain message, not a stack trace.
    res
      .status(503)
      .type('text/plain')
      .send('The setup file is not ready on this computer yet.');
    return;
  }
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${TRUST_FILE_NAME}"`
  );
  fs.createReadStream(filePath)
    .on('error', (err) => {
      logger.error({ err }, 'Failed to read the public trust file');
      if (!res.headersSent) {
        res.status(500).type('text/plain').send('Could not read the setup file.');
      } else {
        res.destroy();
      }
    })
    .pipe(res);
});

// ---------------------------------------------------------------------------
// The one-click Windows helper. Self-elevates for the single approval prompt,
// downloads the public trust file from THIS computer, adds it to the trusted
// list, and drops a desktop shortcut to the secure address.
// ---------------------------------------------------------------------------
router.get('/setup-helper.bat', (req, res) => {
  const script = buildHelperScript(plainTrustFileUrl(req), secureAddress(req));
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${HELPER_FILE_NAME}"`
  );
  res.send(script);
});

// ---------------------------------------------------------------------------
// A desktop shortcut file that opens the secure web address (with the padlock).
// ---------------------------------------------------------------------------
router.get('/setup-shortcut.url', (req, res) => {
  const body = `[InternetShortcut]\r\nURL=${secureAddress(req)}\r\n`;
  res.setHeader('Content-Type', 'application/internet-shortcut');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${SHORTCUT_FILE_NAME}"`
  );
  res.send(body);
});

// ---------------------------------------------------------------------------
// The walk-through page.
// ---------------------------------------------------------------------------
router.get('/setup', (req, res) => {
  const ua = req.headers['user-agent'] || '';
  // Put the visitor's own platform first; both are always shown.
  const macFirst = /Mac OS X|Macintosh/i.test(ua) && !/Windows/i.test(ua);
  res.type('html').send(buildSetupPage(secureAddress(req), macFirst));
});

// Windows batch text. `curl.exe` ships with Windows 10+; certutil is the
// fallback fetch. `certutil -addstore -f Root` is what makes this computer
// trust the main computer, and it needs the one-time administrator approval.
function buildHelperScript(trustFileUrl, secureUrl) {
  return [
    '@echo off',
    'setlocal',
    'REM One-click setup: let this computer trust the main computer so the',
    'REM camera works and downloads are no longer blocked. You only run this once.',
    '',
    'REM Step 1: ask for the one administrator approval, then rerun ourselves.',
    'net session >nul 2>&1',
    'if %errorlevel% neq 0 (',
    '  echo Asking for permission to set up this computer...',
    `  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"`,
    '  exit /b',
    ')',
    '',
    `set "TRUSTURL=${trustFileUrl}"`,
    'set "TRUSTFILE=%TEMP%\\DHEngineeringTrust.crt"',
    '',
    'echo Getting the setup file from the main computer...',
    'curl.exe -s -o "%TRUSTFILE%" "%TRUSTURL%"',
    'if not exist "%TRUSTFILE%" (',
    '  certutil -urlcache -split -f "%TRUSTURL%" "%TRUSTFILE%" >nul',
    ')',
    'if not exist "%TRUSTFILE%" (',
    '  echo Could not reach the main computer. Check the address and try again.',
    '  pause',
    '  exit /b 1',
    ')',
    '',
    'echo Letting this computer trust the main computer...',
    'certutil -addstore -f Root "%TRUSTFILE%"',
    'if %errorlevel% neq 0 (',
    '  echo Something went wrong. Please tell the office administrator.',
    '  pause',
    '  exit /b 1',
    ')',
    '',
    'REM Step 2: put a shortcut to the secure address on the shared desktop.',
    `set "SHORTCUT=%PUBLIC%\\Desktop\\DH Engineering Job Cards.url"`,
    '> "%SHORTCUT%" echo [InternetShortcut]',
    `>> "%SHORTCUT%" echo URL=${secureUrl}`,
    '',
    'del "%TRUSTFILE%" >nul 2>&1',
    'echo.',
    'echo All done. Close this window, then close and reopen your web browser.',
    'pause',
    ''
  ].join('\r\n');
}

// Self-contained, plain-language HTML. Inline styling keeps it standalone.
// Both platforms are always shown; the visitor's own platform is put first.
function buildSetupPage(secureUrl, macFirst = false) {
  const windowsSection = `
    <h2>On a Windows computer</h2>
    <div class="step">
      <p class="sub"><strong>The easy way</strong></p>
      <ol>
        <li>Click <strong>Get the one-click helper</strong> and open the file it downloads.</li>
        <li>A window asks an administrator to approve it — click <strong>Yes</strong>.</li>
        <li>Close and reopen your web browser. That's it.</li>
      </ol>
      <a class="btn" href="/setup-helper.bat">Get the one-click helper</a>
      <p class="sub" style="margin-top:1.25rem;"><strong>If the easy way doesn't work, by hand</strong></p>
      <ol>
        <li>Click <strong>Get the setup file</strong> below.</li>
        <li>Open the file you just downloaded and click <strong>Install</strong>.</li>
        <li>Choose <strong>Local Machine</strong>, then click <strong>Next</strong>.</li>
        <li>Choose <strong>Place all certificates in the following store</strong>, click
          <strong>Browse</strong>, and pick <strong>${WINDOWS_STORE_NAME}</strong>.</li>
        <li>Click <strong>Next</strong>, then <strong>Finish</strong>, then <strong>Yes</strong> to approve it.</li>
        <li>Close and reopen your web browser.</li>
      </ol>
      <a class="btn secondary" href="/rootca.crt">Get the setup file</a>
    </div>`;

  const macSection = `
    <h2>On a Mac</h2>
    <div class="step">
      <ol>
        <li>Click <strong>Get the setup file</strong> below and open the file it downloads.</li>
        <li>It opens the Mac's <strong>Keychain</strong> and adds the file. If it asks which
          keychain, choose <strong>login</strong>.</li>
        <li>In Keychain, find <strong>DH Engineering Job Cards Local CA</strong> and double-click it.</li>
        <li>Click the triangle next to <strong>Trust</strong> to open it, then set
          <strong>When using this certificate</strong> to <strong>Always Trust</strong>.</li>
        <li>Close that window — you'll be asked for your Mac password. Enter it.</li>
        <li>Quit and reopen your web browser.</li>
      </ol>
      <a class="btn" href="/rootca.crt">Get the setup file</a>
      <p class="hint">Comfortable with Terminal? One line does the same thing:<br>
        <code>sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/Downloads/"${TRUST_FILE_NAME}"</code></p>
    </div>`;

  const platformSections = macFirst
    ? macSection + windowsSection
    : windowsSection + macSection;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Set up this computer</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1rem;
    font-family: "Google Sans", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    line-height: 1.55; color: #1c1c1e; background: #f4f5f7;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #f2f2f5; background: #16171a; }
    .card { background: #212328 !important; box-shadow: none !important; }
    .step { background: #16171a !important; }
    .note { background: #2a2213 !important; color: #f0d9a0 !important; }
    a.btn { color: #fff !important; }
  }
  .card {
    max-width: 640px; margin: 0 auto; background: #fff;
    border-radius: 18px; padding: 2rem; box-shadow: 0 12px 40px rgba(0,0,0,.08);
  }
  h1 { font-size: 1.6rem; margin: 0 0 .25rem; }
  .lead { font-size: 1.05rem; opacity: .85; margin: 0 0 1.5rem; }
  h2 { font-size: 1.1rem; margin: 1.75rem 0 .5rem; }
  a.btn {
    display: inline-block; margin: .35rem .5rem .35rem 0; padding: .8rem 1.3rem;
    background: #2f6df6; color: #fff; text-decoration: none; font-weight: 600;
    border-radius: 12px;
  }
  a.btn.secondary { background: #6b7280; }
  .step {
    background: #f4f5f7; border-radius: 12px; padding: 1rem 1.25rem; margin: 1rem 0;
  }
  ol { margin: .25rem 0 0; padding-left: 1.25rem; }
  ol li { margin: .35rem 0; }
  .note {
    background: #fdf3d8; border-radius: 12px; padding: 1rem 1.25rem;
    margin: 1.5rem 0 0; font-size: .95rem;
  }
  code {
    background: rgba(127,127,127,.18); padding: .1rem .4rem; border-radius: 6px;
    font-size: .95em; word-break: break-all;
  }
  .sub { margin: .25rem 0 .5rem; }
  .hint { margin: .85rem 0 0; font-size: .85rem; opacity: .72; }
</style>
</head>
<body>
  <div class="card">
    <h1>Set up this computer</h1>
    <p class="lead">Do this once on each computer. It lets the camera work in the
      app and stops the app's downloads from being blocked.</p>

    ${platformSections}

    <h2>A shortcut for later</h2>
    <div class="step">
      <p style="margin:.25rem 0 .75rem;">Put a shortcut on this computer that opens
        the app at its private web address, shown with a padlock.</p>
      <a class="btn secondary" href="/setup-shortcut.url">Make a shortcut</a>
      <p style="margin:.75rem 0 0; font-size:.9rem; opacity:.75;">The app opens at
        <code>${secureUrl}</code></p>
    </div>

    <p class="note">Each computer needs approval once — an administrator's on Windows,
      or your password on a Mac. There's no way around that one step.</p>
  </div>
</body>
</html>`;
}

module.exports = router;
