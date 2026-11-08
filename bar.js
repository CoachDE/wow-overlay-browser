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
$('btnBar').addEventListener('click', () => api.toggleBar());
$('btnSettings').addEventListener('click', () => api.openSettings());
$('btnMin').addEventListener('click', () => api.minimize());
$('btnMax').addEventListener('click', () => api.toggleMaximize());
$('miniPlay').addEventListener('click', () => api.playPause());
$('miniRestore').addEventListener('click', () => api.minimize()); // gleicher Schalter: Mini <-> normal
$('miniClose').addEventListener('click', () => api.close());
$('btnClose').addEventListener('click', () => api.close());

opacity.addEventListener('input', () => api.setOpacity(Number(opacity.value) / 100));
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
  if (state.notice) showStatus(state.notice, 5000);
  $('btnBack').disabled = !state.canGoBack;
  opacity.value = Math.round(state.opacity * 100);
  $('btnClick').classList.toggle('on', !!state.clickThrough);
  if (typeof state.cinema === 'boolean') $('btnCinema').classList.toggle('on', state.cinema);

  $('btnClick').title = `Durchklicken an/aus (${hk(state, 'clickThrough')})`;
  $('btnCinema').title = `Kino-Modus an/aus (${hk(state, 'cinema')})`;
  // Ist die Leiste nur wegen der Maus aufgeklappt, macht der Knopf sie wieder dauerhaft sichtbar
  if (state.barVisible) {
    $('btnBar').title = `Leiste ausblenden – erscheint wieder, wenn die Maus an den oberen Rand fährt (${hk(state, 'toggleBar')})`;
    $('barIcon').setAttribute('d', 'M3.5 10 8 5.5l4.5 4.5');
  } else {
    $('btnBar').title = `Leiste dauerhaft anzeigen (${hk(state, 'toggleBar')})`;
    $('barIcon').setAttribute('d', 'M3.5 6 8 10.5 12.5 6');
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
    showStatus(`Belegt, funktioniert nicht: ${state.failedHotkeys.join(', ')}. Ändern über ⚙.`, 10000);
  }
});
