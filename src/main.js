// Huvudprocessen. Den håller ordning på:
//  - fbWindow: messenger.com, osynligt när du väl är inloggad
//  - contactsWindow: kontaktlistan i MSN-stil
//  - chatWindows: ett chattfönster per konversation, precis som i MSN
// och skickar meddelanden mellan dem.

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

const MESSENGER_URL = 'https://www.messenger.com/';
const UI_DIR = path.join(__dirname, 'ui');
const DEMO = process.argv.includes('--demo');

let fbWindow = null;
let contactsWindow = null;
const chatWindows = new Map(); // threadId -> BrowserWindow

// Senaste kända läget, så att nya fönster kan visas direkt.
const state = {
  loggedIn: false,
  conversations: [],
  messages: new Map(), // threadId -> [{ text, mine }]
};

// Facebook släpper inte alltid in webbläsare som säger att de är Electron,
// så vi presenterar oss som vanlig Chrome.
function chromeUserAgent() {
  return session.defaultSession
    .getUserAgent()
    .replace(/\s?Electron\/\S+/, '')
    .replace(/\s?minmsn\/\S+/i, '');
}

function uiPrefs() {
  return {
    preload: path.join(__dirname, 'ui-preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  };
}

function createFbWindow() {
  fbWindow = new BrowserWindow({
    width: 1000,
    height: 760,
    show: true, // visas tills du har loggat in
    title: 'Logga in på Messenger',
    webPreferences: {
      partition: 'persist:messenger', // kom ihåg inloggningen
      preload: path.join(__dirname, 'fb-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // fortsätt läsa meddelanden när fönstret är dolt
    },
  });
  fbWindow.webContents.setUserAgent(chromeUserAgent());
  fbWindow.setMenuBarVisibility(false);
  fbWindow.loadURL(MESSENGER_URL);

  // Stäng inte Facebook-fönstret, göm det bara.
  fbWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      fbWindow.hide();
    }
  });
}

function createContactsWindow() {
  contactsWindow = new BrowserWindow({
    width: 320,
    height: 640,
    minWidth: 260,
    minHeight: 420,
    frame: false,
    title: 'MinMSN',
    backgroundColor: '#dfeaf8',
    webPreferences: uiPrefs(),
  });
  contactsWindow.loadFile(path.join(UI_DIR, 'contacts.html'));
  contactsWindow.on('closed', () => {
    app.isQuitting = true;
    app.quit();
  });
}

function openChatWindow(threadId) {
  let win = chatWindows.get(threadId);
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return win;
  }
  const offset = (chatWindows.size % 6) * 24;
  win = new BrowserWindow({
    width: 560,
    height: 520,
    minWidth: 420,
    minHeight: 380,
    x: 360 + offset,
    y: 80 + offset,
    frame: false,
    title: 'Konversation',
    backgroundColor: '#dfeaf8',
    webPreferences: uiPrefs(),
  });
  win.threadId = threadId;
  win.loadFile(path.join(UI_DIR, 'chat.html'), { query: { id: threadId } });
  win.on('focus', () => toFb('fb:open-conversation', threadId));
  win.on('closed', () => chatWindows.delete(threadId));
  chatWindows.set(threadId, win);
  toFb('fb:open-conversation', threadId);
  return win;
}

