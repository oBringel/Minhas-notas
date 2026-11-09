// Calendário mensal: feriados nacionais, eventos manuais e datas que vêm
// das admissões, rescisões e férias.
import { api } from './api.js';
import { state } from './store.js';
import {
  esc, fmtDay, holidaysOf, isAdmission, isRescission, monthLabel, todayStr, validDay, weekdayOf,
} from './util.js';

const $ = (sel) => document.querySelector(sel);

let ctx = { toast: () => {} };
let events = [];
let year = new Date().getFullYear();
let month = new Date().getMonth();
let selected = todayStr();

const CATEGORY_LABEL = {
  prazo: 'Prazo', admissao: 'Admissão', ferias: 'Férias',
  documento: 'Documentação', feriado: 'Feriado', geral: 'Geral',
};

// ---------- Datas que vêm dos módulos ----------
function derivedEvents() {
  const out = [];
  for (const n of state.notes) {
    if (isAdmission(n) && validDay(n.admission_date)) {
      out.push({
        id: `auto:adm:${n.id}`, auto: true, title: `Admissão · ${n.employee_name || n.title}`,
        day: n.admission_date, category: 'admissao', module: 'admissao',
        description: n.company || 'Admissão programada',
      });
    }
    if (isRescission(n)) {
      if (validDay(n.send_limit)) {
        out.push({
          id: `auto:res:send:${n.id}`, auto: true, title: `Enviar prévia · ${n.title}`,
          day: n.send_limit, category: 'prazo', module: 'rescisao',
          description: n.company || 'Prazo da rescisão',
        });
      }
      if (validDay(n.pay_limit)) {
        out.push({
          id: `auto:res:pay:${n.id}`, auto: true, title: `Pagamento · ${n.title}`,
          day: n.pay_limit, category: 'prazo', module: 'rescisao',
          description: n.company || 'Limite de pagamento',
        });
      }
    }
  }
  for (const v of state.vacations || []) {
    const who = v.employee_name || 'colaborador';
    if (validDay(v.start_date)) {
      out.push({
        id: `auto:vac:start:${v.id}`, auto: true, title: `Início das férias · ${who}`,
        day: v.start_date, category: 'ferias', module: 'ferias', description: v.company || '',
      });
    }
    if (validDay(v.end_date)) {
      out.push({
        id: `auto:vac:end:${v.id}`, auto: true, title: `Volta das férias · ${who}`,
        day: v.end_date, category: 'ferias', module: 'ferias', description: v.company || '',
      });
    }
  }
  return out;
}

const allEvents = () => [...events, ...derivedEvents()];
const eventsOn = (day) => allEvents().filter((e) => e.day === day);

// ---------- Desenho ----------
function renderGrid() {
  const grid = $('#calGrid');
  if (!grid) return;

  const holidays = holidaysOf(year);
  const today = todayStr();
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const offset = (weekdayOf(first) + 6) % 7; // segunda = 0
  const cells = Math.ceil((offset + daysInMonth) / 7) * 7;

  const html = [];
  for (let i = 0; i < cells; i += 1) {
    const offsetDays = i - offset + 1;
    const date = new Date(Date.UTC(year, month, offsetDays));
    const day = date.toISOString().slice(0, 10);
    const inMonth = date.getUTCMonth() === month;
    const dow = date.getUTCDay(); // 0 dom, 6 sáb
    const holiday = holidays[day];
    const dayEvents = eventsOn(day);

    const classes = ['cal-day'];
    if (!inMonth) classes.push('other');
    if (day === today) classes.push('today');
    if (day === selected) classes.push('selected');

    const numClass = holiday ? 'num d-holiday' : dow === 6 ? 'num d-sat' : dow === 0 ? 'num d-sun' : 'num';

    const chips = [];
    if (holiday) chips.push(`<span class="cal-chip cat-feriado" title="${esc(holiday)}">${esc(holiday)}</span>`);
    for (const ev of dayEvents.slice(0, holiday ? 1 : 2)) {
      chips.push(`<span class="cal-chip cat-${ev.category}${ev.auto ? ' auto' : ''}" title="${esc(ev.title)}">${esc(ev.title)}</span>`);
    }
    const shown = chips.length;
    const total = dayEvents.length + (holiday ? 1 : 0);
    if (total > shown) chips.push(`<span class="more">+${total - shown}</span>`);

    html.push(`
      <button type="button" class="${classes.join(' ')}" data-day="${day}" data-month="${inMonth ? '1' : '0'}">
        <span class="${numClass}">${date.getUTCDate()}</span>
        ${chips.join('')}
      </button>`);
  }
  grid.innerHTML = html.join('');

  $('#calMonth').textContent = monthLabel(year, month);
  $('#calYear').value = String(year);
}

