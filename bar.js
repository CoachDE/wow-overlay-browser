'use strict';

const $ = (id) => document.getElementById(id);
const api = window.overlay;

let lang = 'de';
let i18nApplied = false;
const T = (key, vars) => tr(lang, key, vars);
const fmt = (accel) => formatAccelerator(accel, lang);

const urlInput = $('url');
const opacity = $('opacity');
const status = $('status');
let editingUrl = false;
let statusTimer = null;

// Twitch-Eingabemodus: Das Adressfeld fragt nach dem Kanalnamen
let twitchPrompt = false;
let normalPlaceholder = '';
function setTwitchPrompt(on) {
  twitchPrompt = on;
  urlInput.classList.toggle('twitch-mode', on);
  if (on) {
    normalPlaceholder = urlInput.placeholder;
    urlInput.value = '';
    urlInput.placeholder = T('bar.twitchPrompt');
    urlInput.focus();
  } else if (normalPlaceholder) {
    urlInput.placeholder = normalPlaceholder;
  }
}

$('urlForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (twitchPrompt) {
    const ch = urlInput.value.trim();
    setTwitchPrompt(false);
    if (ch) api.openTwitch(ch);
  } else {
    api.navigate(urlInput.value);
  }
  urlInput.blur();
});
urlInput.addEventListener('focus', () => { editingUrl = true; urlInput.select(); });
urlInput.addEventListener('blur', () => { editingUrl = false; if (twitchPrompt) setTimeout(() => setTwitchPrompt(false), 150); });
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Escape' && twitchPrompt) { setTwitchPrompt(false); urlInput.blur(); } });

$('btnBack').addEventListener('click', () => api.back());
$('btnHome').addEventListener('click', () => api.home());
$('btnReload').addEventListener('click', () => api.reload());
$('btnShorts').addEventListener('click', () => api.shorts());
$('btnCinema').addEventListener('click', () => api.cinema());
$('btnClick').addEventListener('click', () => api.toggleClickThrough());
$('btnFocus').addEventListener('click', () => api.toggleFocus());
$('btnSplit').addEventListener('click', () => api.toggleSplit());
$('btnTwitch').addEventListener('click', () => api.toggleTwitch());
api.onTwitchPrompt(() => setTwitchPrompt(true));

// Trennbalken der geteilten Ansicht: Ziehen verfolgt der Hauptprozess (die Maus fährt dabei
// über die Seiten), Loslassen meldet die Leiste bzw. die Seite, über der losgelassen wird.
const divider = $('splitDivider');
divider.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  divider.classList.add('dragging');
  try { divider.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
  api.splitDragStart();
});
const endDrag = () => {
  if (!divider.classList.contains('dragging')) return;
  divider.classList.remove('dragging');
  api.splitDragEnd();
};
divider.addEventListener('pointerup', endDrag);
divider.addEventListener('lostpointercapture', endDrag);
window.addEventListener('pointerup', endDrag);
divider.addEventListener('dblclick', () => api.splitReset());

function renderSplit(sp) {
  const on = !!(sp && sp.on && sp.divider);
  $('btnSplit').classList.toggle('on', on);
  divider.hidden = !on;
  if (on) {
    divider.style.left = `${sp.divider.x}px`;
    divider.style.top = `${sp.divider.y}px`;
    divider.style.width = `${sp.divider.width}px`;
    divider.style.height = `${sp.divider.height}px`;
  }
}
$('btnBar').addEventListener('click', () => api.toggleBar());
$('btnSettings').addEventListener('click', () => api.openSettings());
$('btnMin').addEventListener('click', () => api.minimize());
$('btnMax').addEventListener('click', () => api.toggleMaximize());
$('miniPlay').addEventListener('click', () => api.playPause());
$('miniRestore').addEventListener('click', () => api.minimize()); // gleicher Schalter: Mini <-> normal
$('miniClose').addEventListener('click', () => api.close());
$('btnClose').addEventListener('click', () => api.close());

opacity.addEventListener('input', () => api.setOpacity(Number(opacity.value) / 100));

