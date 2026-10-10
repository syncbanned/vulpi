// Ponte do mini player com o app: recebe o estado do player e manda comandos.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mini', {
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  cmd: (name, arg) => ipcRenderer.send('mini-cmd', name, arg),
});
