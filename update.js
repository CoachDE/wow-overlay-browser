'use strict';
// Updates über GitHub-Releases.
// - prüft, ob es eine neuere Version gibt (öffentliche GitHub-API, kein Login nötig)
// - lädt die neue .exe herunter (mit Fortschritt), neben die laufende .exe
// - "Neu starten": Die alte App startet die NEUE .exe mit dem Auftrag "--finish-update"
//   und beendet sich. Die neue wartet unsichtbar, bis die alte zu ist, kopiert sich an den
//   Platz der alten Datei (Verknüpfungen bleiben gültig) und startet die App von dort.
//   Ganz ohne Skripte oder Konsolenfenster.
// Nur in der fertigen Einzel-.exe; aus dem Quellcode gestartet wird nur die Download-Seite geöffnet.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REPO = 'CoachDE/wow-overlay-browser';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const CURRENT_VERSION = require('./package.json').version;
const FINISH_FLAG = '--finish-update';
const NO_LAUNCH_FLAG = '--no-launch';   // Update nur installieren, App nicht starten (beim Beenden)
const DOWNLOAD_NAME = /^YouTube-Overlay-\d+\.\d+\.\d+\.exe$/i;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function parseVersion(v) {
  return String(v || '').trim().replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
}

// true, wenn a neuer als b ist
function isNewer(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

async function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function startDetached(file, args = []) {
  const child = spawn(file, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

class Updater {
  constructor({ onChange }) {
    this.onChange = onChange || (() => {});
    this.state = { status: 'idle', current: CURRENT_VERSION }; // idle | checking | none | available | downloading | ready | error
    this.release = null;
    this.downloadPath = null;
  }

  // Läuft als fertige Einzel-.exe? (electron-builder "portable" setzt diese Variable)
  get portableExe() {
    return process.env.PORTABLE_EXECUTABLE_FILE || null;
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  // Neueste Versionsnummer über die Weiterleitung von ".../releases/latest" ->
  // ".../releases/tag/v1.2.3". Das ist eine winzige Anfrage ohne API-Limit und
  // kann deshalb sehr oft gemacht werden. null, wenn es nicht geklappt hat.
  async latestTag() {
    try {
      const res = await fetchWithTimeout(RELEASES_PAGE, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { 'User-Agent': 'wow-overlay-browser-updater' }
      }, 10000);
      const m = String(res.headers.get('location') || '').match(/\/releases\/tag\/v?(\d+\.\d+\.\d+)/i);
      return m ? m[1] : null;
    } catch (_) {
      return null;
    }
  }

  // quiet = automatische Prüfung im Hintergrund: kein "wird geprüft"-Zwischenstand
  // und kein Fehler-Zustand bei kurzen Netzproblemen (nächste Prüfung kommt gleich).
  async check(quiet = false) {
    if (['downloading', 'ready'].includes(this.state.status) || this.inFlight) return this.state;
    this.inFlight = true;
    try {
      return await this.runCheck(quiet);
    } finally {
      this.inFlight = false;
    }
  }

  async runCheck(quiet) {
    if (!quiet) this.set({ status: 'checking', error: null });
    // 1. schnelle Prüfung: gibt es überhaupt eine neuere Version?
    const tag = await this.latestTag();
    if (tag && !isNewer(tag, CURRENT_VERSION)) {
      this.release = null;
      if (!quiet || this.state.status !== 'none' || this.state.latest !== tag) this.set({ status: 'none', latest: tag });
      return this.state;
    }
    // Dieselbe neue Version ist schon bekannt -> nichts weiter tun
    if (tag && this.release && this.release.version === tag && this.state.status === 'available') return this.state;
    // 2. neue Version (oder schnelle Prüfung fehlgeschlagen): Details über die API holen
    try {
      const res = await fetchWithTimeout(API_URL, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'wow-overlay-browser-updater' }
      });
      if (!res.ok) throw new Error(`http:${res.status}`);
      const rel = await res.json();
      const asset = (rel.assets || []).find((a) => /\.exe$/i.test(a.name));
      const latest = String(rel.tag_name || '').replace(/^v/i, '');
      // Pflicht-Update: Die Release-Beschreibung enthält "<!-- min-version: X.Y.Z -->".
      // Ist die laufende Version älter als X.Y.Z, muss aktualisiert werden.
      const m = String(rel.body || '').match(/min-version:\s*v?(\d+\.\d+\.\d+)/i);
      const minVersion = m ? m[1] : null;
      const mandatory = !!(minVersion && isNewer(minVersion, CURRENT_VERSION));
      if (asset && isNewer(latest, CURRENT_VERSION)) {
        this.release = { version: latest, url: asset.browser_download_url, size: asset.size, page: rel.html_url || RELEASES_PAGE };
        this.set({ status: 'available', latest, progress: 0, mandatory });
      } else {
        // z. B. Release gerade erst angelegt, .exe noch nicht hochgeladen -> nächste Prüfung
        this.release = null;
        if (!quiet || this.state.status !== 'none') this.set({ status: 'none', latest: latest || CURRENT_VERSION });
      }
    } catch (err) {
      if (!quiet) this.set({ status: 'error', error: err && err.name === 'AbortError' ? 'timeout' : String(err && err.message || err) });
    }
    return this.state;
  }

  // Lädt die neue .exe neben die alte (oder in den Download-Ordner, falls das nicht geht)
  async download(fallbackDir) {
    if (!this.release || this.state.status === 'downloading') return;
    const dirs = [this.portableExe && path.dirname(this.portableExe), fallbackDir].filter(Boolean);
    this.set({ status: 'downloading', progress: 0, error: null });
    let lastErr = null;
    for (const dir of dirs) {
      const target = path.join(dir, `YouTube-Overlay-${this.release.version}.exe`);
      const part = target + '.part';
      try {
        const res = await fetchWithTimeout(this.release.url, { headers: { 'User-Agent': 'wow-overlay-browser-updater' } }, 10 * 60 * 1000);
        if (!res.ok || !res.body) throw new Error(`download:${res.status}`);
        const total = Number(res.headers.get('content-length')) || this.release.size || 0;
        const out = fs.createWriteStream(part);
        const reader = res.body.getReader();
        let done = 0;
        let lastPct = -1;
        for (;;) {
          const { value, done: finished } = await reader.read();
          if (finished) break;
          if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
          done += value.length;
          const pct = total ? Math.floor((done / total) * 100) : 0;
          if (pct !== lastPct) { lastPct = pct; this.set({ progress: pct }); }
        }
        await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
        if (this.release.size && fs.statSync(part).size !== this.release.size) {
          throw new Error('incomplete');
        }
        fs.renameSync(part, target);
        this.downloadPath = target;
        this.set({ status: 'ready', progress: 100, file: target });
        return;
      } catch (err) {
        lastErr = err;
        try { fs.unlinkSync(part); } catch (_) { /* nichts */ }
      }
    }
    this.set({ status: 'error', error: lastErr && lastErr.name === 'AbortError' ? 'timeout' : String(lastErr && lastErr.message || lastErr) });
  }

  // Startet die neue .exe mit dem Auftrag, die alte zu ersetzen, und beendet diese App.
  // Gibt false zurück, wenn das nicht möglich ist (dann z. B. die Download-Seite öffnen).
  // launch=false: nur installieren (beim normalen Beenden), die App danach nicht starten.
  restart(quit, { launch = true } = {}) {
    if (this.installing || this.state.status !== 'ready' || !this.downloadPath || !this.portableExe) return false;
    this.installing = true;
    // Gewartet wird auf den Start-Prozess der Einzel-.exe – er hält die alte Datei bis zum Ende geöffnet.
    const args = [FINISH_FLAG, this.portableExe, String(process.ppid)];
    if (!launch) args.push(NO_LAUNCH_FLAG);
    startDetached(this.downloadPath, args);
    quit();
    return true;
  }
}

// Läuft in der NEUEN Version, wenn sie mit "--finish-update <alte.exe> <pid>" gestartet wurde.
// Zeigt kein Fenster. Ergebnis: alte .exe enthält die neue Version und ist gestartet.
// Kleines Protokoll in %APPDATA%\YouTube Overlay\error.log (für Fehlersuche)
function logUpdate(app, text) {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'error.log'), `[${new Date().toISOString()}] update: ${text}\n`);
  } catch (_) { /* optional */ }
}

