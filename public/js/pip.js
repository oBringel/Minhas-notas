// Janelinha flutuante: fica por cima dos outros programas (como o vídeo do YouTube
// em miniatura). Usa a "Document Picture-in-Picture" do Chrome/Edge no computador.
import { mountEditor } from './editor.js';
import { flushPending, findNote, createNote, state, subscribe } from './store.js';
import { getScoreData, monthName, subscribeScore } from './score.js';
import { esc, isAdmission, noteMatches, noteSubtitle, showToast } from './util.js';

// Tamanhos da janelinha em cada tela
const SIZE_LIST = { w: 340, h: 430 };      // 3 notas
const SIZE_EXPANDED = { w: 360, h: 600 };  // todas as notas (com rolagem)
const SIZE_EDIT = { w: 450, h: 720 };      // editar os dados completos

let win = null;
let view = 'list';      // 'list' | 'edit'
let expanded = false;
let term = '';
let selectedId = null;
let editor = null;
let cleanups = [];
let rowsQueued = false;
let closeCallback = () => {};

export const isOpen = () => Boolean(win && !win.closed);

function resize(size) {
  try { win.resizeTo(size.w, size.h); } catch { /* o navegador pode não deixar; ela ajusta arrastando */ }
}

function copyStyles(w) {
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    const copy = w.document.createElement('link');
    copy.rel = 'stylesheet';
    copy.href = link.href; // endereço completo, pois a janelinha começa em branco
    w.document.head.append(copy);
  }
}

/** Abre a janelinha, ou fecha se já estiver aberta. Chame direto de um clique. */
export async function togglePip({ onClose } = {}) {
  if (isOpen()) { win.close(); return; }

  const w = await window.documentPictureInPicture.requestWindow({
    width: SIZE_LIST.w,
    height: SIZE_LIST.h,
  });

  win = w;
  view = 'list';
  expanded = false;
  term = '';
  selectedId = null;
  closeCallback = onClose || (() => {});

  w.document.documentElement.lang = 'pt-BR';
  w.document.title = 'Minhas Notas';
  copyStyles(w);
  w.document.body.className = 'pip';
  w.document.body.innerHTML = '<div id="pipRoot"></div>';

  cleanups = [subscribe(onStoreChange), subscribeScore(updateScoreLine)];
  w.addEventListener('pagehide', teardown, { once: true });
  render();
}

function teardown() {
  editor?.destroy();
  editor = null;
  cleanups.forEach((fn) => fn());
  cleanups = [];
  win = null;
  flushPending(); // se ela estava digitando, grava agora
  closeCallback();
}

function onStoreChange(kind) {
  if (!isOpen()) return;
  if (view === 'list') queueRows();
  else if (kind === 'notes' && !findNote(selectedId)) goList();
}

// ---------- Telas ----------
function render() {
  if (!isOpen()) return;
  const root = win.document.getElementById('pipRoot');
  editor?.destroy();
  editor = null;
  if (view === 'edit') renderEdit(root); else renderList(root);
}

function renderList(root) {
  root.innerHTML = `
    <div class="pip-app">
      <div class="pip-title"><h1>Minhas Notas</h1></div>
      <div class="pip-score" id="pipScore"></div>
      <div class="pip-actions">
        <button type="button" id="pipNewAdm">＋ Admissão</button>
        <button type="button" class="secondary" id="pipNewNote">＋ Nota</button>
      </div>
      ${expanded ? `<input id="pipSearch" type="text" placeholder="Buscar pelo nome..."
                          aria-label="Buscar notas pelo nome" autocomplete="off" value="${esc(term)}">` : ''}
      <div class="pip-list" id="pipList"></div>
      <button type="button" class="secondary pip-toggle" id="pipToggle" hidden></button>
    </div>`;

  const $ = (sel) => root.querySelector(sel);

  $('#pipNewAdm').onclick = () => create('admissao');
  $('#pipNewNote').onclick = () => create('nota');

  $('#pipToggle').onclick = () => {
    expanded = !expanded;
    term = '';
    render();
    resize(expanded ? SIZE_EXPANDED : SIZE_LIST);
  };

  const search = $('#pipSearch');
  if (search) {
    search.oninput = () => { term = search.value; renderRows(); };
  }

  // Um único ouvinte para todas as linhas (mais leve que um por nota)
  $('#pipList').onclick = (ev) => {
    const btn = ev.target.closest('[data-open]');
    if (btn) openEdit(btn.dataset.open);
  };

  renderRows();
  updateScoreLine(getScoreData());
}

function renderRows() {
  if (!isOpen() || view !== 'list') return;
  const doc = win.document;
  const list = doc.getElementById('pipList');
  const toggle = doc.getElementById('pipToggle');
  if (!list) return;

  const filtered = expanded ? state.notes.filter((n) => noteMatches(n, term.trim().toLowerCase())) : state.notes;
  const shown = expanded ? filtered : state.notes.slice(0, 3);

  if (!shown.length) {
    list.innerHTML = `<p class="pip-empty">${
      state.notes.length ? 'Nenhuma nota encontrada.' : 'Nenhuma nota ainda. Crie uma admissão!'}</p>`;
  } else {
    list.innerHTML = shown.map((n) => `
      <div class="pip-note${isAdmission(n) ? ' admissao' : ''}">
        <button type="button" class="pip-note-btn" data-open="${n.id}">
          <strong>${esc(n.title || 'Sem título')}</strong>
          <small>${esc(noteSubtitle(n))}</small>
        </button>
        <button type="button" class="secondary pip-edit" data-open="${n.id}"
                aria-label="Editar ${esc(n.title || 'nota')}">Editar</button>
      </div>`).join('');
  }

  // Botão de expandir/recolher só aparece quando tem mais de 3 notas
  if (toggle) {
    toggle.hidden = state.notes.length <= 3;
    toggle.textContent = expanded ? 'Recolher' : `Ver todas as notas (${state.notes.length})`;
  }
}

function queueRows() {
  if (rowsQueued) return;
  rowsQueued = true;
  win.requestAnimationFrame(() => { rowsQueued = false; renderRows(); });
}

function updateScoreLine(score) {
  if (!isOpen() || !score) return;
  const el = win.document.getElementById('pipScore');
  if (!el) return;
  const mes = monthName(score.month);
  el.innerHTML = `
    <p>${esc(mes[0].toUpperCase() + mes.slice(1))} · ${score.points} de ${score.goal} pontos (${score.percent}%)</p>
    <div class="pip-bar-track"><div class="pip-bar-fill" style="width:${Math.min(100, score.percent)}%"></div></div>`;
}

function renderEdit(root) {
  const n = findNote(selectedId);
  if (!n) { goList(); return; }

  root.innerHTML = `
    <div class="pip-edit-wrap">
      <div class="pip-backbar"><button type="button" class="secondary small" id="pipBack">← Voltar</button></div>
      <section class="editor pip-editor" id="pipEditor"></section>
    </div>`;

  root.querySelector('#pipBack').onclick = goList;
  editor = mountEditor(root.querySelector('#pipEditor'), n, { allowDelete: false, onSaved: goList });
}

function openEdit(id) {
  view = 'edit';
  selectedId = id;
  render();
  resize(SIZE_EDIT);
}

function goList() {
  view = 'list';
  selectedId = null;
  render();
  resize(expanded ? SIZE_EXPANDED : SIZE_LIST);
}

async function create(kind) {
  try {
    const n = await createNote(kind);
    openEdit(n.id);
  } catch (err) {
    showToast(err.message, win.document);
  }
}
