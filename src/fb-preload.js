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

// Länkar i Messengers meny (t.ex. "Chattar · 1 olästa") pekar också på /t/<id>,
// så de sorteras bort.
const NAV_LABELS = /^(Chattar|Chats|Marketplace|Förfrågningar|Message requests|Arkiv|Archive|Gemenskaper|Communities)\b/i;

function readConversations() {
  const byId = new Map();
  for (const a of conversationLinks()) {
    const id = threadIdFromHref(a.href);
    if (!id) continue;
    const lines = (a.innerText || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0 || NAV_LABELS.test(lines[0])) continue;
    // Samma konversation kan länkas flera gånger; behåll den med mest info.
    const prev = byId.get(id);
    if (prev && prev.lines.length >= lines.length) continue;
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
    byId.set(id, {
      lines,
      id,
      name: lines[0],
      snippet: lines.slice(1).join(' · '),
      avatar: img ? img.src : null,
      unread,
      active: id === currentThreadId(),
    });
  }
  return Array.from(byId.values()).map(({ lines, ...c }) => c);
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

// Messenger lägger en dold text på varje meddelande för skärmläsare, t.ex.
// "Meddelandet skickades 09:22 av Kiia: Kom åt". Den innehåller avsändare,
// tid och text, så den läser vi i första hand.
const LABEL_RE =
  /(?:Meddelandet|Message)\s+(?:har\s+)?(?:skickades|skickats|sent)\s*(?:at\s+|kl\.?\s+)?(.*?)\s+(?:av|by)\s+([^:\n]{1,80}?):\s*([\s\S]*)$/i;
const ME = /^(Du|You)$/i;

function readLabeledMessages(main) {
  const out = [];
  for (const leaf of leafTexts(main)) {
    const m = (leaf.innerText || '').trim().match(LABEL_RE);
    if (!m) continue;
    const [, time, sender, text] = m;
    if (!text.trim()) continue;
    const msg = { sender: sender.trim(), time: time.trim(), text: text.trim(), mine: ME.test(sender.trim()) };
    const last = out[out.length - 1];
    if (last && last.sender === msg.sender && last.time === msg.time && last.text === msg.text) continue;
    out.push(msg);
  }
  return out;
}

function readMessages() {
  const main = document.querySelector('[role="main"]');
  if (!main) return [];
  const labeled = readLabeledMessages(main);
  if (labeled.length > 0) return labeled.slice(-80);

  // Reserv: gissa utifrån sidans uppbyggnad.
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

// Namnet på den öppna konversationen, från rubriken ovanför chatten.
function currentTitle() {
  const main = document.querySelector('[role="main"]');
  if (!main) return null;
  const h = main.querySelector('h1, h2');
  const t = h ? h.innerText.trim().split('\n')[0] : '';
  return t && !NAV_LABELS.test(t) ? t : null;
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

  const msgs = { threadId: currentThreadId(), title: currentTitle(), messages: readMessages() };
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
