const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Printer functions
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  print: (options) => ipcRenderer.invoke('print', options),
  printToPDF: (options) => ipcRenderer.invoke('print-to-pdf', options),

  // Camera functions
  getCameras: () => ipcRenderer.invoke('get-cameras'),

  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Platform detection
  platform: process.platform
});
