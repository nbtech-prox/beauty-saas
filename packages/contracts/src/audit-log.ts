/**
 * Audit log — rastreio de acções sensíveis executadas por platform-admin.
 *
 * Apenas platform-admin tem acesso a estes registos (RBAC: super_admin).
 * Captura: actor, IP, user agent, action, target, before/after, timestamp.
 *
 * Conformidade LGPD/GDPR: cada `gdpr_erase` e `gdpr_export` fica registado.
 */
import { z } from 'zod';
import { IsoDateString, UuidSchema } from './common.js';

/** Categoria da acção auditada. */
export const AuditActionSchema = z.enum([
  // Tenant lifecycle
  'tenant.created',
  'tenant.suspended',
  'tenant.reactivated',
  'tenant.deleted',
  'tenant.gdpr_erase',
  'tenant.gdpr_export',
  // Tenant users
  'tenant_user.invited',
  'tenant_user.role_changed',
  'tenant_user.deactivated',
  // Billing
  'billing.subscription_canceled',
  'billing.subscription_refunded',
  'billing.coupon_applied',
  // Impersonation
  'admin.impersonation_started',
  'admin.impersonation_ended',
  // Plan management
  'plan.created',
  'plan.updated',
  'plan.archived',
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

/** Severidade da acção (define retenção). */
export const AuditSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type AuditSeverity = z.infer<typeof AuditSeveritySchema>;

/** Schema do registo de audit log. */
export const AuditLogSchema = z.object({
  id: UuidSchema,
  /** ID do actor (TenantUser que fez a acção). Null em acções de sistema. */
  actorId: UuidSchema.nullable(),
  /** Email do actor (cached no momento da acção para histórico). */
  actorEmail: z.string().email().nullable(),
  /** IP do request. */
  actorIp: z.string().min(1).max(45), // IPv4 ou IPv6
  /** User agent do request. */
  actorUserAgent: z.string().max(500),
  /** Categoria da acção. */
  action: AuditActionSchema,
  /** Severidade (define retenção). */
  severity: AuditSeveritySchema,
  /** Tipo de recurso afectado (ex.: `tenant`, `plan`). */
  resourceType: z.string().min(1).max(64),
  /** ID do recurso afectado (ex.: tenantId). */
  resourceId: z.string().min(1).max(128),
  /** Snapshot ANTES da alteração (null em creates). */
  before: z.record(z.string(), z.unknown()).nullable(),
  /** Snapshot DEPOIS da alteração (null em deletes). */
  after: z.record(z.string(), z.unknown()).nullable(),
  /** Metadata extra (requestId, reason, etc.). */
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: IsoDateString,
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

/** Input para registar uma acção (chamado pelo backend). */
export const AuditLogCreateInputSchema = z.object({
  actorId: UuidSchema.nullable(),
  actorEmail: z.string().email().nullable(),
  actorIp: z.string().min(1).max(45),
  actorUserAgent: z.string().max(500),
  action: AuditActionSchema,
  severity: AuditSeveritySchema,
  resourceType: z.string().min(1).max(64),
  resourceId: z.string().min(1).max(128),
  before: z.record(z.string(), z.unknown()).nullable().optional(),
  after: z.record(z.string(), z.unknown()).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export type AuditLogCreateInput = z.infer<typeof AuditLogCreateInputSchema>;

/** Filtros para listar audit logs. */
export const AuditLogFilterSchema = z.object({
  actorId: UuidSchema.optional(),
  action: AuditActionSchema.optional(),
  severity: AuditSeveritySchema.optional(),
  resourceType: z.string().min(1).max(64).optional(),
  resourceId: z.string().min(1).max(128).optional(),
  /** Limite inferior (inclusive) — ISO 8601. */
  fromDate: z.string().datetime({ offset: true }).optional(),
  /** Limite superior (exclusive). */
  toDate: z.string().datetime({ offset: true }).optional(),
});
export type AuditLogFilter = z.infer<typeof AuditLogFilterSchema>;