import { describe, expect, it } from 'vitest';
import {
  EndUserPublicInputSchema,
  EndUserSchema,
  PermissionBitmaskSchema,
  RBAC_MATRIX,
  TenantUserInviteInputSchema,
  TenantUserRoleSchema,
  TenantUserSchema,
  TenantUserUpdateRoleInputSchema,
  hasPermission,
  permissionsForRole,
} from './user.js';

const validTenantUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: '660e8400-e29b-41d4-a716-446655440000',
  email: 'manager@salao.pt',
  name: 'Maria Silva',
  role: 'manager' as const,
  permissions: 10,
  locale: 'pt-PT' as const,
  avatarUrl: null,
  isActive: true,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: '2026-08-01T09:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-08-01T09:00:00.000Z',
};

describe('TenantUserSchema', () => {
  it('parses a valid manager', () => {
    const parsed = TenantUserSchema.parse(validTenantUser);
    expect(parsed.role).toBe('manager');
    expect(parsed.permissions).toBe(10);
  });

  it('rejects unknown role', () => {
    expect(() =>
      TenantUserSchema.parse({ ...validTenantUser, role: 'owner' as any }),
    ).toThrow();
  });

  it('rejects permission > 255 (8-bit)', () => {
    expect(() =>
      TenantUserSchema.parse({ ...validTenantUser, permissions: 256 }),
    ).toThrow();
  });

  it('rejects negative permissions', () => {
    expect(() =>
      TenantUserSchema.parse({ ...validTenantUser, permissions: -1 }),
    ).toThrow();
  });

  it('accepts null avatar', () => {
    const parsed = TenantUserSchema.parse({ ...validTenantUser, avatarUrl: null });
    expect(parsed.avatarUrl).toBeNull();
  });
});

describe('TenantUserRoleSchema', () => {
  it.each([
    'super_admin',
    'admin',
    'manager',
    'receptionist',
    'professional',
    'client',
  ] as const)('accepts role %s', (r) => {
    expect(TenantUserRoleSchema.parse(r)).toBe(r);
  });
  it('rejects unknown role', () => {
    expect(() => TenantUserRoleSchema.parse('owner' as any)).toThrow();
  });
});

describe('TenantUserInviteInputSchema', () => {
  it('parses invite payload', () => {
    const parsed = TenantUserInviteInputSchema.parse({
      tenantId: validTenantUser.tenantId,
      email: 'new@salao.pt',
      name: 'João',
      role: 'receptionist',
    });
    expect(parsed.role).toBe('receptionist');
  });
});

describe('TenantUserUpdateRoleInputSchema', () => {
  it('only accepts role field', () => {
    const parsed = TenantUserUpdateRoleInputSchema.parse({ role: 'admin' });
    expect(parsed.role).toBe('admin');
  });
});

describe('EndUserSchema', () => {
  it('parses end user with default locale', () => {
    const parsed = EndUserSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      tenantId: '660e8400-e29b-41d4-a716-446655440000',
      name: 'Cliente Teste',
      email: null,
      phone: null,
      notes: null,
      marketingConsent: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.locale).toBe('pt-PT');
  });
});

describe('EndUserPublicInputSchema', () => {
  it('parses guest booking payload', () => {
    const parsed = EndUserPublicInputSchema.parse({
      tenantId: '660e8400-e29b-41d4-a716-446655440000',
      name: 'Guest',
      phone: '+351 912 345 678',
    });
    expect(parsed.email).toBeUndefined();
  });
});

describe('RBAC_MATRIX', () => {
  it('matches documented values', () => {
    expect(RBAC_MATRIX.super_admin).toBe(32);
    expect(RBAC_MATRIX.admin).toBe(20);
    expect(RBAC_MATRIX.manager).toBe(10);
    expect(RBAC_MATRIX.receptionist).toBe(2);
    expect(RBAC_MATRIX.professional).toBe(0);
    expect(RBAC_MATRIX.client).toBe(0);
  });

  it('permissionsForRole returns matrix value', () => {
    expect(permissionsForRole('super_admin')).toBe(32);
    expect(permissionsForRole('receptionist')).toBe(2);
    expect(permissionsForRole('client')).toBe(0);
  });

  it('hasPermission bitmask check', () => {
    expect(hasPermission(32, 32)).toBe(true); // super_admin has billing.write
    expect(hasPermission(10, 32)).toBe(false); // manager doesn't
    expect(hasPermission(2, 2)).toBe(true); // receptionist has calendar.write
    expect(hasPermission(2, 4)).toBe(false); // but not services.write
  });
});

describe('PermissionBitmaskSchema', () => {
  it('accepts 0..255', () => {
    expect(PermissionBitmaskSchema.parse(0)).toBe(0);
    expect(PermissionBitmaskSchema.parse(255)).toBe(255);
  });
  it('rejects > 255', () => {
    expect(() => PermissionBitmaskSchema.parse(256)).toThrow();
  });
});