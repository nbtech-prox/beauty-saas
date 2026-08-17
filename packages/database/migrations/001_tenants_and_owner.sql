CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'suspended')),
  timezone text NOT NULL DEFAULT 'Europe/Lisbon',
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  locale text NOT NULL DEFAULT 'pt-PT',
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tenants_slug_nonempty CHECK (char_length(btrim(slug)) > 0)
);

CREATE UNIQUE INDEX tenants_slug_ci_unique ON tenants (lower(slug));

CREATE TABLE tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  role text NOT NULL
    CHECK (role IN ('super_admin', 'admin', 'manager', 'receptionist', 'professional', 'client')),
  permissions integer NOT NULL DEFAULT 0 CHECK (permissions BETWEEN 0 AND 255),
  is_owner boolean NOT NULL DEFAULT false,
  password_hash text NOT NULL CHECK (char_length(password_hash) > 0),
  locale text,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tenant_users_email_nonempty CHECK (char_length(btrim(email)) > 0),
  CONSTRAINT tenant_users_owner_admin CHECK (NOT is_owner OR role = 'admin')
);

CREATE UNIQUE INDEX tenant_users_tenant_email_ci_unique
  ON tenant_users (tenant_id, lower(email));
CREATE UNIQUE INDEX tenant_users_owner_email_ci_unique
  ON tenant_users (lower(email)) WHERE is_owner;
CREATE UNIQUE INDEX tenant_users_single_owner_per_tenant
  ON tenant_users (tenant_id) WHERE is_owner;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_isolados_por_tenant ON tenants
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_users_isolados_por_tenant ON tenant_users
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

