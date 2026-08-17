/**
 * Test helpers — mock do Stripe SDK.
 *
 * Devolve um objecto que cumpre o subset da API que os nossos módulos usam.
 * Os testes individuais substituem o mock com fixtures mais ricas.
 */
import { vi } from 'vitest';

export interface MockStripeState {
  customers: unknown[];
  subscriptions: unknown[];
  checkoutSessions: unknown[];
  portalSessions: unknown[];
  promotionCodes: unknown[];
}

export function createEmptyMockState(): MockStripeState {
  return {
    customers: [],
    subscriptions: [],
    checkoutSessions: [],
    portalSessions: [],
    promotionCodes: [],
  };
}

/**
 * Constrói um mock do Stripe SDK com helpers para configurar respostas.
 *
 * Para usar:
 *   const mock = createMockStripeSdk();
 *   mock.setSearchResult('customers', [{ id: 'cus_xxx', ... }]);
 *   vi.mock('../src/stripe.js', () => ({ getStripeClient: () => mock.sdk }));
 */
export function createMockStripeSdk(state: MockStripeState = createEmptyMockState()) {
  // Spies individuais — separados por recurso para evitar calls cruzados.
  const customersSearch = vi.fn().mockImplementation(() => ({ data: [] }));
  const customersList = vi.fn().mockImplementation(() => ({ data: [] }));
  const customersCreate = vi.fn();
  const customersUpdate = vi.fn();
  const customersDel = vi.fn().mockResolvedValue({ id: 'cus_deleted', deleted: true });

  const subscriptionsSearch = vi.fn().mockImplementation(() => ({ data: [] }));
  const subscriptionsList = vi.fn().mockImplementation(() => ({ data: [] }));
  const subscriptionsCreate = vi.fn();
  const subscriptionsRetrieve = vi.fn();
  const subscriptionsUpdate = vi.fn();
  const subscriptionsCancel = vi.fn();

  const checkoutCreate = vi.fn();
  const portalCreate = vi.fn();
  const promotionCodesList = vi.fn();

  const sdk = {
    customers: {
      search: customersSearch,
      list: customersList,
      create: customersCreate,
      update: customersUpdate,
      del: customersDel,
    },
    subscriptions: {
      search: subscriptionsSearch,
      list: subscriptionsList,
      create: subscriptionsCreate,
      retrieve: subscriptionsRetrieve,
      update: subscriptionsUpdate,
      cancel: subscriptionsCancel,
    },
    checkout: { sessions: { create: checkoutCreate } },
    billingPortal: { sessions: { create: portalCreate } },
    promotionCodes: { list: promotionCodesList },
    webhooks: {
      constructEvent: vi.fn(),
      generateTestHeaderString: vi.fn(),
    },
  };

  return {
    sdk,
    state,
    setSearchResult(resource: 'customers' | 'subscriptions', data: unknown[]) {
      if (resource === 'customers') {
        customersSearch.mockResolvedValue({ data });
      } else if (resource === 'subscriptions') {
        subscriptionsSearch.mockResolvedValue({ data });
      }
    },
    setCreateResult(resource: 'customers' | 'subscriptions' | 'checkout', data: unknown) {
      if (resource === 'customers') customersCreate.mockResolvedValue(data);
      else if (resource === 'subscriptions') subscriptionsCreate.mockResolvedValue(data);
      else if (resource === 'checkout') checkoutCreate.mockResolvedValue(data);
    },
    reset() {
      customersSearch.mockClear();
      customersList.mockClear();
      customersCreate.mockClear();
      customersUpdate.mockClear();
      customersDel.mockClear();
      subscriptionsSearch.mockClear();
      subscriptionsList.mockClear();
      subscriptionsCreate.mockClear();
      subscriptionsRetrieve.mockClear();
      subscriptionsUpdate.mockClear();
      subscriptionsCancel.mockClear();
      checkoutCreate.mockClear();
      portalCreate.mockClear();
      promotionCodesList.mockClear();
    },
  };
}

/**
 * Constrói uma fixture de `Stripe.Customer` com defaults razoáveis.
 */
export function makeStripeCustomerFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cus_test_123',
    object: 'customer',
    email: 'tenant@example.com',
    name: 'Test Tenant',
    phone: null,
    metadata: { tenant_id: '00000000-0000-4000-8000-000000000001' },
    invoice_settings: { default_payment_method: null },
    created: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

/**
 * Constrói uma fixture de `Stripe.Subscription` com defaults razoáveis.
 */
export function makeStripeSubscriptionFixture(overrides: {
  id?: string;
  customerId?: string;
  status?: string;
  planCode?: string;
  priceId?: string;
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: overrides.id ?? 'sub_test_123',
    object: 'subscription',
    customer: overrides.customerId ?? 'cus_test_123',
    status: overrides.status ?? 'active',
    trial_end: null,
    cancel_at: null,
    canceled_at: null,
    metadata: {
      tenant_id: '00000000-0000-4000-8000-000000000001',
      plan_code: overrides.planCode ?? 'pro-monthly',
    },
    items: {
      data: [
        {
          id: 'si_test_123',
          price: { id: overrides.priceId ?? 'price_pro_monthly_test' },
          current_period_start: now,
          current_period_end: now + 30 * 24 * 3600,
        },
      ],
    },
    ...overrides,
  };
}

/**
 * Constrói uma fixture de `Stripe.Checkout.Session`.
 */
export function makeStripeCheckoutSessionFixture(overrides: {
  id?: string;
  url?: string;
  mode?: 'subscription' | 'payment';
} = {}) {
  return {
    id: overrides.id ?? 'cs_test_123',
    object: 'checkout.session',
    url: overrides.url ?? 'https://checkout.stripe.com/c/pay/cs_test_123',
    mode: overrides.mode ?? 'subscription',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}