/**
 * Testes de portal.ts — Customer Portal session.
 */
import { describe, expect, it, vi } from 'vitest';
import { createMockStripeSdk } from './_helpers';

const mockSdk = createMockStripeSdk();
vi.mock('../src/stripe.js', () => ({
  getStripeClient: () => mockSdk.sdk,
}));

const { createPortalSession } = await import('../src/portal.js');

describe('createPortalSession', () => {
  it('cria portal session com customer + return_url', async () => {
    mockSdk.sdk.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.com/portal/cus_123',
      created: Math.floor(Date.now() / 1000),
    });

    const result = await createPortalSession({
      customerId: 'cus_test_123',
      returnUrl: 'https://app.example.com/billing',
    });
    expect(result.url).toContain('billing.stripe.com');
    expect(mockSdk.sdk.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_test_123',
        return_url: 'https://app.example.com/billing',
      }),
    );
  });

  it('passa flow_data subscription_cancel quando fornecido', async () => {
    mockSdk.sdk.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.com/portal/cancel',
      created: Math.floor(Date.now() / 1000),
    });

    await createPortalSession({
      customerId: 'cus_test_123',
      returnUrl: 'https://app.example.com/billing',
      flow: {
        type: 'subscription_cancel',
        subscriptionId: 'sub_test_abc',
      },
    });
    expect(mockSdk.sdk.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        flow_data: expect.objectContaining({
          type: 'subscription_cancel',
          subscription_cancel: expect.objectContaining({
            subscription: 'sub_test_abc',
          }),
        }),
      }),
    );
  });

  it('omite flow_data quando flow não fornecido', async () => {
    mockSdk.sdk.billingPortal.sessions.create.mockResolvedValue({
      url: 'https://billing.stripe.com/portal/x',
      created: Math.floor(Date.now() / 1000),
    });

    await createPortalSession({
      customerId: 'cus_test_123',
      returnUrl: 'https://app.example.com/billing',
    });
    const call = mockSdk.sdk.billingPortal.sessions.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(call['flow_data']).toBeUndefined();
  });
});