/**
 * API Route: POST /api/billing/webhook
 *
 * Endpoint para receber webhooks Stripe. Verifica a assinatura HMAC
 * e devolve 200 OK após log estruturado. A lógica de negócio (criar
 * tenant, activar subscription) será adicionada em FASE posterior
 * quando tivermos o data plane com a tabela webhook_events.
 *
 * Por agora, **fazemos apenas verificação + log + ACK 200** para que
 * o `stripe listen` e o Stripe Dashboard consigam entregar eventos sem
 * timeout.
 *
 * Headers HTTP esperados:
 *   stripe-signature: t=...,v1=...
 *   content-type:    application/json
 *
 * Returns:
 *   200 — evento aceite (verificado)
 *   400 — body inválido ou schema Zod falhou
 *   401 — assinatura inválida (NÃO reentregar; investigar)
 */
import { NextResponse } from 'next/server';
import {
  verifyWebhook,
  WebhookSignatureError,
  dispatchKnownEvent,
} from '@beauty-saas/billing/webhooks';
import { StripeConfigError } from '@beauty-saas/billing/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Ler raw body (obrigatório para verificar assinatura).
  const rawBody = await request.text();

  // 2. Extrair signature header.
  const signature =
    request.headers.get('stripe-signature') ?? request.headers.get('Stripe-Signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Header stripe-signature ausente' },
      { status: 400 },
    );
  }

  // 3. Verificar assinatura via @beauty-saas/billing.
  let event;
  try {
    event = verifyWebhook(rawBody, signature, {
      secret: process.env['STRIPE_WEBHOOK_SECRET'] ?? '',
      toleranceSeconds: 300,
    });
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      // 401 — Stripe vai tentar novamente. Log estruturado para detectar
      // tentativas de ataque ou configuração errada.
      console.warn('[billing/webhook] signature error', {
        code: err.code,
        message: err.message,
        httpStatus: err.httpStatus,
      });
      return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    }
    if (err instanceof StripeConfigError) {
      // Configuração errada — não devolver 401 (Stripe não reentregaria).
      const cfgErr = err as StripeConfigError;
      console.error('[billing/webhook] config error', { message: cfgErr.message });
      return NextResponse.json({ error: cfgErr.message }, { status: 500 });
    }
    throw err;
  }

  // 4. Dispatch discriminado. Eventos não conhecidos são acknowledged
  //    (não queremos acumular backlog no Stripe Dashboard) mas marcados
  //    como `ignored`.
  const dispatched = dispatchKnownEvent(event as never);

  // 5. Log estruturado. Quando integrarmos com a tabela webhook_events,
  //    substituímos isto por um INSERT idempotente.
  console.info('[billing/webhook] event received', {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    dispatch: dispatched.kind,
  });

  // 6. ACK 200 imediato. Stripe considera falha após 30s sem resposta.
  return NextResponse.json({ received: true, dispatch: dispatched.kind }, { status: 200 });
}