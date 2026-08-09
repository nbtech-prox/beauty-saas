/**
 * @beauty-saas/contracts — source of truth dos contratos de dados.
 *
 * Cada schema aqui é a fronteira de validação entre sistemas.
 * Tipos TS são inferidos via `z.infer<typeof schema>`.
 */

// Building blocks
export * from './common.js';

// Domínio core (beauty-saas)
export * from './tenant.js';
export * from './plan.js';
export * from './subscription.js';
export * from './user.js';

// Domínio operacional (partilhado com joycehairbeauty via api-client)
export * from './service.js';
export * from './location.js';
export * from './appointment.js';

// Infraestrutura
export * from './webhook.js';
export * from './audit-log.js';