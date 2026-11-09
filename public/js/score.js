// Pontuação do mês: cartão de desempenho, metas, recompensas e mensagens de comemoração
import { api } from './api.js';
import { flowerSVG, shower } from './flowers.js';
import { esc } from './util.js';

const $ = (sel, root = document) => root.querySelector(sel);

// =====================================================================
//  MENSAGENS: edite os textos abaixo à vontade
// =====================================================================

// Etapa mostrada no cartão, conforme a % da meta
const STAGES = [
  { from: 0,   name: 'Semente',        msg: 'Seu mês está começando. Cada item concluído é uma sementinha plantada!' },
  { from: 30,  name: 'Brotinho',       msg: 'Passou dos 30%! Seu jardim já está brotando.' },
  { from: 50,  name: 'Florzinha',      msg: 'Metade da meta! Você está florescendo.' },
  { from: 75,  name: 'Jardim florido', msg: 'Falta pouquinho! Seu jardim está lindo.' },
  { from: 100, name: 'Buquê completo', msg: 'Meta do mês batida! Você é incrível.' },
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
let editing = null; // null | 'goal' | 'rewards'
let previousPoints = null;
let notify = () => {};
const subscribers = new Set();

export function initScore({ toast }) {
  notify = toast;
}

export const getScoreData = () => data;

/** Avisa quando a pontuação muda (usado pela janelinha flutuante). */
export function subscribeScore(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export const monthName = (key) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
};

const rewardOf = (pct) => String((data.rewards || {})[pct] || '').trim();

function goalFormHTML() {
  return `
    <form class="goal-form" id="goalForm">
      <label for="goalInput">Meta do mês (em pontos)</label>
      <input id="goalInput" type="number" min="1" max="9999" step="1" value="${data.goal}">
      <button type="submit">Salvar</button>
      <button type="button" class="secondary" id="cancelEdit">Cancelar</button>
    </form>`;
}

function rewardsFormHTML() {
  const fields = data.milestones.map((m) => `
    <label class="reward-field"><span>${m}%</span>
      <input type="text" maxlength="80" data-pct="${m}" value="${esc((data.rewards || {})[m] || '')}"
             placeholder="Escreva aqui" aria-label="Recompensa ao chegar em ${m}%"></label>`).join('');
  return `
    <form class="rewards-form" id="rewardsForm">
      <p class="form-title">Recompensa de cada marco</p>
      ${fields}
      <div class="form-actions">
        <button type="submit">Salvar</button>
        <button type="button" class="secondary" id="cancelEdit">Cancelar</button>
      </div>
    </form>`;
}

function renderScore() {
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

  // Lista de recompensas (só as que ela escreveu)
  const filled = data.milestones.filter((m) => rewardOf(m));
  let rewardsBlock = '';
  if (editing !== 'rewards') {
    rewardsBlock = filled.length
      ? `<ul class="reward-list" aria-label="Recompensas">${filled.map((m) => {
          const got = data.reached.includes(m) || percent >= m;
          return `<li class="reward${got ? ' got' : ''}"><b>${m}%</b><span>${esc(rewardOf(m))}</span>${got ? '<em>Conquistada</em>' : ''}</li>`;
        }).join('')}</ul>`
      : '<p class="reward-hint">Defina uma recompensa para cada marco em “Editar recompensas”.</p>';
  }

  let controls;
  if (editing === 'goal') controls = goalFormHTML();
  else if (editing === 'rewards') controls = rewardsFormHTML();
  else controls = `<button type="button" class="secondary small" id="editGoal">Editar meta</button>
                   <button type="button" class="secondary small" id="editRewards">Editar recompensas</button>`;

  root.innerHTML = `
    <div class="score-top">
      <div>
        <h2>Seu desempenho em ${esc(mes)}</h2>
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
    ${rewardsBlock}
    <div class="score-actions">${controls}</div>`;

  bindControls(root);
}

function emit() {
  renderScore();
  subscribers.forEach((fn) => fn(data));
}

function startEditing(mode, focusSelector) {
  editing = mode;
  renderScore();
  const input = $(focusSelector);
  if (input) { input.focus(); input.select?.(); }
}

function bindControls(root) {
  const editGoal = $('#editGoal', root);
  if (editGoal) editGoal.onclick = () => startEditing('goal', '#goalInput');
  const editRewards = $('#editRewards', root);
  if (editRewards) editRewards.onclick = () => startEditing('rewards', '.reward-field input');
  const cancel = $('#cancelEdit', root);
  if (cancel) cancel.onclick = () => { editing = null; renderScore(); };

  const goalForm = $('#goalForm', root);
  if (goalForm) {
    goalForm.onsubmit = async (ev) => {
      ev.preventDefault();
      const value = Number.parseInt($('#goalInput').value, 10);
      if (!(value >= 1 && value <= 9999)) {
        notify('Digite uma meta entre 1 e 9999 pontos.');
        return;
      }
      try {
        const score = await api.setGoal(value);
        editing = null;
        setScore(score);
      } catch (err) { notify(err.message); }
    };
  }

  const rewardsForm = $('#rewardsForm', root);
  if (rewardsForm) {
    rewardsForm.onsubmit = async (ev) => {
      ev.preventDefault();
      const rewards = {};
      rewardsForm.querySelectorAll('input[data-pct]').forEach((input) => {
        rewards[input.dataset.pct] = input.value.trim();
      });
      try {
        const score = await api.setRewards(rewards);
        editing = null;
        setScore(score);
      } catch (err) { notify(err.message); }
    };
  }
}

/**
 * Atualiza com os dados do servidor.
 * Com celebrate, mostra a mensagem do marco novo na janela (doc) onde o clique aconteceu.
 */
export function setScore(score, { celebrate = false, doc = document } = {}) {
  data = score;
  emit();
  if (celebrate && score.newlyReached?.length) {
    showCelebration(score.newlyReached, doc);
  }
}

/** Mexe nos pontos na hora (antes do servidor responder), para a tela reagir rápido. */
export function nudgeScore(delta) {
  if (!data) return;
  data.points = Math.max(0, data.points + delta);
  data.percent = Math.floor((data.points * 100) / data.goal);
  emit();
}

/** Busca a pontuação atual (sem comemorar). */
export function loadScore() {
  return api.getScore().then((score) => setScore(score)).catch(() => {});
}

// ---------- Mensagem de comemoração ----------
function showCelebration(reachedList, doc) {
  doc.querySelector('.celebration')?.remove();
  const pct = Math.max(...reachedList);
  const info = CELEBRATIONS[pct] || {
    emoji: '🌸', title: `Você chegou a ${pct}%!`, text: () => 'Continue assim, está lindo!',
  };
  const mes = monthName(data.month);
  const previousFocus = doc.activeElement;

  // Recompensas dos marcos recém-conquistados (o texto é o que ela digitou)
  const won = reachedList.filter((m) => rewardOf(m));
  const rewardHTML = won.length
    ? `<div class="celebration-reward">
         <small>${won.length > 1 ? 'Suas recompensas' : 'Sua recompensa'}</small>
         ${won.map((m) => `<strong>${won.length > 1 ? `${m}%: ` : ''}${esc(rewardOf(m))}</strong>`).join('')}
       </div>`
    : '';

  const wrap = doc.createElement('div');
  wrap.className = 'celebration';
  wrap.innerHTML = `
    <div class="celebration-card" role="dialog" aria-modal="true" aria-labelledby="celTitle">
      <div class="celebration-emoji" aria-hidden="true">${info.emoji}</div>
      <div class="celebration-pct" aria-hidden="true">${pct}%</div>
      <h3 id="celTitle">${esc(info.title)}</h3>
      <p>${esc(info.text(mes))}</p>
      ${rewardHTML}
      <button type="button">Que bom! 💗</button>
    </div>`;
  doc.body.append(wrap);

  const button = wrap.querySelector('button');
  const close = () => {
    wrap.remove();
    doc.removeEventListener('keydown', onKey);
    previousFocus?.focus?.();
  };
  const onKey = (ev) => {
    if (ev.key === 'Escape') close();
    if (ev.key === 'Tab') { ev.preventDefault(); button.focus(); }
  };
  button.onclick = close;
  wrap.onclick = (ev) => { if (ev.target === wrap) close(); };
  doc.addEventListener('keydown', onKey);
  button.focus();
  shower(doc);
}
