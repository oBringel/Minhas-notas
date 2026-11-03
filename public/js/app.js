import { api } from './api.js';
import { bloom, floatText, flowerSVG } from './flowers.js';
import { initScore, loadScore, nudgeScore, setScore } from './score.js';

const $ = (sel, root = document) => root.querySelector(sel);
const state = { notes: [], selected: null, term: '' };
const saveTimers = new Map();

const esc = (text) =>
  String(text).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const current = () => state.notes.find((n) => n.id === state.selected);
const fmtDate = (iso) => new Date(iso).toLocaleDateString('pt-BR');
const fmtDateTime = (iso) => new Date(iso).toLocaleString('pt-BR');
const fmtDay = (day) => day.split('-').reverse().join('/'); // 2026-11-03 -> 03/11/2026
const isAdmission = (n) => n.kind === 'admissao';
const admissionTitle = (n) =>
  n.employee_name.trim() ? `Admissão · ${n.employee_name.trim()}` : 'Nova admissão';

// ---------- Aviso ----------
let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4500);
}

// ---------- Lista ----------
function renderList() {
  const root = $('#notes');
  root.innerHTML = '';
  const term = state.term.toLowerCase();
  const filtered = state.notes.filter((n) =>
    `${n.title} ${n.body} ${n.employee_name} ${n.company} ${n.event_vt} ${n.event_vr} ${n.tasks.map((t) => t.text).join(' ')}`
      .toLowerCase().includes(term));

  if (!filtered.length) {
    root.innerHTML = '<div class="empty">Nenhuma nota encontrada.</div>';
    return;
  }

  filtered.forEach((n) => {
    const done = n.tasks.filter((t) => t.done).length;
    const parts = [
      isAdmission(n) && n.company,
      n.tasks.length && `${done}/${n.tasks.length} itens concluídos`,
      isAdmission(n) ? (n.admission_date && fmtDay(n.admission_date)) : fmtDate(n.updated_at),
    ].filter(Boolean);

    const el = document.createElement('div');
    el.className = 'note-pick' + (isAdmission(n) ? ' admissao' : '') + (n.id === state.selected ? ' active' : '');
    el.tabIndex = 0;
    el.innerHTML = `<strong>${esc(n.title || 'Sem título')}</strong><small>${esc(parts.join(' · '))}</small>`;
    const open = () => { state.selected = n.id; render(); };
    el.onclick = open;
    el.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } };
    root.append(el);
  });
}

// ---------- Progresso (atualiza sem recriar o editor) ----------
function refreshProgress(n) {
  const done = n.tasks.filter((t) => t.done).length;
  const total = n.tasks.length;
  const count = $('#count');
  if (count) count.textContent = `${done}/${total} concluídos`;
  const bar = $('#bar');
  if (bar) bar.style.width = `${total ? (done / total) * 100 : 0}%`;
  renderList();
}

// ---------- Salvamento automático ----------
function setStatus(text) {
  const el = $('#status');
  if (el) el.textContent = text;
}

function savePayload(n) {
  return isAdmission(n)
    ? {
        employee_name: n.employee_name, company: n.company, admission_date: n.admission_date || null,
        body: n.body, event_vt: n.event_vt, event_vr: n.event_vr,
      }
    : { title: n.title, body: n.body };
}

function scheduleSave(n) {
  setStatus('Salvando...');
  clearTimeout(saveTimers.get(n.id));
  saveTimers.set(n.id, setTimeout(async () => {
    try {
      const res = await api.updateNote(n.id, savePayload(n));
      n.updated_at = res.updated_at;
      if (state.selected === n.id) setStatus(`Atualizada em ${fmtDateTime(n.updated_at)}`);
      renderList();
    } catch (err) {
      setStatus('Não foi possível salvar.');
      toast(err.message);
    }
  }, 500));
}

// ---------- Trechos do editor ----------
function noteHeadHTML(n) {
  return `
    <div class="editor-head">
      <input id="title" type="text" aria-label="Título da nota" value="${esc(n.title)}">
      <button class="secondary" id="delete" type="button">Excluir</button>
    </div>
    <div class="meta" id="status">Atualizada em ${fmtDateTime(n.updated_at)}</div>
    <textarea id="bodyText" placeholder="Escreva sua anotação aqui..." aria-label="Anotação">${esc(n.body)}</textarea>`;
}

