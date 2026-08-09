import { describe, expect, it } from 'vitest';
import { TenantCreateInputSchema, TenantSchema } from './tenant.js';

const validTenant = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  slug: 'salon-joana',
  name: 'Salão da Joana',
  ownerEmail: 'joana@example.com',
  status: 'trialing' as const,
  timezone: 'Europe/Lisbon',
  currency: 'EUR' as const,
  locale: 'pt-PT' as const,
  trialEndsAt: '2026-09-01T00:00:00.000Z',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-09T11:00:00.000Z',
};

describe('TenantSchema', () => {
  it('parses a valid trialing tenant', () => {
    const parsed = TenantSchema.parse(validTenant);
    expect(parsed.slug).toBe('salon-joana');
    expect(parsed.status).toBe('trialing');
  });

  it('rejects invalid slug (uppercase)', () => {
    expect(() => TenantSchema.parse({ ...validTenant, slug: 'Bad-Slug' })).toThrow();
  });

  it('rejects invalid email', () => {
    expect(() => TenantSchema.parse({ ...validTenant, ownerEmail: 'not-email' })).toThrow();
  });

  it('rejects invalid status', () => {
    expect(() =>
      TenantSchema.parse({ ...validTenant, status: 'archived' as any }),
    ).toThrow();
  });

  it('applies defaults (timezone, locale)', () => {
    const minimal = {
      id: validTenant.id,
      slug: 'abc',
      name: 'X',
      ownerEmail: 'a@b.com',
      status: 'active' as const,
      currency: 'EUR' as const,
      trialEndsAt: null,
      createdAt: validTenant.createdAt,
      updatedAt: validTenant.updatedAt,
    };
    const parsed = TenantSchema.parse(minimal);
    expect(parsed.timezone).toBe('Europe/Lisbon');
    expect(parsed.currency).toBe('EUR');
    expect(parsed.locale).toBe('pt-PT');
  });
});

describe('TenantCreateInputSchema', () => {
  it('parses minimal create payload', () => {
    const parsed = TenantCreateInputSchema.parse({
      slug: 'novo-salao',
      name: 'Novo Salão',
      ownerEmail: 'owner@example.com',
      ownerName: 'Maria',
      planId: 'pro-monthly',
    });
    expect(parsed.ownerName).toBe('Maria');
  });

  it('rejects missing planId', () => {
    expect(() =>
      TenantCreateInputSchema.parse({
        slug: 'novo-salao',
        name: 'Novo',
        ownerEmail: 'a@b.com',
        ownerName: 'M',
      }),
    ).toThrow();
  });
});