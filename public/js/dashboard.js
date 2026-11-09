// Dashboard: quadro de pendências, quadro de observações e checklist.
import { api } from './api.js';
import { state } from './store.js';
import { diffDays, esc, fmtDay, isAdmission, isRescission, todayStr, validDay } from './util.js';

const $ = (sel) => document.querySelector(sel);

let ctx = { toast: () => {}, navigate: () => {}, openNote: () => {} };
let pendencias = [];
let checklist = [];
let showDone = false;
let editingId = null;
let boardSavedAt = null;

const MODULE_LABEL = { admissao: 'Admissão', rescisao: 'Rescisão', ferias: 'Férias', geral: 'Geral' };
const PRIORITY_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const PRIORITY_ORDER = { alta: 0, media: 1, baixa: 2 };
const BUCKETS = ['hoje', 'semana', 'futuras'];

const visible = () => { const v = $('#view-dashboard'); return !!v && !v.hidden; };

// =====================================================================
//  Pendências que nascem dos módulos (não precisam ser cadastradas de novo)
// =====================================================================
function autoItems(today) {
  const list = [];

  for (const n of state.notes) {
    if (isRescission(n)) {
      const open = n.tasks.some((t) => !t.done);
      const due = n.send_limit || n.pay_limit;
      if (!open || !validDay(due)) continue;
      list.push({
        id: `auto:${n.id}`,
        auto: true,
        noteId: n.id,
        title: `Terminar ${n.title}`,
        description: 'Checklist da rescisão ainda tem itens em aberto.',
        due_date: due,
        priority: 'alta',
        module: 'rescisao',
      });
    } else if (isAdmission(n)) {
      const open = n.tasks.some((t) => !t.done);
      if (!open || !validDay(n.admission_date)) continue;
      list.push({
        id: `auto:${n.id}`,
        auto: true,
        noteId: n.id,
        title: `Finalizar documentação — ${n.employee_name || n.title}`,
        description: 'Admissão com checklist em aberto.',
        due_date: n.admission_date,
        priority: 'alta',
        module: 'admissao',
      });
    }
  }

  for (const v of state.vacations || []) {
    if (!validDay(v.start_date)) continue;
    if (validDay(v.end_date) && v.end_date < today) continue; // férias já passaram
    list.push({
      id: `auto:vac:${v.id}`,
      auto: true,
      title: `Conferir férias de ${v.employee_name || 'colaborador'}`,
      description: v.company ? `Início das férias · ${v.company}` : 'Início das férias',
      due_date: v.start_date,
      priority: 'media',
      module: 'ferias',
    });
  }

  return list;
}

function bucketOf(p, today) {
  if (!validDay(p.due_date)) return 'futuras';
  const d = diffDays(p.due_date, today);
  if (d <= 0) return 'hoje'; // atrasadas também aparecem em "para hoje"
  if (d <= 7) return 'semana';
  return 'futuras';
}

function dueLabel(p, today) {
  if (!validDay(p.due_date)) return 'sem data';
  const d = diffDays(p.due_date, today);
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  if (d < 0) return `${-d} dia${d === -1 ? '' : 's'} de atraso`;
  if (d <= 7) return `em ${d} dias`;
  return fmtDay(p.due_date);
}

const isLate = (p, today) => validDay(p.due_date) && p.due_date < today;

// =====================================================================
//  Desenho do quadro
// =====================================================================
function renderBoard() {
  const today = todayStr();
  const everything = [...autoItems(today), ...pendencias]
    .filter((p) => showDone || !p.done)
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
      || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));

  for (const bucket of BUCKETS) {
    const column = document.querySelector(`.pend-col[data-bucket="${bucket}"]`);
    if (!column) continue;
    const list = column.querySelector('.pend-list');
    const count = column.querySelector('.pill-count');
    const items = everything.filter((p) => bucketOf(p, today) === bucket);
    if (count) count.textContent = items.length ? String(items.length) : '';

    if (!items.length) {
      list.innerHTML = '<p class="pend-empty">Nada por aqui. 🌸</p>';
      continue;
    }

    list.innerHTML = items.map((p) => {
      const late = !p.auto && isLate(p, today);
      return `
      <div class="pend-item${p.done ? ' done' : ''}${late ? ' late' : ''}" data-id="${esc(p.id)}">
        <input type="checkbox" ${p.done ? 'checked' : ''} ${p.auto ? 'disabled title="Conclua no módulo de origem"' : ''}
               aria-label="Concluir ${esc(p.title)}">
        <div>
          <strong>${esc(p.title)}</strong>
          ${p.description ? `<small>${esc(p.description)}</small>` : ''}
          <div class="pend-tags">
            <span class="tag ${p.priority}">${PRIORITY_LABEL[p.priority] ?? 'Média'}</span>
            <span class="tag">${MODULE_LABEL[p.module] ?? 'Geral'}</span>
            <span class="tag${late ? ' late' : ''}">${esc(dueLabel(p, today))}</span>
            ${p.auto ? '<span class="tag auto">automática</span>' : ''}
          </div>
        </div>
        <div class="pend-actions">
          ${p.auto
            ? '<button type="button" class="icon-btn" data-open title="Abrir o módulo">abrir</button>'
            : '<button type="button" class="icon-btn" data-edit title="Editar">✏️</button>'
              + '<button type="button" class="icon-btn" data-del title="Excluir">🗑</button>'}
        </div>
      </div>`;
    }).join('');
  }
}

