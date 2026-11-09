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
// Vale o "Dia limite para enviar a prévia" (a prévia tem que sair até ali). Se ainda não estiver
// preenchido, a conta é feita na hora: limite de pagamento menos 5 dias. É uma data só, e é
// ela que acende 🙂 / 🥶 / 😡 — mudar o pagamento só mexe nas carinhas porque o envio anda junto.
// =====================================================================
/** Limite de pagamento: 10 dias após o último dia trabalhado; caindo no fim de semana, antecipa. */
export const payDeadline = (lastDay) => previousBusinessDay(addDays(lastDay, 10));

/** Prazo de envio: 5 dias antes do limite de pagamento; caindo no fim de semana, antecipa.
 *  Nunca fica antes do último dia trabalhado: não dá para enviar a prévia antes de a pessoa sair. */
export const sendDeadline = (payLimit, lastDay) => {
  const day = previousBusinessDay(addDays(payLimit, -5));
  return validDay(lastDay) && day < lastDay ? lastDay : day;
};

/** Data anterior ao último dia trabalhado não vale (nem pagamento nem envio). */
export const beforeLastDay = (day, lastDay) =>
  validDay(day) && validDay(lastDay) && day < lastDay;

export function rescissionDeadline(n) {
  if (validDay(n.send_limit) && !beforeLastDay(n.send_limit, n.last_day)) return n.send_limit;
  if (!validDay(n.pay_limit) || beforeLastDay(n.pay_limit, n.last_day)) return null;
  return sendDeadline(n.pay_limit, n.last_day);
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
const limitText = (n) => {
  const send = !beforeLastDay(n.send_limit, n.last_day) && n.send_limit;
  const pay = !beforeLastDay(n.pay_limit, n.last_day) && n.pay_limit;
  return send ? `Envio até ${fmtDay(send)}`
    : pay ? `Pagto até ${fmtDay(pay)}` : '';
};

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

// ---------- Feriados nacionais ----------
// A Páscoa é calculada (algoritmo de Meeus/Jones/Butcher) porque Carnaval,
// Sexta-feira da Paixão e Corpus Christi andam com ela todo ano.
export function easterDay(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const dayNumber = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
}

/** Feriados nacionais do ano: { 'AAAA-MM-DD': 'Nome' } */
export function holidaysOf(year) {
  const easter = easterDay(year);
  return {
    [`${year}-01-01`]: 'Confraternização Universal',
    [addDays(easter, -48)]: 'Segunda-feira de Carnaval',
    [addDays(easter, -47)]: 'Carnaval',
    [addDays(easter, -2)]: 'Sexta-feira da Paixão',
    [`${year}-04-21`]: 'Tiradentes',
    [`${year}-05-01`]: 'Dia do Trabalho',
    [addDays(easter, 60)]: 'Corpus Christi',
    [`${year}-09-07`]: 'Independência do Brasil',
    [`${year}-10-12`]: 'Nossa Senhora Aparecida',
    [`${year}-11-02`]: 'Finados',
    [`${year}-11-15`]: 'Proclamação da República',
    [`${year}-11-20`]: 'Dia da Consciência Negra',
    [`${year}-12-25`]: 'Natal',
  };
}

/** 0 = domingo ... 6 = sábado (sem depender do fuso do navegador) */
export const weekdayOf = (day) => weekday(day);

/** 'AAAA-MM-DD' -> 'novembro de 2026' */
export const monthLabel = (year, monthIndex) => {
  const label = new Date(Date.UTC(year, monthIndex, 1))
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export const money = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
