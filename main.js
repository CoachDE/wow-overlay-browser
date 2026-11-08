'use strict';

const { app, BrowserWindow, WebContentsView, globalShortcut, ipcMain, shell, screen, Tray, Menu, nativeImage, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { formatAccelerator } = require('./keys.js');
const { tr, errorText, LANGUAGES } = require('./i18n.js');
// Text in der eingestellten Sprache
const L = (key, vars) => tr(settings && settings.state ? settings.state.language : 'de', key, vars);
const LANG_IDS = new Set(LANGUAGES.map((l) => l.id));
const { YouTubeAdblock } = require('./adblock.js');
const { Updater, finishUpdate, cleanupDownloads, CURRENT_VERSION, RELEASES_PAGE, FINISH_FLAG, NO_LAUNCH_FLAG } = require('./update.js');

// Update abschließen: Diese (neue) Version wurde von der alten mit "--finish-update" gestartet.
// Sie ersetzt die alte .exe, startet sie neu und beendet sich – sonst passiert hier nichts.
const finishIdx = process.argv.indexOf(FINISH_FLAG);
if (finishIdx !== -1) {
  finishUpdate(app, process.argv[finishIdx + 1], Number(process.argv[finishIdx + 2]), !process.argv.includes(NO_LAUNCH_FLAG));
  return;
}

const UPDATE_CHECK_DELAY = 8000;                  // erste Prüfung kurz nach dem Start
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000;     // danach alle 30 Minuten
const UPDATE_CHECK_ON_USE = 10 * 60 * 1000;       // zusätzlich beim Benutzen, wenn letzte Prüfung > 10 min her

const ICON_PATH = path.join(__dirname, 'icon.png');

// ---------------------------------------------------------------------------
// Grundkonstanten
// ---------------------------------------------------------------------------
const BAR_HEIGHT = 36;     // Höhe der Steuerleiste oben
const BORDER = 4;          // Rand rund um das Video (damit man die Fenstergröße ziehen kann)
const MIN_OPACITY = 0.2;
const MAX_OPACITY = 1.0;
const OPACITY_STEP = 0.1;
const SEEK_SECONDS = 10;
const VOLUME_STEP = 10;      // Lautstärke-Schritt für die Hotkeys (Prozent)
const HOME_URL = 'https://www.youtube.com/';
const SHORTS_URL = 'https://www.youtube.com/shorts';
const PEEK_ZONE = 12;        // Pixel am oberen Rand, die die ausgeblendete Leiste wieder aufklappen
const PEEK_HIDE_DELAY = 700; // ms, bis die aufgeklappte Leiste nach dem Wegfahren wieder verschwindet
const FOCUS_FADE_DELAY = 1000;  // Fokus-Modus: so lange (ms) muss die Maus weg sein, bis abgeblendet wird
const FOCUS_FADE_MS = 220;      // Dauer der Überblendung
const FOCUS_MIN = 0.1;
const FOCUS_MAX = 0.9;
const TAB_HEIGHT = 28;       // Höhe der Tab-Leiste unter der Steuerleiste
const TOP_HEIGHT = BAR_HEIGHT + TAB_HEIGHT;
const BM_HEIGHT = 24;        // Höhe der Lesezeichen-Leiste
const MAX_BOOKMARKS = 60;
const START_PAGE = 'https://www.google.com/';
const SEARCH_URL = 'https://www.google.com/search?q=';
const MAX_TABS = 12;
const SPLIT_GAP = 6;          // Breite des Trennbalkens der geteilten Ansicht
const SPLIT_MIN = 0.2;
const SPLIT_MAX = 0.8;
const MINI_WIDTH = 280;      // Mini-Leiste (minimiert, bleibt über WoW)
const MINI_HEIGHT = BAR_HEIGHT;
const MIN_WIDTH = 240;
const MIN_HEIGHT = 160;
// Designs (die Farben stehen in themes.css)
const THEMES = [
  { id: 'gold', name: 'Gold' },
  { id: 'frost', name: 'Frost' },
  { id: 'emerald', name: 'Smaragd' },
  { id: 'arcane', name: 'Arkan' },
  { id: 'blood', name: 'Blut' },
  { id: 'plain', name: 'Schlicht' }
];
const THEME_IDS = new Set(THEMES.map((t) => t.id));         // Browser-Tabs zusätzlich zum YouTube-Tab
// Rechte, die Websites bekommen dürfen – alles andere (Kamera, Mikro, Standort,
// Benachrichtigungen …) wird abgelehnt.
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock']);

const DEFAULT_HOTKEYS = {
  toggleVisible: 'Control+Alt+Y',
  quitApp: 'Control+Alt+X',
  toggleMaximize: 'Control+Alt+G',
  toggleMini: 'Control+Alt+H',
  toggleFocus: 'Control+Alt+T',
  toggleSplit: 'Control+Alt+S',
  playPause: 'Control+Alt+K',
  seekBack: 'Control+Alt+J',
  seekForward: 'Control+Alt+L',
  mute: 'Control+Alt+N',
  volumeUp: 'Control+Alt+.',
  volumeDown: 'Control+Alt+,',
  clickThrough: 'Control+Alt+D',
  toggleBar: 'Control+Alt+B',
  cinema: 'Control+Alt+F',
  opacityUp: 'Control+Alt+PageUp',
  opacityDown: 'Control+Alt+PageDown',
  shortsNext: 'Control+Alt+Down',
  shortsPrev: 'Control+Alt+Up'
};

// Anzeigenamen der Hotkeys (Reihenfolge = Reihenfolge im Einstellungsfenster)
const HOTKEY_LABELS = {
  toggleVisible: 'Overlay ein-/ausblenden',
  quitApp: 'Overlay beenden',
  toggleMaximize: 'Maximieren / Normalgröße',
  toggleMini: 'Mini-Leiste / Wiederherstellen',
  toggleFocus: 'Fokus-Modus an/aus',
  toggleSplit: 'Geteilte Ansicht an/aus',
  playPause: 'Play / Pause',
  seekBack: '10 Sekunden zurück',
  seekForward: '10 Sekunden vor',
  mute: 'Ton an/aus',
  volumeUp: 'Lauter',
  volumeDown: 'Leiser',
  shortsNext: 'Nächstes Short',
  shortsPrev: 'Vorheriges Short',
  cinema: 'Kino-Modus',
  clickThrough: 'Durchklicken',
  toggleBar: 'Leiste ein-/ausblenden',
  opacityUp: 'Deckkraft höher',
  opacityDown: 'Deckkraft niedriger'
};

const DEFAULT_STATE = {
  bounds: null,            // wird beim ersten Start berechnet
  shortsBounds: null,      // eigene (hochkant) Fenstergröße für Shorts
  opacity: 1.0,
  barVisible: true,
  adblock: true,           // Werbeblocker an/aus
  theme: 'gold',           // Design
  language: null,          // 'de' | 'en' (null = beim ersten Start nach Windows-Sprache)
  tourDone: false,         // Tour durch die Leiste schon gesehen/übersprungen
  focusMode: false,        // Fokus-Modus: ohne Maus durchsichtig
  splitRatio: 0.5,         // geteilte Ansicht: Anteil der linken Seite
  focusOpacity: 0.3,       // Deckkraft im Fokus-Modus, wenn die Maus nicht über dem Overlay ist
  volume: null,            // YouTube-Lautstärke 0–100 (null = noch nie eingestellt)
  tabs: [],                // offene Browser-Tabs (Adressen), werden beim Start wiederhergestellt
  bookmarks: [],           // Lesezeichen: { id, title, url, favicon }
  showBookmarks: true,     // Lesezeichen-Leiste anzeigen (sobald es Lesezeichen gibt)
  lastUrl: HOME_URL
};

// Google/YouTube behandeln "Electron" im User-Agent teils wie einen unsicheren Browser.
// Deshalb entfernen wir die Electron- und App-Kennung und sehen aus wie normales Chrome.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/\S+/i, '')
  .replace(/\syoutube-overlay\/\S+/i, '');

// Feste Windows-Kennung der App (für Taskleiste/angeheftetes Symbol, siehe setupTaskbarPin)
const APP_USER_MODEL_ID = 'CoachDE.WowOverlayBrowser';
if (process.platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID);

// Nur eine Instanz erlauben
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ---------------------------------------------------------------------------
// Einstellungen (settings.json im Benutzerordner der App)
// ---------------------------------------------------------------------------
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch (_) {
    raw = {};
  }
  const settings = {
    hotkeys: sanitizeHotkeys(raw.hotkeys),
    state: { ...DEFAULT_STATE, ...(raw.state || {}) }
  };
  const o = Number(settings.state.opacity);
  settings.state.opacity = Number.isFinite(o) ? clamp(o, MIN_OPACITY, MAX_OPACITY) : 1.0;
  if (!THEME_IDS.has(settings.state.theme)) settings.state.theme = 'gold';
  if (!LANG_IDS.has(settings.state.language)) {
    let loc = '';
    try { loc = app.getLocale() || ''; } catch (_) { /* vor "ready" nicht verfügbar */ }
    settings.state.language = /^de\b/i.test(loc) ? 'de' : 'en';
  }
  settings.state.focusMode = settings.state.focusMode === true;
  {
    const r = Number(settings.state.splitRatio);
    settings.state.splitRatio = Number.isFinite(r) ? clamp(r, SPLIT_MIN, SPLIT_MAX) : 0.5;
  }
  {
    const f = Number(settings.state.focusOpacity);
    settings.state.focusOpacity = Number.isFinite(f) ? clamp(f, FOCUS_MIN, FOCUS_MAX) : 0.3;
  }
  settings.state.bookmarks = sanitizeBookmarks(settings.state.bookmarks);
  if (typeof settings.state.lastUrl !== 'string' || !isAllowedInApp(settings.state.lastUrl)) {
    settings.state.lastUrl = HOME_URL;
  }
  return settings;
}

let saveTimer = null;
function saveSettingsSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSettingsNow, 500);
}

function saveSettingsNow() {
  clearTimeout(saveTimer);
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Einstellungen konnten nicht gespeichert werden:', err);
  }
}

function sanitizeBookmarks(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const b of list) {
    if (!b || typeof b.url !== 'string' || !/^https?:\/\//i.test(b.url)) continue;
    out.push({
      id: typeof b.id === 'string' && b.id ? b.id : Math.random().toString(36).slice(2),
      title: String(b.title || b.url).slice(0, 200),
      url: b.url,
      favicon: typeof b.favicon === 'string' ? b.favicon : ''
    });
    if (out.length >= MAX_BOOKMARKS) break;
  }
  return out;
}

function sanitizeHotkeys(input) {
  const out = { ...DEFAULT_HOTKEYS };
  if (input && typeof input === 'object') {
    for (const name of Object.keys(DEFAULT_HOTKEYS)) {
      if (typeof input[name] === 'string') out[name] = input[name].trim();
    }
  }
  return out;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// ---------------------------------------------------------------------------
// URL-Hilfen
// ---------------------------------------------------------------------------
const IN_APP_HOSTS = [
  'youtube.com', 'youtu.be', 'youtube-nocookie.com', 'google.com', 'google.de',
  'gstatic.com', 'googleusercontent.com', 'ytimg.com', 'ggpht.com', 'googlevideo.com'
];

function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

function isAllowedInApp(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return IN_APP_HOSTS.some((d) => hostMatches(u.hostname, d));
  } catch (_) {
    return false;
  }
}

