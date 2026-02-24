const { app, BrowserWindow, ipcMain, Menu, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Hardware integration modules
let printerModule = null;
let scannerModule = null;

const isDev = !app.isPackaged;

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
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
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
app.whenReady().then(() => {
  createMenu();
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
    console.error('Failed to get printers:', err);
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
    console.error('Print failed:', err);
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
    console.error('Print to PDF failed:', err);
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
    console.error('Failed to save file:', err.message);
    throw new Error(`Failed to save file: ${err.message}`);
  }
});

// Select folder dialog
ipcMain.handle('select-folder', async () => {
  const window = BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(window, {
    properties: ['openDirectory'],
    title: 'Select Scanner Folder'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});
