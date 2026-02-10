const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

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

  return mainWindow;
}

// App lifecycle
app.whenReady().then(() => {
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
