// Ger våra fönster ett litet, säkert API mot huvudprocessen.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('msn', {
  ready: () => ipcRenderer.send('ui:ready'),
  openChat: (threadId) => ipcRenderer.send('ui:open-chat', threadId),
  send: (threadId, text) => ipcRenderer.send('ui:send', { threadId, text }),
  showFacebook: () => ipcRenderer.send('ui:show-facebook'),
  diagnose: () => ipcRenderer.send('ui:diagnose'),
  onNotice: (cb) => ipcRenderer.on('ui:notice', (_e, d) => cb(d)),
  window: (action) => ipcRenderer.send('ui:window', action),
  onStatus: (cb) => ipcRenderer.on('ui:status', (_e, d) => cb(d)),
  onConversations: (cb) => ipcRenderer.on('ui:conversations', (_e, d) => cb(d)),
  onMessages: (cb) => ipcRenderer.on('ui:messages', (_e, d) => cb(d)),
  onError: (cb) => ipcRenderer.on('ui:error', (_e, d) => cb(d)),
});
