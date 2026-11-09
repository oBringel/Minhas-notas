// Calendário do DP: feriados nacionais/estaduais/municipais, pontos facultativos,
// datas comemorativas, datas cadastradas à mão e os compromissos que vêm de
// Admissão, Rescisão e Férias.
import { api } from './api.js';
import { state } from './store.js';
import { HOLIDAY_TYPES, UFS, holidaysByDay, typeLabel } from './holidays.js';
import { icon } from './icons.js';
import {
  esc, fmtDay, isAdmission, isRescission, monthLabel, todayStr, validDay, weekdayOf,
} from './util.js';

const $ = (sel) => document.querySelector(sel);
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const CATEGORY_LABEL = {
  prazo: 'Prazo', admissao: 'Admissão', ferias: 'Férias',
  documento: 'Documentação', feriado: 'Feriado', geral: 'Geral',
};

let ctx = { toast: () => {} };
let events = [];
let customDates = [];
let year = new Date().getFullYear();
let month = new Date().getMonth();
let selected = todayStr();
let view = 'mes';
let uf = '';
let city = '';
let editingId = null;

// Tipos visíveis (a legenda também funciona como filtro).
const visible = new Set(HOLIDAY_TYPES.map((t) => t.key));

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

// ---------- Feriados do ano (com a localidade configurada) ----------
let cacheYear = null;
let cacheKey = '';
let cacheMap = {};

function holidayMap() {
  const key = `${year}|${uf}|${customDates.length}|${[...visible].sort().join(',')}`;
  if (cacheYear === year && cacheKey === key) return cacheMap;
  const all = holidaysByDay(year, { uf, custom: customDates });
  const map = {};
  for (const [day, list] of Object.entries(all)) {
    const kept = list.filter((h) => visible.has(h.type));
    if (kept.length) map[day] = kept;
  }
  cacheYear = year;
  cacheKey = key;
  cacheMap = map;
  return map;
}

const holidaysOn = (day) => holidayMap()[day] || [];

// ---------- Desenho: filtros/legenda ----------
function renderFilters() {
  const box = $('#calFilters');
  if (!box) return;
  box.innerHTML = HOLIDAY_TYPES.map((t) => `
    <button type="button" class="cal-filter type-${t.key}${visible.has(t.key) ? ' is-on' : ''}"
            data-type="${t.key}" aria-pressed="${visible.has(t.key)}">
      <i class="dot"></i>${esc(t.label)}
    </button>`).join('');
}

// ---------- Desenho: mês ----------
function renderGrid() {
  const grid = $('#calGrid');
  if (!grid) return;

  const map = holidayMap();
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
    const list = map[day] || [];
    const dayEvents = inMonth ? eventsOn(day) : [];

    const classes = ['cal-day'];
    if (!inMonth) classes.push('is-other');
    if (day === today) classes.push('is-today');
    if (day === selected) classes.push('is-selected');
    if (list.some((h) => h.type === 'nacional' || h.type === 'estadual' || h.type === 'municipal')) {
      classes.push('is-holiday');
    }
    if (dow === 6) classes.push('is-sat');
    if (dow === 0) classes.push('is-sun');

    const numClass = ['num'];
    if (list.length) numClass.push('d-holiday');
    else if (dow === 6) numClass.push('d-sat');
    else if (dow === 0) numClass.push('d-sun');

    const tooltip = [
      ...list.map((h) => `${h.name} (${typeLabel(h.type)})`),
      ...dayEvents.map((e) => e.title),
    ].join(' · ');

    // Mostra no máximo dois chips por célula: primeiro as datas, depois eventos.
    const chips = [];
    for (const h of list.slice(0, 2)) {
      chips.push(`<span class="cal-chip type-${h.type}" title="${esc(h.name)} · ${esc(typeLabel(h.type))}">
        ${esc(h.name)}</span>`);
    }
    for (const ev of dayEvents) {
      if (chips.length >= 2) break;
      chips.push(`<span class="cal-chip cat-${ev.category}${ev.auto ? ' auto' : ''}" title="${esc(ev.title)}">
        ${esc(ev.title)}</span>`);
    }
    const total = list.length + dayEvents.length;
    if (total > chips.length && inMonth) chips.push(`<span class="more">+${total - chips.length}</span>`);

    html.push(`
      <button type="button" class="${classes.join(' ')}" data-day="${day}" data-month="${inMonth ? '1' : '0'}"
              title="${esc(tooltip || fmtDay(day))}" aria-label="${esc(`${fmtDay(day)}${tooltip ? ' — ' + tooltip : ''}`)}">
        <span class="${numClass.join(' ')}">${date.getUTCDate()}</span>
        ${chips.join('')}
      </button>`);
  }
  grid.innerHTML = html.join('');
  $('#calMonth').textContent = monthLabel(year, month);
  $('#calYear').value = String(year);
}

