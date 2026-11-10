// Central de operações: KPIs, pendências priorizadas e próximos compromissos.
import {
  esc as escapeHtml, todayStr, diffDays, validDay, isComplete,
  rescissionStatus, rescissionDeadline,
} from './util.js';
import { state } from './store.js';
import { api } from './api.js';
import { icon, fillIcons } from './icons.js';

const $ = (sel) => document.querySelector(sel);

let ctx = { toast: () => {}, navigate: () => {}, openNote: () => {}, closeDrawer: () => {} };
let pendencias = [];
let pendenciasCarregadas = false;

const MODULES = { admissao: 'Admissão', rescisao: 'Rescisão', ferias: 'Férias', geral: 'Geral' };
const BUCKETS = ['atrasadas', 'hoje', 'semana', 'futuras'];
const FILTERS = { kpi: 'abertas', module: '', priority: '', status: 'abertas', view: 'cols' };

// ---------- Datas ----------
const ymdOf = (value) => {
  if (!value) return '';
  const raw = String(value).slice(0, 10);
  return validDay(raw) ? raw : '';
};

function parseYmd(value) {
  const s = ymdOf(value);
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDate(value) {
  const dt = parseYmd(value);
  return dt ? dt.toLocaleDateString('pt-BR') : '';
}

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function daysBetween(a, b) { return Math.round((startOfDay(a) - startOfDay(b)) / 86400000); }

// ---------- Itens ----------
const manualItem = (p) => ({
  id: p.id,
  source: 'manual',
  done: !!p.done,
  text: p.title || p.text || 'Pendência',
  description: p.description || '',
  module: p.module || 'geral',
  dueDate: ymdOf(p.due_date || p.dueDate),
  priority: p.priority || 'media',
});

function buildAutoItems() {
  const items = [];
  const today = todayStr();

  for (const n of state.notes || []) {
    if (n.kind === 'rescisao' && !isComplete(n)) {
      const st = rescissionStatus(n);
      const deadline = rescissionDeadline(n);
      if (!validDay(deadline)) continue;
      items.push({
        id: `auto:${n.id}`, source: 'auto', done: false,
        text: `Terminar ${n.title || 'a rescisão'}`,
        employee: n.employee_name || '',
        module: 'rescisao',
        dueDate: deadline,
        priority: st.key === 'angry' || st.key === 'cold' ? 'alta' : 'media',
        noteId: n.id,
      });
    }

    if (n.kind === 'admissao' && !isComplete(n) && validDay(n.admission_date)) {
      items.push({
        id: `auto:${n.id}`, source: 'auto', done: false,
        text: 'Concluir checklist de admissão',
        employee: n.employee_name || n.title || '',
        module: 'admissao',
        dueDate: n.admission_date,
        priority: 'media',
        noteId: n.id,
      });
    }
  }

  for (const v of state.vacations || []) {
    if (!validDay(v.start_date)) continue;
    if (validDay(v.end_date) && v.end_date < today) continue; // férias já passaram
    items.push({
      id: `auto:vac:${v.id}`, source: 'auto', done: false,
      text: `Conferir férias de ${v.employee_name || 'colaborador'}`,
      employee: v.employee_name || '',
      module: 'ferias',
      dueDate: v.start_date,
      priority: 'media',
      vacationId: v.id,
    });
  }

  return items;
}

function enrich(item) {
  const due = parseYmd(item.dueDate);
  const today = startOfDay(new Date());
  let bucket = 'futuras', situation = 'aberta';
  if (due) {
    const d = daysBetween(due, today);
    if (item.done) situation = 'concluida';
    else if (d < 0) { bucket = 'atrasadas'; situation = 'atrasada'; }
    else if (d === 0) { bucket = 'hoje'; situation = 'hoje'; }
    else if (d <= 7) bucket = 'semana';
  } else if (item.done) {
    situation = 'concluida';
  }
  return {
    item, bucket, situation, due,
    isLate: !!due && !item.done && daysBetween(due, today) < 0,
    moduleLabel: MODULES[item.module] || 'Geral',
  };
}

const allEnriched = () => [...pendencias.map(manualItem), ...buildAutoItems()].map(enrich);

// ---------- Filtros ----------
function matchesFilters(e) {
  const it = e.item;
  if (FILTERS.module && it.module !== FILTERS.module) return false;
  if (FILTERS.priority && it.priority !== FILTERS.priority) return false;

  if (FILTERS.status === 'abertas' && it.done) return false;
  if (FILTERS.status === 'concluidas' && !it.done) return false;
  if (FILTERS.status === 'atrasadas' && (it.done || e.situation !== 'atrasada')) return false;
  if (FILTERS.status === 'hoje' && (it.done || e.situation !== 'hoje')) return false;

  if (FILTERS.kpi === 'abertas' && it.done) return false;
  if (FILTERS.kpi === 'atrasadas' && (it.done || e.situation !== 'atrasada')) return false;
  if (FILTERS.kpi === 'hoje' && (it.done || e.situation !== 'hoje')) return false;
  if (FILTERS.kpi === 'concluidas' && !it.done) return false;
  return true;
}

// ---------- KPIs ----------
function renderKpis(all) {
  const open = all.filter((e) => !e.item.done).length;
  const late = all.filter((e) => !e.item.done && e.situation === 'atrasada').length;
  const today = all.filter((e) => !e.item.done && e.situation === 'hoje').length;
  const done = all.filter((e) => e.item.done).length;
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('#kpiAbertas', open);
  set('#kpiAtrasadas', late);
  set('#kpiHoje', today);
  set('#kpiConcluidas', done);
  syncKpiActive();
}

function syncKpiActive() {
  document.querySelectorAll('.kpi').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.kpi === FILTERS.kpi);
  });
}

