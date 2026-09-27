const { app, BrowserWindow, ipcMain, Menu, Tray, Notification, nativeImage, globalShortcut, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { X509Certificate } = require('crypto');

// A packaged GUI app has no attached console, so writing to stdout/stderr can
// throw EBADF ("bad file descriptor") and crash the whole process on the very
// first log line. Make these streams swallow such errors so logging can never
// take the app down. This guards console.* and any plain-text logging in both
// this process and the in-process server (required later). Must run before any
// other code logs anything.
for (const stream of [process.stdout, process.stderr]) {
  if (stream && typeof stream.write === 'function') {
    const original = stream.write.bind(stream);
    stream.write = (chunk, encoding, callback) => {
      try {
        return original(chunk, encoding, callback);
      } catch (e) {
        if (typeof encoding === 'function') encoding();
        else if (typeof callback === 'function') callback();
        return true;
      }
    };
    stream.on('error', () => {});
  }
}

// Structured logging for Electron main process
const logger = {
  _log(level, obj, msg) {
    const entry = { level, time: new Date().toISOString(), msg, ...obj };
    if (obj.err) { entry.err = { message: obj.err.message, stack: obj.err.stack }; }
    try {
      process[level === 'error' || level === 'fatal' ? 'stderr' : 'stdout'].write(JSON.stringify(entry) + '\n');
    } catch (e) { /* no console in a packaged GUI app — ignore */ }
  },
  info(obj, msg) { this._log('info', obj, msg); },
  error(obj, msg) { this._log('error', obj, msg); },
  fatal(obj, msg) { this._log('fatal', obj, msg); }
};

// Hardware integration modules
let printerModule = null;

const isDev = !app.isPackaged;

// The packaged app IS the shared server (startServer() below runs it
// in-process), so other PCs and home access can only reach the job cards while
// this process is alive. Three things follow, all packaged-only — in
// development the server runs as its own process, so the window is just a
// viewer:
//   - it starts itself at Windows sign-in, straight to the tray (--hidden);
//   - closing the window hides it to the tray instead of quitting;
//   - the only way to really quit is the tray's Quit (or the OS quitting the app).
const HIDDEN_ARG = '--hidden';
const APP_ICON = path.join(__dirname, '..', 'assets', 'icon.png');
const startedHidden = !isDev && (
  process.argv.includes(HIDDEN_ARG) ||
  (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin)
);

let mainWindow = null;
let tray = null;
// Set once a real quit has begun, so the window's close handler lets the close
// through instead of hiding to the tray.
let isQuitting = false;
// Someone opened the app again while a hidden sign-in start was still booting
// the server; show the window once it exists instead of dropping the request.
let showRequested = false;

// The data folder the server writes its local certificate authority into. Mirrors
// the path startServer() sets as DATA_DIR, but computed independently so it's
// available even before startServer runs.
function dataDir() {
  return isDev
    ? path.join(__dirname, '..', '..', 'data')
    : path.join(app.getPath('userData'), 'data');
}

function caCertPath() {
  return path.join(dataDir(), 'ca.crt');
}

// The server PC's own window loads https://localhost, but Chromium doesn't know
// our locally-minted certificate authority, so it would show a security warning.
// Vouch for our own local server ourselves — and ONLY our own local server:
// for any other address we defer to Chromium's normal public-web checks, so
// this never becomes a blanket "trust everything" hole.
function installLocalCertTrust() {
  let caCert = null;
  const loadCa = () => {
    try {
      caCert = new X509Certificate(fs.readFileSync(caCertPath(), 'utf-8'));
    } catch {
      caCert = null; // written during server startup; may not exist yet on first check
    }
    return caCert;
  };
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    // 0 = trust, -2 = reject, -3 = use Chromium's own verification result.
    if (request.hostname !== 'localhost') {
      callback(-3);
      return;
    }
    try {
      const ca = caCert || loadCa();
      const presented = new X509Certificate(request.certificate.data);
      if (ca && presented.checkIssued(ca) && presented.verify(ca.publicKey)) {
        callback(0); // this cert chains to our own CA — trust it
        return;
      }
    } catch {
      /* fall through to reject */
    }
    callback(-2);
  });
}

