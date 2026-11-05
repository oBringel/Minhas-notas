// Dados compartilhados: a página e a janelinha flutuante usam as mesmas notas,
// então tudo que muda em uma aparece na outra.
import { api } from './api.js';
import { bloom, floatEmoji, floatText } from './flowers.js';
import { loadScore, nudgeScore, setScore } from './score.js';
import { fmtDateTime, happyFace, isAdmission, isRescission } from './util.js';

export const state = { notes: [], term: '' };
export const findNote = (id) => state.notes.find((n) => n.id === id);

// ---------- Avisos entre telas ----------
// 'list'  : só títulos/textos da lista mudaram
// 'note'  : uma nota mudou por dentro (itens, benefícios...). meta = { id, source }
// 'notes' : a lista de notas mudou (criou, apagou, salvou e reordenou)
const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function notify(kind = 'notes', meta = {}) {
  for (const fn of [...listeners]) fn(kind, meta);
}

// ---------- Carregar ----------
export async function loadAll(boot) {
  let notes;
  let score;
  if (boot && Array.isArray(boot.notes)) ({ notes, score } = boot); // já veio no HTML
  else [notes, score] = await Promise.all([api.listNotes(), api.getScore()]);
  state.notes = notes;
  if (score) setScore(score);
  notify('notes');
}

export async function createNote(kind, extra = {}) {
  const n = await api.createNote({ kind, ...extra });
  state.notes.unshift(n);
  state.term = '';
  notify('notes');
  return n;
}

export async function removeNote(n) {
  clearPending(n.id);
  await api.deleteNote(n.id);
  state.notes = state.notes.filter((x) => x !== n);
  loadScore();
  notify('notes');
}

// ---------- Salvamento ----------
export function savePayload(n) {
  if (isAdmission(n)) {
    return {
      employee_name: n.employee_name, company: n.company, admission_date: n.admission_date || null,
      body: n.body, event_vt: n.event_vt, event_vr: n.event_vr,
    };
  }
  if (isRescission(n)) {
    return {
      employee_name: n.employee_name, company: n.company,
      last_day: n.last_day || null, pay_limit: n.pay_limit || null, send_limit: n.send_limit || null,
      has_preview: Boolean(n.has_preview), preview_date: n.preview_date || null,
    };
  }
  return { title: n.title, body: n.body };
}

const pending = new Map(); // id -> { win, timer, n }

function clearPending(id) {
  const p = pending.get(id);
  if (!p) return;
  try { p.win.clearTimeout(p.timer); } catch { /* janela já fechou */ }
  pending.delete(id);
}

/** Salva sozinho meio segundo depois da última digitação. */
export function scheduleSave(n, { win = window, onStatus = () => {}, onError = () => {} } = {}) {
  onStatus('Salvando...');
  clearPending(n.id);
  const timer = win.setTimeout(async () => {
    pending.delete(n.id);
    try {
      const res = await api.updateNote(n.id, savePayload(n));
      n.updated_at = res.updated_at;
      onStatus(`Atualizada em ${fmtDateTime(n.updated_at)}`);
      notify('list');
    } catch (err) {
      onStatus('Não foi possível salvar.');
      onError(err);
    }
  }, 500);
  pending.set(n.id, { win, timer, n });
}

/** Envia na hora o que ainda estava esperando (usado ao fechar a janelinha ou a página). */
export function flushPending() {
  const jobs = [...pending.values()];
  pending.clear();
  return Promise.all(jobs.map(({ win, timer, n }) => {
    try { win.clearTimeout(timer); } catch { /* janela já fechou */ }
    return api.updateNote(n.id, savePayload(n)).catch(() => {});
  }));
}

/** Botão "Salvar": grava agora e sobe a nota para o topo da lista. */
export async function saveNow(n) {
  clearPending(n.id);
  const res = await api.updateNote(n.id, savePayload(n));
  n.updated_at = res.updated_at;
  if (res.title) n.title = res.title;
  state.notes = [n, ...state.notes.filter((x) => x !== n)];
  notify('notes');
  return n;
}

// ---------- Checklist ----------
export async function addTask(n, text, source) {
  const task = await api.addTask(n.id, text);
  n.tasks.push(task);
  notify('note', { id: n.id, source });
  return task;
}

export async function removeTask(n, t, source) {
  await api.deleteTask(t.id);
  n.tasks = n.tasks.filter((x) => x.id !== t.id);
  loadScore();
  notify('note', { id: n.id, source });
}

/**
 * Marca ou desmarca um item. A parte de cima roda na hora (florzinhas, ponto, barras);
 * o servidor confirma em seguida. Se der erro, desfaz e avisa.
 */
export async function toggleTask(n, t, done, origin, source) {
  const doc = origin.ownerDocument;
  t.done = done;
  if (done) { bloom(origin); floatText(origin, '+1'); } // 🌸 florzinhas e ponto!
  if (done && t.key === 'r:final') floatEmoji(origin, happyFace(t.id)); // 😄 último item da rescisão
  nudgeScore(done ? 1 : -1);
  notify('note', { id: n.id, source });
  try {
    const res = await api.setTaskDone(t.id, done);
    setScore(res.score, { celebrate: true, doc });
  } catch (err) {
    t.done = !done;
    nudgeScore(done ? -1 : 1);
    notify('note', { id: n.id }); // sem "source": todas as telas se redesenham
    throw err;
  }
}

export async function setBenefit(n, key, enabled, source) {
  const field = key === 'vt' ? 'has_vt' : 'has_vr';
  const eventField = key === 'vt' ? 'event_vt' : 'event_vr';
  const previous = n[field];
  n[field] = enabled;
  try {
    n.tasks = await api.setBenefit(n.id, key, enabled);
  } catch (err) {
    n[field] = previous;
    throw err;
  }
  if (!enabled) { n[eventField] = ''; loadScore(); }
  notify('note', { id: n.id, source });
}

/** Troca o tipo da rescisão: o checklist muda (itens que continuam mantêm o que foi marcado). */
export async function setRescissionType(n, type, source) {
  n.tasks = await api.setRescissionType(n.id, type);
  n.rescission_type = type;
  loadScore();
  notify('note', { id: n.id, source });
}