// ---------- Desenho ----------
function situationTag(e) {
  const map = {
    atrasada: ['sit-atrasada', 'Atrasada'],
    hoje: ['sit-hoje', 'Hoje'],
    aberta: ['sit-aberta', 'Aberta'],
    concluida: ['sit-concluida', 'Concluída'],
  };
  const m = map[e.situation] || map.aberta;
  return `<span class="tag ${m[0]}">${m[1]}</span>`;
}

function metaHtml(e) {
  const it = e.item;
  return `<span class="tag module">${escapeHtml(e.moduleLabel)}</span>
    <span class="tag ${it.priority || 'media'}">${it.priority || 'média'}</span>
    ${situationTag(e)}
    ${it.dueDate ? `<span class="tag prazo${e.isLate ? ' late' : ''}">${e.isLate ? 'Venceu ' : 'Prazo '}${formatDate(it.dueDate)}</span>` : ''}
    ${it.source === 'auto' ? '<span class="tag auto">automática</span>' : ''}`;
}

function cardHtml(e) {
  const it = e.item;
  const ptTitle = it.source === 'auto' ? 'Atividade automática (1 ponto ao concluir no módulo)' : (it.done ? 'Concluída (+1 ponto) — clique para reabrir' : 'Marcar concluída (+1 ponto)');
  return `<div class="pend-item ${it.done ? 'done' : ''} ${e.isLate ? 'is-late' : ''} pri-${it.priority || 'media'}"
       data-eid="${escapeHtml(String(it.id || ''))}" data-source="${it.source}"
       data-note="${it.noteId || ''}" data-vac="${it.vacationId || ''}">
    <button type="button" class="pend-pt${it.done ? ' is-done' : ''}" data-act="toggle" ${it.source === 'auto' ? 'disabled' : ''} title="${escapeHtml(ptTitle)}" aria-label="${it.done ? 'Reabrir' : 'Concluir'}">1</button>
    <div>
      <strong>${escapeHtml(it.text || 'Atividade')}</strong>
      ${it.employee ? `<small>${escapeHtml(it.employee)}</small>` : ''}
      <div class="pend-meta">${metaHtml(e)}</div>
    </div>
    <div class="pend-actions">
      <button type="button" class="icon-btn" data-act="open" title="Abrir" aria-label="Abrir">${icon('external-link', { size: 14 })}</button>
      ${it.source !== 'auto' ? `<button type="button" class="icon-btn" data-act="edit" title="Editar" aria-label="Editar">${icon('pencil', { size: 14 })}</button>
      <button type="button" class="icon-btn" data-act="del" title="Excluir" aria-label="Excluir">${icon('trash-2', { size: 14 })}</button>` : ''}
    </div>
  </div>`;
}

