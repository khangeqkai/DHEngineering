const { app, BrowserWindow, ipcMain, Menu, globalShortcut, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Structured logging for Electron main process
const logger = {
  _log(level, obj, msg) {
    const entry = { level, time: new Date().toISOString(), msg, ...obj };
    if (obj.err) { entry.err = { message: obj.err.message, stack: obj.err.stack }; }
    process[level === 'error' || level === 'fatal' ? 'stderr' : 'stdout'].write(JSON.stringify(entry) + '\n');
  },
  info(obj, msg) { this._log('info', obj, msg); },
  error(obj, msg) { this._log('error', obj, msg); },
  fatal(obj, msg) { this._log('fatal', obj, msg); }
};

// Hardware integration modules
let printerModule = null;

const isDev = !app.isPackaged;

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
          const req = require('http').get('http://localhost:3000/health', (res) => {
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

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png')
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('http://localhost:3000');
  }

  // Add keyboard shortcut to toggle DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Cmd+Alt+I on Mac, Ctrl+Shift+I on Windows/Linux
    if ((input.meta && input.alt && input.key.toLowerCase() === 'i') ||
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  return mainWindow;
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
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Cmd+Alt+I' : 'Ctrl+Shift+I',
          click: (item, focusedWindow) => {
            if (focusedWindow) focusedWindow.webContents.toggleDevTools();
          }
        },
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
app.whenReady().then(async () => {
  createMenu();

  if (!isDev) {
    try {
      await startServer();
    } catch (err) {
      dialog.showErrorBox(
        'Server Error',
        'Failed to start the application server. Please restart the app.\n\n' + err.message
      );
      app.quit();
      return;
    }
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

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

// Print content
ipcMain.handle('print', async (event, options) => {
  try {
    const window = BrowserWindow.getAllWindows()[0];
    return new Promise((resolve, reject) => {
      window.webContents.print(
        {
          silent: options.silent || false,
          printBackground: true,
          deviceName: options.printerName || ''
        },
        (success, failureReason) => {
          if (success) {
            resolve({ success: true });
          } else {
            reject(new Error(failureReason));
          }
        }
      );
    });
  } catch (err) {
    logger.error({ err }, 'Print failed');
    throw err;
  }
});

// Print to PDF
ipcMain.handle('print-to-pdf', async (event, options) => {
  try {
    const window = BrowserWindow.getAllWindows()[0];
    const pdfData = await window.webContents.printToPDF({
      pageSize: options.pageSize || 'A4',
      printBackground: true,
      margins: {
        marginType: 'default'
      }
    });
    return pdfData;
  } catch (err) {
    logger.error({ err }, 'Print to PDF failed');
    throw err;
  }
});

// Get media devices (cameras)
ipcMain.handle('get-cameras', async () => {
  // Camera access is handled via browser API in renderer
  // This is a placeholder for future native camera integration
  return { message: 'Use navigator.mediaDevices.getUserMedia in renderer' };
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

// Delete leftover job card printouts from previous prints so the temp folder
// doesn't grow without bound on a shared workstation. Each print writes one
// `Job Card …html` file and opens it in the browser; once a new print starts,
// any earlier ones have already been opened and are safe to remove.
async function sweepOldJobCardPrintouts(tempDir) {
  // Leave very recent files alone: another print/render started moments ago may
  // still be writing or loading its temp file, and deleting it mid-flight would
  // make that operation fail.
  const MIN_AGE_MS = 10 * 1000;
  try {
    const entries = await fs.promises.readdir(tempDir);
    await Promise.all(
      entries
        // Job card HTML (single-card print + offscreen packet render) and the
        // combined packet PDFs we hand to the OS viewer.
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

// Open the job card in the OS default browser, which auto-opens its print
// preview on load. The app itself can't show a print preview (Electron ships
// without that screen), so we hand the card to the real browser — one click,
// preview appears.
ipcMain.handle('print-html', async (event, { html }) => {
  try {
    const tempDir = app.getPath('temp');
    await sweepOldJobCardPrintouts(tempDir);
    // Inject an auto-print trigger so the browser pops its print preview itself.
    const autoPrint = '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},200);});</script>';
    const doc = html.includes('</body>') ? html.replace('</body>', autoPrint + '</body>') : html + autoPrint;
    const tmpHtml = path.join(tempDir, `Job Card ${Date.now()}.html`);
    await fs.promises.writeFile(tmpHtml, doc, 'utf-8');
    const openErr = await shell.openPath(tmpHtml);
    if (openErr) return { success: false, failureReason: openErr };
    return { success: true };
  } catch (err) {
    logger.error({ err }, 'Open job card for printing failed');
    return { success: false, failureReason: err.message };
  }
});

// Render arbitrary HTML (the generated job card) to a PDF buffer, off-screen.
// Used to fold the card into the combined packet. We can't reuse 'print-to-pdf'
// because that captures the visible app window; here we load the card HTML into a
// hidden window and snapshot just that. Margins are zero — the card CSS already
// sets @page margin 0 and self-pads 12mm, so any extra margin would double it.
ipcMain.handle('render-html-to-pdf', async (event, { html }) => {
  const tempDir = app.getPath('temp');
  const tmpHtml = path.join(tempDir, `Job Card packet ${Date.now()}.html`);
  let win = null;
  try {
    await sweepOldJobCardPrintouts(tempDir);
    await fs.promises.writeFile(tmpHtml, html, 'utf-8');
    win = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: false, sandbox: true }
    });
    await win.loadFile(tmpHtml); // resolves on did-finish-load
    // The card is fully self-contained (inline CSS, no external fetches); a small
    // settle delay is cheap insurance against a first-layout race.
    await new Promise(resolve => setTimeout(resolve, 150));
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });
    return { success: true, pdf };
  } catch (err) {
    logger.error({ err }, 'render-html-to-pdf failed');
    return { success: false, failureReason: err.message };
  } finally {
    if (win) win.destroy();
    fs.promises.unlink(tmpHtml).catch(() => {});
  }
});

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
