'use strict';

const api = window.overlay;
const $ = (id) => document.getElementById(id);

let labels = {};
let defaults = {};
let current = {};        // Entwurf, wird erst mit "Speichern" übernommen
let recording = null;    // Name des Hotkeys, der gerade aufgenommen wird
const notes = {};        // Hinweise pro Zeile: { text, kind }

const MODIFIER_CODES = new Set([16, 17, 18, 91, 92, 93, 225]);

// ---------- Designs ----------
let selectedTheme = 'gold';

function applyTheme(id) {
  document.documentElement.dataset.theme = id;
  for (const card of document.querySelectorAll('.theme-card')) {
    card.classList.toggle('selected', card.dataset.theme === id);
  }
}

function renderThemes(themes) {
  const box = $('themes');
  box.textContent = '';
  for (const t of themes) {
    const card = document.createElement('div');
    card.className = 'theme-card';
    card.dataset.theme = t.id;
    card.title = `Design „${t.name}“ – wird sofort als Vorschau angezeigt`;
    card.innerHTML = '<div class="mock-bar"><span class="mock-dia"></span><span class="mock-field"></span><span class="mock-btn on"></span><span class="mock-btn"></span></div><div class="name"></div>';
    card.querySelector('.name').textContent = t.name;
    card.addEventListener('click', () => {
      selectedTheme = t.id;
      applyTheme(t.id);
      api.previewTheme(t.id); // Overlay zeigt die Vorschau gleich mit
      setMsg('Vorschau – mit „Speichern“ übernehmen.', 'ok');
    });
    box.append(card);
  }
  applyTheme(selectedTheme);
}

// ---------- Version + Updates ----------
function renderUpdate(u) {
  const el = $('aboutStatus');
  let text = '';
  let kind = '';
  const st = u && u.status;
  if (!u || st === 'idle' || st === 'checking') { text = '· wird geprüft …'; }
  else if (st === 'none') { text = '· ✓ neueste Version'; kind = 'ok'; }
  else if (st === 'available') { text = `· Update ${u.latest} verfügbar`; kind = 'new'; }
  else if (st === 'downloading') { text = `· Update ${u.latest} wird geladen … ${u.progress || 0} %`; kind = 'new'; }
  else if (st === 'ready') { text = `· Update ${u.latest} bereit – Neustart folgt`; kind = 'new'; }
  else if (st === 'error') { text = '· Update-Prüfung fehlgeschlagen'; kind = 'warn'; }
  el.textContent = text;
  el.title = st === 'error' && u.error ? u.error : text.replace(/^· /, '');
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

function setMsg(text, kind) {
  const m = $('msg');
  m.textContent = text || '';
  m.className = kind || '';
}

function render() {
  const list = $('list');
  list.textContent = '';
  for (const name of Object.keys(labels)) {
    const row = document.createElement('div');
    row.className = 'row';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = labels[name];

    const key = document.createElement('button');
    key.className = 'key';
    const value = current[name];
    if (recording === name) {
      key.classList.add('recording');
      key.textContent = 'Taste drücken …';
    } else if (value) {
      key.textContent = formatAccelerator(value);
    } else {
      key.classList.add('empty');
      key.textContent = 'kein Hotkey';
    }
    if (notes[name] && notes[name].kind === 'warn') key.classList.add('bad');
    key.title = 'Klicken und neue Tastenkombination drücken';
    key.addEventListener('click', () => startRecording(name));

    const clear = document.createElement('button');
    clear.className = 'icon clear';
    clear.title = 'Hotkey entfernen';
    clear.innerHTML = '<svg viewBox="0 0 12 12"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>';
    clear.addEventListener('click', () => {
      recording = null;
      current[name] = '';
      delete notes[name];
      if (name === 'clickThrough') {
        notes[name] = { text: 'Ohne Hotkey lässt sich Durchklicken nur noch über das Tray-Symbol ausschalten.', kind: 'warn' };
      }
      render();
    });

    const note = document.createElement('div');
    note.className = 'note';
    if (notes[name]) {
      note.textContent = notes[name].text;
      note.classList.add('show', notes[name].kind);
    }

    row.append(label, key, clear, note);
    list.append(row);
  }
}

function startRecording(name) {
  recording = recording === name ? null : name;
  setMsg('');
  render();
}

async function finishRecording(name, accel) {
  recording = null;
  delete notes[name];

  // Schon für eine andere Aktion vergeben? -> dort entfernen
  for (const [other, value] of Object.entries(current)) {
    if (other !== name && value && value.toLowerCase() === accel.toLowerCase()) {
      current[other] = '';
      notes[other] = { text: `Entfernt – jetzt für „${labels[name]}“ verwendet.`, kind: 'info' };
    }
  }
  current[name] = accel;

  const result = await api.testHotkey(accel);
  if (!result.ok && result.reason === 'belegt') {
    notes[name] = { text: 'Wird schon von einem anderen Programm verwendet – funktioniert so evtl. nicht.', kind: 'warn' };
  } else if (!result.ok) {
    notes[name] = { text: 'Diese Kombination wird nicht unterstützt.', kind: 'warn' };
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
    setMsg('Diese Taste wird nicht unterstützt. Bitte eine andere wählen.', 'warn');
    return;
  }
  const isF = /^F\d+$/.test(keyName);
  if (!e.ctrlKey && !e.altKey && !isF) {
    setMsg('Bitte mit Strg oder Alt kombinieren – sonst fehlt die Taste z. B. im WoW-Chat.', 'warn');
    return;
  }
  const parts = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  parts.push(keyName);
  setMsg('');
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
  setMsg('Standard-Hotkeys geladen – zum Übernehmen „Speichern“ klicken.', 'ok');
  render();
});

$('btnCancel').addEventListener('click', () => api.closeSettings());
$('btnX').addEventListener('click', () => api.closeSettings());

$('btnSave').addEventListener('click', async () => {
  recording = null;
  const result = await api.saveHotkeys(current, {
    adblock: $('optAdblock').checked,
    theme: selectedTheme,
    showBookmarks: $('optBookmarks').checked,
    focusMode: $('optFocus').checked,
    focusOpacity: Number($('optFocusOpacity').value) / 100
  });
  // Immer schließen. Belegte Hotkeys meldet die Leiste kurz und sie werden
  // beim nächsten Öffnen hier markiert.
  if (result && result.ok) {
    api.closeSettings();
    return;
  }
  setMsg('Speichern fehlgeschlagen.', 'warn');
  render();
});

(async () => {
  const data = await api.getHotkeys();
  if (!data) return;
  labels = data.labels;
  defaults = data.defaults;
  current = { ...data.hotkeys };
  $('aboutVersion').textContent = `Version ${data.version || '?'}`;
  renderUpdate(data.update);
  // Hotkeys, die beim letzten Anmelden belegt waren, markieren
  for (const name of data.failed || []) {
    notes[name] = { text: 'Gerade von einem anderen Programm belegt – andere Kombination wählen.', kind: 'warn' };
  }
  $('optAdblock').checked = !!(data.options && data.options.adblock);
  $('optBookmarks').checked = !(data.options && data.options.showBookmarks === false);
  $('optFocus').checked = !!(data.options && data.options.focusMode);
  $('optFocusOpacity').value = Math.round(((data.options && data.options.focusOpacity) || 0.3) * 100);
  updateFocusRow();
  selectedTheme = (data.options && data.options.theme) || 'gold';
  renderThemes(data.themes || []);
  render();
})();
