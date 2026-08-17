import { describe, expect, it } from 'vitest';
import { formatPriceEUR, formatPlanInterval, publicPlans } from './plans.js';

describe('formatPriceEUR', () => {
  it('formata 1900 cêntimos como euros em pt-PT', () => {
    const formatted = formatPriceEUR(1900);
    // pt-PT usa "19,00 €" (currency after number, NBSP) ou "€19,00" — aceitamos ambos.
    expect(['19,00\u00a0€', '€19,00']).toContain(formatted);
  });

  it('formata 4900 cêntimos', () => {
    const formatted = formatPriceEUR(4900);
    expect(['49,00\u00a0€', '€49,00']).toContain(formatted);
  });

  it('formata 0 cêntimos como 0,00', () => {
    const formatted = formatPriceEUR(0);
    expect(formatted).toContain('0,00');
  });
});

describe('formatPlanInterval', () => {
  it('devolve "por mês" para monthly', () => {
    expect(formatPlanInterval('monthly')).toBe('por mês');
  });

  it('devolve "por ano" para yearly', () => {
    expect(formatPlanInterval('yearly')).toBe('por ano');
  });
});

describe('publicPlans', () => {
  it('lista pelo menos 3 planos públicos', () => {
    expect(publicPlans.length).toBeGreaterThanOrEqual(3);
  });

  it('só inclui planos com isPublic === true', () => {
    expect(publicPlans.every((p) => p.isPublic)).toBe(true);
  });
});
