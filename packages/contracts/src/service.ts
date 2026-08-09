/**
 * Service = serviço oferecido pelo salão (corte, coloração, manicure, etc.).
 *
 * Existe dentro de um Tenant e é agendável por clientes.
 * O `priceType` segue o padrão JHB:
 * - `fixed`: preço fixo em EUR
 * - `consult`: preço a definir em consulta (ex.: coloração complexa)
 * - `free`: gratuito (ex.: avaliação inicial)
 */
import { z } from 'zod';
import { CurrencySchema, IsoDateString, UuidSchema } from './common.js';

/** Tipo de pricing. */
export const PriceTypeSchema = z.enum(['fixed', 'consult', 'free']);
export type PriceType = z.infer<typeof PriceTypeSchema>;

/** Schema completo do Service (resposta da API). */
export const ServiceSchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema,
  name: z.string().min(1).max(100),
  /** Slug URL-safe (gerado a partir do name, único por tenant). */
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(1000).nullable(),
  /** Duração em minutos. Mínimo 5 (slots de 5min). Máximo 8h. */
  durationMinutes: z.number().int().min(5).max(480),
  /** Tipo de preço. */
  priceType: PriceTypeSchema,
  /**
   * Preço em EUR com 2 casas decimais. **Obrigatório quando `priceType='fixed'`.**
   * Tem de ser `null` quando `priceType='consult'` ou `'free'`.
   */
  price: z.number().nonnegative().multipleOf(0.01).nullable(),
  currency: CurrencySchema,
  /** Buffer antes/depois em minutos (setup/cleanup). Default 0. */
  bufferMinutesBefore: z.number().int().min(0).max(60).default(0),
  bufferMinutesAfter: z.number().int().min(0).max(60).default(0),
  /** Categoria opcional (ex.: "Cabelo", "Unhas", "Estética"). */
  category: z.string().max(50).nullable(),
  /** Visível no booking público? */
  isBookable: z.boolean(),
  /** Requer aprovação do admin para confirmar booking? */
  requiresApproval: z.boolean(),
  /** Ordem de apresentação no catálogo. */
  sortOrder: z.number().int().nonnegative(),
  createdAt: IsoDateString,
  updatedAt: IsoDateString,
});
export type Service = z.infer<typeof ServiceSchema>;

/**
 * Refinamento cross-field: `price` deve ser consistente com `priceType`.
 * - `fixed` → price obrigatório (> 0)
 * - `consult` → price tem de ser null
 * - `free` → price tem de ser null
 */
export const ServiceConsistentSchema = ServiceSchema.refine(
  (s) => {
    if (s.priceType === 'fixed') return s.price !== null && s.price > 0;
    return s.price === null;
  },
  {
    message:
      "Inconsistência: priceType='fixed' requer price>0; priceType='consult'/'free' requer price=null",
    path: ['price'],
  },
);

/** Payload para criar um service. */
export const ServiceCreateInputSchema = z.object({
  tenantId: UuidSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(1000).nullable().optional(),
  durationMinutes: z.number().int().min(5).max(480),
  priceType: PriceTypeSchema,
  price: z.number().nonnegative().multipleOf(0.01).nullable().optional(),
  bufferMinutesBefore: z.number().int().min(0).max(60).optional(),
  bufferMinutesAfter: z.number().int().min(0).max(60).optional(),
  category: z.string().max(50).nullable().optional(),
  isBookable: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});
export type ServiceCreateInput = z.infer<typeof ServiceCreateInputSchema>;