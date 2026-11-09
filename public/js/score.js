// Pontuação do mês — layout compacto, API compatível com store/app.
import { api } from './api.js';
import { flowerSVG, shower } from './flowers.js';
import { esc } from './util.js';

const $ = (sel, root = document) => root.querySelector(sel);

const STAGES = [
  { from: 0,   name: 'Semente',        msg: 'Cada item concluído é uma sementinha plantada.' },
  { from: 30,  name: 'Brotinho',       msg: 'Seu jardim já está brotando.' },
  { from: 50,  name: 'Florzinha',      msg: 'Metade da meta — você está florescendo.' },
  { from: 75,  name: 'Jardim florido', msg: 'Falta pouquinho! Seu jardim está lindo.' },
  { from: 100, name: 'Buquê completo', msg: 'Meta do mês batida! Você é incrível.' },
];
const CELEBRATIONS = {
  25:  { emoji: '🌱', title: 'Primeiro passo dado!', text: (mes) => `Você chegou a 25% da meta de ${mes}. Continue assim!` },
  30:  { emoji: '🌷', title: 'Primeiro passo dado!', text: (mes) => `Você chegou a 30% da meta de ${mes}. Continue assim!` },
  50:  { emoji: '🌸', title: 'Metade do caminho!',   text: (mes) => `50% da meta de ${mes} conquistados. Que ritmo lindo!` },
  75:  { emoji: '🌺', title: 'Quase lá!',            text: (mes) => `75% da meta de ${mes}. Seu jardim está florido!` },
  100: { emoji: '💐', title: 'Meta batida!',         text: (mes) => `Você bateu 100% da meta de ${mes}! Parabéns. 💗` },
};

let data = null;
let editing = null; // null | 'goal' | 'rewards'
let previousPoints = null;
let notify = () => {};
const subscribers = new Set();

export function initScore({ toast } = {}) { notify = typeof toast === 'function' ? toast : () => {}; }
export const getScoreData = () => data;
export function subscribeScore(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }
export const monthName = (key) => {
  if (!key) return new Date().toLocaleDateString('pt-BR', { month: 'long' });
  const [year, month] = String(key).split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
};
const rewardOf = (pct) => String((data?.rewards || {})[pct] || '').trim();
const milestones = () => (Array.isArray(data?.milestones) && data.milestones.length ? data.milestones : [25, 50, 75, 100]);

function goalFormHTML() {
  return `<form class="goal-form" id="goalForm">
    <label for="goalInput">Meta do mês (pontos)</label>
    <input id="goalInput" type="number" min="1" max="9999" step="1" value="${data.goal}">
    <button type="submit" class="small">Salvar</button>
    <button type="button" class="secondary small" id="cancelEdit">Cancelar</button>
  </form>`;
}
function rewardsFormHTML() {
  const fields = milestones().map((m) => `<label class="reward-field"><span>${m}%</span>
    <input type="text" maxlength="80" data-pct="${m}" value="${esc((data.rewards || {})[m] || '')}" placeholder="Recompensa"></label>`).join('');
  return `<form class="rewards-form" id="rewardsForm">
    <p class="form-title">Recompensa de cada marco</p>${fields}
    <div class="form-actions"><button type="submit" class="small">Salvar</button><button type="button" class="secondary small" id="cancelEdit">Cancelar</button></div>
  </form>`;
}

function renderScore() {
  const box = $('#scoreBox');
  if (!box) return;
  if (!data) { box.innerHTML = '<p class="score-loading">Carregando pontuação…</p>'; return; }
  const mes = monthName(data.month);
  const percent = Number(data.percent) || 0;
  const goal = Math.max(1, Number(data.goal) || 1);
  const points = Math.max(0, Number(data.points) || 0);
  const stage = [...STAGES].reverse().find((s) => percent >= s.from) || STAGES[0];
  const bump = previousPoints !== null && previousPoints !== points;
  previousPoints = points;
  const reached = new Set([...(data.reached || []), ...milestones().filter(m => percent >= m)]);

  if (editing === 'goal') { box.innerHTML = goalFormHTML(); return bindControls(box); }
  if (editing === 'rewards') { box.innerHTML = rewardsFormHTML(); return bindControls(box); }

  const marks = milestones().map(m => `<span class="${reached.has(m) ? 'on':''}" title="${m}%">${m}%</span>`).join('');
  const rewardPills = milestones().map(m => {
    const txt = rewardOf(m);
    if (!txt) return `<span class="reward${reached.has(m)?' got':''}"><b>${m}%</b> —</span>`;
    return `<span class="reward${reached.has(m)?' got':''}"><b>${m}%</b> ${esc(txt)}</span>`;
  }).join('');

  box.innerHTML = `
    <div class="score-compact">
      <div class="score-main">
        <div class="score-identity">
          <div class="score-flower" aria-hidden="true">${flowerSVG('#C45D83', '#F8EFDF')}</div>
          <div><h2>Pontuação de ${esc(mes)}</h2><p class="score-stage"><b>${percent}%</b> · ${esc(stage.name)}${percent >= 100 ? ' · meta atingida' : ''}</p></div>
        </div>
        <div class="score-progress">
          <div class="score-bar-compact" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100,percent)}"><div class="score-fill" style="width:${Math.min(100,percent)}%"></div></div>
          <div class="score-marks-inline">${marks}</div>
        </div>
        <div class="score-points"><strong class="${bump ? 'pop':''}">${points}</strong><span>de ${goal} pts</span></div>
      </div>
      <div class="score-actions-row">
        <p class="score-msg">${esc(stage.msg)}</p>
        <div class="score-actions">
          <button type="button" class="secondary small" id="editGoal">Editar meta</button>
          <button type="button" class="secondary small" id="editRewards">Editar recompensas</button>
        </div>
      </div>
      <div class="score-rewards-compact" aria-label="Marcos de recompensa">${rewardPills}</div>
    </div>`;
  bindControls(box);
  if (bump) setTimeout(() => box.querySelector('.score-points strong')?.classList.remove('pop'), 500);
}