function rowHtml(e) {
  const it = e.item;
  const ptTitle = it.source === 'auto' ? 'Atividade automática (1 ponto ao concluir no módulo)' : (it.done ? 'Concluída (+1 ponto) — clique para reabrir' : 'Marcar concluída (+1 ponto)');
  return `<div class="pend-row ${it.done ? 'done' : ''} ${e.isLate ? 'is-late' : ''}"
       data-eid="${escapeHtml(String(it.id || ''))}" data-source="${it.source}"
       data-note="${it.noteId || ''}" data-vac="${it.vacationId || ''}">
    <button type="button" class="pend-pt${it.done ? ' is-done' : ''}" data-act="toggle" ${it.source === 'auto' ? 'disabled' : ''} title="${escapeHtml(ptTitle)}" aria-label="${it.done ? 'Reabrir' : 'Concluir'}">1</button>
    <div class="pr-main"><strong>${escapeHtml(it.text || 'Atividade')}</strong>${it.employee ? `<small>${escapeHtml(it.employee)}</small>` : ''}</div>
    <div class="pr-col">${escapeHtml(e.moduleLabel)}</div>
    <div class="pr-col">${it.dueDate ? formatDate(it.dueDate) : '<span class="muted">—</span>'}</div>
    <div class="pr-col"><span class="tag ${it.priority || 'media'}">${it.priority || 'média'}</span> ${situationTag(e)}</div>
    <div class="pend-actions">
      <button type="button" class="icon-btn" data-act="open" title="Abrir">${icon('external-link', { size: 14 })}</button>
      ${it.source !== 'auto' ? `<button type="button" class="icon-btn" data-act="edit" title="Editar">${icon('pencil', { size: 14 })}</button>
      <button type="button" class="icon-btn" data-act="del" title="Excluir">${icon('trash-2', { size: 14 })}</button>` : ''}
    </div>
  </div>`;
}

