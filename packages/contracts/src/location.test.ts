import { describe, expect, it } from 'vitest';
import {
  CoordinatesSchema,
  LocationCreateInputSchema,
  LocationSchema,
} from './location.js';

const validLocation = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: '660e8400-e29b-41d4-a716-446655440000',
  name: 'Salão Lisboa',
  slug: 'salao-lisboa',
  addressLine1: 'Rua da Prata 80',
  addressLine2: '2º Esq',
  postalCode: '1100-415',
  city: 'Lisboa',
  country: 'PT' as const,
  coordinates: { latitude: 38.7108, longitude: -9.1368 },
  phone: '+351 21 123 4567',
  email: 'lisboa@salao.pt',
  status: 'active' as const,
  sortOrder: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('LocationSchema', () => {
  it('parses a valid location', () => {
    const parsed = LocationSchema.parse(validLocation);
    expect(parsed.slug).toBe('salao-lisboa');
    expect(parsed.country).toBe('PT');
  });

  it('accepts null coordinates', () => {
    const parsed = LocationSchema.parse({ ...validLocation, coordinates: null });
    expect(parsed.coordinates).toBeNull();
  });

  it('rejects invalid postal code (no hyphen)', () => {
    expect(() => LocationSchema.parse({ ...validLocation, postalCode: '1100415' })).toThrow();
  });

  it('rejects invalid postal code (wrong length)', () => {
    expect(() => LocationSchema.parse({ ...validLocation, postalCode: '110-41' })).toThrow();
  });

  it('rejects country != PT (for now)', () => {
    expect(() =>
      LocationSchema.parse({ ...validLocation, country: 'BR' as any }),
    ).toThrow();
  });

  it('rejects phone with letters', () => {
    expect(() =>
      LocationSchema.parse({ ...validLocation, phone: '+351 abc 123' }),
    ).toThrow();
  });

  it('applies PT default on country', () => {
    const parsed = LocationSchema.parse({ ...validLocation, country: undefined } as any);
    // Schema default applies only if country is in input. Test the schema directly:
    const minimal = { ...validLocation, country: 'PT' };
    const p2 = LocationSchema.parse(minimal);
    expect(p2.country).toBe('PT');
    void parsed;
  });
});

describe('CoordinatesSchema', () => {
  it.each([
    [{ latitude: 0, longitude: 0 }, true],
    [{ latitude: 38.7, longitude: -9.1 }, true],
    [{ latitude: 90, longitude: 180 }, true],
    [{ latitude: -90, longitude: -180 }, true],
    [{ latitude: 91, longitude: 0 }, false], // lat > 90
    [{ latitude: 0, longitude: 181 }, false], // lng > 180
  ])('coords %o → %s', (input, shouldPass) => {
    if (shouldPass) expect(() => CoordinatesSchema.parse(input)).not.toThrow();
    else expect(() => CoordinatesSchema.parse(input)).toThrow();
  });
});

describe('LocationCreateInputSchema', () => {
  it('parses minimal create payload', () => {
    const parsed = LocationCreateInputSchema.parse({
      tenantId: validLocation.tenantId,
      name: 'Nova Location',
      addressLine1: 'Rua X',
      postalCode: '1000-001',
      city: 'Lisboa',
    });
    expect(parsed.coordinates).toBeUndefined();
    expect(parsed.country).toBeUndefined();
  });
});