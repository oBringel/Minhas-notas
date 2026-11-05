// Funções pequenas usadas em várias telas

export const esc = (text) =>
  String(text).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmtDate = (iso) => new Date(iso).toLocaleDateString('pt-BR');
export const fmtDateTime = (iso) => new Date(iso).toLocaleString('pt-BR');
export const fmtDay = (day) => day.split('-').reverse().join('/'); // 2026-11-03 -> 03/11/2026

// ---------- Tipos de nota ----------
export const isAdmission = (n) => n.kind === 'admissao';
export const isRescission = (n) => n.kind === 'rescisao';
export const isComplete = (n) => n.tasks.length > 0 && n.tasks.every((t) => t.done);

export const admissionTitle = (n) =>
  n.employee_name.trim() ? `Admissão · ${n.employee_name.trim()}` : 'Nova admissão';

// Título da rescisão: "Rescisão" + 1º nome da empresa + 1º nome do colaborador
const firstWord = (text) => String(text ?? '').trim().split(/\s+/)[0] || '';
export function rescissionTitle(n) {
  const parts = [firstWord(n.company), firstWord(n.employee_name)].filter(Boolean);
  return parts.length ? `Rescisão ${parts.join(' ')}` : 'Nova rescisão';
}

// Os itens de cada tipo ficam no servidor (server/index.js); aqui só o nome que aparece na tela.
export const RESCISSION_TYPES = [
  { value: 'sem_justa_causa', label: 'Demissão sem justa causa' },
  { value: 'pedido_demissao', label: 'Pedido de demissão' },
  { value: 'antecipacao_empregador', label: 'Antecipação de período de experiência (parte do empregador)' },
  { value: 'antecipacao_empregado', label: 'Antecipação de período de experiência (pedido do empregado)' },
];

// ---------- Datas (texto "AAAA-MM-DD", sem mexer com fuso) ----------
const toUTC = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const validDay = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && +s.slice(0, 4) >= 2000 && +s.slice(0, 4) <= 2100;
export const addDays = (s, n) => new Date(toUTC(s) + n * 86400000).toISOString().slice(0, 10);
export const diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / 86400000); // a - b
const weekday = (s) => new Date(toUTC(s)).getUTCDay(); // 0 = domingo, 6 = sábado

/** Se cair no fim de semana, volta para o último dia útil (sexta). */
export function previousBusinessDay(s) {
  let d = s;
  while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, -1);
  return d;
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// =====================================================================
//  PRAZO DA RESCISÃO (é isto que decide as carinhas)
// =====================================================================
// - Com prévia: vale a data de enviar a prévia.
// - Sem prévia: vale o "Dia limite de pagamento" menos 5 dias. Essa conta é interna e
//   nunca aparece na tela. Se cair no fim de semana, vai para o último dia útil.
// =====================================================================
export function rescissionDeadline(n) {
  if (n.has_preview) return validDay(n.preview_date) ? n.preview_date : null;
  if (!validDay(n.pay_limit)) return null;
  return previousBusinessDay(addDays(n.pay_limit, -5));
}

/**
 * Situação da rescisão:
 *  concluída            -> 💅 verde
 *  1 dia de atraso      -> 🥶 azul
 *  2 dias ou mais       -> 😡 vermelho
 *  dentro do prazo      -> 🙂
 *  sem datas ainda      -> nada
 */
export function rescissionStatus(n, today = todayStr()) {
  if (isComplete(n)) return { key: 'done', emoji: '💅', label: 'Concluída' };
  const deadline = rescissionDeadline(n);
  if (!deadline) return { key: 'none', emoji: '', label: '' };
  const late = diffDays(today, deadline);
  if (late >= 2) return { key: 'angry', emoji: '😡', label: `${late} dias de atraso` };
  if (late === 1) return { key: 'cold', emoji: '🥶', label: '1 dia de atraso' };
  if (late === 0) return { key: 'ok', emoji: '🙂', label: 'Prazo é hoje' };
  return { key: 'ok', emoji: '🙂', label: 'Dentro do prazo' };
}

/** Classes e carinha de uma nota para as listas. */
export function noteFace(n) {
  if (!isRescission(n)) return null;
  const s = rescissionStatus(n);
  return s.key === 'none' ? null : s;
}

// Carinha feliz do último item da rescisão
const HAPPY = ['😃', '😄', '😁'];
export const happyFace = (seed) => HAPPY[String(seed).charCodeAt(0) % HAPPY.length];

// ---------- Textos e busca ----------
const limitText = (n) =>
  n.send_limit ? `Envio até ${fmtDay(n.send_limit)}`
    : n.pay_limit ? `Pagto até ${fmtDay(n.pay_limit)}` : '';

/** Linha de apoio embaixo do nome da nota. */
export function noteSubtitle(n) {
  const done = n.tasks.filter((t) => t.done).length;
  const progress = n.tasks.length ? `${done}/${n.tasks.length} itens concluídos` : '';
  if (isRescission(n)) return [n.company, progress, limitText(n)].filter(Boolean).join(' · ');
  return [
    isAdmission(n) && n.company,
    progress,
    isAdmission(n) ? (n.admission_date && fmtDay(n.admission_date)) : fmtDate(n.updated_at),
  ].filter(Boolean).join(' · ');
}

/** term já deve estar em minúsculas. Sem termo, nem monta o texto de busca. */
export function noteMatches(n, term) {
  if (!term) return true;
  const type = RESCISSION_TYPES.find((t) => t.value === n.rescission_type)?.label ?? '';
  return `${n.title} ${n.body} ${n.employee_name} ${n.company} ${type} ${n.event_vt} ${n.event_vr} ${n.tasks.map((t) => t.text).join(' ')}`
    .toLowerCase().includes(term);
}

// ---------- Filtros da janelinha ----------
/** Todas as datas da nota (para filtrar por um dia). */
export const noteDates = (n) =>
  [n.admission_date, n.last_day, n.pay_limit, n.send_limit, n.preview_date].filter(Boolean);

/** Data usada para ordenar "por data". */
export const noteSortDate = (n) =>
  isAdmission(n) ? n.admission_date : isRescission(n) ? (n.send_limit || n.pay_limit || n.last_day) : null;

const compareDates = (a, b) => (a && b ? a.localeCompare(b) : a ? -1 : b ? 1 : 0);

/** filters: { type: 'all'|'admissao'|'rescisao', term, date: 'AAAA-MM-DD', sort: 'recent'|'date' } */
export function filterNotes(notes, { type = 'all', term = '', date = '', sort = 'recent' } = {}) {
  const t = term.trim().toLowerCase();
  const list = notes.filter((n) =>
    (type === 'all' || n.kind === type)
    && noteMatches(n, t)
    && (!date || noteDates(n).includes(date)));
  return sort === 'date' ? list.sort((a, b) => compareDates(noteSortDate(a), noteSortDate(b))) : list;
}

// ---------- Avisos ----------
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
