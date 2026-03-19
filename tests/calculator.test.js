import { describe, it, expect } from 'vitest';
import {
  parcelaPrice,
  calcularIOF,
  calcularCET,
  equivalenciaIsentoCDB,
  rendimentoPreFixado,
  rendimentoPosFixado,
  taxaMensalParaAnual,
  calcularIR,
  sobrasDiscretas,
  custoComSobras,
  construirTrajetoria,
  construirCenarios,
} from '../src/lib/calculator.js';

// IR bracket table used across tests
const tabelaIR = [
  { ate_dias: 180, aliquota: 22.5 },
  { ate_dias: 360, aliquota: 20.0 },
  { ate_dias: 720, aliquota: 17.5 },
  { ate_dias: 999999, aliquota: 15.0 },
];

// ─── parcelaPrice ───────────────────────────────────────────────────

describe('parcelaPrice', () => {
  it('PMT(10000, 0.01, 12) should be approximately 888.49', () => {
    const result = parcelaPrice(10000, 0.01, 12);
    expect(result).toBeCloseTo(888.49, 1);
  });

  it('should return pv/n when taxa=0', () => {
    const result = parcelaPrice(12000, 0, 12);
    expect(result).toBe(1000);
  });

  it('should return pv*(1+taxa) when n=1', () => {
    const result = parcelaPrice(10000, 0.05, 1);
    expect(result).toBeCloseTo(10000 * 1.05, 2);
  });
});

// ─── calcularIOF ────────────────────────────────────────────────────

describe('calcularIOF', () => {
  it('IOF(200000, 24) should be approximately 6746', () => {
    const result = calcularIOF(200000, 24);
    expect(Math.abs(result - 6746)).toBeLessThan(1);
  });

  it('should cap days at 365 for long-term loans (>12 months)', () => {
    // 13 months = 390 days > 365 cap
    const iof13 = calcularIOF(100000, 13);
    // 24 months = 720 days > 365 cap
    const iof24 = calcularIOF(100000, 24);
    // Both should use 365 days for the daily component
    expect(iof13).toBe(iof24);
    // Verify the calculation: 0.0038 * 100000 + 0.000082 * 100000 * 365
    const expected = 100000 * 0.0038 + 100000 * 0.000082 * 365;
    expect(iof24).toBeCloseTo(expected, 2);
  });
});

// ─── calcularCET ────────────────────────────────────────────────────

describe('calcularCET', () => {
  it('full case: 200k/24x/1.49% should yield CET mensal ~0.0178', () => {
    const iof = calcularIOF(200000, 24);
    const parc = parcelaPrice(200000 + iof, 0.0149, 24);
    const cet = calcularCET(200000, parc, 24);
    expect(Math.abs(cet.mensal - 0.0178)).toBeLessThan(0.001);
  });

  it('without IOF, CET should equal nominal rate', () => {
    const taxa = 0.02;
    const pv = 100000;
    const n = 12;
    const parc = parcelaPrice(pv, taxa, n);
    const cet = calcularCET(pv, parc, n);
    expect(Math.abs(cet.mensal - taxa)).toBeLessThan(0.0001);
  });
});

// ─── equivalenciaIsentoCDB ──────────────────────────────────────────

describe('equivalenciaIsentoCDB', () => {
  it('85% CDI isento / (1-0.15) should be approximately 100', () => {
    const result = equivalenciaIsentoCDB(85, 0.15);
    expect(Math.abs(result - 100)).toBeLessThan(0.1);
  });

  it('90% CDI isento / (1-0.15) should be approximately 105.88', () => {
    const result = equivalenciaIsentoCDB(90, 0.15);
    expect(Math.abs(result - 105.88)).toBeLessThan(0.1);
  });
});

// ─── rendimentoPreFixado ────────────────────────────────────────────

