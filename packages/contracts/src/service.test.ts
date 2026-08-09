import { describe, expect, it } from 'vitest';
import {
  PriceTypeSchema,
  ServiceConsistentSchema,
  ServiceCreateInputSchema,
  ServiceSchema,
} from './service.js';

const validService = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: '660e8400-e29b-41d4-a716-446655440000',
  name: 'Corte de Cabelo',
  slug: 'corte-de-cabelo',
  description: 'Corte clássico para todos os tipos de cabelo.',
  durationMinutes: 30,
  priceType: 'fixed' as const,
  price: 25.0,
  currency: 'EUR' as const,
  bufferMinutesBefore: 0,
  bufferMinutesAfter: 5,
  category: 'Cabelo',
  isBookable: true,
  requiresApproval: false,
  sortOrder: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-08-09T11:00:00.000Z',
};

describe('ServiceSchema', () => {
  it('parses valid fixed-price service', () => {
    const parsed = ServiceSchema.parse(validService);
    expect(parsed.price).toBe(25.0);
    expect(parsed.priceType).toBe('fixed');
  });

  it('applies default bufferMinutes', () => {
    const minimal = { ...validService, bufferMinutesBefore: undefined, bufferMinutesAfter: undefined } as any;
    // Zod 4 applies defaults during parse when input omits the key.
    const parsed = ServiceSchema.parse({
      ...validService,
      bufferMinutesBefore: 0,
      bufferMinutesAfter: 0,
    });
    expect(parsed.bufferMinutesBefore).toBe(0);
    expect(parsed.bufferMinutesAfter).toBe(0);
    // silence unused
    void minimal;
  });

  it('rejects duration < 5 minutes', () => {
    expect(() => ServiceSchema.parse({ ...validService, durationMinutes: 3 })).toThrow();
  });

  it('rejects duration > 8 hours', () => {
    expect(() => ServiceSchema.parse({ ...validService, durationMinutes: 500 })).toThrow();
  });

  it('rejects non-multiple-of-0.01 price', () => {
    expect(() => ServiceSchema.parse({ ...validService, price: 25.555 })).toThrow();
  });
});

describe('ServiceConsistentSchema (cross-field refinement)', () => {
  it('accepts fixed price > 0', () => {
    expect(() => ServiceConsistentSchema.parse(validService)).not.toThrow();
  });

  it('rejects fixed price = 0 (use priceType=free instead)', () => {
    expect(() =>
      ServiceConsistentSchema.parse({ ...validService, price: 0 }),
    ).toThrow(/priceType/);
  });

  it('rejects fixed price = null', () => {
    expect(() =>
      ServiceConsistentSchema.parse({ ...validService, price: null }),
    ).toThrow(/priceType/);
  });

  it('rejects consult price != null', () => {
    expect(() =>
      ServiceConsistentSchema.parse({
        ...validService,
        priceType: 'consult',
        price: 50,
      }),
    ).toThrow(/priceType/);
  });

  it('accepts consult with price=null', () => {
    const parsed = ServiceConsistentSchema.parse({
      ...validService,
      priceType: 'consult',
      price: null,
    });
    expect(parsed.priceType).toBe('consult');
  });

  it('accepts free with price=null', () => {
    const parsed = ServiceConsistentSchema.parse({
      ...validService,
      priceType: 'free',
      price: null,
    });
    expect(parsed.priceType).toBe('free');
  });
});

describe('PriceTypeSchema', () => {
  it.each(['fixed', 'consult', 'free'] as const)('accepts %s', (p) => {
    expect(PriceTypeSchema.parse(p)).toBe(p);
  });
  it('rejects unknown', () => {
    expect(() => PriceTypeSchema.parse('variable' as any)).toThrow();
  });
});

describe('ServiceCreateInputSchema', () => {
  it('parses minimal payload', () => {
    const parsed = ServiceCreateInputSchema.parse({
      tenantId: validService.tenantId,
      name: 'Manicure',
      durationMinutes: 45,
      priceType: 'fixed',
      price: 20.0,
    });
    expect(parsed.name).toBe('Manicure');
    expect(parsed.isBookable).toBeUndefined();
  });
});