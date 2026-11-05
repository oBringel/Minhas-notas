// Janelinha flutuante: fica por cima dos outros programas (como o vídeo do YouTube
// em miniatura). Usa a "Document Picture-in-Picture" do Chrome/Edge no computador.
import { mountEditor } from './editor.js';
import { createNote, findNote, flushPending, state, subscribe } from './store.js';
import { getScoreData, monthName, subscribeScore } from './score.js';
import {
  RESCISSION_TYPES, esc, filterNotes, isAdmission, isComplete, isRescission, noteFace, noteSubtitle,
  rescissionStatus, showToast,
} from './util.js';

// Tamanhos da janelinha em cada situação
const SIZES = {
  bar:     { w: 300, h: 104 },  // minimizada: só uma barrinha
  compact: { w: 300, h: 320 },  // padrão: as 3 notas mais recentes
  full:    { w: 350, h: 520 },  // todas as notas, com filtros e rolagem
  edit:    { w: 420, h: 640 },  // editar os dados completos
  quick:   { w: 310, h: 400 },  // criar rescisão rapidinho
};

let win = null;
let mode = 'compact';   // 'bar' | 'compact' | 'full'
let view = 'list';      // 'list' | 'edit' | 'quick'
let selectedId = null;
let filters = { type: 'all', term: '', date: '', sort: 'recent' };
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

  mode = 'compact';
  view = 'list';
  selectedId = null;
  filters = { type: 'all', term: '', date: '', sort: 'recent' };

  const w = await window.documentPictureInPicture.requestWindow({
    width: SIZES.compact.w,
    height: SIZES.compact.h,
  });

  win = w;
  closeCallback = onClose || (() => {});

  w.document.documentElement.lang = 'pt-BR';
  w.document.title = 'Minhas Notas';
  copyStyles(w);
  w.document.body.className = 'pip';
  w.document.body.innerHTML = '<div id="pipRoot"></div>';

  // As carinhas dependem do dia de hoje: reconfere de tempos em tempos
  const clock = w.setInterval(queueRows, 10 * 60 * 1000);
  cleanups = [subscribe(onStoreChange), subscribeScore(updateScoreLine), () => w.clearInterval(clock)];
  w.addEventListener('pagehide', teardown, { once: true });
  render();
}

function teardown() {
  editor?.destroy();
  editor = null;
  cleanups.forEach((fn) => { try { fn(); } catch { /* janela já fechou */ } });
  cleanups = [];
  win = null;
  flushPending(); // se ela estava digitando, grava agora
  closeCallback();
}

function onStoreChange(kind) {
  if (!isOpen()) return;
  if (view === 'list') queueRows();
  else if (view === 'edit' && kind === 'notes' && !findNote(selectedId)) goList();
}

// ---------- Telas ----------
function render() {
  if (!isOpen()) return;
  const root = win.document.getElementById('pipRoot');
  editor?.destroy();
  editor = null;
  if (view === 'edit') renderEdit(root);
  else if (view === 'quick') renderQuick(root);
  else renderList(root);
}

function setMode(next) {
  mode = next;
  render();
  resize(SIZES[mode]);
}

function renderList(root) {
  const full = mode === 'full';
  root.innerHTML = `
    <div class="pip-app pip-${mode}">
      <div class="pip-head">
        <h1>Minhas Notas</h1>
        <div class="pip-win">
          ${mode !== 'bar' ? '<button type="button" class="secondary small" id="pipLess" title="Deixar a janelinha menor">Minimizar</button>' : ''}
          ${mode !== 'full' ? '<button type="button" class="secondary small" id="pipMore" title="Ver mais informações">Expandir</button>' : ''}
        </div>
      </div>
      ${mode === 'bar'
        ? '<p class="pip-summary" id="pipSummary"></p>'
        : '<div class="pip-score" id="pipScore"></div>'}
      ${full ? `
        <div class="pip-filters">
          <div class="pip-chips" role="group" aria-label="Tipo de nota">
            <button type="button" class="chip" data-type="all">Todas</button>
            <button type="button" class="chip" data-type="admissao">Admissões</button>
            <button type="button" class="chip" data-type="rescisao">Rescisões</button>
          </div>
          <input id="pipSearch" type="text" placeholder="Buscar pelo nome..." aria-label="Buscar notas pelo nome"
                 autocomplete="off" value="${esc(filters.term)}">
          <div class="pip-datebar">
            <input id="pipDate" type="date" aria-label="Filtrar por data" value="${esc(filters.date)}">
            <button type="button" class="secondary small" id="pipClearDate" ${filters.date ? '' : 'hidden'}>Limpar</button>
            <select id="pipSort" aria-label="Ordenar">
              <option value="recent">Mais recentes</option>
              <option value="date">Por data</option>
            </select>
          </div>
        </div>` : ''}
      ${mode !== 'bar' ? '<div class="pip-list" id="pipList"></div>' : ''}
      ${mode === 'compact' ? '<p class="pip-moreinfo" id="pipMoreInfo" hidden></p>' : ''}
      ${mode !== 'bar' ? `
        <div class="pip-actions">
          <button type="button" id="pipNewAdm">＋ Admissão</button>
          <button type="button" id="pipNewResc">＋ Rescisão</button>
        </div>` : ''}
    </div>`;

  const $ = (sel) => root.querySelector(sel);

  $('#pipLess')?.addEventListener('click', () => setMode(mode === 'full' ? 'compact' : 'bar'));
  $('#pipMore')?.addEventListener('click', () => setMode(mode === 'bar' ? 'compact' : 'full'));
  $('#pipNewAdm')?.addEventListener('click', () => createAdmission());
  $('#pipNewResc')?.addEventListener('click', () => { view = 'quick'; render(); resize(SIZES.quick); });

  if (full) {
    const syncChips = () => root.querySelectorAll('.chip').forEach((chip) =>
      chip.setAttribute('aria-pressed', String(chip.dataset.type === filters.type)));
    root.querySelectorAll('.chip').forEach((chip) => {
      chip.onclick = () => { filters.type = chip.dataset.type; syncChips(); renderRows(); };
    });
    syncChips();

    const search = $('#pipSearch');
    search.oninput = () => { filters.term = search.value; renderRows(); };

    const date = $('#pipDate');
    const clear = $('#pipClearDate');
    date.oninput = () => { filters.date = date.value; clear.hidden = !filters.date; renderRows(); };
    clear.onclick = () => { filters.date = ''; date.value = ''; clear.hidden = true; renderRows(); };

    const sort = $('#pipSort');
    sort.value = filters.sort;
    sort.onchange = () => { filters.sort = sort.value; renderRows(); };
  }

  // Um único ouvinte para todas as linhas (mais leve que um por nota)
  const list = $('#pipList');
  if (list) {
    list.onclick = (ev) => {
      const btn = ev.target.closest('[data-open]');
      if (btn) openEdit(btn.dataset.open);
    };
  }

  renderRows();
  updateScoreLine(getScoreData());
}

