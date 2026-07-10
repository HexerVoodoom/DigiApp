const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('digiDesktop', {
  /** Liga/desliga o click-through: true = mouse interage com o overlay. */
  setInteractive: (on) => ipcRenderer.send('set-interactive', !!on),
  openFullApp: () => ipcRenderer.send('open-full-app'),
  quit: () => ipcRenderer.send('overlay-quit'),
});