// Macht aus beliebiger Eingabe eine YouTube-Adresse:
// volle Links, youtu.be-Kurzlinks, Shorts, reine Video-IDs oder Suchbegriffe.
function inputToUrl(input) {
  const text = String(input || '').trim();
  if (!text) return HOME_URL;

  // Reine Video-ID (11 Zeichen)
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) {
    return `https://www.youtube.com/watch?v=${text}`;
  }

  let candidate = text;
  if (!/^https?:\/\//i.test(candidate) && /^(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(candidate)) {
    candidate = 'https://' + candidate;
  }

  try {
    const u = new URL(candidate);
    const host = u.hostname.toLowerCase();
    if (hostMatches(host, 'youtu.be')) {
      const id = u.pathname.slice(1).split('/')[0];
      const t = u.searchParams.get('t');
      if (id) return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}${t ? `&t=${encodeURIComponent(t)}` : ''}`;
    }
    if (hostMatches(host, 'youtube.com')) {
      u.protocol = 'https:';
      if (host === 'm.youtube.com' || host === 'youtube.com') u.hostname = 'www.youtube.com';
      return u.toString();
    }
  } catch (_) {
    // keine gültige URL -> Suche
  }

  return `https://www.youtube.com/results?search_query=${encodeURIComponent(text)}`;
}

function isShortsUrl(url) {
  try {
    const u = new URL(url);
    return hostMatches(u.hostname, 'youtube.com') && /^\/shorts(\/|$)/.test(u.pathname);
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Fenster
// ---------------------------------------------------------------------------
let settings;
let win = null;
let ytView = null;
let clickThrough = false;
let shortsMode = false;       // Fenster ist gerade hochkant für Shorts
let settingsWin = null;
let hotkeysSuspended = false;
let tray = null;
let maximized = false;        // Overlay füllt gerade den ganzen Bildschirm
let adblock = null;
let updater = null;
let updateAnnounced = null;   // Version, für die der Hinweis schon gezeigt wurde
let manualUpdateCheck = false;
let updatePopup = null;       // Fenster "Neue Version verfügbar"
let updateRequested = false;  // im Pop-up wurde "Jetzt aktualisieren" geklickt
let tabs = [];                // Browser-Tabs: { id, view, title, favicon, loading, pendingUrl }
let activeTab = 'yt';         // 'yt' = YouTube-Tab, sonst die id eines Browser-Tabs
// Geteilte Ansicht: links/rechts je ein Tab ('yt' oder id eines Browser-Tabs)
const split = { on: false, left: 'yt', right: null };
let splitDivider = null;      // Position des Trennbalkens (für die Leiste)
let splitDrag = null;         // laufendes Ziehen des Trennbalkens
let lastBrowserTab = null;
let twitch = null;            // Twitch-Modus: { channel, player, chat } (Tab-ids)
let tourActive = false;       // Tour durch die Leiste läuft
let nextTabId = 1;
let previewTheme = null;      // Design-Vorschau, solange die Einstellungen offen sind
let miniMode = false;         // Overlay ist zur Mini-Leiste verkleinert
let focusFaded = false;       // Fokus-Modus: gerade abgeblendet
let focusLeftAt = 0;
let fadeTimer = null;
let shownOpacity = null;      // aktuell angezeigte Deckkraft (für weiche Übergänge)
let ytPlaying = false;
let ytMuted = false;
let volumeSetAt = 0;          // Zeitpunkt der letzten eigenen Lautstärke-Änderung
let volumeVideoId = null;     // Video, auf das die Lautstärke zuletzt angewendet wurde
let lastAppliedVolume = null; // zuletzt an den Player gegebener Wert
let syncVideoId = null;       // Video, das der Abgleich zuletzt gesehen hat
let syncVideoAt = 0;
let volumeTimer = null;
let barPeek = false;          // Leiste ist ausgeblendet, aber wegen der Maus kurz aufgeklappt
let peekLeftAt = 0;
let peekTimer = null;
const failedHotkeys = [];
const failedHotkeyNames = [];

function defaultBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  const width = 640;
  const height = 360 + TOP_HEIGHT + BORDER;
  return {
    x: area.x + area.width - width - 40,
    y: area.y + 40,
    width,
    height
  };
}

// Prüft, ob gespeicherte Position noch auf einem vorhandenen Bildschirm liegt
function boundsVisible(b) {
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) return false;
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x < a.x + a.width - 50 && b.x + b.width > a.x + 50 &&
           b.y < a.y + a.height - 30 && b.y + 30 > a.y;
  });
}

function createWindow() {
  const bounds = boundsVisible(settings.state.bounds) ? settings.state.bounds : defaultBounds();

  win = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    frame: false,
    resizable: true,
    fullscreenable: false,
    maximizable: false,
    backgroundColor: '#0f0f0f',
    title: 'YouTube Overlay',
    icon: ICON_PATH,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // "screen-saver" ist die höchste Ebene – liegt auch über randlosen Vollbild-Spielen
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setOpacity(settings.state.opacity);
  setupTaskbarPin();

  win.loadFile(path.join(__dirname, 'bar.html'));

  ytView = new WebContentsView({
    webPreferences: {
      partition: 'persist:youtube',   // Login, Cookie-Zustimmung usw. bleiben erhalten
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,    // Video + Werbe-Skipper laufen weiter, wenn ein anderer Tab offen ist
      preload: path.join(__dirname, 'yt-preload.js') // meldet YouTube "Vollbild verfügbar"
    }
  });
  ytView.setBackgroundColor('#0f0f0f');
  win.contentView.addChildView(ytView);
  layout();

  const yt = ytView.webContents;

  setupSession(yt.session);

  // Links, die neue Fenster öffnen wollen: YouTube-Links im YouTube-Tab, alles andere in einem neuen Browser-Tab
  yt.setWindowOpenHandler(({ url }) => {
    if (isAllowedInApp(url)) {
      yt.loadURL(url);
    } else {
      openExternalLink(url);
    }
    return { action: 'deny' };
  });

  // Der YouTube-Tab bleibt bei YouTube: fremde Seiten öffnen sich in einem Browser-Tab
  yt.on('will-navigate', (event, url) => {
    if (!isAllowedInApp(url)) {
      event.preventDefault();
      openExternalLink(url);
    }
  });
  attachCommonHandlers(yt);
  yt.on('media-started-playing', () => {
    ytPlaying = true;
    onVideoMaybeChanged();
    sendState();
  });
  yt.on('media-paused', () => { ytPlaying = false; sendState(); });
  yt.on('page-title-updated', () => sendState());

  const onUrlChange = () => {
    const url = yt.getURL();
    if (isAllowedInApp(url)) {
      settings.state.lastUrl = url;
      saveSettingsSoon();
    }
    if (activeTab === 'yt') applyShortsMode(isShortsUrl(url));
    onVideoMaybeChanged();
    sendState();
  };
  // Seite komplett neu geladen = neuer Player -> Lautstärke auch für dasselbe Video neu setzen
  yt.on('did-navigate', () => { volumeVideoId = null; });
  yt.on('did-navigate', onUrlChange);
  yt.on('did-navigate-in-page', onUrlChange);

  // YouTube-Vollbild: Das Fenster bleibt so groß wie es ist, nur das Video füllt das Overlay.
  // (fullscreenable: false verhindert, dass das Overlay den ganzen Bildschirm verdeckt)
  yt.on('enter-html-full-screen', () => sendState({ cinema: true }));
  yt.on('leave-html-full-screen', () => sendState({ cinema: false }));

  // Werbeblocker vorbereiten, dann YouTube laden (wartet höchstens 4 s auf die Filterlisten)
  adblock = new YouTubeAdblock({
    session: yt.session,
    webContents: yt,
    cacheFile: path.join(app.getPath('userData'), 'adblock-engine.bin'),
    enabled: settings.state.adblock !== false
  });
  adblock.init(4000).then(() => {
    if (ytView && !yt.isDestroyed()) yt.loadURL(settings.state.lastUrl);
    restoreTabs();
    sendState();
  });

  // Tastenkürzel auch, wenn die Steuerleiste (z. B. das Adressfeld) den Fokus hat
  attachShortcuts(win.webContents);

  win.on('resize', () => { layout(); rememberBounds(); });
  win.on('move', rememberBounds);

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.on('did-finish-load', () => sendState());

  peekTimer = setInterval(() => { checkBarPeek(); checkFocusMode(); }, 100);
  volumeTimer = setInterval(syncVolumeFromPlayer, 1500);

  win.on('show', updateTray);
  win.on('hide', updateTray);

  win.on('closed', () => {
    app.quit();   // auch wenn noch ein Pop-up offen ist
    clearInterval(peekTimer);
    clearInterval(volumeTimer);
    win = null;
    ytView = null;
  });
}

// An die Taskleiste anheften: Die Einzel-.exe entpackt sich beim Start in einen Temp-Ordner.
// Ohne diese Angaben würde Windows beim Anheften den Temp-Pfad speichern (der nach dem Beenden
// verschwindet). So startet das angeheftete Symbol immer die eigentliche .exe (z. B. auf dem Desktop),
// und das laufende Fenster wird demselben Symbol zugeordnet.
function setupTaskbarPin() {
  const exe = process.env.PORTABLE_EXECUTABLE_FILE;
  if (!exe || process.platform !== 'win32' || !win) return;
  try {
    win.setAppDetails({
      appId: APP_USER_MODEL_ID,
      appIconPath: exe,
      appIconIndex: 0,
      relaunchCommand: `"${exe}"`,
      relaunchDisplayName: 'YouTube Overlay'
    });
  } catch (err) {
    console.warn('Taskleisten-Angaben konnten nicht gesetzt werden:', err && err.message);
  }
}

function layout() {
  if (!win || !ytView) return;
  const [w, h] = win.getContentSize();
  const top = barShown() ? topHeight() : BORDER;
  const bounds = {
    x: BORDER,
    y: top,
    width: Math.max(0, w - BORDER * 2),
    height: Math.max(0, h - top - BORDER)
  };
  // Tour: Seiten ausblenden, damit die Erklärungen unter der Leiste Platz haben
  if (tourActive) {
    splitDivider = null;
    for (const [, view] of allViews()) { view.setBounds(bounds); view.setVisible(false); }
    return;
  }
  // Geteilte Ansicht: zwei Tabs nebeneinander, dazwischen der Trennbalken
  if (splitActive()) {
    const avail = Math.max(0, bounds.width - SPLIT_GAP);
    const leftW = Math.round(avail * settings.state.splitRatio);
    const leftRect = { x: bounds.x, y: bounds.y, width: leftW, height: bounds.height };
    const rightRect = { x: bounds.x + leftW + SPLIT_GAP, y: bounds.y, width: Math.max(0, avail - leftW), height: bounds.height };
    splitDivider = { x: bounds.x + leftW, y: bounds.y, width: SPLIT_GAP, height: bounds.height };
    for (const [id, view] of allViews()) {
      if (id === split.left) { view.setBounds(leftRect); view.setVisible(true); }
      else if (id === split.right) { view.setBounds(rightRect); view.setVisible(true); }
      else { view.setBounds(bounds); view.setVisible(false); }
    }
    return;
  }
  splitDivider = null;
  // Alle Tabs liegen übereinander, nur der aktive ist sichtbar (in der Mini-Leiste keiner)
  ytView.setBounds(bounds);
  ytView.setVisible(!miniMode && activeTab === 'yt');
  for (const t of tabs) {
    t.view.setBounds(bounds);
    t.view.setVisible(!miniMode && t.id === activeTab);
  }
}

