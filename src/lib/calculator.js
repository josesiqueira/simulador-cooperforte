/**
 * Cooperforte Simulator — Calculator Module
 * Pure functions, no side effects, fully testable.
 */

// ─── INVESTMENT FUNCTIONS ────────────────────────────────────────────

/**
 * Rendimento pos-fixado com CDI variavel por trimestre
 * @param {number} capital - valor inicial
 * @param {number[]} cdiTrimestral - CDI anualizado de cada trimestre (ex: [0.149, 0.139, ...])
 * @param {number} spreadAa - spread anual (ex: 0.0015 para CDI+0,15%)
 * @param {number} duPorTrimestre - dias uteis por trimestre (default 63)
 * @returns {{ bruto: number, fator: number }}
 */
export function rendimentoPosFixado(capital, cdiTrimestral, spreadAa, duPorTrimestre = 63) {
  let fator = 1;
  for (const cdi of cdiTrimestral) {
    if (Number.isNaN(cdi)) continue;
    fator *= Math.pow(1 + cdi + spreadAa, duPorTrimestre / 252);
  }
  return { bruto: capital * (fator - 1), fator };
}

/**
 * Rendimento prefixado
 * @param {number} capital
 * @param {number} taxaAa - taxa anual (ex: 0.1325)
 * @param {number} duTotal - dias uteis totais
 * @returns {{ bruto: number, fator: number }}
 */
export function rendimentoPreFixado(capital, taxaAa, duTotal) {
  const fator = Math.pow(1 + taxaAa, duTotal / 252);
  return { bruto: capital * (fator - 1), fator };
}

/**
 * IR regressivo
 * @param {number} bruto - rendimento bruto
 * @param {number} diasCorridos - prazo em dias corridos
 * @param {Array<{ate_dias: number, aliquota: number}>} tabela
 * @returns {{ ir: number, aliquota: number, liquido: number }}
 */
export function calcularIR(bruto, diasCorridos, tabela) {
  if (!Array.isArray(tabela) || tabela.length === 0) {
    return { ir: 0, aliquota: 0, liquido: bruto };
  }
  const faixa = tabela.find(f => diasCorridos <= f.ate_dias) || tabela[tabela.length - 1];
  const aliquota = faixa.aliquota / 100;
  const ir = bruto * aliquota;
  return { ir, aliquota: faixa.aliquota, liquido: bruto - ir };
}

/**
 * Sobras anuais discretas
 * Sobras sao pagas 1x/ano (~abril), proporcionais ao CDI do exercicio.
 * @param {number} capital
 * @param {number[][]} cdiPorExercicio - array de arrays, cada sub-array = trimestres do exercicio
 * @param {number} sobrasPctCdi - ex: 0.161 para 116,1% CDI
 * @param {number} du - DU por trimestre (63)
 * @returns {{ total: number, porAno: number[] }}
 */
export function sobrasDiscretas(capital, cdiPorExercicio, sobrasPctCdi, du = 63) {
  let saldo = capital;
  const porAno = [];
  for (const trimestres of cdiPorExercicio) {
    let fatorEx = 1;
    for (const cdi of trimestres) {
      fatorEx *= Math.pow(1 + cdi, du / 252);
    }
    const rendCdi = saldo * (fatorEx - 1);
    const sobrasAno = rendCdi * sobrasPctCdi;
    porAno.push(sobrasAno);
    saldo *= fatorEx; // saldo cresce para o proximo exercicio
  }
  return { total: porAno.reduce((a, b) => a + b, 0), porAno };
}

/**
 * Equivalencia LCI/LCA vs CDB
 * @param {number} taxaIsenta - ex: 90 (90% CDI)
 * @param {number} aliquotaIR - ex: 0.15
 * @returns {number} CDB equivalente em % CDI
 */
export function equivalenciaIsentoCDB(taxaIsenta, aliquotaIR) {
  if (aliquotaIR >= 1) return Infinity;
  return taxaIsenta / (1 - aliquotaIR);
}

/**
 * Construir trajetoria Selic trimestral a partir dos pontos Focus.
 * Interpola linearmente entre pontos-ancora (fim de cada ano).
 * @param {number} selicAtual - Selic hoje (ex: 15.00)
 * @param {Object} focus - { "2026": 12.25, "2027": 10.50, ... } (selic_fim por ano)
 * @param {number} trimestres - quantos trimestres simular
 * @returns {number[]} Selic anualizada de cada trimestre (em decimal, ex: 0.1225)
 */
