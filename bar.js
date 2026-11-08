'use strict';

const $ = (id) => document.getElementById(id);
const api = window.overlay;

const urlInput = $('url');
const opacity = $('opacity');
const status = $('status');
let editingUrl = false;
let statusTimer = null;

$('urlForm').addEventListener('submit', (e) => {
  e.preventDefault();
  api.navigate(urlInput.value);
  urlInput.blur();
});
urlInput.addEventListener('focus', () => { editingUrl = true; urlInput.select(); });
urlInput.addEventListener('blur', () => { editingUrl = false; });

$('btnBack').addEventListener('click', () => api.back());
$('btnHome').addEventListener('click', () => api.home());
$('btnReload').addEventListener('click', () => api.reload());
$('btnShorts').addEventListener('click', () => api.shorts());
$('btnCinema').addEventListener('click', () => api.cinema());
$('btnClick').addEventListener('click', () => api.toggleClickThrough());
$('btnFocus').addEventListener('click', () => api.toggleFocus());
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
  b.classList.toggle('error', u.status === 'error' || (u.status === 'ready' && !!u.mandatory));
  b.disabled = u.status === 'downloading';
  if (u.status === 'available') {
    b.textContent = `⬆ Update ${u.latest}`;
    b.title = u.selfUpdate
      ? `Version ${u.latest} herunterladen (du hast ${u.current})`
      : `Version ${u.latest} ist verfügbar – öffnet die Download-Seite`;
  } else if (u.status === 'downloading') {
    b.textContent = `⬇ ${u.mandatory ? 'Pflicht-Update ' : 'Update '}${u.progress || 0} %`;
    b.title = `Version ${u.latest} wird im Hintergrund heruntergeladen …`;
  } else if (u.status === 'ready' && u.mandatory) {
    b.textContent = u.countdown ? `↻ Pflicht-Update – Neustart in ${u.countdown} s` : '↻ Pflicht-Update – jetzt neu starten';
    b.title = `Pflicht-Update auf ${u.latest}. Klick: sofort neu starten`;
  } else if (u.status === 'ready') {
    b.textContent = '↻ Neu starten';
    b.title = `Version ${u.latest} ist bereit. Klick: jetzt installieren – sonst automatisch beim Beenden`;
  } else {
    b.textContent = '⚠ Update fehlgeschlagen';
    b.title = `${u.error || 'Fehler'} – Klick: erneut versuchen`;
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
    x.title = 'Tab schließen (Strg+W)';
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
    el.querySelector('.title').textContent = t.title || 'Neuer Tab';
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

function renderBookmarks(state) {
  if (bmDragId || bmEditingId) { bmPendingState = state; return; }
  const list = state.bookmarks || [];
  bmData = list;
  $('bookmarks').hidden = !state.showBookmarks;
  const seen = new Set();
  list.forEach((b, i) => {
    seen.add(b.id);
    let el = bmEls.get(b.id);
    if (!el) { el = makeBmEl(b.id); bmEls.set(b.id, el); }
    if (bmList.children[i] !== el) bmList.insertBefore(el, bmList.children[i] || null);
    el.querySelector('.title').textContent = b.title;
    el.title = `${b.title}\n${b.url}\nKlick: öffnen · Mittelklick: neuer Tab · Rechtsklick: mehr · Ziehen: sortieren`;
    bmIcon(el, b.favicon || '');
  });
  for (const [id, el] of bmEls) {
    if (!seen.has(id)) { el.remove(); bmEls.delete(id); }
  }
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

let shownHotkeyWarning = false;
const hk = (state, name) => (state.hotkeys && state.hotkeys[name] ? formatAccelerator(state.hotkeys[name]) : 'kein Hotkey');

api.onState((state) => {
  if (state.hotkeysChanged) shownHotkeyWarning = false;
  if (state.theme && document.documentElement.dataset.theme !== state.theme) {
    document.documentElement.dataset.theme = state.theme;
  }
  $('btnShorts').classList.toggle('on', !!state.shortsMode);
  $('btnShorts').title = state.shortsMode
    ? `Shorts – weiter: ${hk(state, 'shortsNext')}, zurück: ${hk(state, 'shortsPrev')}`
    : 'YouTube Shorts öffnen (Fenster wird hochkant)';
  if (!editingUrl) urlInput.value = state.url || '';
  urlInput.placeholder = state.activeTab === 'yt'
    ? 'YouTube-Link einfügen oder suchen …'
    : 'Adresse eingeben oder mit Google suchen …';
  $('btnHome').title = state.activeTab === 'yt' ? 'YouTube-Startseite' : 'Startseite (Google)';
  if (state.tabs) renderTabs(state);
  renderUpdate(state.update);
  if (state.bookmarks) renderBookmarks(state);
  $('btnStar').classList.toggle('saved', !!state.bookmarked);
  $('btnStar').title = state.bookmarked ? 'Lesezeichen entfernen (Strg+D)' : 'Als Lesezeichen speichern (Strg+D)';
  if (state.notice) showStatus(state.notice, 5000);
  $('btnBack').disabled = !state.canGoBack;
  opacity.value = Math.round(state.opacity * 100);
  $('btnClick').classList.toggle('on', !!state.clickThrough);
  if (typeof state.cinema === 'boolean') $('btnCinema').classList.toggle('on', state.cinema);

  $('btnClick').title = `Durchklicken an/aus (${hk(state, 'clickThrough')})`;
  // Fokus-Modus: offenes Auge = an, durchgestrichen = aus
  $('btnFocus').classList.toggle('on', !!state.focusMode);
  $('focusSlash').style.display = state.focusMode ? 'none' : '';
  $('btnFocus').title = state.focusMode
    ? `Fokus-Modus AN – ohne Maus ${Math.round((state.focusOpacity || 0.3) * 100)} % sichtbar. Klick: ausschalten (${hk(state, 'toggleFocus')})`
    : `Fokus-Modus: Overlay wird durchsichtig, wenn die Maus nicht darüber ist. Klick: einschalten (${hk(state, 'toggleFocus')})`;
  $('btnCinema').title = `Kino-Modus an/aus (${hk(state, 'cinema')})`;
  // Ist die Leiste nur wegen der Maus aufgeklappt, macht der Knopf sie wieder dauerhaft sichtbar
  if (state.barVisible) {
    $('btnBar').title = `Leiste ausblenden – erscheint wieder, wenn die Maus an den oberen Rand fährt (${hk(state, 'toggleBar')})`;
    $('barIcon').setAttribute('d', 'M3.5 10 8 5.5l4.5 4.5');
  } else {
    $('btnBar').title = `Leiste dauerhaft anzeigen (${hk(state, 'toggleBar')})`;
    $('barIcon').setAttribute('d', 'M3.5 6 8 10.5 12.5 6');
  }

  // Lautstärke
  if (typeof state.volume === 'number') {
    currentVolume = state.volume;
    if (!volumeDragging) volume.value = state.volume;
    $('volumeValue').textContent = state.muted ? 'aus' : state.volume;
    const d = volumeIconPath(state.volume, state.muted);
    document.querySelectorAll('.vol-icon').forEach((p) => p.setAttribute('d', d));
    for (const id of ['btnVol', 'miniVol']) {
      $(id).classList.toggle('muted', !!state.muted);
      $(id).title = `${state.muted ? 'Ton an' : 'Stumm'} (${hk(state, 'mute')}) – Lautstärke ${state.volume} %, Mausrad oder ${hk(state, 'volumeUp')} / ${hk(state, 'volumeDown')}`;
    }
  }

  // Mini-Leiste
  document.body.classList.toggle('mini', !!state.miniMode);
  $('miniTitle').textContent = state.ytTitle || 'YouTube';
  $('miniTitle').title = state.ytTitle || '';
  $('miniTitle').classList.toggle('paused', !state.ytPlaying);
  $('miniPlayIcon').setAttribute('d', state.ytPlaying ? 'M5 3.5v9M11 3.5v9' : 'M5 3.5v9l7-4.5Z');
  $('miniPlay').title = `${state.ytPlaying ? 'Pause' : 'Abspielen'} (${hk(state, 'playPause')})`;
  $('miniRestore').title = `Wiederherstellen (${hk(state, 'toggleMini')})`;
  $('miniClose').title = `Beenden (${hk(state, 'quitApp')})`;
  $('btnMin').title = `Zur Mini-Leiste verkleinern – bleibt über WoW, Video läuft weiter (${hk(state, 'toggleMini')})`;
  $('btnMax').title = state.maximized
    ? `Normalgröße (${hk(state, 'toggleMaximize')})`
    : `Maximieren – Overlay füllt den Bildschirm (${hk(state, 'toggleMaximize')})`;
  $('maxIcon').setAttribute('d', state.maximized
    ? 'M5.5 3.5h7v7M3.5 5.5h7v7h-7Z'
    : 'M3.5 3.5h9v9h-9Z');
  $('btnClose').title = `Beenden (${hk(state, 'quitApp')})`;

  // Im Durchklick-Modus ist die Leiste nicht klickbar -> dauerhaft zeigen, wie man zurückkommt
  if (state.clickThrough) {
    clearTimeout(statusTimer);
    status.textContent = `Durchklicken an – ${hk(state, 'clickThrough')} zum Ausschalten (oder Tray-Symbol)`;
    status.classList.add('sticky');
    status.style.display = 'block';
  } else if (status.classList.contains('sticky')) {
    status.classList.remove('sticky');
    status.style.display = 'none';
  }
  if (!shownHotkeyWarning && state.failedHotkeys && state.failedHotkeys.length) {
    shownHotkeyWarning = true;
    const n = state.failedHotkeys.length;
    showStatus(`${n === 1 ? '1 Hotkey ist' : `${n} Hotkeys sind`} von einem anderen Programm belegt – Details unter ✱ Einstellungen`, 6000);
  }
});
