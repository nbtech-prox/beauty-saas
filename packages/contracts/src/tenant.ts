/**
 * Tenant = uma instância do salão. Cada tenant tem o seu próprio subdomínio
 * (`slug.beauty-saas.pt`), schema PostgreSQL, e dados isolados.
 */
import { z } from 'zod';
import {
  CurrencySchema,
  EmailSchema,
  IsoDateString,
  LocaleSchema,
  SlugSchema,
  TimezoneSchema,
  UuidSchema,
} from './common.js';

/** Estado de ciclo de vida do tenant. */
export const TenantStatusSchema = z.enum([
  'trialing', // trial ativo
  'active', // subscrição ativa
  'past_due', // pagamento falhado, em grace period
  'canceled', // cancelado pelo owner
  'suspended', // suspenso por billing/admin
]);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

/** Schema completo do Tenant (resposta da API). */
export const TenantSchema = z.object({
  id: UuidSchema,
  slug: SlugSchema,
  name: z.string().min(1).max(100),
  /** Email do owner do tenant. */
  ownerEmail: EmailSchema,
  status: TenantStatusSchema,
  timezone: TimezoneSchema.default('Europe/Lisbon'),
  currency: CurrencySchema,
  locale: LocaleSchema.default('pt-PT'),
  /** Quando termina o trial (apenas se status='trialing'). */
  trialEndsAt: IsoDateString.nullable(),
  createdAt: IsoDateString,
  updatedAt: IsoDateString,
});
export type Tenant = z.infer<typeof TenantSchema>;

/**
 * Payload para criar um tenant novo. Tudo o que é server-generated
 * (id, createdAt, updatedAt) NÃO está aqui.
 */
export const TenantCreateInputSchema = z.object({
  slug: SlugSchema,
  name: z.string().min(1).max(100),
  ownerEmail: EmailSchema,
  ownerName: z.string().min(1).max(100),
  /** Plano escolhido no signup. */
  planId: z.string().min(1).max(64),
  timezone: TimezoneSchema.optional(),
  locale: LocaleSchema.optional(),
});
export type TenantCreateInput = z.infer<typeof TenantCreateInputSchema>;

/** Payload para atualizar parcialmente um tenant. */
export const TenantUpdateInputSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    timezone: TimezoneSchema.optional(),
    locale: LocaleSchema.optional(),
  })
  .strict();
export type TenantUpdateInput = z.infer<typeof TenantUpdateInputSchema>;