// [id, view] aller Seiten (YouTube + Browser-Tabs)
function allViews() {
  return [['yt', ytView], ...tabs.map((t) => [t.id, t.view])];
}

function viewOf(id) {
  if (id === 'yt') return ytView;
  const t = tabs.find((x) => x.id === id);
  return t ? t.view : null;
}

function splitActive() {
  return split.on && !miniMode && split.right !== null && split.left !== split.right &&
    !!viewOf(split.left) && !!viewOf(split.right);
}

function bookmarksShown() {
  return settings.state.showBookmarks !== false && settings.state.bookmarks.length > 0;
}

// Höhe von Steuerleiste + Tab-Leiste (+ Lesezeichen-Leiste)
function topHeight() {
  return TOP_HEIGHT + (bookmarksShown() ? BM_HEIGHT : 0);
}

function barShown() {
  return settings.state.barVisible || barPeek || tourActive;
}

function setBarPeek(on) {
  if (barPeek === on) return;
  barPeek = on;
  peekLeftAt = 0;
  layout();
  sendState();
}

// Ist die Leiste ausgeblendet, klappt sie auf, sobald die Maus an den oberen Rand
// des Overlays kommt, und verschwindet wieder, wenn die Maus weggeht.
function checkBarPeek() {
  if (!win || win.isDestroyed()) return;
  if (settings.state.barVisible || miniMode || clickThrough || !win.isVisible() || win.isMinimized()) {
    if (barPeek) setBarPeek(false);
    return;
  }
  const p = screen.getCursorScreenPoint();
  const b = win.getBounds();
  const insideX = p.x >= b.x && p.x < b.x + b.width;
  if (!barPeek) {
    if (insideX && p.y >= b.y && p.y < b.y + PEEK_ZONE) setBarPeek(true);
    return;
  }
  const overBar = insideX && p.y >= b.y && p.y < b.y + topHeight() + 8;
  const typing = win.isFocused() && win.webContents.isFocused();
  if (overBar || typing) {
    peekLeftAt = 0;
  } else if (!peekLeftAt) {
    peekLeftAt = Date.now();
  } else if (Date.now() - peekLeftAt >= PEEK_HIDE_DELAY) {
    setBarPeek(false);
  }
}

// Hält ein Rechteck vollständig im Arbeitsbereich des Bildschirms, auf dem es liegt
function fitToWorkArea(b) {
  const area = screen.getDisplayMatching(b).workArea;
  const width = Math.min(b.width, area.width);
  const height = Math.min(b.height, area.height);
  return {
    x: Math.round(clamp(b.x, area.x, area.x + area.width - width)),
    y: Math.round(clamp(b.y, area.y, area.y + area.height - height)),
    width: Math.round(width),
    height: Math.round(height)
  };
}

// Hochkant-Größe (9:16) für Shorts, passend zur aktuellen Fensterhöhe
function defaultShortsSize(cur) {
  const area = screen.getDisplayMatching(cur).workArea;
  const height = Math.min(Math.max(cur.height, 640), area.height - 40);
  const videoHeight = height - topHeight() - BORDER;
  const width = Math.max(320, Math.round(videoHeight * 9 / 16) + BORDER * 2);
  return { width, height };
}

// Shorts sind Hochkant-Videos: Beim Öffnen eines Shorts wird das Overlay hochkant,
// beim Verlassen kehrt es zur normalen Größe zurück. Beide Größen werden gemerkt.
// Die rechte obere Ecke bleibt dabei an ihrem Platz.
function applyShortsMode(on) {
  if (split.on) return;   // in der geteilten Ansicht bleibt das Fenster quer
  if (!win || on === shortsMode || win.isMinimized()) return;
  if (maximized || miniMode) { shortsMode = on; return; }
  const cur = win.getBounds();
  let target;
  if (on) {
    settings.state.bounds = cur;
    target = settings.state.shortsBounds || defaultShortsSize(cur);
  } else {
    settings.state.shortsBounds = cur;
    target = settings.state.bounds || defaultBounds();
  }
  shortsMode = on;
  win.setBounds(fitToWorkArea({
    x: cur.x + cur.width - target.width,
    y: cur.y,
    width: target.width,
    height: target.height
  }));
  layout();
  saveSettingsSoon();
}

function rememberBounds() {
  if (!win || win.isMinimized() || maximized || miniMode) return;
  if (shortsMode) settings.state.shortsBounds = win.getBounds();
  else settings.state.bounds = win.getBounds();
  saveSettingsSoon();
}

function sendState(extra = {}) {
  updateTray();
  if (!win || win.webContents.isDestroyed()) return;
  const view = activeView();
  const wc = view && !view.webContents.isDestroyed() ? view.webContents : null;
  const active = activeTab === 'yt' ? null : tabs.find((t) => t.id === activeTab);
  win.webContents.send('state', {
    url: active && active.pendingUrl ? active.pendingUrl : (wc ? wc.getURL() : ''),
    canGoBack: wc ? wc.navigationHistory.canGoBack() : false,
    activeTab,
    tabs: tabs.map((t) => ({ id: t.id, title: t.title, favicon: t.favicon, loading: t.loading })),
    youtubeLoading: !!(ytView && ytView.webContents.isLoading()),
    opacity: settings.state.opacity,
    clickThrough,
    barVisible: settings.state.barVisible,
    barPeek,
    shortsMode,
    maximized,
    miniMode,
    theme: previewTheme || settings.state.theme,
    focusMode: settings.state.focusMode,
    focusOpacity: settings.state.focusOpacity,
    focusFaded,
    twitch: twitchActive() ? { channel: twitch.channel } : null,
    split: { on: splitActive(), left: split.left, right: split.right, divider: splitDivider, ratio: settings.state.splitRatio },
    ytPlaying,
    volume: Number.isFinite(settings.state.volume) ? settings.state.volume : 100,
    muted: ytMuted,
    ytTitle: ytView ? ytView.webContents.getTitle().replace(/\s*-\s*YouTube\s*$/, '') : '',
    adblock: settings.state.adblock !== false,
    adblockStatus: adblock ? adblock.status : 'laedt',
    update: updater ? { ...updater.state, selfUpdate: !!updater.portableExe } : null,
    version: CURRENT_VERSION,
    lang: settings.state.language,
    tour: tourActive,
    bookmarks: settings.state.bookmarks,
    showBookmarks: bookmarksShown(),
    bookmarked: !!findBookmark(currentPage().url),
    hotkeys: settings.hotkeys,
    failedHotkeys,
    ...extra
  });
}

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------
function setOpacity(value) {
  settings.state.opacity = Math.round(clamp(value, MIN_OPACITY, MAX_OPACITY) * 100) / 100;
  applyOpacity(false);
  saveSettingsSoon();
  sendState();
}

// ---------------------------------------------------------------------------
// Fokus-Modus: Overlay wird durchsichtig, wenn die Maus nicht darüber ist
// ---------------------------------------------------------------------------
function targetOpacity() {
  const base = settings.state.opacity;
  if (settings.state.focusMode && focusFaded) return Math.min(base, settings.state.focusOpacity);
  return base;
}

// Deckkraft setzen – mit animate=true weich überblenden
function applyOpacity(animate) {
  if (!win || win.isDestroyed()) return;
  clearInterval(fadeTimer);
  const to = targetOpacity();
  const from = shownOpacity === null ? win.getOpacity() : shownOpacity;
  if (!animate || Math.abs(to - from) < 0.01) {
    shownOpacity = to;
    win.setOpacity(to);
    return;
  }
  const steps = 8;
  let i = 0;
  fadeTimer = setInterval(() => {
    i += 1;
    shownOpacity = from + (to - from) * (i / steps);
    if (win && !win.isDestroyed()) win.setOpacity(shownOpacity);
    if (i >= steps) clearInterval(fadeTimer);
  }, FOCUS_FADE_MS / steps);
}

function checkFocusMode() {
  if (!win || win.isDestroyed()) return;
  if (!settings.state.focusMode || !win.isVisible() || win.isMinimized()) {
    if (focusFaded) { focusFaded = false; applyOpacity(true); }
    focusLeftAt = 0;
    return;
  }
  const p = screen.getCursorScreenPoint();
  const b = win.getBounds();
  const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
  // Sichtbar bleiben: Maus drüber, Overlay wird gerade benutzt (Fokus) oder Einstellungen offen
  const engaged = inside || tourActive ||
    (win.isFocused() && !clickThrough) ||
    (settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible());
  if (engaged) {
    focusLeftAt = 0;
    if (focusFaded) { focusFaded = false; applyOpacity(true); }
  } else if (!focusFaded) {
    if (!focusLeftAt) focusLeftAt = Date.now();
    else if (Date.now() - focusLeftAt >= FOCUS_FADE_DELAY) { focusFaded = true; applyOpacity(true); }
  }
}

function setFocusMode(on, announce = true) {
  settings.state.focusMode = !!on;
  focusLeftAt = 0;
  if (!on && focusFaded) { focusFaded = false; applyOpacity(true); }
  saveSettingsSoon();
  sendState(announce ? {
    notice: on
      ? L('main.focusOn', { p: Math.round(settings.state.focusOpacity * 100) })
      : L('main.focusOff')
  } : {});
}

function setFocusOpacity(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  settings.state.focusOpacity = Math.round(clamp(v, FOCUS_MIN, FOCUS_MAX) * 100) / 100;
  if (focusFaded) applyOpacity(true);
  saveSettingsSoon();
}

function setClickThrough(on) {
  clickThrough = !!on;
  if (win) {
    win.setIgnoreMouseEvents(clickThrough);
    // Im Durchklick-Modus darf das Overlay WoW nicht den Fokus wegnehmen
    win.setFocusable(!clickThrough);
    if (clickThrough) win.blur();
  }
  sendState();
}

function setAdblock(on) {
  settings.state.adblock = !!on;
  saveSettingsSoon();
  if (adblock) adblock.setEnabled(!!on);
  sendState();
}

function setBarVisible(on) {
  settings.state.barVisible = !!on;
  barPeek = false;
  peekLeftAt = 0;
  layout();
  saveSettingsSoon();
  sendState();
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible() && !win.isMinimized()) {
    win.hide();
  } else {
    if (win.isMinimized()) win.restore();
    // showInactive: WoW behält den Tastatur-Fokus
    win.showInactive();
    win.setAlwaysOnTop(true, 'screen-saver');
  }
}

