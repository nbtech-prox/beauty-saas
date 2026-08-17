/**
 * API Route: POST /api/billing/webhook
 *
 * Endpoint para receber webhooks Stripe. Verifica a assinatura HMAC,
 * regista o evento em `webhook_events` de forma idempotente (UNIQUE em
 * (provider, event_id)) e aplica os efeitos de negócio
 * (`subscriptions` + `tenants.status` + `audit_logs`) numa única
 * transacção. Só devolve 200 após COMMIT.
 *
 * Headers HTTP esperados:
 *   stripe-signature: t=...,v1=...
 *   content-type:    application/json
 *
 * Returns:
 *   200 — evento aceite (verificado e processado ou deduplicado)
 *   400 — body inválido ou schema Zod falhou
 *   401 — assinatura inválida (Stripe reentrega respostas não-2xx; investigar)
 *   500 — erro de configuração ou de processamento
 */
import { NextResponse } from 'next/server';
import {
  verifyWebhook,
  WebhookSignatureError,
  dispatchKnownEvent,
  parseStripeEvent,
} from '@beauty-saas/billing/webhooks';
import {
  getWebhookSecret,
  StripeConfigError,
} from '@beauty-saas/billing/stripe';
import { ZodError } from 'zod';
import { closePool, getPool } from '@/lib/database/postgres';
import { processStripeWebhook } from '@/lib/billing/process-stripe-event';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Ler raw body (obrigatório para verificar assinatura).
  const rawBody = await request.text();

  // 2. Extrair signature header.
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Header stripe-signature ausente' },
      { status: 400 },
    );
  }

  // 3. Verificar assinatura via @beauty-saas/billing.
  let event;
  try {
    const secret = getWebhookSecret();
    event = verifyWebhook(rawBody, signature, {
      secret,
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
      return NextResponse.json(
        { error: err.message },
        { status: err.httpStatus },
      );
    }
    if (err instanceof StripeConfigError) {
      // Configuração errada — devolver 500 para indicar uma falha interna.
      console.error('[billing/webhook] config error', {
        name: err.name,
      });
      return NextResponse.json(
        { error: 'Configuração interna de billing inválida' },
        { status: 500 },
      );
    }
    throw err;
  }

  // 4. Validar o subset do evento consumido pelo domínio.
  let parsedEvent;
  try {
    parsedEvent = parseStripeEvent(event);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: 'Payload de webhook inválido' },
        { status: 400 },
      );
    }
    throw err;
  }

  // 5. Dispatch discriminado. Eventos não conhecidos são acknowledged
  //    (não queremos acumular backlog no Stripe Dashboard) mas marcados
  //    como `ignored`.
  const dispatched = dispatchKnownEvent(parsedEvent);

  // 6. Persistência transaccional idempotente.
  let result;
  try {
    const pool = await getPool();
    result = await processStripeWebhook(pool, parsedEvent, dispatched.kind);
  } catch (err) {
    console.error('[billing/webhook] processing error', {
      id: parsedEvent.id,
      type: parsedEvent.type,
      message: err instanceof Error ? err.message : String(err),
    });
    await closePool().catch(() => undefined);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }

  // 7. Log estruturado.
  console.info('[billing/webhook] event processed', {
    id: parsedEvent.id,
    type: parsedEvent.type,
    livemode: parsedEvent.livemode,
    dispatch: dispatched.kind,
    deduped: result.kind === 'deduped',
  });

  // 8. ACK 200 — Stripe considera falha após 30s sem resposta.
  return NextResponse.json(
    {
      received: true,
      dispatch: dispatched.kind,
      deduped: result.kind === 'deduped',
    },
    { status: 200 },
  );
}
