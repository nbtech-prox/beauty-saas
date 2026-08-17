/**
 * Schema Zod para o input do checkout.
 *
 * Validação partilhada entre o form (cliente) e o API route (servidor).
 * Garantir que ambos usam o mesmo schema — single source of truth.
 */
import { z } from 'zod';
import { EmailSchema } from '@beauty-saas/contracts';

/**
 * Input para criar uma Checkout Session.
 *
 * - tenantId é gerado client-side (UUID v4) e persiste no localStorage até
 *   o checkout completar. Isto permite ao webhook reconciliar a sessão
 *   com um tenant específico sem auth.
 * - email é o billing email (pode diferir do email do utilizador).
 * - trialDays é opcional (0 = sem trial).
 * - couponCode é opcional (validado pelo Stripe quando aplicável).
 */
export const CheckoutFormInputSchema = z.object({
  email: EmailSchema,
  trialDays: z.number().int().min(0).max(90).default(0),
  couponCode: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[A-Z0-9_-]+$/i, 'código de cupão inválido')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type CheckoutFormInput = z.infer<typeof CheckoutFormInputSchema>;

/**
 * Resultado de uma Checkout Session criada com sucesso.
 */
export const CheckoutSessionResponseSchema = z.object({
  sessionId: z.string().regex(/^cs_/),
  url: z.string().url(),
  expiresAt: z.string().datetime({ offset: true }),
});
export type CheckoutSessionResponse = z.infer<
  typeof CheckoutSessionResponseSchema
>;
