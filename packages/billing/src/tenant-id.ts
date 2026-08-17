import { UuidSchema } from '@beauty-saas/contracts';

export class InvalidTenantIdError extends Error {
  readonly code = 'invalid_tenant_id' as const;
  readonly httpStatus = 400 as const;

  constructor(readonly tenantId: string) {
    super('tenantId deve ser um UUID válido');
    this.name = 'InvalidTenantIdError';
  }
}

export function assertValidTenantId(tenantId: string): void {
  if (!UuidSchema.safeParse(tenantId).success) {
    throw new InvalidTenantIdError(tenantId);
  }
}
