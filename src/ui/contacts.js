// Kontaktlistan: visar dina Messenger-konversationer som MSN-kontakter.

const $ = (id) => document.getElementById(id);

let conversations = [];
let selectedId = null;
const collapsed = new Set(JSON.parse(MSN.load('collapsedGroups', '[]')));

// ---------- Du själv: namn, status, personligt meddelande, bild ----------

function renderMe() {
  const status = MSN.load('status', 'online');
  $('me-name').textContent = MSN.load('displayName', 'Jag');
  $('me-status').textContent = `(${MSN.STATUSES[status]})`;
  $('me-avatar').innerHTML = MSN.avatarHtml(MSN.load('avatar', ''));
  $('pm').textContent = MSN.load('personalMessage', '');
}

function buildStatusMenu() {
  const menu = $('status-menu');
  menu.innerHTML = '';
  for (const [key, label] of Object.entries(MSN.STATUSES)) {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = MSN.buddySvg(MSN.STATUS_COLOR[key]);
    item.append(label);
    item.onclick = () => {
      MSN.save('status', key);
      menu.hidden = true;
      renderMe();
    };
    menu.appendChild(item);
  }
}

function editName() {
  const span = $('me-name');
  span.contentEditable = 'true';
  span.style.userSelect = 'text';
  span.focus();
  document.getSelection().selectAllChildren(span);
  const done = () => {
    span.contentEditable = 'false';
    const name = span.textContent.trim() || 'Jag';
    MSN.save('displayName', name);
    renderMe();
  };
  span.addEventListener('blur', done, { once: true });
  span.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      span.removeEventListener('keydown', onKey);
      span.blur();
    }
  });
}

function pickAvatar() {
  $('avatar-file').click();
}

$('avatar-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    // Skala ner till 96x96 så att den får plats i inställningarna.
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const s = Math.min(img.width, img.height);
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 96, 96);
    MSN.save('avatar', c.toDataURL('image/jpeg', 0.85));
    URL.revokeObjectURL(img.src);
    renderMe();
  };
  img.src = URL.createObjectURL(file);
  e.target.value = '';
});

$('pm').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $('pm').blur();
  }
});
$('pm').addEventListener('blur', () => {
  const text = Emoticons.convert($('pm').textContent.trim());
  MSN.save('personalMessage', text);
  $('pm').textContent = text;
});

$('me-name-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  closeMenus();
  $('status-menu').hidden = false;
});
$('me-avatar').addEventListener('click', pickAvatar);

// ---------- Menyer ----------

function closeMenus() {
  for (const m of document.querySelectorAll('.popup')) m.hidden = true;
}
document.addEventListener('click', closeMenus);

$('menu-file').addEventListener('click', (e) => {
  e.stopPropagation();
  closeMenus();
  $('file-menu').hidden = false;
});
$('menu-contacts').addEventListener('click', (e) => {
  e.stopPropagation();
  $('search').focus();
});
$('menu-help').addEventListener('click', (e) => {
  e.stopPropagation();
  window.msn.showFacebook();
});

$('file-menu').addEventListener('click', (e) => {
  const action = e.target.closest('.item')?.dataset.action;
  closeMenus();
  if (action === 'name') editName();
  if (action === 'avatar') pickAvatar();
  if (action === 'facebook') window.msn.showFacebook();
  if (action === 'diagnose') window.msn.diagnose();
  if (action === 'quit') window.msn.window('close');
});

$('show-fb').addEventListener('click', () => window.msn.showFacebook());

// ---------- Kontaktlistan ----------

function makeGroup(key, title, items) {
  const group = document.createElement('div');
  group.className = 'group' + (collapsed.has(key) ? ' collapsed' : '');
  const header = document.createElement('div');
  header.className = 'group-header';
  header.innerHTML = `<span class="tri">${collapsed.has(key) ? '▸' : '▾'}</span>`;
  header.append(`${title} (${items.length})`);
  header.onclick = () => {
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
    MSN.save('collapsedGroups', JSON.stringify([...collapsed]));
    render();
  };
  group.appendChild(header);

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'contact empty';
    empty.textContent = 'Inga här just nu';
    group.appendChild(empty);
  }

  for (const c of items) {
    const row = document.createElement('div');
    row.className = 'contact';
    if (c.unread) row.classList.add('unread');
    if (c.id === selectedId) row.classList.add('selected');
    row.innerHTML = MSN.buddySvg(c.unread ? 'unread' : 'online');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = Emoticons.convert(c.name);
    row.appendChild(name);
    if (c.snippet) {
      const snip = document.createElement('span');
      snip.className = 'snippet';
      snip.textContent = Emoticons.convert(c.snippet);
      row.appendChild(snip);
    }
    if (c.avatar) {
      const img = document.createElement('img');
      img.className = 'mini';
      img.src = c.avatar;
      row.appendChild(img);
    }
    row.title = `${c.name}\nDubbelklicka för att chatta`;
    row.onclick = () => {
      selectedId = c.id;
      render();
    };
    row.ondblclick = () => window.msn.openChat(c.id);
    group.appendChild(row);
  }
  return group;
}

function render() {
  const list = $('list');
  if (conversations.length === 0) return; // inloggningstexten ligger kvar
  const q = $('search').value.trim().toLowerCase();
  const visible = q ? conversations.filter((c) => c.name.toLowerCase().includes(q)) : conversations;
  const scroll = list.scrollTop;
  list.innerHTML = '';
  list.appendChild(makeGroup('unread', 'Nya meddelanden', visible.filter((c) => c.unread)));
  list.appendChild(makeGroup('all', 'Konversationer', visible.filter((c) => !c.unread)));
  list.scrollTop = scroll;
}

$('search').addEventListener('input', render);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && selectedId && document.activeElement === document.body) {
    window.msn.openChat(selectedId);
  }
});

window.msn.onStatus(({ loggedIn }) => {
  $('login-hint').querySelector('strong').textContent = loggedIn ? 'Hämtar kontakter…' : 'Loggar in…';
});
window.msn.onNotice((text) => {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 6000);
});

window.msn.onConversations((list) => {
  conversations = list;
  render();
});

// ---------- Notiser ----------

let notificationsOn = true;
function renderNotifToggle() {
  const b = $('notif-toggle');
  b.textContent = notificationsOn ? '🔔 Notiser: på' : '🔕 Notiser: av';
  b.classList.toggle('off', !notificationsOn);
}
$('notif-toggle').addEventListener('click', (e) => {
  e.stopPropagation();
  window.msn.setNotifications(!notificationsOn);
});
window.msn.onSettings((s) => {
  notificationsOn = s.notifications;
  renderNotifToggle();
});

// ---------- Start ----------

MSN.setupTitlebar();
document.querySelector('.big-logo').innerHTML = MSN.logoSvg('big');
buildStatusMenu();
renderMe();
window.msn.ready();