// Steuert den YouTube-Player. Nutzt die interne Player-API, sonst das <video>-Element.
function playerCommand(cmd) {
  if (!ytView) return;
  const js = `(() => {
    const onShorts = location.pathname.startsWith('/shorts');
    const p = document.getElementById(onShorts ? 'shorts-player' : 'movie_player');
    const v = (p && p.querySelector('video')) || document.querySelector('video');
    const cmd = ${JSON.stringify(cmd)};
    const seek = ${SEEK_SECONDS};
    const has = (fn) => p && typeof p[fn] === 'function';
    switch (cmd) {
      case 'playPause':
        if (has('getPlayerState') && has('playVideo') && has('pauseVideo')) {
          p.getPlayerState() === 1 ? p.pauseVideo() : p.playVideo();
        } else if (v) { v.paused ? v.play() : v.pause(); }
        break;
      case 'seekBack':
      case 'seekForward': {
        const d = cmd === 'seekBack' ? -seek : seek;
        if (has('getCurrentTime') && has('seekTo')) p.seekTo(Math.max(0, p.getCurrentTime() + d), true);
        else if (v) v.currentTime = Math.max(0, v.currentTime + d);
        break;
      }
      case 'mute':
        if (has('isMuted') && has('mute') && has('unMute')) { p.isMuted() ? p.unMute() : p.mute(); }
        else if (v) v.muted = !v.muted;
        break;
      case 'cinema':
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          const target = p || v;
          if (target) target.requestFullscreen();
        }
        break;
    }
    return true;
  })()`;
  // userGesture = true, damit Abspielen/Vollbild ohne echten Klick erlaubt ist
  ytView.webContents.executeJavaScript(js, true).catch(() => {});
}

// ---------------------------------------------------------------------------
// Lautstärke (YouTube-Player)
// ---------------------------------------------------------------------------
const PLAYER_JS = `const onShorts = location.pathname.startsWith('/shorts');
    const p = document.getElementById(onShorts ? 'shorts-player' : 'movie_player');
    const v = (p && p.querySelector('video')) || document.querySelector('video');
    const has = (fn) => p && typeof p[fn] === 'function';`;

// Neues Video (auch beim Wechsel ohne Neuladen der Seite): gespeicherte Lautstärke
// anwenden. Zweimal, weil YouTube beim Start eines Videos die Lautstärke selbst noch anpasst.
function onVideoMaybeChanged() {
  const id = currentVideoId();
  if (!id || id === volumeVideoId) return;
  volumeVideoId = id;
  syncVideoId = id;
  syncVideoAt = Date.now();
  if (!Number.isFinite(settings.state.volume)) return;
  for (const delay of [800, 2500]) {
    setTimeout(() => {
      if (currentVideoId() === id) applyVolume(settings.state.volume, false);
    }, delay);
  }
}

// Video-ID bzw. Short-ID der aktuellen YouTube-Seite
function currentVideoId() {
  if (!ytView) return null;
  try {
    const u = new URL(ytView.webContents.getURL());
    if (u.pathname.startsWith('/shorts/')) return 'short:' + u.pathname.split('/')[2];
    return u.searchParams.get('v');
  } catch (_) {
    return null;
  }
}

// Setzt die Lautstärke im Player. unmute=true hebt dabei eine Stummschaltung auf.
function applyVolume(vol, unmute) {
  if (!ytView) return;
  lastAppliedVolume = Number(vol);
  volumeSetAt = Date.now();
  const js = `(() => {
    ${PLAYER_JS}
    const vol = ${Number(vol)};
    if (has('setVolume')) {
      p.setVolume(vol);
      if (${unmute ? 'true' : 'false'} && vol > 0 && has('isMuted') && p.isMuted()) p.unMute();
    } else if (v) {
      v.volume = vol / 100;
      if (${unmute ? 'true' : 'false'} && vol > 0) v.muted = false;
    }
    return true;
  })()`;
  ytView.webContents.executeJavaScript(js, true).catch(() => {});
}

function setVolume(value) {
  const vol = Math.round(clamp(Number(value), 0, 100));
  if (!Number.isFinite(vol)) return;
  settings.state.volume = vol;
  volumeSetAt = Date.now();
  ytMuted = vol === 0 ? ytMuted : false;
  applyVolume(vol, true);
  saveSettingsSoon();
  sendState();
}

function changeVolume(delta) {
  const cur = Number.isFinite(settings.state.volume) ? settings.state.volume : 100;
  setVolume(cur + delta);
}

// Liest Lautstärke/Stumm aus dem Player, damit der Regler zu YouTubes eigenem Regler passt.
// Übernimmt nur echte Änderungen (nicht direkt nach dem eigenen Setzen) und wendet nichts
// zurück an – so kann sich nichts gegenseitig hochschaukeln.
function syncVolumeFromPlayer() {
  if (!ytView || ytView.webContents.isDestroyed() || Date.now() - volumeSetAt < 3000) return;
  const js = `(() => {
    ${PLAYER_JS}
    if (has('getVolume') && has('isMuted')) return { vol: p.getVolume(), muted: p.isMuted() };
    if (v) return { vol: Math.round(v.volume * 100), muted: v.muted };
    return null;
  })()`;
  ytView.webContents.executeJavaScript(js).then((r) => {
    if (!r || !Number.isFinite(r.vol)) return;
    if (Date.now() - volumeSetAt < 3000) return; // inzwischen selbst gesetzt
    const vol = Math.round(r.vol);
    let changed = false;
    if (!!r.muted !== ytMuted) { ytMuted = !!r.muted; changed = true; }
    // In den ersten Sekunden eines Videos passt YouTube die Lautstärke selbst an
    // (Lautstärke-Ausgleich). Das nicht übernehmen, sonst summiert es sich von Video zu Video.
    const id = currentVideoId();
    if (id !== syncVideoId) { syncVideoId = id; syncVideoAt = Date.now(); }
    if (Date.now() - syncVideoAt < 10000) {
      lastAppliedVolume = vol;
      if (changed) sendState();
      return;
    }
    // Nur übernehmen, wenn jemand YouTubes eigenen Regler bewegt hat
    if (lastAppliedVolume === null || Math.abs(vol - lastAppliedVolume) >= 1) {
      if (vol !== settings.state.volume) {
        settings.state.volume = vol;
        changed = true;
      }
      lastAppliedVolume = vol;
    }
    if (changed) {
      saveSettingsSoon();
      sendState();
    }
  }).catch(() => {});
}

// Nächstes / vorheriges Short: klickt YouTubes eigene Pfeil-Knöpfe,
// falls die fehlen, wird eine echte Pfeiltaste an die Seite geschickt.
function shortsStep(dir) {
  if (!ytView) return;
  const yt = ytView.webContents;
  if (!isShortsUrl(yt.getURL())) return;
  const sel = dir === 'next' ? '#navigation-button-down button' : '#navigation-button-up button';
  const js = `(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (b && !b.disabled) { b.click(); return true; } return false; })()`;
  yt.executeJavaScript(js, true)
    .then((clicked) => {
      if (clicked) return;
      const keyCode = dir === 'next' ? 'Down' : 'Up';
      yt.sendInputEvent({ type: 'keyDown', keyCode });
      yt.sendInputEvent({ type: 'keyUp', keyCode });
    })
    .catch(() => {});
}

function navigate(input) {
  if (!ytView) return;
  activateTab('yt');
  ytView.webContents.loadURL(inputToUrl(input));
}

// ---------------------------------------------------------------------------
// Browser-Tabs
// ---------------------------------------------------------------------------
const isWebUrl = (url) => /^https?:\/\//i.test(String(url || ''));

function isYouTubeUrl(url) {
  try {
    const host = new URL(url).hostname;
    return hostMatches(host, 'youtube.com') || hostMatches(host, 'youtu.be');
  } catch (_) {
    return false;
  }
}

// Erkennt Adressen in der Eingabe ("wowhead.com", "https://…", "localhost:3000").
// Gibt null zurück, wenn es eher ein Suchbegriff ist.
function toWebUrl(text) {
  const t = String(text || '').trim();
  if (!t || /\s/.test(t)) return null;
  if (isWebUrl(t)) {
    try { return new URL(t).toString(); } catch (_) { return null; }
  }
  if (/^localhost(:\d+)?(\/.*)?$/i.test(t)) return 'http://' + t;
  if (/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(t)) {
    try { return new URL('https://' + t).toString(); } catch (_) { return null; }
  }
  return null;
}

function activeView() {
  if (activeTab === 'yt') return ytView;
  const t = tabs.find((x) => x.id === activeTab);
  return t ? t.view : ytView;
}

function hostLabel(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return L('main.tabNew'); }
}

// Fremder Link aus YouTube oder einer Website: http(s) -> neuer Tab, mailto -> Mailprogramm,
// alles andere (z. B. Programm-Links) wird ignoriert.
function openExternalLink(url) {
  if (isWebUrl(url)) createTab(url, true);
  else if (/^mailto:/i.test(url)) shell.openExternal(url);
}

