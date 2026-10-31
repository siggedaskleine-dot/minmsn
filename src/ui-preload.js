// Ger vårt gränssnitt ett litet, säkert API mot huvudprocessen.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('msn', {
  openConversation: (id) => ipcRenderer.send('ui:open-conversation', id),
  send: (text) => ipcRenderer.send('ui:send', text),
  showFacebook: () => ipcRenderer.send('ui:show-facebook'),
  hideFacebook: () => ipcRenderer.send('ui:hide-facebook'),
  onStatus: (cb) => ipcRenderer.on('ui:status', (_e, d) => cb(d)),
  onConversations: (cb) => ipcRenderer.on('ui:conversations', (_e, d) => cb(d)),
  onMessages: (cb) => ipcRenderer.on('ui:messages', (_e, d) => cb(d)),
  onError: (cb) => ipcRenderer.on('ui:error', (_e, d) => cb(d)),
});
