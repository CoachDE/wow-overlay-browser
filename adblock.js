'use strict';
// Werbeblocker für das YouTube-Overlay.
// Ebene 1: Ghostery-Filterlisten (blockieren Werbe-Anfragen, Werbeflächen und YouTube-Werbedaten).
// Ebene 2: "Ad-Skipper" im Player – falls trotzdem Video-Werbung kommt: stumm, vorspulen, "Überspringen" klicken.
// Alles läuft nur im YouTube-Fenster des Overlays, nichts davon berührt WoW.

const fs = require('fs');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');

const MAX_CACHE_AGE = 3 * 24 * 60 * 60 * 1000; // Filterlisten alle 3 Tage neu laden
const FETCH_TIMEOUT = 20000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), ms))
  ]);
}

function readCache(file) {
  try {
    const st = fs.statSync(file);
    const blocker = ElectronBlocker.deserialize(new Uint8Array(fs.readFileSync(file)));
    return { blocker, age: Date.now() - st.mtimeMs };
  } catch (_) {
    return null; // keine oder unbrauchbare Cache-Datei
  }
}

// Lädt die Filterlisten: frischer Cache -> sofort; sonst aus dem Netz (Ergebnis wird gecacht);
// klappt das Netz nicht, wird notfalls ein alter Cache genommen.
async function loadBlocker(cacheFile) {
  const cached = readCache(cacheFile);
  if (cached && cached.age < MAX_CACHE_AGE) return cached.blocker;
  try {
    const blocker = await withTimeout(ElectronBlocker.fromPrebuiltAdsOnly(fetch), FETCH_TIMEOUT);
    try { fs.writeFileSync(cacheFile, blocker.serialize()); } catch (_) { /* Cache ist optional */ }
    return blocker;
  } catch (err) {
    if (cached) return cached.blocker;
    throw err;
  }
}

// Werbeflächen auf YouTube ausblenden (Startseite, Suche, neben dem Video)
const HIDE_CSS = `
#masthead-ad, #player-ads,
ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-banner-promo-renderer,
ytd-statement-banner-renderer, ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer,
ytd-display-ad-renderer, ytd-compact-promoted-video-renderer, ytd-companion-slot-renderer,
ytd-action-companion-ad-renderer, ytd-player-legacy-desktop-watch-ads-renderer,
ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
ytd-rich-section-renderer:has(ytd-statement-banner-renderer),
ytd-merch-shelf-renderer,
.ytp-ad-overlay-container, .ytp-ad-image-overlay, .ytp-ad-text-overlay {
  display: none !important;
}`;

// Läuft in der YouTube-Seite. Einmal pro Seitenladen installiert, prüft 4x pro Sekunde.
const SKIPPER_JS = `(() => {
  if (window.__ytoSkipper) return true;
  window.__ytoSkipper = true;
  const SKIP = '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot button, button[id^="skip-button"]';
  const changed = new WeakMap(); // video -> { muted, rate } vor der Werbung
  let lastShortsSkip = 0;

  setInterval(() => {
    if (window.__ytoAdblock === false) return;

    for (const id of ['movie_player', 'shorts-player']) {
      const p = document.getElementById(id);
      if (!p) continue;
      const v = p.querySelector('video');
      if (!v) continue;
      const ad = p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting');
      if (ad) {
        if (!changed.has(v)) changed.set(v, { muted: v.muted, rate: v.playbackRate });
        v.muted = true;
        if (v.playbackRate < 16) v.playbackRate = 16;
        if (isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.2) {
          v.currentTime = v.duration - 0.1;
        }
        p.querySelectorAll(SKIP).forEach((b) => b.click());
      } else if (changed.has(v)) {
        // Werbung vorbei: Ton und Geschwindigkeit wie vorher
        const before = changed.get(v);
        changed.delete(v);
        v.muted = before.muted;
        v.playbackRate = before.rate;
      }
    }

    document.querySelectorAll('.ytp-ad-overlay-close-button').forEach((b) => b.click());

    // Werbe-Short im Shorts-Feed: zum nächsten Short springen
    if (location.pathname.startsWith('/shorts') && Date.now() - lastShortsSkip > 1500) {
      const reel = document.querySelector('ytd-reel-video-renderer[is-active]');
      if (reel && reel.querySelector('ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ad-slot-renderer')) {
        const next = document.querySelector('#navigation-button-down button');
        if (next) { next.click(); lastShortsSkip = Date.now(); }
      }
    }
  }, 250);
  return true;
})()`;

