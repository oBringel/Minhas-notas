
function initSidebar() {
  const btn = document.querySelector('#menuToggle');
  const shell = document.querySelector('#appShell');
  if (!btn || !shell) return;
  try { if (localStorage.getItem('pp-menu-collapsed') === '1') shell.classList.add('is-collapsed'); } catch {}
  btn.addEventListener('click', () => {
    const collapsed = shell.classList.toggle('is-collapsed');
    try { localStorage.setItem('pp-menu-collapsed', collapsed ? '1' : '0'); } catch {}
  });
}

import { fillIcons } from './icons.js';
import { flowerSVG } from './flowers.js';
import { mountEditor } from './editor.js';
import { initScore } from './score.js?v=4';
import {
  createNote, findNote, flushPending, loadAll, loadTrash, loadVacations, purgeNote, restoreNote,
  state, subscribe,
} from './store.js';
import {
  esc, fmtDateTime, isAdmission, isRescission, noteFace, noteMatches, noteSubtitle, showToast,
} from './util.js?v=4';
import { initDashboard, refreshDashboard } from './dashboard.js?v=5';
import { initFiles, refreshFiles } from './files.js';
import { initCalendar, refreshCalendar } from './calendar.js';
import { initVacations, refreshVacations } from './vacations.js';
import { initCalculator } from './calculator.js';
import { initNotice } from './notice.js';

const $ = (sel) => document.querySelector(sel);
const toast = (message) => showToast(message);

let selected = null; // nota aberta na gaveta
let editor = null;

// ---------- Módulos que usam as notas ----------
// Cada aba mostra um tipo de nota. A lista é a mesma; só filtra.
const NOTE_VIEWS = {
  notas: { kind: 'nota', list: '#list-notas', empty: 'Nenhuma nota ainda. Use “Nova nota” para começar.' },
  admissao: { kind: 'admissao', list: '#list-admissao', empty: 'Nenhuma admissão cadastrada ainda.' },
  rescisao: { kind: 'rescisao', list: '#list-rescisao', empty: 'Nenhuma rescisão cadastrada ainda.' },
};
const VIEW_NAMES = ['dashboard', 'notas', 'admissao', 'rescisao', 'ferias', 'calculadora', 'calendario', 'arquivos'];
const terms = { notas: '', admissao: '', rescisao: '' };
let currentView = 'dashboard';

// ---------- Lista de notas ----------
function renderList() {
  const cfg = NOTE_VIEWS[currentView];
  if (!cfg) return;
  const root = $(cfg.list);
  if (!root) return;

  const term = terms[currentView].trim().toLowerCase();
  const notes = state.notes
    .filter((n) => (cfg.kind === 'nota' ? !isAdmission(n) && !isRescission(n) : n.kind === cfg.kind))
    .filter((n) => !term || noteMatches(n, term));

  // Se o foco estava numa nota da lista, devolve depois de redesenhar
  const focusedId = document.activeElement?.closest?.('.note-pick')?.dataset.id;

  if (!notes.length) {
    root.innerHTML = `<div class="empty">${term
      ? 'Nenhuma nota encontrada com essa busca.'
      : cfg.empty}</div>`;
    return;
  }

  root.innerHTML = notes.map((n) => {
    const face = noteFace(n); // só rescisão: carinha e cor conforme o prazo
    const classes = [
      'note-pick',
      isAdmission(n) && 'admissao',
      isRescission(n) && 'rescisao',
      face && `status-${face.key} has-face`,
      n.id === selected && 'active',
    ].filter(Boolean).join(' ');
    return `
    <div class="${classes}" data-id="${n.id}" role="button" tabindex="0">
      <strong>${esc(n.title || 'Sem título')}</strong>
      ${face ? `<span class="face" title="${esc(face.label)}" aria-label="${esc(face.label)}">${face.emoji}</span>` : ''}
      <small>${esc(noteSubtitle(n))}</small>
    </div>`;
  }).join('');

  if (focusedId) root.querySelector(`.note-pick[data-id="${focusedId}"]`)?.focus({ preventScroll: true });
}

// Junta vários avisos seguidos num único redesenho (digitar não trava)
let listQueued = false;
function queueList() {
  if (listQueued) return;
  listQueued = true;
  requestAnimationFrame(() => { listQueued = false; renderList(); });
}

