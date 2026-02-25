const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workerBridge', {
  saveServerIp: (ip) => ipcRenderer.invoke('save-server-ip', ip)
});
