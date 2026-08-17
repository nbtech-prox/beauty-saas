import type { Pool } from 'pg';

export type TenantStatus =
  'trialing' | 'active' | 'past_due' | 'canceled' | 'suspended';
export type TenantUserRole =
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'receptionist'
  | 'professional'
  | 'client';

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  timezone: string;
  currency: 'EUR';
  locale: string;
  trialEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantUserRecord {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: TenantUserRole;
  permissions: number;
  isOwner: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTenantWithOwnerInput {
  slug: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
  passwordHash: string;
  trialEndsAt: Date | null;
}

export interface CreateTenantWithOwnerResult {
  tenant: TenantRecord;
  owner: TenantUserRecord;
}

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  timezone: string;
  currency: 'EUR';
  locale: string;
  trial_ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface TenantUserRow {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: TenantUserRole;
  permissions: number;
  is_owner: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function createTenantWithOwner(
  pool: Pool,
  input: CreateTenantWithOwnerInput,
): Promise<CreateTenantWithOwnerResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tenantIdResult = await client.query<{ id: string }>(
      'SELECT gen_random_uuid() AS id',
    );
    const tenantId = tenantIdResult.rows[0]?.id;
    if (!tenantId) throw new Error('A geração do ID do tenant falhou.');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [
      tenantId,
    ]);

    const tenantResult = await client.query<TenantRow>(
      `INSERT INTO tenants (id, slug, name, trial_ends_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        tenantId,
        input.slug.trim().toLowerCase(),
        input.name,
        input.trialEndsAt,
      ],
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) throw new Error('A criação do tenant não devolveu registo.');

    const ownerResult = await client.query<TenantUserRow>(
      `INSERT INTO tenant_users
         (tenant_id, email, name, role, permissions, is_owner, password_hash)
       VALUES ($1, $2, $3, 'admin', 20, true, $4)
       RETURNING id, tenant_id, email, name, role, permissions, is_owner,
         is_active, created_at, updated_at`,
      [
        tenant.id,
        input.ownerEmail.trim().toLowerCase(),
        input.ownerName,
        input.passwordHash,
      ],
    );
    const owner = ownerResult.rows[0];
    if (!owner) throw new Error('A criação do owner não devolveu registo.');

    await client.query('COMMIT');
    return { tenant: mapTenant(tenant), owner: mapTenantUser(owner) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function mapTenant(row: TenantRow): TenantRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    timezone: row.timezone,
    currency: row.currency,
    locale: row.locale,
    trialEndsAt: row.trial_ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTenantUser(row: TenantUserRow): TenantUserRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    name: row.name,
    role: row.role,
    permissions: row.permissions,
    isOwner: row.is_owner,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
