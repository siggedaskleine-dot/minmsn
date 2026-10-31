// Körs inne på messenger.com. Läser konversationer och meddelanden från sidan
// och tar emot kommandon från huvudprocessen.
//
// Messenger byter ofta namn på sina CSS-klasser, så vi letar efter saker
// som är stabila: länkar till /t/<id>, aria-roller och contenteditable.

const { ipcRenderer } = require('electron');

const POLL_MS = 1500;
let lastConversations = '';
let lastMessages = '';

function conversationLinks() {
  return Array.from(document.querySelectorAll('a[href*="/t/"]')).filter((a) =>
    /\/t\/[^/]+\/?$/.test(new URL(a.href, location.href).pathname)
  );
}

function threadIdFromHref(href) {
  const m = new URL(href, location.href).pathname.match(/\/t\/([^/]+)/);
  return m ? m[1] : null;
}

function currentThreadId() {
  return threadIdFromHref(location.href);
}

function readConversations() {
  const seen = new Set();
  const list = [];
  for (const a of conversationLinks()) {
    const id = threadIdFromHref(a.href);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const lines = (a.innerText || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const img = a.querySelector('img');
    // Olästa konversationer visas med fet text i Messenger.
    let unread = false;
    for (const span of a.querySelectorAll('span')) {
      const w = parseInt(getComputedStyle(span).fontWeight, 10);
      if (w >= 600 && span.innerText.trim() === lines[0]) {
        unread = true;
        break;
      }
    }
    list.push({
      id,
      name: lines[0],
      snippet: lines.slice(1).join(' · '),
      avatar: img ? img.src : null,
      unread,
      active: id === currentThreadId(),
    });
  }
  return list;
}

function readMessages() {
  const main = document.querySelector('[role="main"]');
  if (!main) return [];
  const rows = Array.from(main.querySelectorAll('[role="row"]'));
  const mainRect = main.getBoundingClientRect();
  const out = [];
  for (const row of rows) {
    const text = (row.innerText || '').trim();
    if (!text) continue;
    // Egna meddelanden ligger till höger i Messenger.
    const bubble = row.querySelector('[dir="auto"]');
    let mine = false;
    if (bubble) {
      const r = bubble.getBoundingClientRect();
      mine = r.left + r.width / 2 > mainRect.left + mainRect.width / 2;
    }
    out.push({ text, mine });
  }
  return out.slice(-60);
}

function poll() {
  const loggedIn = conversationLinks().length > 0;
  ipcRenderer.send('fb:status', { loggedIn });
  if (!loggedIn) return;

  const convs = readConversations();
  const convJson = JSON.stringify(convs);
  if (convJson !== lastConversations) {
    lastConversations = convJson;
    ipcRenderer.send('fb:conversations', convs);
  }

  const msgs = { threadId: currentThreadId(), messages: readMessages() };
  const msgJson = JSON.stringify(msgs);
  if (msgJson !== lastMessages) {
    lastMessages = msgJson;
    ipcRenderer.send('fb:messages', msgs);
  }
}

ipcRenderer.on('fb:open-conversation', (_e, id) => {
  const link = conversationLinks().find((a) => threadIdFromHref(a.href) === id);
  if (link) link.click();
  else location.href = `https://www.messenger.com/t/${id}/`;
  lastMessages = '';
});

ipcRenderer.on('fb:prepare-send', (_e, { text }) => {
  const box =
    document.querySelector('[role="main"] [contenteditable="true"][role="textbox"]') ||
    document.querySelector('[contenteditable="true"][role="textbox"]');
  if (!box) {
    ipcRenderer.send('fb:composer-missing');
    return;
  }
  box.focus();
  ipcRenderer.send('fb:composer-ready', { text });
});

window.addEventListener('DOMContentLoaded', () => {
  setInterval(poll, POLL_MS);
});
