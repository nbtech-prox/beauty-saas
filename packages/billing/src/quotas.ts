/**
 * Quota checking — limites quantitativos por plano.
 *
 * O backend chama `checkQuota()` antes de operações que consomem recursos
 * (criar profissional, agendar, upload, etc.). Devolve estado + erros
 * tipados para o handler HTTP responder 402 Payment Required ou 429.
 *
 * IMPORTANTE: Esta é a única camada de enforcement. Não duplicar lógica
 * nos serviços de domínio.
 */
import { type PlanDefinition } from './plans.js';

export type QuotaKey =
  | 'maxProfessionals'
  | 'maxServices'
  | 'maxBookingsPerMonth'
  | 'maxLocations';

/** Estado detalhado de uma quota. */
export interface QuotaStatus {
  readonly key: QuotaKey;
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
  readonly exceeded: boolean;
  /** % usado (0..100+). Útil para mostrar UI warnings antes de bater o tecto. */
  readonly percentUsed: number;
}

/** Erro lançado quando uma quota é excedida. */
export class QuotaExceededError extends Error {
  readonly httpStatus = 402; // Payment Required — semanticamente, "passa para outro plano"
  constructor(
    message: string,
    readonly key: QuotaKey,
    readonly limit: number,
    readonly used: number,
    readonly planCode: string,
  ) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

/** Inputs do checker — contadores actuais por quota. */
export interface QuotaUsage {
  readonly maxProfessionals?: number;
  readonly maxServices?: number;
  readonly maxBookingsPerMonth?: number;
  readonly maxLocations?: number;
}

/**
 * Resultado do check: ou está tudo OK, ou uma ou mais quotas excedidas.
 * Não falha na primeira — devolve TODAS as que excedem para a UI mostrar
 * mensagens accionáveis (ex.: "profissionais: 3/3, serviços: 102/100").
 */
export interface QuotaCheckResult {
  readonly planCode: string;
  readonly statuses: Readonly<Record<QuotaKey, QuotaStatus>>;
  readonly exceeded: readonly QuotaKey[];
}

/**
 * Verifica quotas para um plano + contadores actuais.
 *
 * @param def    Plano activo do tenant.
 * @param usage  Contadores actuais (defaults: 0).
 * @returns Resultado com estado por quota.
 * @throws QuotaExceededError se uma ou mais quotas forem excedidas.
 */
export function checkQuota(
  def: PlanDefinition,
  usage: QuotaUsage = {},
): QuotaCheckResult {
  const checks: QuotaKey[] = [
    'maxProfessionals',
    'maxServices',
    'maxBookingsPerMonth',
    'maxLocations',
  ];

  const statuses = {} as Record<QuotaKey, QuotaStatus>;
  const exceeded: QuotaKey[] = [];

  for (const key of checks) {
    const limit = def.limits[key];
    const used = usage[key] ?? 0;
    const remaining = Math.max(0, limit - used);
    const isExceeded = used > limit;
    const percentUsed = limit === 0 ? 100 : Math.round((used / limit) * 100);

    statuses[key] = {
      key,
      limit,
      used,
      remaining,
      exceeded: isExceeded,
      percentUsed,
    };
    if (isExceeded) {
      exceeded.push(key);
    }
  }

  if (exceeded.length > 0) {
    const summary = exceeded
      .map((k) => `${k}: ${statuses[k].used}/${statuses[k].limit}`)
      .join(', ');
    throw new QuotaExceededError(
      `Quota excedida para o plano ${def.code} — ${summary}`,
      exceeded[0]!,
      statuses[exceeded[0]!].limit,
      statuses[exceeded[0]!].used,
      def.code,
    );
  }

  return {
    planCode: def.code,
    statuses,
    exceeded,
  };
}

/**
 * Verifica UMA quota específica. Conveniente para checks inline
 * (`if (!canAddProfessional(...)) return ...`).
 */
export function hasQuotaAvailable(
  def: PlanDefinition,
  key: QuotaKey,
  used: number,
): boolean {
  return used <= def.limits[key];
}

/** Versão não-throwing de `checkQuota` — devolve apenas os booleanos. */
export function getQuotaStatuses(
  def: PlanDefinition,
  usage: QuotaUsage = {},
): Readonly<Record<QuotaKey, QuotaStatus>> {
  return checkQuotaWithoutThrow(def, usage).statuses;
}

function checkQuotaWithoutThrow(
  def: PlanDefinition,
  usage: QuotaUsage,
): QuotaCheckResult {
  const checks: QuotaKey[] = [
    'maxProfessionals',
    'maxServices',
    'maxBookingsPerMonth',
    'maxLocations',
  ];

  const statuses = {} as Record<QuotaKey, QuotaStatus>;
  const exceeded: QuotaKey[] = [];

  for (const key of checks) {
    const limit = def.limits[key];
    const used = usage[key] ?? 0;
    const remaining = Math.max(0, limit - used);
    const isExceeded = used > limit;
    const percentUsed = limit === 0 ? 100 : Math.round((used / limit) * 100);

    statuses[key] = {
      key,
      limit,
      used,
      remaining,
      exceeded: isExceeded,
      percentUsed,
    };
    if (isExceeded) {
      exceeded.push(key);
    }
  }

  return {
    planCode: def.code,
    statuses,
    exceeded,
  };
}