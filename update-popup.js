'use strict';
// Pop-up "Neue Version verfügbar": ein Knopf -> herunterladen -> automatisch neu starten.

const api = window.overlay;
const $ = (id) => document.getElementById(id);
let selfUpdate = true;

function render(u) {
  if (!u) return;
  if (u.status === 'checking' || u.status === 'idle' || u.status === 'none') return; // Zwischenstände ignorieren
  if (u.latest) $('latest').textContent = u.latest;
  selfUpdate = u.selfUpdate !== false;
  const btn = $('btnUpdate');
  const hint = $('hint');
  const bar = $('progress');
  hint.classList.remove('warn');

  if (u.status === 'available') {
    bar.style.display = 'none';
    btn.disabled = false;
    btn.textContent = selfUpdate ? '⬇ Jetzt herunterladen und neu starten' : 'Download-Seite öffnen';
    hint.textContent = selfUpdate
      ? 'Das Overlay wird danach automatisch neu gestartet.'
      : 'Aus dem Quellcode gestartet – bitte die neue Version von der Download-Seite holen.';
  } else if (u.status === 'downloading') {
    bar.style.display = 'block';
    $('fill').style.width = `${u.progress || 0}%`;
    btn.disabled = true;
    btn.textContent = `Wird heruntergeladen … ${u.progress || 0} %`;
    hint.textContent = 'Du kannst währenddessen weiterspielen.';
  } else if (u.status === 'ready') {
    bar.style.display = 'block';
    $('fill').style.width = '100%';
    btn.disabled = true;
    btn.textContent = '↻ Wird neu gestartet …';
    hint.textContent = 'Fertig – das Overlay startet gleich in der neuen Version.';
  } else if (u.status === 'error') {
    bar.style.display = 'none';
    btn.disabled = false;
    btn.textContent = '↻ Erneut versuchen';
    hint.textContent = `Das hat nicht geklappt: ${u.error || 'unbekannter Fehler'}`;
    hint.classList.add('warn');
  }
}

$('btnUpdate').addEventListener('click', () => {
  if ($('btnUpdate').disabled) return;
  if (selfUpdate) {
    $('btnUpdate').disabled = true;
    $('btnUpdate').textContent = 'Wird gestartet …';
  }
  api.startUpdate();
});

// Esc / Alt+F4 sollen das Pop-up nicht schließen
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') e.preventDefault();
});

api.onUpdateState(render);

(async () => {
  const data = await api.getUpdateInfo();
  if (!data) return;
  document.documentElement.dataset.theme = data.theme || 'gold';
  $('current').textContent = data.version;
  render(data.update);
})();
