// Ett chattfönster för en konversation, i MSN-stil.

const $ = (id) => document.getElementById(id);
const threadId = new URLSearchParams(location.search).get('id');

let contact = { name: 'Kontakt', snippet: '', avatar: null };
let messages = [];
let pending = []; // skickade men ännu inte syns i Messenger
let lastTheirCount = null;

// ---------- Rubrik och bilder ----------

function renderHeader() {
  const name = Emoticons.convert(contact.name);
  document.title = `${name} - Konversation`;
  $('title').textContent = `${name} - Konversation`;
  $('to-name').textContent = name;
  $('to-pm').textContent = contact.email ? `<${contact.email}>` : '';
  $('their-avatar').innerHTML = MSN.avatarHtml(contact.avatar);
  $('my-avatar').innerHTML = MSN.avatarHtml(MSN.load('avatar', ''));
}

window.addEventListener('storage', (e) => {
  if (e.key === 'avatar' || e.key === 'displayName') {
    renderHeader();
    renderHistory();
  }
});

// ---------- Konversationen ----------

function myName() {
  return MSN.load('displayName', 'Jag');
}

function addLine(box, who, text, cls, prevWho) {
  const div = document.createElement('div');
  div.className = 'msg' + (cls ? ' ' + cls : '');
  if (prevWho === who) div.classList.add('continued');
  const says = document.createElement('div');
  says.className = 'says';
  const b = document.createElement('b');
  b.textContent = who;
  says.append(b, ' säger:');
  const body = document.createElement('div');
  body.className = 'text';
  body.textContent = Emoticons.convert(text);
  div.append(says, body);
  box.appendChild(div);
}

function renderHistory() {
  const box = $('history');
  const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
  box.innerHTML = '';
  if (messages.length === 0 && pending.length === 0) {
    const n = document.createElement('div');
    n.className = 'notice';
    n.textContent = 'Inga meddelanden att visa än. Skriv något!';
    box.appendChild(n);
  }
  const them = Emoticons.convert(contact.name);
  let prev = null;
  for (const m of messages) {
    const who = m.mine ? myName() : them;
    addLine(box, who, m.text, '', prev);
    prev = who;
  }
  for (const text of pending) {
    addLine(box, myName(), text, 'pending', prev);
    prev = myName();
  }
  if (atBottom) box.scrollTop = box.scrollHeight;
}

function notice(text, isError) {
  const n = document.createElement('div');
  n.className = 'notice' + (isError ? ' error' : '');
  n.textContent = text;
  $('history').appendChild(n);
  $('history').scrollTop = $('history').scrollHeight;
}

function clock() {
  return new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

// ---------- Skicka ----------

function sendMessage(raw) {
  const text = Emoticons.convert(raw.trim());
  if (!text) return;
  window.msn.send(threadId, text);
  pending.push(text);
  renderHistory();
  $('history').scrollTop = $('history').scrollHeight;
}

$('input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage($('input').value);
    $('input').value = '';
    updateSendButton();
  }
});
$('input').addEventListener('input', updateSendButton);
$('send').addEventListener('click', () => {
  sendMessage($('input').value);
  $('input').value = '';
  updateSendButton();
  $('input').focus();
});

function updateSendButton() {
  $('send').disabled = $('input').value.trim() === '';
}

function insertAtCursor(text) {
  const el = $('input');
  const start = el.selectionStart;
  el.value = el.value.slice(0, start) + text + el.value.slice(el.selectionEnd);
  el.selectionStart = el.selectionEnd = start + text.length;
  el.focus();
  updateSendButton();
}

// ---------- Känsloikoner ----------

const panel = $('emoji-panel');
for (const [emoji, shortcut] of Emoticons.PANEL) {
  const b = document.createElement('button');
  b.textContent = emoji;
  b.title = shortcut ? `${emoji}  ${shortcut}` : emoji;
  b.onclick = (e) => {
    e.stopPropagation();
    insertAtCursor(emoji);
    panel.hidden = true;
  };
  panel.appendChild(b);
}
function togglePanel(e) {
  e.stopPropagation();
  panel.hidden = !panel.hidden;
}
$('tb-emoji').addEventListener('click', togglePanel);
$('fb-emoji').addEventListener('click', togglePanel);
document.addEventListener('click', () => (panel.hidden = true));

$('fb-wink').addEventListener('click', () => insertAtCursor('😉'));
$('fb-heart').addEventListener('click', () => insertAtCursor('❤️'));
$('fb-thumb').addEventListener('click', () => insertAtCursor('👍'));

$('tb-nudge').addEventListener('click', () => {
  sendMessage('📳 Knuff!');
  notice('Du har skickat en knuff.');
  window.msn.window('shake');
});
$('tb-fb').addEventListener('click', () => window.msn.showFacebook());

// ---------- Data från Messenger ----------

window.msn.onConversations((list) => {
  const c = list.find((x) => x.id === threadId);
  if (!c) return;
  contact = c;
  renderHeader();
});

window.msn.onMessages((data) => {
  if (data.threadId !== threadId) return;
  messages = data.messages;
  // Ta bort "skickas…"-rader som nu syns i Messenger.
  const mineTexts = messages.filter((m) => m.mine).map((m) => m.text);
  pending = pending.filter((p) => !mineTexts.some((t) => t.includes(p)));
  const theirCount = messages.filter((m) => !m.mine).length;
  if (lastTheirCount !== null && theirCount > lastTheirCount) {
    $('statusbar').textContent = `Senaste meddelandet mottogs kl. ${clock()}.`;
  }
  lastTheirCount = theirCount;
  renderHistory();
});

window.msn.onError((text) => notice(text, true));

// ---------- Start ----------

MSN.setupTitlebar();
renderHeader();
$('statusbar').textContent = 'Tryck Enter för att skicka, Skift+Enter för ny rad.';
window.msn.ready();
$('input').focus();