function createTab(url, activate = true, lazy = false) {
  if (!win) return null;
  if (tabs.length >= MAX_TABS) {
    sendState({ notice: L('main.maxTabs', { n: MAX_TABS }) });
    return null;
  }
  const view = new WebContentsView({
    webPreferences: {
      partition: 'persist:youtube',   // gleiche Sitzung wie YouTube (Werbeblocker, Logins)
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  view.setBackgroundColor('#ffffff');
  const tab = { id: nextTabId++, view, title: hostLabel(url), favicon: '', loading: false, pendingUrl: lazy ? url : null };
  tabs.push(tab);
  win.contentView.addChildView(view);
  wireTab(tab);
  if (!lazy) view.webContents.loadURL(url).catch(() => {});
  if (activate) activateTab(tab.id);
  else layout();
  saveTabsSoon();
  sendState();
  return tab;
}

function wireTab(tab) {
  const wc = tab.view.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    openExternalLink(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event, url) => {
    if (!isWebUrl(url)) {
      event.preventDefault();
      openExternalLink(url);
    }
  });
  wc.on('page-title-updated', (_e, title) => {
    if (twitch && (tab.id === twitch.player || tab.id === twitch.chat)) return;
    tab.title = title || hostLabel(wc.getURL());
    sendState();
  });
  wc.on('page-favicon-updated', (_e, favicons) => {
    tab.favicon = (favicons || []).find((f) => /^(https?:|data:image\/)/i.test(f)) || '';
    sendState();
  });
  wc.on('did-start-loading', () => { tab.loading = true; sendState(); });
  wc.on('did-stop-loading', () => { tab.loading = false; sendState(); });
  wc.on('did-navigate', () => { tab.favicon = ''; saveTabsSoon(); sendState(); });
  wc.on('did-navigate-in-page', () => { saveTabsSoon(); sendState(); });
  wc.on('render-process-gone', () => { tab.title = L('main.tabCrashed'); sendState(); });
  attachCommonHandlers(wc);
}

// Wiederhergestellter Tab wird erst geladen, wenn er gebraucht wird
function ensureLoaded(id) {
  const t = tabs.find((x) => x.id === id);
  if (t && t.pendingUrl) {
    const url = t.pendingUrl;
    t.pendingUrl = null;
    t.view.webContents.loadURL(url).catch(() => {});
  }
}

function activateTab(id) {
  if (!win) return;
  if (id !== 'yt' && !tabs.some((t) => t.id === id)) id = 'yt';
  activeTab = id;
  if (id !== 'yt') lastBrowserTab = id;
  // Geteilte Ansicht: links bleibt fest, ein anderer Tab kommt nach rechts
  if (split.on && id !== split.left) split.right = id;
  ensureLoaded(id);
  layout();
  // Shorts-Hochformat nur, solange der YouTube-Tab mit einem Short aktiv ist
  applyShortsMode(id === 'yt' && !!ytView && isShortsUrl(ytView.webContents.getURL()));
  if (win.isFocused() && !win.webContents.isFocused()) activeView().webContents.focus();
  sendState();
}

function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  if (twitch && (id === twitch.player || id === twitch.chat)) twitch = null;
  const [tab] = tabs.splice(i, 1);
  if (win) win.contentView.removeChildView(tab.view);
  try { tab.view.webContents.close(); } catch (_) { /* schon zu */ }
  if (split.on) {
    if (id === split.left) {
      setSplit(false);           // linke Seite weg (z. B. Twitch-Player) -> normale Ansicht
    } else if (id === split.right) {
      const other = tabs.find((t) => t.id !== split.left);
      if (other) split.right = other.id;
      else if (split.left !== 'yt') split.right = 'yt';
      else setSplit(false);
    }
  }
  if (activeTab === id) {
    const next = tabs[i] || tabs[i - 1];
    activateTab(next ? next.id : 'yt');
  } else {
    layout();
    sendState();
  }
  saveTabsSoon();
}

// ---------------------------------------------------------------------------
// Geteilte Ansicht
// ---------------------------------------------------------------------------
// left/right optional (z. B. Twitch-Modus: Player links, Chat rechts)
function setSplit(on, left, right) {
  if (!win) return;
  if (on) {
    if (miniMode) exitMini();
    applyShortsMode(false);              // Fenster zurück ins Querformat
    split.left = left !== undefined ? left : 'yt';
    if (right !== undefined) {
      split.right = right;
    } else {
      // rechts: aktiver Browser-Tab, sonst der zuletzt benutzte, sonst neuer Tab mit Startseite
      let r = activeTab !== split.left ? activeTab : null;
      if (r === null || r === 'yt') {
        const last = tabs.find((t) => t.id === lastBrowserTab) || tabs[tabs.length - 1];
        r = last ? last.id : null;
      }
      if (r === null) {
        const t = createTab(START_PAGE, false);
        r = t ? t.id : null;
      }
      split.right = r;
    }
    if (split.right === null) return;
    split.on = true;
    ensureLoaded(split.left);
    ensureLoaded(split.right);
    if (activeTab !== split.left && activeTab !== split.right) activeTab = split.right;
  } else {
    split.on = false;
    endSplitDrag();
    twitch = null;
  }
  layout();
  if (!split.on) applyShortsMode(activeTab === 'yt' && !!ytView && isShortsUrl(ytView.webContents.getURL()));
  sendState();
}

function setSplitRatio(r) {
  settings.state.splitRatio = Math.round(clamp(Number(r) || 0.5, SPLIT_MIN, SPLIT_MAX) * 1000) / 1000;
  layout();
  saveSettingsSoon();
  sendState();
}

// Trennbalken ziehen: Die Maus wird vom Hauptprozess verfolgt, weil sie beim Ziehen
// über die Seiten links/rechts fährt (deren Mausereignisse bekommt die Leiste nicht).
function startSplitDrag() {
  if (!splitActive() || splitDrag) return;
  splitDrag = setInterval(() => {
    if (!win || !splitActive()) { endSplitDrag(); return; }
    const p = screen.getCursorScreenPoint();
    const cb = win.getContentBounds();
    const [w] = win.getContentSize();
    const avail = Math.max(1, w - BORDER * 2 - SPLIT_GAP);
    const x = p.x - cb.x - BORDER - SPLIT_GAP / 2;
    const r = clamp(x / avail, SPLIT_MIN, SPLIT_MAX);
    if (Math.abs(r - settings.state.splitRatio) > 0.002) {
      settings.state.splitRatio = r;
      layout();
      sendState();
    }
  }, 16);
}

function endSplitDrag() {
  if (!splitDrag) return;
  clearInterval(splitDrag);
  splitDrag = null;
  settings.state.splitRatio = Math.round(settings.state.splitRatio * 1000) / 1000;
  saveSettingsSoon();
  sendState();
}

// ---------------------------------------------------------------------------
// Twitch-Modus: Stream (reiner Player) links, Chat rechts – in der geteilten Ansicht
// ---------------------------------------------------------------------------
const TWITCH_RESERVED = new Set([
  'directory', 'videos', 'settings', 'p', 'downloads', 'jobs', 'search', 'subscriptions', 'inventory',
  'wallet', 'drops', 'prime', 'turbo', 'store', 'friends', 'messages', 'login', 'signup', 'user',
  'privacy', 'legal', 'team', 'moderator', 'following', 'broadcast', 'dashboard', 'popout', 'clips', 'collections'
]);
const TWITCH_NAME = /^[a-z0-9_]{2,25}$/i;
const TWITCH_RATIO = 0.7;

// Kanalname aus einer Twitch-Adresse (Kanalseite, Player oder Popout-Chat)
function twitchChannelFrom(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./, '');
    if (host === 'player.twitch.tv') {
      const c = u.searchParams.get('channel');
      return c && TWITCH_NAME.test(c) ? c : null;
    }
    if (host === 'twitch.tv') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'popout' && parts[1] && TWITCH_NAME.test(parts[1])) return parts[1];
      if (parts[0] && TWITCH_NAME.test(parts[0]) && !TWITCH_RESERVED.has(parts[0].toLowerCase())) return parts[0];
    }
  } catch (_) { /* keine Adresse */ }
  return null;
}

function twitchActive() {
  return !!twitch && split.on && split.left === twitch.player && tabs.some((t) => t.id === twitch.player);
}

// Twitch-Modus starten. input: Kanalname oder Twitch-Adresse; ohne input wird der aktuelle Tab genommen.
function startTwitch(input) {
  if (!win) return;
  let ch = null;
  if (input) {
    const text = String(input).trim();
    ch = twitchChannelFrom(/^https?:\/\//i.test(text) ? text : 'https://www.twitch.tv/' + text.replace(/^@/, ''));
  } else {
    const v = activeView();
    ch = v ? twitchChannelFrom(v.webContents.getURL()) : null;
  }
  if (!ch) {
    // Kein Kanal bekannt: im Adressfeld nach dem Kanal fragen
    focusAddressBar();
    win.webContents.send('twitch-prompt');
    return;
  }
  if (twitchActive()) stopTwitch();
  const playerUrl = `https://player.twitch.tv/?channel=${encodeURIComponent(ch)}&parent=twitch.tv`;
  const chatUrl = `https://www.twitch.tv/popout/${encodeURIComponent(ch)}/chat?popout=`;
  // Ist gerade eine Twitch-Seite offen, wird sie zum Player
  let player = activeTab !== 'yt' && twitchChannelFrom(activeView().webContents.getURL()) ? tabs.find((t) => t.id === activeTab) : null;
  if (player) player.view.webContents.loadURL(playerUrl).catch(() => {});
  else player = createTab(playerUrl, false);
  const chat = player ? createTab(chatUrl, false) : null;
  if (!player || !chat) return;
  player.title = `Twitch: ${ch}`;
  chat.title = `Chat: ${ch}`;
  twitch = { channel: ch, player: player.id, chat: chat.id };
  settings.state.splitRatio = TWITCH_RATIO;
  saveSettingsSoon();
  activeTab = player.id;
  setSplit(true, player.id, chat.id);
}

// Twitch-Modus beenden: Player und Chat schließen
function stopTwitch() {
  const t = twitch;
  twitch = null;
  if (!t) return;
  setSplit(false);
  for (const id of [t.chat, t.player]) if (tabs.some((x) => x.id === id)) closeTab(id);
}

// ---------------------------------------------------------------------------
// Tour durch die Leiste (beim ersten Start, jederzeit wiederholbar)
// ---------------------------------------------------------------------------
function startTour() {
  if (!win) return;
  if (miniMode) exitMini();
  if (clickThrough) setClickThrough(false);
  if (!win.isVisible()) { win.showInactive(); win.setAlwaysOnTop(true, 'screen-saver'); }
  // Mindestgröße, damit die Sprechblasen Platz haben
  const b = win.getBounds();
  if (b.width < 560 || b.height < 330) {
    win.setBounds(fitToWorkArea({ x: b.x + b.width - Math.max(b.width, 560), y: b.y, width: Math.max(b.width, 560), height: Math.max(b.height, 330) }));
  }
  tourActive = true;
  layout();
  sendState();
}

function endTour() {
  if (!tourActive) return;
  tourActive = false;
  settings.state.tourDone = true;
  saveSettingsSoon();
  layout();
  sendState();
}

function cycleTab(dir) {
  const order = ['yt', ...tabs.map((t) => t.id)];
  const i = order.indexOf(activeTab);
  activateTab(order[(i + dir + order.length) % order.length]);
}

function saveTabsSoon() {
  settings.state.tabs = tabs
    .map((t) => t.pendingUrl || t.view.webContents.getURL())
    .filter(isWebUrl);
  saveSettingsSoon();
}

function restoreTabs() {
  const urls = Array.isArray(settings.state.tabs) ? settings.state.tabs.filter(isWebUrl).slice(0, MAX_TABS) : [];
  for (const url of urls) createTab(url, false, true);
  activateTab('yt');
}

// Eingabe im Adressfeld: im YouTube-Tab YouTube-Suche/-Links (fremde Adressen -> neuer Tab),
// in Browser-Tabs Adresse laden oder mit Google suchen.
function navigateInput(input) {
  const text = String(input || '').trim();
  const web = toWebUrl(text);
  if (activeTab === 'yt') {
    if (web && !isYouTubeUrl(web)) createTab(web, true);
    else navigate(text);
    return;
  }
  const view = activeView();
  view.webContents.loadURL(web || (SEARCH_URL + encodeURIComponent(text))).catch(() => {});
}

function focusAddressBar() {
  if (!win) return;
  win.focus();
  win.webContents.focus();
  win.webContents.send('focus-url');
}

// ---------------------------------------------------------------------------
// Lesezeichen
// ---------------------------------------------------------------------------

// Für den Vergleich: ohne #Anker; YouTube-Videos nur mit Video-ID (ohne Zeitstempel/Playlist)
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    if (hostMatches(u.hostname, 'youtube.com') && u.pathname === '/watch' && u.searchParams.get('v')) {
      return 'https://www.youtube.com/watch?v=' + u.searchParams.get('v');
    }
    return u.toString();
  } catch (_) {
    return String(url || '');
  }
}

