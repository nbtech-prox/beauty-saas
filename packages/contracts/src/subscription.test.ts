import { describe, expect, it } from 'vitest';
import {
  SubscriptionCreateInputSchema,
  SubscriptionSchema,
  SubscriptionStatusSchema,
} from './subscription.js';

const validSub = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: '660e8400-e29b-41d4-a716-446655440000',
  planId: '770e8400-e29b-41d4-a716-446655440000',
  externalId: 'sub_stripe_123',
  externalCustomerId: 'cus_stripe_123',
  status: 'active' as const,
  currentPeriodStart: '2026-08-01T00:00:00.000Z',
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  cancelAt: null,
  canceledAt: null,
  trialEnd: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-09T00:00:00.000Z',
};

describe('SubscriptionSchema', () => {
  it('parses active subscription', () => {
    const parsed = SubscriptionSchema.parse(validSub);
    expect(parsed.status).toBe('active');
    expect(parsed.cancelAt).toBeNull();
  });

  it('parses trialing subscription with trialEnd set', () => {
    const parsed = SubscriptionSchema.parse({
      ...validSub,
      status: 'trialing',
      trialEnd: '2026-08-15T00:00:00.000Z',
    });
    expect(parsed.status).toBe('trialing');
    expect(parsed.trialEnd).toBe('2026-08-15T00:00:00.000Z');
  });

  it('rejects unknown status', () => {
    expect(() => SubscriptionSchema.parse({ ...validSub, status: 'invalid' as any })).toThrow();
  });

  it('rejects missing external IDs', () => {
    expect(() => SubscriptionSchema.parse({ ...validSub, externalId: '' })).toThrow();
  });
});

describe('SubscriptionStatusSchema', () => {
  it.each([
    'incomplete',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'paused',
  ] as const)('accepts %s', (s) => {
    expect(SubscriptionStatusSchema.parse(s)).toBe(s);
  });
});

describe('SubscriptionCreateInputSchema', () => {
  it('parses minimal checkout payload', () => {
    const parsed = SubscriptionCreateInputSchema.parse({
      tenantId: validSub.tenantId,
      planId: validSub.planId,
    });
    expect(parsed.trialDays).toBeUndefined();
  });

  it('clamps trialDays to 0..90', () => {
    expect(() =>
      SubscriptionCreateInputSchema.parse({
        tenantId: validSub.tenantId,
        planId: validSub.planId,
        trialDays: 365, // too high
      }),
    ).toThrow();
    expect(() =>
      SubscriptionCreateInputSchema.parse({
        tenantId: validSub.tenantId,
        planId: validSub.planId,
        trialDays: -1,
      }),
    ).toThrow();
  });
});