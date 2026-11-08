'use strict';

const api = window.overlay;
const $ = (id) => document.getElementById(id);

let lang = 'de';
const T = (key, vars) => tr(lang, key, vars);
const fmt = (accel) => formatAccelerator(accel, lang);

let hotkeyOrder = [];     // Reihenfolge der Hotkeys (vom Hauptprozess)
let defaults = {};
let current = {};        // Entwurf, wird erst mit "Speichern" übernommen
let recording = null;    // Name des Hotkeys, der gerade aufgenommen wird
const notes = {};        // Hinweise pro Zeile: { key, vars, kind }
let themeList = [];
let languageList = [];
let lastUpdate = null;
let msgState = null;     // { key, vars, kind }

const MODIFIER_CODES = new Set([16, 17, 18, 91, 92, 93, 225]);

// ---------- Sprache ----------
function applyLanguage() {
  applyI18n(document, lang, {
    k: fmt('Control+D'),
    example: `${fmt('Control')} + Alt + ${lang === 'en' ? 'key' : 'Taste'}`
  });
  document.title = T('main.settingsTitle');
  renderLanguages();
  renderThemes();
  renderUpdate(lastUpdate);
  renderMsg();
  render();
}

function renderLanguages() {
  const box = $('languages');
  box.textContent = '';
  for (const l of languageList) {
    const b = document.createElement('button');
    b.className = 'btn small lang' + (l.id === lang ? ' selected' : '');
    b.textContent = l.name;
    b.addEventListener('click', () => {
      if (lang === l.id) return;
      lang = l.id;          // Vorschau sofort hier; übernommen wird beim Speichern
      applyLanguage();
    });
    box.append(b);
  }
}

// ---------- Designs ----------
let selectedTheme = 'gold';

function applyTheme(id) {
  document.documentElement.dataset.theme = id;
  for (const card of document.querySelectorAll('.theme-card')) {
    card.classList.toggle('selected', card.dataset.theme === id);
  }
}

function renderThemes() {
  const box = $('themes');
  box.textContent = '';
  for (const t of themeList) {
    const name = T('theme.' + t.id);
    const card = document.createElement('div');
    card.className = 'theme-card';
    card.dataset.theme = t.id;
    card.title = T('set.themeCard', { n: name });
    card.innerHTML = '<div class="mock-bar"><span class="mock-dia"></span><span class="mock-field"></span><span class="mock-btn on"></span><span class="mock-btn"></span></div><div class="name"></div>';
    card.querySelector('.name').textContent = name;
    card.addEventListener('click', () => {
      selectedTheme = t.id;
      applyTheme(t.id);
      api.previewTheme(t.id); // Overlay zeigt die Vorschau gleich mit
      setMsg('set.preview', null, 'ok');
    });
    box.append(card);
  }
  applyTheme(selectedTheme);
}

// ---------- Version + Updates ----------
function renderUpdate(u) {
  lastUpdate = u;
  const el = $('aboutStatus');
  let text = '';
  let kind = '';
  const st = u && u.status;
  if (!u || st === 'idle' || st === 'checking') { text = T('set.checking'); }
  else if (st === 'none') { text = T('set.latest'); kind = 'ok'; }
  else if (st === 'available') { text = T('set.available', { v: u.latest }); kind = 'new'; }
  else if (st === 'downloading') { text = T('set.downloading', { v: u.latest, p: u.progress || 0 }); kind = 'new'; }
  else if (st === 'ready') { text = T('set.ready', { v: u.latest }); kind = 'new'; }
  else if (st === 'error') { text = T('set.checkFailed'); kind = 'warn'; }
  el.textContent = text;
  el.title = st === 'error' ? errorText(lang, u.error) : text.replace(/^· /, '');
  el.className = kind;
  $('btnCheckUpdate').disabled = st === 'checking' || st === 'downloading';
}
$('btnCheckUpdate').addEventListener('click', () => {
  renderUpdate({ status: 'checking' });
  api.checkUpdates();
});
api.onUpdateState(renderUpdate);

// ---------- Fokus-Modus ----------
function updateFocusRow() {
  $('optFocusOpacityValue').textContent = `${$('optFocusOpacity').value} %`;
  $('optFocusOpacity').closest('.range-row').classList.toggle('disabled', !$('optFocus').checked);
}
$('optFocus').addEventListener('change', updateFocusRow);
$('optFocusOpacity').addEventListener('input', updateFocusRow);

// ---------- Hinweiszeile ----------
function setMsg(key, vars, kind) {
  msgState = key ? { key, vars, kind } : null;
  renderMsg();
}
function renderMsg() {
  const m = $('msg');
  m.textContent = msgState ? T(msgState.key, msgState.vars) : '';
  m.className = msgState ? (msgState.kind || '') : '';
}

