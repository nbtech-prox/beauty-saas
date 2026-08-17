/**
 * Testes de subscriptions.ts — create/cancel/get/list com mock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockStripeSdk, makeStripeSubscriptionFixture } from './_helpers';

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
  process.env['STRIPE_PRICE_STARTER_MONTHLY'] = 'price_starter_monthly_test';
  process.env['STRIPE_PRICE_PRO_MONTHLY'] = 'price_pro_monthly_test';
  process.env['STRIPE_SECRET_KEY'] = 'sk_test_dummy';
});

afterEach(() => {
  delete process.env['STRIPE_PRICE_STARTER_MONTHLY'];
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
        planCode: 'pro-monthly',
      }),
    ).rejects.toThrow(SubscriptionConfigError);
  });

  it('rejeita o Price ID devolvido pelo Stripe quando não existe no registry', async () => {
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
    mockSdk.setCreateResult(
      'subscriptions',
      makeStripeSubscriptionFixture({ priceId: 'price_returned_by_stripe' }),
    );

    await expect(
      createSubscriptionForTenant({
        tenantId: TENANT_ID,
        customerEmail: 'tenant@example.com',
        planCode: 'pro-monthly',
      }),
    ).rejects.toMatchObject({
      name: 'SubscriptionReconciliationError',
      code: 'subscription_reconciliation_failed',
      reason: 'unknown_price_id',
    });
  });

  it('cria subscription quando metadata, preço e plano solicitado são coerentes', async () => {
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
    mockSdk.setCreateResult('subscriptions', makeStripeSubscriptionFixture());

    const sub = await createSubscriptionForTenant({
      tenantId: TENANT_ID,
      customerEmail: 'tenant@example.com',
      planCode: 'pro-monthly',
    });

    expect(sub.id).toBe('sub_test_123');
    expect(sub.customerId).toBe(CUSTOMER_ID);
    expect(sub.stripePriceId).toBe('price_pro_monthly_test');
    expect(mockSdk.sdk.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: CUSTOMER_ID,
        items: expect.arrayContaining([
          expect.objectContaining({ price: 'price_pro_monthly_test' }),
        ]),
        metadata: expect.objectContaining({
          tenant_id: TENANT_ID,
          plan_code: 'pro-monthly',
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
      planCode: 'pro-monthly',
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
      planCode: 'pro-monthly',
      trialDays: 0,
    });
    const call = mockSdk.sdk.subscriptions.create.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
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
      planCode: 'pro-monthly',
      couponCode: 'LAUNCH20',
    });
    expect(mockSdk.sdk.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        discounts: [{ promotion_code: 'promo_test_abc' }],
      }),
    );
  });

  it('classifica coupon code inexistente como input inválido', async () => {
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

    const result = createSubscriptionForTenant({
      tenantId: TENANT_ID,
      customerEmail: 'tenant@example.com',
      planCode: 'pro-monthly',
      couponCode: 'NAOEXISTE',
    });

    await expect(result).rejects.toMatchObject({
      name: 'PromotionCodeNotFoundError',
      code: 'promotion_code_not_found',
      httpStatus: 400,
    });
  });

  it('rejeita resposta Stripe sem metadata plan_code', async () => {
    mockSdk.setSearchResult('customers', []);
    mockSdk.setCreateResult('customers', {
      id: CUSTOMER_ID,
      object: 'customer',
      email: 'tenant@example.com',
      metadata: { tenant_id: TENANT_ID },
      invoice_settings: {},
      created: Math.floor(Date.now() / 1000),
    });
    mockSdk.setCreateResult('subscriptions', {
      ...makeStripeSubscriptionFixture(),
      metadata: { tenant_id: TENANT_ID },
    });

    await expect(
      createSubscriptionForTenant({
        tenantId: TENANT_ID,
        customerEmail: 'tenant@example.com',
        planCode: 'pro-monthly',
      }),
    ).rejects.toMatchObject({
      name: 'SubscriptionReconciliationError',
      reason: 'missing_plan_code',
    });
  });

  it('rejeita resposta Stripe com plan_code divergente do solicitado', async () => {
    mockSdk.setSearchResult('customers', []);
    mockSdk.setCreateResult('customers', {
      id: CUSTOMER_ID,
      object: 'customer',
      email: 'tenant@example.com',
      metadata: { tenant_id: TENANT_ID },
      invoice_settings: {},
      created: Math.floor(Date.now() / 1000),
    });
    mockSdk.setCreateResult(
      'subscriptions',
      makeStripeSubscriptionFixture({ planCode: 'starter-monthly' }),
    );

    await expect(
      createSubscriptionForTenant({
        tenantId: TENANT_ID,
        customerEmail: 'tenant@example.com',
        planCode: 'pro-monthly',
      }),
    ).rejects.toMatchObject({
      name: 'SubscriptionReconciliationError',
      reason: 'plan_code_mismatch',
    });
  });

  it('rejeita Price ID conhecido que diverge da metadata plan_code', async () => {
    mockSdk.setSearchResult('customers', []);
    mockSdk.setCreateResult('customers', {
      id: CUSTOMER_ID,
      object: 'customer',
      email: 'tenant@example.com',
      metadata: { tenant_id: TENANT_ID },
      invoice_settings: {},
      created: Math.floor(Date.now() / 1000),
    });
    mockSdk.setCreateResult(
      'subscriptions',
      makeStripeSubscriptionFixture({
        planCode: 'pro-monthly',
        priceId: 'price_starter_monthly_test',
      }),
    );

    await expect(
      createSubscriptionForTenant({
        tenantId: TENANT_ID,
        customerEmail: 'tenant@example.com',
        planCode: 'pro-monthly',
      }),
    ).rejects.toMatchObject({
      name: 'SubscriptionReconciliationError',
      code: 'subscription_reconciliation_failed',
      reason: 'price_plan_mismatch',
    });
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
    expect(mockSdk.sdk.subscriptions.cancel).toHaveBeenCalledWith(
      sub.id,
      expect.any(Object),
    );
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

    await (
      await import('../src/subscriptions.js')
    ).reactivateSubscription(sub.id);
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
    expect(result.stripePriceId).toBe('price_pro_monthly_test');
  });

  it('mapeia incomplete_expired do Stripe para canceled', async () => {
    const sub = makeStripeSubscriptionFixture({ status: 'incomplete_expired' });
    mockSdk.sdk.subscriptions.retrieve.mockResolvedValue(sub);

    const result = await getSubscription(sub.id);

    expect(result.status).toBe('canceled');
  });

  it('falha de forma fechada quando a subscription não tem items', async () => {
    const sub = {
      ...makeStripeSubscriptionFixture(),
      items: { data: [] },
    };
    mockSdk.sdk.subscriptions.retrieve.mockResolvedValue(sub);

    await expect(getSubscription(sub.id)).rejects.toThrow(
      `Subscription ${sub.id} sem items — data corruption`,
    );
  });

  it('rejeita reconciliação quando metadata plan_code está ausente', async () => {
    const sub = {
      ...makeStripeSubscriptionFixture(),
      metadata: { tenant_id: TENANT_ID },
    };
    mockSdk.sdk.subscriptions.retrieve.mockResolvedValue(sub);

    await expect(getSubscription(sub.id)).rejects.toMatchObject({
      name: 'SubscriptionReconciliationError',
      code: 'subscription_reconciliation_failed',
      subscriptionId: sub.id,
      reason: 'missing_plan_code',
    });
  });

  it('rejeita reconciliação quando metadata plan_code está vazia', async () => {
    const sub = {
      ...makeStripeSubscriptionFixture(),
      metadata: { tenant_id: TENANT_ID, plan_code: '' },
    };
    mockSdk.sdk.subscriptions.retrieve.mockResolvedValue(sub);

    await expect(getSubscription(sub.id)).rejects.toMatchObject({
      name: 'SubscriptionReconciliationError',
      code: 'subscription_reconciliation_failed',
      subscriptionId: sub.id,
      reason: 'invalid_plan_code',
    });
  });

  it('rejeita reconciliação quando metadata plan_code é inválida', async () => {
    const sub = makeStripeSubscriptionFixture({
      planCode: 'plano-inexistente',
    });
    mockSdk.sdk.subscriptions.retrieve.mockResolvedValue(sub);

    await expect(getSubscription(sub.id)).rejects.toMatchObject({
      name: 'SubscriptionReconciliationError',
      code: 'subscription_reconciliation_failed',
      subscriptionId: sub.id,
      reason: 'invalid_plan_code',
    });
  });

  it('rejeita reconciliação quando o Price ID é desconhecido', async () => {
    const sub = makeStripeSubscriptionFixture({
      priceId: 'price_unknown_from_stripe',
    });
    mockSdk.sdk.subscriptions.retrieve.mockResolvedValue(sub);

    await expect(getSubscription(sub.id)).rejects.toMatchObject({
      name: 'SubscriptionReconciliationError',
      code: 'subscription_reconciliation_failed',
      subscriptionId: sub.id,
      reason: 'unknown_price_id',
    });
  });

  it('rejeita reconciliação quando Price ID e metadata identificam planos diferentes', async () => {
    const sub = makeStripeSubscriptionFixture({
      planCode: 'pro-monthly',
      priceId: 'price_starter_monthly_test',
    });
    mockSdk.sdk.subscriptions.retrieve.mockResolvedValue(sub);

    await expect(getSubscription(sub.id)).rejects.toMatchObject({
      name: 'SubscriptionReconciliationError',
      code: 'subscription_reconciliation_failed',
      subscriptionId: sub.id,
      reason: 'price_plan_mismatch',
    });
  });
});

describe('listActiveSubscriptionsForTenant', () => {
  it('rejeita tenantId inválido antes de pesquisar no Stripe', async () => {
    await expect(
      listActiveSubscriptionsForTenant("tenant' OR status:'active"),
    ).rejects.toThrow('tenantId deve ser um UUID válido');

    expect(mockSdk.sdk.subscriptions.search).not.toHaveBeenCalled();
  });

  it('consulta cada estado com o filtro obrigatório do tenant', async () => {
    const active = makeStripeSubscriptionFixture({
      id: 'sub_active',
      status: 'active',
    });
    const trialing = makeStripeSubscriptionFixture({
      id: 'sub_trialing',
      status: 'trialing',
    });
    const pastDue = makeStripeSubscriptionFixture({
      id: 'sub_past_due',
      status: 'past_due',
    });
    mockSdk.sdk.subscriptions.search
      .mockResolvedValueOnce({ data: [active] })
      .mockResolvedValueOnce({ data: [trialing] })
      .mockResolvedValueOnce({ data: [pastDue] });

    const result = await listActiveSubscriptionsForTenant(TENANT_ID);
    expect(result.map((subscription) => subscription.id)).toEqual([
      'sub_active',
      'sub_trialing',
      'sub_past_due',
    ]);
    expect(mockSdk.sdk.subscriptions.search).toHaveBeenNthCalledWith(1, {
      query: `status:'active' AND metadata['tenant_id']:'${TENANT_ID}'`,
      limit: 100,
    });
    expect(mockSdk.sdk.subscriptions.search).toHaveBeenNthCalledWith(2, {
      query: `status:'trialing' AND metadata['tenant_id']:'${TENANT_ID}'`,
      limit: 100,
    });
    expect(mockSdk.sdk.subscriptions.search).toHaveBeenNthCalledWith(3, {
      query: `status:'past_due' AND metadata['tenant_id']:'${TENANT_ID}'`,
      limit: 100,
    });
  });

  it('pagina um estado com next_page e agrega todas as subscriptions', async () => {
    const activePageOne = makeStripeSubscriptionFixture({
      id: 'sub_active_page_1',
      status: 'active',
    });
    const activePageTwo = makeStripeSubscriptionFixture({
      id: 'sub_active_page_2',
      status: 'active',
    });
    const trialing = makeStripeSubscriptionFixture({
      id: 'sub_trialing',
      status: 'trialing',
    });
    const pastDue = makeStripeSubscriptionFixture({
      id: 'sub_past_due',
      status: 'past_due',
    });
    mockSdk.sdk.subscriptions.search
      .mockResolvedValueOnce({
        data: [activePageOne],
        next_page: 'page_active_2',
      })
      .mockResolvedValueOnce({ data: [trialing] })
      .mockResolvedValueOnce({ data: [pastDue] })
      .mockResolvedValueOnce({ data: [activePageTwo] });

    const result = await listActiveSubscriptionsForTenant(TENANT_ID);

    expect(mockSdk.sdk.subscriptions.search).toHaveBeenNthCalledWith(4, {
      query: `status:'active' AND metadata['tenant_id']:'${TENANT_ID}'`,
      limit: 100,
      page: 'page_active_2',
    });
    expect(result.map((subscription) => subscription.id)).toEqual([
      'sub_active_page_1',
      'sub_active_page_2',
      'sub_trialing',
      'sub_past_due',
    ]);
  });

  it('rejeita uma subscription listada com Price ID desconhecido', async () => {
    const unknownPrice = makeStripeSubscriptionFixture({
      id: 'sub_unknown_price',
      priceId: 'price_unknown_from_search',
    });
    mockSdk.sdk.subscriptions.search
      .mockResolvedValueOnce({ data: [unknownPrice] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    await expect(
      listActiveSubscriptionsForTenant(TENANT_ID),
    ).rejects.toMatchObject({
      name: 'SubscriptionReconciliationError',
      code: 'subscription_reconciliation_failed',
      subscriptionId: unknownPrice.id,
      reason: 'unknown_price_id',
    });
  });

  it('rejeita uma subscription listada cujo Price ID diverge da metadata', async () => {
    const mismatchedPrice = makeStripeSubscriptionFixture({
      id: 'sub_mismatched_price',
      planCode: 'pro-monthly',
      priceId: 'price_starter_monthly_test',
    });
    mockSdk.sdk.subscriptions.search
      .mockResolvedValueOnce({ data: [mismatchedPrice] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    await expect(
      listActiveSubscriptionsForTenant(TENANT_ID),
    ).rejects.toMatchObject({
      name: 'SubscriptionReconciliationError',
      code: 'subscription_reconciliation_failed',
      subscriptionId: mismatchedPrice.id,
      reason: 'price_plan_mismatch',
    });
  });

  it('falha com erro estável quando o Stripe repete o cursor da paginação', async () => {
    mockSdk.sdk.subscriptions.search
      .mockResolvedValueOnce({ data: [], next_page: 'page_stalled' })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [], next_page: 'page_stalled' })
      .mockResolvedValueOnce({ data: [] });

    await expect(
      listActiveSubscriptionsForTenant(TENANT_ID),
    ).rejects.toMatchObject({
      name: 'SubscriptionPaginationError',
      code: 'subscription_pagination_stalled',
      status: 'active',
      cursor: 'page_stalled',
    });
    expect(mockSdk.sdk.subscriptions.search).toHaveBeenCalledTimes(4);
  });
});