// ---------- Desenho: ano ----------
function renderYearView() {
  const box = $('#calYearView');
  if (!box) return;
  const map = holidayMap();

  box.innerHTML = MONTHS.map((name, m) => {
    const prefix = `${year}-${String(m + 1).padStart(2, '0')}`;
    const items = Object.entries(map)
      .filter(([day]) => day.startsWith(prefix))
      .flatMap(([, list]) => list)
      .sort((a, b) => a.day.localeCompare(b.day));
    const count = allEvents().filter((e) => e.day.startsWith(prefix)).length;
    const shown = items.slice(0, 6);
    const extra = items.length - shown.length;

    return `
      <article class="cal-ycard">
        <header>
          <strong>${name}</strong>
          <small>${items.length} ${items.length === 1 ? 'data' : 'datas'}${count ? ` · ${count} evento${count === 1 ? '' : 's'}` : ''}</small>
        </header>
        <ul>
          ${shown.map((h) => `
            <li><button type="button" class="cal-yitem type-${h.type}" data-goto="${h.day}"
                        title="${esc(h.name)} · ${esc(typeLabel(h.type))}">
              <span class="cal-yday">${h.day.slice(8, 10)}</span>
              <span class="cal-yname">${esc(h.name)}</span>
            </button></li>`).join('')}
          ${extra > 0 ? `<li class="cal-ymore">+${extra} ${extra === 1 ? 'data' : 'datas'}</li>` : ''}
        </ul>
        ${items.length ? '' : '<p class="cal-yempty">Sem datas neste mês.</p>'}
        <button type="button" class="cal-ylink" data-month="${m}">Abrir ${name.toLowerCase()}</button>
      </article>`;
  }).join('');

  $('#calMonth').textContent = `Ano de ${year}`;
  $('#calYear').value = String(year);
}

// ---------- Desenho: dia selecionado ----------
function renderDay() {
  const title = $('#calDayTitle');
  const list = $('#calDayEvents');
  const holidaysBox = $('#calDayHolidays');
  if (!title || !list || !holidaysBox) return;

  if (!validDay(selected)) {
    title.textContent = 'Escolha um dia';
    list.innerHTML = '';
    holidaysBox.innerHTML = '';
    return;
  }

  title.textContent = `${fmtDay(selected)} · ${WEEKDAYS[weekdayOf(selected)]}`;
  $('#calEventDay').value = selected;

  const list_ = holidaysOn(selected);
  holidaysBox.innerHTML = list_.length
    ? list_.map((h) => `
      <div class="cal-holiday type-${h.type}">
        <span class="cal-holiday-tag">${esc(typeLabel(h.type))}</span>
        <strong>${esc(h.name)}</strong>
      </div>`).join('')
    : '';

  const items = eventsOn(selected);
  const parts = items.map((ev) => `
    <div class="cal-event cat-${ev.category}" data-id="${esc(ev.id)}">
      <div>
        <strong>${esc(ev.title)}</strong>
        ${ev.description ? `<small>${esc(ev.description)}</small>` : ''}
      </div>
      <div class="cal-event-actions">
        <span class="cat">${esc(CATEGORY_LABEL[ev.category] ?? 'Geral')}</span>
        ${ev.auto ? '<span class="cal-auto">automático</span>' : `
          <button type="button" class="icon-btn" data-editev title="Editar evento">${icon('pencil', { size: 15 })}</button>
          <button type="button" class="icon-btn" data-delev title="Excluir evento">${icon('trash-2', { size: 15 })}</button>`}
      </div>
    </div>`);

  if (!items.length) parts.push('<p class="empty">Nenhum compromisso neste dia.</p>');
  list.innerHTML = parts.join('');
}

