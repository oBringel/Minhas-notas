// Pontuação do mês: cartão de desempenho, metas e mensagens de comemoração
import { api } from './api.js';
import { flowerSVG, shower } from './flowers.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (text) =>
  String(text).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// =====================================================================
//  MENSAGENS: edite os textos abaixo à vontade
// =====================================================================

// Etapa mostrada no cartão, conforme a % da meta
const STAGES = [
  { from: 0,   emoji: '🌱', name: 'Semente',        msg: 'Seu mês está começando. Cada item concluído é uma sementinha plantada!' },
  { from: 30,  emoji: '🌷', name: 'Brotinho',       msg: 'Passou dos 30%! Seu jardim já está brotando.' },
  { from: 50,  emoji: '🌸', name: 'Florzinha',      msg: 'Metade da meta! Você está florescendo.' },
  { from: 75,  emoji: '🌺', name: 'Jardim florido', msg: 'Falta pouquinho! Seu jardim está lindo.' },
  { from: 100, emoji: '💐', name: 'Buquê completo', msg: 'Meta do mês batida! Você é incrível.' },
];

// Mensagem que aparece uma vez, quando ela bate cada marco (30%, 50%, 75%, 100%)
const CELEBRATIONS = {
  30:  { emoji: '🌷', title: 'Primeiro passo dado!', text: (mes) => `Você já chegou a 30% da meta de ${mes}. O começo é sempre a parte mais difícil, e você tirou de letra!` },
  50:  { emoji: '🌸', title: 'Metade do caminho!',   text: (mes) => `50% da meta de ${mes} conquistados. Que ritmo lindo, continue assim!` },
  75:  { emoji: '🌺', title: 'Quase lá!',            text: (mes) => `Você está com 75% da meta de ${mes}. Seu jardim está cada vez mais florido!` },
  100: { emoji: '💐', title: 'Meta batida!',         text: (mes) => `Você bateu 100% da meta de ${mes}! Parabéns, você merece comemorar. 💗` },
};

// =====================================================================

let data = null;
let editing = false;
let previousPoints = null;
let notify = () => {};

export function initScore({ toast }) {
  notify = toast;
}

const monthName = (key) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
};

export function renderScore() {
  const root = $('#score');
  if (!root) return;
  if (!data) { root.hidden = true; return; }
  root.hidden = false;

  const mes = monthName(data.month);
  const percent = data.percent;
  const stage = [...STAGES].reverse().find((s) => percent >= s.from);
  const bump = previousPoints !== null && previousPoints !== data.points;
  previousPoints = data.points;

  const marks = data.milestones.map((m) => {
    const on = data.reached.includes(m) || percent >= m;
    return `<span class="mark${on ? ' on' : ''}" style="left:${m}%">
      <i>${flowerSVG('#ff8fc0', '#ffe27a')}</i><small>${m}%</small></span>`;
  }).join('');

  const goalControl = editing
    ? `<form class="goal-form" id="goalForm">
         <label for="goalInput">Meta do mês (em pontos)</label>
         <input id="goalInput" type="number" min="1" max="9999" step="1" value="${data.goal}">
         <button type="submit">Salvar</button>
         <button type="button" class="secondary" id="cancelGoal">Cancelar</button>
       </form>`
    : '<button type="button" class="secondary small" id="editGoal">Editar meta</button>';

  root.innerHTML = `
    <div class="score-top">
      <div>
        <h2>Seu desempenho em ${esc(mes)} ${stage.emoji}</h2>
        <p class="score-stage">${esc(stage.name)} · ${percent}% da meta</p>
      </div>
      <div class="score-points">
        <strong class="${bump ? 'pop' : ''}">${data.points}</strong>
        <span>de ${data.goal} pontos</span>
      </div>
    </div>
    <div class="score-track">
      <div class="score-bar" role="progressbar" aria-label="Progresso da meta do mês"
           aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, percent)}">
        <div class="score-fill" style="width:${Math.min(100, percent)}%"></div>
      </div>
      ${marks}
    </div>
    <p class="score-msg">${esc(stage.msg)}</p>
    <div class="score-actions">${goalControl}</div>`;

  // Editar meta
  const editBtn = $('#editGoal', root);
  if (editBtn) {
    editBtn.onclick = () => {
      editing = true;
      renderScore();
      const input = $('#goalInput');
      if (input) { input.focus(); input.select(); }
    };
  }
  const form = $('#goalForm', root);
  if (form) {
    $('#cancelGoal', root).onclick = () => { editing = false; renderScore(); };
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const value = Number.parseInt($('#goalInput').value, 10);
      if (!(value >= 1 && value <= 9999)) {
        notify('Digite uma meta entre 1 e 9999 pontos.');
        return;
      }
      try {
        const score = await api.setGoal(value);
        editing = false;
        setScore(score);
      } catch (err) { notify(err.message); }
    };
  }
}

/** Atualiza o cartão com os dados do servidor. Com celebrate, mostra a mensagem do marco novo. */
export function setScore(score, { celebrate = false } = {}) {
  data = score;
  renderScore();
  if (celebrate && score.newlyReached?.length) {
    showCelebration(Math.max(...score.newlyReached));
  }
}

/** Mexe nos pontos na hora (antes do servidor responder), para a tela reagir rápido. */
export function nudgeScore(delta) {
  if (!data) return;
  data.points = Math.max(0, data.points + delta);
  data.percent = Math.floor((data.points * 100) / data.goal);
  renderScore();
}

/** Busca a pontuação atual (sem comemorar). */
export function loadScore() {
  return api.getScore().then((score) => setScore(score)).catch(() => {});
}

// ---------- Mensagem de comemoração ----------
function showCelebration(pct) {
  $('.celebration')?.remove();
  const info = CELEBRATIONS[pct] || {
    emoji: '🌸', title: `Você chegou a ${pct}%!`, text: () => 'Continue assim, está lindo!',
  };
  const mes = monthName(data.month);
  const previousFocus = document.activeElement;

  const wrap = document.createElement('div');
  wrap.className = 'celebration';
  wrap.innerHTML = `
    <div class="celebration-card" role="dialog" aria-modal="true" aria-labelledby="celTitle">
      <div class="celebration-emoji" aria-hidden="true">${info.emoji}</div>
      <div class="celebration-pct" aria-hidden="true">${pct}%</div>
      <h3 id="celTitle">${esc(info.title)}</h3>
      <p>${esc(info.text(mes))}</p>
      <button type="button">Que bom! 💗</button>
    </div>`;
  document.body.append(wrap);

  const button = $('button', wrap);
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    previousFocus?.focus?.();
  };
  const onKey = (ev) => {
    if (ev.key === 'Escape') close();
    if (ev.key === 'Tab') { ev.preventDefault(); button.focus(); }
  };
  button.onclick = close;
  wrap.onclick = (ev) => { if (ev.target === wrap) close(); };
  document.addEventListener('keydown', onKey);
  button.focus();
  shower();
}
