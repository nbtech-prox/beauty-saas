/**
 * @beauty-saas/tenancy-core — entry point.
 *
 * Server-only (Node runtime). Resolve o tenant activo a partir do `slug`
 * (subdomínio) com cache em memória.
 */

export type { TenantResolution, TenantResolutionStatus } from './resolve.js';
export {
  resolveTenantBySlug,
  normalizeSlug,
  isValidSlug,
  RESOLVE_URL_DEFAULT,
} from './resolve.js';
export { TenantResolutionCache } from './cache.js';
