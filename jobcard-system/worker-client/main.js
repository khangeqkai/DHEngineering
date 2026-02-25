const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

let mainWindow = null;
let setupWindow = null;

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (data.serverIp) return data;
    }
  } catch {
    // Corrupt config, treat as missing
  }
  return null;
}

function saveConfig(ip) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ serverIp: ip }, null, 2));
  } catch (err) {
    throw new Error(`Failed to save config: ${err.message}`);
  }
}

function buildMenu(hasServer) {
  const template = [
    {
      label: 'File',
      submenu: [
        ...(hasServer ? [{
          label: 'Change Server',
          click: () => showSetup()
        }] : []),
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showSetup() {
  if (mainWindow) {
    mainWindow.close();
    mainWindow = null;
  }

  if (setupWindow) {
    setupWindow.focus();
    return;
  }

  setupWindow = new BrowserWindow({
    width: 400,
    height: 280,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  setupWindow.loadFile(path.join(__dirname, 'setup.html'));
  buildMenu(false);

  setupWindow.on('closed', () => {
    setupWindow = null;
  });
}

function showMain(ip) {
  if (setupWindow) {
    setupWindow.close();
    setupWindow = null;
  }

  if (mainWindow) {
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const serverUrl = `http://${ip}:3000`;
  mainWindow.loadURL(serverUrl);
  buildMenu(true);

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorPage(ip, errorDescription))}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function errorPage(ip, errorMsg) {
  const safeIp = escapeHtml(ip);
  const safeMsg = escapeHtml(errorMsg || 'Connection refused or timed out');
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container { text-align: center; max-width: 400px; }
    h1 { font-size: 20px; margin-bottom: 8px; color: #e74c3c; }
    p { font-size: 14px; color: #888; margin-bottom: 6px; }
    .ip { color: #4a90d9; font-family: monospace; font-size: 15px; }
    .error-detail { font-size: 12px; color: #666; margin: 12px 0; }
    .buttons { display: flex; gap: 10px; justify-content: center; margin-top: 20px; }
    button {
      padding: 10px 24px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .retry { background: #4a90d9; color: #fff; }
    .retry:hover { background: #3a7bc8; }
    .reconfig { background: #333; color: #ccc; }
    .reconfig:hover { background: #444; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Cannot connect to server</h1>
    <p>Server at <span class="ip">${safeIp}:3000</span> is not reachable</p>
    <p class="error-detail">${safeMsg}</p>
    <p style="margin-top: 12px; font-size: 13px;">Make sure the server is running and both machines are on the same network.</p>
    <div class="buttons">
      <button class="retry" onclick="location.href='http://${safeIp}:3000'">Retry</button>
      <button class="reconfig" onclick="changeServer()">Change Server</button>
    </div>
  </div>
  <script>
    function changeServer() {
      // Trigger menu action via a custom protocol or just instruct user
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#888;font-family:sans-serif;">Use File → Change Server from the menu bar</div>';
    }
  </script>
</body>
</html>`;
}

function isValidIp(str) {
  if (typeof str !== 'string') return false;
  const parts = str.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 && n <= 255 && p === String(n);
  });
}

// IPC handler for setup page
ipcMain.handle('save-server-ip', async (_event, ip) => {
  if (!isValidIp(ip)) {
    throw new Error('Invalid IP address');
  }
  saveConfig(ip);
  showMain(ip);
  return true;
});

app.whenReady().then(() => {
  const config = readConfig();
  if (config && isValidIp(config.serverIp)) {
    showMain(config.serverIp);
  } else {
    showSetup();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
