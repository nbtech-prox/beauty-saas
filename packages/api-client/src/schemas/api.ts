/**
 * Schemas Zod dos wire formats reais da API de `joycehairbeauty`.
 *
 * Estes schemas **não são** os schemas de domínio (que vivem em
 * `@beauty-saas/contracts`). Estes descrevem a forma exacta dos
 * payloads que o servidor envia/recebe. A tradução para o modelo
 * de domínio é feita em `mappers.ts`.
 *
 * Porquê separar?
 * - Os schemas `contracts` representam o **modelo lógico** do SaaS
 *   (multi-tenant, com `tenantId`, `UuidSchema`, `priceType: fixed|consult|free`).
 * - A API real é **single-tenant**, usa IDs inteiros do Laravel,
 *   preços decimais, `priceType: fixed|from|consult`.
 *
 * Misturar os dois criaria um inferno de `.optional()` e `as any`.
 */
import { z } from 'zod';

/* ──────────────────────────── Primitivos wire ──────────────────────────── */

/** O servidor devolve `id` como integer (Laravel auto-increment). */
export const WireIntIdSchema = z.number().int().positive();
export type WireIntId = z.infer<typeof WireIntIdSchema>;

/** String ISO 8601 com timezone. */
export const WireIsoDateSchema = z.string().datetime({ offset: true }).or(z.string().datetime());
export type WireIsoDate = z.infer<typeof WireIsoDateSchema>;

/** Data simples (YYYY-MM-DD). */
export const WireDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type WireDate = z.infer<typeof WireDateSchema>;

/** Hora simples (HH:mm). */
export const WireTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export type WireTime = z.infer<typeof WireTimeSchema>;

/** O servidor devolve price como **string** porque o cast é `decimal:2` no Laravel. */
export const WirePriceStringSchema = z.string().regex(/^\d+\.\d{2}$/);

/** Helper: converte string de preço para number, falhando se NaN. */
export const WirePriceSchema = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: 'custom', message: 'price inválido' });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100; // garante 2 casas decimais
  });

/** Wrapper Laravel: `{ data: T, message?: string }`. */
export function wireDataResponse<T extends z.ZodTypeAny>(inner: T) {
  return z.object({
    data: inner,
    message: z.string().optional(),
  });
}

/** Resposta paginada Laravel: `{ data, current_page, last_page, per_page, total, ... }`. */
export const WirePaginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    current_page: z.number().int().positive(),
    last_page: z.number().int().positive(),
    per_page: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    from: z.number().int().nullable().optional(),
    to: z.number().int().nullable().optional(),
  });
export type WirePaginated<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from?: number | null;
  to?: number | null;
};

/* ──────────────────────────── Auth wire ──────────────────────────── */

export const WireRoleSchema = z.object({
  id: WireIntIdSchema,
  name: z.string(),
  guard_name: z.string().default('web'),
});
export type WireRole = z.infer<typeof WireRoleSchema>;

export const WireUserSchema = z.object({
  id: WireIntIdSchema,
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  email_verified_at: WireIsoDateSchema.nullable().optional(),
  created_at: WireIsoDateSchema,
  updated_at: WireIsoDateSchema,
  roles: z.array(WireRoleSchema).optional(),
});
export type WireUser = z.infer<typeof WireUserSchema>;

export const WireLoginResponseSchema = z.object({
  message: z.string(),
  user: WireUserSchema,
});
export const WireMeResponseSchema = z.object({ user: WireUserSchema });
export const WireRegisterResponseSchema = z.object({
  message: z.string(),
  user: WireUserSchema,
});

/* ──────────────────────────── Service wire ──────────────────────────── */

export const WirePriceTypeSchema = z.enum(['fixed', 'from', 'consult']);
export type WirePriceType = z.infer<typeof WirePriceTypeSchema>;

