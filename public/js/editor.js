// Editor de nota, admissão e rescisão. Usado na página e também na janelinha flutuante:
// ele só mexe dentro do elemento (root) que recebe.
import {
  addTask, notify, removeNote, removeTask, saveNow, scheduleSave, setBenefit, setRescissionType,
  subscribe, toggleTask,
} from './store.js';
import {
  RESCISSION_TYPES, addDays, admissionTitle, esc, fmtDateTime, happyFace, isAdmission, isRescission,
  payDeadline, rescissionStatus, rescissionTitle, sendDeadline, showToast, validDay,
} from './util.js';

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

  // O bloco do topo só gruda na janelinha flutuante (regras em pip.css); na web rola normal.
  const rescissionHeadHTML = () => `
    <div class="editor-top">
      <div class="editor-head">
        <h2 class="note-title" id="heading">${esc(n.title)}</h2>
        ${headButtons()}
      </div>
      <div class="meta" id="status">Atualizada em ${fmtDateTime(n.updated_at)}</div>
    </div>
    <div class="status-banner" id="statusBanner" hidden></div>
    <div class="fields">
      <label class="field"><span>Empresa</span>
        <input id="company" type="text" value="${esc(n.company)}" autocomplete="off"></label>
      <label class="field"><span>Colaborador</span>
        <input id="employee" type="text" value="${esc(n.employee_name)}" autocomplete="off"></label>
      <label class="field"><span>Tipo de rescisão</span>
        <select id="rType">
          <option value="">Selecione o tipo</option>
          ${RESCISSION_TYPES.map((t) =>
            `<option value="${t.value}" ${n.rescission_type === t.value ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
        </select></label>
    </div>
    <div class="fields">
      <label class="field"><span>Último dia trabalhado</span>
        <input id="lastDay" type="date" value="${esc(n.last_day || '')}"></label>
      <label class="field"><span>Dia limite de pagamento</span>
        <input id="payLimit" type="date" value="${esc(n.pay_limit || '')}"></label>
      <label class="field"><span>Dia limite para envio</span>
        <input id="sendLimit" type="date" value="${esc(n.send_limit || '')}"></label>
    </div>
    <div class="preview-box">
      <label class="check"><input type="checkbox" id="hasPreview" ${n.has_preview ? 'checked' : ''}>
        <span>Envia prévia?</span></label>
      ${n.has_preview
        ? `<label class="field"><span>Data de enviar a prévia</span>
             <input id="previewDate" type="date" value="${esc(n.preview_date || '')}"></label>`
        : ''}
    </div>`;

  const checklistHTML = () => `
    <div class="checklist-title"><strong>Checklist</strong><span class="meta" id="count"></span></div>
    <div class="progress"><div id="bar"></div></div>
    <div class="items" id="items"></div>
    <form class="add-task" id="addForm">
      <input id="taskText" type="text" aria-label="Novo item" autocomplete="off"
             placeholder="${isAdmission(n) || isRescission(n) ? 'Adicionar item extra...' : 'Adicionar item ao checklist...'}">
      <button type="submit">Adicionar</button>
    </form>
    <p class="foot">Dica: marque um item concluído e veja as flores desabrocharem.</p>
    <div class="editor-actions"><button class="save-btn" type="button">Salvar</button></div>`;

  // ---------- Faixa de situação da rescisão (carinha e cor) ----------
  function updateBanner() {
    if (!isRescission(n)) return;
    const el = $('#statusBanner');
    if (!el) return;
    const s = rescissionStatus(n);
    if (s.key === 'none') { el.hidden = true; return; }
    el.hidden = false;
    el.className = `status-banner status-${s.key}`;
    el.innerHTML = `<span class="status-emoji" aria-hidden="true">${s.emoji}</span><strong>${esc(s.label)}</strong>`;
  }

  // ---------- Checklist ----------
  function updateProgress() {
    const done = n.tasks.filter((t) => t.done).length;
    const total = n.tasks.length;
    const count = $('#count');
    if (count) count.textContent = `${done}/${total} concluídos`;
    const bar = $('#bar');
    if (bar) bar.style.width = `${total ? (done / total) * 100 : 0}%`;
    updateBanner();
  }

  function taskRow(t) {
    const isFinal = t.key === 'r:final';
    const row = doc.createElement('div');
    row.className = 'task' + (t.done ? ' done' : '') + (t.locked ? ' locked' : '');
    row.innerHTML = `
      <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="Concluir item">
      <span>${esc(t.text)}</span>
      ${isFinal ? `<span class="final-face" aria-hidden="true" ${t.done ? '' : 'hidden'}>${happyFace(t.id)}</span>` : ''}
      ${t.locked ? LOCK_ICON
        : '<button class="remove" type="button" title="Remover item" aria-label="Remover item">×</button>'}`;

    const box = row.querySelector('input');
    const face = row.querySelector('.final-face');
    box.onchange = () => {
      const done = box.checked;
      row.classList.toggle('done', done);
      if (face) face.hidden = !done;
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

  // ---------- Campos de cada tipo ----------
  function bindAdmission() {
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
  }

  function bindRescission() {
    const changed = () => { edited(); notify('list'); updateBanner(); };

    // Empresa e colaborador: o título é "Rescisão" + 1º nome de cada
    const text = (selector, field) => {
      const input = $(selector);
      input.oninput = () => {
        n[field] = input.value;
        n.title = rescissionTitle(n);
        $('#heading').textContent = n.title;
        changed();
      };
    };
    text('#company', 'company');
    text('#employee', 'employee_name');

    // Tipo de rescisão: troca os itens do meio do checklist
    const select = $('#rType');
    select.onchange = async () => {
      try { await setRescissionType(n, select.value, self); }
      catch (err) { toast(err.message); }
      render();
      $('#rType')?.focus();
    };

    // Último dia trabalhado: preenche sozinho o limite de pagamento (+10 dias, antecipando
    // fim de semana), o limite de envio (-5 dias) e a data da prévia (+3 dias) — a não ser
    // que ela já tenha escrito outra data nesses campos.
    const lastDay = $('#lastDay');
    lastDay.oninput = () => {
      const previous = validDay(n.last_day) ? n.last_day : null;
      n.last_day = lastDay.value || null;
      if (validDay(n.last_day)) {
        const autoPay = previous ? payDeadline(previous) : null;
        const autoSend = previous ? sendDeadline(payDeadline(previous)) : null;
        if (!n.pay_limit || n.pay_limit === autoPay) {
          n.pay_limit = payDeadline(n.last_day);
          $('#payLimit').value = n.pay_limit;
        }
        if (!n.send_limit || n.send_limit === autoSend) {
          n.send_limit = sendDeadline(n.pay_limit);
          $('#sendLimit').value = n.send_limit;
        }
        if (n.has_preview) {
          const autoPreview = previous ? addDays(previous, 3) : null;
          if (!n.preview_date || n.preview_date === autoPreview) {
            n.preview_date = addDays(n.last_day, 3);
            const preview = $('#previewDate');
            if (preview) preview.value = n.preview_date;
          }
        }
      }
      changed();
    };

    const date = (selector, field) => {
      const input = $(selector);
      if (!input) return;
      input.oninput = () => { n[field] = input.value || null; changed(); };
    };
    date('#previewDate', 'preview_date');

    // Mudou o limite de pagamento à mão? O limite de envio acompanha, se ainda era automático.
    const payInput = $('#payLimit');
    payInput.oninput = () => {
      const autoSend = validDay(n.pay_limit) ? sendDeadline(n.pay_limit) : null;
      n.pay_limit = payInput.value || null;
      if (validDay(n.pay_limit) && (!n.send_limit || n.send_limit === autoSend)) {
        n.send_limit = sendDeadline(n.pay_limit);
        $('#sendLimit').value = n.send_limit;
      }
      changed();
    };

    date('#sendLimit', 'send_limit');

    // Envia prévia?
    const check = $('#hasPreview');
    check.onchange = () => {
      n.has_preview = check.checked;
      if (n.has_preview && !n.preview_date && validDay(n.last_day)) {
        n.preview_date = addDays(n.last_day, 3);
      }
      changed();
      render();
      $('#previewDate')?.focus();
    };
  }

  // ---------- Montagem ----------
  function render() {
    const head = isRescission(n) ? rescissionHeadHTML()
      : isAdmission(n) ? admissionHeadHTML() : noteHeadHTML();
    root.innerHTML = head + checklistHTML();

    const body = $('#bodyText');
    if (body) body.oninput = () => { n.body = body.value; edited(); };

    if (isRescission(n)) bindRescission();
    else if (isAdmission(n)) bindAdmission();
    else {
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
      const what = isRescission(n) ? 'esta rescisão' : isAdmission(n) ? 'esta admissão' : 'esta nota';
      del.onclick = async () => {
        if (!win.confirm(`Excluir ${what} e seu checklist?`)) return;
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