async function startServer() {
  // Set environment before requiring server
  process.env.ELECTRON_MODE = '1';
  if (isDev) {
    process.env.DATA_DIR = path.join(__dirname, '..', '..', 'data');
  } else {
    process.env.DATA_DIR = path.join(app.getPath('userData'), 'data');
    process.env.CLIENT_BUILD_PATH = path.join(__dirname, '..', 'dist');
  }
  process.env.NODE_ENV = isDev ? 'development' : 'production';

  // Ensure data directory exists
  if (!fs.existsSync(process.env.DATA_DIR)) {
    fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
  }

  // Require the server entry point — it starts Express internally
  const serverPath = isDev
    ? path.join(__dirname, '..', '..', 'server', 'index.js')
    : path.join(process.resourcesPath, 'server', 'index.js');
  const serverPromise = require(serverPath);

  // Race: server startup vs health check polling
  // If DB init fails, serverPromise rejects immediately instead of waiting 15s
  let cancelPolling = false;
  try {
    await Promise.race([
      serverPromise,
      new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
          if (cancelPolling) return;
          // The server now serves HTTPS. Trust it via our own local CA (written
          // to disk during server startup). If ca.crt isn't there yet, the
          // request fails its security check and we simply retry until it is.
          let ca;
          try { ca = fs.readFileSync(caCertPath(), 'utf-8'); } catch { ca = undefined; }
          const req = require('https').get({
            hostname: 'localhost',
            port: 443,
            path: '/health',
            ca,
            rejectUnauthorized: true
          }, (res) => {
            res.resume();
            if (!cancelPolling && res.statusCode === 200) { cancelPolling = true; resolve(); }
            else if (!cancelPolling) { retry(); }
          });
          req.on('error', () => { if (!cancelPolling) retry(); });
        };
        const retry = () => {
          if (cancelPolling) return;
          if (Date.now() - start > 15000) {
            cancelPolling = true;
            reject(new Error('Server did not start in time'));
          } else { setTimeout(check, 200); }
        };
        check();
      })
    ]);
  } finally {
    cancelPolling = true;
  }
}

function createWindow({ show = true } = {}) {
  mainWindow = new BrowserWindow({
    show,
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    // Keep the menu bar hidden; it drops down only when the user taps Alt.
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: APP_ICON
  });

  // Hide the menu bar (it drops down only on Alt). The constructor option alone
  // is unreliable on some Windows setups, so force it explicitly here too.
  mainWindow.setAutoHideMenuBar(true);
  mainWindow.setMenuBarVisibility(false);

  // Load the app
  if (process.env.ELECTRON_LOAD_URL) {
    mainWindow.loadURL(process.env.ELECTRON_LOAD_URL);
  } else if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('https://localhost');
  }

  // Developer tools shortcut — only in development. The packaged app must not
  // expose it (so shop-floor users can't open the debug panel by accident).
  if (isDev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      // Cmd+Alt+I on Mac, Ctrl+Shift+I on Windows/Linux
      if ((input.meta && input.alt && input.key.toLowerCase() === 'i') ||
          (input.control && input.shift && input.key.toLowerCase() === 'i') ||
          input.key === 'F12') {
        mainWindow.webContents.toggleDevTools();
      }
    });
  }

  // The web app registers a `beforeunload` handler that objects when a job
  // card has unsaved edits. In a browser that produces the "Leave site?"
  // dialog, but Electron has no such dialog — it fires `will-prevent-unload`
  // instead, and if nothing handles it Electron's default is to silently
  // cancel the close/reload. With no handler here, closing the window or
  // pressing Ctrl+R while a job card has unsaved edits did nothing at all —
  // no dialog, no message — and the app looked frozen. Show a real dialog and
  // decide from the user's answer. Calling preventDefault() here means "ignore
  // the page's objection and go ahead with the close/reload"; doing nothing
  // leaves the close cancelled, which is why the safe choice is wired to that.
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    // A tray Quit can reach here with the window hidden; show it so the question
    // isn't lost behind other windows and "Keep Editing" lands on the card.
    if (!mainWindow.isVisible()) mainWindow.show();
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      title: 'Unsaved Changes',
      message: 'This job card has changes that have not been saved yet.',
      detail: 'If you leave now, those changes will be lost. Do you want to leave anyway?',
      buttons: ['Leave Without Saving', 'Keep Editing'],
      defaultId: 1,
      cancelId: 1
    });
    if (choice === 0) {
      event.preventDefault(); // user chose to leave — let the close/reload proceed
    } else {
      // User chose to stay, or dismissed with Escape — leave the close
      // cancelled. If this close was part of a Quit, the quit is now abandoned,
      // so the next X must go back to hiding to the tray.
      isQuitting = false;
    }
  });

  // X hides the window to the tray while the shared server keeps running. Only
  // a real quit (tray Quit, OS sign-out/shutdown) lets the close through. This
  // fires before the page's own unload check, so hiding never discards unsaved
  // edits — the page simply stays loaded behind the tray icon.
  mainWindow.on('close', (event) => {
    if (isQuitting || !tray) return;
    event.preventDefault();
    mainWindow.hide();
    showTrayNoticeOnce();
  });

  // Windows is signing out or shutting down: let every close through so the
  // hide-to-tray above never holds up the shutdown.
  mainWindow.on('session-end', () => { isQuitting = true; });

  mainWindow.on('closed', () => { mainWindow = null; });

  return mainWindow;
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// The first time the window is ever hidden to the tray, say where the app went
// and how to really quit. Remembered by a marker file so it shows only once.
function showTrayNoticeOnce() {
  const marker = path.join(app.getPath('userData'), 'tray-notice-shown');
  if (fs.existsSync(marker)) return;
  try { fs.writeFileSync(marker, new Date().toISOString()); } catch { /* still show it */ }
  const title = 'Job Cards';
  const content = 'Job Cards is still running in the tray so other PCs can connect. Right-click the tray icon to quit.';
  if (process.platform === 'win32' && tray) {
    tray.displayBalloon({ iconType: 'info', title, content });
  } else if (Notification.isSupported()) {
    new Notification({ title, body: content }).show();
  }
}

