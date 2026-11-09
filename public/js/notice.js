// Mensagem fixa do rodapé: aparece em todas as páginas e fica salva no banco.
import { api } from './api.js';

const $ = (sel) => document.querySelector(sel);
const EMPTY = 'Clique em editar para deixar um aviso sempre visível.';

let ctx = { toast: () => {} };
let message = '';

function render() {
  const text = $('#noticeText');
  const form = $('#noticeForm');
  if (!text || !form) return;
  if (form.hidden) {
    text.textContent = message || EMPTY;
    text.classList.toggle('is-empty', !message);
    text.title = message || EMPTY;
  }
}

function openForm() {
  $('#noticeInput').value = message;
  $('#noticeForm').hidden = false;
  $('#noticeText').hidden = true;
  $('#noticeEdit').hidden = true;
  $('#noticeInput').focus();
  $('#noticeInput').select();
}

function closeForm() {
  $('#noticeForm').hidden = true;
  $('#noticeText').hidden = false;
  $('#noticeEdit').hidden = false;
  render();
}

async function save(value) {
  try {
    await api.setPanelPart('footer', value);
    message = value;
    closeForm();
    ctx.toast(value ? 'Aviso do rodapé salvo.' : 'Aviso do rodapé limpo.');
  } catch (err) { ctx.toast(err.message); }
}

export function initNotice(options) {
  ctx = { ...ctx, ...options };

  $('#noticeEdit').onclick = openForm;
  $('#noticeCancel').onclick = closeForm;
  $('#noticeClear').onclick = () => save('');
  $('#noticeForm').onsubmit = (ev) => {
    ev.preventDefault();
    save($('#noticeInput').value.trim().slice(0, 500));
  };
  $('#noticeInput').onkeydown = (ev) => {
    if (ev.key === 'Escape') closeForm();
  };

  render();

  // O Dashboard também carrega o painel: aproveita para não pedir duas vezes
  document.addEventListener('panel:loaded', (ev) => {
    message = ev.detail?.footer ?? '';
    render();
  });

  api.getPanel()
    .then((panel) => { message = panel.footer ?? ''; render(); })
    .catch(() => { /* rodapé vazio se o servidor não responder */ });
}
