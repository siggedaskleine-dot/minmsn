// Huvudprocessen. Den öppnar två fönster:
//  - fbWindow: messenger.com, osynligt när du väl är inloggad
//  - appWindow: vårt eget gränssnitt
// och skickar meddelanden mellan dem.

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

const MESSENGER_URL = 'https://www.messenger.com/';

let fbWindow = null;
let appWindow = null;
let loggedIn = false;

// Facebook släpper inte alltid in webbläsare som säger att de är Electron,
// så vi presenterar oss som vanlig Chrome.
function chromeUserAgent() {
  return session.defaultSession
    .getUserAgent()
    .replace(/\s?Electron\/\S+/, '')
    .replace(/\s?minmsn\/\S+/i, '');
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

  // Stäng inte av Facebook-fönstret, göm det bara.
  fbWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      fbWindow.hide();
    }
  });
}

function createAppWindow() {
  appWindow = new BrowserWindow({
    width: 860,
    height: 640,
    title: 'MinMSN',
    webPreferences: {
      preload: path.join(__dirname, 'ui-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  appWindow.setMenuBarVisibility(false);
  appWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  appWindow.on('closed', () => {
    app.isQuitting = true;
    app.quit();
  });
}

function toUi(channel, data) {
  if (appWindow && !appWindow.isDestroyed()) appWindow.webContents.send(channel, data);
}

function toFb(channel, data) {
  if (fbWindow && !fbWindow.isDestroyed()) fbWindow.webContents.send(channel, data);
}

// --- Från Facebook-fönstret ---

ipcMain.on('fb:status', (_e, status) => {
  if (status.loggedIn && !loggedIn) {
    loggedIn = true;
    fbWindow.hide();
  } else if (!status.loggedIn && loggedIn) {
    loggedIn = false;
  }
  toUi('ui:status', { loggedIn });
});

ipcMain.on('fb:conversations', (_e, list) => toUi('ui:conversations', list));
ipcMain.on('fb:messages', (_e, data) => toUi('ui:messages', data));

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

ipcMain.on('fb:composer-missing', () => {
  toUi('ui:error', 'Hittade inte skrivfältet i Messenger. Öppna konversationen igen och försök på nytt.');
});

// --- Från vårt gränssnitt ---

ipcMain.on('ui:open-conversation', (_e, id) => toFb('fb:open-conversation', id));
ipcMain.on('ui:send', (_e, text) => toFb('fb:prepare-send', { text }));
ipcMain.on('ui:show-facebook', () => {
  fbWindow.show();
  fbWindow.focus();
});
ipcMain.on('ui:hide-facebook', () => fbWindow.hide());

app.whenReady().then(() => {
  createAppWindow();
  createFbWindow();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
