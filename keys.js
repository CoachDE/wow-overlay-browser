'use strict';
// Gemeinsame Hilfen für Tastenkombinationen (Leiste + Einstellungsfenster)

const KEY_NAMES_DE = {
  Control: 'Strg', Alt: 'Alt', Shift: 'Umschalt', Super: 'Win',
  PageUp: 'Bild↑', PageDown: 'Bild↓', Up: '↑', Down: '↓', Left: '←', Right: '→',
  Space: 'Leertaste', Return: 'Enter', Tab: 'Tab', Backspace: 'Rücktaste',
  Delete: 'Entf', Insert: 'Einfg', Home: 'Pos1', End: 'Ende', Plus: '+',
  num0: 'Num 0', num1: 'Num 1', num2: 'Num 2', num3: 'Num 3', num4: 'Num 4',
  num5: 'Num 5', num6: 'Num 6', num7: 'Num 7', num8: 'Num 8', num9: 'Num 9',
  numadd: 'Num +', numsub: 'Num -', nummult: 'Num *', numdiv: 'Num /', numdec: 'Num ,'
};

const KEY_NAMES_EN = {
  Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Super: 'Win',
  PageUp: 'PgUp', PageDown: 'PgDn', Up: '↑', Down: '↓', Left: '←', Right: '→',
  Space: 'Space', Return: 'Enter', Tab: 'Tab', Backspace: 'Backspace',
  Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', Plus: '+',
  num0: 'Num 0', num1: 'Num 1', num2: 'Num 2', num3: 'Num 3', num4: 'Num 4',
  num5: 'Num 5', num6: 'Num 6', num7: 'Num 7', num8: 'Num 8', num9: 'Num 9',
  numadd: 'Num +', numsub: 'Num -', nummult: 'Num *', numdiv: 'Num /', numdec: 'Num .'
};

// "Control+Alt+PageUp" -> "Strg + Alt + Bild↑" (de) bzw. "Ctrl + Alt + PgUp" (en)
function formatAccelerator(accel, lang) {
  if (!accel) return '–';
  const names = lang === 'en' ? KEY_NAMES_EN : KEY_NAMES_DE;
  return accel.split('+').map((k) => names[k] || k).join(' + ');
}

// Windows-Tastencode (KeyboardEvent.keyCode) -> Electron-Tastenname.
// keyCode richtet sich nach dem Tastaturlayout (z. B. QWERTZ), genau wie die globalen Hotkeys.
function keyCodeToName(code) {
  if (code >= 65 && code <= 90) return String.fromCharCode(code);           // A-Z
  if (code >= 48 && code <= 57) return String.fromCharCode(code);           // 0-9
  if (code >= 112 && code <= 135) return 'F' + (code - 111);                // F1-F24
  if (code >= 96 && code <= 105) return 'num' + (code - 96);                // Ziffernblock
  const map = {
    106: 'nummult', 107: 'numadd', 109: 'numsub', 110: 'numdec', 111: 'numdiv',
    32: 'Space', 13: 'Return', 9: 'Tab', 8: 'Backspace', 46: 'Delete', 45: 'Insert',
    36: 'Home', 35: 'End', 33: 'PageUp', 34: 'PageDown',
    37: 'Left', 38: 'Up', 39: 'Right', 40: 'Down',
    187: 'Plus', 188: ',', 189: '-', 190: '.'
  };
  return map[code] || null;
}

// Auch im Hauptprozess (Node) nutzbar
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatAccelerator, keyCodeToName };
}
