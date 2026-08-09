import { describe, expect, it } from 'vitest';
import {
  STRIPE_WEBHOOK_TYPES,
  StripeKnownEventSchema,
  StripeWebhookEventSchema,
  WebhookEventRecordSchema,
  WebhookProcessingStatusSchema,
  WebhookProviderSchema,
} from './webhook.js';

const validStripeEvent = {
  id: 'evt_1234567890',
  object: 'event' as const,
  type: 'customer.subscription.created',
  api_version: '2024-06-20',
  created: 1723180800,
  livemode: false,
  data: {
    object: { id: 'sub_123', customer: 'cus_456' },
    previous_attributes: null,
  },
  request: { id: 'req_abc', idempotency_key: null },
};

describe('WebhookProviderSchema', () => {
  it.each(['stripe', 'resend', 'github', 'custom'] as const)('accepts %s', (p) => {
    expect(WebhookProviderSchema.parse(p)).toBe(p);
  });
});

describe('WebhookProcessingStatusSchema', () => {
  it.each(['received', 'processing', 'processed', 'failed', 'dead'] as const)(
    'accepts %s',
    (s) => {
      expect(WebhookProcessingStatusSchema.parse(s)).toBe(s);
    },
  );
});

describe('WebhookEventRecordSchema', () => {
  it('parses a received webhook record', () => {
    const parsed = WebhookEventRecordSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      provider: 'stripe',
      externalEventId: 'evt_123',
      type: 'customer.subscription.created',
      payload: { foo: 'bar' },
      status: 'received',
      attempts: 0,
      errorMessage: null,
      errorStack: null,
      receivedAt: '2026-08-01T00:00:00.000Z',
      processedAt: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    expect(parsed.status).toBe('received');
  });

  it('parses a failed webhook with error', () => {
    const parsed = WebhookEventRecordSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      provider: 'stripe',
      externalEventId: 'evt_456',
      type: 'invoice.payment_failed',
      payload: {},
      status: 'failed',
      attempts: 3,
      errorMessage: 'Connection timeout',
      errorStack: 'Error: timeout\n  at ...',
      receivedAt: '2026-08-01T00:00:00.000Z',
      processedAt: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:01:00.000Z',
    });
    expect(parsed.attempts).toBe(3);
    expect(parsed.errorMessage).toBe('Connection timeout');
  });

  it('rejects empty externalEventId', () => {
    expect(() =>
      WebhookEventRecordSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        provider: 'stripe',
        externalEventId: '',
        type: 'x',
        payload: {},
        status: 'received',
        attempts: 0,
        errorMessage: null,
        errorStack: null,
        receivedAt: '2026-08-01T00:00:00.000Z',
        processedAt: null,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      }),
    ).toThrow();
  });
});

describe('StripeWebhookEventSchema', () => {
  it('parses a valid Stripe event', () => {
    const parsed = StripeWebhookEventSchema.parse(validStripeEvent);
    expect(parsed.id).toBe('evt_1234567890');
  });

  it('rejects invalid event id (no evt_ prefix)', () => {
    expect(() =>
      StripeWebhookEventSchema.parse({ ...validStripeEvent, id: 'not_evt' }),
    ).toThrow();
  });

  it('rejects wrong object type', () => {
    expect(() =>
      StripeWebhookEventSchema.parse({ ...validStripeEvent, object: 'charge' as any }),
    ).toThrow();
  });

  it('accepts null api_version', () => {
    const parsed = StripeWebhookEventSchema.parse({ ...validStripeEvent, api_version: null });
    expect(parsed.api_version).toBeNull();
  });
});

describe('StripeKnownEventSchema (discriminated union)', () => {
  it('parses subscription.created', () => {
    const parsed = StripeKnownEventSchema.parse({
      ...validStripeEvent,
      type: 'customer.subscription.created',
    });
    expect(parsed.type).toBe('customer.subscription.created');
  });

  it('parses invoice.payment_failed', () => {
    const parsed = StripeKnownEventSchema.parse({
      ...validStripeEvent,
      type: 'invoice.payment_failed',
    });
    expect(parsed.type).toBe('invoice.payment_failed');
  });

  it('rejects unknown event type', () => {
    expect(() =>
      StripeKnownEventSchema.parse({ ...validStripeEvent, type: 'charge.succeeded' }),
    ).toThrow();
  });
});

describe('STRIPE_WEBHOOK_TYPES', () => {
  it('contains the 6 documented types', () => {
    expect(STRIPE_WEBHOOK_TYPES).toHaveLength(6);
    expect(STRIPE_WEBHOOK_TYPES).toContain('customer.subscription.created');
    expect(STRIPE_WEBHOOK_TYPES).toContain('invoice.payment_failed');
  });
});