import { describe, expect, it } from 'vitest';
import {
  AuditActionSchema,
  AuditLogCreateInputSchema,
  AuditLogFilterSchema,
  AuditLogSchema,
  AuditSeveritySchema,
} from './audit-log.js';

const validAudit = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  actorId: '660e8400-e29b-41d4-a716-446655440000',
  actorEmail: 'admin@beauty-saas.pt',
  actorIp: '203.0.113.42',
  actorUserAgent: 'Mozilla/5.0 ...',
  action: 'tenant.suspended' as const,
  severity: 'high' as const,
  resourceType: 'tenant',
  resourceId: '770e8400-e29b-41d4-a716-446655440000',
  before: { status: 'active' },
  after: { status: 'suspended' },
  metadata: { reason: 'payment_failed_3x' },
  createdAt: '2026-08-01T00:00:00.000Z',
};

describe('AuditActionSchema', () => {
  it.each([
    'tenant.created',
    'tenant.suspended',
    'tenant.reactivated',
    'tenant.deleted',
    'tenant.gdpr_erase',
    'tenant.gdpr_export',
    'tenant_user.invited',
    'tenant_user.role_changed',
    'tenant_user.deactivated',
    'billing.subscription_canceled',
    'billing.subscription_refunded',
    'billing.coupon_applied',
    'admin.impersonation_started',
    'admin.impersonation_ended',
    'plan.created',
    'plan.updated',
    'plan.archived',
  ] as const)('accepts %s', (a) => {
    expect(AuditActionSchema.parse(a)).toBe(a);
  });

  it('rejects unknown action', () => {
    expect(() => AuditActionSchema.parse('user.hacked' as any)).toThrow();
  });
});

describe('AuditSeveritySchema', () => {
  it.each(['low', 'medium', 'high', 'critical'] as const)('accepts %s', (s) => {
    expect(AuditSeveritySchema.parse(s)).toBe(s);
  });
});

describe('AuditLogSchema', () => {
  it('parses a high-severity suspend action', () => {
    const parsed = AuditLogSchema.parse(validAudit);
    expect(parsed.action).toBe('tenant.suspended');
    expect(parsed.severity).toBe('high');
  });

  it('accepts system action (actorId=null)', () => {
    const parsed = AuditLogSchema.parse({
      ...validAudit,
      actorId: null,
      actorEmail: null,
      action: 'billing.subscription_canceled',
      before: null,
      after: { status: 'canceled' },
    });
    expect(parsed.actorId).toBeNull();
  });

  it('rejects invalid IP', () => {
    expect(() => AuditLogSchema.parse({ ...validAudit, actorIp: '' })).toThrow();
    // 50 chars > max(45)
    expect(() =>
      AuditLogSchema.parse({ ...validAudit, actorIp: 'a'.repeat(50) }),
    ).toThrow();
  });

  it('rejects empty resourceId', () => {
    expect(() => AuditLogSchema.parse({ ...validAudit, resourceId: '' })).toThrow();
  });
});

describe('AuditLogCreateInputSchema', () => {
  it('parses minimal create payload', () => {
    const parsed = AuditLogCreateInputSchema.parse({
      actorId: validAudit.actorId,
      actorEmail: validAudit.actorEmail,
      actorIp: validAudit.actorIp,
      actorUserAgent: validAudit.actorUserAgent,
      action: 'plan.created',
      severity: 'low',
      resourceType: 'plan',
      resourceId: 'plan_123',
    });
    expect(parsed.before).toBeUndefined();
  });
});

describe('AuditLogFilterSchema', () => {
  it('parses partial filter', () => {
    const parsed = AuditLogFilterSchema.parse({
      severity: 'critical',
      fromDate: '2026-01-01T00:00:00Z',
    });
    expect(parsed.action).toBeUndefined();
    expect(parsed.severity).toBe('critical');
  });

  it('rejects invalid severity', () => {
    expect(() => AuditLogFilterSchema.parse({ severity: 'extreme' as any })).toThrow();
  });
});