// ---------- Desenho: datas cadastradas ----------
function renderCustomDates() {
  const box = $('#customDateList');
  if (!box) return;
  if (!customDates.length) {
    box.innerHTML = '<p class="empty">Nenhuma data cadastrada ainda.</p>';
    return;
  }
  box.innerHTML = [...customDates]
    .sort((a, b) => String(a.day).slice(5).localeCompare(String(b.day).slice(5)))
    .map((d) => `
      <div class="cd-row">
        <div>
          <strong>${esc(d.name)}</strong>
          <small>${esc(fmtDay(d.day))} · ${esc(typeLabel(d.kind))}${d.yearly ? ' · todo ano' : ''}</small>
        </div>
        <button type="button" class="icon-btn" data-cddel="${esc(d.id)}" title="Excluir data">
          ${icon('trash-2', { size: 15 })}</button>
      </div>`).join('');
}

function renderAll() {
  renderYearOptions();
  renderFilters();
  if (view === 'ano') {
    $('#calMonthView').hidden = true;
    $('#calYearView').hidden = false;
    renderYearView();
  } else {
    $('#calMonthView').hidden = false;
    $('#calYearView').hidden = true;
    renderGrid();
  }
  renderDay();
  renderCustomDates();
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

function setView(next) {
  view = next;
  $('#calViewMes').classList.toggle('is-active', view === 'mes');
  $('#calViewAno').classList.toggle('is-active', view === 'ano');
  renderAll();
}

function goToDay(day) {
  selected = day;
  year = Number(day.slice(0, 4));
  month = Number(day.slice(5, 7)) - 1;
  setView('mes');
}

// ---------- Formulário de evento ----------
function resetEventForm() {
  editingId = null;
  const form = $('#calEventForm');
  form.reset();
  $('#calEventId').value = '';
  $('#calEventDay').value = selected;
  $('#calEventFormTitle').textContent = 'Novo evento';
  $('#calEventSubmit').innerHTML = `${icon('plus', { size: 16 })} Adicionar evento`;
  $('#calEventCancel').hidden = true;
}

function startEditEvent(id) {
  const ev = events.find((e) => e.id === id);
  if (!ev) return;
  editingId = id;
  $('#calEventTitle').value = ev.title || '';
  $('#calEventDesc').value = ev.description || '';
  $('#calEventDay').value = ev.day || selected;
  $('#calEventCategory').value = ev.category || 'geral';
  $('#calEventModule').value = ev.module || 'geral';
  $('#calEventFormTitle').textContent = 'Editando evento';
  $('#calEventSubmit').innerHTML = `${icon('save', { size: 16 })} Salvar alterações`;
  $('#calEventCancel').hidden = false;
  $('#calEventForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Carregar ----------
async function loadEvents() {
  try {
    events = await api.listEvents();
    renderAll();
  } catch (err) { ctx.toast(err.message); }
}

async function loadCustomDates() {
  try {
    customDates = await api.listCustomDates();
    renderAll();
  } catch (err) { ctx.toast(err.message); }
}

async function loadLocal() {
  try {
    const panel = await api.getPanel();
    uf = panel.uf || '';
    city = panel.city || '';
    if ($('#calUf')) $('#calUf').value = uf;
    if ($('#calCity')) $('#calCity').value = city;
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
  if (options?.city) city = options.city;

  const now = new Date();
  year = now.getFullYear();
  month = now.getMonth();
  selected = todayStr();

  // Estado (UF) para os feriados estaduais
  const ufSelect = $('#calUf');
  ufSelect.innerHTML = '<option value="">Todo o Brasil</option>'
    + UFS.map(([code, name]) => `<option value="${code}">${name} (${code})</option>`).join('');
  ufSelect.onchange = async () => {
    uf = ufSelect.value;
    renderAll();
    try { await api.setPanelPart('uf', uf); } catch (err) { ctx.toast(err.message); }
  };

  const cityInput = $('#calCity');
  cityInput.onchange = async () => {
    city = cityInput.value.trim();
    try { await api.setPanelPart('city', city); } catch (err) { ctx.toast(err.message); }
  };

  $('#calPrev').onclick = () => {
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
    if (view === 'ano') setView('mes'); else renderAll();
  };
  $('#calNext').onclick = () => {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    if (view === 'ano') setView('mes'); else renderAll();
  };
  $('#calPrevYear').onclick = () => { year -= 1; selected = `${year}-${String(month + 1).padStart(2, '0')}-01`; renderAll(); };
  $('#calNextYear').onclick = () => { year += 1; selected = `${year}-${String(month + 1).padStart(2, '0')}-01`; renderAll(); };
  $('#calYear').onchange = (ev) => {
    year = Number(ev.target.value);
    if (!validDay(selected) || selected.slice(0, 4) !== String(year)) {
      selected = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    }
    renderAll();
  };
  $('#calToday').onclick = () => {
    const today = new Date();
    year = today.getFullYear();
    month = today.getMonth();
    selected = todayStr();
    setView('mes');
  };
  $('#calViewMes').onclick = () => setView('mes');
  $('#calViewAno').onclick = () => setView('ano');

  $('#calFilters').onclick = (ev) => {
    const btn = ev.target.closest('.cal-filter');
    if (!btn) return;
    const type = btn.dataset.type;
    if (visible.has(type)) visible.delete(type); else visible.add(type);
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

  $('#calYearView').onclick = (ev) => {
    const goto = ev.target.closest('[data-goto]');
    if (goto) { goToDay(goto.dataset.goto); return; }
    const m = ev.target.closest('[data-month]');
    if (m) { month = Number(m.dataset.month); setView('mes'); }
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
      if (editingId) {
        const saved = await api.updateEvent(editingId, data);
        events = events.map((e) => (e.id === editingId ? saved : e));
      } else {
        events.push(await api.createEvent(data));
      }
      selected = data.day;
      year = Number(selected.slice(0, 4));
      month = Number(selected.slice(5, 7)) - 1;
      resetEventForm();
      renderAll();
      ctx.toast(editingId ? 'Evento atualizado.' : 'Evento adicionado.');
    } catch (err) { ctx.toast(err.message); }
  };

  $('#calEventCancel').onclick = () => resetEventForm();

  $('#calDayEvents').onclick = async (ev) => {
    const edit = ev.target.closest('[data-editev]');
    if (edit) {
      startEditEvent(edit.closest('.cal-event')?.dataset.id);
      return;
    }
    const del = ev.target.closest('[data-delev]');
    if (!del) return;
    const id = del.closest('.cal-event')?.dataset.id;
    if (!id || !window.confirm('Excluir este evento?')) return;
    try {
      await api.deleteEvent(id);
      events = events.filter((e) => e.id !== id);
      if (editingId === id) resetEventForm();
      renderAll();
    } catch (err) { ctx.toast(err.message); }
  };

  $('#customDateForm').onsubmit = async (ev) => {
    ev.preventDefault();
    const data = {
      name: $('#cdName').value.trim(),
      day: $('#cdDay').value,
      kind: $('#cdKind').value,
      yearly: $('#cdYearly').checked,
    };
    if (!data.name || !data.day) { ctx.toast('Dê um nome e escolha a data.'); return; }
    try {
      customDates.push(await api.createCustomDate(data));
      $('#cdName').value = '';
      $('#cdDay').value = '';
      renderAll();
      ctx.toast('Data adicionada ao calendário.');
    } catch (err) { ctx.toast(err.message); }
  };

  $('#customDateList').onclick = async (ev) => {
    const btn = ev.target.closest('[data-cddel]');
    if (!btn) return;
    if (!window.confirm('Excluir esta data do calendário?')) return;
    try {
      await api.deleteCustomDate(btn.dataset.cddel);
      customDates = customDates.filter((d) => d.id !== btn.dataset.cddel);
      renderAll();
    } catch (err) { ctx.toast(err.message); }
  };

  resetEventForm();
  renderYearOptions();
  renderFilters();
  loadEvents();
  loadCustomDates();
  loadLocal();
}
