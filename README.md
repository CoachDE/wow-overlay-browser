# WoW Overlay Browser

> 🇬🇧 **English:** A borderless YouTube window with a built-in browser that **always stays on top of World of Warcraft** – watch videos, Shorts and Twitch streams, read guides side by side, all without alt-tabbing. Ad blocker, tabs, split view, Twitch mode, mini bar, click-through, focus mode, custom hotkeys, 6 designs and automatic updates. **[Download the latest version](https://github.com/CoachDE/wow-overlay-browser/releases/latest)** (`YouTube-Overlay.exe`, Windows 10/11). The language switches automatically to English if Windows is not German, or manually in ✱ Settings → General → Language.

Ein randloses YouTube-Fenster mit eingebautem Browser, das **immer über World of Warcraft liegt**. Du kannst Videos und Shorts schauen, Guides lesen und beliebige Websites öffnen, während du spielst, und alles per Maus oder Hotkey steuern, **ohne aus WoW rauszutabben**.

Mit Werbeblocker, Browser-Tabs, geteilter Ansicht, Twitch-Modus, Mini-Leiste, Durchklick-Modus, Fokus-Modus, frei belegbaren Hotkeys, 6 Designs und Deutsch/Englisch.

## ⬇ Download

**[Neueste Version herunterladen](https://github.com/CoachDE/wow-overlay-browser/releases/latest)** → dort unter *Assets* die Datei **`YouTube-Overlay.exe`** anklicken.

- Keine Installation nötig: Die .exe einfach speichern (z. B. auf dem Desktop) und per Doppelklick starten.
- **Beim ersten Start** erklärt eine kurze **Tour** die Knöpfe der Leiste (überspringbar, jederzeit wieder unter ✱ Einstellungen → „Tour starten“ oder im Tray-Menü).
- **Updates** (ab Version 1.6.0, geprüft beim Start, alle 30 Minuten und beim Benutzen des Overlays): Gibt es eine neue Version, erscheint im Overlay das Fenster **„Neue Version verfügbar“** mit dem Knopf **„Jetzt herunterladen und neu starten“**. Ein Klick lädt die Version (mit Fortschrittsbalken, du kannst weiterspielen) und startet das Overlay danach automatisch neu. Das Fenster lässt sich nicht wegklicken – es bleibt, bis aktualisiert wurde. Die .exe wird an Ort und Stelle ersetzt, Verknüpfungen bleiben gültig.
- Die **aktuelle Version** steht unten in den Einstellungen (✱), dort gibt es auch „Nach Updates suchen“.
- Nur für **Windows 10/11 (64 Bit)**.
- Einstellungen werden unter `%APPDATA%\YouTube Overlay` gespeichert.

## Wichtig: WoW-Einstellung

Das Overlay liegt nur über WoW, wenn WoW **nicht im exklusiven Vollbild** läuft:

> WoW → Optionen → Grafik → Anzeigemodus: **Fenster (Vollbild)** bzw. **Fenster**

## Starten

- **Fertige App:** `YouTube-Overlay.exe` aus dem [Download](#-download), oder
- aus dem Quellcode (Node.js nötig): Doppelklick auf **`Start.bat`** bzw. im Terminal `npm install` und dann `npm start`

Die .exe ist nicht digital signiert. Windows SmartScreen zeigt deshalb beim ersten Start evtl. „Der Computer wurde durch Windows geschützt“ → **Weitere Informationen → Trotzdem ausführen**.

Beim ersten Start fragt YouTube nach der Cookie-Zustimmung. Das musst du nur einmal machen; Zustimmung und Login bleiben gespeichert.

## Bedienung

**Leiste oben** (zum Verschieben an der Leiste ziehen, Größe am Rand ändern):

| Knopf | Funktion |
|---|---|
| ← ⌂ ↻ | Zurück, Startseite, Neu laden (jeweils für den aktiven Tab) |
| Eingabefeld | Im YouTube-Tab: YouTube-Link, Video-ID **oder Suchbegriff**. Im Browser-Tab: **Adresse** (z. B. `wowhead.com`) **oder Google-Suche** |
| ◐ Regler | Deckkraft (20–100 %) |
| 🔊 Regler | **YouTube-Lautstärke**. Klick auf den Lautsprecher = stumm, Mausrad über dem Regler = feiner einstellen. Gilt auch für jedes neue Video und bleibt mit YouTubes eigenem Regler synchron |
| ▯ Shorts | **YouTube Shorts** öffnen. Das Overlay wird automatisch hochkant und kehrt beim Verlassen der Shorts zur normalen Größe zurück (beide Größen werden gemerkt) |
| ⛶ | **Kino-Modus**: Das Video füllt das ganze Overlay (YouTubes eigener Vollbild-Knopf und die Taste **F** machen dasselbe) |
| 👁 | **Fokus-Modus**: Ist die Maus nicht über dem Overlay (und du spielst in WoW), blendet es nach 1 Sekunde weich auf eine einstellbare Deckkraft ab (Standard 30 %) – Maus drüber oder Klick hinein = sofort wieder voll sichtbar. Deckkraft einstellbar unter ✱ → Allgemein |
| ↖ | **Durchklicken**: Mausklicks gehen durch das Overlay zu WoW |
| ▲ / ▼ | Leiste ausblenden. **Wieder einblenden:** mit der Maus an den oberen Rand des Overlays fahren, dann klappt die Leiste auf. Mit ▼ bleibt sie dauerhaft sichtbar |
| ✱ | **Einstellungen**: Design, Werbeblocker an/aus, Hotkeys ändern |
| – | **Mini-Leiste**: Das Overlay schrumpft zu einer kleinen Leiste (Play/Pause, Videotitel, Wiederherstellen), die **über WoW bleibt**. Das Video läuft weiter |
| □ | **Maximieren**: Overlay füllt den Bildschirm (über WoW), nochmal = alte Größe |
| ✕ | Beenden |

**Tabs** (Leiste unter der Steuerleiste):

- Der **YouTube-Tab** ist immer da. Die Player-Hotkeys (Play/Pause, Vorspulen …) steuern immer YouTube, auch wenn gerade ein anderer Tab offen ist – so kannst du einen Guide lesen und nebenbei das Video steuern.
- **+** (oder `Strg+T`) öffnet einen **Browser-Tab** für beliebige Websites. Links aus YouTube-Beschreibungen öffnen sich ebenfalls in einem neuen Tab.
- Tab schließen: **×**, Mittelklick oder `Strg+W`. Wechseln: Klick oder `Strg+Tab`. Adressfeld: `Strg+L`. Neu laden: `F5`. Zurück/Vor: `Alt+←/→`.
- **Rechtsklick** auf Seiten: Link in neuem Tab öffnen, kopieren, einfügen, mit Google suchen, im Windows-Browser öffnen …
- Offene Tabs werden beim nächsten Start wiederhergestellt (geladen wird ein Tab erst, wenn du ihn anklickst).
- **Downloads** landen direkt im Windows-Ordner *Downloads*, die Leiste zeigt kurz an, wenn sie fertig sind.
- Sicherheit: Websites bekommen **keinen** Zugriff auf Kamera, Mikrofon, Standort oder Benachrichtigungen.

**Geteilte Ansicht** (◫-Knopf oder `Strg+Alt+S`): zwei Seiten nebeneinander im Overlay – links YouTube, rechts der zuletzt benutzte Browser-Tab (z. B. ein Guide). Ein Klick auf einen anderen Tab wechselt die rechte Seite. Den **Trennbalken** mit der Maus ziehen, um die Aufteilung zu ändern (Doppelklick = 50 : 50). In der Tab-Leiste zeigen ◧ und ◨, welche Tabs gerade zu sehen sind.

**Twitch-Modus** (lila Knopf): Stream als reiner Player links, **Chat** rechts. Auf einer Twitch-Kanalseite einfach den Knopf klicken – oder den Knopf drücken und im Adressfeld den Kanalnamen eingeben. Nochmal klicken beendet den Twitch-Modus. Beim ersten Mal fragt Twitch einmalig nach Cookies; der Twitch-Login bleibt gespeichert.

**Sprache**: Deutsch oder Englisch unter ✱ → Allgemein → Sprache. Beim ersten Start richtet sie sich nach der Windows-Sprache.

**Lesezeichen** (Leiste unter den Tabs):

- **☆** rechts neben dem Adressfeld (oder `Strg+D`) speichert die aktuelle Seite – YouTube-Video oder Website. Der Stern ploppt auf, fliegt in die Leiste, und das neue Lesezeichen leuchtet golden auf. Nochmal klicken (★) entfernt es wieder (es verblasst).
- **Klick** öffnet: YouTube-Links im YouTube-Tab, Websites im aktuellen Browser-Tab. **Mittelklick** oder `Strg`+Klick: neuer Tab.
- **Rechtsklick**: in neuem Tab öffnen, umbenennen, Adresse kopieren, löschen. **Ziehen** sortiert um, das **Mausrad** scrollt bei vielen Lesezeichen.
- Auch per Rechtsklick auf Links und Seiten: *Als Lesezeichen speichern*.
- Die Leiste erscheint, sobald es ein Lesezeichen gibt; ausblenden in ✱ → Allgemein.

**Designs** (✱ → Design): **Gold**, **Frost**, **Smaragd**, **Arkan**, **Blut** und **Schlicht**. Ein Klick zeigt das Design sofort als Vorschau, „Speichern“ übernimmt es, „Abbrechen“ verwirft es.

**Tray-Symbol** (unten rechts in der Taskleiste, goldene Raute – unter Windows 11 evtl. hinter dem **^**-Pfeil versteckt; man kann es von dort direkt in die Taskleiste ziehen): Rechtsklick öffnet ein Menü mit Overlay anzeigen/ausblenden, Durchklicken, Leiste, Mini-Leiste, Maximieren, Werbeblocker, Fenster zurücksetzen, Einstellungen und Beenden. Ein Linksklick holt das Overlay zurück und schaltet Durchklicken aus. **Das funktioniert immer, auch wenn ein Hotkey nicht geht.**

## Werbeblocker

Ist standardmäßig **an** und lässt sich in den Einstellungen (✱) oder im Tray-Menü ausschalten. Er arbeitet auf zwei Ebenen:

1. **Filterlisten** (Ghostery-Adblocker mit den üblichen Werbe-Listen): blockieren Werbe-Anfragen, blenden Werbeflächen aus und entfernen die Werbung schon aus den Videodaten von YouTube. Die Listen werden alle 3 Tage automatisch aktualisiert.
2. **Ad-Skipper**: Rutscht trotzdem ein Werbeclip durch, wird er stummgeschaltet, ans Ende gespult und „Überspringen“ geklickt. Ton und Geschwindigkeit werden danach wiederhergestellt. Werbe-Shorts werden übersprungen.

YouTube ändert seine Werbung regelmäßig. Es kann also vorkommen, dass zeitweise doch etwas durchkommt, bis die Filterlisten nachziehen. Der Werbeblocker läuft nur im YouTube-Fenster des Overlays und hat mit WoW nichts zu tun.

## Hotkeys

Die Hotkeys funktionieren auch, während du in WoW bist. Ändern geht über den ✱-Knopf: Klick auf eine Taste und drück die neue Kombination.

| Standard | Funktion |
|---|---|
| `Strg+Alt+Y` | Overlay ein-/ausblenden (holt es auch nach dem Minimieren zurück) |
| `Strg+Alt+X` | Overlay beenden |
| `Strg+Alt+G` | Maximieren / Normalgröße |
| `Strg+Alt+H` | Mini-Leiste / Wiederherstellen |
| `Strg+Alt+T` | Fokus-Modus an/aus |
| `Strg+Alt+S` | Geteilte Ansicht an/aus |
| `Strg+Alt+K` | Play / Pause |
| `Strg+Alt+J` / `Strg+Alt+L` | 10 Sekunden zurück / vor |
| `Strg+Alt+N` | Ton an/aus |
| `Strg+Alt+.` / `Strg+Alt+,` | Lauter / leiser (10 %) |
| `Strg+Alt+↓` / `Strg+Alt+↑` | Nächstes / vorheriges Short |
| `Strg+Alt+F` | Kino-Modus an/aus |
| `Strg+Alt+D` | Durchklicken an/aus |
| `Strg+Alt+B` | Leiste ein-/ausblenden |
| `Strg+Alt+Bild↑` / `Bild↓` | Deckkraft höher / niedriger |

- Im **Durchklick-Modus** reagiert das Overlay nicht auf die Maus. Die Leiste zeigt dann dauerhaft an, wie man es ausschaltet: `Strg+Alt+D` oder Linksklick auf das Tray-Symbol.
- Ist eine Kombination schon von einem anderen Programm belegt, warnt das Hotkey-Fenster.
- Diese Hotkeys werden global abgefangen. Nutzt du in WoW dieselbe Kombination, kommt sie im Spiel nicht mehr an.

## Ist das Bann-sicher?

Das Overlay ist ein **ganz normales, eigenständiges Fenster**, technisch dasselbe wie ein Browser- oder Discord-Fenster, das man über das Spiel legt. Es

- greift **nicht** auf WoW zu: kein Lesen oder Ändern des Spielspeichers, kein Einschleusen von Code (keine DLL-Injection), keine Änderung an WoW-Dateien;
- sendet **keine** Tasten oder Mausklicks an WoW und automatisiert nichts im Spiel. Die Hotkeys steuern nur das Overlay selbst;
- ist **kein Addon** und läuft nicht im Spiel.

Das ist genau die Art Software, die Anti-Cheat-Systeme **nicht** als Bot erkennen, denn Bots müssen ins Spiel eingreifen oder Eingaben automatisieren. Eine Garantie für die Regeln eines Spielebetreibers kann aber niemand außer dem Betreiber selbst geben. Wenn du auf einem **privaten oder inoffiziellen Server** spielst, lies dort kurz die Regeln zu Zusatzprogrammen.

## Selbst bauen (für Entwickler)

Voraussetzung: [Node.js](https://nodejs.org/) 22 oder neuer.

```
npm install
npm start          # App aus dem Quellcode starten
npm run dist       # dist\YouTube-Overlay.exe bauen
```

### Neue Version veröffentlichen

Releases baut GitHub automatisch (siehe `.github/workflows/release.yml`):

1. In `package.json` die `"version"` erhöhen (z. B. `1.2.0`) und committen.
2. Tag setzen und hochladen:
   ```
   git tag -a v1.2.0 -m "Version 1.2.0"
   git push origin main v1.2.0
   ```
3. Nach ein paar Minuten steht die neue `YouTube-Overlay.exe` unter *Releases*.

Alle Apps ab Version 1.6.0 zeigen dann von selbst das Update-Fenster (beim Start und alle 6 Stunden).

## Hinweise

- Links zu anderen Seiten (z. B. in Videobeschreibungen) öffnen sich in einem neuen Tab im Overlay.
- Position, Größe (normal und Shorts), Deckkraft, Design, Hotkeys, offene Tabs und das zuletzt geöffnete Video werden gespeichert.
- Fenster verloren (z. B. nach Monitorwechsel)? Tray-Symbol → **Fenster zurücksetzen**.

## Lizenz

Der Code dieses Projekts steht unter der [MIT-Lizenz](LICENSE). Die App enthält den Werbeblocker [@ghostery/adblocker](https://github.com/ghostery/adblocker) (MPL-2.0) und basiert auf [Electron](https://www.electronjs.org/) (MIT).

Dies ist ein privates Fan-Projekt und steht in keiner Verbindung zu Blizzard Entertainment oder YouTube/Google. „World of Warcraft“ und „YouTube“ sind Marken der jeweiligen Inhaber.