// ---------- Lautstärke ----------
const volume = $('volume');
let volumeDragging = false;
let currentVolume = 100;
volume.addEventListener('input', () => {
  volumeDragging = true;
  currentVolume = Number(volume.value);
  $('volumeValue').textContent = currentVolume;
  api.setVolume(currentVolume);
});
volume.addEventListener('change', () => { volumeDragging = false; });
$('btnVol').addEventListener('click', () => api.toggleMute());
$('miniVol').addEventListener('click', () => api.toggleMute());
// Mausrad über Regler/Lautsprecher: 5 % pro Raster
for (const el of [$('volumeBox'), $('miniVol')]) {
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    currentVolume = Math.max(0, Math.min(100, currentVolume + (e.deltaY < 0 ? 5 : -5)));
    api.setVolume(currentVolume);
  }, { passive: false });
}

function volumeIconPath(vol, muted) {
  const speaker = 'M2.5 6h2.5l3.5-3v10l-3.5-3H2.5Z';
  if (muted || vol === 0) return speaker + 'M10.5 6l3.5 4M14 6l-3.5 4';
  if (vol < 50) return speaker + 'M10.8 6a2.6 2.6 0 0 1 0 4';
  return speaker + 'M10.8 6a2.6 2.6 0 0 1 0 4M12.6 4.2a5.2 5.2 0 0 1 0 7.6';
}
status.addEventListener('click', () => { status.style.display = 'none'; });

function showStatus(text, ms) {
  status.textContent = text;
  status.classList.remove('sticky');
  status.style.display = 'block';
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => { status.style.display = 'none'; }, ms);
}

// ---------- Tabs ----------
const tabList = $('tabList');
const tabEls = new Map(); // id -> Element (wird wiederverwendet, damit Symbole nicht flackern)
const YT_ICON = '<svg viewBox="0 0 16 16"><rect x="1" y="3" width="14" height="10" rx="3" fill="#e2483c"/><path d="M6.5 5.7v4.6L10.5 8Z" fill="#fff"/></svg>';
const GLOBE_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 10 10"><path d="M2 2l6 6M8 2 2 8"/></svg>';

$('btnNewTab').addEventListener('click', () => api.newTab());
$('btnUpdate').addEventListener('click', () => api.updateAction());

// Update-Knopf je nach Zustand
function renderUpdate(u) {
  const b = $('btnUpdate');
  const show = u && ['available', 'downloading', 'ready', 'error'].includes(u.status) && (u.status !== 'error' || u.latest);
  b.hidden = !show;
  if (!show) return;
  b.classList.toggle('busy', u.status === 'downloading');
  b.classList.toggle('error', u.status === 'error');
  b.disabled = u.status === 'downloading';
  if (u.status === 'available') {
    b.textContent = T('bar.update.available', { v: u.latest });
    b.title = u.selfUpdate
      ? T('bar.update.availableTitle', { v: u.latest, c: u.current })
      : T('bar.update.availablePage', { v: u.latest });
  } else if (u.status === 'downloading') {
    b.textContent = T('bar.update.downloading', { p: u.progress || 0 });
    b.title = T('bar.update.downloadingTitle', { v: u.latest });
  } else if (u.status === 'ready') {
    b.textContent = T('bar.update.ready');
    b.title = T('bar.update.readyTitle', { v: u.latest });
  } else {
    b.textContent = T('bar.update.failed');
    b.title = T('bar.update.failedTitle', { e: errorText(lang, u.error) });
  }
}

function makeTabEl(id) {
  const el = document.createElement('div');
  el.className = 'tab' + (id === 'yt' ? ' youtube' : '');
  el.dataset.id = String(id);
  el.innerHTML = '<span class="ico"></span><span class="title"></span>';
  if (id !== 'yt') {
    const x = document.createElement('span');
    x.className = 'x';
    x.title = T('bar.tabClose', { k: fmt('Control+W') });
    x.innerHTML = CLOSE_ICON;
    x.addEventListener('click', (e) => { e.stopPropagation(); api.closeTab(id); });
    el.append(x);
  }
  el.addEventListener('mousedown', (e) => {
    if (e.button === 1 && id !== 'yt') { e.preventDefault(); api.closeTab(id); } // Mittelklick schließt
  });
  el.addEventListener('click', () => api.activateTab(id));
  return el;
}