export const WireServiceCategoryRefSchema = z.object({
  id: WireIntIdSchema,
  name: z.string(),
  slug: z.string(),
  order: z.number().int().optional(),
});
export type WireServiceCategoryRef = z.infer<typeof WireServiceCategoryRefSchema>;

export const WireServiceSchema = z.object({
  id: WireIntIdSchema,
  category_id: WireIntIdSchema.nullable().optional(),
  name: z.string(),
  slug: z.string(),
  summary: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  duration_minutes: z.number().int().positive(),
  preparation_minutes: z.number().int().nonnegative().default(0),
  cleanup_minutes: z.number().int().nonnegative().default(0),
  price: WirePriceSchema.nullable(),
  price_type: WirePriceTypeSchema,
  currency: z.string().default('EUR'),
  is_active: z.boolean(),
  is_featured: z.boolean().optional(),
  is_bookable_online: z.boolean().optional(),
  min_advance_hours: z.number().int().nonnegative().optional(),
  max_advance_days: z.number().int().positive().optional(),
  order: z.number().int().nonnegative().optional(),
  created_at: WireIsoDateSchema.optional(),
  updated_at: WireIsoDateSchema.optional(),
  category: WireServiceCategoryRefSchema.nullable().optional(),
  professionals: z
    .array(
      z.object({
        id: WireIntIdSchema,
        public_name: z.string(),
      }),
    )
    .optional(),
});
export type WireService = z.infer<typeof WireServiceSchema>;

export const WireServiceListResponseSchema = wireDataResponse(z.array(WireServiceSchema));

/* ──────────────────────────── Category wire ──────────────────────────── */

export const WireCategorySchema = z.object({
  id: WireIntIdSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  order: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
});
export const WireCategoryListResponseSchema = wireDataResponse(z.array(WireCategorySchema));

/* ──────────────────────────── Professional wire ──────────────────────────── */

export const WireProfessionalSchema = z.object({
  id: WireIntIdSchema,
  public_name: z.string(),
  slug: z.string().optional(),
  bio: z.string().nullable().optional(),
  specialties: z.array(z.string()).optional(),
  color: z.string().nullable().optional(),
  capacity: z.number().int().positive().default(1),
  is_active: z.boolean(),
  is_visible_on_site: z.boolean(),
  services: z
    .array(
      z.object({
        id: WireIntIdSchema,
        name: z.string(),
        pivot: z
          .object({ custom_duration_minutes: z.number().int().nullable().optional() })
          .optional(),
      }),
    )
    .optional(),
});
export type WireProfessional = z.infer<typeof WireProfessionalSchema>;
export const WireProfessionalListResponseSchema = wireDataResponse(
  z.array(WireProfessionalSchema),
);

/* ──────────────────────────── Appointment wire ──────────────────────────── */

/** Status reais (mais granulares que o domínio). */
export const WireAppointmentStatusSchema = z.enum([
  'pending',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'cancelled_by_client',
  'cancelled_by_staff',
  'no_show',
]);
export type WireAppointmentStatus = z.infer<typeof WireAppointmentStatusSchema>;

export const WireAppointmentRefSchema = z.object({
  id: WireIntIdSchema,
  uuid: z.string().uuid().optional(),
});

