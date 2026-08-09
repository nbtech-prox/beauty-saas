/**
 * Registry de Planos comerciais — fonte de verdade no domínio.
 *
 * O plano *interno* (este package) é o que a app consulta para saber
 * quotas, features e preços. O plano *externo* é o Price ID no Stripe
 * (`price_xxx`) ao qual este plano está vinculado.
 *
 * O id externo vem de variáveis de ambiente para permitir usar a mesma
 * versão do package contra `test` e `live` do Stripe sem rebuild:
 *   - STRIPE_PRICE_STARTER_MONTHLY
 *   - STRIPE_PRICE_STARTER_YEARLY
 *   - STRIPE_PRICE_PRO_MONTHLY
 *   - STRIPE_PRICE_PRO_YEARLY
 *   - STRIPE_PRICE_ENTERPRISE_MONTHLY
 *   - STRIPE_PRICE_ENTERPRISE_YEARLY
 *
 * Se um plano canónico não tiver env var definida, devolvemos
 * `null` em `getPlanByCode()` em vez de crashar — onboarding pode estar
 * incompleto.
 */
import {
  PLAN_CODES,
  type BillingInterval,
  type Currency,
  type Plan,
  type PlanFeature,
  type PlanLimits,
  type PlanTier,
} from '@beauty-saas/contracts';

/** Definição interna de um plano — antes de sincronizar com Stripe. */
export interface PlanDefinition {
  readonly code: keyof typeof PLAN_CODES;
  readonly name: string;
  readonly tier: PlanTier;
  readonly interval: BillingInterval;
  readonly priceCents: number;
  readonly currency: Currency;
  readonly features: readonly PlanFeature[];
  readonly limits: PlanLimits;
  readonly sortOrder: number;
  readonly isPublic: boolean;
  /** Env var que contém o Stripe Price ID (ex.: `STRIPE_PRICE_STARTER_MONTHLY`). */
  readonly stripePriceEnvVar: string;
}

/** Catálogo estático — single source of truth da oferta comercial. */
export const PLAN_DEFINITIONS: readonly PlanDefinition[] = [
  {
    code: 'starterMonthly',
    name: 'Starter Mensal',
    tier: 'starter',
    interval: 'monthly',
    priceCents: 1_900, // €19.00
    currency: 'EUR',
    features: ['api_access'],
    limits: {
      maxProfessionals: 3,
      maxServices: 20,
      maxBookingsPerMonth: 500,
      maxLocations: 1,
    },
    sortOrder: 10,
    isPublic: true,
    stripePriceEnvVar: 'STRIPE_PRICE_STARTER_MONTHLY',
  },
  {
    code: 'starterYearly',
    name: 'Starter Anual',
    tier: 'starter',
    interval: 'yearly',
    priceCents: 19_000, // €190.00
    currency: 'EUR',
    features: ['api_access'],
    limits: {
      maxProfessionals: 3,
      maxServices: 20,
      maxBookingsPerMonth: 500,
      maxLocations: 1,
    },
    sortOrder: 11,
    isPublic: true,
    stripePriceEnvVar: 'STRIPE_PRICE_STARTER_YEARLY',
  },
  {
    code: 'proMonthly',
    name: 'Pro Mensal',
    tier: 'pro',
    interval: 'monthly',
    priceCents: 4_900, // €49.00
    currency: 'EUR',
    features: ['multi_location', 'api_access', 'advanced_reports'],
    limits: {
      maxProfessionals: 10,
      maxServices: 100,
      maxBookingsPerMonth: 2_000,
      maxLocations: 3,
    },
    sortOrder: 20,
    isPublic: true,
    stripePriceEnvVar: 'STRIPE_PRICE_PRO_MONTHLY',
  },
  {
    code: 'proYearly',
    name: 'Pro Anual',
    tier: 'pro',
    interval: 'yearly',
    priceCents: 49_000, // €490.00
    currency: 'EUR',
    features: ['multi_location', 'api_access', 'advanced_reports'],
    limits: {
      maxProfessionals: 10,
      maxServices: 100,
      maxBookingsPerMonth: 2_000,
      maxLocations: 3,
    },
    sortOrder: 21,
    isPublic: true,
    stripePriceEnvVar: 'STRIPE_PRICE_PRO_YEARLY',
  },
  {
    code: 'enterpriseMonthly',
    name: 'Enterprise Mensal',
    tier: 'enterprise',
    interval: 'monthly',
    priceCents: 19_900, // €199.00
    currency: 'EUR',
    features: [
      'multi_location',
      'custom_domain',
      'white_label',
      'priority_support',
      'sso_saml',
      'api_access',
      'advanced_reports',
    ],
    limits: {
      maxProfessionals: 100,
      maxServices: 500,
      maxBookingsPerMonth: 20_000,
      maxLocations: 20,
    },
    sortOrder: 30,
    isPublic: true,
    stripePriceEnvVar: 'STRIPE_PRICE_ENTERPRISE_MONTHLY',
  },
  {
    code: 'enterpriseYearly',
    name: 'Enterprise Anual',
    tier: 'enterprise',
    interval: 'yearly',
    priceCents: 199_000, // €1990.00
    currency: 'EUR',
    features: [
      'multi_location',
      'custom_domain',
      'white_label',
      'priority_support',
      'sso_saml',
      'api_access',
      'advanced_reports',
    ],
    limits: {
      maxProfessionals: 100,
      maxServices: 500,
      maxBookingsPerMonth: 20_000,
      maxLocations: 20,
    },
    sortOrder: 31,
    isPublic: true,
    stripePriceEnvVar: 'STRIPE_PRICE_ENTERPRISE_YEARLY',
  },
] as const;