function benefitHTML(key, label, enabled, eventText) {
  const field = enabled
    ? `<input class="benefit-event" id="event-${key}" type="text" value="${esc(eventText)}"
         placeholder="Qual evento cadastrar na adm?" aria-label="Evento do ${key.toUpperCase()}" autocomplete="off">`
    : '';
  return `
    <div class="benefit" role="radiogroup" aria-label="${label}">
      <span class="benefit-label">${label}</span>
      <div class="segmented">
        <label><input type="radio" name="${key}" value="sim" ${enabled ? 'checked' : ''}><span>Sim</span></label>
        <label><input type="radio" name="${key}" value="nao" ${enabled ? '' : 'checked'}><span>Não</span></label>
      </div>
      ${field}
    </div>`;
}

function admissionHeadHTML(n) {
  return `
    <div class="editor-head">
      <h2 class="note-title" id="heading">${esc(n.title)}</h2>
      <button class="secondary" id="delete" type="button">Excluir</button>
    </div>
    <div class="meta" id="status">Atualizada em ${fmtDateTime(n.updated_at)}</div>
    <div class="fields">
      <label class="field"><span>Nome</span>
        <input id="employee" type="text" value="${esc(n.employee_name)}" autocomplete="off"></label>
      <label class="field"><span>Empresa</span>
        <input id="company" type="text" value="${esc(n.company)}" autocomplete="off"></label>
      <label class="field"><span>Data de admissão</span>
        <input id="admDate" type="date" value="${esc(n.admission_date || '')}"></label>
    </div>
    <label class="field"><span>Observações</span>
      <textarea id="bodyText" placeholder="Escreva as observações aqui...">${esc(n.body)}</textarea></label>
    <fieldset class="benefits">
      <legend>Benefícios</legend>
      ${benefitHTML('vt', 'Tem VT?', n.has_vt, n.event_vt)}
      ${benefitHTML('vr', 'Tem VR?', n.has_vr, n.event_vr)}
    </fieldset>`;
}

const checklistHTML = (extraLabel) => `
    <div class="checklist-title"><strong>Checklist</strong><span class="meta" id="count"></span></div>
    <div class="progress"><div id="bar"></div></div>
    <div class="items" id="items"></div>
    <form class="add-task" id="addForm">
      <input id="taskText" type="text" placeholder="${extraLabel}" aria-label="Novo item" autocomplete="off">
      <button type="submit">Adicionar</button>
    </form>
    <p class="foot">Dica: marque um item concluído e veja as flores desabrocharem.</p>`;

