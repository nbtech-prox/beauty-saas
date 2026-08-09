import { describe, expect, it } from 'vitest';
import { PLAN_CODES, PlanFeatureSchema, PlanSchema, PlanTierSchema } from './plan.js';

const validPlan = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  code: 'pro-monthly',
  name: 'Pro Mensal',
  tier: 'pro' as const,
  interval: 'monthly' as const,
  priceCents: 4900,
  currency: 'EUR' as const,
  features: ['multi_location', 'custom_domain'] as const,
  limits: {
    maxProfessionals: 10,
    maxServices: 50,
    maxBookingsPerMonth: 2000,
    maxLocations: 3,
  },
  sortOrder: 20,
  isPublic: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('PlanSchema', () => {
  it('parses a valid pro plan', () => {
    const parsed = PlanSchema.parse(validPlan);
    expect(parsed.tier).toBe('pro');
    expect(parsed.limits.maxProfessionals).toBe(10);
  });

  it('rejects unknown feature', () => {
    expect(() =>
      PlanSchema.parse({ ...validPlan, features: ['unknown_feature' as any] }),
    ).toThrow();
  });

  it('rejects negative priceCents', () => {
    expect(() => PlanSchema.parse({ ...validPlan, priceCents: -100 })).toThrow();
  });

  it('accepts zero priceCents (free plan)', () => {
    const parsed = PlanSchema.parse({ ...validPlan, priceCents: 0 });
    expect(parsed.priceCents).toBe(0);
  });
});

describe('PlanTierSchema', () => {
  it.each(['starter', 'pro', 'enterprise'] as const)('accepts tier %s', (tier) => {
    expect(PlanTierSchema.parse(tier)).toBe(tier);
  });
  it('rejects unknown tier', () => {
    expect(() => PlanTierSchema.parse('enterprise-plus' as any)).toThrow();
  });
});

describe('PlanFeatureSchema', () => {
  it('accepts known features', () => {
    expect(PlanFeatureSchema.parse('sso_saml')).toBe('sso_saml');
  });
  it('rejects unknown feature', () => {
    expect(() => PlanFeatureSchema.parse('rocket_mode' as any)).toThrow();
  });
});

describe('PLAN_CODES', () => {
  it('has 6 canonical codes', () => {
    expect(Object.keys(PLAN_CODES)).toHaveLength(6);
    expect(PLAN_CODES.proMonthly).toBe('pro-monthly');
    expect(PLAN_CODES.enterpriseYearly).toBe('enterprise-yearly');
  });
});