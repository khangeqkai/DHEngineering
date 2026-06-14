const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Printer functions
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  print: (options) => ipcRenderer.invoke('print', options),
  printToPDF: (options) => ipcRenderer.invoke('print-to-pdf', options),

  // Print the job card HTML via the OS default browser
  printHtml: (data) => ipcRenderer.invoke('print-html', data),

  // Camera functions
  getCameras: () => ipcRenderer.invoke('get-cameras'),

  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // File dialogs
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  saveFile: (defaultName, buffer) => ipcRenderer.invoke('save-file', { defaultName, buffer }),
  showSaveDialog: (defaultName, filters) => ipcRenderer.invoke('show-save-dialog', { defaultName, filters }),
  selectFile: (title, filters) => ipcRenderer.invoke('select-file', { title, filters }),

  // Platform detection
  platform: process.platform
});
