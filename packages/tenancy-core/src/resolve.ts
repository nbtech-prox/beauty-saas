/**
 * Resolver de tenant: slug → TenantResolution.
 *
 * Estratégia (Marco 6):
 *  1. Normaliza e valida o slug.
 *  2. Cache hit? → devolve.
 *  3. Fetch HTTP ao data plane (joycehairbeauty) `GET /tenancy/resolve/:slug`.
 *  4. Cacheia 60s.
 *
 * Erros remotos (5xx, timeout, abort, fetch failed) NÃO propagam —
 * degradam para `not_found` para evitar loops em middleware de routing.
 */

import type { PlanCode, TenantStatus } from '@beauty-saas/contracts';
import { PlanCodeSchema, TenantStatusSchema } from '@beauty-saas/contracts';
import { z } from 'zod';
import { TenantResolutionCache } from './cache.js';

export const RESOLVE_URL_DEFAULT = 'http://localhost:3000/tenancy/resolve';

const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_TTL_MS = 60_000;

/** Status canónicos — idênticos aos de Tenant, mas acrescentam-se os de resolução. */
export type TenantResolutionStatus = TenantStatus | 'not_found' | 'reserved';

export interface TenantResolution {
  status: TenantResolutionStatus;
  tenantId?: string;
  slug?: string;
  name?: string;
  planCode?: PlanCode;
}

export interface ResolveOptions {
  /** Override de fetch — útil para testes e para ambientes sem Node 18+ global fetch. */
  fetchImpl?: typeof fetch;
  /** Override do endpoint HTTP (em testes). */
  resolveUrl?: string;
  /** TTL em ms para o cache local. */
  ttlMs?: number;
  /** Timeout em ms para o fetch. */
  timeoutMs?: number;
  /** Injeta uma cache partilhada (singleton-friendly). */
  cache?: TenantResolutionCache;
}

/**
 * Normaliza slug: trim, lowercase, remove diacríticos (NFD + strip combining marks).
 * NÃO valida — só normaliza. Validação fica em `isValidSlug`.
 */
export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Regex de validação: lowercase alfanumérico + hífen, 3..30 chars. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 30 && SLUG_RE.test(slug);
}

// Schema Zod defensivo para o payload da API remota. Qualquer desvio → not_found.
const ResolveBodySchema = z.object({
  tenantId: z.string().min(1),
  status: TenantStatusSchema,
  slug: z.string().optional(),
  name: z.string().min(1).optional(),
  planCode: PlanCodeSchema,
});

const defaultCache = new TenantResolutionCache();

export async function resolveTenantBySlug(
  slug: string,
  options: ResolveOptions = {},
): Promise<TenantResolution> {
  const normalized = normalizeSlug(slug);

  // 1. Slug inválido (formato) → not_found (sem chamar rede, sem detalhes).
  if (!isValidSlug(normalized)) {
    return { status: 'not_found', slug: normalized };
  }

  const cache = options.cache ?? defaultCache;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  // 2. Cache hit?
  const cached = cache.get(normalized);
  if (cached) return cached;

  // 3. Fetch ao data plane.
  const fetchImpl: typeof fetch = options.fetchImpl ?? globalThis.fetch;
  const baseUrl =
    options.resolveUrl ?? process.env.JOYCE_RESOLVE_URL ?? RESOLVE_URL_DEFAULT;
  // Suporta base com ou sem path final: se acaba em `/resolve`, usa direto;
  // senão, anexa `/<slug>`.
  const url = baseUrl.endsWith('/resolve')
    ? `${baseUrl}/${encodeURIComponent(normalized)}`
    : `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(normalized)}`;

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const signal = AbortSignal.timeout(timeoutMs);

  try {
    const response = await fetchImpl(url, { method: 'GET', signal });

    // 4a. 404 → not_found (não cachear por defeito).
    if (response.status === 404) {
      const result: TenantResolution = {
        status: 'not_found',
        slug: normalized,
      };
      cache.delete(normalized);
      return result;
    }

    // 4b. 5xx → not_found (não cacheia, não propaga).
    if (response.status >= 500) {
      return { status: 'not_found', slug: normalized };
    }

    // 4c. Outros status não-OK → not_found defensivo.
    if (!response.ok) {
      return { status: 'not_found', slug: normalized };
    }

    const body: unknown = await response.json();
    const parsed = ResolveBodySchema.safeParse(body);
    if (!parsed.success) {
      // Payload inválido → não quebrar o routing.
      return { status: 'not_found', slug: normalized };
    }

    const result: TenantResolution = {
      status: parsed.data.status,
      tenantId: parsed.data.tenantId,
      slug: parsed.data.slug ?? normalized,
      name: parsed.data.name,
      planCode: parsed.data.planCode,
    };

    // Cacheia respostas válidas por TTL.
    cache.set(normalized, result, ttlMs);
    return result;
  } catch {
    // Timeout, abort, fetch failed, JSON parse error, etc.
    // Não propagar — degrada para not_found para não bloquear routing.
    return { status: 'not_found', slug: normalized };
  }
}
