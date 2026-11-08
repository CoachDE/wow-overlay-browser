'use strict';
// Läuft in der YouTube-Seite des Overlays, bevor YouTube startet.
// Das Overlay-Fenster selbst darf nicht in den echten Vollbildmodus (es würde sonst den
// ganzen Bildschirm über WoW bedecken). Deshalb meldet der Browser "Vollbild nicht verfügbar"
// und YouTube zeigt "Vollbild ist nicht verfügbar" an. Vollbild für das Video-Element
// funktioniert aber trotzdem – es füllt dann einfach das Overlay. Hier sagen wir YouTube,
// dass Vollbild erlaubt ist, damit der Vollbild-Knopf und die Taste F wieder gehen.

const { webFrame } = require('electron');

webFrame.executeJavaScript(`(() => {
  try {
    const yes = { get() { return true; }, configurable: true };
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', yes);
    Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', yes);
  } catch (e) { /* nichts zu tun */ }
})()`);