export const WireAppointmentSchema = z.object({
  id: WireIntIdSchema,
  uuid: z.string().uuid().optional(),
  client_id: WireIntIdSchema,
  service_id: WireIntIdSchema,
  professional_id: WireIntIdSchema.nullable(),
  starts_at: WireIsoDateSchema,
  ends_at: WireIsoDateSchema,
  duration_minutes: z.number().int().positive(),
  timezone: z.string().default('Europe/Lisbon'),
  price: WirePriceSchema.nullable(),
  currency: z.string().default('EUR'),
  status: WireAppointmentStatusSchema,
  origin: z.string().optional(),
  completed_at: WireIsoDateSchema.nullable().optional(),
  archived_at: WireIsoDateSchema.nullable().optional(),
  client_notes: z.string().nullable().optional(),
  internal_notes: z.string().nullable().optional(),
  cancel_reason: z.string().nullable().optional(),
  snapshot_service_name: z.string().optional(),
  snapshot_duration_minutes: z.number().int().optional(),
  created_at: WireIsoDateSchema.optional(),
  updated_at: WireIsoDateSchema.optional(),
  service: WireAppointmentRefSchema.extend({ name: z.string().optional() }).optional(),
  professional: WireAppointmentRefSchema.extend({ public_name: z.string().optional() }).optional(),
  client: WireAppointmentRefSchema.extend({ name: z.string().optional() }).optional(),
});
export type WireAppointment = z.infer<typeof WireAppointmentSchema>;

export const WireAppointmentResponseSchema = wireDataResponse(WireAppointmentSchema);
export const WireAppointmentsListResponseSchema = WirePaginatedSchema(WireAppointmentSchema);
export const WireMyAppointmentsResponseSchema = WirePaginatedSchema(WireAppointmentSchema);

/* ──────────────────────────── Availability wire ──────────────────────────── */

export const WireAvailabilitySlotGroupSchema = z.object({
  professional_id: WireIntIdSchema,
  professional_name: z.string(),
  slots: z.array(WireTimeSchema),
});
export const WireAvailabilitySlotsResponseSchema = wireDataResponse(
  z.array(WireAvailabilitySlotGroupSchema),
);
export type WireAvailabilitySlotGroup = z.infer<typeof WireAvailabilitySlotGroupSchema>;

/* ──────────────────────────── Business hours wire ──────────────────────────── */

export const WireDayOfWeekSchema = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);
export type WireDayOfWeek = z.infer<typeof WireDayOfWeekSchema>;

export const WireBusinessHourSchema = z.object({
  id: WireIntIdSchema.optional(),
  day_of_week: WireDayOfWeekSchema,
  opens_at: WireTimeSchema.nullable(),
  closes_at: WireTimeSchema.nullable(),
  is_closed: z.boolean().default(false),
});
export type WireBusinessHour = z.infer<typeof WireBusinessHourSchema>;
export const WireBusinessHoursResponseSchema = wireDataResponse(z.array(WireBusinessHourSchema));

/* ──────────────────────────── Content wire ──────────────────────────── */

export const WireFaqSchema = z.object({
  id: WireIntIdSchema,
  question: z.string(),
  answer: z.string(),
  order: z.number().int().nonnegative().optional(),
  is_published: z.boolean().optional(),
});
export type WireFaq = z.infer<typeof WireFaqSchema>;

export const WireTestimonialSchema = z.object({
  id: WireIntIdSchema,
  client_name: z.string(),
  rating: z.number().int().min(1).max(5).optional(),
  content: z.string(),
  is_approved: z.boolean().optional(),
  is_published: z.boolean().optional(),
  created_at: WireIsoDateSchema.optional(),
});
export type WireTestimonial = z.infer<typeof WireTestimonialSchema>;

export const WireGalleryItemSchema = z.object({
  id: WireIntIdSchema,
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  image_url: z.string().url(),
  order: z.number().int().nonnegative().optional(),
  is_published: z.boolean().optional(),
});
export type WireGalleryItem = z.infer<typeof WireGalleryItemSchema>;

export const WireSettingSchema = z.object({
  key: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  type: z.string().optional(),
});
export type WireSetting = z.infer<typeof WireSettingSchema>;

export const WireFaqsResponseSchema = wireDataResponse(z.array(WireFaqSchema));
export const WireTestimonialsResponseSchema = wireDataResponse(z.array(WireTestimonialSchema));
export const WireGalleryResponseSchema = wireDataResponse(z.array(WireGalleryItemSchema));
export const WireSettingsResponseSchema = z.object({ data: z.array(WireSettingSchema) });
