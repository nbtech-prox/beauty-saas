/**
 * @beauty-saas/contracts — source of truth dos contratos de dados.
 *
 * Cada schema aqui é a fronteira de validação entre sistemas.
 * Tipos TS são inferidos via `z.infer<typeof schema>`.
 */

// Building blocks
export * from './common.js';

// Domínio
export * from './tenant.js';
export * from './plan.js';
export * from './subscription.js';
export * from './service.js';