/**
 * Subscription = relação entre Tenant e Plan + estado de billing.
 *
 * É a fonte de verdade para saber se um tenant tem acesso ao data plane.
 * Sincronizada com o provider de pagamentos (Stripe, etc.).
 */
import { z } from 'zod';
import { IsoDateString, UuidSchema } from './common.js';

/** Estado da subscription. Espelha os estados Stripe-style. */
export const SubscriptionStatusSchema = z.enum([
  'incomplete', // checkout iniciado mas primeiro pagamento falhou
  'trialing', // em período de trial
  'active', // ativa e paga
  'past_due', // pagamento falhado, em grace period
  'canceled', // cancelada (não renova)
  'unpaid', // múltiplas tentativas falhadas
  'paused', // pausa temporária
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

/** Schema completo da Subscription (resposta da API). */
export const SubscriptionSchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema,
  planId: UuidSchema,
  /** ID da subscription no provider externo (Stripe sub_xxx). */
  externalId: z.string().min(1).max(128),
  /** ID do customer no provider externo (Stripe cus_xxx). */
  externalCustomerId: z.string().min(1).max(128),
  status: SubscriptionStatusSchema,
  /** Quando a current period começou. */
  currentPeriodStart: IsoDateString,
  /** Quando a current period acaba e tenta renovar. */
  currentPeriodEnd: IsoDateString,
  /** Quando foi marcada para cancelamento (null se ativa). */
  cancelAt: IsoDateString.nullable(),
  /** Quando foi efetivamente cancelada (null se ainda não). */
  canceledAt: IsoDateString.nullable(),
  /** Trial end (null se não está em trial). */
  trialEnd: IsoDateString.nullable(),
  createdAt: IsoDateString,
  updatedAt: IsoDateString,
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

/** Payload para iniciar checkout de uma subscription. */
export const SubscriptionCreateInputSchema = z.object({
  tenantId: UuidSchema,
  planId: UuidSchema,
  /** Trial days opcionais (0 = sem trial). */
  trialDays: z.number().int().min(0).max(90).optional(),
  /** Coupon code opcional. */
  couponCode: z.string().min(1).max(64).optional(),
});
export type SubscriptionCreateInput = z.infer<typeof SubscriptionCreateInputSchema>;