// =====================================================================
//  API
// =====================================================================
async function loadPendencias() {
  try {
    pendencias = await api.listPendencias();
    renderBoard();
  } catch (err) { ctx.toast(err.message); }
}

async function loadChecklist() {
  try {
    checklist = await api.listChecklist();
    renderChecklist();
  } catch (err) { ctx.toast(err.message); }
}

async function loadPanel() {
  try {
    const panel = await api.getPanel();
    const board = $('#board');
    if (board && board.value !== panel.board) board.value = panel.board;
    document.dispatchEvent(new CustomEvent('panel:loaded', { detail: panel }));
  } catch (err) { ctx.toast(err.message); }
}

// =====================================================================
//  Checklist
// =====================================================================
function renderChecklist() {
  const root = $('#checkList');
  if (!root) return;
  if (!checklist.length) {
    root.innerHTML = '<li class="empty">Seu checklist está vazio. Adicione o primeiro item acima.</li>';
    return;
  }
  root.innerHTML = checklist.map((item) => `
    <li class="${item.done ? 'done' : ''}" data-id="${item.id}">
      <input type="checkbox" ${item.done ? 'checked' : ''} aria-label="Concluir ${esc(item.text)}">
      <input class="ci-text" type="text" value="${esc(item.text)}" maxlength="500" aria-label="Item do checklist">
      <button type="button" class="icon-btn" data-del title="Excluir item">🗑</button>
    </li>`).join('');
}

function wireChecklist() {
  $('#checkForm').onsubmit = async (ev) => {
    ev.preventDefault();
    const input = $('#checkInput');
    const text = input.value.trim();
    if (!text) return;
    try {
      const item = await api.addCheckItem(text);
      checklist.push(item);
      input.value = '';
      input.focus();
      renderChecklist();
    } catch (err) { ctx.toast(err.message); }
  };

  $('#checkList').onchange = async (ev) => {
    const box = ev.target.closest('input[type="checkbox"]');
    if (!box) return;
    const li = box.closest('li');
    const item = checklist.find((x) => x.id === li.dataset.id);
    if (!item) return;
    item.done = box.checked;
    li.classList.toggle('done', item.done);
    try {
      await api.updateCheckItem(item.id, { text: '', done: item.done });
      $('#checkStatus').textContent = item.done ? 'Item concluído 💗' : '';
    } catch (err) { ctx.toast(err.message); }
  };
  $('#checkList').onclick = async (ev) => {
    const del = ev.target.closest('[data-del]');
    if (!del) return;
    const li = del.closest('li');
    if (!window.confirm('Excluir este item do checklist?')) return;
    try {
      await api.deleteCheckItem(li.dataset.id);
      checklist = checklist.filter((x) => x.id !== li.dataset.id);
      renderChecklist();
    } catch (err) { ctx.toast(err.message); }
  };
  // Editar o texto: salva ao sair do campo ou apertar Enter
  $('#checkList').addEventListener('focusout', async (ev) => {
    const input = ev.target.closest?.('.ci-text');
    if (!input) return;
    const li = input.closest('li');
    const item = checklist.find((x) => x.id === li.dataset.id);
    if (!item) return;
    const text = input.value.trim();
    if (!text || text === item.text) { input.value = item.text; return; }
    item.text = text;
    try {
      await api.updateCheckItem(item.id, { text, done: item.done });
    } catch (err) { ctx.toast(err.message); }
  });
  $('#checkList').addEventListener('keydown', (ev) => {
    if (ev.target.closest?.('.ci-text') && ev.key === 'Enter') { ev.preventDefault(); ev.target.blur(); }
  });
}

