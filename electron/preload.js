const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onVehicleUpdate: (callback) => ipcRenderer.on('vehicle-update', (_, data) => callback(data)),
  onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (_, status) => callback(status)),
  sendCommand: (channel, data) => ipcRenderer.send(channel, data),
  getConfig: () => ipcRenderer.invoke('get-config')
});