function renderDay() {
  const title = $('#calDayTitle');
  const list = $('#calDayEvents');
  if (!title || !list) return;

  if (!validDay(selected)) {
    title.textContent = 'Escolha um dia';
    list.innerHTML = '';
    return;
  }

  const holiday = holidaysOf(Number(selected.slice(0, 4)))[selected];
  const weekday = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][weekdayOf(selected)];
  title.textContent = `${fmtDay(selected)} · ${weekday}`;
  $('#calEventDay').value = selected;

  const items = eventsOn(selected);
  const parts = [];
  if (holiday) {
    parts.push(`<div class="cal-event"><div><strong>🎉 ${esc(holiday)}</strong>
      <small>Feriado nacional</small></div><span class="cat">Feriado</span></div>`);
  }
  parts.push(...items.map((ev) => `
    <div class="cal-event" data-id="${esc(ev.id)}">
      <div>
        <strong>${esc(ev.title)}</strong>
        ${ev.description ? `<small>${esc(ev.description)}</small>` : ''}
      </div>
      <div class="pend-actions">
        <span class="cat">${CATEGORY_LABEL[ev.category] ?? 'Geral'}</span>
        ${ev.auto ? '' : '<button type="button" class="icon-btn" data-delev title="Excluir evento">🗑</button>'}
      </div>
    </div>`));

  if (!holiday && !items.length) parts.push('<p class="empty">Nenhum compromisso neste dia.</p>');
  list.innerHTML = parts.join('');
}

function renderYearOptions() {
  const select = $('#calYear');
  if (!select) return;
  const base = new Date().getFullYear();
  const years = [];
  for (let y = base - 5; y <= base + 6; y += 1) years.push(y);
  if (!years.includes(year)) years.push(year);
  select.innerHTML = years.sort((a, b) => a - b)
    .map((y) => `<option value="${y}"${y === year ? ' selected' : ''}>${y}</option>`).join('');
}

function renderAll() {
  renderYearOptions();
  renderGrid();
  renderDay();
}

// ---------- Carregar ----------
async function loadEvents() {
  try {
    events = await api.listEvents();
    renderAll();
  } catch (err) { ctx.toast(err.message); }
}

// ---------- Início ----------
export function refreshCalendar() {
  renderAll();
  loadEvents();
}

export function initCalendar(options) {
  ctx = { ...ctx, ...options };

  const now = new Date();
  year = now.getFullYear();
  month = now.getMonth();
  selected = todayStr();

  $('#calPrev').onclick = () => {
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
    renderAll();
  };
  $('#calNext').onclick = () => {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    renderAll();
  };
  $('#calPrevYear').onclick = () => { year -= 1; renderAll(); };
  $('#calNextYear').onclick = () => { year += 1; renderAll(); };
  $('#calYear').onchange = (ev) => { year = Number(ev.target.value); renderAll(); };
  $('#calToday').onclick = () => {
    const today = new Date();
    year = today.getFullYear();
    month = today.getMonth();
    selected = todayStr();
    renderAll();
  };

  $('#calGrid').onclick = (ev) => {
    const cell = ev.target.closest('.cal-day');
    if (!cell) return;
    selected = cell.dataset.day;
    if (cell.dataset.month !== '1') {
      year = Number(selected.slice(0, 4));
      month = Number(selected.slice(5, 7)) - 1;
    }
    renderAll();
  };

  $('#calEventForm').onsubmit = async (ev) => {
    ev.preventDefault();
    const data = {
      title: $('#calEventTitle').value.trim(),
      description: $('#calEventDesc').value.trim(),
      day: $('#calEventDay').value,
      category: $('#calEventCategory').value,
      module: $('#calEventModule').value,
    };
    if (!data.title || !data.day) { ctx.toast('Escreva o título e escolha a data.'); return; }
    try {
      events.push(await api.createEvent(data));
      selected = data.day;
      $('#calEventForm').reset();
      $('#calEventForm').querySelector('[type="date"]').value = selected;
      $('#calEventDay').value = selected;
      // Se o evento caiu em outro mês, abre o mês dele
      year = Number(selected.slice(0, 4));
      month = Number(selected.slice(5, 7)) - 1;
      renderAll();
      ctx.toast('Evento adicionado.');
    } catch (err) { ctx.toast(err.message); }
  };

  $('#calDayEvents').onclick = async (ev) => {
    const del = ev.target.closest('[data-delev]');
    if (!del) return;
    const id = del.closest('.cal-event')?.dataset.id;
    if (!id || !window.confirm('Excluir este evento?')) return;
    try {
      await api.deleteEvent(id);
      events = events.filter((e) => e.id !== id);
      renderAll();
    } catch (err) { ctx.toast(err.message); }
  };
}