// =====================================================================
//  Quadro de observações
// =====================================================================
function wireBoard() {
  const board = $('#board');
  let timer;
  board.oninput = () => {
    $('#boardStatus').textContent = 'Salvando...';
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await api.setPanelPart('board', board.value);
        boardSavedAt = new Date();
        $('#boardStatus').textContent = `Salvo às ${boardSavedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      } catch (err) {
        $('#boardStatus').textContent = 'Não foi possível salvar.';
        ctx.toast(err.message);
      }
    }, 700);
  };
  $('#clearBoard').onclick = async () => {
    if (!board.value.trim() || !window.confirm('Limpar o quadro de observações?')) return;
    board.value = '';
    try {
      await api.setPanelPart('board', '');
      $('#boardStatus').textContent = 'Quadro limpo.';
    } catch (err) { ctx.toast(err.message); }
  };
}

// =====================================================================
//  Formulário de pendências
// =====================================================================
function openForm(item = null) {
  editingId = item?.id ?? null;
  $('#pendId').value = editingId ?? '';
  $('#pendTitle').value = item?.title ?? '';
  $('#pendDesc').value = item?.description ?? '';
  $('#pendDue').value = item?.due_date ?? '';
  $('#pendPriority').value = item?.priority ?? 'media';
  $('#pendModule').value = item?.module ?? 'geral';
  $('#pendForm').hidden = false;
  $('#togglePendForm').hidden = true;
  $('#pendTitle').focus();
}

function closeForm() {
  editingId = null;
  $('#pendForm').hidden = true;
  $('#togglePendForm').hidden = false;
  $('#pendForm').reset();
  $('#pendId').value = '';
}

function wirePendencias() {
  $('#togglePendForm').onclick = () => openForm();
  $('#cancelPend').onclick = closeForm;
  $('#toggleDonePend').onclick = () => {
    showDone = !showDone;
    $('#toggleDonePend').textContent = showDone ? 'Esconder concluídas' : 'Mostrar concluídas';
    renderBoard();
  };

  $('#pendForm').onsubmit = async (ev) => {
    ev.preventDefault();
    const data = {
      title: $('#pendTitle').value.trim(),
      description: $('#pendDesc').value.trim(),
      due_date: $('#pendDue').value || null,
      priority: $('#pendPriority').value,
      module: $('#pendModule').value,
    };
    if (!data.title) return;
    try {
      if (editingId) {
        const updated = await api.updatePendencia(editingId, { ...data, done: pendencias.find((p) => p.id === editingId)?.done ?? false });
        pendencias = pendencias.map((p) => (p.id === editingId ? updated : p));
        ctx.toast('Pendência atualizada.');
      } else {
        const created = await api.createPendencia(data);
        pendencias.push(created);
        ctx.toast('Pendência adicionada.');
      }
      closeForm();
      renderBoard();
    } catch (err) { ctx.toast(err.message); }
  };

  $('.pend-board').addEventListener('change', async (ev) => {
    const box = ev.target.closest('input[type="checkbox"]');
    if (!box) return;
    const id = box.closest('.pend-item')?.dataset.id;
    const item = pendencias.find((p) => p.id === id);
    if (!item) return;
    try {
      const updated = await api.setPendenciaDone(id, box.checked);
      pendencias = pendencias.map((p) => (p.id === id ? updated : p));
      renderBoard();
      if (box.checked) ctx.toast('Pendência concluída! 💗');
    } catch (err) { ctx.toast(err.message); }
  });

  $('.pend-board').addEventListener('click', async (ev) => {
    const row = ev.target.closest('.pend-item');
    if (!row) return;
    const id = row.dataset.id;
    const manual = pendencias.find((p) => p.id === id);
    const auto = !manual;

    if (ev.target.closest('[data-open]')) {
      const module = (auto ? autoItems(todayStr()).find((p) => p.id === id)?.module : manual.module) || 'dashboard';
      ctx.navigate(['admissao', 'rescisao', 'ferias'].includes(module) ? module : 'dashboard');
      if (auto) {
        const noteId = autoItems(todayStr()).find((p) => p.id === id)?.noteId;
        if (noteId) setTimeout(() => ctx.openNote(noteId), 60);
      }
      return;
    }
    if (!manual) return;

    if (ev.target.closest('[data-edit]')) { openForm(manual); return; }
    if (ev.target.closest('[data-del]')) {
      if (!window.confirm(`Excluir a pendência "${manual.title}"?`)) return;
      try {
        await api.deletePendencia(id);
        pendencias = pendencias.filter((p) => p.id !== id);
        renderBoard();
      } catch (err) { ctx.toast(err.message); }
    }
  });
}

// =====================================================================
//  Início
// =====================================================================
function renderAll() {
  renderBoard();
  if (!checklist.length) renderChecklist();
}

export function initDashboard(options) {
  ctx = { ...ctx, ...options };
  wirePendencias();
  wireChecklist();
  wireBoard();
  loadPanel();
  loadChecklist();
  loadPendencias();
}

export function refreshDashboard() {
  if (!visible()) return;
  renderBoard();
  loadPendencias();
}