describe('rendimentoPreFixado', () => {
  it('100k at 13.25% for 504 DU should yield bruto ~28255.63', () => {
    const result = rendimentoPreFixado(100000, 0.1325, 504);
    expect(Math.abs(result.bruto - 28255.63)).toBeLessThan(1);
  });

  it('short term (63 DU) should compound correctly', () => {
    const result = rendimentoPreFixado(100000, 0.10, 63);
    const expectedFator = Math.pow(1.10, 63 / 252);
    const expectedBruto = 100000 * (expectedFator - 1);
    expect(result.bruto).toBeCloseTo(expectedBruto, 2);
    expect(result.fator).toBeCloseTo(expectedFator, 6);
  });
});

// ─── rendimentoPosFixado ────────────────────────────────────────────

describe('rendimentoPosFixado', () => {
  it('constant CDI across all quarters', () => {
    const cdi = 0.1325;
    const trimestres = [cdi, cdi, cdi, cdi]; // 4 quarters = 1 year
    const result = rendimentoPosFixado(100000, trimestres, 0);
    // Expected: (1+0.1325)^(63/252) compounded 4 times = (1.1325)^(252/252) = 1.1325
    const expectedFator = Math.pow(1 + cdi, (63 * 4) / 252);
    expect(result.fator).toBeCloseTo(expectedFator, 6);
    expect(result.bruto).toBeCloseTo(100000 * (expectedFator - 1), 2);
  });

  it('decreasing CDI simulating rate cuts', () => {
    const trimestres = [0.1325, 0.1225, 0.1125, 0.1025];
    const result = rendimentoPosFixado(100000, trimestres, 0);
    let expectedFator = 1;
    for (const cdi of trimestres) {
      expectedFator *= Math.pow(1 + cdi, 63 / 252);
    }
    expect(result.fator).toBeCloseTo(expectedFator, 6);
    expect(result.bruto).toBeCloseTo(100000 * (expectedFator - 1), 2);
    // Decreasing rates should yield less than constant at highest rate
    const constantHigh = rendimentoPosFixado(100000, [0.1325, 0.1325, 0.1325, 0.1325], 0);
    expect(result.bruto).toBeLessThan(constantHigh.bruto);
  });
});

// ─── taxaMensalParaAnual ────────────────────────────────────────────

describe('taxaMensalParaAnual', () => {
  it('0.0149 monthly should be approximately 0.1942 annual', () => {
    const result = taxaMensalParaAnual(0.0149);
    expect(Math.abs(result - 0.1942)).toBeLessThan(0.001);
  });

  it('0 monthly should be 0 annual', () => {
    const result = taxaMensalParaAnual(0);
    expect(result).toBe(0);
  });
});

// ─── calcularIR ─────────────────────────────────────────────────────

describe('calcularIR', () => {
  it('180 days should apply 22.5% rate', () => {
    const result = calcularIR(10000, 180, tabelaIR);
    expect(result.aliquota).toBe(22.5);
    expect(result.ir).toBe(2250);
    expect(result.liquido).toBe(7750);
  });

  it('360 days should apply 20.0% rate', () => {
    const result = calcularIR(10000, 360, tabelaIR);
    expect(result.aliquota).toBe(20.0);
    expect(result.ir).toBe(2000);
    expect(result.liquido).toBe(8000);
  });

  it('720 days should apply 17.5% rate', () => {
    const result = calcularIR(10000, 720, tabelaIR);
    expect(result.aliquota).toBe(17.5);
    expect(result.ir).toBe(1750);
    expect(result.liquido).toBe(8250);
  });

  it('721+ days should apply 15.0% rate', () => {
    const result = calcularIR(10000, 721, tabelaIR);
    expect(result.aliquota).toBe(15.0);
    expect(result.ir).toBe(1500);
    expect(result.liquido).toBe(8500);
  });
});

// ─── sobrasDiscretas ────────────────────────────────────────────────

