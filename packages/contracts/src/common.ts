/**
 * Building blocks partilhados por todos os schemas de domínio.
 *
 * Se um valor atravessa uma fronteira (HTTP, fila, DB, webhook),
 * DEVE ser validado por um schema deste package.
 */
import { z } from 'zod';

// ─── Primitive refinements ────────────────────────────────────────────────────

/** UUID v4 canónico (lowercase, com hífens). */
export const UuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof UuidSchema>;

/** Slug URL-safe: `[a-z0-9-]`, 3..64 chars. */
export const SlugSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug inválido (apenas a-z, 0-9 e hífens)');
export type Slug = z.infer<typeof SlugSchema>;

/** Email básico (RFC 5322 simplificado). */
export const EmailSchema = z.string().email().max(254);
export type Email = z.infer<typeof EmailSchema>;

/**
 * Timestamp ISO 8601 em UTC, com milissegundos opcionais.
 * Ex.: `2026-08-09T11:00:00Z` ou `2026-08-09T11:00:00.000Z`.
 */
export const IsoDateString = z
  .string()
  .datetime({ offset: true, message: 'ISO 8601 datetime com offset/UTC esperado' });
export type IsoDateString = z.infer<typeof IsoDateString>;

/** Moeda suportada pela plataforma. EUR único por agora. */
export const CurrencySchema = z.literal('EUR');
export type Currency = z.infer<typeof CurrencySchema>;

/** IANA timezone. Validada com Intl.DateTimeFormat. */
export const TimezoneSchema = z
  .string()
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'IANA timezone inválida');
export type Timezone = z.infer<typeof TimezoneSchema>;

/** Locale suportada pela UI. */
export const LocaleSchema = z.enum(['pt-PT', 'en-GB']);
export type Locale = z.infer<typeof LocaleSchema>;

// ─── Pagination & envelopes ──────────────────────────────────────────────────

/**
 * Página genérica de resultados.
 * `@typeParam T` é o schema do item (ex.: `TenantSchema`).
 */
export const PaginatedResponse = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    pagination: z.object({
      page: z.number().int().positive(),
      perPage: z.number().int().min(1).max(100),
      total: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
      hasNext: z.boolean(),
      hasPrev: z.boolean(),
    }),
  });

/**
 * Erro de API normalizado. Lançado por todas as routes REST do data plane.
 *
 * @example
 * { code: 'TENANT_NOT_FOUND', message: 'Tenant abc não existe', requestId: 'req_...' }
 */
export const ApiErrorSchema = z.object({
  code: z.string().min(1).max(64),
  message: z.string().min(1),
  /** Caminho do campo que originou o erro (ex.: `body.email`). */
  field: z.string().optional(),
  /** Detalhes extra (validation issues do Zod, etc.). */
  details: z.record(z.string(), z.unknown()).optional(),
  /** Correlation ID para tracing. */
  requestId: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Resposta de sucesso genérica que embrulha um payload.
 * `@typeParam T` é o schema do `data`.
 */
export const ApiSuccess = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    data,
    /** Meta info (requestId, timing, etc.). */
    meta: z.record(z.string(), z.unknown()).optional(),
  });

/**
 * União discriminada para respostas da API:
 * - `{ ok: true, data }` em sucesso
 * - `{ ok: false, error }` em falha
 *
 * Útil para tipos de retorno de fetcher/SDK.
 */
export const ApiResponse = <T extends z.ZodTypeAny>(data: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data, meta: z.record(z.string(), z.unknown()).optional() }),
    z.object({ ok: z.literal(false), error: ApiErrorSchema }),
  ]);