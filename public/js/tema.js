/* =====================================================================
   Rotinas do DP — estilos (as cinco opções do layout) e cabeçalho
   Guarda a escolha no navegador e atualiza a saudação do Início.
   ===================================================================== */

const TEMAS = [
  ['framboesa', 'Framboesa e champagne', 'Fraunces + DM Sans', '#A62D5B', '#F8E1E9', '#FBF5F4'],
  ['lavanda', 'Lavanda e névoa', 'Bricolage + Figtree', '#6B4FB0', '#E9E2F7', '#F6F3FB'],
  ['rosa', 'Rosa antigo', 'Lora + Manrope', '#94485E', '#F1E1E4', '#F8F4F1'],
  ['pessego', 'Pêssego e coral', 'Young Serif + Nunito Sans', '#D4533F', '#FDE3DA', '#FFF6F1'],
  ['ameixa', 'Ameixa elegante', 'DM Serif Display + Outfit', '#5E2A4F', '#EBDAE6', '#F7F2F6'],
];

const raiz = document.documentElement;
const painel = document.querySelector('#sp');

function temaSalvo() {
  try { return localStorage.getItem('pp-tema') || 'framboesa'; } catch { return 'framboesa'; }
}

function escuroSalvo() {
  try {
    const v = localStorage.getItem('pp-tema-escuro');
    if (v === null) return window.matchMedia('(prefers-color-scheme: dark)').matches;
    return v === '1';
  } catch { return false; }
}

function desenharEstilos() {
  if (!painel) return;
  const atual = raiz.dataset.tema || 'framboesa';
  const escuro = raiz.dataset.theme === 'dark';
  painel.innerHTML = TEMAS.map(t => `
    <button type="button" data-t="${t[0]}" class="${t[0] === atual ? 'on' : ''}">
      <b><i style="background:${t[3]}"></i><i style="background:${t[4]}"></i><i style="background:${t[5]}"></i>${t[1]}</b>
      <span>${t[2]}</span>
    </button>`).join('')
    + `<button type="button" data-escuro="1" class="${escuro ? 'on' : ''}">
         <b>Modo escuro</b><span>${escuro ? 'Ligado' : 'Desligado'}</span>
       </button>`;
}

function aplicarTema(nome) {
  raiz.dataset.tema = nome;
  try { localStorage.setItem('pp-tema', nome); } catch {}
  desenharEstilos();
}

function alternarEscuro() {
  const escuro = raiz.dataset.theme !== 'dark';
  raiz.dataset.theme = escuro ? 'dark' : 'light';
  try { localStorage.setItem('pp-tema-escuro', escuro ? '1' : '0'); } catch {}
  desenharEstilos();
}

function iniciarEstilos() {
  aplicarTema(temaSalvo());
  raiz.dataset.theme = escuroSalvo() ? 'dark' : 'light';
  desenharEstilos();
  painel?.addEventListener('click', (e) => {
    const botao = e.target.closest('button');
    if (!botao) return;
    if (botao.dataset.escuro) alternarEscuro();
    else if (botao.dataset.t) aplicarTema(botao.dataset.t);
  });
  // fecha ao clicar fora
  document.addEventListener('click', (e) => {
    const caixa = document.querySelector('.sty');
    if (caixa && caixa.open && !caixa.contains(e.target)) caixa.open = false;
  });
}

/* ---------- Saudação do Início ---------- */
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado'];

function atualizarCabecalho() {
  const titulo = document.querySelector('#topTitle');
  const sub = document.querySelector('#topSub');
  if (!titulo || !sub) return;

  const h = new Date().getHours();
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  titulo.textContent = `${saudacao}, Lavinia Mendes`;

  const hoje = new Date();
  const data = `${DIAS[hoje.getDay()]}, ${hoje.getDate()} de ${MESES[hoje.getMonth()]}`;

  const num = (id) => document.querySelector(id)?.textContent?.trim() || '0';
  const hojeQtd = num('#kpiHoje');
  const atrasadas = num('#kpiAtrasadas');
  sub.textContent = `${data} · ${hojeQtd} para hoje, ${atrasadas} atrasadas`;
}

function iniciarCabecalho() {
  atualizarCabecalho();
  // mantém a saudação e a data certas com o app aberto (troca de período/meia-noite)
  setInterval(atualizarCabecalho, 60000);
  const alvo = document.querySelector('#kpiStrip');
  if (alvo) new MutationObserver(atualizarCabecalho).observe(alvo, {
    subtree: true, childList: true, characterData: true,
  });
  document.querySelector('#topNewPend')?.addEventListener('click', () => {
    document.querySelector('#togglePendForm')?.click();
    document.querySelector('.pend-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

iniciarEstilos();
iniciarCabecalho();
