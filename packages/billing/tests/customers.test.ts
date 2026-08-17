/**
 * Testes de customers.ts — ensure/find/create com mock do Stripe SDK.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockStripeSdk,
  makeStripeCustomerFixture,
} from './_helpers';

// Mock do stripe.ts antes de importar o módulo que o consome.
const mockSdk = createMockStripeSdk();
vi.mock('../src/stripe.js', () => ({
  getStripeClient: () => mockSdk.sdk,
}));

// Import após mock.
const { ensureCustomerForTenant, createCustomerForTenant, findCustomerByTenantId, DuplicateCustomerError } =
  await import('../src/customers.js');

const TENANT_ID = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
  mockSdk.reset();
  process.env['STRIPE_PRICE_PRO_MONTHLY'] = 'price_pro_monthly_test';
});

afterEach(() => {
  delete process.env['STRIPE_PRICE_PRO_MONTHLY'];
});

describe('findCustomerByTenantId', () => {
  it('devolve customer quando encontrado', async () => {
    const fixture = makeStripeCustomerFixture();
    mockSdk.sdk.customers.list.mockResolvedValue({ data: [fixture], has_more: false });

    const result = await findCustomerByTenantId(TENANT_ID);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('cus_test_123');
    expect(result!.tenantId).toBe(TENANT_ID);
    expect(result!.email).toBe('tenant@example.com');
  });

  it('devolve null quando não existe', async () => {
    mockSdk.sdk.customers.list.mockResolvedValue({ data: [], has_more: false });

    const result = await findCustomerByTenantId(TENANT_ID);
    expect(result).toBeNull();
  });

  it('usa list e filtra metadata UUID sem depender da Search API', async () => {
    const fixture = makeStripeCustomerFixture();
    mockSdk.sdk.customers.list.mockResolvedValue({
      data: [makeStripeCustomerFixture({ id: 'cus_outro', metadata: { tenant_id: 'outro' } }), fixture],
      has_more: false,
    });

    const result = await findCustomerByTenantId(TENANT_ID);

    expect(result?.id).toBe(fixture.id);
    expect(mockSdk.sdk.customers.list).toHaveBeenCalledWith({ limit: 100 });
    expect(mockSdk.sdk.customers.search).not.toHaveBeenCalled();
  });
});

describe('createCustomerForTenant', () => {
  it('cria customer novo', async () => {
    mockSdk.sdk.customers.list.mockResolvedValue({ data: [], has_more: false }); // não existe
    mockSdk.setCreateResult('customers', makeStripeCustomerFixture());

    const result = await createCustomerForTenant({
      tenantId: TENANT_ID,
      email: 'tenant@example.com',
    });
    expect(result.id).toBe('cus_test_123');
    expect(mockSdk.sdk.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'tenant@example.com',
        metadata: expect.objectContaining({ tenant_id: TENANT_ID }),
      }),
    );
  });

  it('lança DuplicateCustomerError se já existir', async () => {
    mockSdk.sdk.customers.list.mockResolvedValue({
      data: [makeStripeCustomerFixture()],
      has_more: false,
    });

    await expect(
      createCustomerForTenant({
        tenantId: TENANT_ID,
        email: 'tenant@example.com',
      }),
    ).rejects.toThrow(DuplicateCustomerError);
  });
});

describe('ensureCustomerForTenant', () => {
  it('devolve existente sem criar novo', async () => {
    const existing = makeStripeCustomerFixture();
    mockSdk.sdk.customers.list.mockResolvedValue({ data: [existing], has_more: false });

    const result = await ensureCustomerForTenant({
      tenantId: TENANT_ID,
      email: 'tenant@example.com',
    });
    expect(result.id).toBe(existing.id);
    expect(mockSdk.sdk.customers.create).not.toHaveBeenCalled();
  });

  it('cria novo se não existir', async () => {
    mockSdk.sdk.customers.list.mockResolvedValue({ data: [], has_more: false });
    mockSdk.setCreateResult('customers', makeStripeCustomerFixture());

    await ensureCustomerForTenant({
      tenantId: TENANT_ID,
      email: 'tenant@example.com',
    });
    expect(mockSdk.sdk.customers.create).toHaveBeenCalled();
  });

  it('actualiza email se mudou', async () => {
    const existing = makeStripeCustomerFixture({ email: 'old@example.com' });
    mockSdk.sdk.customers.list.mockResolvedValue({ data: [existing], has_more: false });
    mockSdk.sdk.customers.update.mockResolvedValue(
      makeStripeCustomerFixture({ email: 'new@example.com' }),
    );

    const result = await ensureCustomerForTenant({
      tenantId: TENANT_ID,
      email: 'new@example.com',
    });
    expect(result.email).toBe('new@example.com');
    expect(mockSdk.sdk.customers.update).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({ email: 'new@example.com' }),
    );
  });
});