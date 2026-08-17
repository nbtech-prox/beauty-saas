/**
 * Subscription lifecycle — criar, ler, listar, cancelar e reactivar.
 *
 * O `createSubscriptionForTenant()` orquestra: customer (ensure) + price
 * lookup + Stripe API call + reconciliação. Idempotente a nível de customer.
 *
 * Trial e coupon são opcionais. Trial days vão para `trial_period_days`
 * na Stripe Subscription. Coupon é resolvido por `couponCode` → `coupon_xxx`
 * via `promotion_codes.list` (Stripe trata coupon codes como promotion codes).
 *
 * ## Reconciliação Price ID ↔ plan_code
 *
 * Após cada chamada ao Stripe (create / retrieve / search / update / cancel),
 * inferimos o plano a partir da metadata da subscription e validamos contra o
 * Price ID devolvido. Se o preço não estiver mapeado para um plano ou se os
 * dois identificadores divergirem, lançamos `SubscriptionReconciliationError`
 * com `reason` tipado (closed-set). **Nunca** silenciosamente se assume um
 * plano por defeito — uma subscription sem plano identificável é um data
 * corruption, não um caso de "default".
 */
import type Stripe from 'stripe';
import { type PlanCode, type SubscriptionStatus } from '@beauty-saas/contracts';
import { ensureCustomerForTenant } from './customers';
import {
  type PlanDefinition,
  getPlanByCode,
  getPlanByStripePriceId,
  getStripePriceIdForCode,
  tryGetPlanByCode,
} from './plans';
import { resolvePromotionCodeId } from './promotion-codes';
import { getStripeClient } from './stripe';
import { assertValidTenantId } from './tenant-id';

export interface CreateSubscriptionInput {
  readonly tenantId: string;
  readonly customerEmail: string;
  readonly customerName?: string;
  readonly planCode: PlanCode;
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
  readonly planCode: PlanCode;
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date;
  readonly trialEnd: Date | null;
  readonly cancelAt: Date | null;
  readonly canceledAt: Date | null;
  /** Stripe Price ID (`price_xxx`) actualmente associado à subscription. */
  readonly stripePriceId: string;
}

/**
 * Reasons estáveis para `SubscriptionReconciliationError.code` + `.reason`.
 *
 * Usar um closed-set (string-literal-union) para que o consumidor consiga
 * fazer `switch (err.reason)` exaustivo em vez de match em strings livres.
 */
export type SubscriptionReconciliationReason =
  /** metadata.plan_code ausente na subscription. */
  | 'missing_plan_code'
  /** metadata.plan_code presente mas string vazia. */
  | 'invalid_plan_code'
  /** metadata.plan_code presente mas não existe no PLAN_CODES. */
  | 'unknown_plan_code'
  /** Price ID devolvido pelo Stripe não está mapeado em env var. */
  | 'unknown_price_id'
  /** metadata.plan_code e Price ID apontam para planos diferentes. */
  | 'price_plan_mismatch'
  /** metadata.plan_code diverge do `planCode` solicitado em input. */
  | 'plan_code_mismatch';

/**
 * Lançado quando a reconciliação entre o estado devolvido pelo Stripe
 * (Price ID + metadata) e o nosso registry interno falha.
 *
 * Nunca substituir por um fallback silencioso — se não conseguimos
 * reconciliar, a subscription não é confiável.
 */
export class SubscriptionReconciliationError extends Error {
  readonly code = 'subscription_reconciliation_failed' as const;
  readonly httpStatus = 500 as const;

  constructor(
    message: string,
    readonly reason: SubscriptionReconciliationReason,
    readonly subscriptionId?: string,
    readonly stripePriceId?: string,
    readonly planCode?: string,
  ) {
    super(message);
    this.name = 'SubscriptionReconciliationError';
  }
}