// Ersetzt "target" durch "source". Ist das Ziel gesperrt (z. B. OneDrive lädt die Datei
// gerade hoch, oder der Virenscanner prüft sie), wird es weggerückt (".old") und dann
// kopiert. Versucht es bis zu "seconds" Sekunden lang.
async function replaceFile(source, target, seconds) {
  let lastErr = null;
  for (let i = 0; i < seconds * 2; i++) {
    try {
      fs.copyFileSync(source, target);
      return { ok: true };
    } catch (err) {
      lastErr = err;
      try {
        if (fs.existsSync(target)) {
          const old = target + '.old';
          try { fs.unlinkSync(old); } catch (_) { /* gibt es nicht */ }
          fs.renameSync(target, old);
          fs.copyFileSync(source, target);
          return { ok: true, movedOld: true };
        }
      } catch (err2) { lastErr = err2; }
    }
    await wait(500);
  }
  return { ok: false, error: lastErr };
}

function finishUpdate(app, oldExe, waitPid, launch = true) {
  const self = process.env.PORTABLE_EXECUTABLE_FILE;
  app.whenReady().then(async () => {
    try {
      for (let i = 0; i < 120 && isAlive(waitPid); i++) await wait(500); // max. 60 s
      if (!self || !oldExe || path.resolve(self) === path.resolve(oldExe)) throw new Error('nichts zu tun');
      const r = await replaceFile(self, oldExe, 60);
      if (!r.ok) logUpdate(app, `Ersetzen von ${oldExe} fehlgeschlagen: ${r.error && r.error.code} ${r.error && r.error.message}`);
      if (launch) startDetached(r.ok ? oldExe : self);
    } catch (err) {
      logUpdate(app, `finishUpdate: ${err && err.message}`);
      if (self && launch) startDetached(self);
    }
    app.exit(0);
  });
}

