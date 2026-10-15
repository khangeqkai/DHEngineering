const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Printer functions
  getPrinters: () => ipcRenderer.invoke('get-printers'),

  // Open a combined-packet PDF buffer in the OS viewer (which prints it)
  openPdf: (data) => ipcRenderer.invoke('open-pdf', data),

  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // File dialogs
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  saveFile: (defaultName, buffer, filters) => ipcRenderer.invoke('save-file', { defaultName, buffer, filters }),
  showSaveDialog: (defaultName, filters) => ipcRenderer.invoke('show-save-dialog', { defaultName, filters }),
  selectFile: (title, filters) => ipcRenderer.invoke('select-file', { title, filters }),

  // Name, size and last-modified moment of a file picked earlier
  fileInfo: (filePath) => ipcRenderer.invoke('file-info', filePath),

  // Platform detection
  platform: process.platform
});