/**
 * Lançado quando a paginação manual do `subscriptions.search` não converge
 * (ex.: Stripe repete o mesmo `next_page`). Erro estável para alertar sobre
 * possível loop infinito ou contract change do Stripe.
 */
export class SubscriptionPaginationError extends Error {
  readonly code = 'subscription_pagination_stalled' as const;
  readonly httpStatus = 500 as const;

  constructor(
    message: string,
    readonly status: string,
    readonly cursor: string,
  ) {
    super(message);
    this.name = 'SubscriptionPaginationError';
  }
}

/**
 * Cria uma subscription Stripe para um tenant num plano.
 *
 * Faz ensure do customer automaticamente e reconcilia o resultado
 * (Price ID + metadata.plan_code + plano solicitado) antes de devolver.
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
    params.discounts = [
      { promotion_code: await resolvePromotionCodeId(input.couponCode) },
    ];
  }

  const sub = await stripe.subscriptions.create(params);
  return toSubscriptionRecord(sub, { requestedPlanCode: input.planCode });
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
    return toSubscriptionRecord(sub);
  }

  // Default: cancel at period end (soft cancel).
  const sub = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
    cancellation_details: details,
  });
  return toSubscriptionRecord(sub);
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
  return toSubscriptionRecord(sub);
}

/** Lê uma subscription por ID. */
export async function getSubscription(
  subscriptionId: string,
): Promise<SubscriptionRecord> {
  const stripe = getStripeClient();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  return toSubscriptionRecord(sub);
}

/**
 * Lista todas as subscriptions activas (active + trialing + past_due)
 * de um tenant.
 *
 * - Valida `tenantId` como UUID antes de tocar no Stripe.
 * - Faz 3 chamadas paralelas, uma por estado, cada uma com o filtro
 *   obrigatório `metadata['tenant_id']='${tenantId}'` para evitar data
 *   leak entre tenants.
 * - Pagina manualmente cada estado por `next_page` com `seenPages` para
 *   detectar loops e falhar com `SubscriptionPaginationError`.
 * - Reconcilia cada subscription antes de devolver; a primeira falha
 *   propaga-se.
 */
export async function listActiveSubscriptionsForTenant(
  tenantId: string,
): Promise<readonly SubscriptionRecord[]> {
  assertValidTenantId(tenantId);
  const stripe = getStripeClient();

  const statuses = ['active', 'trialing', 'past_due'] as const;
  const perStatusResults = await Promise.all(
    statuses.map((status) =>
      collectSubscriptionsForStatus(stripe, status, tenantId),
    ),
  );
  const subs = perStatusResults.flat();
  return subs.map((sub) => toSubscriptionRecord(sub));
}

async function collectSubscriptionsForStatus(
  stripe: Stripe,
  status: 'active' | 'trialing' | 'past_due',
  tenantId: string,
): Promise<readonly Stripe.Subscription[]> {
  const collected: Stripe.Subscription[] = [];
  const seenPages = new Set<string>();
  let cursor: string | undefined;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (cursor !== undefined && seenPages.has(cursor)) {
      throw new SubscriptionPaginationError(
        `Stripe repetiu o cursor '${cursor}' para status '${status}' — paginação estagnada.`,
        status,
        cursor,
      );
    }
    if (cursor !== undefined) seenPages.add(cursor);

    const page = await stripe.subscriptions.search({
      query: `status:'${status}' AND metadata['tenant_id']:'${tenantId}'`,
      limit: 100,
      ...(cursor ? { page: cursor } : {}),
    });
    collected.push(...page.data);

    const nextPage = (page as { next_page?: string | null }).next_page;
    if (!nextPage) return collected;
    cursor = nextPage;
  }
}

// ─── reconciliação ──────────────────────────────────────────────────────────

interface ReconcileContext {
  /** Quando presente, exigimos que metadata.plan_code == requestedPlanCode. */
  readonly requestedPlanCode?: PlanCode;
}