function setIcon(el, kind, src) {
  const ico = el.querySelector('.ico');
  const key = kind + '|' + (src || '');
  if (ico.dataset.key === key) return;
  ico.dataset.key = key;
  ico.textContent = '';
  if (kind === 'yt') ico.innerHTML = YT_ICON;
  else if (kind === 'loading') ico.innerHTML = '<span class="spinner"></span>';
  else if (kind === 'img') {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.addEventListener('error', () => { ico.innerHTML = GLOBE_ICON; });
    ico.append(img);
  } else ico.innerHTML = GLOBE_ICON;
}

function renderTabs(state) {
  const items = [{ id: 'yt', title: 'YouTube', yt: true, loading: false }, ...state.tabs];
  const seen = new Set();
  items.forEach((t, i) => {
    seen.add(String(t.id));
    let el = tabEls.get(String(t.id));
    if (!el) { el = makeTabEl(t.id); tabEls.set(String(t.id), el); }
    if (tabList.children[i] !== el) tabList.insertBefore(el, tabList.children[i] || null);
    el.classList.toggle('active', String(state.activeTab) === String(t.id));
    // Geteilte Ansicht: beide sichtbaren Tabs markieren (◧ links, ◨ rechts)
    const sp = state.split || {};
    const side = sp.on ? (String(sp.left) === String(t.id) ? 'left' : String(sp.right) === String(t.id) ? 'right' : null) : null;
    el.classList.toggle('pane', !!side);
    let mark = el.querySelector('.side');
    if (side && !mark) { mark = document.createElement('span'); mark.className = 'side'; el.querySelector('.ico').after(mark); }
    if (mark) { if (side) mark.textContent = side === 'left' ? '◧' : '◨'; else mark.remove(); }
    el.querySelector('.title').textContent = t.title || T('bar.newTabTitle');
    if (t.id !== 'yt') { const x = el.querySelector('.x'); if (x) x.title = T('bar.tabClose', { k: fmt('Control+W') }); }
    el.title = t.title || '';
    if (t.yt) setIcon(el, 'yt');
    else if (t.loading) setIcon(el, 'loading');
    else if (t.favicon) setIcon(el, 'img', t.favicon);
    else setIcon(el, 'globe');
  });
  for (const [id, el] of tabEls) {
    if (!seen.has(id)) { el.remove(); tabEls.delete(id); }
  }
}

api.onFocusUrl(() => { urlInput.focus(); urlInput.select(); });

// ---------- Lesezeichen ----------
const bmList = $('bmList');
const bmEls = new Map();   // id -> Element
let bmData = [];
let bmDragId = null;
let bmEditingId = null;
let bmPendingState = null;

$('btnStar').addEventListener('click', () => api.toggleBookmark());

// Mausrad scrollt die Leiste waagerecht
bmList.addEventListener('wheel', (e) => {
  if (bmList.scrollWidth <= bmList.clientWidth) return;
  e.preventDefault();
  bmList.scrollLeft += (e.deltaY || e.deltaX);
}, { passive: false });

function bmIcon(el, favicon) {
  const ico = el.querySelector('.ico');
  if (ico.dataset.src === favicon) return;
  ico.dataset.src = favicon;
  ico.textContent = '';
  if (favicon === 'yt') { ico.innerHTML = YT_ICON; return; }
  if (favicon && /^(https?:|data:image\/)/i.test(favicon)) {
    const img = document.createElement('img');
    img.src = favicon;
    img.alt = '';
    img.addEventListener('error', () => { ico.innerHTML = GLOBE_ICON; });
    ico.append(img);
  } else {
    ico.innerHTML = GLOBE_ICON;
  }
}