function confirmAndQuit() {
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    title: 'Quit Job Cards',
    message: 'Other PCs and home access will lose the job cards until the app is opened again. Quit anyway?',
    buttons: ['Quit', 'Cancel'],
    defaultId: 1,
    cancelId: 1
  });
  if (choice !== 0) return;
  isQuitting = true;
  app.quit();
}

async function createTray() {
  let image = nativeImage.createFromPath(APP_ICON);
  if (image.isEmpty()) {
    // No bundled icon file — fall back to the icon of the app's own program file,
    // the same picture its desktop shortcut shows.
    try { image = await app.getFileIcon(process.execPath, { size: 'small' }); } catch { /* keep empty */ }
  }
  tray = new Tray(image.isEmpty() ? image : image.resize({ width: 16, height: 16 }));
  tray.setToolTip('DH Engineering Job Cards');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Job Cards', click: showMainWindow },
    { type: 'separator' },
    { label: 'Quit', click: confirmAndQuit }
  ]));
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  // Add standard menus on macOS
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App lifecycle

// Only allow a single running copy. The app starts its own server in-process,
// so a second launch would try to bind the same port and fail with
// EADDRINUSE. Instead, hand focus back to the window that's already open and
// let this duplicate quit.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', (event, argv) => {
  // A sign-in start while the app is already running must not pop the window up.
  if (argv.includes(HIDDEN_ARG)) return;
  // Only once the first window exists — while the server is still starting,
  // startup itself is about to open it.
  if (mainWindow) showMainWindow();
  else showRequested = true;
});

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return; // duplicate instance is on its way out
  createMenu();

  if (!isDev) {
    // Teach this window to trust our own local server's certificate before it
    // loads https://localhost, so it opens cleanly with no security warning.
    installLocalCertTrust();
    try {
      await startServer();
    } catch (err) {
      const portInUse = /EADDRINUSE/.test((err && err.message) || '');
      dialog.showErrorBox(
        'Server Error',
        portInUse
          ? 'The app appears to already be running, or a previous copy did not fully close.\n\n' +
            'Close every copy of "DH Engineering Job Cards" (or simply restart the computer), then open it again.'
          : 'Failed to start the application server. Please restart the app.\n\n' + ((err && err.message) || '')
      );
      app.quit();
      return;
    }

    // Start with Windows sign-in, straight to the tray. Set on every launch so
    // a reinstall to another folder re-points it at the current program file.
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true, args: [HIDDEN_ARG] });
    try {
      await createTray();
    } catch (err) {
      // Without a tray the close handler falls back to a normal quit, so the
      // app can still be closed; never leave a server running with no way out.
      tray = null;
      logger.error({ err }, 'Tray failed');
    }
  }

  createWindow({ show: !startedHidden || showRequested });

  app.on('activate', () => {
    showMainWindow();
  });
});