function findBookmark(url) {
  if (!url) return null;
  const n = normalizeUrl(url);
  return settings.state.bookmarks.find((b) => normalizeUrl(b.url) === n) || null;
}

// Adresse, Titel und Symbol der Seite im aktiven Tab
function currentPage() {
  const view = activeView();
  if (!view || view.webContents.isDestroyed()) return { url: '', title: '', favicon: '' };
  const wc = view.webContents;
  const url = wc.getURL();
  if (activeTab === 'yt') {
    const title = wc.getTitle().replace(/\s*-\s*YouTube\s*$/, '').trim();
    return { url, title: title && title !== 'YouTube' ? title : 'YouTube', favicon: 'yt' };
  }
  const tab = tabs.find((t) => t.id === activeTab);
  return { url, title: wc.getTitle() || hostLabel(url), favicon: (tab && tab.favicon) || '' };
}

function faviconFor(url) {
  if (isYouTubeUrl(url)) return 'yt';
  try { return new URL(url).origin + '/favicon.ico'; } catch (_) { return ''; }
}

function bookmarksChanged() {
  saveSettingsSoon();
  layout();   // Leiste kann erscheinen/verschwinden
  sendState();
}

function addBookmark(url, title, favicon) {
  if (!isWebUrl(url) || findBookmark(url)) return;
  if (settings.state.bookmarks.length >= MAX_BOOKMARKS) {
    sendState({ notice: L('main.maxBookmarks', { n: MAX_BOOKMARKS }) });
    return;
  }
  settings.state.bookmarks.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: String(title || hostLabel(url)).slice(0, 200),
    url,
    favicon: favicon || faviconFor(url)
  });
  bookmarksChanged();
}

function removeBookmark(id) {
  const before = settings.state.bookmarks.length;
  settings.state.bookmarks = settings.state.bookmarks.filter((b) => b.id !== id);
  if (settings.state.bookmarks.length !== before) bookmarksChanged();
}

// ☆ / Strg+D: aktuelle Seite speichern oder wieder entfernen
function toggleBookmark() {
  const page = currentPage();
  if (!isWebUrl(page.url)) return;
  const existing = findBookmark(page.url);
  // Keine Text-Meldung: Sie würde die Leiste mit dem Stern verdecken. Die Leiste zeigt
  // das Speichern/Entfernen selbst (Stern ploppt, fliegt in die Leiste, Lesezeichen leuchtet/verblasst).
  if (existing) removeBookmark(existing.id);
  else addBookmark(page.url, page.title, page.favicon);
}

function renameBookmark(id, title) {
  const b = settings.state.bookmarks.find((x) => x.id === id);
  const t = String(title || '').trim().slice(0, 200);
  if (!b || !t || t === b.title) { sendState(); return; }
  b.title = t;
  bookmarksChanged();
}

function moveBookmark(id, toIndex) {
  const list = settings.state.bookmarks;
  const from = list.findIndex((b) => b.id === id);
  if (from < 0) return;
  const [b] = list.splice(from, 1);
  list.splice(clamp(Number(toIndex) || 0, 0, list.length), 0, b);
  bookmarksChanged();
}

// Klick: YouTube-Links im YouTube-Tab, Websites im aktiven Browser-Tab (sonst neuer Tab)
function openBookmark(id, newTab) {
  const b = settings.state.bookmarks.find((x) => x.id === id);
  if (!b) return;
  if (isYouTubeUrl(b.url) && !newTab) navigate(b.url);
  else if (newTab || activeTab === 'yt') createTab(b.url, true);
  else activeView().webContents.loadURL(b.url).catch(() => {});
}

function bookmarkMenu(id) {
  const b = settings.state.bookmarks.find((x) => x.id === id);
  if (!b || !win) return;
  Menu.buildFromTemplate([
    { label: L('cm.open'), click: () => openBookmark(id, false) },
    { label: L('cm.openNewTab'), click: () => openBookmark(id, true) },
    { type: 'separator' },
    { label: L('cm.rename'), click: () => win.webContents.send('bookmark:edit', id) },
    { label: L('cm.copyAddress'), click: () => clipboard.writeText(b.url) },
    { type: 'separator' },
    { label: L('cm.delete'), click: () => removeBookmark(id) }
  ]).popup({ window: win });
}

// ---------------------------------------------------------------------------
// Gemeinsame Helfer für alle Seiten (YouTube-Tab, Browser-Tabs)
// ---------------------------------------------------------------------------

// Tastenkürzel im Overlay (nur wenn das Overlay den Fokus hat – keine globalen Hotkeys)
function attachShortcuts(wc) {
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    const ctrl = input.control && !input.alt;
    let handled = true;
    if (ctrl && key === 't') { createTab(START_PAGE, true); focusAddressBar(); }
    else if (ctrl && key === 'w') { if (activeTab !== 'yt') closeTab(activeTab); }
    else if (ctrl && key === 'tab') cycleTab(input.shift ? -1 : 1);
    else if (ctrl && key === 'l') focusAddressBar();
    else if (ctrl && key === 'd') toggleBookmark();
    else if ((ctrl && key === 'r') || (!input.control && !input.alt && key === 'f5')) activeView().webContents.reload();
    else if (input.alt && !input.control && key === 'arrowleft') { const h = activeView().webContents.navigationHistory; if (h.canGoBack()) h.goBack(); }
    else if (input.alt && !input.control && key === 'arrowright') { const h = activeView().webContents.navigationHistory; if (h.canGoForward()) h.goForward(); }
    else handled = false;
    if (handled) event.preventDefault();
  });
}

// Rechtsklick-Menü wie im normalen Browser
function attachContextMenu(wc) {
  wc.on('context-menu', (_e, p) => {
    const items = [];
    if (p.linkURL && isWebUrl(p.linkURL)) {
      items.push({ label: L('cm.linkNewTab'), click: () => createTab(p.linkURL, true) });
      items.push({ label: L('cm.copyLink'), click: () => clipboard.writeText(p.linkURL) });
      if (!findBookmark(p.linkURL)) {
        items.push({ label: L('cm.bookmarkLink'), click: () => addBookmark(p.linkURL, (p.linkText || '').trim() || hostLabel(p.linkURL)) });
      }
      items.push({ type: 'separator' });
    }
    if (p.isEditable) {
      items.push({ label: L('cm.cut'), role: 'cut', enabled: p.editFlags.canCut });
      items.push({ label: L('cm.copy'), role: 'copy', enabled: p.editFlags.canCopy });
      items.push({ label: L('cm.paste'), role: 'paste', enabled: p.editFlags.canPaste });
      items.push({ label: L('cm.selectAll'), role: 'selectAll' });
      items.push({ type: 'separator' });
    } else if (p.selectionText && p.selectionText.trim()) {
      const sel = p.selectionText.trim();
      items.push({ label: L('cm.copy'), role: 'copy' });
      items.push({ label: L('cm.search', { s: sel.length > 24 ? sel.slice(0, 24) + '…' : sel }), click: () => createTab(SEARCH_URL + encodeURIComponent(sel), true) });
      items.push({ type: 'separator' });
    }
    if (p.mediaType === 'image' && isWebUrl(p.srcURL)) {
      items.push({ label: L('cm.imageNewTab'), click: () => createTab(p.srcURL, true) });
      items.push({ type: 'separator' });
    }
    const h = wc.navigationHistory;
    items.push({ label: L('cm.back'), enabled: h.canGoBack(), click: () => h.goBack() });
    items.push({ label: L('cm.forward'), enabled: h.canGoForward(), click: () => h.goForward() });
    items.push({ label: L('cm.reload'), click: () => wc.reload() });
    if (isWebUrl(wc.getURL())) {
      const saved = findBookmark(wc.getURL());
      items.push(saved
        ? { label: L('cm.removeBookmark'), click: () => removeBookmark(saved.id) }
        : { label: L('cm.bookmarkPage'), click: () => toggleBookmark() });
    }
    const url = wc.getURL();
    if (isWebUrl(url)) {
      items.push({ type: 'separator' });
      items.push({ label: L('cm.copyPageAddress'), click: () => clipboard.writeText(url) });
      items.push({ label: L('cm.openExternal'), click: () => shell.openExternal(url) });
    }
    Menu.buildFromTemplate(items).popup({ window: win });
  });
}

function attachCommonHandlers(wc) {
  wc.on('before-mouse-event', (_e, m) => { if (splitDrag && m.type === 'mouseUp') endSplitDrag(); });
  attachShortcuts(wc);
  attachContextMenu(wc);
}

// Sitzung absichern: keine Kamera/Mikro/Standort/Benachrichtigungen,
// Downloads direkt in den Download-Ordner (ein Speichern-Dialog läge sonst hinter dem Overlay).
function setupSession(ses) {
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));
  ses.on('will-download', (_e, item) => {
    const dir = app.getPath('downloads');
    const parsed = path.parse(item.getFilename() || 'download');
    let target = path.join(dir, parsed.base);
    for (let n = 1; fs.existsSync(target) && n < 1000; n++) {
      target = path.join(dir, `${parsed.name} (${n})${parsed.ext}`);
    }
    item.setSavePath(target);
    sendState({ notice: L('main.downloadRunning', { f: path.basename(target) }) });
    item.once('done', (_ev, state) => {
      sendState({
        notice: state === 'completed'
          ? L('main.downloadDone', { f: path.basename(target) })
          : L('main.downloadCancelled', { f: path.basename(target) })
      });
    });
  });
}

// Maximieren: Overlay füllt den ganzen Bildschirm (über WoW), nochmal = alte Größe.
function toggleMaximize() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (miniMode) exitMini();
  if (!maximized) {
    rememberBounds();
    saveSettingsNow();
    maximized = true;
    win.setBounds(screen.getDisplayMatching(win.getBounds()).bounds);
  } else {
    maximized = false;
    const saved = shortsMode ? settings.state.shortsBounds : settings.state.bounds;
    let target = saved;
    if (!target) {
      target = defaultBounds();
      if (shortsMode) Object.assign(target, defaultShortsSize(target));
    }
    win.setBounds(fitToWorkArea(target));
  }
  win.showInactive();
  win.setAlwaysOnTop(true, 'screen-saver');
  layout();
  sendState();
}

// Minimieren innerhalb von WoW: Das Overlay schrumpft zu einer kleinen Leiste
// (Play/Pause, Titel, Wiederherstellen), bleibt aber über dem Spiel. Video läuft weiter.
// Die rechte obere Ecke bleibt an ihrem Platz.
function enterMini() {
  if (!win || miniMode) return;
  endSplitDrag();
  if (win.isMinimized()) win.restore();
  if (maximized) {
    maximized = false;
  } else {
    rememberBounds();
  }
  saveSettingsNow();
  const cur = win.getBounds();
  miniMode = true;
  barPeek = false;
  layout();
  win.setMinimumSize(120, MINI_HEIGHT);
  win.setResizable(false);
  win.setBounds(fitToWorkArea({ x: cur.x + cur.width - MINI_WIDTH, y: cur.y, width: MINI_WIDTH, height: MINI_HEIGHT }));
  win.showInactive();
  win.setAlwaysOnTop(true, 'screen-saver');
  sendState();
}