function send(win, channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function toAllUi(channel, data) {
  send(contactsWindow, channel, data);
  for (const win of chatWindows.values()) send(win, channel, data);
}

function toFb(channel, data) {
  if (DEMO) return demoFb(channel, data);
  send(fbWindow, channel, data);
}

// I demoläget låtsas vi vara Messenger.
function demoFb(channel, data) {
  if (channel !== 'fb:prepare-send') return;
  const list = state.messages.get(data.threadId) || [];
  list.push({ text: data.text, mine: true });
  state.messages.set(data.threadId, list);
  setTimeout(() => {
    send(chatWindows.get(data.threadId), 'ui:messages', { threadId: data.threadId, messages: list });
  }, 400);
}

// --- Från Facebook-fönstret ---

// Facebook-fönstret göms först när du är inloggad OCH inte har någon ruta
// att fylla i (t.ex. PIN-koden för att återställa krypterade chattar).
// Dyker en sådan ruta upp senare visas fönstret igen.
let hideTimer = null;
ipcMain.on('fb:status', (_e, status) => {
  if (status.loggedIn !== state.loggedIn) {
    state.loggedIn = status.loggedIn;
    toAllUi('ui:status', { loggedIn: state.loggedIn });
  }
  if (!fbWindow || fbWindow.isDestroyed()) return;

  if (status.needsAttention) {
    clearTimeout(hideTimer);
    hideTimer = null;
    if (!fbWindow.isVisible()) {
      fbWindow.show();
      fbWindow.focus();
    }
    fbWindow.autoShown = true;
    return;
  }

  const shouldHide = status.loggedIn && (fbWindow.autoShown || !state.hiddenOnce);
  if (shouldHide && fbWindow.isVisible() && !hideTimer) {
    // Vänta lite, så att en ruta som håller på att laddas hinner dyka upp.
    hideTimer = setTimeout(() => {
      hideTimer = null;
      fbWindow.hide();
      fbWindow.autoShown = false;
      state.hiddenOnce = true;
    }, 4000);
  }
});

ipcMain.on('fb:diagnosis', (_e, info) => {
  const fs = require('fs');
  const file = path.join(app.getPath('desktop'), 'minmsn-felsokning.txt');
  fs.writeFileSync(file, JSON.stringify({ version: app.getVersion(), ...info }, null, 2));
  send(contactsWindow, 'ui:notice', `Felsökningsinfo sparad på skrivbordet: ${path.basename(file)}`);
});

ipcMain.on('ui:diagnose', () => toFb('fb:diagnose'));

ipcMain.on('fb:conversations', (_e, list) => {
  state.conversations = list;
  toAllUi('ui:conversations', list);
});

ipcMain.on('fb:messages', (_e, data) => {
  if (!data.threadId) return;
  state.messages.set(data.threadId, data.messages);
  send(chatWindows.get(data.threadId), 'ui:messages', data);
});

// Facebook-fönstret har fokuserat skrivfältet, nu skriver vi texten
// som riktiga tangenttryck så att Messenger tar emot den.
ipcMain.on('fb:composer-ready', async (_e, { text }) => {
  const wc = fbWindow.webContents;
  await wc.insertText(text);
  setTimeout(() => {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    wc.sendInputEvent({ type: 'char', keyCode: '\r' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  }, 150);
});

ipcMain.on('fb:composer-missing', (_e, { threadId }) => {
  send(
    chatWindows.get(threadId),
    'ui:error',
    'Meddelandet kunde inte skickas. Försök igen om en liten stund.'
  );
});

// --- Från våra egna fönster ---

ipcMain.on('ui:ready', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  send(win, 'ui:status', { loggedIn: state.loggedIn });
  send(win, 'ui:conversations', state.conversations);
  if (win && win.threadId && state.messages.has(win.threadId)) {
    send(win, 'ui:messages', { threadId: win.threadId, messages: state.messages.get(win.threadId) });
  }
});

ipcMain.on('ui:open-chat', (_e, threadId) => openChatWindow(threadId));
ipcMain.on('ui:send', (_e, { threadId, text }) => toFb('fb:prepare-send', { threadId, text }));

ipcMain.on('ui:show-facebook', () => {
  if (!fbWindow) return;
  fbWindow.show();
  fbWindow.focus();
});

ipcMain.on('ui:window', (e, action) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  if (action === 'minimize') win.minimize();
  if (action === 'maximize') (win.isMaximized() ? win.unmaximize() : win.maximize());
  if (action === 'close') win.close();
  if (action === 'shake') shake(win);
});

// Skaka fönstret som en MSN-knuff.
function shake(win) {
  if (win.isMaximized()) return;
  const [x, y] = win.getPosition();
  const steps = [[-8, 0], [8, -4], [-6, 4], [6, -2], [-4, 2], [4, 0], [-2, 0], [0, 0]];
  steps.forEach(([dx, dy], i) => {
    setTimeout(() => {
      if (!win.isDestroyed()) win.setPosition(x + dx, y + dy);
    }, i * 40);
  });
}

app.whenReady().then(() => {
  createContactsWindow();
  if (DEMO) {
    const demo = require('./demo');
    state.loggedIn = true;
    state.conversations = demo.conversations;
    state.messages = demo.messages;
    if (process.env.MINMSN_SCREENSHOT) screenshotDemo(process.env.MINMSN_SCREENSHOT);
  } else {
    createFbWindow();
  }
});

// Används bara vid utveckling: sparar bilder av fönstren i demoläget.
function screenshotDemo(dir) {
  const fs = require('fs');
  setTimeout(() => openChatWindow('1001'), 1500);
  setTimeout(async () => {
    const shots = [['contacts', contactsWindow], ['chat', chatWindows.get('1001')]];
    for (const [name, win] of shots) {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(dir, name + '.png'), img.toPNG());
    }
    app.isQuitting = true;
    app.quit();
  }, 4000);
}

app.on('before-quit', () => {
  app.isQuitting = true;
});
