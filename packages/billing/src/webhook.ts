/**
 * Verificação de assinatura de webhooks Stripe.
 *
 * Encapsula `Stripe.webhooks.constructEvent` (que faz a verificação
 * HMAC-SHA256 do header `stripe-signature` contra o secret) num wrapper
 * que:
 *   - tipa o resultado como `Stripe.Event` (do SDK)
 *   - normaliza erros para `WebhookSignatureError` (mensagem estável,
 *     status HTTP coerente para o handler Next.js)
 *   - expõe tolerância configurável (defesa contra replay)
 *
 * Refs:
 *   - https://stripe.com/docs/webhooks/signatures
 *   - ADR-003 (Stripe como processador)
 */
import Stripe from 'stripe';
import {
  type StripeWebhookEvent,
  StripeWebhookEventSchema,
} from '@beauty-saas/contracts';

export type { StripeWebhookEvent };

/**
 * Erro de verificação de assinatura. Distinto dos erros de validação
 * de schema (que acontecem depois da verificação passar).
 *
 * Quando este erro é lançado, **não** devemos processar o payload —
 * pode ser ataque. Retornar HTTP 401.
 */
export class WebhookSignatureError extends Error {
  readonly code:
    'missing_signature' | 'invalid_signature' | 'expired' | 'malformed';
  readonly httpStatus = 401;

  constructor(
    code: WebhookSignatureError['code'],
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'WebhookSignatureError';
    this.code = code;
  }
}

export interface WebhookVerificationConfig {
  /** Secret do webhook (whsec_xxx do Stripe Dashboard). */
  readonly secret: string;
  /**
   * Tolerância em segundos para aceitação de timestamps antigos.
   * Default Stripe: 300 (5 min). Recomendamos manter perto disto.
   */
  readonly toleranceSeconds?: number;
}

/**
 * Verifica a assinatura de um webhook Stripe e devolve o evento validado.
 *
 * @throws WebhookSignatureError se a assinatura for inválida, estiver
 *         ausente, ou se o timestamp estiver fora da tolerância.
 *
 * @example
 *   import { verifyWebhook } from '@beauty-saas/billing/webhooks';
 *
 *   export async function POST(req: Request) {
 *     const sig = req.headers.get('stripe-signature') ?? '';
 *     const raw = await req.text();
 *     try {
 *       const event = verifyWebhook(raw, sig, { secret: process.env.STRIPE_WEBHOOK_SECRET! });
 *       // ... dispatch
 *     } catch (err) {
 *       if (err instanceof WebhookSignatureError) {
 *         return Response.json({ error: err.message }, { status: err.httpStatus });
 *       }
 *       throw err;
 *     }
 *   }
 */
export function verifyWebhook(
  rawBody: string,
  signatureHeader: string,
  config: WebhookVerificationConfig,
): Stripe.Event {
  if (!signatureHeader || signatureHeader.trim() === '') {
    throw new WebhookSignatureError(
      'missing_signature',
      'Header stripe-signature ausente ou vazio',
    );
  }

  if (!signatureHeader.includes('=')) {
    throw new WebhookSignatureError(
      'malformed',
      'Header stripe-signature com formato inválido (esperado key=value)',
    );
  }

  try {
    const stripe = new Stripe('sk_dummy_unused_in_verify_only');
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signatureHeader,
      config.secret,
      config.toleranceSeconds,
    );
    return event;
  } catch (err) {
    // O Stripe SDK lança `Stripe.errors.StripeSignatureVerificationError`
    // (com subclasses para "No signatures found" e timestamp expirado).
    // Mapeamos para códigos estáveis.
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('No signatures found')) {
      throw new WebhookSignatureError('malformed', message, err);
    }
    if (message.includes('Timestamp outside the tolerance zone')) {
      throw new WebhookSignatureError('expired', message, err);
    }
    throw new WebhookSignatureError('invalid_signature', message, err);
  }
}

/**
 * Valida que um `Stripe.Event` respeita o subconjunto de campos que o
 * nosso domínio consome. É uma segunda camada — `verifyWebhook` garante
 * autenticidade, este schema garante que o payload tem a forma esperada.
 *
 * Lança `z.ZodError` se falhar (handler deve responder 400 e registar
 * para investigação).
 */
export function parseStripeEvent(event: Stripe.Event): StripeWebhookEvent {
  return StripeWebhookEventSchema.parse(event);
}

/**
 * Union discriminado pelo `type` para handlers tipados.
 * Devolve o evento já validado como um dos schemas conhecidos,
 * ou `null` se for um evento que não estamos a tratar.
 */
export function dispatchKnownEvent(
  event: StripeWebhookEvent,
):
  | { kind: 'subscription.created'; data: StripeWebhookEvent }
  | { kind: 'subscription.updated'; data: StripeWebhookEvent }
  | { kind: 'subscription.deleted'; data: StripeWebhookEvent }
  | { kind: 'invoice.payment_failed'; data: StripeWebhookEvent }
  | { kind: 'invoice.paid'; data: StripeWebhookEvent }
  | { kind: 'checkout.session.completed'; data: StripeWebhookEvent }
  | { kind: 'ignored'; type: string } {
  switch (event.type) {
    case 'customer.subscription.created':
      return { kind: 'subscription.created', data: event };
    case 'customer.subscription.updated':
      return { kind: 'subscription.updated', data: event };
    case 'customer.subscription.deleted':
      return { kind: 'subscription.deleted', data: event };
    case 'invoice.payment_failed':
      return { kind: 'invoice.payment_failed', data: event };
    case 'invoice.paid':
      return { kind: 'invoice.paid', data: event };
    case 'checkout.session.completed':
      return { kind: 'checkout.session.completed', data: event };
    default:
      return { kind: 'ignored', type: event.type };
  }
}