function makeBmEl(id) {
  const el = document.createElement('div');
  el.className = 'bm';
  el.dataset.id = id;
  el.draggable = true;
  el.innerHTML = '<span class="ico"></span><span class="title"></span>';
  el.addEventListener('click', (e) => { if (!bmEditingId) api.openBookmark(id, e.ctrlKey); });
  el.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); api.openBookmark(id, true); } });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); api.bookmarkMenu(id); });
  // Ziehen zum Umsortieren
  el.addEventListener('dragstart', (e) => {
    bmDragId = id;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  });
  el.addEventListener('dragend', () => {
    bmDragId = null;
    document.querySelectorAll('.bm').forEach((b) => b.classList.remove('dragging', 'drop-before', 'drop-after'));
    if (bmPendingState) { const s = bmPendingState; bmPendingState = null; renderBookmarks(s); }
  });
  el.addEventListener('dragover', (e) => {
    if (!bmDragId || bmDragId === id) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const after = e.clientX > r.left + r.width / 2;
    el.classList.toggle('drop-after', after);
    el.classList.toggle('drop-before', !after);
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!bmDragId || bmDragId === id) return;
    const after = el.classList.contains('drop-after');
    const ids = bmData.map((b) => b.id).filter((x) => x !== bmDragId);
    const target = ids.indexOf(id) + (after ? 1 : 0);
    api.moveBookmark(bmDragId, target);
  });
  return el;
}

let bmInitialized = false;   // erste Anzeige nicht animieren
const STAR_PATH = 'M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6Z';

function renderBookmarks(state) {
  if (bmDragId || bmEditingId) { bmPendingState = state; return; }
  const list = state.bookmarks || [];
  bmData = list;
  const row = $('bookmarks');
  const wasHidden = row.hidden;
  row.hidden = !state.showBookmarks;
  // Leiste erscheint (z. B. erstes Lesezeichen): sanft hereingleiten
  if (bmInitialized && wasHidden && !row.hidden) {
    row.classList.remove('appear');
    void row.offsetWidth;
    row.classList.add('appear');
  }
  const seen = new Set();
  const added = [];
  list.forEach((b, i) => {
    seen.add(b.id);
    let el = bmEls.get(b.id);
    if (!el) { el = makeBmEl(b.id); bmEls.set(b.id, el); if (bmInitialized) added.push(el); }
    el.classList.remove('bm-removing');
    if (bmList.children[i] !== el) bmList.insertBefore(el, bmList.children[i] || null);
    el.querySelector('.title').textContent = b.title;
    el.title = `${b.title}\n${b.url}\n${T('bar.bmHelp')}`;
    bmIcon(el, b.favicon || '');
  });
  // Entfernte Lesezeichen kurz ausblenden, dann löschen
  for (const [id, el] of bmEls) {
    if (seen.has(id)) continue;
    bmEls.delete(id);
    if (bmInitialized && !row.hidden) {
      el.classList.add('bm-removing');
      setTimeout(() => el.remove(), 300);
    } else {
      el.remove();
    }
  }
  bmInitialized = true;
  for (const el of added) celebrateBookmark(el);
}

// Neues Lesezeichen: Stern ploppt, ein Stern fliegt in die Leiste, das Lesezeichen leuchtet auf
function celebrateBookmark(el) {
  const star = $('btnStar');
  star.classList.remove('pop');
  void star.offsetWidth;
  star.classList.add('pop');
  setTimeout(() => star.classList.remove('pop'), 600);

  // Erst warten, bis die Leiste sichtbar ist und ihr Platz feststeht
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const from = star.getBoundingClientRect();
    const to = el.getBoundingClientRect();
    const pulse = () => {
      el.classList.remove('bm-new');
      void el.offsetWidth;
      el.classList.add('bm-new');
      setTimeout(() => el.classList.remove('bm-new'), 2300);
    };
    if (!from.width || !to.width || star.offsetParent === null) { pulse(); return; }
    const fly = document.createElement('div');
    fly.className = 'fly-star';
    fly.innerHTML = `<svg viewBox="0 0 16 16"><path d="${STAR_PATH}"/></svg>`;
    fly.style.left = `${from.left + from.width / 2 - 8}px`;
    fly.style.top = `${from.top + from.height / 2 - 8}px`;
    document.body.appendChild(fly);
    const dx = (to.left + 12) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    requestAnimationFrame(() => {
      fly.style.transform = `translate(${dx}px, ${dy}px) scale(.7) rotate(180deg)`;
      fly.style.opacity = '0.2';
    });
    let done = false;
    const finish = () => { if (done) return; done = true; fly.remove(); pulse(); };
    fly.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 800); // falls transitionend nicht kommt
  }));
}

