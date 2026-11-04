// Funções pequenas usadas em várias telas

export const esc = (text) =>
  String(text).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmtDate = (iso) => new Date(iso).toLocaleDateString('pt-BR');
export const fmtDateTime = (iso) => new Date(iso).toLocaleString('pt-BR');
export const fmtDay = (day) => day.split('-').reverse().join('/'); // 2026-11-03 -> 03/11/2026

export const isAdmission = (n) => n.kind === 'admissao';
export const admissionTitle = (n) =>
  n.employee_name.trim() ? `Admissão · ${n.employee_name.trim()}` : 'Nova admissão';

/** Linha de apoio embaixo do nome da nota. */
export function noteSubtitle(n) {
  const done = n.tasks.filter((t) => t.done).length;
  return [
    isAdmission(n) && n.company,
    n.tasks.length && `${done}/${n.tasks.length} itens concluídos`,
    isAdmission(n) ? (n.admission_date && fmtDay(n.admission_date)) : fmtDate(n.updated_at),
  ].filter(Boolean).join(' · ');
}

/** term já deve estar em minúsculas. Sem termo, nem monta o texto de busca. */
export function noteMatches(n, term) {
  if (!term) return true;
  return `${n.title} ${n.body} ${n.employee_name} ${n.company} ${n.event_vt} ${n.event_vr} ${n.tasks.map((t) => t.text).join(' ')}`
    .toLowerCase().includes(term);
}

const toastTimers = new WeakMap();
/** Aviso na tela. Funciona também na janelinha flutuante (passe o document dela). */
export function showToast(message, doc = document) {
  let el = doc.getElementById('toast');
  if (!el) {
    el = doc.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    doc.body.append(el);
  }
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimers.get(el));
  toastTimers.set(el, setTimeout(() => { el.hidden = true; }, 4500));
}