function exitMini() {
  if (!win || !miniMode) return;
  setTimeout(() => checkForUpdatesQuietly(UPDATE_CHECK_ON_USE), 500);
  const cur = win.getBounds();
  let target = shortsMode ? settings.state.shortsBounds : settings.state.bounds;
  if (!target) {
    target = defaultBounds();
    if (shortsMode) Object.assign(target, defaultShortsSize(target));
  }
  miniMode = false;
  win.setResizable(true);
  win.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);
  win.setBounds(fitToWorkArea({ x: cur.x + cur.width - target.width, y: cur.y, width: target.width, height: target.height }));
  layout();
  win.setAlwaysOnTop(true, 'screen-saver');
  sendState();
}

function toggleMini() {
  if (miniMode) exitMini(); else enterMini();
}

// Fenster an die Standard-Position holen (falls es verloren gegangen ist)
function resetWindowPosition() {
  if (!win) return;
  if (miniMode) exitMini();
  maximized = false;
  const d = defaultBounds();
  if (shortsMode) {
    const sz = defaultShortsSize(d);
    d.x = d.x + d.width - sz.width;
    d.width = sz.width;
    d.height = sz.height;
  }
  if (win.isMinimized()) win.restore();
  win.setBounds(fitToWorkArea(d));
  win.showInactive();
  win.setAlwaysOnTop(true, 'screen-saver');
}

// ---------------------------------------------------------------------------
// Updates (neue Versionen von GitHub)
// ---------------------------------------------------------------------------
function setupUpdater() {
  updater = new Updater({ onChange: onUpdateState });
  cleanupDownloads([app.getPath('downloads')], () => ['downloading', 'ready'].includes(updater.state.status));
  setTimeout(() => checkForUpdatesQuietly(UPDATE_CHECK_ON_USE), UPDATE_CHECK_DELAY);
  setInterval(() => checkForUpdatesQuietly(), UPDATE_CHECK_INTERVAL);
  // Wird das Overlay benutzt (angeklickt, eingeblendet, aus der Mini-Leiste geholt),
  // kurz nachsehen, falls die letzte Prüfung länger her ist
  if (win) {
    win.on('focus', () => checkForUpdatesQuietly(UPDATE_CHECK_ON_USE));
    win.on('show', () => checkForUpdatesQuietly(UPDATE_CHECK_ON_USE));
  }
}

let lastUpdateCheck = 0;
// Prüft im Hintergrund; minAge: nur wenn die letzte Prüfung mindestens so lange her ist
function checkForUpdatesQuietly(minAge = 0) {
  if (!updater) return;
  if (Date.now() - lastUpdateCheck < minAge) return;
  if (['checking', 'downloading', 'ready'].includes(updater.state.status)) return;
  lastUpdateCheck = Date.now();
  updater.check();
}

function updateInfo() {
  return updater ? { ...updater.state, selfUpdate: !!updater.portableExe } : null;
}

// Einstellungsfenster (falls offen) über den Update-Zustand informieren
function sendUpdateToSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('update-state', updateInfo());
}

function onUpdateState(st) {
  sendUpdateToSettings();
  sendUpdateToPopup();
  let notice;
  if (st.status === 'available') {
    // Neue Version: Pop-up zeigen (bleibt, bis aktualisiert wurde)
    manualUpdateCheck = false;
    showUpdatePopup();
  } else if (st.status === 'ready' && updateRequested) {
    // Download fertig -> kurz "Fertig" zeigen, dann in der neuen Version neu starten
    setTimeout(() => {
      if (!updater.restart(() => app.quit())) createTab(RELEASES_PAGE, true);
    }, 1200);
  } else if (manualUpdateCheck && st.status === 'none') {
    manualUpdateCheck = false;
    notice = L('main.updateLatest', { v: CURRENT_VERSION });
  } else if (manualUpdateCheck && st.status === 'error') {
    manualUpdateCheck = false;
    notice = L('main.updateCheckFailed', { e: errorText(settings.state.language, st.error) });
  }
  sendState(notice ? { notice } : {});
}

function checkForUpdatesManually() {
  if (!updater) return;
  manualUpdateCheck = true;
  lastUpdateCheck = Date.now();
  updater.check();
}

// "Jetzt herunterladen und neu starten" im Pop-up
function startUpdate() {
  if (!updater) return;
  if (!updater.portableExe) {           // aus dem Quellcode gestartet: nur Download-Seite öffnen
    createTab(RELEASES_PAGE, true);
    return;
  }
  updateRequested = true;
  const st = updater.state.status;
  if (st === 'ready') updater.restart(() => app.quit());
  else if (st === 'downloading') return;
  else if (updater.release) updater.download(app.getPath('downloads'));
  else updater.check();
}

// Update-Knopf in der Tab-Leiste: Pop-up wieder nach vorne holen
function updateAction() {
  if (!updater) return;
  if (['available', 'downloading', 'ready', 'error'].includes(updater.state.status)) showUpdatePopup();
  else checkForUpdatesManually();
}

// ---------------------------------------------------------------------------
// Update-Pop-up: "Neue Version verfügbar" – ohne Schließen-Knopf
// ---------------------------------------------------------------------------
function sendUpdateToPopup() {
  if (updatePopup && !updatePopup.isDestroyed()) updatePopup.webContents.send('update-state', updateInfo());
}

function showUpdatePopup() {
  if (updatePopup && !updatePopup.isDestroyed()) {
    if (!updatePopup.isVisible()) updatePopup.showInactive();
    updatePopup.setAlwaysOnTop(true, 'screen-saver');
    return;
  }
  const width = 440;
  const height = 250;
  const ref = win && !win.isDestroyed() && win.isVisible() && !miniMode ? win.getBounds() : screen.getPrimaryDisplay().workArea;
  const bounds = fitToWorkArea({
    x: ref.x + Math.round((ref.width - width) / 2),
    y: ref.y + Math.round((ref.height - height) / 2),
    width,
    height
  });
  updatePopup = new BrowserWindow({
    ...bounds,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: false,            // kein Schließen – erst nach dem Update weg
    backgroundColor: '#0b0806',
    title: 'Update – YouTube Overlay',
    icon: ICON_PATH,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  updatePopup.setAlwaysOnTop(true, 'screen-saver');
  updatePopup.loadFile(path.join(__dirname, 'update.html'));
  // showInactive: WoW behält Tastatur und Maus, bis man das Pop-up anklickt
  updatePopup.once('ready-to-show', () => { if (updatePopup) updatePopup.showInactive(); });
  updatePopup.on('closed', () => { updatePopup = null; });
}

const isFromPopup = (event) => !!updatePopup && !updatePopup.isDestroyed() && event.sender === updatePopup.webContents;

ipcMain.handle('update:get', (event) => {
  if (!isFromPopup(event)) return null;
  return { version: CURRENT_VERSION, update: updateInfo(), theme: settings.state.theme, lang: settings.state.language };
});
ipcMain.on('update:start', (event) => { if (isFromPopup(event)) startUpdate(); });

// ---------------------------------------------------------------------------
// Tray-Symbol (unten rechts in der Taskleiste) – funktioniert immer,
// auch im Durchklick-Modus oder wenn ein Hotkey nicht geht.
// ---------------------------------------------------------------------------
const withKey = (text, name) => {
  const accel = settings && settings.hotkeys[name];
  return accel ? `${text}\t${formatAccelerator(accel, settings.state.language)}` : text;
};

function createTray() {
  const img = nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16, quality: 'best' });
  tray = new Tray(img);
  tray.setToolTip(`YouTube Overlay ${CURRENT_VERSION}`);
  // Linksklick: Overlay zeigen und Durchklicken ausschalten
  tray.on('click', () => {
    if (!win) return;
    if (clickThrough) setClickThrough(false);
    if (!win.isVisible() || win.isMinimized()) toggleVisible();
  });
  updateTray();
}

function updateTray() {
  if (!tray || tray.isDestroyed()) return;
  const visible = !!win && win.isVisible() && !win.isMinimized();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'YouTube Overlay', enabled: false },
    { type: 'separator' },
    { label: withKey(visible ? L('tray.hide') : L('tray.show'), 'toggleVisible'), click: () => toggleVisible() },
    { label: withKey(L('tray.clickThrough'), 'clickThrough'), type: 'checkbox', checked: clickThrough, click: () => setClickThrough(!clickThrough) },
    { label: withKey(L('tray.split'), 'toggleSplit'), type: 'checkbox', checked: split.on, click: () => setSplit(!split.on) },
    { label: withKey(L('tray.focus'), 'toggleFocus'), type: 'checkbox', checked: !!(settings && settings.state.focusMode), click: () => setFocusMode(!settings.state.focusMode) },
    { label: withKey(L('tray.bar'), 'toggleBar'), type: 'checkbox', checked: !!(settings && settings.state.barVisible), click: () => setBarVisible(!settings.state.barVisible) },
    { label: withKey(miniMode ? L('tray.miniRestore') : L('tray.mini'), 'toggleMini'), click: () => toggleMini() },
    { label: withKey(maximized ? L('tray.normal') : L('tray.maximize'), 'toggleMaximize'), click: () => toggleMaximize() },
    { label: L('tray.adblock'), type: 'checkbox', checked: settings.state.adblock !== false, click: () => setAdblock(settings.state.adblock === false) },
    { label: L('tray.reset'), click: () => resetWindowPosition() },
    { label: L('tray.settings'), click: () => openSettingsWindow() },
    { label: L('tray.tour'), click: () => startTour() },
    updater && updater.state.status === 'ready'
      ? { label: L('tray.updateInstall'), click: () => updateAction() }
      : updater && updater.state.status === 'available'
        ? { label: L('tray.updateDownload', { v: updater.state.latest }), click: () => updateAction() }
        : { label: L('tray.updateCheck', { v: CURRENT_VERSION }), click: () => checkForUpdatesManually() },
    { type: 'separator' },
    { label: withKey(L('tray.quit'), 'quitApp'), click: () => app.quit() }
  ]));
}

// ---------------------------------------------------------------------------
// Globale Hotkeys (funktionieren auch, während WoW im Vordergrund ist)
// ---------------------------------------------------------------------------
const hotkeyActions = {
  toggleVisible: () => toggleVisible(),
  quitApp: () => app.quit(),
  toggleMaximize: () => toggleMaximize(),
  toggleMini: () => toggleMini(),
  toggleFocus: () => setFocusMode(!settings.state.focusMode),
  toggleSplit: () => setSplit(!split.on),
  playPause: () => playerCommand('playPause'),
  seekBack: () => playerCommand('seekBack'),
  seekForward: () => playerCommand('seekForward'),
  mute: () => { playerCommand('mute'); ytMuted = !ytMuted; volumeSetAt = Date.now(); sendState(); },
  clickThrough: () => setClickThrough(!clickThrough),
  toggleBar: () => setBarVisible(!settings.state.barVisible),
  cinema: () => playerCommand('cinema'),
  opacityUp: () => setOpacity(settings.state.opacity + OPACITY_STEP),
  opacityDown: () => setOpacity(settings.state.opacity - OPACITY_STEP),
  volumeUp: () => changeVolume(VOLUME_STEP),
  volumeDown: () => changeVolume(-VOLUME_STEP),
  shortsNext: () => shortsStep('next'),
  shortsPrev: () => shortsStep('prev')
};