function emit() { renderScore(); subscribers.forEach((fn) => { try { fn(data); } catch {} }); }
function startEditing(mode) { editing = mode; renderScore(); (editing === 'goal' ? $('#goalInput') : $('.reward-field input'))?.focus(); }

function bindControls(root) {
  const eg = $('#editGoal', root); if (eg) eg.onclick = () => startEditing('goal');
  const er = $('#editRewards', root); if (er) er.onclick = () => startEditing('rewards');
  const cancel = $('#cancelEdit', root); if (cancel) cancel.onclick = () => { editing = null; renderScore(); };
  const gf = $('#goalForm', root);
  if (gf) gf.onsubmit = async (ev) => {
    ev.preventDefault();
    const value = Number.parseInt($('#goalInput').value, 10);
    if (!(value >= 1 && value <= 9999)) return notify('Digite uma meta entre 1 e 9999 pontos.');
    try { const score = await api.setGoal(value); editing = null; setScore(score); } catch (err) { notify(err.message); }
  };
  const rf = $('#rewardsForm', root);
  if (rf) rf.onsubmit = async (ev) => {
    ev.preventDefault();
    const rewards = {};
    rf.querySelectorAll('input[data-pct]').forEach((input) => { rewards[input.dataset.pct] = input.value.trim(); });
    try { const score = await api.setRewards(rewards); editing = null; setScore(score); } catch (err) { notify(err.message); }
  };
}

export function setScore(score, { celebrate = false, doc = document } = {}) {
  data = score;
  emit();
  if (celebrate && score?.newlyReached?.length) showCelebration(score.newlyReached, doc);
}
export function nudgeScore(delta) {
  if (!data) return;
  data.points = Math.max(0, (Number(data.points) || 0) + (Number(delta) || 0));
  const goal = Math.max(1, Number(data.goal) || 1);
  data.percent = Math.floor((data.points * 100) / goal);
  data.reached = milestones().filter(m => data.percent >= m);
  emit();
}
export function loadScore() {
  return api.getScore().then((score) => setScore(score)).catch((e) => { console.warn('loadScore', e); });
}

function showCelebration(reachedList, doc) {
  try {
    doc.querySelector('.celebration')?.remove();
    const pct = Math.max(...reachedList.map(Number));
    const info = CELEBRATIONS[pct] || { emoji: '🌸', title: `Você chegou a ${pct}%!`, text: () => 'Continue assim!' };
    const mes = monthName(data?.month);
    const previousFocus = doc.activeElement;
    const won = reachedList.filter((m) => rewardOf(m));
    const rewardHTML = won.length ? `<div class="celebration-reward"><small>${won.length>1?'Suas recompensas':'Sua recompensa'}</small>${won.map((m)=>`<strong>${won.length>1?`${m}%: `:''}${esc(rewardOf(m))}</strong>`).join('')}</div>` : '';
    const wrap = doc.createElement('div');
    wrap.className = 'celebration';
    wrap.innerHTML = `<div class="celebration-card" role="dialog" aria-modal="true" aria-labelledby="celTitle">
      <div class="celebration-emoji" aria-hidden="true">${info.emoji}</div>
      <div class="celebration-pct" aria-hidden="true">${pct}%</div>
      <h3 id="celTitle">${esc(info.title)}</h3>
      <p>${esc(info.text(mes))}</p>${rewardHTML}
      <button type="button">Que bom! 💗</button></div>`;
    doc.body.append(wrap);
    const button = wrap.querySelector('button');
    const close = () => { wrap.remove(); doc.removeEventListener('keydown', onKey); previousFocus?.focus?.(); };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); if (ev.key === 'Tab') { ev.preventDefault(); button.focus(); } };
    button.onclick = close; wrap.onclick = (ev) => { if (ev.target === wrap) close(); };
    doc.addEventListener('keydown', onKey); button.focus();
    if (typeof shower === 'function') shower(doc);
  } catch (e) { console.warn('celebration', e); }
}
