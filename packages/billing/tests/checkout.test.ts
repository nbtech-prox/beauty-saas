/**
 * Testes de checkout.ts — criação de Checkout Session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockStripeSdk, makeStripeCheckoutSessionFixture } from './_helpers';

const mockSdk = createMockStripeSdk();
vi.mock('../src/stripe.js', () => ({
  getStripeClient: () => mockSdk.sdk,
}));

const { createCheckoutSession } = await import('../src/checkout.js');

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const SUCCESS_URL = 'https://app.example.com/billing/success?session_id={CHECKOUT_SESSION_ID}';
const CANCEL_URL = 'https://app.example.com/billing/cancel?session_id={CHECKOUT_SESSION_ID}';

beforeEach(() => {
  mockSdk.reset();
  process.env['STRIPE_PRICE_PRO_MONTHLY'] = 'price_pro_monthly_test';
});

afterEach(() => {
  delete process.env['STRIPE_PRICE_PRO_MONTHLY'];
});

describe('createCheckoutSession', () => {
  it('cria session em mode subscription', async () => {
    mockSdk.sdk.checkout.sessions.create.mockResolvedValue(
      makeStripeCheckoutSessionFixture({ mode: 'subscription' }),
    );

    const result = await createCheckoutSession({
      tenantId: TENANT_ID,
      customerEmail: 'tenant@example.com',
      planCode: 'pro-monthly',
      mode: 'subscription',
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
    });
    expect(result.mode).toBe('subscription');
    expect(result.sessionId).toBe('cs_test_123');
    expect(result.url).toContain('checkout.stripe.com');
  });

  it('passa client_reference_id = tenantId', async () => {
    mockSdk.sdk.checkout.sessions.create.mockResolvedValue(
      makeStripeCheckoutSessionFixture(),
    );

    await createCheckoutSession({
      tenantId: TENANT_ID,
      customerEmail: 'tenant@example.com',
      planCode: 'pro-monthly',
      mode: 'subscription',
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
    });
    expect(mockSdk.sdk.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ client_reference_id: TENANT_ID }),
    );
  });

  it('passa metadata com tenant_id e plan_code', async () => {
    mockSdk.sdk.checkout.sessions.create.mockResolvedValue(
      makeStripeCheckoutSessionFixture(),
    );

    await createCheckoutSession({
      tenantId: TENANT_ID,
      customerEmail: 'tenant@example.com',
      planCode: 'pro-monthly',
      mode: 'subscription',
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
    });
    expect(mockSdk.sdk.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          tenant_id: TENANT_ID,
          plan_code: 'pro-monthly',
        }),
      }),
    );
  });

  it('rejeita successUrl sem placeholder {CHECKOUT_SESSION_ID}', async () => {
    await expect(
      createCheckoutSession({
        tenantId: TENANT_ID,
        customerEmail: 'tenant@example.com',
        planCode: 'pro-monthly',
        mode: 'subscription',
        successUrl: 'https://app.example.com/billing/success',
        cancelUrl: CANCEL_URL,
      }),
    ).rejects.toThrow(/CHECKOUT_SESSION_ID/);
  });

  it('rejeita cancelUrl sem placeholder {CHECKOUT_SESSION_ID}', async () => {
    await expect(
      createCheckoutSession({
        tenantId: TENANT_ID,
        customerEmail: 'tenant@example.com',
        planCode: 'pro-monthly',
        mode: 'subscription',
        successUrl: SUCCESS_URL,
        cancelUrl: 'https://app.example.com/billing/cancel',
      }),
    ).rejects.toThrow(/CHECKOUT_SESSION_ID/);
  });

  it('passa trial_period_days em subscription_data para subscription mode', async () => {
    mockSdk.sdk.checkout.sessions.create.mockResolvedValue(
      makeStripeCheckoutSessionFixture({ mode: 'subscription' }),
    );

    await createCheckoutSession({
      tenantId: TENANT_ID,
      customerEmail: 'tenant@example.com',
      planCode: 'pro-monthly',
      mode: 'subscription',
      trialDays: 7,
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
    });
    expect(mockSdk.sdk.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_data: expect.objectContaining({ trial_period_days: 7 }),
      }),
    );
  });

  it('resolve código promocional humano antes de criar o Checkout', async () => {
    mockSdk.sdk.promotionCodes.list.mockResolvedValue({
      data: [{ id: 'promo_test_launch20', code: 'LAUNCH20' }],
    });
    mockSdk.sdk.checkout.sessions.create.mockResolvedValue(
      makeStripeCheckoutSessionFixture({ mode: 'subscription' }),
    );

    await createCheckoutSession({
      tenantId: TENANT_ID,
      customerEmail: 'tenant@example.com',
      planCode: 'pro-monthly',
      mode: 'subscription',
      couponCode: 'LAUNCH20',
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
    });

    expect(mockSdk.sdk.promotionCodes.list).toHaveBeenCalledWith({
      code: 'LAUNCH20',
      active: true,
      limit: 1,
    });
    expect(mockSdk.sdk.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        discounts: [{ promotion_code: 'promo_test_launch20' }],
      }),
    );
  });

  it('rejeita código promocional inexistente antes de criar o Checkout', async () => {
    mockSdk.sdk.promotionCodes.list.mockResolvedValue({ data: [] });

    const result = createCheckoutSession({
      tenantId: TENANT_ID,
      customerEmail: 'tenant@example.com',
      planCode: 'pro-monthly',
      mode: 'subscription',
      couponCode: 'NAOEXISTE',
      successUrl: SUCCESS_URL,
      cancelUrl: CANCEL_URL,
    });

    await expect(result).rejects.toMatchObject({
      name: 'PromotionCodeNotFoundError',
      code: 'promotion_code_not_found',
      httpStatus: 400,
      promotionCode: 'NAOEXISTE',
    });

    expect(mockSdk.sdk.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('lança erro se plano sem price ID configurado', async () => {
    delete process.env['STRIPE_PRICE_PRO_MONTHLY'];

    await expect(
      createCheckoutSession({
        tenantId: TENANT_ID,
        customerEmail: 'tenant@example.com',
        planCode: 'pro-monthly',
        mode: 'subscription',
        successUrl: SUCCESS_URL,
        cancelUrl: CANCEL_URL,
      }),
    ).rejects.toThrow(/STRIPE_PRICE_PRO_MONTHLY/);
  });
});