export function construirTrajetoria(selicAtual, focus, trimestres) {
  // Build anchor points: quarter index -> selic value
  // Quarter 0 = now (selicAtual)
  // Each year-end corresponds to quarter 4*k from the start of the year
  const anchors = [{ q: 0, selic: selicAtual }];

  const years = Object.keys(focus).map(Number).sort();
  if (years.length === 0) {
    // No focus data: constant Selic
    return Array(trimestres).fill(selicAtual / 100);
  }

  const baseYear = years[0];
  for (const year of years) {
    // End of year = quarter (year - baseYear + 1) * 4, but relative to q=0
    // Approximate: 4 quarters per year from the first anchor year
    const qIndex = (year - baseYear + 1) * 4;
    anchors.push({ q: qIndex, selic: focus[year] });
  }

  // Sort anchors by quarter
  anchors.sort((a, b) => a.q - b.q);

  const result = [];
  for (let q = 0; q < trimestres; q++) {
    // Find surrounding anchors
    let lo = anchors[0];
    let hi = anchors[anchors.length - 1];

    for (let i = 0; i < anchors.length - 1; i++) {
      if (q >= anchors[i].q && q < anchors[i + 1].q) {
        lo = anchors[i];
        hi = anchors[i + 1];
        break;
      }
    }

    let selic;
    if (q >= hi.q) {
      // Beyond last anchor: use last value
      selic = hi.selic;
    } else if (lo.q === hi.q) {
      selic = lo.selic;
    } else {
      // Linear interpolation
      const t = (q - lo.q) / (hi.q - lo.q);
      selic = lo.selic + t * (hi.selic - lo.selic);
    }

    result.push(selic / 100); // Return as decimal
  }

  return result;
}

/**
 * Construir 3 cenarios a partir do Focus
 * @param {number} selicAtual - Selic atual (ex: 15.00)
 * @param {Object} focus - { "2026": 12.25, "2027": 10.50, ... }
 * @param {number} trimestres
 * @returns {{ acelerado: number[], base: number[], gradual: number[] }}
 */
export function construirCenarios(selicAtual, focus, trimestres) {
  const focusAcelerado = {};
  const focusGradual = {};
  for (const [year, selic] of Object.entries(focus)) {
    focusAcelerado[year] = selic - 0.75;
    focusGradual[year] = selic + 0.75;
  }

  return {
    acelerado: construirTrajetoria(selicAtual, focusAcelerado, trimestres),
    base: construirTrajetoria(selicAtual, focus, trimestres),
    gradual: construirTrajetoria(selicAtual, focusGradual, trimestres),
  };
}

// ─── LOAN FUNCTIONS ──────────────────────────────────────────────────

/**
 * Parcela Price (PMT)
 * @param {number} pv - valor do emprestimo
 * @param {number} taxaMensal - taxa mensal decimal (ex: 0.0149)
 * @param {number} n - numero de parcelas
 * @returns {number} valor da parcela
 */
export function parcelaPrice(pv, taxaMensal, n) {
  if (n <= 0) return pv;
  if (taxaMensal === 0) return pv / n;
  return pv * (taxaMensal * Math.pow(1 + taxaMensal, n)) / (Math.pow(1 + taxaMensal, n) - 1);
}

/**
 * IOF sobre emprestimo PF
 * Decreto 12.499/2025:
 * - Fixo (adicional): 0,38% sobre valor total
 * - Diario: 0,0082% por dia, limitado a 365 dias
 * @param {number} pv - valor do emprestimo
 * @param {number} parcelas - numero de parcelas
 * @returns {number} IOF total
 */
export function calcularIOF(pv, parcelas) {
  const IOF_FIXO = 0.0038;
  const IOF_DIARIO = 0.000082;
  const dias = Math.min(Math.max(0, parcelas) * 30, 365);
  return pv * IOF_FIXO + pv * IOF_DIARIO * dias;
}

/**
 * CET — Custo Efetivo Total (Resolucao BCB 3517)
 * Taxa que iguala valor recebido com fluxo de pagamentos.
 * Resolvido por bissecao.
 * @param {number} valorRecebido - PV (o que cai na conta)
 * @param {number} parcela - parcela mensal (calculada sobre PV + IOF)
 * @param {number} n - numero de parcelas
 * @returns {{ mensal: number, anual: number }}
 */
export function calcularCET(valorRecebido, parcela, n) {
  let lo = 0.0001, hi = 0.50;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    let vp = 0;
    for (let k = 1; k <= n; k++) vp += parcela / Math.pow(1 + mid, k);
    if (vp > valorRecebido) lo = mid; else hi = mid;
  }
  const mensal = (lo + hi) / 2;
  const anual = Math.pow(1 + mensal, 12) - 1;
  return { mensal, anual };
}

/**
 * Taxa mensal para anual (capitalizacao composta)
 * @param {number} taxaMensal - taxa mensal decimal (ex: 0.0149)
 * @returns {number} taxa anual decimal
 */
export function taxaMensalParaAnual(taxaMensal) {
  return Math.pow(1 + taxaMensal, 12) - 1;
}

/**
 * Custo efetivo com sobras (devolucao de juros)
 * @param {number} taxaAnual - taxa anual nominal
 * @param {number} devolucaoPP - pontos percentuais devolvidos (ex: 0.015)
 * @returns {{ taxaAnualEfetiva: number, taxaMensalEfetiva: number }}
 */
export function custoComSobras(taxaAnual, devolucaoPP) {
  const efetiva = taxaAnual - devolucaoPP;
  return {
    taxaAnualEfetiva: efetiva,
    taxaMensalEfetiva: Math.pow(1 + efetiva, 1 / 12) - 1,
  };
}
