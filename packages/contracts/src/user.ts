/**
 * Users dentro do ecossistema.
 *
 * Existem dois tipos:
 *
 * 1. **TenantUser** — utilizadores com login no SaaS (platform-admin, owner
 *    do tenant, manager, receptionist). Vive em `beauty-saas`.
 * 2. **EndUser** — clientes finais do salão (quem faz o booking). Vive em
 *    `joycehairbeauty` mas o schema é partilhado para o `api-client`
 *    poder validar responses cross-system.
 *
 * TenantUser é o que nos interessa mais aqui — RBAC do tenant.
 *
 * ## RBAC
 *
 * Definido em matriz `role → permission`. Apenas `super_admin` pode alterar
 * permissões. O campo `permissions` em `TenantUser` é **read-only** (caching
 * do role); alteração passa sempre por `role`.
 *
 * | Role          | Permissions | Notas |
 * |---------------|-------------|-------|
 * | super_admin       | 32          | Pode alterar permissões; só `platform-admin` |
 * | admin            | 20          | Owner/manager do tenant — tudo excepto billing rotation |
 * | manager          | 10          | Calendar + services + reports |
 * | receptionist     | 2           | Calendar read + create bookings |
 * | professional     | 0           | Próprio calendário |
 * | client           | 0           | Booking público |
 */
import { z } from 'zod';
import { EmailSchema, IsoDateString, UuidSchema } from './common.js';

/** Papéis disponíveis no tenant. */
export const TenantUserRoleSchema = z.enum([
  'super_admin', // platform-admin only
  'admin', // owner/manager do tenant
  'manager', // gestor operacional
  'receptionist', // front desk
  'professional', // staff que atende
  'client', // cliente final (read-only booking)
]);
export type TenantUserRole = z.infer<typeof TenantUserRoleSchema>;

/**
 * Bitmask de permissões. Cada role tem um número fixo (ver tabela RBAC).
 * Mantemos como `int` para simplicidade; cálculos via bitwise ops.
 *
 * Permissões individuais (bit positions):
 * - 0x01 (1) — calendar.read
 * - 0x02 (2) — calendar.write
 * - 0x04 (4) — services.write
 * - 0x08 (8) — reports.read
 * - 0x10 (16) — billing.read
 * - 0x20 (32) — billing.write
 * - 0x40 (64) — settings.write
 * - 0x80 (128) — impersonate (apenas super_admin)
 */
export const PermissionBitmaskSchema = z.number().int().min(0).max(255);
export type PermissionBitmask = z.infer<typeof PermissionBitmaskSchema>;

/** Schema completo do TenantUser (resposta da API). */
export const TenantUserSchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema,
  email: EmailSchema,
  name: z.string().min(1).max(100),
  role: TenantUserRoleSchema,
  /** Bitmask cached do role — read-only, vem do backend. */
  permissions: PermissionBitmaskSchema,
  /** Locale override do user; se null, usa do tenant. */
  locale: z.enum(['pt-PT', 'en-GB']).nullable(),
  /** Avatar URL. */
  avatarUrl: z.string().url().nullable(),
  /** Activo? false = deactivated, não pode logar. */
  isActive: z.boolean(),
  /** Email confirmado? Bloqueia certas acções até confirmar. */
  emailVerifiedAt: IsoDateString.nullable(),
  /** Último login (null se nunca). */
  lastLoginAt: IsoDateString.nullable(),
  createdAt: IsoDateString,
  updatedAt: IsoDateString,
});
export type TenantUser = z.infer<typeof TenantUserSchema>;

/** Payload para criar um tenant user (convite). */
export const TenantUserInviteInputSchema = z.object({
  tenantId: UuidSchema,
  email: EmailSchema,
  name: z.string().min(1).max(100),
  role: TenantUserRoleSchema,
  /** Mensagem opcional no email de convite. */
  inviteMessage: z.string().max(500).optional(),
});
export type TenantUserInviteInput = z.infer<typeof TenantUserInviteInputSchema>;

/** Payload para actualizar role. Apenas `super_admin` pode chamar. */
export const TenantUserUpdateRoleInputSchema = z.object({
  role: TenantUserRoleSchema,
});
export type TenantUserUpdateRoleInput = z.infer<typeof TenantUserUpdateRoleInputSchema>;

/**
 * EndUser — cliente final do salão.
 * Schema partilhado para o `api-client` validar responses do data plane.
 */
export const EndUserSchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema,
  name: z.string().min(1).max(100),
  email: EmailSchema.nullable(),
  phone: z
    .string()
    .regex(/^\+?[0-9\s()-]{6,20}$/)
    .nullable(),
  /** Locale do user para comunicações. */
  locale: z.enum(['pt-PT', 'en-GB']).default('pt-PT'),
  /** Notas internas (ex.: alergias, preferências). */
  notes: z.string().max(2000).nullable(),
  /** Marketing consent (LGPD/GDPR). */
  marketingConsent: z.boolean(),
  createdAt: IsoDateString,
  updatedAt: IsoDateString,
});
export type EndUser = z.infer<typeof EndUserSchema>;

/** Payload público para criar end user (form de booking). */
export const EndUserPublicInputSchema = z.object({
  tenantId: UuidSchema,
  name: z.string().min(1).max(100),
  email: EmailSchema.nullable().optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9\s()-]{6,20}$/)
    .nullable()
    .optional(),
  marketingConsent: z.boolean().optional(),
});
export type EndUserPublicInput = z.infer<typeof EndUserPublicInputSchema>;

// ─── RBAC matrix — source of truth ──────────────────────────────────────────

/**
 * Matriz RBAC. **Não alterar sem actualizar os testes e docs.**
 *
 * Exposta como constante para que o frontend possa esconder/mostrar UI
 * sem fazer round-trip ao backend. Backend é autoridade — se houver
 * divergência, backend ganha.
 */
export const RBAC_MATRIX = {
  super_admin: 32,
  admin: 20,
  manager: 10,
  receptionist: 2,
  professional: 0,
  client: 0,
} as const satisfies Record<TenantUserRole, number>;

/** Helper: calcula o bitmask de um role. */
export function permissionsForRole(role: TenantUserRole): number {
  return RBAC_MATRIX[role];
}

/** Helper: verifica se um bitmask tem uma permissão. */
export function hasPermission(bitmask: number, permission: number): boolean {
  return (bitmask & permission) === permission;
}