function renderPendencias() {
  const board = $('.pending-board');
  const listView = $('#pendListView');
  if (!board || !listView) return;

  const all = allEnriched();
  renderKpis(all);

  const filtered = all.filter(matchesFilters)
    .sort((a, b) => (String(a.item.dueDate || '9999-12-31')).localeCompare(String(b.item.dueDate || '9999-12-31')));

  if (FILTERS.view === 'list') {
    board.classList.add('is-hidden');
    listView.hidden = false;
    listView.innerHTML = filtered.length
      ? filtered.map(rowHtml).join('')
      : '<p class="pend-empty">Nenhuma atividade para os filtros selecionados.</p>';
  } else {
    board.classList.remove('is-hidden');
    listView.hidden = true;
    const vazios = {
      atrasadas: 'Nenhuma atividade atrasada.',
      hoje: 'Nada para hoje.',
      semana: 'Nada para esta semana.',
      futuras: 'Sem pendências futuras.',
    };
    // Process each bucket ensuring correct rendering
    for (const b of BUCKETS) {
      const section = board.querySelector(`.pending-section[data-bucket="${b}"]`);
      // Find the pend-list specifically within this section's pending-cards
      const list = section?.querySelector('.pending-cards .pend-list[data-bucket="${b}"]');
      const countEl = section?.querySelector('.pending-section-header .pill-count');
      // Safety check - if list not found, try alternative selector
      if (!list) { console.warn(\`List not found for bucket ${b}, trying alternative\`); const altList = board.querySelector(`.pend-list[data-bucket="${b}"]`); if (altList) list = altList; }
      if (!list) continue;
      // Filter items for this specific bucket
      const items = filtered.filter((e) => e.bucket === b);
      if (items.length === 0 && countEl) countEl.textContent = '';
      // Render cards into the correct list
      list.innerHTML = items.length
        ? items.map(cardHtml).join('')
        : `<p class="pend-empty">${vazios[b]}</p>`;
    }
  }

  fillIcons(board);
  fillIcons(listView);
  bindPendActions(board);
  bindPendActions(listView);
  renderUpcoming(all);
}

function renderUpcoming(all) {
  const box = $('#upcomingList');
  if (!box) return;
  const today = startOfDay(new Date());
  const items = [];

  all.filter((e) => !e.item.done && e.item.dueDate)
    .forEach((e) => items.push({ date: e.item.dueDate, text: e.item.text, sub: e.moduleLabel, late: e.isLate }));

  const future = items
    .map((it) => ({ ...it, d: parseYmd(it.date) }))
    .filter((it) => it.d && daysBetween(it.d, today) >= -1)
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);

  if (!future.length) {
    box.innerHTML = '<p class="pend-empty">Nenhum compromisso próximo.</p>';
    return;
  }

  box.innerHTML = future.map((it) => {
    const late = daysBetween(it.d, today) < 0;
    return `<div class="up-item ${late ? 'is-late' : ''}">
      <span class="up-day">${formatDate(it.date).slice(0, 5)}</span>
      <div><strong>${escapeHtml(it.text)}</strong><small>${escapeHtml(it.sub)}${late ? ' · atrasado' : ''}</small></div>
    </div>`;
  }).join('');
}

// ---------- Ações ----------
function openManual(item) {
  $('#pendId').value = item.id;
  $('#pendTitle').value = item.text || '';
  $('#pendDue').value = ymdOf(item.dueDate);
  $('#pendPriority').value = item.priority || 'media';
  $('#pendModule').value = item.module || 'geral';
  $('#pendDesc').value = item.description || '';
  $('#pendForm').hidden = false;
  $('#pendTitle').focus();
}

function openAction(e) {
  const it = e.item;
  if (it.noteId) return ctx.openNote(it.noteId);
  if (it.vacationId) { ctx.closeDrawer(); return ctx.navigate('ferias'); }
  if (it.module && MODULES[it.module] && it.module !== 'geral') {
    ctx.closeDrawer();
    return ctx.navigate(it.module);
  }
  if (it.source === 'manual') openManual(it);
}

function bindPendActions(root) {
  if (!root || root._boundPend) return;
  root._boundPend = true;

  root.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn || btn.matches('input')) return;
    const row = btn.closest('[data-eid]');
    if (!row) return;
    const e = allEnriched().find((x) => String(x.item.id) === String(row.dataset.eid));
    if (!e) return;
    const act = btn.dataset.act;

    if (act === 'toggle') {
      if (e.item.source === 'auto') return;
      try { await api.setPendenciaDone(e.item.id, !e.item.done); await carregar(); }
      catch (err) { ctx.toast(err.message); renderPendencias(); }
      return;
    }

    if (act === 'open') return openAction(e);

    if (e.item.source === 'auto') return;

    if (act === 'edit') return openManual(e.item);

    if (act === 'del') {
      if (!window.confirm('Excluir esta pendência?')) return;
      try { await api.deletePendencia(e.item.id); await carregar(); }
      catch (err) { ctx.toast(err.message); }
    }
  });
}

// ---------- Formulário ----------
function bindForm() {
  const form = $('#pendForm');
  if (!form) return;

  $('#togglePendForm')?.addEventListener('click', () => {
    if (!form.hidden) { form.hidden = true; return; }
    form.reset();
    $('#pendId').value = '';
    form.hidden = false;
    $('#pendTitle').focus();
  });

  $('#cancelPend')?.addEventListener('click', () => { form.reset(); $('#pendId').value = ''; form.hidden = true; });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const id = $('#pendId').value;
    const data = {
      title: $('#pendTitle').value.trim(),
      description: $('#pendDesc').value.trim(),
      due_date: $('#pendDue').value || null,
      priority: $('#pendPriority').value || 'media',
      module: $('#pendModule').value || 'geral',
    };
    if (!data.title) return;
    try {
      if (id) await api.updatePendencia(id, { ...data, done: false });
      else await api.createPendencia(data);
      form.reset();
      $('#pendId').value = '';
      form.hidden = true;
      await carregar();
      ctx.toast(id ? 'Pendência atualizada.' : 'Pendência adicionada.');
    } catch (err) { ctx.toast(err.message); }
  });
}

function bindFiltros() {
  [['#pendFilterModule', 'module'], ['#pendFilterPriority', 'priority'], ['#pendFilterStatus', 'status']]
    .forEach(([sel, key]) => {
      const el = $(sel);
      if (!el) return;
      el.value = FILTERS[key];
      el.addEventListener('change', () => { FILTERS[key] = el.value; renderPendencias(); });
    });

  document.querySelectorAll('.kpi').forEach((btn) => {
    btn.addEventListener('click', () => {
      FILTERS.kpi = btn.dataset.kpi || 'abertas';
      if (FILTERS.status === 'concluidas' && FILTERS.kpi !== 'concluidas') FILTERS.status = 'abertas';
      syncKpiActive();
      renderPendencias();
      $('.pend-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  $('#pendViewCols')?.addEventListener('click', () => setView('cols'));
  $('#pendViewList')?.addEventListener('click', () => setView('list'));
}

function setView(view) {
  FILTERS.view = view === 'list' ? 'list' : 'cols';
  const cols = FILTERS.view === 'cols';
  $('#pendViewCols')?.classList.toggle('is-active', cols);
  $('#pendViewList')?.classList.toggle('is-active', !cols);
  renderPendencias();
}

// ---------- Dados ----------
async function carregar() {
  try {
    pendencias = await api.listPendencias();
    pendenciasCarregadas = true;
  } catch (err) {
    if (!pendenciasCarregadas) ctx.toast('Não consegui carregar as pendências.');
    console.error(err);
  }
  renderPendencias();
}

export async function addPendencia(data) {
  await api.createPendencia({
    title: data.text || data.title || 'Pendência',
    description: data.description || '',
    due_date: data.dueDate || null,
    priority: data.priority || 'media',
    module: data.module || 'geral',
  });
  await carregar();
}

export function initDashboard(options = {}) {
  ctx = { ...ctx, ...options };
  bindFiltros();
  bindForm();
  setView(FILTERS.view);
  carregar();
}

export function refreshDashboard() {
  renderPendencias();
}