function registerHotkeys() {
  failedHotkeys.length = 0;
  failedHotkeyNames.length = 0;
  for (const [name, action] of Object.entries(hotkeyActions)) {
    const accel = settings.hotkeys[name];
    if (!accel) continue; // leer = deaktiviert
    let ok = false;
    try {
      ok = globalShortcut.register(accel, action);
    } catch (_) {
      ok = false;
    }
    if (!ok) {
      failedHotkeyNames.push(name);
      failedHotkeys.push(`${L('hk.' + name)} (${formatAccelerator(accel, settings.state.language)})`);
      console.warn(`Hotkey konnte nicht registriert werden: ${accel} (${name})`);
    }
  }
}

function suspendHotkeys() {
  globalShortcut.unregisterAll();
  hotkeysSuspended = true;
}

function resumeHotkeys() {
  if (!hotkeysSuspended) return;
  hotkeysSuspended = false;
  registerHotkeys();
  sendState({ hotkeysChanged: true });
}

// Prüft eine Tastenkombination: gültig? schon von einem anderen Programm belegt?
function testAccelerator(accel) {
  if (typeof accel !== 'string' || !accel) return { ok: false, reason: 'leer' };
  let ok = false;
  try {
    ok = globalShortcut.register(accel, () => {});
  } catch (_) {
    return { ok: false, reason: 'ungueltig' };
  }
  if (ok) globalShortcut.unregister(accel);
  return ok ? { ok: true } : { ok: false, reason: 'belegt' };
}

// ---------------------------------------------------------------------------
// Einstellungsfenster (Hotkeys ändern)
// ---------------------------------------------------------------------------
function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  // Mittig über dem Overlay platzieren
  const width = 460;
  const height = 820;
  const ref = win ? win.getBounds() : screen.getPrimaryDisplay().workArea;
  const bounds = fitToWorkArea({
    x: ref.x + Math.round((ref.width - width) / 2),
    y: ref.y + Math.round((ref.height - height) / 2),
    width,
    height
  });

  // Solange das Fenster offen ist, sind die globalen Hotkeys aus,
  // damit man jede Kombination aufnehmen kann.
  suspendHotkeys();

  settingsWin = new BrowserWindow({
    ...bounds,
    parent: win || undefined,
    icon: ICON_PATH,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#0b0806',
    title: L('main.settingsTitle'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  settingsWin.setAlwaysOnTop(true, 'screen-saver');
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.once('ready-to-show', () => { settingsWin.show(); settingsWin.focus(); });
  settingsWin.on('closed', () => {
    settingsWin = null;
    previewTheme = null;
    sendState();
    resumeHotkeys();
  });
}

const isFromSettings = (event) => !!settingsWin && !settingsWin.isDestroyed() && event.sender === settingsWin.webContents;

ipcMain.handle('hotkeys:get', (event) => {
  if (!isFromSettings(event)) return null;
  return {
    hotkeys: settings.hotkeys,
    defaults: DEFAULT_HOTKEYS,
    labels: Object.fromEntries(Object.keys(HOTKEY_LABELS).map((n) => [n, L('hk.' + n)])),
    options: {
      adblock: settings.state.adblock !== false,
      theme: settings.state.theme,
      showBookmarks: settings.state.showBookmarks !== false,
      focusMode: settings.state.focusMode,
      focusOpacity: settings.state.focusOpacity,
      language: settings.state.language
    },
    languages: LANGUAGES,
    themes: THEMES.map((t) => ({ id: t.id, name: L('theme.' + t.id) })),
    failed: [...failedHotkeyNames],
    version: CURRENT_VERSION,
    update: updateInfo()
  };
});

ipcMain.handle('hotkeys:test', (event, accel) => {
  if (!isFromSettings(event)) return { ok: false, reason: 'ungueltig' };
  return testAccelerator(accel);
});

ipcMain.handle('hotkeys:save', (event, map, options) => {
  if (!isFromSettings(event)) return { ok: false, failed: [] };
  if (options && typeof options.adblock === 'boolean' && options.adblock !== (settings.state.adblock !== false)) {
    setAdblock(options.adblock);
  }
  if (options && LANG_IDS.has(options.language) && options.language !== settings.state.language) {
    settings.state.language = options.language;
    sendState();          // Leiste + Tray in neuer Sprache
  }
  if (options && Number.isFinite(Number(options.focusOpacity))) setFocusOpacity(options.focusOpacity);
  if (options && typeof options.focusMode === 'boolean' && options.focusMode !== settings.state.focusMode) {
    setFocusMode(options.focusMode, false);
  }
  if (options && typeof options.showBookmarks === 'boolean' && options.showBookmarks !== (settings.state.showBookmarks !== false)) {
    settings.state.showBookmarks = options.showBookmarks;
    bookmarksChanged();
  }
  if (options && THEME_IDS.has(options.theme)) {
    settings.state.theme = options.theme;
    previewTheme = null;
    sendState();
  }
  settings.hotkeys = sanitizeHotkeys(map);
  saveSettingsNow();
  // Probeweise registrieren, um belegte Kombinationen zu melden;
  // aktiv werden sie erst, wenn das Fenster geschlossen wird.
  globalShortcut.unregisterAll();
  registerHotkeys();
  globalShortcut.unregisterAll();
  return { ok: true, failed: [...failedHotkeys] };
});

ipcMain.on('theme:preview', (event, id) => {
  if (!isFromSettings(event) || !THEME_IDS.has(id)) return;
  previewTheme = id;
  sendState();
});

ipcMain.on('settings:check-update', (event) => {
  if (isFromSettings(event)) checkForUpdatesManually();
});

ipcMain.on('settings:close', (event) => {
  if (isFromSettings(event)) settingsWin.close();
});

// ---------------------------------------------------------------------------
// IPC von der Steuerleiste
// ---------------------------------------------------------------------------
const fromBar = (event) => !!win && event.sender === win.webContents;

ipcMain.on('navigate', (e, input) => { if (fromBar(e)) navigateInput(input); });
ipcMain.on('home', (e) => {
  if (!fromBar(e)) return;
  if (activeTab === 'yt') navigate(HOME_URL);
  else activeView().webContents.loadURL(START_PAGE).catch(() => {});
});
ipcMain.on('back', (e) => {
  if (!fromBar(e)) return;
  const h = activeView().webContents.navigationHistory;
  if (h.canGoBack()) h.goBack();
});
ipcMain.on('reload', (e) => { if (fromBar(e)) activeView().webContents.reload(); });
ipcMain.on('update:action', (e) => { if (fromBar(e)) updateAction(); });
ipcMain.on('bookmark:toggle', (e) => { if (fromBar(e)) toggleBookmark(); });
ipcMain.on('bookmark:open', (e, id, newTab) => { if (fromBar(e)) openBookmark(String(id), !!newTab); });
ipcMain.on('bookmark:menu', (e, id) => { if (fromBar(e)) bookmarkMenu(String(id)); });
ipcMain.on('bookmark:rename', (e, id, title) => { if (fromBar(e)) renameBookmark(String(id), title); });
ipcMain.on('bookmark:move', (e, id, toIndex) => { if (fromBar(e)) moveBookmark(String(id), toIndex); });
ipcMain.on('tab:new', (e) => { if (fromBar(e)) { createTab(START_PAGE, true); focusAddressBar(); } });
ipcMain.on('tab:activate', (e, id) => { if (fromBar(e)) activateTab(id === 'yt' ? 'yt' : Number(id)); });
ipcMain.on('tab:close', (e, id) => { if (fromBar(e)) closeTab(Number(id)); });
ipcMain.on('split:toggle', (e) => { if (fromBar(e)) setSplit(!split.on); });
ipcMain.on('tour:end', (e) => { if (fromBar(e)) endTour(); });
ipcMain.on('settings:start-tour', (e) => {
  if (!isFromSettings(e)) return;
  settingsWin.close();
  setTimeout(startTour, 300);
});
ipcMain.on('twitch:toggle', (e) => { if (fromBar(e)) { if (twitchActive()) stopTwitch(); else startTwitch(); } });
ipcMain.on('twitch:open', (e, channel) => { if (fromBar(e)) startTwitch(String(channel || '')); });
ipcMain.on('split:drag-start', (e) => { if (fromBar(e)) startSplitDrag(); });
ipcMain.on('split:drag-end', (e) => { if (fromBar(e)) endSplitDrag(); });
ipcMain.on('split:reset', (e) => { if (fromBar(e)) setSplitRatio(0.5); });
ipcMain.on('set-opacity', (_e, value) => {
  const v = Number(value);
  if (Number.isFinite(v)) setOpacity(v);
});
ipcMain.on('toggle-click-through', () => setClickThrough(!clickThrough));
ipcMain.on('toggle-focus', (e) => { if (fromBar(e)) setFocusMode(!settings.state.focusMode); });
ipcMain.on('toggle-bar', () => setBarVisible(!settings.state.barVisible));
ipcMain.on('cinema', () => { activateTab('yt'); playerCommand('cinema'); });
ipcMain.on('minimize', (e) => { if (fromBar(e)) toggleMini(); });
ipcMain.on('play-pause', (e) => { if (fromBar(e)) playerCommand('playPause'); });
ipcMain.on('set-volume', (e, value) => { if (fromBar(e)) setVolume(value); });
ipcMain.on('toggle-mute', (e) => {
  if (!fromBar(e)) return;
  playerCommand('mute');
  ytMuted = !ytMuted;
  volumeSetAt = Date.now();
  sendState();
});
ipcMain.on('toggle-maximize', () => toggleMaximize());
ipcMain.on('hide', () => toggleVisible());
ipcMain.on('close', () => { if (win) win.close(); });
ipcMain.on('open-settings', () => openSettingsWindow());
ipcMain.on('shorts', () => navigate(SHORTS_URL));

// ---------------------------------------------------------------------------
// App-Lebenszyklus
// ---------------------------------------------------------------------------
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.whenReady().then(() => {
  settings = loadSettings();
  saveSettingsNow();
  createWindow();
  registerHotkeys();
  createTray();
  setupUpdater();
  if (!settings.state.tourDone) {
    setTimeout(() => { if (win && !win.isDestroyed()) startTour(); }, 2500);
  }
});

app.on('before-quit', () => {
  if (updatePopup && !updatePopup.isDestroyed()) updatePopup.destroy();
  if (updater && updater.state.status === 'ready') {
    updater.restart(() => {}, { launch: false });
  }
  if (win) rememberBounds();
  saveSettingsNow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (tray && !tray.isDestroyed()) tray.destroy();
});

app.on('window-all-closed', () => {
  app.quit();
});
