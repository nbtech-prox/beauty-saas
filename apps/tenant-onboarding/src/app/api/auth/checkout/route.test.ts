/**
 * Testes do endpoint POST /api/auth/checkout.
 *
 * Cobre:
 *  - 401 sem cookie de sessão
 *  - 400 com planCode inválido
 *  - 200 com { url, sessionId, mode, expiresAt } quando billing cria sessão
 *
 * Estratégia:
 *  - mock `@beauty-saas/billing::createCheckoutSession`
 *  - cookie gerado por `createSession` é usado
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createCheckoutSessionMock } = vi.hoisted(() => ({
  createCheckoutSessionMock: vi.fn(),
}));

vi.mock('@beauty-saas/billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@beauty-saas/billing')>();
  return {
    ...actual,
    createCheckoutSession: createCheckoutSessionMock,
  };
});

const { POST } = await import('./route');
const { createSession } = await import('@/lib/auth/session');

const TEST_SECRET = 'unit-test-secret-32bytes-or-more-OK-1234567890abcdef';

function validBody(
  overrides: Partial<{ planCode: string; trialDays: number }> = {},
) {
  return JSON.stringify({
    planCode: 'pro-monthly',
    trialDays: 14,
    ...overrides,
  });
}

function postRequest(body: string | undefined, cookieValue?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cookieValue) headers.set('cookie', `onboarding_session=${cookieValue}`);
  return new Request('http://localhost/api/auth/checkout', {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /api/auth/checkout', () => {
  beforeEach(() => {
    process.env['ONBOARDING_SESSION_SECRET'] = TEST_SECRET;
    createCheckoutSessionMock.mockReset();
    createCheckoutSessionMock.mockResolvedValue({
      sessionId: 'cs_test_123',
      url: 'https://stripe.com/checkout/cs_test_123',
      mode: 'subscription',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('devolve 401 sem cookie de sessão', async () => {
    const response = await POST(postRequest(validBody()));
    expect(response.status).toBe(401);
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('devolve 400 com body JSON inválido', async () => {
    const { cookieValue } = await createSession({
      sub: '00000000-0000-4000-8000-0000000000aa',
      tenantId: '00000000-0000-4000-8000-000000000099',
    });
    const response = await POST(postRequest('not-json', cookieValue));
    expect(response.status).toBe(400);
  });

  it('devolve 400 com planCode inválido', async () => {
    const { cookieValue } = await createSession({
      sub: '00000000-0000-4000-8000-0000000000aa',
      tenantId: '00000000-0000-4000-8000-000000000099',
    });
    const response = await POST(
      postRequest(validBody({ planCode: 'starter-forever' }), cookieValue),
    );
    expect(response.status).toBe(400);
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('devolve 200 e devolve { url, sessionId } quando billing OK', async () => {
    const { cookieValue } = await createSession({
      sub: '00000000-0000-4000-8000-0000000000aa',
      tenantId: '00000000-0000-4000-8000-000000000099',
    });
    const response = await POST(postRequest(validBody(), cookieValue));
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      url: string;
      sessionId: string;
    };
    expect(json.url).toBe('https://stripe.com/checkout/cs_test_123');
    expect(json.sessionId).toBe('cs_test_123');
    expect(createCheckoutSessionMock).toHaveBeenCalledTimes(1);
  });

  it('passa tenantId, planCode e trialDays correctos ao billing', async () => {
    const { cookieValue } = await createSession({
      sub: '00000000-0000-4000-8000-0000000000aa',
      tenantId: '00000000-0000-4000-8000-000000000099',
    });
    await POST(postRequest(validBody({ trialDays: 7 }), cookieValue));
    const args = createCheckoutSessionMock.mock.calls[0]?.[0] as {
      tenantId: string;
      planCode: string;
      trialDays?: number;
      mode: string;
      customerEmail?: string;
    };
    expect(args.tenantId).toBe('00000000-0000-4000-8000-000000000099');
    expect(args.planCode).toBe('pro-monthly');
    expect(args.trialDays).toBe(7);
    expect(args.mode).toBe('subscription');
  });

  it('devolve 502 quando billing lança erro', async () => {
    createCheckoutSessionMock.mockRejectedValueOnce(
      new Error('Stripe indisponível'),
    );
    const { cookieValue } = await createSession({
      sub: '00000000-0000-4000-8000-0000000000aa',
      tenantId: '00000000-0000-4000-8000-000000000099',
    });
    const response = await POST(postRequest(validBody(), cookieValue));
    expect(response.status).toBe(502);
  });
});