/** Códigos canónicos como string (ex.: `'pro-monthly'`). */
const codeToSlug: Record<keyof typeof PLAN_CODES, string> = {
  starterMonthly: PLAN_CODES.starterMonthly,
  starterYearly: PLAN_CODES.starterYearly,
  proMonthly: PLAN_CODES.proMonthly,
  proYearly: PLAN_CODES.proYearly,
  enterpriseMonthly: PLAN_CODES.enterpriseMonthly,
  enterpriseYearly: PLAN_CODES.enterpriseYearly,
};

/** Index code → definition (lookup O(1)). */
const byCode: Map<string, PlanDefinition> = new Map(
  PLAN_DEFINITIONS.map((p) => [p.code, p]),
);

/** Index stripePriceEnvVar → definition. */
const byEnvVar: Map<string, PlanDefinition> = new Map(
  PLAN_DEFINITIONS.map((p) => [p.stripePriceEnvVar, p]),
);

/**
 * Resolve um plano pelo seu code canónico (singular `proMonthly`) OU
 * pelo slug (`pro-monthly`). Lança `PlanNotFoundError` se não existir.
 */
export function getPlanByCode(code: string): PlanDefinition {
  const def = tryGetPlanByCode(code);
  if (!def) {
    throw new PlanNotFoundError(`Plano '${code}' não existe no registry.`, code);
  }
  return def;
}

/**
 * Tenta resolver plano por code. Aceita tanto o singular canónico
 * (`proMonthly`) como o slug (`pro-monthly`). Devolve `undefined`
 * em vez de lançar.
 */
export function tryGetPlanByCode(code: string): PlanDefinition | undefined {
  // 1. Match exacto (singular canónico).
  const direct = byCode.get(code);
  if (direct) return direct;

  // 2. Match por slug → singular (PLAN_CODES).
  for (const [singular, slug] of Object.entries(PLAN_CODES)) {
    if (slug === code) {
      return byCode.get(singular);
    }
  }

  return undefined;
}

/**
 * Resolve um plano a partir do Stripe Price ID (`price_xxx`).
 *
 * Usa env var para mapear. Devolve `undefined` se a env var não estiver
 * definida (ex.: onboarding incompleto, novo plano ainda não publicado).
 *
 * O ID Stripe externo **não** está hardcoded para permitir mesma build
 * contra `test` e `live`.
 */
export function getPlanByStripePriceId(
  stripePriceId: string,
): PlanDefinition | undefined {
  for (const def of PLAN_DEFINITIONS) {
    if (process.env[def.stripePriceEnvVar] === stripePriceId) {
      return def;
    }
  }
  return undefined;
}

/**
 * Devolve o Stripe Price ID de um plano a partir do env. `undefined` se
 * não estiver configurado.
 */
export function getStripePriceIdForCode(
  code: keyof typeof PLAN_CODES,
): string | undefined {
  const def = getPlanByCode(code);
  const priceId = process.env[def.stripePriceEnvVar];
  return priceId && priceId.startsWith('price_') ? priceId : undefined;
}

/**
 * Devolve o Plan (no formato do contract) a partir de uma definition.
 * O `id` aqui é placeholder — em runtime vem da DB.
 */
export function planDefinitionToContract(
  def: PlanDefinition,
  overrides: { id: string; createdAt: string; updatedAt: string },
): Plan {
  return {
    id: overrides.id,
    code: codeToSlug[def.code],
    name: def.name,
    tier: def.tier,
    interval: def.interval,
    priceCents: def.priceCents,
    currency: def.currency,
    features: [...def.features],
    limits: { ...def.limits },
    sortOrder: def.sortOrder,
    isPublic: def.isPublic,
    createdAt: overrides.createdAt,
    updatedAt: overrides.updatedAt,
  };
}

/** Lista todos os planos públicos, ordenados por sortOrder. */
export function listPublicPlans(): readonly PlanDefinition[] {
  return [...PLAN_DEFINITIONS]
    .filter((p) => p.isPublic)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export class PlanNotFoundError extends Error {
  readonly httpStatus = 404;
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'PlanNotFoundError';
  }
}

/** Acesso a env var — exposto para testes. */
export const __planEnvVarIndex = byEnvVar;