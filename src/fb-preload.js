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

// Text i "löv"-element med dir="auto" är själva meddelandetexterna.
function leafTexts(el) {
  const leaves = Array.from(el.querySelectorAll('[dir="auto"]')).filter(
    (d) => !d.querySelector('[dir="auto"]') && !d.closest('[contenteditable="true"]')
  );
  return leaves;
}

function messageContainers(main) {
  // Messenger har bytt struktur flera gånger, så vi provar i tur och ordning.
  for (const sel of ['[role="row"]', '[role="gridcell"]', '[data-testid*="message"]']) {
    const found = Array.from(main.querySelectorAll(sel)).filter((el) => leafTexts(el).length > 0);
    if (found.length > 0) return found;
  }
  // Sista utvägen: varje textlöv i chattytan är ett eget meddelande.
  const composer = main.querySelector('[contenteditable="true"]');
  const header = main.querySelector('[role="banner"], h1, h2');
  return leafTexts(main).filter((d) => !(header && header.contains(d)) && !(composer && composer.contains(d)));
}

function readMessages() {
  const main = document.querySelector('[role="main"]');
  if (!main) return [];
  const mainRect = main.getBoundingClientRect();
  const out = [];
  for (const box of messageContainers(main)) {
    const leaves = box.matches('[dir="auto"]') ? [box] : leafTexts(box);
    const text = leaves.map((d) => d.innerText.trim()).filter(Boolean).join('\n');
    if (!text) continue;
    // Egna meddelanden ligger till höger i Messenger.
    const r = leaves[leaves.length - 1].getBoundingClientRect();
    const mine = r.width > 0 && r.left + r.width / 2 > mainRect.left + mainRect.width / 2;
    if (out.length && out[out.length - 1].text === text) continue;
    out.push({ text, mine });
  }
  return out.slice(-60);
}

// Rutor som kräver att du gör något, t.ex. PIN-koden för krypterade chattar.
function needsAttention() {
  for (const d of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
    if (d.offsetParent === null && getComputedStyle(d).position !== 'fixed') continue;
    if (d.querySelector('input, [contenteditable="true"]')) return true;
    if (/PIN|krypter|encrypt|återställ|restore|säkerhetskop|backup/i.test(d.innerText || '')) return true;
  }
  return false;
}

// Felsökning: beskriver sidans struktur utan att ta med några meddelandetexter.
function diagnose() {
  const main = document.querySelector('[role="main"]');
  const count = (sel, root = document) => root.querySelectorAll(sel).length;
  return {
    url: location.pathname.replace(/\/t\/[^/]+/, '/t/<id>'),
    loggedIn: conversationLinks().length > 0,
    needsAttention: needsAttention(),
    conversations: conversationLinks().length,
    dialogs: count('[role="dialog"]'),
    main: !!main,
    rowsInMain: main ? count('[role="row"]', main) : 0,
    gridcellsInMain: main ? count('[role="gridcell"]', main) : 0,
    dirAutoInMain: main ? count('[dir="auto"]', main) : 0,
    textboxes: count('[contenteditable="true"][role="textbox"]'),
    messagesRead: readMessages().length,
    roles: main
      ? Object.entries(
          Array.from(main.querySelectorAll('[role]')).reduce((acc, el) => {
            const r = el.getAttribute('role');
            acc[r] = (acc[r] || 0) + 1;
            return acc;
          }, {})
        )
      : [],
  };
}

ipcRenderer.on('fb:diagnose', () => ipcRenderer.send('fb:diagnosis', diagnose()));

function poll() {
  const loggedIn = conversationLinks().length > 0;
  ipcRenderer.send('fb:status', { loggedIn, needsAttention: needsAttention() });
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

function openConversation(id) {
  if (currentThreadId() === id) return;
  const link = conversationLinks().find((a) => threadIdFromHref(a.href) === id);
  if (link) link.click();
  else location.href = `https://www.messenger.com/t/${id}/`;
  lastMessages = '';
}

function findComposer() {
  return (
    document.querySelector('[role="main"] [contenteditable="true"][role="textbox"]') ||
    document.querySelector('[contenteditable="true"][role="textbox"]')
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

ipcRenderer.on('fb:open-conversation', (_e, id) => openConversation(id));

// Byt till rätt konversation, vänta tills skrivfältet finns, och be
// huvudprocessen skriva in texten.
ipcRenderer.on('fb:prepare-send', async (_e, { threadId, text }) => {
  openConversation(threadId);
  let box = null;
  for (let i = 0; i < 40; i++) {
    if (currentThreadId() === threadId) box = findComposer();
    if (box) break;
    await sleep(150);
  }
  if (!box) {
    ipcRenderer.send('fb:composer-missing', { threadId });
    return;
  }
  box.focus();
  ipcRenderer.send('fb:composer-ready', { text });
});

window.addEventListener('DOMContentLoaded', () => {
  setInterval(poll, POLL_MS);
});
