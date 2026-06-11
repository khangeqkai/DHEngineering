const { app, BrowserWindow, ipcMain, Menu, globalShortcut, dialog } = require('electron');
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

// Helper: print in a hidden BrowserWindow with cancel safety
function printInHiddenWindow(loadFn, options = {}) {
  let printWindow = null;
  return new Promise(async (resolve) => {
    try {
      printWindow = new BrowserWindow({
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false }
      });

      await loadFn(printWindow);

      printWindow.webContents.print(
        {
          silent: options.silent || false,
          printBackground: true,
          deviceName: options.printerName || '',
          pageSize: options.pageSize || 'A4'
        },
        (success, failureReason) => {
          if (printWindow && !printWindow.isDestroyed()) printWindow.close();
          resolve({ success, cancelled: !success, failureReason: failureReason || '' });
        }
      );
    } catch (err) {
      if (printWindow && !printWindow.isDestroyed()) printWindow.close();
      resolve({ success: false, cancelled: false, failureReason: err.message });
    }
  });
}

ipcMain.handle('print-html', async (event, { html, options = {} }) => {
  return printInHiddenWindow(async (win) => {
    const encoded = Buffer.from(html, 'utf-8').toString('base64');
    await win.loadURL(`data:text/html;base64,${encoded}`);
  }, options);
});

ipcMain.handle('print-file', async (event, { filePath, options = {} }) => {
  return printInHiddenWindow(async (win) => {
    await win.loadFile(filePath);
  }, options);
});

// Save file dialog (for Excel export etc.)
ipcMain.handle('save-file', async (event, { defaultName, buffer }) => {
  const win = BrowserWindow.getAllWindows()[0] || null;
  const result = await dialog.showSaveDialog(win, {
    defaultPath: defaultName,
    filters: [
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