// ---------- Editor ----------
function renderEditor() {
  const n = current();
  const e = $('#editor');
  if (!n) {
    e.innerHTML = '<div class="empty">Crie uma admissão ou uma nota para começar.</div>';
    return;
  }

  e.innerHTML = (isAdmission(n) ? admissionHeadHTML(n) : noteHeadHTML(n))
    + checklistHTML(isAdmission(n) ? 'Adicionar item extra...' : 'Adicionar item ao checklist...');

  // Campos
  const body = $('#bodyText', e);
  body.oninput = () => { n.body = body.value; scheduleSave(n); };

  if (isAdmission(n)) {
    const bind = (selector, field) => {
      const input = $(selector, e);
      input.oninput = () => {
        n[field] = input.value;
        if (field === 'employee_name') {
          n.title = admissionTitle(n);
          $('#heading').textContent = n.title;
        }
        scheduleSave(n);
        renderList();
      };
    };
    bind('#employee', 'employee_name');
    bind('#company', 'company');
    bind('#admDate', 'admission_date');

    // Tem VT? / Tem VR?  (com a linha para escrever o evento)
    [['vt', 'has_vt', 'event_vt'], ['vr', 'has_vr', 'event_vr']].forEach(([key, field, eventField]) => {
      const eventInput = $(`#event-${key}`, e);
      if (eventInput) {
        eventInput.oninput = () => { n[eventField] = eventInput.value; scheduleSave(n); renderList(); };
      }
      e.querySelectorAll(`input[name="${key}"]`).forEach((radio) => {
        radio.onchange = async () => {
          const previous = n[field];
          n[field] = radio.value === 'sim';
          try {
            n.tasks = await api.setBenefit(n.id, key, n[field]);
          } catch (err) {
            n[field] = previous;
            toast(err.message);
          }
          if (!n[field]) { n[eventField] = ''; loadScore(); }
          renderEditor();
          // Ao marcar Sim, o cursor já vai para a linha do evento
          const next = n[field] ? $(`#event-${key}`) : $(`input[name="${key}"]:checked`);
          if (next) next.focus();
        };
      });
    });
  } else {
    const title = $('#title', e);
    title.oninput = () => { n.title = title.value; scheduleSave(n); renderList(); };
  }

  // Excluir
  $('#delete', e).onclick = async () => {
    const what = isAdmission(n) ? 'esta admissão' : 'esta nota';
    if (!confirm(`Excluir ${what} e seu checklist?`)) return;
    try {
      clearTimeout(saveTimers.get(n.id));
      await api.deleteNote(n.id);
      state.notes = state.notes.filter((x) => x.id !== n.id);
      state.selected = state.notes[0]?.id || null;
      render();
      loadScore();
    } catch (err) { toast(err.message); }
  };

  // Novo item
  $('#addForm', e).onsubmit = async (ev) => {
    ev.preventDefault();
    const text = $('#taskText', e).value.trim();
    if (!text) return;
    try {
      const task = await api.addTask(n.id, text);
      n.tasks.push(task);
      renderEditor();
      $('#taskText').focus();
    } catch (err) { toast(err.message); }
  };

  const items = $('#items', e);
  n.tasks.forEach((t) => items.append(taskRow(n, t)));
  refreshProgress(n);
}

const LOCK_ICON = `<span class="lock" title="Item fixo, não pode ser removido">
  <svg viewBox="0 0 16 16" width="14" height="14" role="img" aria-label="Item fixo">
    <rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor"/>
    <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/>
  </svg></span>`;

function taskRow(n, t) {
  const row = document.createElement('div');
  row.className = 'task' + (t.done ? ' done' : '') + (t.locked ? ' locked' : '');
  row.innerHTML = `
    <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="Concluir item">
    <span>${esc(t.text)}</span>
    ${t.locked ? LOCK_ICON
      : '<button class="remove" type="button" title="Remover item" aria-label="Remover item">×</button>'}`;

  const box = $('input', row);
  box.onchange = async () => {
    const done = box.checked;
    t.done = done;
    row.classList.toggle('done', done);
    if (done) { bloom(box); floatText(box, '+1'); } // 🌸 florzinhas e ponto!
    nudgeScore(done ? 1 : -1);
    refreshProgress(n);
    try {
      const res = await api.setTaskDone(t.id, done);
      setScore(res.score, { celebrate: true });
    } catch (err) {
      t.done = !done;
      box.checked = !done;
      row.classList.toggle('done', !done);
      nudgeScore(done ? -1 : 1);
      refreshProgress(n);
      toast(err.message);
    }
  };

  const remove = $('.remove', row);
  if (remove) {
    remove.onclick = async () => {
      try {
        await api.deleteTask(t.id);
        n.tasks = n.tasks.filter((x) => x.id !== t.id);
        renderEditor();
        loadScore();
      } catch (err) { toast(err.message); }
    };
  }
  return row;
}

function render() {
  renderList();
  renderEditor();
}

// ---------- Criar nota ou admissão ----------
async function createNote(kind) {
  try {
    const n = await api.createNote({ kind });
    state.notes.unshift(n);
    state.selected = n.id;
    render();
    const first = $(isAdmission(n) ? '#employee' : '#title');
    if (first) { first.focus(); first.select(); }
  } catch (err) { toast(err.message); }
}

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
$('#newNote').onclick = () => createNote('nota');
$('#newAdmission').onclick = () => createNote('admissao');
$('#search').oninput = (ev) => { state.term = ev.target.value; renderList(); };
decorateHero();
initScore({ toast });

(async function init() {
  try {
    state.notes = await api.listNotes();
  } catch {
    toast('Não consegui falar com o servidor. Veja se ele e o Postgres estão rodando.');
    renderEditor();
    return;
  }
  state.selected = state.notes[0]?.id || null;
  render();
  loadScore();
})();
