import { flowerSVG } from './flowers.js';
import { mountEditor } from './editor.js';
import { initScore } from './score.js';
import { createNote, findNote, flushPending, loadAll, state, subscribe } from './store.js';
import { esc, isAdmission, isRescission, noteFace, noteMatches, noteSubtitle, showToast } from './util.js';

const $ = (sel) => document.querySelector(sel);
const toast = (message) => showToast(message);

let selected = null; // nota aberta no editor
let editor = null;

// ---------- Lista de notas ----------
function renderList() {
  const root = $('#notes');
  const term = state.term.trim().toLowerCase();
  const notes = term ? state.notes.filter((n) => noteMatches(n, term)) : state.notes;

  // Se o foco estava numa nota da lista, devolve depois de redesenhar
  const focusedId = document.activeElement?.closest?.('.note-pick')?.dataset.id;

  if (!notes.length) {
    root.innerHTML = state.notes.length
      ? '<div class="empty">Nenhuma nota encontrada.</div>'
      : '<div class="empty">Você ainda não tem notas. Crie uma admissão ou uma nota para começar.</div>';
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

  if (focusedId) $(`.note-pick[data-id="${focusedId}"]`)?.focus({ preventScroll: true });
}

// Junta vários avisos seguidos num único redesenho (digitar não trava)
let listQueued = false;
function queueList() {
  if (listQueued) return;
  listQueued = true;
  requestAnimationFrame(() => { listQueued = false; renderList(); });
}

// Um único ouvinte para toda a lista (mais leve que um por nota)
$('#notes').onclick = (ev) => {
  const item = ev.target.closest('.note-pick');
  if (item) openNote(item.dataset.id);
};
$('#notes').onkeydown = (ev) => {
  const item = ev.target.closest?.('.note-pick');
  if (item && (ev.key === 'Enter' || ev.key === ' ')) {
    ev.preventDefault();
    openNote(item.dataset.id);
  }
};

// ---------- Editor: abre e fecha a coluna ----------
function showEditor() {
  const n = findNote(selected);
  const box = $('#editor');
  editor?.destroy();
  editor = null;

  // Sem nota aberta: a coluna do editor some e ficam só as notas
  $('.layout').classList.toggle('closed', !n);
  box.hidden = !n;
  if (!n) { box.innerHTML = ''; return; }

  editor = mountEditor(box, n, {
    allowDelete: true,
    onSaved: () => {
      const id = selected;
      closeEditor();
      $(`.note-pick[data-id="${id}"]`)?.focus();
    },
    onDeleted: closeEditor,
  });
}

function closeEditor() {
  selected = null;
  showEditor();
  renderList();
}

// No celular o editor aparece embaixo da lista, então rola até ele
function scrollToEditor() {
  const box = $('#editor');
  if (!box || box.hidden || !window.matchMedia('(max-width: 700px)').matches) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  box.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function openNote(id) {
  selected = id;
  showEditor();
  renderList();
  scrollToEditor();
}

async function create(kind) {
  try {
    const n = await createNote(kind);
    openNote(n.id);
    const first = $(isRescission(n) ? '#company' : isAdmission(n) ? '#employee' : '#title');
    if (first) { first.focus({ preventScroll: true }); first.select(); }
  } catch (err) { toast(err.message); }
}

// ---------- Avisos da store ----------
subscribe((kind) => {
  if (kind === 'notes') {
    if (selected && !findNote(selected)) { closeEditor(); return; }
    const search = $('#search');
    if (search.value !== state.term) search.value = state.term;
  }
  queueList();
});

// ---------- Janelinha flutuante ----------
const pipButton = $('#openPip');
let pipModule = null;
const loadPip = () => (pipModule ??= import('./pip.js'));

function setPipLabel(open) {
  pipButton.textContent = open ? 'Fechar janelinha' : 'Janelinha flutuante';
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
  const spots = [
    [48, 70, 70, '#fff', '#ffd966'],
    [118, 38, 52, '#ff7eb6', '#fff3b0'],
    [150, 86, 40, '#ffe3ef', '#d63384'],
    [26, 18, 30, '#ffffff', '#ff7eb6'],
  ];
  $('#deco').innerHTML = spots.map(([x, y, s, p, c]) =>
    `<g transform="translate(${x - s / 2} ${y - s / 2}) scale(${s / 40})">${flowerSVG(p, c).replace(/<\/?svg[^>]*>/g, '')}</g>`
  ).join('');
}

// ---------- Início ----------
$('#newNote').onclick = () => create('nota');
$('#newAdmission').onclick = () => create('admissao');
$('#newRescission').onclick = () => create('rescisao');

let searchTimer;
$('#search').oninput = (ev) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.term = ev.target.value; renderList(); }, 120);
};

// As carinhas dependem do dia de hoje: reconfere de tempos em tempos
setInterval(queueList, 10 * 60 * 1000);

// Grava o que ainda estava esperando se ela fechar ou atualizar a página
window.addEventListener('pagehide', () => { flushPending(); });

decorateHero();
initScore({ toast });

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
  renderList();
  showEditor(); // começa só com a lista de notas
})();
