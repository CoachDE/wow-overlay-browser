'use strict';
// Pop-up "Neue Version verfügbar": ein Knopf -> herunterladen -> automatisch neu starten.

const api = window.overlay;
let lang = 'de';
const T = (key, vars) => tr(lang, key, vars);
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
    btn.textContent = selfUpdate ? T('up.btnUpdate') : T('up.btnPage');
    hint.textContent = selfUpdate ? T('up.hintRestart') : T('up.hintSource');
  } else if (u.status === 'downloading') {
    bar.style.display = 'block';
    $('fill').style.width = `${u.progress || 0}%`;
    btn.disabled = true;
    btn.textContent = T('up.downloading', { p: u.progress || 0 });
    hint.textContent = T('up.keepPlaying');
  } else if (u.status === 'ready') {
    bar.style.display = 'block';
    $('fill').style.width = '100%';
    btn.disabled = true;
    btn.textContent = T('up.restarting');
    hint.textContent = T('up.done');
  } else if (u.status === 'error') {
    bar.style.display = 'none';
    btn.disabled = false;
    btn.textContent = T('up.retry');
    hint.textContent = T('up.failed', { e: errorText(lang, u.error) });
    hint.classList.add('warn');
  }
}

$('btnUpdate').addEventListener('click', () => {
  if ($('btnUpdate').disabled) return;
  if (selfUpdate) {
    $('btnUpdate').disabled = true;
    $('btnUpdate').textContent = T('up.starting');
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
  lang = data.lang || 'de';
  applyI18n(document, lang);
  document.title = T('up.windowTitle');
  $('current').textContent = data.version;
  render(data.update);
})();