// Selbstheilung: Läuft die App als "YouTube-Overlay-1.2.3.exe" (das Ersetzen beim Update
// hat nicht geklappt), kopiert sie sich auf "YouTube-Overlay.exe" daneben. Verknüpfungen und
// das angeheftete Taskleisten-Symbol zeigen dann wieder auf die neue Version.
// Liefert den Pfad, unter dem die App künftig gestartet werden soll.
async function healInstall(app) {
  const self = process.env.PORTABLE_EXECUTABLE_FILE;
  if (!self || !DOWNLOAD_NAME.test(path.basename(self))) return self || null;
  const target = path.join(path.dirname(self), 'YouTube-Overlay.exe');
  try {
    // Nicht über eine neuere Datei kopieren (z. B. später von Hand heruntergeladen)
    if (fs.existsSync(target) && fs.statSync(target).mtimeMs > fs.statSync(self).mtimeMs) return target;
  } catch (_) { /* weiter */ }
  const r = await replaceFile(self, target, 30);
  if (!r.ok) {
    logUpdate(app, `Selbstheilung nach ${target} fehlgeschlagen: ${r.error && r.error.code}`);
    return self;
  }
  return target;
}

// Fertig benutzte Update-Dateien (YouTube-Overlay-1.2.3.exe) neben der App und im
// Download-Ordner entfernen. Läuft nie während eines Updates (isBusy) und fasst halb
// fertige Downloads (.part) nicht an. Zweiter Versuch später, falls eine Datei gerade
// noch vom beendeten Update-Prozess gesperrt ist.
function cleanupDownloads(extraDirs, isBusy) {
  const self = process.env.PORTABLE_EXECUTABLE_FILE;
  if (!self) return;
  const dirs = [path.dirname(self), ...(extraDirs || [])].filter(Boolean);
  const run = () => {
    if (isBusy && isBusy()) return;
    for (const dir of dirs) {
      try {
        for (const f of fs.readdirSync(dir)) {
          const full = path.join(dir, f);
          const isOld = /^YouTube-Overlay\.exe\.old$/i.test(f);
          if ((DOWNLOAD_NAME.test(f) || isOld) && path.resolve(full) !== path.resolve(self)) {
            try { fs.unlinkSync(full); } catch (_) { /* noch gesperrt – nächster Versuch */ }
          }
        }
      } catch (_) { /* Ordner nicht lesbar */ }
    }
  };
  setTimeout(run, 3000);
  setTimeout(run, 60000);
}

module.exports = { Updater, isNewer, finishUpdate, cleanupDownloads, healInstall, replaceFile, CURRENT_VERSION, RELEASES_PAGE, FINISH_FLAG, NO_LAUNCH_FLAG };
