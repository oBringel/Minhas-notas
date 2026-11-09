// Central de operações: KPIs, pendências priorizadas e próximos compromissos.
import {
  esc as escapeHtml, isoToday, formatDate, parseYmd, isComplete, hideDrawer,
  rescissionStatus, admissionStatus, isoToYmd, payDeadline, sendDeadline
} from './util.js';
import { state } from './store.js';
import { api } from './api.js';
import { renderVacationStatus, openVacation } from './vacations.js';
import { edit as editNote } from './editor.js';
import { icon, fillIcons } from './icons.js';

const MODULES = { admissao:'Admissão', rescisao:'Rescisão', ferias:'Férias', geral:'Geral' };
const BUCKETS = ['atrasadas','hoje','semana','futuras'];
const FILTERS = { kpi: 'abertas', module: '', priority: '', status: '', view: 'cols' };

export function initDashboard() {
  // filtros e visão
  [['#pendFilterModule','module'],['#pendFilterPriority','priority'],['#pendFilterStatus','status']].forEach(([sel, key]) => {
    const el = document.querySelector(sel); if (!el) return;
    el.addEventListener('change', () => { FILTERS[key] = el.value; renderPendencias(); });
  });
  document.querySelector('#pendViewCols')?.addEventListener('click', () => setView('cols'));
  document.querySelector('#pendViewList')?.addEventListener('click', () => setView('list'));
  document.querySelectorAll('.kpi').forEach(btn => {
    btn.addEventListener('click', () => {
      FILTERS.kpi = btn.dataset.kpi || 'abertas';
      syncKpiActive();
      renderPendencias();
      document.querySelector('.pend-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function setView(v) {
  FILTERS.view = v;
  const cols = v === 'cols';
  document.querySelector('#pendViewCols')?.classList.toggle('is-active', cols);
  document.querySelector('#pendViewList')?.classList.toggle('is-active', !cols);
  document.querySelector('#pendBoard')?.classList.toggle('is-hidden', !cols);
  document.querySelector('#pendListView')?.toggleAttribute('hidden', cols);
  renderPendencias();
}

function syncKpiActive() {
  document.querySelectorAll('.kpi').forEach(b => b.classList.toggle('is-active', b.dataset.kpi === FILTERS.kpi));
}

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function daysBetween(a, b) { return Math.round((startOfDay(a) - startOfDay(b)) / 86400000); }

function enrichItem(p) {
  // devolve {item, bucket, situation, isLate, moduleLabel}
  const due = parseYmd(p.dueDate);
  const today = startOfDay(new Date());
  let bucket = 'futuras', situation = 'aberta', isLate = false;
  if (p.done) { situation = 'concluida'; bucket = 'futuras'; }
  else if (due) {
    const diff = daysBetween(due, today);
    if (diff < 0) { bucket = 'atrasadas'; situation = 'atrasada'; isLate = true; }
    else if (diff === 0) { bucket = 'hoje'; situation = 'hoje'; }
    else if (diff <= 7) { bucket = 'semana'; situation = 'aberta'; }
    else { bucket = 'futuras'; situation = 'aberta'; }
  }
  const moduleLabel = MODULES[p.module] || 'Geral';
  return { item: p, bucket, situation, isLate, moduleLabel };
}

function buildAutoItems() {
  const items = [];
  const today = startOfDay(new Date());

  (state.notes || []).filter(n => n.kind === 'rescisao').forEach(n => {
    const st = rescissionStatus(n);
    if (!st || st.key === 'done') return;
    const d = st.deadline ? { done: false, text: st.message, employee: n.employee || n.title, module: 'rescisao', dueDate: st.deadline, priority: st.key === 'angry' ? 'alta' : 'media', source: 'auto', noteId: n.id, noteKind: 'rescisao' } : null;
    if (d) items.push(d);
  });

  (state.notes || []).filter(n => n.kind === 'admissao' && !isComplete(n) && (n.employee || n.title)).forEach(n => {
    const st = admissionStatus(n);
    // admissão sem prazo crítico: entra como aberta; destaca se há prazo próximo via startDate? Mantemos simples: aberta/geral.
    const due = n.startDate || '';
    items.push({ done: false, text: 'Concluir checklist de admissão', employee: n.employee || n.title, module: 'admissao', dueDate: due, priority: 'media', source: 'auto', noteId: n.id, noteKind: 'admissao' });
  });

  (state.vacations || []).forEach(v => {
    const st = renderVacationStatus(v);
    if (!st || st.key === 'done' || st.key === 'gozo') return;
    const pay = payDeadline(v.startDate);
    const send = sendDeadline(v.startDate);
    // escolher o mais urgente entre pagar/enviar
    let due = '', text = 'Organizar férias', pri = 'media';
    if (st.key === 'pay' || st.key === 'latepay') { due = pay; text = `Efetuar pagamento de férias`; pri = st.key === 'latepay' ? 'alta' : 'alta'; }
    else if (st.key === 'send' || st.key === 'latesend') { due = send; text = `Enviar aviso de férias`; pri = st.key === 'latesend' ? 'alta' : 'media'; }
    else if (st.key === 'plan' || st.key === 'nopay') { text = st.key === 'nopay' ? 'Registrar data de pagamento' : 'Planejar aviso/pagamento'; pri = st.key === 'nopay' ? 'alta' : 'baixa'; due = send || pay || ''; }
    if (v.employee) items.push({ done: false, text, employee: v.employee, module: 'ferias', dueDate: due, priority: pri, source: 'auto', vacationId: v.id });
  });
  return items;
}

function getAllEnriched() {
  const manual = (state.pendencias || []).map(p => ({ ...p, source: p.source || 'manual', module: p.module || 'geral' }));
  const auto = buildAutoItems();
  // enriquecer autos também
  return [...manual, ...auto].map(enrichItem);
}

function matchesFilters(e) {
  if (FILTERS.module && e.item.module !== FILTERS.module) return false;
  if (FILTERS.priority && (e.item.priority || 'media') !== FILTERS.priority) return false;
  if (FILTERS.status) {
    if (FILTERS.status === 'abertas' && e.item.done) return false;
    if (FILTERS.status === 'concluidas' && !e.item.done) return false;
    if (FILTERS.status === 'atrasadas' && e.situation !== 'atrasada') return false;
  }
  // filtro rápido via KPI
  const k = FILTERS.kpi;
  if (k === 'abertas' && e.item.done) return false;
  if (k === 'atrasadas' && e.situation !== 'atrasada') return false;
  if (k === 'hoje' && e.situation !== 'hoje') return false;
  if (k === 'concluidas' && !e.item.done) return false;
  return true;
}

function renderKpis(all) {
  const open = all.filter(e => !e.item.done).length;
  const late = all.filter(e => e.situation === 'atrasada').length;
  const today = all.filter(e => e.situation === 'hoje').length;
  const done = all.filter(e => e.item.done).length;
  const set = (id, v) => { const el = document.querySelector(id); if (el) el.textContent = v; };
  set('#kpiAbertas', open); set('#kpiAtrasadas', late); set('#kpiHoje', today); set('#kpiConcluidas', done);
  syncKpiActive();
}

function situationTag(e) {
  const map = { atrasada:['sit-atrasada','Atrasada'], hoje:['sit-hoje','Hoje'], aberta:['sit-aberta','Aberta'], concluida:['sit-concluida','Concluída'] };
  const m = map[e.situation] || map.aberta;
  return `<span class="tag ${m[0]}">${m[1]}</span>`;
}

function openAction(e) {
  const it = e.item;
  if (it.noteId) { const n = (state.notes || []).find(x => String(x.id) === String(it.noteId)); if (n) return editNote(n); }
  if (it.vacationId) return openVacation(it.vacationId);
  if (it.module === 'ferias') { hideDrawer(); location.hash = '#ferias'; return; }
  if (it.module === 'admissao') { hideDrawer(); location.hash = '#admissao'; return; }
  if (it.module === 'rescisao') { hideDrawer(); location.hash = '#rescisao'; return; }
}

function renderPendencias() {
  const board = document.querySelector('#pendBoard');
  const listView = document.querySelector('#pendListView');
  if (!board) return;
  const all = getAllEnriched();
  renderKpis(all);
  const filtered = all.filter(matchesFilters);
  // ordenar: atrasadas primeiro por data, depois por bucket natural
  const bIndex = { atrasadas:0, hoje:1, semana:2, futuras:3 };
  filtered.sort((a,b) => (bIndex[a.bucket]-bIndex[b.bucket] ? bIndex[a.bucket]-bIndex[b.bucket] : 0) || ((a.item.dueDate||'9999')>(b.item.dueDate||'9999')?1:-1));

  if (FILTERS.view === 'list') {
    board.classList.add('is-hidden'); listView.hidden = false;
    listView.innerHTML = filtered.length ? filtered.map(e => rowHtml(e)).join('') : `<p class="pend-empty">Nenhuma atividade para os filtros selecionados.</p>`;
  } else {
    board.classList.remove('is-hidden'); listView.hidden = true;
    BUCKETS.forEach(b => {
      const list = board.querySelector(`.pend-list[data-bucket="${b}"]`);
      const count = board.querySelector(`.pend-col[data-bucket="${b}"] .pill-count`);
      if (!list) return;
      const items = filtered.filter(e => e.bucket === b);
      if (count) count.textContent = items.length || '';
      const empty = { atrasadas:'Nenhuma atividade atrasada.', hoje:'Nada para hoje.', semana:'Nada para esta semana.', futuras:'Sem pendências futuras.' };
      list.innerHTML = items.length ? items.map(e => cardHtml(e)).join('') : `<p class="pend-empty">${empty[b]}</p>`;
    });
  }
  fillIcons(board);
  fillIcons(listView);
  bindPendActions(board);
  bindPendActions(listView);
  renderUpcoming(all);
}

function metaHtml(e) {
  const it = e.item;
  const late = e.isLate && !it.done;
  return `<span class="tag module">${escapeHtml(e.moduleLabel)}</span>
    <span class="tag ${it.priority || 'media'}">${it.priority || 'média'}</span>
    ${situationTag(e)}
    ${it.dueDate ? `<span class="tag prazo${late?' late':''}">${late?'Venceu ':'Prazo '}${formatDate(it.dueDate)}</span>` : ''}
    ${it.source === 'auto' ? `<span class="tag auto">automática</span>` : ''}`;
}

function cardHtml(e) {
  const it = e.item;
  const done = !!it.done;
  return `<div class="pend-item ${done?'done':''} ${e.isLate&&!done?'is-late':''} pri-${it.priority||'media'}" data-eid="${escapeHtml(String(it.id||''))}" data-source="${it.source}" data-note="${it.noteId||''}" data-vac="${it.vacationId||''}">
    <input type="checkbox" data-act="toggle" ${done?'checked':''} ${it.source==='auto'?'disabled title="Atividade automática — conclua no módulo de origem"':''} aria-label="Concluir" />
    <div>
      <strong>${escapeHtml(it.text || 'Atividade')}</strong>
      ${it.employee ? `<small>${escapeHtml(it.employee)}</small>` : ''}
      <div class="pend-meta">${metaHtml(e)}</div>
    </div>
    <div class="pend-actions">
      <button type="button" class="icon-btn" data-act="open" title="Abrir processo" aria-label="Abrir">${icon('external-link', { size: 14 })}</button>
      ${it.source!=='auto' ? `<button type="button" class="icon-btn" data-act="del" title="Excluir" aria-label="Excluir">${icon('trash-2', { size: 14 })}</button>` : ''}
    </div>
  </div>`;
}

function rowHtml(e) {
  const it = e.item;
  const done = !!it.done;
  return `<div class="pend-row ${done?'done':''} ${e.isLate&&!done?'is-late':''}" data-eid="${escapeHtml(String(it.id||''))}" data-source="${it.source}" data-note="${it.noteId||''}" data-vac="${it.vacationId||''}">
    <input type="checkbox" data-act="toggle" ${done?'checked':''} ${it.source==='auto'?'disabled':''} aria-label="Concluir" />
    <div class="pr-main"><strong>${escapeHtml(it.text||'Atividade')}</strong>${it.employee?`<small>${escapeHtml(it.employee)}</small>`:''}</div>
    <div class="pr-col">${escapeHtml(e.moduleLabel)}</div>
    <div class="pr-col">${it.dueDate ? formatDate(it.dueDate) : '<span class="muted">—</span>'}</div>
    <div class="pr-col"><span class="tag ${it.priority||'media'}">${it.priority||'média'}</span> ${situationTag(e)}</div>
    <div class="pend-actions">
      <button type="button" class="icon-btn" data-act="open" title="Abrir">${icon('external-link',{size:14})}</button>
      ${it.source!=='auto'?`<button type="button" class="icon-btn" data-act="del" title="Excluir">${icon('trash-2',{size:14})}</button>`:''}
    </div>
  </div>`;
}

function bindPendActions(root) {
  if (!root || root._boundPend) return; root._boundPend = true;
  root.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('[data-eid],[data-note],[data-vac]');
    if (!row) return;
    const act = btn.dataset.act;
    const source = row.dataset.source;
    const id = row.dataset.eid;
    const noteId = row.dataset.note;
    const vacId = row.dataset.vac;
    if (act === 'open') {
      if (noteId) { const n = (state.notes||[]).find(x => String(x.id)===String(noteId)); if (n) return editNote(n); }
      if (vacId) return openVacation(vacId);
      const p = (state.pendencias||[]).find(x => String(x.id)===String(id));
      if (p) return openAction({ item: p });
    }
    if (source === 'auto') return;
    if (act === 'del') { await api.deletePendencia(id); renderPendencias(); }
  });
  root.addEventListener('change', async (ev) => {
    const cb = ev.target.closest('input[data-act="toggle"]'); if (!cb) return;
    const row = cb.closest('[data-eid]'); if (!row || row.dataset.source === 'auto') return;
    const p = (state.pendencias||[]).find(x => String(x.id)===String(row.dataset.eid));
    if (!p) return;
    p.done = cb.checked; await api.savePendencia(p); renderPendencias();
  });
}

function renderUpcoming(all) {
  const box = document.querySelector('#upcomingList'); if (!box) return;
  const items = [];
  const today = startOfDay(new Date());
  (state.events || []).forEach(ev => { if (ev.date) items.push({ date: ev.date, text: ev.text || 'Evento', sub: 'Calendário' }); });
  (state.vacations || []).forEach(v => {
    if (v.startDate) items.push({ date: isoToYmd(v.startDate) || v.startDate, text: `Início de férias — ${v.employee||''}`, sub: 'Férias' });
    const pay = payDeadline(v.startDate); if (pay) items.push({ date: pay, text: `Pagar férias — ${v.employee||''}`, sub: 'Férias' });
  });
  all.filter(e => !e.item.done && e.item.dueDate).forEach(e => items.push({ date: e.item.dueDate, text: e.item.text, sub: e.moduleLabel, late: e.isLate }));
  const future = items.map(it => ({ ...it, d: parseYmd(it.date) })).filter(it => it.d && daysBetween(it.d, today) >= -1).sort((a,b)=>a.d-b.d).slice(0,6);
  if (!future.length) { box.innerHTML = `<p class="pend-empty">Nenhum compromisso próximo.</p>`; return; }
  box.innerHTML = future.map(it => {
    const late = daysBetween(it.d, today) < 0;
    return `<div class="up-item ${late?'is-late':''}"><span class="up-day">${formatDate(it.date).replace(/\//g,'/').slice(0,5)}</span><div><strong>${escapeHtml(it.text)}</strong><small>${escapeHtml(it.sub)}${late?' · atrasado':''}</small></div></div>`;
  }).join('');
}

export async function addPendencia(data) {
  const p = {
    id: crypto.randomUUID(), source: 'manual', done: false,
    text: data.text, employee: data.employee || '', module: data.module || 'geral',
    dueDate: data.dueDate || '', priority: data.priority || 'media'
  };
  await api.savePendencia(p);
  renderPendencias();
}

// refresh geral chamado pelo app
export function refreshDashboard() { renderPendencias(); }
