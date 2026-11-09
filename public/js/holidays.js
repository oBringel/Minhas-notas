// Feriados e datas brasileiras — calculados aqui, sem depender de internet.
//
// Base legal: Lei 662/1949 e Lei 6.802/1980 (feriados nacionais fixos),
// Lei 9.093/1995 (datas magnas estaduais e municipais), Lei 14.759/2023
// (Dia Nacional de Zumbi e da Consciência Negra) e a Portaria MGI que
// publica os pontos facultativos federais de cada ano.
//
// O feriados.com.br NÃO oferece API pública (o site é só páginas HTML, sem
// documentação nem autorização de uso automático). Por isso nada aqui faz
// requisição externa: os feriados nacionais e os pontos facultativos são
// calculados, os estaduais vêm da tabela abaixo e os municipais/personalizados
// são cadastrados pela usuária e guardados na tabela `custom_dates` do banco.

/** Tipos de data, na ordem em que aparecem na legenda. */
export const HOLIDAY_TYPES = [
  { key: 'nacional', label: 'Nacional' },
  { key: 'estadual', label: 'Estadual' },
  { key: 'municipal', label: 'Municipal' },
  { key: 'facultativo', label: 'Ponto facultativo' },
  { key: 'comemorativo', label: 'Comemorativa' },
  { key: 'personalizada', label: 'Personalizada' },
];

export const TYPE_LABEL = Object.fromEntries(HOLIDAY_TYPES.map((t) => [t.key, t.label]));

/** Unidades da federação, para a configuração de localidade. */
export const UFS = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AM', 'Amazonas'], ['AP', 'Amapá'], ['BA', 'Bahia'],
  ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'],
  ['MA', 'Maranhão'], ['MG', 'Minas Gerais'], ['MS', 'Mato Grosso do Sul'], ['MT', 'Mato Grosso'],
  ['PA', 'Pará'], ['PB', 'Paraíba'], ['PE', 'Pernambuco'], ['PI', 'Piauí'], ['PR', 'Paraná'],
  ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'], ['RO', 'Rondônia'], ['RR', 'Roraima'],
  ['RS', 'Rio Grande do Sul'], ['SC', 'Santa Catarina'], ['SE', 'Sergipe'], ['SP', 'São Paulo'],
  ['TO', 'Tocantins'],
];

// ---------- Datas móveis ----------
/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easter(year) {
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
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const iso = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

function shift(day, days) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Enésimo dia da semana do mês (ex.: 2º domingo de maio). */
function nthWeekday(year, month, weekday, n) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return iso(year, month, 1 + offset + (n - 1) * 7);
}

// ---------- Feriados estaduais (datas magnas e padroeiros estaduais) ----------
// Guardados como 'MM-DD'. Servem de ponto de partida: a usuária pode cadastrar
// ou complementar os feriados da cidade dela em "Datas personalizadas".
const STATE_DATES = {
  AC: [['06-15', 'Aniversário do Estado do Acre']],
  AL: [['06-24', 'São João'], ['06-29', 'São Pedro'], ['09-16', 'Emancipação Política de Alagoas']],
  AM: [['09-05', 'Elevação do Amazonas à categoria de província']],
  AP: [['09-13', 'Criação do Território Federal do Amapá'], ['10-05', 'Criação do Estado do Amapá']],
  BA: [['07-02', 'Independência da Bahia']],
  CE: [['03-19', 'São José'], ['03-25', 'Data Magna do Ceará']],
  DF: [['11-30', 'Dia do Evangélico']],
  ES: [['10-28', 'Dia do Servidor Público do Estado']],
  GO: [['10-24', 'Fundação de Goiânia']],
  MA: [['07-28', 'Adesão do Maranhão à Independência']],
  MG: [['04-21', 'Data Magna de Minas Gerais']],
  MS: [['10-11', 'Criação do Estado de Mato Grosso do Sul']],
  MT: [['11-20', 'Dia da Consciência Negra']],
  PA: [['08-15', 'Adesão do Pará à Independência']],
  PB: [['08-05', 'Fundação do Estado da Paraíba']],
  PE: [['03-06', 'Revolução Pernambucana'], ['06-24', 'São João']],
  PI: [['10-19', 'Dia do Piauí']],
  PR: [['12-19', 'Emancipação Política do Paraná']],
  RJ: [['04-23', 'São Jorge'], ['10-28', 'Dia do Servidor Público']],
  RN: [['10-03', 'Mártires de Cunhaú e Uruaçu']],
  RO: [['01-04', 'Criação do Estado de Rondônia'], ['06-18', 'Dia do Evangélico']],
  RR: [['10-05', 'Criação do Estado de Roraima']],
  RS: [['09-20', 'Revolução Farroupilha']],
  SC: [['08-11', 'Dia de Santa Catarina']],
  SE: [['07-08', 'Emancipação Política de Sergipe']],
  SP: [['07-09', 'Revolução Constitucionalista']],
  TO: [['09-08', 'Nossa Senhora da Natividade'], ['10-05', 'Criação do Estado do Tocantins']],
};

