/**
 * Testes do stripe.ts — configuração e cache.
 *
 * Não tocamos na API Stripe; testamos apenas validação de env e cache.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  PINNED_STRIPE_API_VERSION,
  StripeConfigError,
  __resetStripeClientForTests,
  getStripeClient,
  getWebhookSecret,
} from '../src/stripe.js';

describe('getStripeClient', () => {
  afterEach(() => {
    delete process.env['STRIPE_SECRET_KEY'];
    __resetStripeClientForTests();
  });

  it('lança StripeConfigError quando STRIPE_SECRET_KEY ausente', () => {
    expect(() => getStripeClient()).toThrow(StripeConfigError);
  });

  it('StripeConfigError tem httpStatus 500', () => {
    try {
      getStripeClient();
    } catch (err) {
      expect(err).toBeInstanceOf(StripeConfigError);
      expect((err as StripeConfigError).httpStatus).toBe(500);
    }
  });

  it('aceita override explícito do secret (uso em testes)', () => {
    const stripe = getStripeClient({ secretKey: 'sk_test_override' });
    expect(stripe).toBeDefined();
    // Verificamos tipo e que aceita chamadas.
    expect(typeof stripe.customers.create).toBe('function');
  });

  it('lê STRIPE_SECRET_KEY do ambiente', () => {
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_from_env';
    const stripe = getStripeClient();
    expect(stripe).toBeDefined();
    expect(typeof stripe.customers.create).toBe('function');
  });

  it('devolve instância cacheada para mesma config', () => {
    const a = getStripeClient({ secretKey: 'sk_test_cache' });
    const b = getStripeClient({ secretKey: 'sk_test_cache' });
    expect(a).toBe(b);
  });

  it('re-cria instância após override de secret', () => {
    const a = getStripeClient({ secretKey: 'sk_a' });
    const b = getStripeClient({ secretKey: 'sk_b' });
    expect(a).not.toBe(b);
  });

  it('re-cria instância após reset explícito', () => {
    const a = getStripeClient({ secretKey: 'sk_reset' });
    __resetStripeClientForTests();
    const b = getStripeClient({ secretKey: 'sk_reset' });
    expect(a).not.toBe(b);
  });

  it('aceita appInfo customizado', () => {
    const stripe = getStripeClient({
      secretKey: 'sk_test',
      appInfo: { name: 'test-app', version: '1.2.3' },
    });
    expect(stripe).toBeDefined();
  });
});

describe('getWebhookSecret', () => {
  afterEach(() => {
    delete process.env['STRIPE_WEBHOOK_SECRET'];
  });

  it('lança StripeConfigError quando env var ausente', () => {
    expect(() => getWebhookSecret()).toThrow(StripeConfigError);
  });

  it('lê STRIPE_WEBHOOK_SECRET do ambiente', () => {
    process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_test_123';
    expect(getWebhookSecret()).toBe('whsec_test_123');
  });

  it('aceita override explícito', () => {
    expect(getWebhookSecret('whsec_override')).toBe('whsec_override');
  });
});

describe('PINNED_STRIPE_API_VERSION', () => {
  it('é uma string não-vazia', () => {
    expect(PINNED_STRIPE_API_VERSION.length).toBeGreaterThan(0);
  });

  it('contém prefixo data tipo', () => {
    expect(PINNED_STRIPE_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});