// Korrektur für @ghostery/adblocker-electron: Die Bibliothek führt Scriptlets immer im
// Hauptfenster aus, auch wenn die Anfrage aus einem iframe kam. Auf YouTube landen sie so
// mehrfach im selben Dokument ("JSONPath has already been declared", Stack-Überlauf).
// Hier gehen sie an den Frame, der sie angefragt hat, jedes in einer eigenen Funktion.
function fixScriptletInjection(blocker) {
  const original = blocker.onInjectCosmeticFilters;
  blocker.onInjectCosmeticFilters = (event, url, msg) => {
    const frame = event.senderFrame;
    const proxy = {
      frameId: event.frameId,
      processId: event.processId,
      sender: {
        insertCSS: (css, opts) => {
          // CSS nur für das Hauptdokument (iframes von YouTube brauchen keins)
          if (frame && frame === event.sender.mainFrame) return event.sender.insertCSS(css, opts);
          return Promise.resolve('');
        },
        executeJavaScript: (code, gesture) => {
          if (!frame || frame.isDestroyed()) return Promise.resolve();
          return frame.executeJavaScript(`(function () {\n${code}\n})();`, gesture).catch(() => {});
        }
      }
    };
    return original(proxy, url, msg);
  };
}

class YouTubeAdblock {
  constructor({ session, webContents, cacheFile, enabled }) {
    this.session = session;
    this.wc = webContents;
    this.cacheFile = cacheFile;
    this.enabled = !!enabled;
    this.blocker = null;
    this.cssKey = null;
    this.blockedCount = 0;
    this.status = 'laedt'; // 'laedt' | 'aktiv' | 'nur-skipper' (Listen nicht ladbar)

    // Ad-Skipper + CSS bei jedem Seitenladen einsetzen
    this.wc.on('dom-ready', () => this.injectPage());
  }

  // Filterlisten laden. Wartet höchstens "maxWait" ms, damit das Overlay nicht hängt;
  // kommen die Listen später, werden sie dann aktiviert.
  async init(maxWait) {
    const loading = loadBlocker(this.cacheFile)
      .then((blocker) => {
        this.blocker = blocker;
        fixScriptletInjection(this.blocker);
        this.blocker.on('request-blocked', () => { this.blockedCount++; });
        this.status = 'aktiv';
        if (this.enabled) this.blocker.enableBlockingInSession(this.session);
      })
      .catch((err) => {
        this.status = 'nur-skipper';
        console.warn('Werbe-Filterlisten konnten nicht geladen werden:', err && err.message);
      });
    await Promise.race([loading, new Promise((r) => setTimeout(r, maxWait))]);
  }

  async injectPage() {
    try {
      await this.wc.executeJavaScript(`window.__ytoAdblock = ${this.enabled};`);
      if (this.enabled) {
        if (!this.cssKey) this.cssKey = await this.wc.insertCSS(HIDE_CSS, { cssOrigin: 'user' });
        await this.wc.executeJavaScript(SKIPPER_JS);
      }
    } catch (_) {
      // Seite wurde währenddessen verlassen – beim nächsten dom-ready erneut
    } finally {
      // insertCSS gilt nur für das aktuelle Dokument
      this.wc.once('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) this.cssKey = null;
      });
    }
  }

  async setEnabled(on) {
    this.enabled = !!on;
    if (this.blocker) {
      const active = this.blocker.isBlockingEnabled(this.session);
      if (this.enabled && !active) this.blocker.enableBlockingInSession(this.session);
      if (!this.enabled && active) this.blocker.disableBlockingInSession(this.session);
    }
    // Neu laden, damit Filter und Seite sauber zum neuen Zustand passen
    this.cssKey = null;
    this.wc.reload();
  }
}

module.exports = { YouTubeAdblock };