describe('sobrasDiscretas', () => {
  it('1 year with constant CDI', () => {
    const cdi = 0.1325;
    // 1 year = 4 quarters
    const cdiPorExercicio = [[cdi, cdi, cdi, cdi]];
    const sobrasPct = 0.161; // 116.1% CDI extra
    const result = sobrasDiscretas(100000, cdiPorExercicio, sobrasPct);

    // Expected: fator = (1+0.1325)^(63/252) ^ 4 = (1.1325)^1
    let fatorEx = 1;
    for (let i = 0; i < 4; i++) {
      fatorEx *= Math.pow(1 + cdi, 63 / 252);
    }
    const rendCdi = 100000 * (fatorEx - 1);
    const expectedSobras = rendCdi * sobrasPct;

    expect(result.porAno).toHaveLength(1);
    expect(result.porAno[0]).toBeCloseTo(expectedSobras, 2);
    expect(result.total).toBeCloseTo(expectedSobras, 2);
  });

  it('2 years with balance accumulation', () => {
    const cdi = 0.13;
    const cdiPorExercicio = [
      [cdi, cdi, cdi, cdi],
      [cdi, cdi, cdi, cdi],
    ];
    const sobrasPct = 0.161;
    const result = sobrasDiscretas(100000, cdiPorExercicio, sobrasPct);

    expect(result.porAno).toHaveLength(2);
    // Year 2 sobras should be higher because saldo grew after year 1
    expect(result.porAno[1]).toBeGreaterThan(result.porAno[0]);
    expect(result.total).toBeCloseTo(result.porAno[0] + result.porAno[1], 2);
  });
});

// ─── custoComSobras ─────────────────────────────────────────────────

describe('custoComSobras', () => {
  it('should reduce annual rate by devolucao and compute monthly', () => {
    const taxaAnual = 0.1942; // ~19.42%
    const devolucaoPP = 0.015; // 1.5 p.p.
    const result = custoComSobras(taxaAnual, devolucaoPP);

    expect(result.taxaAnualEfetiva).toBeCloseTo(taxaAnual - devolucaoPP, 6);
    const expectedMensal = Math.pow(1 + (taxaAnual - devolucaoPP), 1 / 12) - 1;
    expect(result.taxaMensalEfetiva).toBeCloseTo(expectedMensal, 6);
  });
});

// ─── construirTrajetoria / construirCenarios ────────────────────────

describe('construirTrajetoria', () => {
  it('constant trajectory when all Focus years have same value as current Selic', () => {
    const selicAtual = 15.0;
    const focus = { '2026': 15.0, '2027': 15.0 };
    const trimestres = 8;
    const result = construirTrajetoria(selicAtual, focus, trimestres);

    expect(result).toHaveLength(trimestres);
    for (const val of result) {
      expect(val).toBeCloseTo(0.15, 4);
    }
  });

  it('should return array of correct length', () => {
    const focus = { '2026': 12.25, '2027': 10.50 };
    const result = construirTrajetoria(15.0, focus, 6);
    expect(result).toHaveLength(6);
  });
});

describe('construirCenarios', () => {
  it('acelerado < base < gradual for each quarter', () => {
    const selicAtual = 15.0;
    const focus = { '2026': 12.25, '2027': 10.50, '2028': 10.00 };
    const trimestres = 8;
    const result = construirCenarios(selicAtual, focus, trimestres);

    expect(result.acelerado).toHaveLength(trimestres);
    expect(result.base).toHaveLength(trimestres);
    expect(result.gradual).toHaveLength(trimestres);

    // After the first quarter (where all start from the same selicAtual),
    // acelerado should be <= base <= gradual
    for (let i = 1; i < trimestres; i++) {
      expect(result.acelerado[i]).toBeLessThanOrEqual(result.base[i] + 1e-10);
      expect(result.base[i]).toBeLessThanOrEqual(result.gradual[i] + 1e-10);
    }
  });

  it('correct array length matches requested trimestres', () => {
    const focus = { '2026': 12.25 };
    const result = construirCenarios(15.0, focus, 12);
    expect(result.acelerado).toHaveLength(12);
    expect(result.base).toHaveLength(12);
    expect(result.gradual).toHaveLength(12);
  });
});
