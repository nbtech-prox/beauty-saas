/**
 * Testes do QuotaChecker — verifica enforcement de limites por plano.
 *
 * Estes testes não tocam em Stripe — apenas lógica pura.
 */
import { describe, expect, it } from 'vitest';
import {
  QuotaExceededError,
  checkQuota,
  getQuotaStatuses,
  hasQuotaAvailable,
} from '../src/quotas.js';
import { getPlanByCode } from '../src/plans.js';

describe('checkQuota', () => {
  it('passa quando todos os contadores estão abaixo do limite', () => {
    const def = getPlanByCode('starterMonthly');
    const result = checkQuota(def, {
      maxProfessionals: 2,
      maxServices: 10,
      maxBookingsPerMonth: 100,
      maxLocations: 1,
    });
    expect(result.exceeded).toEqual([]);
    expect(result.statuses.maxProfessionals.exceeded).toBe(false);
    expect(result.statuses.maxProfessionals.remaining).toBe(1);
  });

  it('lança QuotaExceededError quando uma quota é excedida', () => {
    const def = getPlanByCode('starterMonthly');
    expect(() =>
      checkQuota(def, {
        maxProfessionals: 5, // limite: 3
      }),
    ).toThrow(QuotaExceededError);
  });

  it('QuotaExceededError tem detalhes do limite', () => {
    const def = getPlanByCode('starterMonthly');
    try {
      checkQuota(def, { maxProfessionals: 10 });
      expect.fail('deveria ter lançado');
    } catch (err) {
      expect(err).toBeInstanceOf(QuotaExceededError);
      const quotaErr = err as QuotaExceededError;
      expect(quotaErr.key).toBe('maxProfessionals');
      expect(quotaErr.limit).toBe(3);
      expect(quotaErr.used).toBe(10);
      expect(quotaErr.httpStatus).toBe(402);
    }
  });

  it('recolhe múltiplas quotas excedidas no status', () => {
    const def = getPlanByCode('starterMonthly');
    try {
      checkQuota(def, {
        maxProfessionals: 99,
        maxServices: 99,
      });
      expect.fail('deveria ter lançado');
    } catch (err) {
      // QuotaExceededError é lançado na primeira detectada,
      // mas getQuotaStatuses dá visibilidade completa.
      const def2 = getPlanByCode('starterMonthly');
      const statuses = getQuotaStatuses(def2, {
        maxProfessionals: 99,
        maxServices: 99,
      });
      expect(statuses.maxProfessionals.exceeded).toBe(true);
      expect(statuses.maxServices.exceeded).toBe(true);
    }
  });

  it('defaults para 0 quando usage omisso', () => {
    const def = getPlanByCode('proMonthly');
    const result = checkQuota(def);
    expect(result.statuses.maxProfessionals.used).toBe(0);
    expect(result.statuses.maxProfessionals.percentUsed).toBe(0);
  });

  it('calcula percentUsed correctamente', () => {
    const def = getPlanByCode('proMonthly'); // maxProfessionals=10
    const result = checkQuota(def, { maxProfessionals: 5 });
    expect(result.statuses.maxProfessionals.percentUsed).toBe(50);
  });
});

describe('hasQuotaAvailable', () => {
  it('devolve true quando abaixo do limite', () => {
    const def = getPlanByCode('starterMonthly');
    expect(hasQuotaAvailable(def, 'maxProfessionals', 2)).toBe(true);
  });

  it('devolve false quando acima do limite', () => {
    const def = getPlanByCode('starterMonthly');
    expect(hasQuotaAvailable(def, 'maxProfessionals', 4)).toBe(false);
  });

  it('devolve true quando exactamente no limite', () => {
    const def = getPlanByCode('starterMonthly');
    expect(hasQuotaAvailable(def, 'maxProfessionals', 3)).toBe(true);
  });
});

describe('getQuotaStatuses', () => {
  it('devolve statuses sem lançar', () => {
    const def = getPlanByCode('enterpriseMonthly');
    const statuses = getQuotaStatuses(def, {
      maxProfessionals: 9999,
    });
    expect(statuses.maxProfessionals.exceeded).toBe(true);
    expect(statuses.maxProfessionals.percentUsed).toBeGreaterThan(100);
  });
});