// ---------- Linhas da lista ----------
function rowHTML(n, full) {
  const face = noteFace(n);
  const classes = [
    'pip-note',
    isAdmission(n) && 'admissao',
    isRescission(n) && 'rescisao',
    face && `status-${face.key}`,
  ].filter(Boolean).join(' ');
  const faceHTML = face
    ? `<span class="pip-face" title="${esc(face.label)}" aria-label="${esc(face.label)}">${face.emoji}</span>` : '';

  return `
    <div class="${classes}">
      <button type="button" class="pip-note-btn" data-open="${n.id}">
        <strong>${esc(n.title || 'Sem título')}</strong>
        ${full ? `<small>${esc(noteSubtitle(n))}</small>` : ''}
      </button>
      ${faceHTML}
      ${full ? `<button type="button" class="secondary pip-edit" data-open="${n.id}"
                        aria-label="Editar ${esc(n.title || 'nota')}">Editar</button>` : ''}
    </div>`;
}

// Resumo da barrinha minimizada
function summaryText() {
  const tracked = state.notes.filter((n) => isAdmission(n) || isRescission(n));
  const open = tracked.filter((n) => !isComplete(n)).length;
  const late = state.notes.filter(isRescission).map((n) => rescissionStatus(n).key);
  const cold = late.filter((k) => k === 'cold').length;
  const angry = late.filter((k) => k === 'angry').length;
  const parts = [open ? `${open} pendente${open === 1 ? '' : 's'}` : 'Tudo em dia 💅'];
  if (cold) parts.push(`🥶 ${cold}`);
  if (angry) parts.push(`😡 ${angry}`);
  return parts.join(' · ');
}

function renderRows() {
  if (!isOpen() || view !== 'list') return;
  const doc = win.document;

  const summary = doc.getElementById('pipSummary');
  if (summary) summary.textContent = summaryText();

  const list = doc.getElementById('pipList');
  if (!list) return;
  const full = mode === 'full';
  const shown = full ? filterNotes(state.notes, filters) : state.notes.slice(0, 3);

  list.innerHTML = shown.length
    ? shown.map((n) => rowHTML(n, full)).join('')
    : `<p class="pip-empty">${state.notes.length ? 'Nenhuma nota encontrada.' : 'Nenhuma nota ainda. Crie uma admissão ou rescisão!'}</p>`;

  const more = doc.getElementById('pipMoreInfo');
  if (more) {
    const extra = state.notes.length - 3;
    more.hidden = extra <= 0;
    more.textContent = `+ ${extra} ${extra === 1 ? 'nota' : 'notas'}. Use “Expandir” para ver todas.`;
  }
}

function queueRows() {
  if (rowsQueued || !isOpen()) return;
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

// ---------- Editar (janela grande) ----------
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
  resize(SIZES.edit);
}

function goList() {
  view = 'list';
  selectedId = null;
  render();
  resize(SIZES[mode]);
}

// Nova admissão: abre direto a janela grande para preencher
async function createAdmission() {
  try {
    const n = await createNote('admissao');
    openEdit(n.id);
  } catch (err) {
    showToast(err.message, win.document);
  }
}

// ---------- Nova rescisão (rapidinho, sem abrir a janela grande) ----------
function renderQuick(root) {
  root.innerHTML = `
    <div class="pip-app pip-quick">
      <div class="pip-head"><h1>Nova rescisão</h1></div>
      <form class="pip-quick-form" id="pipQuickForm">
        <label class="field"><span>Empresa</span>
          <input id="qCompany" type="text" autocomplete="off"></label>
        <label class="field"><span>Colaborador</span>
          <input id="qEmployee" type="text" autocomplete="off"></label>
        <label class="field"><span>Tipo de rescisão</span>
          <select id="qType">
            <option value="">Selecione o tipo</option>
            ${RESCISSION_TYPES.map((t) => `<option value="${t.value}">${esc(t.label)}</option>`).join('')}
          </select></label>
        <div class="form-actions">
          <button type="submit">Criar rescisão</button>
          <button type="button" class="secondary" id="qCancel">Cancelar</button>
        </div>
      </form>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  $('#qCancel').onclick = goList;
  $('#pipQuickForm').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await createNote('rescisao', {
        company: $('#qCompany').value,
        employee_name: $('#qEmployee').value,
        rescission_type: $('#qType').value,
      });
      goList();
      showToast('Rescisão criada! Toque em “Editar” para colocar as datas.', win.document);
    } catch (err) {
      showToast(err.message, win.document);
    }
  };
  $('#qCompany').focus();
}
