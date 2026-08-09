/**
 * Testes do plano registry — fonte de verdade da oferta comercial.
 *
 * Não tocamos em Stripe aqui. Apenas testamos a lógica pura de mapeamento.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  PLAN_DEFINITIONS,
  PlanNotFoundError,
  getPlanByCode,
  getPlanByStripePriceId,
  getStripePriceIdForCode,
  listPublicPlans,
  planDefinitionToContract,
  tryGetPlanByCode,
} from '../src/plans.js';

describe('getPlanByCode', () => {
  it('devolve plano para code canónico', () => {
    const plan = getPlanByCode('proMonthly');
    expect(plan.code).toBe('proMonthly');
    expect(plan.tier).toBe('pro');
    expect(plan.interval).toBe('monthly');
    expect(plan.priceCents).toBe(4_900);
  });

  it('devolve plano enterprise com features completas', () => {
    const plan = getPlanByCode('enterpriseMonthly');
    expect(plan.tier).toBe('enterprise');
    expect(plan.features).toContain('sso_saml');
    expect(plan.features).toContain('white_label');
  });

  it('lança PlanNotFoundError para code inválido', () => {
    expect(() => getPlanByCode('invalid')).toThrow(PlanNotFoundError);
  });

  it('aceita slug do contract (pro-monthly)', () => {
    const plan = getPlanByCode('pro-monthly');
    expect(plan.code).toBe('proMonthly');
    expect(plan.interval).toBe('monthly');
  });
});

describe('tryGetPlanByCode', () => {
  it('devolve plano para code válido (singular)', () => {
    expect(tryGetPlanByCode('starterYearly')?.priceCents).toBe(19_000);
  });

  it('aceita slug do contract (pro-monthly)', () => {
    const plan = tryGetPlanByCode('pro-monthly');
    expect(plan?.code).toBe('proMonthly');
    expect(plan?.priceCents).toBe(4_900);
  });

  it('aceita slug do contract (enterprise-yearly)', () => {
    expect(tryGetPlanByCode('enterprise-yearly')?.priceCents).toBe(199_000);
  });

  it('devolve undefined em vez de lançar', () => {
    expect(tryGetPlanByCode('nao-existe')).toBeUndefined();
  });
});

describe('getStripePriceIdForCode', () => {
  afterEach(() => {
    // Limpa env vars entre testes.
    delete process.env['STRIPE_PRICE_STARTER_MONTHLY'];
  });

  it('devolve o price ID quando env var definida', () => {
    process.env['STRIPE_PRICE_STARTER_MONTHLY'] = 'price_test_123';
    expect(getStripePriceIdForCode('starterMonthly')).toBe('price_test_123');
  });

  it('devolve undefined se env var não estiver definida', () => {
    expect(getStripePriceIdForCode('starterMonthly')).toBeUndefined();
  });

  it('rejeita valor sem prefixo price_ (defesa contra mau setup)', () => {
    process.env['STRIPE_PRICE_STARTER_MONTHLY'] = 'sk_invalid_prefix';
    expect(getStripePriceIdForCode('starterMonthly')).toBeUndefined();
  });
});

describe('getPlanByStripePriceId', () => {
  afterEach(() => {
    delete process.env['STRIPE_PRICE_PRO_YEARLY'];
  });

  it('resolve plano a partir do price ID', () => {
    process.env['STRIPE_PRICE_PRO_YEARLY'] = 'price_pro_yearly_abc';
    const plan = getPlanByStripePriceId('price_pro_yearly_abc');
    expect(plan?.code).toBe('proYearly');
  });

  it('devolve undefined se price ID não corresponde a nenhum plano', () => {
    expect(getPlanByStripePriceId('price_unknown_xxx')).toBeUndefined();
  });
});

describe('listPublicPlans', () => {
  it('devolve apenas planos públicos', () => {
    const plans = listPublicPlans();
    expect(plans.every((p) => p.isPublic)).toBe(true);
  });

  it('ordena por sortOrder crescente', () => {
    const plans = listPublicPlans();
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i - 1]!.sortOrder).toBeLessThanOrEqual(plans[i]!.sortOrder);
    }
  });

  it('inclui os 6 planos canónicos (3 tiers × 2 intervals)', () => {
    expect(listPublicPlans().length).toBe(6);
  });
});

describe('planDefinitionToContract', () => {
  it('mapeia definition → Plan contract com overrides', () => {
    const def = getPlanByCode('proMonthly');
    const plan = planDefinitionToContract(def, {
      id: '00000000-0000-4000-8000-000000000001',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    expect(plan.code).toBe('pro-monthly');
    expect(plan.tier).toBe('pro');
    expect(plan.interval).toBe('monthly');
    expect(plan.priceCents).toBe(4_900);
    expect(plan.currency).toBe('EUR');
    expect(plan.features).toContain('multi_location');
  });

  it('devolve cópia das features/limits (não muta definition)', () => {
    const def = getPlanByCode('starterMonthly');
    const plan = planDefinitionToContract(def, {
      id: '00000000-0000-4000-8000-000000000002',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    plan.features.push('priority_support'); // mutar cópia
    expect(def.features).not.toContain('priority_support');
  });
});

describe('PLAN_DEFINITIONS', () => {
  it('tem todas as 6 entradas canónicas', () => {
    expect(PLAN_DEFINITIONS.length).toBe(6);
  });

  it('cada plano tem price > 0', () => {
    for (const p of PLAN_DEFINITIONS) {
      expect(p.priceCents).toBeGreaterThan(0);
    }
  });

  it('cada plano enterprise tem sso_saml', () => {
    const enterprise = PLAN_DEFINITIONS.filter((p) => p.tier === 'enterprise');
    for (const p of enterprise) {
      expect(p.features).toContain('sso_saml');
    }
  });
});