// ---------- Hotkey-Liste ----------
function render() {
  const list = $('list');
  list.textContent = '';
  for (const name of hotkeyOrder) {
    const row = document.createElement('div');
    row.className = 'row';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = T('hk.' + name);

    const key = document.createElement('button');
    key.className = 'key';
    const value = current[name];
    if (recording === name) {
      key.classList.add('recording');
      key.textContent = T('set.pressKey');
    } else if (value) {
      key.textContent = fmt(value);
    } else {
      key.classList.add('empty');
      key.textContent = T('set.noHotkey');
    }
    if (notes[name] && notes[name].kind === 'warn') key.classList.add('bad');
    key.title = T('set.keyTitle');
    key.addEventListener('click', () => startRecording(name));

    const clear = document.createElement('button');
    clear.className = 'icon clear';
    clear.title = T('set.clearTitle');
    clear.innerHTML = '<svg viewBox="0 0 12 12"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>';
    clear.addEventListener('click', () => {
      recording = null;
      current[name] = '';
      delete notes[name];
      if (name === 'clickThrough') notes[name] = { key: 'set.noteClickThrough', kind: 'warn' };
      render();
    });

    const note = document.createElement('div');
    note.className = 'note';
    if (notes[name]) {
      note.textContent = T(notes[name].key, notes[name].vars);
      note.classList.add('show', notes[name].kind);
    }

    row.append(label, key, clear, note);
    list.append(row);
  }
}

function startRecording(name) {
  recording = recording === name ? null : name;
  setMsg(null);
  render();
}

async function finishRecording(name, accel) {
  recording = null;
  delete notes[name];

  // Schon für eine andere Aktion vergeben? -> dort entfernen
  for (const [other, value] of Object.entries(current)) {
    if (other !== name && value && value.toLowerCase() === accel.toLowerCase()) {
      current[other] = '';
      notes[other] = { key: 'set.noteMoved', vars: { n: T('hk.' + name) }, kind: 'info' };
    }
  }
  current[name] = accel;

  const result = await api.testHotkey(accel);
  if (!result.ok && result.reason === 'belegt') {
    notes[name] = { key: 'set.noteBusy', kind: 'warn' };
  } else if (!result.ok) {
    notes[name] = { key: 'set.noteInvalid', kind: 'warn' };
    current[name] = '';
  }
  render();
}

document.addEventListener('keydown', (e) => {
  if (!recording) {
    if (e.key === 'Escape') api.closeSettings();
    return;
  }
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    recording = null;
    render();
    return;
  }
  if (MODIFIER_CODES.has(e.keyCode)) return; // auf die eigentliche Taste warten

  const keyName = keyCodeToName(e.keyCode);
  if (!keyName) {
    setMsg('set.keyUnsupported', null, 'warn');
    return;
  }
  const isF = /^F\d+$/.test(keyName);
  if (!e.ctrlKey && !e.altKey && !isF) {
    setMsg('set.needModifier', { ctrl: fmt('Control') }, 'warn');
    return;
  }
  const parts = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  parts.push(keyName);
  setMsg(null);
  finishRecording(recording, parts.join('+'));
}, true);

// Klick außerhalb beendet die Aufnahme
document.addEventListener('mousedown', (e) => {
  if (recording && !e.target.closest('.key')) {
    recording = null;
    render();
  }
});

$('btnDefaults').addEventListener('click', () => {
  current = { ...defaults };
  recording = null;
  for (const k of Object.keys(notes)) delete notes[k];
  setMsg('set.defaultsLoaded', null, 'ok');
  render();
});

$('btnCancel').addEventListener('click', () => api.closeSettings());
$('btnTour').addEventListener('click', () => api.startTour());
$('btnX').addEventListener('click', () => api.closeSettings());

$('btnSave').addEventListener('click', async () => {
  recording = null;
  const result = await api.saveHotkeys(current, {
    adblock: $('optAdblock').checked,
    theme: selectedTheme,
    showBookmarks: $('optBookmarks').checked,
    focusMode: $('optFocus').checked,
    focusOpacity: Number($('optFocusOpacity').value) / 100,
    language: lang
  });
  // Immer schließen. Belegte Hotkeys meldet die Leiste kurz und sie werden
  // beim nächsten Öffnen hier markiert.
  if (result && result.ok) {
    api.closeSettings();
    return;
  }
  setMsg('set.saveFailed', null, 'warn');
  render();
});

(async () => {
  const data = await api.getHotkeys();
  if (!data) return;
  lang = (data.options && data.options.language) || 'de';
  hotkeyOrder = Object.keys(data.labels || {});
  defaults = data.defaults;
  current = { ...data.hotkeys };
  themeList = data.themes || [];
  languageList = data.languages || [];
  $('aboutVersion').textContent = `Version ${data.version || '?'}`;
  // Hotkeys, die beim letzten Anmelden belegt waren, markieren
  for (const name of data.failed || []) notes[name] = { key: 'set.noteFailed', kind: 'warn' };
  $('optAdblock').checked = !!(data.options && data.options.adblock);
  $('optBookmarks').checked = !(data.options && data.options.showBookmarks === false);
  $('optFocus').checked = !!(data.options && data.options.focusMode);
  $('optFocusOpacity').value = Math.round(((data.options && data.options.focusOpacity) || 0.3) * 100);
  updateFocusRow();
  selectedTheme = (data.options && data.options.theme) || 'gold';
  lastUpdate = data.update;
  applyLanguage();
})();