// Umbenennen direkt in der Leiste (nach "Umbenennen …" im Rechtsklick-Menü)
api.onEditBookmark((id) => {
  const el = bmEls.get(id);
  const b = bmData.find((x) => x.id === id);
  if (!el || !b) return;
  bmEditingId = id;
  const title = el.querySelector('.title');
  const input = document.createElement('input');
  input.value = b.title;
  title.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    const span = document.createElement('span');
    span.className = 'title';
    span.textContent = b.title;
    input.replaceWith(span);
    bmEditingId = null;
    if (save) api.renameBookmark(id, input.value);
    if (bmPendingState) { const s = bmPendingState; bmPendingState = null; renderBookmarks(s); }
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', (e) => e.stopPropagation());
});

// ---------- Tour durch die Leiste ----------
const TOUR_STEPS = [
  { id: 'welcome' },
  { id: 'url', sel: ['#urlForm'] },
  { id: 'star', sel: ['#btnStar'], key: 'Control+D' },
  { id: 'opacity', sel: ['.opacity'] },
  { id: 'volume', sel: ['#volumeBox'] },
  { id: 'shorts', sel: ['#btnShorts'] },
  { id: 'cinema', sel: ['#btnCinema'] },
  { id: 'twitch', sel: ['#btnTwitch'] },
  { id: 'split', sel: ['#btnSplit'] },
  { id: 'focus', sel: ['#btnFocus'] },
  { id: 'click', sel: ['#btnClick'], hotkey: 'clickThrough' },
  { id: 'bar', sel: ['#btnBar'] },
  { id: 'settings', sel: ['#btnSettings'] },
  { id: 'window', sel: ['#btnMin', '#btnMax', '#btnClose'] },
  { id: 'tabs', sel: ['#btnNewTab'] },
  { id: 'end' }
];
let tourSteps = null;   // aktive Schritte (ausgeblendete Knöpfe werden übersprungen)
let tourIndex = 0;
let tourState = null;   // letzter Zustand (für Hotkey-Anzeige)

function tourRect(step) {
  if (!step.sel) return null;
  let r = null;
  for (const s of step.sel) {
    const el = document.querySelector(s);
    if (!el) continue;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) }
      : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  }
  return r;
}

function startTourUi() {
  tourSteps = TOUR_STEPS.filter((s) => !s.sel || tourRect(s));
  tourIndex = 0;
  $('tour').hidden = false;
  renderTour();
}

function renderTour() {
  if (!tourSteps) return;
  const step = tourSteps[tourIndex];
  const last = tourIndex === tourSteps.length - 1;
  const k = step.key ? fmt(step.key) : step.hotkey && tourState ? hk(tourState, step.hotkey) : '';
  $('tourTitle').textContent = T(`tour.${step.id}.t`);
  $('tourText').textContent = T(`tour.${step.id}.x`, { k });
  $('tourCount').textContent = T('tour.counter', { i: tourIndex + 1, n: tourSteps.length });
  $('tourSkip').textContent = T('tour.skip');
  $('tourSkip').hidden = last;
  $('tourBack').textContent = T('tour.back');
  $('tourBack').hidden = tourIndex === 0;
  $('tourNext').textContent = last ? T('tour.done') : T('tour.next');

  const ring = $('tourRing');
  const bubble = $('tourBubble');
  const W = window.innerWidth;
  const H = window.innerHeight;
  const r = tourRect(step);
  if (!r) {
    // Begrüßung/Abschluss: mittig, alles abgedunkelt
    ring.className = 'none';
    Object.assign(ring.style, { left: `${W / 2}px`, top: `${H / 2}px`, width: '0px', height: '0px' });
    bubble.classList.add('center');
    bubble.style.left = `${Math.max(8, (W - 310) / 2)}px`;
    bubble.style.top = `${Math.max(70, (H - bubble.offsetHeight) / 2)}px`;
  } else {
    ring.className = '';
    const pad = 3;
    Object.assign(ring.style, {
      left: `${r.left - pad}px`, top: `${r.top - pad}px`,
      width: `${r.right - r.left + pad * 2}px`, height: `${r.bottom - r.top + pad * 2}px`
    });
    bubble.classList.remove('center');
    const cx = (r.left + r.right) / 2;
    const left = Math.min(Math.max(8, cx - 155), W - 318);
    bubble.style.left = `${left}px`;
    bubble.style.top = `${r.bottom + 14}px`;
    bubble.style.setProperty('--arrow', `${Math.min(Math.max(16, cx - left), 294)}px`);
  }
  $('tourNext').focus();
}