// Um único ouvinte para as três listas (mais leve que um por nota)
for (const cfg of Object.values(NOTE_VIEWS)) {
  const root = $(cfg.list);
  root.onclick = (ev) => {
    const item = ev.target.closest('.note-pick');
    if (item) openNote(item.dataset.id);
  };
  root.onkeydown = (ev) => {
    const item = ev.target.closest?.('.note-pick');
    if (item && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      openNote(item.dataset.id);
    }
  };
}

// Busca de cada módulo (cada um tem a sua)
for (const input of document.querySelectorAll('.view .search')) {
  const view = input.closest('.view')?.dataset.view;
  let timer;
  input.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { terms[view] = input.value; renderList(); }, 120);
  };
}

// ---------- Lixeira ----------
// Excluir não apaga: a nota vai para cá e pode voltar. "Para sempre" só a tira da lista.
const trashBox = $('#trash');
const trashButton = $('#openTrash');
let trashOpen = false;

function renderTrash() {
  const root = $('#trashList');
  if (!root) return;
  if (!state.trash.length) {
    root.innerHTML = '<p class="empty">A lixeira está vazia.</p>';
    return;
  }
  root.innerHTML = state.trash.map((n) => `
    <div class="trash-item" data-id="${n.id}">
      <div class="trash-info">
        <strong>${esc(n.title || 'Sem título')}</strong>
        <small>${esc(noteSubtitle(n) || 'Sem itens')} · excluída em
          ${n.deleted_at ? esc(fmtDateTime(n.deleted_at)) : '—'}</small>
      </div>
      <div class="trash-actions">
        <button type="button" class="secondary small" data-action="restore">Voltar</button>
        <button type="button" class="small danger" data-action="purge">Excluir para sempre</button>
      </div>
    </div>`).join('');
}

async function showTrash(open) {
  trashOpen = open;
  trashBox.hidden = !open;
  trashButton.setAttribute('aria-pressed', String(open));
  if (!open) return;
  renderTrash();
  try { await loadTrash(); } catch (err) { toast(err.message); }
  if (!trashBox.hidden) trashBox.scrollIntoView({ block: 'nearest' });
}

trashButton.onclick = () => showTrash(!trashOpen);
$('#closeTrash').onclick = () => showTrash(false);

$('#trashList').onclick = async (ev) => {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  const item = btn.closest('.trash-item');
  const n = state.trash.find((x) => x.id === item?.dataset.id);
  if (!n) return;
  try {
    if (btn.dataset.action === 'restore') {
      await restoreNote(n);
      toast('Nota de volta! 💗');
      return;
    }
    const ok = window.confirm(`Tirar "${n.title || 'Sem título'}" da lixeira para sempre?\n\n`
      + 'Ela some da lista, mas o conteúdo continua guardado no banco de dados.');
    if (!ok) return;
    await purgeNote(n);
    toast('Nota excluída da lixeira.');
  } catch (err) { toast(err.message); }
};

// ---------- Editor: gaveta que abre em qualquer módulo ----------
const drawer = $('#drawer');

function showEditor() {
  const n = findNote(selected);
  const box = $('#editor');
  editor?.destroy();
  editor = null;
  box.innerHTML = '';

  if (!n) { drawer.hidden = true; return; }
  drawer.hidden = false;

  editor = mountEditor(box, n, {
    allowDelete: true,
    onSaved: () => {
      const id = selected;
      closeEditor();
      $(`${NOTE_VIEWS[currentView]?.list ?? ''} .note-pick[data-id="${id}"]`)?.focus();
    },
    onDeleted: closeEditor,
  });
}

function closeEditor() {
  selected = null;
  showEditor();
  renderList();
}

function openNote(id) {
  selected = id;
  showEditor();
  renderList();
}

$('#drawerBack').onclick = closeEditor;
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !drawer.hidden) closeEditor();
});

// ---------- Criar nota / admissão / rescisão ----------
for (const btn of document.querySelectorAll('[data-new]')) {
  btn.onclick = () => create(btn.dataset.new);
}

async function create(kind) {
  try {
    const n = await createNote(kind);
    const target = kind === 'admissao' ? 'admissao' : kind === 'rescisao' ? 'rescisao' : 'notas';
    if (currentView !== target) go(target);
    openNote(n.id);
    const first = $(isRescission(n) ? '#company' : isAdmission(n) ? '#employee' : '#title');
    if (first) { first.focus({ preventScroll: true }); first.select(); }
  } catch (err) { toast(err.message); }
}

// ---------- Avisos da store ----------
subscribe((kind) => {
  if (kind === 'trash') { renderTrash(); return; }
  if (kind === 'notes') {
    if (selected && !findNote(selected)) { closeEditor(); return; }
  }
  queueList();
  if (kind === 'notes' || kind === 'vacations' || kind === 'pendencias') refreshDashboard();
  if (kind === 'vacations') refreshCalendar();
});

