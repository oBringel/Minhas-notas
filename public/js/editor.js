// Editor de nota/admissão. Usado na página e também na janelinha flutuante:
// ele só mexe dentro do elemento (root) que recebe.
import {
  addTask, notify, removeNote, removeTask, saveNow, scheduleSave, setBenefit, subscribe, toggleTask,
} from './store.js';
import { admissionTitle, esc, fmtDateTime, isAdmission, showToast } from './util.js';

const LOCK_ICON = `<span class="lock" title="Item fixo, não pode ser removido">
  <svg viewBox="0 0 16 16" width="14" height="14" role="img" aria-label="Item fixo">
    <rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor"/>
    <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/>
  </svg></span>`;

/**
 * opts.allowDelete : mostra o botão Excluir
 * opts.onSaved     : chamado depois que ela clica em Salvar
 * opts.onDeleted   : chamado depois de excluir
 * Devolve { destroy() }.
 */
export function mountEditor(root, n, opts = {}) {
  const { allowDelete = false, onSaved = () => {}, onDeleted = () => {} } = opts;
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const $ = (sel) => root.querySelector(sel);
  const toast = (message) => showToast(message, doc);
  const self = {}; // identifica este editor nos avisos da store
  let alive = true;

  const setStatus = (text) => { const el = $('#status'); if (el) el.textContent = text; };
  const saveOpts = { win, onStatus: setStatus, onError: (err) => toast(err.message) };
  const edited = () => scheduleSave(n, saveOpts);

  // ---------- HTML ----------
  const headButtons = () => `
      <button class="save-btn" type="button">Salvar</button>
      ${allowDelete ? '<button class="secondary" id="delete" type="button">Excluir</button>' : ''}`;

  const noteHeadHTML = () => `
    <div class="editor-head">
      <input id="title" type="text" aria-label="Título da nota" value="${esc(n.title)}">
      ${headButtons()}
    </div>
    <div class="meta" id="status">Atualizada em ${fmtDateTime(n.updated_at)}</div>
    <textarea id="bodyText" placeholder="Escreva sua anotação aqui..." aria-label="Anotação">${esc(n.body)}</textarea>`;

  const benefitHTML = (key, label, enabled, eventText) => `
    <div class="benefit" role="radiogroup" aria-label="${label}">
      <span class="benefit-label">${label}</span>
      <div class="segmented">
        <label><input type="radio" name="${key}" value="sim" ${enabled ? 'checked' : ''}><span>Sim</span></label>
        <label><input type="radio" name="${key}" value="nao" ${enabled ? '' : 'checked'}><span>Não</span></label>
      </div>
      ${enabled
        ? `<input class="benefit-event" id="event-${key}" type="text" value="${esc(eventText)}"
             placeholder="Qual evento cadastrar na adm?" aria-label="Evento do ${key.toUpperCase()}" autocomplete="off">`
        : ''}
    </div>`;

  const admissionHeadHTML = () => `
    <div class="editor-head">
      <h2 class="note-title" id="heading">${esc(n.title)}</h2>
      ${headButtons()}
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

  const checklistHTML = () => `
    <div class="checklist-title"><strong>Checklist</strong><span class="meta" id="count"></span></div>
    <div class="progress"><div id="bar"></div></div>
    <div class="items" id="items"></div>
    <form class="add-task" id="addForm">
      <input id="taskText" type="text" aria-label="Novo item" autocomplete="off"
             placeholder="${isAdmission(n) ? 'Adicionar item extra...' : 'Adicionar item ao checklist...'}">
      <button type="submit">Adicionar</button>
    </form>
    <p class="foot">Dica: marque um item concluído e veja as flores desabrocharem.</p>
    <div class="editor-actions"><button class="save-btn" type="button">Salvar</button></div>`;

  // ---------- Checklist ----------
  function updateProgress() {
    const done = n.tasks.filter((t) => t.done).length;
    const total = n.tasks.length;
    const count = $('#count');
    if (count) count.textContent = `${done}/${total} concluídos`;
    const bar = $('#bar');
    if (bar) bar.style.width = `${total ? (done / total) * 100 : 0}%`;
  }

  function taskRow(t) {
    const row = doc.createElement('div');
    row.className = 'task' + (t.done ? ' done' : '') + (t.locked ? ' locked' : '');
    row.innerHTML = `
      <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="Concluir item">
      <span>${esc(t.text)}</span>
      ${t.locked ? LOCK_ICON
        : '<button class="remove" type="button" title="Remover item" aria-label="Remover item">×</button>'}`;

    const box = row.querySelector('input');
    box.onchange = () => {
      const done = box.checked;
      row.classList.toggle('done', done);
      const request = toggleTask(n, t, done, box, self); // a parte rápida já roda aqui
      updateProgress();
      request.catch((err) => toast(err.message)); // se falhar, a store desfaz e redesenha
    };

    const remove = row.querySelector('.remove');
    if (remove) {
      remove.onclick = async () => {
        try {
          await removeTask(n, t, self);
          render();
        } catch (err) { toast(err.message); }
      };
    }
    return row;
  }

  // ---------- Montagem ----------
  function render() {
    root.innerHTML = (isAdmission(n) ? admissionHeadHTML() : noteHeadHTML()) + checklistHTML();

    const body = $('#bodyText');
    body.oninput = () => { n.body = body.value; edited(); };

    if (isAdmission(n)) {
      const bind = (selector, field) => {
        const input = $(selector);
        input.oninput = () => {
          n[field] = input.value;
          if (field === 'employee_name') {
            n.title = admissionTitle(n);
            $('#heading').textContent = n.title;
          }
          edited();
          notify('list');
        };
      };
      bind('#employee', 'employee_name');
      bind('#company', 'company');
      bind('#admDate', 'admission_date');

      // Tem VT? / Tem VR?  (com a linha para escrever o evento)
      [['vt', 'has_vt', 'event_vt'], ['vr', 'has_vr', 'event_vr']].forEach(([key, field, eventField]) => {
        const eventInput = $(`#event-${key}`);
        if (eventInput) {
          eventInput.oninput = () => { n[eventField] = eventInput.value; edited(); notify('list'); };
        }
        root.querySelectorAll(`input[name="${key}"]`).forEach((radio) => {
          radio.onchange = async () => {
            try { await setBenefit(n, key, radio.value === 'sim', self); }
            catch (err) { toast(err.message); }
            render();
            // Ao marcar Sim, o cursor já vai para a linha do evento
            const next = n[field] ? $(`#event-${key}`) : $(`input[name="${key}"]:checked`);
            if (next) next.focus();
          };
        });
      });
    } else {
      const title = $('#title');
      title.oninput = () => { n.title = title.value; edited(); notify('list'); };
    }

    // Salvar (botão de cima e o de baixo)
    root.querySelectorAll('.save-btn').forEach((btn) => {
      btn.onclick = async () => {
        try {
          await saveNow(n);
          toast('Salvo com sucesso!');
          onSaved();
        } catch (err) {
          setStatus('Não foi possível salvar.');
          toast(err.message);
        }
      };
    });

    // Excluir
    const del = $('#delete');
    if (del) {
      del.onclick = async () => {
        if (!win.confirm(`Excluir ${isAdmission(n) ? 'esta admissão' : 'esta nota'} e seu checklist?`)) return;
        try {
          await removeNote(n);
          onDeleted();
        } catch (err) { toast(err.message); }
      };
    }

    // Novo item
    $('#addForm').onsubmit = async (ev) => {
      ev.preventDefault();
      const text = $('#taskText').value.trim();
      if (!text) return;
      try {
        await addTask(n, text, self);
        render();
        $('#taskText')?.focus();
      } catch (err) { toast(err.message); }
    };

    const items = $('#items');
    n.tasks.forEach((t) => items.append(taskRow(t)));
    updateProgress();
  }

  // Se a mesma nota mudar em outra tela (página ou janelinha), este editor se atualiza
  const unsubscribe = subscribe((kind, meta) => {
    if (alive && kind === 'note' && meta.id === n.id && meta.source !== self) render();
  });

  render();
  return {
    destroy() { alive = false; unsubscribe(); },
  };
}
