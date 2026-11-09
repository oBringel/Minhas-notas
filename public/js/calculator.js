// Calculadora: contas de apoio do dia a dia do DP (sem INSS/IRRF).
import { money } from './util.js';

const $ = (sel) => document.querySelector(sel);
const num = (sel) => {
  const value = Number.parseFloat($(sel)?.value);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

function calcFerias() {
  const salary = num('#calcFeriasSalary');
  const days = Math.min(Math.max(Number.parseInt($('#calcFeriasDays').value, 10) || 30, 1), 30);
  const result = $('#calcFeriasResult');
  if (!salary) { result.textContent = '—'; return; }
  const base = (salary / 30) * days;
  const terco = base / 3;
  result.innerHTML = `Férias (${days} dias): <b>${money(base)}</b><br>
    1/3 constitucional: <b>${money(terco)}</b><br>
    Total a receber: <b>${money(base + terco)}</b>`;
}

function calc13() {
  const salary = num('#calc13Salary');
  const months = Math.min(Math.max(Number.parseInt($('#calc13Months').value, 10) || 0, 1), 12);
  const result = $('#calc13Result');
  if (!salary) { result.textContent = '—'; return; }
  const value = (salary / 12) * months;
  result.innerHTML = `13º com ${months}/12 avos: <b>${money(value)}</b>`;
}

function calcHorasExtras() {
  const salary = num('#calcHxSalary');
  const monthHours = Math.min(Math.max(Number.parseInt($('#calcHxMonth').value, 10) || 220, 1), 400);
  const percent = Math.max(Number.parseFloat($('#calcHxPercent').value) || 0, 0);
  const qty = Math.max(Number.parseFloat($('#calcHxQty').value) || 0, 0);
  const result = $('#calcHxResult');
  if (!salary) { result.textContent = '—'; return; }
  const hourly = salary / monthHours;
  const extra = hourly * (1 + percent / 100);
  result.innerHTML = `Valor da hora: <b>${money(hourly)}</b><br>
    Hora extra (${percent}%): <b>${money(extra)}</b><br>
    ${qty} hora(s) extra(s): <b>${money(extra * qty)}</b>`;
}

function calcPorcentagem() {
  const value = num('#calcPctValue');
  const rate = Number.parseFloat($('#calcPctRate').value);
  const result = $('#calcPctResult');
  if (!value || !Number.isFinite(rate)) { result.textContent = '—'; return; }
  result.innerHTML = `${rate}% de ${money(value)}: <b>${money((value * rate) / 100)}</b><br>
    Com o acréscimo: <b>${money(value * (1 + rate / 100))}</b><br>
    Com o desconto: <b>${money(value * (1 - rate / 100))}</b>`;
}

export function initCalculator() {
  const pairs = [
    ['#calcFeriasSalary', calcFerias], ['#calcFeriasDays', calcFerias],
    ['#calc13Salary', calc13], ['#calc13Months', calc13],
    ['#calcHxSalary', calcHorasExtras], ['#calcHxMonth', calcHorasExtras],
    ['#calcHxPercent', calcHorasExtras], ['#calcHxQty', calcHorasExtras],
    ['#calcPctValue', calcPorcentagem], ['#calcPctRate', calcPorcentagem],
  ];
  for (const [sel, fn] of pairs) {
    const input = $(sel);
    if (!input) continue;
    input.oninput = fn;
  }
}