// ---------- Navegação ----------
function go(name) {
  if (!VIEW_NAMES.includes(name)) name = 'dashboard';
  currentView = name;

  for (const view of document.querySelectorAll('.view')) view.hidden = view.dataset.view !== name;
  for (const link of document.querySelectorAll('.menu-link')) {
    const on = link.dataset.view === name;
    link.classList.toggle('active', on);
    if (on) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  // pushState mantém o botão voltar do navegador funcionando entre os módulos
  const hash = `#/${name}`;
  if (location.hash !== hash) history.pushState(null, '', hash);

  if (NOTE_VIEWS[name]) renderList();
  if (name === 'dashboard') refreshDashboard();
  if (name === 'calendario') refreshCalendar();
  if (name === 'arquivos') refreshFiles();
  if (name === 'ferias') refreshVacations();

  if (!drawer.hidden) closeEditor();
  window.scrollTo({ top: 0, behavior: 'auto' });
  // No celular o menu rola: deixa o item aberto à vista
  document.querySelector('.menu-link.active')
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
}

const fromHash = () => go(location.hash.replace('#/', ''));
window.addEventListener('hashchange', fromHash);
window.addEventListener('popstate', fromHash);

// ---------- Janelinha flutuante ----------
const pipButton = $('#openPip');
let pipModule = null;
const loadPip = () => (pipModule ??= import('./pip.js'));

function setPipLabel(open) {
  pipButton.textContent = open ? 'Fechar janelinha' : 'Janelinha';
  pipButton.setAttribute('aria-pressed', String(open));
}

if ('documentPictureInPicture' in window && 'requestIdleCallback' in window) {
  requestIdleCallback(() => loadPip()); // já deixa pronta para abrir na hora do clique
}

pipButton.onclick = async () => {
  if (!('documentPictureInPicture' in window)) {
    toast(window.isSecureContext
      ? 'Este navegador não tem a janelinha flutuante. Use o Chrome ou o Edge no computador.'
      : 'Abra o site por http://localhost:3000 para usar a janelinha flutuante.');
    return;
  }
  try {
    const pip = await loadPip();
    await pip.togglePip({ onClose: () => setPipLabel(false) });
    setPipLabel(pip.isOpen());
  } catch {
    toast('Não consegui abrir a janelinha. Tente de novo.');
  }
};

// ---------- Decoração do cabeçalho ----------
function decorateHero() {
  const deco = $('#deco');
  if (!deco) return; // o cabeçalho novo não usa as florzinhas
  const spots = [
    [48, 70, 70, '#fff', '#ffd966'],
    [118, 38, 52, '#ff7eb6', '#fff3b0'],
    [150, 86, 40, '#ffe3ef', '#d63384'],
    [26, 18, 30, '#ffffff', '#ff7eb6'],
  ];
  deco.innerHTML = spots.map(([x, y, s, p, c]) =>
    `<g transform="translate(${x - s / 2} ${y - s / 2}) scale(${s / 40})">${flowerSVG(p, c).replace(/<\/?svg[^>]*>/g, '')}</g>`
  ).join('');
}

// As carinhas dependem do dia de hoje: reconfere de tempos em tempos
setInterval(queueList, 10 * 60 * 1000);

// Grava o que ainda estava esperando se ela fechar ou atualizar a página
window.addEventListener('pagehide', () => { flushPending(); });

decorateHero();
initScore({ toast });
initDashboard({ toast, navigate: go, openNote, closeDrawer: closeEditor });
initSidebar();

initFiles({ toast });
initCalendar({ toast });
initVacations({ toast });
initCalculator();
initNotice({ toast });

function readBoot() {
  try { return JSON.parse(document.getElementById('boot').textContent); }
  catch { return null; }
}

(async function init() {
  try {
    await loadAll(readBoot()); // usa os dados que já vieram no HTML; se não vieram, busca
  } catch {
    toast('Não consegui falar com o servidor. Veja se ele e o Postgres estão rodando.');
  }
  try { await loadVacations(); } catch { /* as férias são opcionais para o resto funcionar */ }
  go(location.hash.replace('#/', '') || 'dashboard');
  if (!document.querySelector('.view:not([hidden])')) {
    const d = document.querySelector('#view-dashboard'); if (d) d.hidden = false;
  }
})();

// Desenha os ícones estáticos (Lucide) que vieram no HTML.
fillIcons();
