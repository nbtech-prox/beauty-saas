/**
 * Subscription lifecycle — criar e cancelar.
 *
 * O `createSubscriptionForTenant()` orquestra: customer (ensure) + price
 * lookup + Stripe API call. Idempotente a nível de customer.
 *
 * Trial e coupon são opcionais. Trial days vão para `trial_period_days`
 * na Stripe Subscription. Coupon é resolvido por `couponCode` → `coupon_xxx`
 * via `promotion_codes.list` (Stripe trata coupon codes como promotion codes).
 */
import type Stripe from 'stripe';
import { type SubscriptionStatus } from '@beauty-saas/contracts';
import { ensureCustomerForTenant } from './customers.js';
import {
  type PlanDefinition,
  getPlanByCode,
  getStripePriceIdForCode,
} from './plans.js';
import { getStripeClient } from './stripe.js';

export interface CreateSubscriptionInput {
  readonly tenantId: string;
  readonly customerEmail: string;
  readonly customerName?: string;
  readonly planCode: keyof typeof import('@beauty-saas/contracts').PLAN_CODES;
  /** Trial days (0..90). Default 0 (sem trial). */
  readonly trialDays?: number;
  /** Coupon code opcional (ex.: 'LAUNCH20'). */
  readonly couponCode?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Cancellation feedback options. `comment` é texto livre, `feedback` é
 * uma das categorias normalizadas que o Stripe agrega nos dashboards.
 */
export type CancellationFeedback =
  | 'customer_service'
  | 'low_quality'
  | 'missing_features'
  | 'other'
  | 'switched_service'
  | 'too_complex'
  | 'too_expensive'
  | 'unused';

export interface SubscriptionRecord {
  readonly id: string; // sub_xxx
  readonly customerId: string; // cus_xxx
  readonly planCode: keyof typeof import('@beauty-saas/contracts').PLAN_CODES;
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date;
  readonly trialEnd: Date | null;
  readonly cancelAt: Date | null;
  readonly canceledAt: Date | null;
  readonly priceId: string;
}

/**
 * Cria uma subscription Stripe para um tenant num plano.
 * Faz ensure do customer automaticamente.
 */
export async function createSubscriptionForTenant(
  input: CreateSubscriptionInput,
): Promise<SubscriptionRecord> {
  const def = getPlanByCode(input.planCode);
  const priceId = getStripePriceIdForCode(input.planCode);
  if (!priceId) {
    throw new SubscriptionConfigError(
      `Plano ${input.planCode} sem Stripe Price ID configurado (env var ausente).`,
      def.stripePriceEnvVar,
    );
  }

  const customer = await ensureCustomerForTenant({
    tenantId: input.tenantId,
    email: input.customerEmail,
    name: input.customerName,
    metadata: input.metadata,
  });

  const stripe = getStripeClient();
  const params: Stripe.SubscriptionCreateParams = {
    customer: customer.id,
    items: [{ price: priceId, quantity: 1 }],
    payment_behavior: 'default_incomplete',
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    metadata: {
      ...input.metadata,
      tenant_id: input.tenantId,
      plan_code: def.code,
    },
    expand: ['latest_invoice.payment_intent'],
  };

  if (input.trialDays && input.trialDays > 0) {
    params.trial_period_days = input.trialDays;
  }

  if (input.couponCode) {
    // Stripe v19+: promotion_code vai dentro de `discounts[]`, não top-level.
    params.discounts = [{ promotion_code: await resolvePromotionCode(input.couponCode) }];
  }

  const sub = await stripe.subscriptions.create(params);
  return toSubscriptionRecord(sub, def, priceId);
}

/**
 * Cancela uma subscription no fim do período actual (sem corte imediato).
 * Devolve o registo actualizado.
 *
 * Se quiser cancel imediato, passa `atPeriodEnd: false` — útil em
 * right-to-erasure / GDPR.
 */
export interface CancelSubscriptionOptions {
  /** true (default) = cancela no fim do período. false = imediato. */
  readonly atPeriodEnd?: boolean;
  /** Categoria opcional do Stripe (aparece nos dashboards de churn). */
  readonly feedback?: CancellationFeedback;
  /** Comentário livre. */
  readonly comment?: string;
}

export async function cancelSubscription(
  subscriptionId: string,
  options: CancelSubscriptionOptions = {},
): Promise<SubscriptionRecord> {
  const stripe = getStripeClient();
  const details = buildCancellationDetails(options);

  if (options.atPeriodEnd === false) {
    const sub = await stripe.subscriptions.cancel(subscriptionId, {
      cancellation_details: details,
    });
    const def = inferPlanFromSubscription(sub);
    return toSubscriptionRecord(sub, def, getCurrentPriceId(sub));
  }

  // Default: cancel at period end (soft cancel).
  const sub = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
    cancellation_details: details,
  });
  const def = inferPlanFromSubscription(sub);
  return toSubscriptionRecord(sub, def, getCurrentPriceId(sub));
}

