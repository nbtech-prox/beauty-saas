/**
 * Customer Portal — Stripe-hosted UI para o cliente gerir a subscription.
 *
 * O portal permite ao tenant:
 *   - actualizar método de pagamento
 *   - ver faturas e receipts
 *   - cancelar subscription
 *   - actualizar info de billing
 *
 * Tudo no domínio do Stripe — não precisamos replicar UI.
 */
import type Stripe from 'stripe';
import { getStripeClient } from './stripe';

export interface PortalSessionInput {
  /** Stripe customer ID (cus_xxx). */
  readonly customerId: string;
  /** URL de retorno quando o utilizador fecha o portal. */
  readonly returnUrl: string;
  /** Configuração opcional (só permite cancel, etc.). */
  readonly flow?: {
    readonly type: 'subscription_cancel';
    readonly subscriptionId: string;
  };
}

export interface PortalSessionResult {
  readonly url: string;
  readonly expiresAt: Date | null; // Portal sessions não expiram tecnicamente
}

export async function createPortalSession(
  input: PortalSessionInput,
): Promise<PortalSessionResult> {
  const stripe = getStripeClient();

  const params: Stripe.BillingPortal.SessionCreateParams = {
    customer: input.customerId,
    return_url: input.returnUrl,
    flow_data:
      input.flow?.type === 'subscription_cancel'
        ? {
            type: 'subscription_cancel',
            subscription_cancel: {
              subscription: input.flow.subscriptionId,
            },
          }
        : undefined,
  };

  const session = await stripe.billingPortal.sessions.create(params);

  return {
    url: session.url,
    expiresAt: session.created ? new Date(session.created * 1000) : null,
  };
}