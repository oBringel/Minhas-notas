import { icon } from './icons.js';
// Férias: lista simples de quem sai, de quando até quando.
import {
  createVacation, deleteVacation, loadVacations, state, updateVacation,
} from './store.js';
import { esc, fmtDay, todayStr, validDay } from './util.js';

const $ = (sel) => document.querySelector(sel);

let ctx = { toast: () => {} };
let editingId = null;

function statusOf(v, today) {
  if (!validDay(v.start_date)) return { key: '', label: 'Sem data' };
  if (validDay(v.end_date) && v.end_date < today) return { key: 'concluida', label: 'Concluída' };
  if (v.start_date <= today) return { key: 'andamento', label: 'Em andamento' };
  return { key: '', label: 'Programada' };
}

const rangeLabel = (v) => {
  if (!validDay(v.start_date)) return 'Datas a definir';
  const start = fmtDay(v.start_date);
  if (!validDay(v.end_date)) return `A partir de ${start}`;
  return `${start} → ${fmtDay(v.end_date)}`;
};

function render() {
  const root = $('#vacationList');
  if (!root) return;
  const today = todayStr();
  if (!state.vacations.length) {
    root.innerHTML = '<p class="empty">Nenhuma férias cadastrada ainda.</p>';
    return;
  }
  root.innerHTML = [...state.vacations]
    .sort((a, b) => String(a.start_date || '9999').localeCompare(String(b.start_date || '9999')))
    .map((v) => {
      const status = statusOf(v, today);
      return `
      <div class="vacation-row" data-id="${v.id}">
        <span class="vname">${esc(v.employee_name || 'Sem nome')}</span>
        <span class="vcompany">${esc(v.company || '—')}</span>
        <span class="vdates">${icon('palmtree', { size: 15 })} ${esc(rangeLabel(v))}</span>
        <span class="vstatus"><span class="vac-badge ${status.key}">${status.label}</span></span>
        <span class="file-actions">
          <button type="button" class="icon-btn" data-edit title="Editar">${icon('pencil', { size: 15 })}</button>
          <button type="button" class="icon-btn" data-del title="Excluir">${icon('trash-2', { size: 15 })}</button>
        </span>
      </div>`;
    }).join('');
}

function openForm(v = null) {
  editingId = v?.id ?? null;
  $('#vacId').value = editingId ?? '';
  $('#vacEmployee').value = v?.employee_name ?? '';
  $('#vacCompany').value = v?.company ?? '';
  $('#vacStart').value = v?.start_date ?? '';
  $('#vacEnd').value = v?.end_date ?? '';
  $('#vacNote').value = v?.note ?? '';
  $('#vacationForm').hidden = false;
  $('#vacEmployee').focus();
}

function closeForm() {
  editingId = null;
  $('#vacationForm').reset();
  $('#vacId').value = '';
  $('#vacationForm').hidden = true;
}

export function refreshVacations() {
  render();
  if (!state.vacations.length) loadVacations().catch((err) => ctx.toast(err.message));
}

export function initVacations(options) {
  ctx = { ...ctx, ...options };

  $('#newVacation').onclick = () => openForm();
  $('#cancelVacation').onclick = closeForm;

  $('#vacationForm').onsubmit = async (ev) => {
    ev.preventDefault();
    const data = {
      employee_name: $('#vacEmployee').value.trim(),
      company: $('#vacCompany').value.trim(),
      start_date: $('#vacStart').value || null,
      end_date: $('#vacEnd').value || null,
      note: $('#vacNote').value.trim(),
    };
    if (!data.employee_name) return;
    if (data.start_date && data.end_date && data.end_date < data.start_date) {
      ctx.toast('O fim das férias não pode ser antes do início.');
      return;
    }
    try {
      if (editingId) {
        await updateVacation(editingId, data);
        ctx.toast('Férias atualizadas.');
      } else {
        await createVacation(data);
        ctx.toast('Férias cadastradas!');
      }
      closeForm();
      render();
    } catch (err) { ctx.toast(err.message); }
  };

  $('#vacationList').onclick = async (ev) => {
    const row = ev.target.closest('.vacation-row');
    if (!row) return;
    const v = state.vacations.find((x) => x.id === row.dataset.id);
    if (!v) return;
    if (ev.target.closest('[data-edit]')) { openForm(v); return; }
    if (ev.target.closest('[data-del]')) {
      if (!window.confirm(`Excluir as férias de ${v.employee_name}?`)) return;
      try {
        await deleteVacation(v.id);
        render();
      } catch (err) { ctx.toast(err.message); }
    }
  };
}