/**
 * Lê metadata.plan_code + Price ID da subscription e devolve a definição.
 * Lança `SubscriptionReconciliationError` com `reason` tipado em qualquer
 * falha. Nunca devolve `null` — uma subscription sem plano identificável
 * é erro de dados, não caso de "default".
 */
function inferPlanFromSubscription(
  sub: Stripe.Subscription,
  ctx: ReconcileContext = {},
): PlanDefinition {
  const stripePriceId = getCurrentPriceId(sub);
  const rawPlanCode = sub.metadata?.['plan_code'];

  if (rawPlanCode === undefined || rawPlanCode === null) {
    throw new SubscriptionReconciliationError(
      `Subscription ${sub.id} sem metadata.plan_code — reconciliação impossível.`,
      'missing_plan_code',
      sub.id,
      stripePriceId,
    );
  }

  if (typeof rawPlanCode !== 'string' || rawPlanCode === '') {
    throw new SubscriptionReconciliationError(
      `Subscription ${sub.id} tem metadata.plan_code vazia ou inválida — reconciliação impossível.`,
      'invalid_plan_code',
      sub.id,
      stripePriceId,
    );
  }

  const fromMeta = tryGetPlanByCode(rawPlanCode);
  if (!fromMeta) {
    throw new SubscriptionReconciliationError(
      `Subscription ${sub.id} tem metadata.plan_code='${rawPlanCode}' que não existe no registry.`,
      'invalid_plan_code',
      sub.id,
      stripePriceId,
      rawPlanCode,
    );
  }

  if (ctx.requestedPlanCode && fromMeta.code !== ctx.requestedPlanCode) {
    throw new SubscriptionReconciliationError(
      `Subscription ${sub.id} tem metadata.plan_code='${fromMeta.code}' mas foi solicitado '${ctx.requestedPlanCode}'.`,
      'plan_code_mismatch',
      sub.id,
      stripePriceId,
      fromMeta.code,
    );
  }

  const fromPrice = getPlanByStripePriceId(stripePriceId);
  if (!fromPrice) {
    throw new SubscriptionReconciliationError(
      `Subscription ${sub.id} tem Price ID='${stripePriceId}' desconhecido (sem env var correspondente).`,
      'unknown_price_id',
      sub.id,
      stripePriceId,
      fromMeta.code,
    );
  }

  if (fromPrice.code !== fromMeta.code) {
    throw new SubscriptionReconciliationError(
      `Subscription ${sub.id}: Price ID='${stripePriceId}' resolve para plano '${fromPrice.code}' mas metadata.plan_code='${fromMeta.code}'.`,
      'price_plan_mismatch',
      sub.id,
      stripePriceId,
      fromMeta.code,
    );
  }

  return fromPrice;
}

// ─── mappers / helpers internos ─────────────────────────────────────────────

/** Mapeia Stripe Subscription → domain, passando pela reconciliação. */
function toSubscriptionRecord(
  sub: Stripe.Subscription,
  ctx: ReconcileContext = {},
): SubscriptionRecord {
  const stripePriceId = getCurrentPriceId(sub);
  const def = inferPlanFromSubscription(sub, ctx);
  const item = sub.items.data[0];
  if (!item) {
    throw new Error(`Subscription ${sub.id} sem items — data corruption`);
  }
  return {
    id: sub.id,
    customerId:
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    planCode: def.code,
    status: mapStripeStatus(sub.status),
    currentPeriodStart: new Date(item.current_period_start * 1000),
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
    canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    stripePriceId,
  };
}

function mapStripeStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  // Stripe adicionou 'incomplete_expired' em 2022 — não está no nosso
  // enum (mapeamos para 'canceled' para o domínio ter um closed-set).
  switch (status) {
    case 'incomplete':
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'unpaid':
    case 'paused':
      return status as SubscriptionStatus;
    case 'incomplete_expired':
      return 'canceled';
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
