/**
 * Plan = oferta comercial da plataforma (starter, pro, enterprise).
 *
 * Definem limites, features e preço. A relação Plan ↔ Subscription
 * é 1:N — um plano pode ter N tenants subscritos.
 */
import { z } from 'zod';
import { CurrencySchema, IsoDateString, UuidSchema } from './common.js';

/** Tier comercial do plano. */
export const PlanTierSchema = z.enum(['starter', 'pro', 'enterprise']);
export type PlanTier = z.infer<typeof PlanTierSchema>;

/** Intervalo de cobrança. */
export const BillingIntervalSchema = z.enum(['monthly', 'yearly']);
export type BillingInterval = z.infer<typeof BillingIntervalSchema>;

/** Feature flag incluída no plano. */
export const PlanFeatureSchema = z.enum([
  'multi_location',
  'custom_domain',
  'white_label',
  'priority_support',
  'sso_saml',
  'api_access',
  'advanced_reports',
]);
export type PlanFeature = z.infer<typeof PlanFeatureSchema>;

/** Limites quantitativos do plano. */
export const PlanLimitsSchema = z.object({
  /** Nº máximo de profissionais ativos. */
  maxProfessionals: z.number().int().positive(),
  /** Nº máximo de serviços no catálogo. */
  maxServices: z.number().int().positive(),
  /** Nº máximo de bookings por mês. */
  maxBookingsPerMonth: z.number().int().positive(),
  /** Nº máximo de localizações. */
  maxLocations: z.number().int().positive(),
});
export type PlanLimits = z.infer<typeof PlanLimitsSchema>;

/** Schema completo do Plan (resposta da API). */
export const PlanSchema = z.object({
  id: UuidSchema,
  /** Identificador estável, slug-like (ex.: `pro-monthly`). */
  code: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  tier: PlanTierSchema,
  interval: BillingIntervalSchema,
  /** Preço em cêntimos (evita problemas de float). Ex.: 4900 = €49.00. */
  priceCents: z.number().int().nonnegative(),
  currency: CurrencySchema,
  features: z.array(PlanFeatureSchema),
  limits: PlanLimitsSchema,
  /** Ordem de apresentação no pricing page (menor = primeiro). */
  sortOrder: z.number().int().nonnegative(),
  /** Plano visível publicamente? (false = plano interno/legacy). */
  isPublic: z.boolean(),
  createdAt: IsoDateString,
  updatedAt: IsoDateString,
});
export type Plan = z.infer<typeof PlanSchema>;

/**
 * Códigos canónicos dos planos. IMPORTANTE: nunca hardcodos estes
 * valores em código de aplicação — usa sempre `PlanSchema.parse(...)`.
 */
export const PLAN_CODES = {
  starterMonthly: 'starter-monthly',
  starterYearly: 'starter-yearly',
  proMonthly: 'pro-monthly',
  proYearly: 'pro-yearly',
  enterpriseMonthly: 'enterprise-monthly',
  enterpriseYearly: 'enterprise-yearly',
} as const;
export type PlanCode = (typeof PLAN_CODES)[keyof typeof PLAN_CODES];