// Any real quit — tray Quit, the macOS app menu, the OS — lets windows close.
app.on('before-quit', () => { isQuitting = true; });

app.on('will-quit', () => {
  if (tray) { tray.destroy(); tray = null; }
});

// With hide-to-tray, the last window only closes during a real quit (or in
// development, where there is no tray), so this still ends the app.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers for hardware integration

// Get list of printers
ipcMain.handle('get-printers', async () => {
  try {
    const window = BrowserWindow.getAllWindows()[0];
    const printers = await window.webContents.getPrintersAsync();
    return printers.map(p => ({
      name: p.name,
      displayName: p.displayName,
      isDefault: p.isDefault,
      status: p.status
    }));
  } catch (err) {
    logger.error({ err }, 'Failed to get printers');
    return [];
  }
});

// Get app info
ipcMain.handle('get-app-info', () => {
  return {
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    arch: process.arch,
    isDev
  };
});

// Delete leftover packet/printout temp files so the temp folder doesn't grow
// without bound on a shared workstation: the combined packet PDFs we hand to the
// OS viewer, plus any stray `Job Card …html` left behind by the server-side
// off-screen card render (which normally cleans up after itself).
async function sweepOldJobCardPrintouts(tempDir) {
  // Leave very recent files alone: another print/render started moments ago may
  // still be writing or loading its temp file, and deleting it mid-flight would
  // make that operation fail.
  const MIN_AGE_MS = 10 * 1000;
  try {
    const entries = await fs.promises.readdir(tempDir);
    await Promise.all(
      entries
        // Combined packet PDFs we hand to the OS viewer, plus any leftover
        // off-screen card-render HTML.
        .filter(name => /^Job Card .*\.html$/.test(name) || /^Packet .*\.pdf$/.test(name))
        .map(async (name) => {
          const filePath = path.join(tempDir, name);
          try {
            const stat = await fs.promises.stat(filePath);
            if (Date.now() - stat.mtimeMs < MIN_AGE_MS) return;
            await fs.promises.unlink(filePath);
          } catch {
            // Already gone or unreadable — nothing to do.
          }
        })
    );
  } catch {
    // Temp folder unreadable — nothing to sweep.
  }
}

// Write a combined-packet PDF to a temp file and open it in the OS PDF viewer,
// which handles the print dialog (Electron has no built-in print preview).
ipcMain.handle('open-pdf', async (event, { buffer, name }) => {
  try {
    const tempDir = app.getPath('temp');
    await sweepOldJobCardPrintouts(tempDir);
    const safeName = String(name || 'Packet').replace(/[^\w .-]/g, '_');
    const tmpPdf = path.join(tempDir, `Packet ${safeName} ${Date.now()}.pdf`);
    await fs.promises.writeFile(tmpPdf, Buffer.from(buffer));
    const openErr = await shell.openPath(tmpPdf);
    if (openErr) return { success: false, failureReason: openErr };
    return { success: true };
  } catch (err) {
    logger.error({ err }, 'Open packet PDF failed');
    return { success: false, failureReason: err.message };
  }
});

// Save file dialog (for Excel export, combined packet PDF, etc.)
ipcMain.handle('save-file', async (event, { defaultName, buffer, filters }) => {
  const win = BrowserWindow.getAllWindows()[0] || null;
  const result = await dialog.showSaveDialog(win, {
    defaultPath: defaultName,
    filters: filters || [
      { name: 'Excel Workbook', extensions: ['xlsx'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  try {
    fs.writeFileSync(result.filePath, Buffer.from(buffer));
    return { canceled: false, filePath: result.filePath };
  } catch (err) {
    logger.error({ err }, 'Failed to save file');
    throw new Error(`Failed to save file: ${err.message}`);
  }
});

// Select folder dialog
ipcMain.handle('select-folder', async () => {
  const window = BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(window, {
    properties: ['openDirectory'],
    title: 'Select Folder'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// Show save dialog (returns chosen path without writing)
ipcMain.handle('show-save-dialog', async (event, { defaultName, filters }) => {
  const win = BrowserWindow.getAllWindows()[0] || null;
  const result = await dialog.showSaveDialog(win, {
    defaultPath: defaultName,
    filters: filters || [
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return result.filePath;
});

// Select file dialog (for import)
ipcMain.handle('select-file', async (event, { title, filters }) => {
  const win = BrowserWindow.getAllWindows()[0] || null;
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    title: title || 'Select File',
    filters: filters || [
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});