function closeTourUi() {
  if (!tourSteps) return;
  tourSteps = null;
  $('tour').hidden = true;
  api.tourEnd();
}

$('tourNext').addEventListener('click', () => {
  if (!tourSteps) return;
  if (tourIndex >= tourSteps.length - 1) closeTourUi();
  else { tourIndex++; renderTour(); }
});
$('tourBack').addEventListener('click', () => { if (tourSteps && tourIndex > 0) { tourIndex--; renderTour(); } });
$('tourSkip').addEventListener('click', () => closeTourUi());
document.addEventListener('keydown', (e) => {
  if (!tourSteps) return;
  if (e.key === 'Escape') { e.preventDefault(); closeTourUi(); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); $('tourNext').click(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); $('tourBack').click(); }
}, true);
window.addEventListener('resize', () => { if (tourSteps) renderTour(); });

let shownHotkeyWarning = false;
const hk = (state, name) => (state.hotkeys && state.hotkeys[name] ? fmt(state.hotkeys[name]) : T('bar.noHotkey'));

api.onState((state) => {
  // Feste Texte beim ersten Zustand und bei jedem Sprachwechsel setzen
  if (!i18nApplied || (state.lang && state.lang !== lang)) {
    if (state.lang) lang = state.lang;
    applyI18n(document, lang);
    $('btnNewTab').title = T('bar.newTab', { k: fmt('Control+T') });
    i18nApplied = true;
  }
  if (state.hotkeysChanged) shownHotkeyWarning = false;
  tourState = state;
  // Tour starten/beenden (erst nach dem Zeichnen, damit die Knöpfe ihre Position haben)
  if (state.tour && !tourSteps) requestAnimationFrame(() => requestAnimationFrame(startTourUi));
  else if (!state.tour && tourSteps) { tourSteps = null; $('tour').hidden = true; }
  if (state.theme && document.documentElement.dataset.theme !== state.theme) {
    document.documentElement.dataset.theme = state.theme;
  }
  $('btnShorts').classList.toggle('on', !!state.shortsMode);
  $('btnShorts').title = state.shortsMode
    ? T('bar.shortsOn', { next: hk(state, 'shortsNext'), prev: hk(state, 'shortsPrev') })
    : T('bar.shortsOff');
  if (!editingUrl) urlInput.value = state.url || '';
  if (!twitchPrompt) urlInput.placeholder = state.activeTab === 'yt' ? T('bar.placeholderYt') : T('bar.placeholderWeb');
  $('btnHome').title = state.activeTab === 'yt' ? T('bar.homeYt') : T('bar.homeWeb');
  if (state.tabs) renderTabs(state);
  renderSplit(state.split);
  $('btnTwitch').classList.toggle('on', !!state.twitch);
  $('btnTwitch').title = state.twitch
    ? T('bar.twitchOn', { ch: state.twitch.channel })
    : T('bar.twitchOff');
  $('btnSplit').title = state.split && state.split.on
    ? T('bar.splitOn', { k: hk(state, 'toggleSplit') })
    : T('bar.splitOff', { k: hk(state, 'toggleSplit') });
  renderUpdate(state.update);
  if (state.bookmarks) renderBookmarks(state);
  $('btnStar').classList.toggle('saved', !!state.bookmarked);
  $('btnStar').title = state.bookmarked ? T('bar.starRemove', { k: fmt('Control+D') }) : T('bar.starAdd', { k: fmt('Control+D') });
  if (state.notice) showStatus(state.notice, 5000);
  $('btnBack').disabled = !state.canGoBack;
  opacity.value = Math.round(state.opacity * 100);
  $('btnClick').classList.toggle('on', !!state.clickThrough);
  if (typeof state.cinema === 'boolean') $('btnCinema').classList.toggle('on', state.cinema);

  $('btnClick').title = T('bar.clickThrough', { k: hk(state, 'clickThrough') });
  // Fokus-Modus: offenes Auge = an, durchgestrichen = aus
  $('btnFocus').classList.toggle('on', !!state.focusMode);
  $('focusSlash').style.display = state.focusMode ? 'none' : '';
  $('btnFocus').title = state.focusMode
    ? T('bar.focusOn', { p: Math.round((state.focusOpacity || 0.3) * 100), k: hk(state, 'toggleFocus') })
    : T('bar.focusOff', { k: hk(state, 'toggleFocus') });
  $('btnCinema').title = T('bar.cinema', { k: hk(state, 'cinema') });
  // Ist die Leiste nur wegen der Maus aufgeklappt, macht der Knopf sie wieder dauerhaft sichtbar
  if (state.barVisible) {
    $('btnBar').title = T('bar.barHide', { k: hk(state, 'toggleBar') });
    $('barIcon').setAttribute('d', 'M3.5 10 8 5.5l4.5 4.5');
  } else {
    $('btnBar').title = T('bar.barShow', { k: hk(state, 'toggleBar') });
    $('barIcon').setAttribute('d', 'M3.5 6 8 10.5 12.5 6');
  }

  // Lautstärke
  if (typeof state.volume === 'number') {
    currentVolume = state.volume;
    if (!volumeDragging) volume.value = state.volume;
    $('volumeValue').textContent = state.muted ? T('bar.volOff') : state.volume;
    const d = volumeIconPath(state.volume, state.muted);
    document.querySelectorAll('.vol-icon').forEach((p) => p.setAttribute('d', d));
    for (const id of ['btnVol', 'miniVol']) {
      $(id).classList.toggle('muted', !!state.muted);
      $(id).title = T('bar.volTitle', { action: state.muted ? T('bar.unmute') : T('bar.mute'), k: hk(state, 'mute'), v: state.volume, up: hk(state, 'volumeUp'), down: hk(state, 'volumeDown') });
    }
  }

  // Mini-Leiste
  document.body.classList.toggle('mini', !!state.miniMode);
  $('miniTitle').textContent = state.ytTitle || 'YouTube';
  $('miniTitle').title = state.ytTitle || '';
  $('miniTitle').classList.toggle('paused', !state.ytPlaying);
  $('miniPlayIcon').setAttribute('d', state.ytPlaying ? 'M5 3.5v9M11 3.5v9' : 'M5 3.5v9l7-4.5Z');
  $('miniPlay').title = `${state.ytPlaying ? T('bar.pause') : T('bar.play')} (${hk(state, 'playPause')})`;
  $('miniRestore').title = T('bar.restore', { k: hk(state, 'toggleMini') });
  $('miniClose').title = T('bar.quit', { k: hk(state, 'quitApp') });
  $('btnMin').title = T('bar.mini', { k: hk(state, 'toggleMini') });
  $('btnMax').title = state.maximized
    ? T('bar.maxOn', { k: hk(state, 'toggleMaximize') })
    : T('bar.maxOff', { k: hk(state, 'toggleMaximize') });
  $('maxIcon').setAttribute('d', state.maximized
    ? 'M5.5 3.5h7v7M3.5 5.5h7v7h-7Z'
    : 'M3.5 3.5h9v9h-9Z');
  $('btnClose').title = T('bar.quit', { k: hk(state, 'quitApp') });

  // Im Durchklick-Modus ist die Leiste nicht klickbar -> dauerhaft zeigen, wie man zurückkommt
  if (state.clickThrough) {
    clearTimeout(statusTimer);
    status.textContent = T('bar.clickThroughSticky', { k: hk(state, 'clickThrough') });
    status.classList.add('sticky');
    status.style.display = 'block';
  } else if (status.classList.contains('sticky')) {
    status.classList.remove('sticky');
    status.style.display = 'none';
  }
  if (!shownHotkeyWarning && state.failedHotkeys && state.failedHotkeys.length) {
    shownHotkeyWarning = true;
    const n = state.failedHotkeys.length;
    showStatus(n === 1 ? T('bar.hotkeysBusy1') : T('bar.hotkeysBusyN', { n }), 6000);
  }
});
