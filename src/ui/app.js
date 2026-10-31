// Gränssnittet. Visar konversationer och meddelanden som kommer från Messenger.

const $ = (id) => document.getElementById(id);
const EMOJIS = ['😊', '😂', '😍', '😉', '😎', '😢', '😡', '😮', '👍', '👎', '❤️', '💔', '🎉', '🔥', '🌹', '☕', '🍺', '🎵', '😴', '🤔', '🙈', '😘', '😇', '🤗'];

let conversations = [];
let currentId = null;
let fbVisible = false;

function render() {
  const ul = $('conversations');
  ul.innerHTML = '';
  if (conversations.length === 0) {
    ul.innerHTML = '<li class="empty">Inga konversationer hittades än.</li>';
    return;
  }
  for (const c of conversations) {
    const li = document.createElement('li');
    if (c.id === currentId) li.classList.add('active');
    if (c.unread) li.classList.add('unread');
    if (c.avatar) {
      const img = document.createElement('img');
      img.src = c.avatar;
      li.appendChild(img);
    }
    const text = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = c.name;
    const snip = document.createElement('span');
    snip.className = 'snippet';
    snip.textContent = c.snippet;
    text.append(name, snip);
    li.appendChild(text);
    li.onclick = () => openConversation(c.id);
    ul.appendChild(li);
  }
}

function openConversation(id) {
  currentId = id;
  const c = conversations.find((x) => x.id === id);
  $('chat-title').textContent = c ? c.name : 'Konversation';
  $('messages').innerHTML = '<div class="msg">Laddar…</div>';
  for (const el of document.querySelectorAll('#composer input, #composer button')) el.disabled = false;
  $('text').focus();
  window.msn.openConversation(id);
  render();
}

function renderMessages({ threadId, messages }) {
  if (!currentId || threadId !== currentId) return;
  const box = $('messages');
  const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  box.innerHTML = '';
  const other = (conversations.find((c) => c.id === currentId) || {}).name || 'Kontakt';
  for (const m of messages) {
    const div = document.createElement('div');
    div.className = 'msg' + (m.mine ? ' mine' : '');
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = (m.mine ? 'Du' : other) + ' säger: ';
    div.append(who, document.createTextNode(m.text));
    box.appendChild(div);
  }
  if (atBottom) box.scrollTop = box.scrollHeight;
}

function showError(text) {
  const el = $('error');
  el.textContent = text;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 6000);
}

$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('text').value.trim();
  if (!text || !currentId) return;
  window.msn.send(text);
  $('text').value = '';
  $('emoji-panel').hidden = true;
});

$('toggle-fb').onclick = () => {
  fbVisible = !fbVisible;
  if (fbVisible) window.msn.showFacebook();
  else window.msn.hideFacebook();
  $('toggle-fb').textContent = fbVisible ? 'Göm Facebook-fönstret' : 'Visa Facebook-fönstret';
};

const panel = $('emoji-panel');
for (const em of EMOJIS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = em;
  b.onclick = () => {
    $('text').value += em;
    $('text').focus();
  };
  panel.appendChild(b);
}
$('emoji').onclick = () => (panel.hidden = !panel.hidden);

window.msn.onStatus(({ loggedIn }) => {
  $('status').textContent = loggedIn ? 'Inloggad ✔' : 'Väntar på inloggning…';
});
window.msn.onConversations((list) => {
  conversations = list;
  const active = list.find((c) => c.active);
  if (!currentId && active) currentId = active.id;
  render();
});
window.msn.onMessages(renderMessages);
window.msn.onError(showError);
