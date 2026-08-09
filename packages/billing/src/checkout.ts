/**
 * Stripe Checkout Session — fluxo "hosted" para recolha de pagamento.
 *
 * Usado em `/api/billing/checkout` no data plane. Cria uma sessão
 * one-shot ou recurring (subscription mode), devolve o URL para redirect.
 *
 * Pricing:
 *   - priceData para one-shot (pagamento único, ex.: setup fee)
 *   - price/priceId para recurring (subscription)
 *
 * Trial é suportado via Stripe (não confundir com `trial_period_days` —
 * Checkout trata disso automaticamente).
 */
import type Stripe from 'stripe';
import {
  getPlanByCode,
  getStripePriceIdForCode,
} from './plans.js';
import { getStripeClient } from './stripe.js';

export type CheckoutMode = 'subscription' | 'payment';

export interface CheckoutSessionInput {
  readonly tenantId: string;
  readonly customerEmail: string;
  readonly planCode: keyof typeof import('@beauty-saas/contracts').PLAN_CODES;
  readonly mode: CheckoutMode;
  /** Trial days para mode='subscription'. */
  readonly trialDays?: number;
  /** Coupon code opcional. */
  readonly couponCode?: string;
  /** URLs de retorno (obrigatórios). */
  readonly successUrl: string;
  readonly cancelUrl: string;
  /** Metadata adicional (aparece no webhook para reconciliação). */
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface CheckoutSessionResult {
  readonly sessionId: string;
  readonly url: string;
  readonly mode: CheckoutMode;
  readonly expiresAt: Date;
}

/**
 * Cria uma Checkout Session Stripe. Devolve o URL para o UI fazer redirect.
 *
 * @throws Error se `successUrl` ou `cancelUrl` não tiverem placeholders
 *         `{CHECKOUT_SESSION_ID}` (exigência Stripe).
 */
export async function createCheckoutSession(
  input: CheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  validateCheckoutUrls(input.successUrl, input.cancelUrl);

  const def = getPlanByCode(input.planCode);
  const priceId = getStripePriceIdForCode(input.planCode);
  if (!priceId) {
    throw new Error(
      `Plano ${input.planCode} sem Stripe Price ID (env ${def.stripePriceEnvVar} ausente).`,
    );
  }

  const stripe = getStripeClient();
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: input.mode,
    customer_email: input.customerEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.tenantId,
    metadata: {
      ...input.metadata,
      tenant_id: input.tenantId,
      plan_code: def.code,
    },
    subscription_data:
      input.mode === 'subscription'
        ? {
            metadata: {
              ...input.metadata,
              tenant_id: input.tenantId,
              plan_code: def.code,
            },
            trial_period_days: input.trialDays && input.trialDays > 0 ? input.trialDays : undefined,
          }
        : undefined,
  };

  if (input.couponCode) {
    params.discounts = [{ coupon: input.couponCode }];
  }

  const session = await stripe.checkout.sessions.create(params);
  if (!session.url) {
    throw new Error(
      `Stripe Checkout Session ${session.id} criada sem URL — data corruption`,
    );
  }

  return {
    sessionId: session.id,
    url: session.url,
    mode: input.mode,
    expiresAt: new Date(session.expires_at * 1000),
  };
}

/** Stripe exige `{CHECKOUT_SESSION_ID}` nas URLs para substituir no redirect. */
function validateCheckoutUrls(successUrl: string, cancelUrl: string): void {
  if (!successUrl.includes('{CHECKOUT_SESSION_ID}')) {
    throw new Error(
      `successUrl deve conter placeholder {CHECKOUT_SESSION_ID} (Stripe requirement): ${successUrl}`,
    );
  }
  if (!cancelUrl.includes('{CHECKOUT_SESSION_ID}')) {
    throw new Error(
      `cancelUrl deve conter placeholder {CHECKOUT_SESSION_ID} (Stripe requirement): ${cancelUrl}`,
    );
  }
}