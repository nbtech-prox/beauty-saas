/**
 * Helpers de pricing para a landing pública.
 *
 * Re-exporta `PLAN_DEFINITIONS` como `publicPlans` (já filtrado por
 * `isPublic === true` e ordenado por `sortOrder`) e expõe helpers de
 * formatação pt-PT para preço e intervalo de cobrança.
 */
import {
  listPublicPlans,
  type PlanDefinition,
} from '@beauty-saas/billing/plans';
import type { BillingInterval } from '@beauty-saas/contracts';

/** Planos públicos ordenados — single source da oferta comercial na landing. */
export const publicPlans: readonly PlanDefinition[] = listPublicPlans();

const EUR_FORMATTER = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formata um valor em cêntimos (ex.: 1900) como euros em pt-PT
 * (ex.: "19,00 €" ou "€19,00"). Aceita apenas input validado.
 */
export function formatPriceEUR(cents: number): string {
  return EUR_FORMATTER.format(cents / 100);
}

/** Label de intervalo em pt-PT — "por mês" / "por ano". */
export function formatPlanInterval(interval: BillingInterval): string {
  return interval === 'monthly' ? 'por mês' : 'por ano';
}
