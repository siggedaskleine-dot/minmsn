// Delade småbitar: ikoner ritade i SVG och titelradens knappar.
(function () {
  const STATUSES = {
    online: 'Online',
    busy: 'Upptagen',
    brb: 'Strax tillbaka',
    away: 'Borta',
    phone: 'I telefon',
    lunch: 'Ute och äter',
    offline: 'Visa som offline',
  };

  const STATUS_COLOR = { online: 'online', busy: 'busy', phone: 'busy', brb: 'away', away: 'away', lunch: 'away', offline: 'offline' };

  // En liten "kompis"-figur: huvud + kropp med glans.
  function buddySvg(kind) {
    return (
      `<svg class="buddy ${kind || ''}" viewBox="0 0 16 16" aria-hidden="true">` +
      '<path class="body" d="M2.5 15.5c0-3.6 2.4-6 5.5-6s5.5 2.4 5.5 6z"/>' +
      '<circle class="head" cx="8" cy="5" r="3.6"/>' +
      '<ellipse class="shine" cx="6.9" cy="3.6" rx="1.4" ry=".9"/>' +
      '</svg>'
    );
  }

  // Programlogga: två kompisar, en grön och en blå.
  function logoSvg(cls) {
    return (
      `<svg class="${cls || 'logo'}" viewBox="0 0 24 24" aria-hidden="true">` +
      '<path d="M1 22c0-4.5 3-7.5 7-7.5s7 3 7 7.5z" fill="#3fae2a" stroke="#1f6e14" stroke-width=".7"/>' +
      '<circle cx="8" cy="9" r="4.5" fill="#3fae2a" stroke="#1f6e14" stroke-width=".7"/>' +
      '<path d="M9 22c0-4.5 3-7.5 7-7.5s7 3 7 7.5z" fill="#3b7fe0" stroke="#1d4a9a" stroke-width=".7"/>' +
      '<circle cx="16" cy="9" r="4.5" fill="#3b7fe0" stroke="#1d4a9a" stroke-width=".7"/>' +
      '<ellipse cx="14.6" cy="7.2" rx="1.6" ry="1" fill="rgba(255,255,255,.6)"/>' +
      '<ellipse cx="6.6" cy="7.2" rx="1.6" ry="1" fill="rgba(255,255,255,.6)"/>' +
      '</svg>'
    );
  }

  function avatarHtml(src) {
    if (src) return `<img src="${encodeURI(src).replace(/"/g, '%22')}" alt="">`;
    return `<div class="placeholder">${buddySvg('online')}</div>`;
  }

  function setupTitlebar() {
    for (const b of document.querySelectorAll('[data-win]')) {
      b.addEventListener('click', () => window.msn.window(b.dataset.win));
    }
    for (const el of document.querySelectorAll('.logo-slot')) el.innerHTML = logoSvg();
  }

  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }

  window.MSN = { STATUSES, STATUS_COLOR, buddySvg, logoSvg, avatarHtml, setupTitlebar, load, save };
})();
