/**
 * Webhook events — idempotência de webhooks externos (Stripe, Resend, etc.).
 *
 * Cada webhook é registado antes de ser processado. Reentregas são no-op
 * via UNIQUE constraint no `externalEventId`.
 *
 * ## Fluxo
 *
 * ```
 * 1. Webhook chega → validar signature
 * 2. INSERT INTO webhook_events (external_event_id, type, payload)
 *      └─ UNIQUE constraint → se já existe, no-op
 * 3. Dispatch handler baseado em type
 * 4. UPDATE processed_at = NOW() (success ou failure)
 * ```
 *
 * Se passo 3 falha, registamos `error_message` e o job é retentado
 * (ver Fase 2 do ARCHITECTURE).
 */
import { z } from 'zod';
import { IsoDateString, UuidSchema } from './common.js';

/** Provider do webhook. */
export const WebhookProviderSchema = z.enum(['stripe', 'resend', 'github', 'custom']);
export type WebhookProvider = z.infer<typeof WebhookProviderSchema>;

/** Status do processamento. */
export const WebhookProcessingStatusSchema = z.enum([
  'received', // entrou mas ainda não processado
  'processing', // handler a correr
  'processed', // sucesso
  'failed', // erro (será retentado)
  'dead', // múltiplas falhas — desistir (DLQ)
]);
export type WebhookProcessingStatus = z.infer<typeof WebhookProcessingStatusSchema>;

/**
 * Schema do registo na tabela `webhook_events`.
 * É o estado **persistido**, não o payload externo.
 */
export const WebhookEventRecordSchema = z.object({
  id: UuidSchema,
  provider: WebhookProviderSchema,
  /** ID externo do evento (ex.: `evt_xxx` do Stripe). UNIQUE por provider. */
  externalEventId: z.string().min(1).max(128),
  /** Tipo do evento (ex.: `customer.subscription.created`). */
  type: z.string().min(1).max(128),
  /** Payload completo (JSON arbitrary). */
  payload: z.record(z.string(), z.unknown()),
  status: WebhookProcessingStatusSchema,
  /** Nº de tentativas de processamento. */
  attempts: z.number().int().nonnegative(),
  /** Mensagem de erro (null se sucesso). */
  errorMessage: z.string().max(2000).nullable(),
  /** Stack trace (apenas em dev — null em prod por PII). */
  errorStack: z.string().max(8000).nullable(),
  receivedAt: IsoDateString,
  processedAt: IsoDateString.nullable(),
  createdAt: IsoDateString,
  updatedAt: IsoDateString,
});
export type WebhookEventRecord = z.infer<typeof WebhookEventRecordSchema>;

// ─── Stripe-specific event types ────────────────────────────────────────────

/** Tipos de eventos Stripe que o SaaS processa. */
export const STRIPE_WEBHOOK_TYPES = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.paid',
  'checkout.session.completed',
] as const;
export type StripeWebhookType = (typeof STRIPE_WEBHOOK_TYPES)[number];

/**
 * Schema de um event Stripe (subset que nos interessa).
 * Baseado em https://stripe.com/docs/api/events — mas apenas os campos
 * que o nosso handler lê. Validação completa é feita pelo `stripe.webhooks.constructEvent`.
 */
export const StripeWebhookEventSchema = z.object({
  id: z.string().regex(/^evt_[a-zA-Z0-9]+$/, 'Stripe event id deve começar com evt_'),
  object: z.literal('event'),
  type: z.string().min(1),
  api_version: z.string().nullable(),
  created: z.number().int().positive(),
  livemode: z.boolean(),
  /** Pending webhooks têm data null. */
  data: z.object({
    object: z.record(z.string(), z.unknown()),
    previous_attributes: z.record(z.string(), z.unknown()).nullable(),
  }),
  request: z
    .object({
      id: z.string().nullable(),
      idempotency_key: z.string().nullable(),
    })
    .nullable(),
});
export type StripeWebhookEvent = z.infer<typeof StripeWebhookEventSchema>;

/**
 * Discriminated union por tipo — para handlers tipados.
 * Quando precisares de adicionar um handler, adiciona entrada aqui.
 */
export const StripeSubscriptionCreatedSchema = StripeWebhookEventSchema.extend({
  type: z.literal('customer.subscription.created'),
});
export const StripeSubscriptionUpdatedSchema = StripeWebhookEventSchema.extend({
  type: z.literal('customer.subscription.updated'),
});
export const StripeSubscriptionDeletedSchema = StripeWebhookEventSchema.extend({
  type: z.literal('customer.subscription.deleted'),
});
export const StripeInvoicePaymentFailedSchema = StripeWebhookEventSchema.extend({
  type: z.literal('invoice.payment_failed'),
});
export const StripeInvoicePaidSchema = StripeWebhookEventSchema.extend({
  type: z.literal('invoice.paid'),
});
export const StripeCheckoutCompletedSchema = StripeWebhookEventSchema.extend({
  type: z.literal('checkout.session.completed'),
});

export const StripeKnownEventSchema = z.discriminatedUnion('type', [
  StripeSubscriptionCreatedSchema,
  StripeSubscriptionUpdatedSchema,
  StripeSubscriptionDeletedSchema,
  StripeInvoicePaymentFailedSchema,
  StripeInvoicePaidSchema,
  StripeCheckoutCompletedSchema,
]);
export type StripeKnownEvent = z.infer<typeof StripeKnownEventSchema>;

// ─── Webhook signature envelope ─────────────────────────────────────────────

/** Headers HTTP de um webhook request (canonical subset). */
export const StripeWebhookHeadersSchema = z.object({
  'stripe-signature': z.string().min(1),
  'content-type': z.string().includes('application/json'),
});
export type StripeWebhookHeaders = z.infer<typeof StripeWebhookHeadersSchema>;