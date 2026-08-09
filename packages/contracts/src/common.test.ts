import { describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  ApiResponse,
  CurrencySchema,
  EmailSchema,
  IsoDateString,
  LocaleSchema,
  PaginatedResponse,
  SlugSchema,
  TimezoneSchema,
  UuidSchema,
} from './common.js';

// vitest globals must be enabled in config to omit imports. We keep explicit imports
// here for portability.

describe('common primitives', () => {
  describe('UuidSchema', () => {
    it('accepts canonical UUID v4', () => {
      expect(UuidSchema.parse('550e8400-e29b-41d4-a716-446655440000')).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
    });
    it('rejects malformed UUID', () => {
      expect(() => UuidSchema.parse('not-a-uuid')).toThrow();
      expect(() => UuidSchema.parse('550e8400-e29b-41d4-a716')).toThrow();
    });
  });

  describe('SlugSchema', () => {
    it.each([
      ['abc', true],
      ['my-salon', true],
      ['salon-123', true],
      ['a', false], // too short
      ['My-Salon', false], // uppercase
      ['my_salon', false], // underscore
      ['my--salon', false], // double hyphen
      ['-leading-hyphen', false], // leading hyphen
    ])('slug %s → %s', (input, shouldPass) => {
      if (shouldPass) {
        expect(() => SlugSchema.parse(input)).not.toThrow();
      } else {
        expect(() => SlugSchema.parse(input)).toThrow();
      }
    });
  });

  describe('EmailSchema', () => {
    it('accepts valid emails', () => {
      expect(() => EmailSchema.parse('user@example.com')).not.toThrow();
      expect(() => EmailSchema.parse('user.name+tag@sub.example.pt')).not.toThrow();
    });
    it('rejects invalid emails', () => {
      expect(() => EmailSchema.parse('not-an-email')).toThrow();
      expect(() => EmailSchema.parse('@example.com')).toThrow();
    });
  });

  describe('IsoDateString', () => {
    it('accepts ISO datetime with Z', () => {
      expect(() => IsoDateString.parse('2026-08-09T11:00:00Z')).not.toThrow();
      expect(() => IsoDateString.parse('2026-08-09T11:00:00.000Z')).not.toThrow();
    });
    it('rejects plain date', () => {
      expect(() => IsoDateString.parse('2026-08-09')).toThrow();
    });
  });

  describe('CurrencySchema', () => {
    it('only accepts EUR', () => {
      expect(CurrencySchema.parse('EUR')).toBe('EUR');
      expect(() => CurrencySchema.parse('USD')).toThrow();
    });
  });

  describe('TimezoneSchema', () => {
    it.each([
      ['Europe/Lisbon', true],
      ['UTC', true],
      ['America/New_York', true],
      ['Mars/Olympus_Mons', false],
      ['', false],
    ])('timezone %s → %s', (input, shouldPass) => {
      if (shouldPass) expect(() => TimezoneSchema.parse(input)).not.toThrow();
      else expect(() => TimezoneSchema.parse(input)).toThrow();
    });
  });

  describe('LocaleSchema', () => {
    it('accepts pt-PT and en-GB only', () => {
      expect(LocaleSchema.parse('pt-PT')).toBe('pt-PT');
      expect(LocaleSchema.parse('en-GB')).toBe('en-GB');
      expect(() => LocaleSchema.parse('en-US')).toThrow();
    });
  });

  describe('ApiErrorSchema', () => {
    it('parses minimal error', () => {
      const parsed = ApiErrorSchema.parse({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant abc não existe',
      });
      expect(parsed.code).toBe('TENANT_NOT_FOUND');
      expect(parsed.field).toBeUndefined();
    });
    it('parses full error with details', () => {
      const parsed = ApiErrorSchema.parse({
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        field: 'body.email',
        details: { issues: ['invalid email'] },
        requestId: 'req_abc123',
      });
      expect(parsed.field).toBe('body.email');
      expect(parsed.requestId).toBe('req_abc123');
    });
    it('rejects empty code', () => {
      expect(() => ApiErrorSchema.parse({ code: '', message: 'x' })).toThrow();
    });
  });

  describe('PaginatedResponse (generic)', () => {
    it('parses paginated envelope', async () => {
      const { z } = await import('zod');
      const Item = z.object({ id: z.string() });
      const Page = PaginatedResponse(Item);
      const parsed = Page.parse({
        data: [{ id: 'a' }, { id: 'b' }],
        pagination: { page: 1, perPage: 10, total: 25, totalPages: 3, hasNext: true, hasPrev: false },
      });
      expect(parsed.data).toHaveLength(2);
      expect(parsed.pagination.hasNext).toBe(true);
    });
  });

  describe('ApiResponse (discriminated union)', () => {
    it('parses success branch', async () => {
      const { z } = await import('zod');
      const Resp = ApiResponse(z.object({ id: z.string() }));
      const parsed = Resp.parse({ ok: true, data: { id: 'x' } });
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.data.id).toBe('x');
    });
    it('parses error branch', async () => {
      const { z } = await import('zod');
      const Resp = ApiResponse(z.object({ id: z.string() }));
      const parsed = Resp.parse({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'gone' },
      });
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.error.code).toBe('NOT_FOUND');
    });
    it('rejects invalid discriminant', async () => {
      const { z } = await import('zod');
      const Resp = ApiResponse(z.object({ id: z.string() }));
      expect(() => Resp.parse({ ok: 'maybe', data: {} })).toThrow();
    });
  });
});