import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { StripeConfigError } from '@beauty-saas/billing/stripe';
import { WebhookSignatureError } from '@beauty-saas/billing/webhooks';

const { dispatchKnownEvent, parseStripeEvent, verifyWebhook } = vi.hoisted(
  () => ({
    dispatchKnownEvent:
      vi.fn<
        (typeof import('@beauty-saas/billing/webhooks'))['dispatchKnownEvent']
      >(),
    parseStripeEvent:
      vi.fn<
        (typeof import('@beauty-saas/billing/webhooks'))['parseStripeEvent']
      >(),
    verifyWebhook: vi.fn(),
  }),
);

const { getWebhookSecret } = vi.hoisted(() => ({
  getWebhookSecret:
    vi.fn<(typeof import('@beauty-saas/billing/stripe'))['getWebhookSecret']>(),
}));

vi.mock('@beauty-saas/billing/webhooks', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@beauty-saas/billing/webhooks')>();
  return {
    ...actual,
    dispatchKnownEvent,
    parseStripeEvent,
    verifyWebhook,
  };
});

vi.mock('@beauty-saas/billing/stripe', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@beauty-saas/billing/stripe')>();
  return {
    ...actual,
    getWebhookSecret,
  };
});

// `vi.mock` é hoistado e global, mas podemos delegar a implementação
// para uma closure partilhada com os testes via `vi.hoisted`. Os testes
// mockados chamam `processStripeWebhookMock.mockResolvedValue(...)` para
// obter respostas previsíveis; os testes de integração (no fim do
// ficheiro) chamam `vi.doUnmock("@/lib/billing/process-stripe-event")`
// e re-importam o módulo para usar a implementação real.
const { processStripeWebhookMock } = vi.hoisted(() => ({
  processStripeWebhookMock:
    vi.fn<
      typeof import('@/lib/billing/process-stripe-event').processStripeWebhook
    >(),
}));

vi.mock('@/lib/database/postgres', () => ({
  // Devolve um client dummy porque o caminho mock delega ao processStripeWebhook
  // (também mockado); os testes deste ficheiro não acedem à DB.
  getPool: () => Promise.resolve({} as never),
  closePool: () => Promise.resolve(),
  _resetPoolForTesting: () => undefined,
}));

vi.mock('@/lib/billing/process-stripe-event', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/billing/process-stripe-event')
  >('@/lib/billing/process-stripe-event');
  return {
    ...actual,
    processStripeWebhook: processStripeWebhookMock,
  };
});

const { POST } = await import('./route');

const verifiedEvent = {
  id: 'evt_verified',
  object: 'event' as const,
  type: 'invoice.paid',
  api_version: null,
  created: 1,
  livemode: false,
  data: { object: {}, previous_attributes: null },
  request: null,
};

const parsedEvent: ReturnType<
  (typeof import('@beauty-saas/billing/webhooks'))['parseStripeEvent']
> = {
  ...verifiedEvent,
  id: 'evt_parsed',
};

function webhookRequest(): Request {
  return new Request('http://localhost/api/billing/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': 't=1,v1=valid',
    },
    body: JSON.stringify(verifiedEvent),
  });
}

describe('POST /api/billing/webhook', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    dispatchKnownEvent.mockReset();
    getWebhookSecret.mockReset();
    parseStripeEvent.mockReset();
    verifyWebhook.mockReset();
    processStripeWebhookMock.mockReset();
    getWebhookSecret.mockReturnValue('whsec_test');
    verifyWebhook.mockReturnValue(verifiedEvent);
    // Default para os testes mockados: o processador devolve 'processed'.
    processStripeWebhookMock.mockResolvedValue({
      kind: 'processed',
      dispatch: 'invoice.paid',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('responde 500 genérico sem processar quando a configuração é inválida', async () => {
    getWebhookSecret.mockImplementation(() => {
      throw new StripeConfigError('STRIPE_WEBHOOK_SECRET=whsec_sensitive');
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Configuração interna de billing inválida',
    });
    expect(verifyWebhook).not.toHaveBeenCalled();
    expect(parseStripeEvent).not.toHaveBeenCalled();
    expect(dispatchKnownEvent).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      '[billing/webhook] config error',
      { name: 'StripeConfigError' },
    );
  });

  it('responde 401 sem validar nem fazer dispatch quando a assinatura é inválida', async () => {
    verifyWebhook.mockImplementation(() => {
      throw new WebhookSignatureError(
        'invalid_signature',
        'Assinatura Stripe inválida',
      );
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Assinatura Stripe inválida',
    });
    expect(getWebhookSecret).toHaveBeenCalledOnce();
    expect(verifyWebhook).toHaveBeenCalledWith(
      JSON.stringify(verifiedEvent),
      't=1,v1=valid',
      { secret: 'whsec_test', toleranceSeconds: 300 },
    );
    expect(parseStripeEvent).not.toHaveBeenCalled();
    expect(dispatchKnownEvent).not.toHaveBeenCalled();
  });

  it('responde 400 sem fazer dispatch quando o schema Zod é inválido', async () => {
    parseStripeEvent.mockImplementation(() => {
      throw z.object({ required: z.string() }).parse({});
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Payload de webhook inválido',
    });
    expect(parseStripeEvent).toHaveBeenCalledWith(verifiedEvent);
    expect(dispatchKnownEvent).not.toHaveBeenCalled();
  });

  it('faz dispatch do evento devolvido pela validação Zod', async () => {
    parseStripeEvent.mockReturnValue(parsedEvent);
    dispatchKnownEvent.mockReturnValue({
      kind: 'invoice.paid',
      data: parsedEvent,
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(getWebhookSecret).toHaveBeenCalledOnce();
    expect(verifyWebhook).toHaveBeenCalledWith(
      JSON.stringify(verifiedEvent),
      't=1,v1=valid',
      { secret: 'whsec_test', toleranceSeconds: 300 },
    );
    expect(parseStripeEvent).toHaveBeenCalledWith(verifiedEvent);
    expect(dispatchKnownEvent).toHaveBeenCalledWith(parsedEvent);
    const callOrder = [
      getWebhookSecret.mock.invocationCallOrder[0],
      verifyWebhook.mock.invocationCallOrder[0],
      parseStripeEvent.mock.invocationCallOrder[0],
      dispatchKnownEvent.mock.invocationCallOrder[0],
    ].filter((order): order is number => order !== undefined);
    expect(callOrder).toHaveLength(4);
    expect(callOrder).toEqual(
      [...callOrder].sort((left, right) => left - right),
    );
    expect(console.info).toHaveBeenCalledWith(
      '[billing/webhook] event processed',
      {
        id: 'evt_parsed',
        type: 'invoice.paid',
        livemode: false,
        dispatch: 'invoice.paid',
        deduped: false,
      },
    );
    await expect(response.json()).resolves.toEqual({
      received: true,
      dispatch: 'invoice.paid',
      deduped: false,
    });
  });

  it('devolve 500 quando o processador de persistência falha', async () => {
    parseStripeEvent.mockReturnValue(parsedEvent);
    dispatchKnownEvent.mockReturnValue({
      kind: 'subscription.created',
      data: parsedEvent,
    });
    // Força o processador a falhar para validar o caminho de fallback 500.
    processStripeWebhookMock.mockRejectedValueOnce(
      new Error('DB indisponível'),
    );

    const response = await POST(webhookRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Erro interno',
    });
  });
});
