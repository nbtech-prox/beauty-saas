/**
 * Testes de subscriptions.ts — create/cancel/get/list com mock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockStripeSdk,
  makeStripeSubscriptionFixture,
} from './_helpers.js';

const mockSdk = createMockStripeSdk();
vi.mock('../src/stripe.js', () => ({
  getStripeClient: () => mockSdk.sdk,
}));

const {
  cancelSubscription,
  createSubscriptionForTenant,
  getSubscription,
  listActiveSubscriptionsForTenant,
  SubscriptionConfigError,
} = await import('../src/subscriptions.js');

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const CUSTOMER_ID = 'cus_test_123';

beforeEach(() => {
  mockSdk.reset();
  process.env['STRIPE_PRICE_PRO_MONTHLY'] = 'price_pro_monthly_test';
  process.env['STRIPE_SECRET_KEY'] = 'sk_test_dummy';
});

afterEach(() => {
  delete process.env['STRIPE_PRICE_PRO_MONTHLY'];
  delete process.env['STRIPE_SECRET_KEY'];
});

describe('createSubscriptionForTenant', () => {
  it('lança SubscriptionConfigError se preço não estiver configurado', async () => {
    delete process.env['STRIPE_PRICE_PRO_MONTHLY'];

    await expect(
      createSubscriptionForTenant({
        tenantId: TENANT_ID,
        customerEmail: 'tenant@example.com',
        planCode: 'proMonthly',
      }),
    ).rejects.toThrow(SubscriptionConfigError);
  });

  it('cria subscription com ensure de customer', async () => {
    // 1) ensure customer → search devolve vazio, create devolve customer.
    mockSdk.setSearchResult('customers', []);
    mockSdk.setCreateResult('customers', {
      id: CUSTOMER_ID,
      object: 'customer',
      email: 'tenant@example.com',
      name: null,
      phone: null,
      metadata: { tenant_id: TENANT_ID },
      invoice_settings: { default_payment_method: null },
      created: Math.floor(Date.now() / 1000),
    });
    // 2) subscriptions.create devolve subscription.
    mockSdk.setCreateResult('subscriptions', makeStripeSubscriptionFixture());

    const sub = await createSubscriptionForTenant({
      tenantId: TENANT_ID,
      customerEmail: 'tenant@example.com',
      planCode: 'proMonthly',
    });
    expect(sub.id).toBe('sub_test_123');
    expect(sub.customerId).toBe(CUSTOMER_ID);
    expect(mockSdk.sdk.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: CUSTOMER_ID,
        items: expect.arrayContaining([
          expect.objectContaining({ price: 'price_pro_monthly_test' }),
        ]),
        metadata: expect.objectContaining({
          tenant_id: TENANT_ID,
          plan_code: 'proMonthly',
        }),
      }),
    );
  });

  it('passa trial_period_days se trialDays > 0', async () => {
    mockSdk.setSearchResult('customers', []);
    mockSdk.setCreateResult('customers', {
      id: CUSTOMER_ID,
      object: 'customer',
      email: 'a@b.c',
      metadata: { tenant_id: TENANT_ID },
      invoice_settings: {},
      created: Math.floor(Date.now() / 1000),
    });
    mockSdk.setCreateResult('subscriptions', makeStripeSubscriptionFixture());

    await createSubscriptionForTenant({
      tenantId: TENANT_ID,
      customerEmail: 'tenant@example.com',
      planCode: 'proMonthly',
      trialDays: 14,
    });
    expect(mockSdk.sdk.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ trial_period_days: 14 }),
    );
  });

  it('omite trial_period_days se trialDays = 0', async () => {
    mockSdk.setSearchResult('customers', []);
    mockSdk.setCreateResult('customers', {
      id: CUSTOMER_ID,
      object: 'customer',
      email: 'a@b.c',
      metadata: { tenant_id: TENANT_ID },
      invoice_settings: {},
      created: Math.floor(Date.now() / 1000),
    });
    mockSdk.setCreateResult('subscriptions', makeStripeSubscriptionFixture());

    await createSubscriptionForTenant({
      tenantId: TENANT_ID,
      customerEmail: 'tenant@example.com',
      planCode: 'proMonthly',
      trialDays: 0,
    });
    const call = mockSdk.sdk.subscriptions.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(call['trial_period_days']).toBeUndefined();
  });

  it('passa discount com promotion_code se couponCode fornecido', async () => {
    mockSdk.setSearchResult('customers', []);
    mockSdk.setCreateResult('customers', {
      id: CUSTOMER_ID,
      object: 'customer',
      email: 'a@b.c',
      metadata: { tenant_id: TENANT_ID },
      invoice_settings: {},
      created: Math.floor(Date.now() / 1000),
    });
    mockSdk.setCreateResult('subscriptions', makeStripeSubscriptionFixture());
    // promotionCodes.list devolve um promo.
    mockSdk.sdk.promotionCodes.list.mockResolvedValue({
      data: [{ id: 'promo_test_abc', code: 'LAUNCH20' }],
    });

    await createSubscriptionForTenant({
      tenantId: TENANT_ID,
      customerEmail: 'tenant@example.com',
      planCode: 'proMonthly',
      couponCode: 'LAUNCH20',
    });
    expect(mockSdk.sdk.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        discounts: [{ promotion_code: 'promo_test_abc' }],
      }),
    );
  });

  it('lança SubscriptionConfigError se coupon code não existir', async () => {
    mockSdk.setSearchResult('customers', []);
    mockSdk.setCreateResult('customers', {
      id: CUSTOMER_ID,
      object: 'customer',
      email: 'a@b.c',
      metadata: { tenant_id: TENANT_ID },
      invoice_settings: {},
      created: Math.floor(Date.now() / 1000),
    });
    mockSdk.sdk.promotionCodes.list.mockResolvedValue({ data: [] });

    await expect(
      createSubscriptionForTenant({
        tenantId: TENANT_ID,
        customerEmail: 'tenant@example.com',
        planCode: 'proMonthly',
        couponCode: 'NAOEXISTE',
      }),
    ).rejects.toThrow(SubscriptionConfigError);
  });
});

describe('cancelSubscription', () => {
  it('soft cancel (default) chama update com cancel_at_period_end=true', async () => {
    const sub = makeStripeSubscriptionFixture();
    mockSdk.sdk.subscriptions.update.mockResolvedValue(sub);

    await cancelSubscription(sub.id);
    expect(mockSdk.sdk.subscriptions.update).toHaveBeenCalledWith(
      sub.id,
      expect.objectContaining({ cancel_at_period_end: true }),
    );
    expect(mockSdk.sdk.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('hard cancel chama cancel()', async () => {
    const sub = makeStripeSubscriptionFixture({ status: 'canceled' });
    mockSdk.sdk.subscriptions.cancel.mockResolvedValue(sub);

    await cancelSubscription(sub.id, { atPeriodEnd: false });
    expect(mockSdk.sdk.subscriptions.cancel).toHaveBeenCalledWith(sub.id, expect.any(Object));
  });

  it('passa cancellation_details com feedback e comment', async () => {
    const sub = makeStripeSubscriptionFixture();
    mockSdk.sdk.subscriptions.update.mockResolvedValue(sub);

    await cancelSubscription(sub.id, {
      feedback: 'too_expensive',
      comment: 'cliente decidiu usar alternativa gratuita',
    });
    expect(mockSdk.sdk.subscriptions.update).toHaveBeenCalledWith(
      sub.id,
      expect.objectContaining({
        cancellation_details: expect.objectContaining({
          feedback: 'too_expensive',
          comment: 'cliente decidiu usar alternativa gratuita',
        }),
      }),
    );
  });
});

describe('reactivateSubscription', () => {
  it('remove cancel_at_period_end', async () => {
    const sub = makeStripeSubscriptionFixture();
    mockSdk.sdk.subscriptions.update.mockResolvedValue(sub);

    await (await import('../src/subscriptions.js')).reactivateSubscription(sub.id);
    expect(mockSdk.sdk.subscriptions.update).toHaveBeenCalledWith(
      sub.id,
      expect.objectContaining({ cancel_at_period_end: false }),
    );
  });
});

describe('getSubscription', () => {
  it('lê subscription por id', async () => {
    const sub = makeStripeSubscriptionFixture();
    mockSdk.sdk.subscriptions.retrieve.mockResolvedValue(sub);

    const result = await getSubscription(sub.id);
    expect(result.id).toBe(sub.id);
  });
});

describe('listActiveSubscriptionsForTenant', () => {
  it('lista subscriptions activas por tenant', async () => {
    const sub1 = makeStripeSubscriptionFixture({ id: 'sub_a' });
    const sub2 = makeStripeSubscriptionFixture({ id: 'sub_b' });
    mockSdk.setSearchResult('subscriptions', [sub1, sub2]);

    const result = await listActiveSubscriptionsForTenant(TENANT_ID);
    expect(result.length).toBe(2);
    expect(mockSdk.sdk.subscriptions.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.stringContaining(TENANT_ID) }),
    );
  });
});