const NATIONAL_FIXED = [
  ['01-01', 'Confraternização Universal'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência do Brasil'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
  ['12-25', 'Natal'],
];

const COMMEMORATIVE_FIXED = [
  ['03-08', 'Dia Internacional da Mulher'],
  ['04-22', 'Descobrimento do Brasil'],
  ['05-13', 'Abolição da Escravatura'],
  ['06-12', 'Dia dos Namorados'],
  ['09-21', 'Dia da Árvore'],
  ['10-15', 'Dia do Professor'],
  ['11-19', 'Dia da Bandeira'],
  ['12-08', 'Dia de Nossa Senhora da Conceição'],
];

/** Todos os feriados/datas de um ano, já ordenados e sem repetição. */
export function holidaysFor(year, { uf = '', custom = [] } = {}) {
  const out = [];
  const add = (day, name, type) => { if (day && name) out.push({ day, name, type }); };

  for (const [md, name] of NATIONAL_FIXED) add(`${year}-${md}`, name, 'nacional');

  const pascoa = easter(year);
  add(shift(pascoa, -2), 'Sexta-feira da Paixão', 'nacional');
  add(shift(pascoa, -48), 'Carnaval', 'facultativo');
  add(shift(pascoa, -47), 'Carnaval', 'facultativo');
  add(shift(pascoa, -46), 'Quarta-feira de Cinzas', 'facultativo');
  add(shift(pascoa, 60), 'Corpus Christi', 'facultativo');
  add(`${year}-10-28`, 'Dia do Servidor Público', 'facultativo');
  add(`${year}-12-24`, 'Véspera de Natal', 'facultativo');
  add(`${year}-12-31`, 'Véspera de Ano Novo', 'facultativo');

  for (const [md, name] of COMMEMORATIVE_FIXED) add(`${year}-${md}`, name, 'comemorativo');
  add(nthWeekday(year, 5, 0, 2), 'Dia das Mães', 'comemorativo');
  add(nthWeekday(year, 8, 0, 2), 'Dia dos Pais', 'comemorativo');

  for (const [md, name] of STATE_DATES[uf] || []) add(`${year}-${md}`, name, 'estadual');

  // Datas cadastradas pela usuária (municipais, personalizadas, etc.)
  for (const item of custom) {
    const kind = item.kind || 'personalizada';
    if (item.yearly) {
      const md = String(item.day).slice(5, 10);
      add(`${year}-${md}`, item.name, kind);
    } else if (String(item.day).slice(0, 4) === String(year)) {
      add(String(item.day).slice(0, 10), item.name, kind);
    }
  }

  // Evita duplicidade (mesmo dia com o mesmo nome), mantendo o tipo mais forte.
  const rank = { nacional: 0, estadual: 1, municipal: 2, facultativo: 3, personalizada: 4, comemorativo: 5 };
  const seen = new Map();
  for (const h of out) {
    const key = `${h.day}|${h.name.toLocaleLowerCase('pt-BR')}`;
    const prev = seen.get(key);
    if (!prev || rank[h.type] < rank[prev.type]) seen.set(key, h);
  }
  return [...seen.values()].sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Agrupa por dia: { '2026-11-02': [{ name, type }, ...] }. */
export function holidaysByDay(year, options) {
  const map = {};
  for (const h of holidaysFor(year, options)) (map[h.day] ||= []).push(h);
  return map;
}

export const typeLabel = (type) => TYPE_LABEL[type] || 'Data';
