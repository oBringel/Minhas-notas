// Florzinhas que surgem quando um item do checklist é concluído

const COLORS = [
  ['#ff8fc0', '#ffe27a'],
  ['#ffb3d4', '#ff9f1c'],
  ['#f472b6', '#fff3b0'],
  ['#ffd1e3', '#e85d9e'],
  ['#ff5fa2', '#ffe9a8'],
  ['#fbcfe8', '#d63384'],
  ['#ffffff', '#ff7eb6'],
];

export function flowerSVG(petal, center) {
  const petals = [0, 72, 144, 216, 288]
    .map((a) => `<ellipse cx="20" cy="9" rx="6.5" ry="9" transform="rotate(${a} 20 20)"/>`)
    .join('');
  return `<svg viewBox="0 0 40 40" aria-hidden="true">
    <g fill="${petal}" stroke="rgba(214,51,108,.25)" stroke-width=".6">${petals}</g>
    <circle cx="20" cy="20" r="5" fill="${center}"/>
  </svg>`;
}

let layer;
function getLayer() {
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'flower-layer';
    document.body.append(layer);
  }
  return layer;
}

const rand = (min, max) => Math.random() * (max - min) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function makeFlower(x, y, size) {
  const [petal, center] = pick(COLORS);
  const el = document.createElement('div');
  el.className = 'flower';
  el.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px`;
  el.innerHTML = flowerSVG(petal, center);
  getLayer().append(el);
  return el;
}

/** Faz uma explosão de flores a partir do elemento (a caixinha marcada). */
export function bloom(origin) {
  const r = origin.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;

  // Quem prefere menos movimento recebe só uma flor que surge e some
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const el = makeFlower(x, y, 34);
    el.style.transform = 'translate(-50%, -50%)';
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, fill: 'forwards' })
      .onfinish = () => el.remove();
    return;
  }

  // Flor grande que desabrocha na caixinha
  const big = makeFlower(x, y, 54);
  big.animate(
    [
      { transform: 'translate(-50%,-50%) scale(0) rotate(-60deg)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.25) rotate(20deg)', opacity: 1, offset: 0.4 },
      { transform: 'translate(-50%,-50%) scale(1) rotate(60deg)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%,-50%) scale(.8) rotate(90deg)', opacity: 0 },
    ],
    { duration: 900, easing: 'ease-out', fill: 'forwards' }
  ).onfinish = () => big.remove();

  // Florzinhas voando para cima e caindo devagar
  const count = 16;
  for (let i = 0; i < count; i++) {
    const size = rand(14, 32);
    const el = makeFlower(x, y, size);
    const dx = rand(-130, 130);
    const rise = rand(-170, -50);
    const fall = rise + rand(70, 140);
    const spin = rand(-260, 260);
    const base = 'translate(-50%,-50%)';
    el.animate(
      [
        { transform: `${base} translate(0,0) scale(.2) rotate(0deg)`, opacity: 0 },
        { transform: `${base} translate(${dx * 0.6}px,${rise}px) scale(1) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.35 },
        { transform: `${base} translate(${dx}px,${fall}px) scale(.9) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: rand(1100, 1800), delay: rand(0, 160), easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }
    ).onfinish = () => el.remove();
  }
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Chuva de flores por toda a tela (usada nas comemorações de meta). */
export function shower(count = 44) {
  if (reducedMotion()) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (let i = 0; i < count; i++) {
    const el = makeFlower(rand(0, w), -50, rand(16, 36));
    const sway = rand(-90, 90);
    const spin = rand(-360, 360);
    el.animate(
      [
        { transform: 'translate(-50%,-50%) translate(0,0) rotate(0deg)' },
        { transform: `translate(-50%,-50%) translate(${sway}px,${h + 100}px) rotate(${spin}deg)` },
      ],
      { duration: rand(2400, 4200), delay: rand(0, 1200), easing: 'ease-in', fill: 'both' }
    ).onfinish = () => el.remove();
  }
}

/** Texto que sobe e some, por exemplo "+1", saindo de um elemento. */
export function floatText(origin, text) {
  const r = origin.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'float-text';
  el.textContent = text;
  el.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top}px`;
  getLayer().append(el);
  const frames = reducedMotion()
    ? [{ opacity: 1 }, { opacity: 0 }]
    : [
        { transform: 'translate(-50%,0)', opacity: 0 },
        { transform: 'translate(-50%,-14px)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%,-46px)', opacity: 0 },
      ];
  el.animate(frames, { duration: 1100, easing: 'ease-out', fill: 'forwards' })
    .onfinish = () => el.remove();
}