function buildCancellationDetails(
  options: CancelSubscriptionOptions,
): Stripe.SubscriptionCancelParams.CancellationDetails | undefined {
  if (!options.feedback && !options.comment) return undefined;
  const details: Stripe.SubscriptionCancelParams.CancellationDetails = {};
  if (options.feedback) details.feedback = options.feedback;
  if (options.comment) details.comment = options.comment;
  return details;
}

/**
 * Reactivar uma subscription que estava `cancel_at_period_end: true`.
 * Stripe remove a flag e a subscription continua a renovar.
 */
export async function reactivateSubscription(
  subscriptionId: string,
): Promise<SubscriptionRecord> {
  const stripe = getStripeClient();
  const sub = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
  const def = inferPlanFromSubscription(sub);
  return toSubscriptionRecord(sub, def, getCurrentPriceId(sub));
}

/** Lê uma subscription por ID. */
export async function getSubscription(
  subscriptionId: string,
): Promise<SubscriptionRecord> {
  const stripe = getStripeClient();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const def = inferPlanFromSubscription(sub);
  return toSubscriptionRecord(sub, def, getCurrentPriceId(sub));
}

/** Lista todas as subscriptions activas de um tenant. */
export async function listActiveSubscriptionsForTenant(
  tenantId: string,
): Promise<readonly SubscriptionRecord[]> {
  const stripe = getStripeClient();
  const subs = await stripe.subscriptions.search({
    query: `status:'active' OR status:'trialing' OR status:'past_due' AND metadata['tenant_id']:'${tenantId}'`,
    limit: 100,
  });

  return subs.data.map((sub) => {
    const def = inferPlanFromSubscription(sub);
    return toSubscriptionRecord(sub, def, getCurrentPriceId(sub));
  });
}

// ─── helpers internos ────────────────────────────────────────────────────────

/** Mapeia Stripe Subscription → domain. */
function toSubscriptionRecord(
  sub: Stripe.Subscription,
  def: PlanDefinition | null,
  priceId: string,
): SubscriptionRecord {
  // Stripe v19+: current_period_* estão no SubscriptionItem, não no Subscription.
  const item = sub.items.data[0];
  if (!item) {
    throw new Error(`Subscription ${sub.id} sem items — data corruption`);
  }
  return {
    id: sub.id,
    customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    // Fallback para 'proMonthly' se metadata estiver missing (Stripe edge case).
    planCode: (def?.code ?? 'proMonthly') as keyof typeof import('@beauty-saas/contracts').PLAN_CODES,
    status: mapStripeStatus(sub.status),
    currentPeriodStart: new Date(item.current_period_start * 1000),
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
    canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    priceId,
  };
}

function mapStripeStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  // Stripe adicionou 'incomplete_expired' em 2022 — não está no nosso
  // enum (consideramos 'canceled'). Casos edge mantêm-se como está.
  switch (status) {
    case 'incomplete':
    case 'incomplete_expired':
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'unpaid':
    case 'paused':
      return status as SubscriptionStatus;
    default: {
      // Exaustivo: TS garante que cobrimos todos os valores do enum Stripe.
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function getCurrentPriceId(sub: Stripe.Subscription): string {
  const item = sub.items.data[0];
  if (!item) {
    throw new Error(`Subscription ${sub.id} sem items — data corruption`);
  }
  return typeof item.price === 'string' ? item.price : item.price.id;
}

function inferPlanFromSubscription(
  sub: Stripe.Subscription,
): PlanDefinition | null {
  const planCode = sub.metadata?.['plan_code'];
  if (!planCode) return null;
  return getPlanByCode(planCode as keyof typeof import('@beauty-saas/contracts').PLAN_CODES);
}

async function resolvePromotionCode(code: string): Promise<string> {
  const stripe = getStripeClient();
  const result = await stripe.promotionCodes.list({
    code,
    active: true,
    limit: 1,
  });
  const promo = result.data[0];
  if (!promo) {
    throw new SubscriptionConfigError(
      `Coupon code '${code}' não existe ou não está activo no Stripe.`,
    );
  }
  return promo.id;
}

export class SubscriptionConfigError extends Error {
  readonly httpStatus = 500;
  constructor(
    message: string,
    readonly envVar?: string,
  ) {
    super(message);
    this.name = 'SubscriptionConfigError';
  }
}