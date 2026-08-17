CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  plan_code text NOT NULL CHECK (
    plan_code IN (
      'starter-monthly',
      'starter-yearly',
      'pro-monthly',
      'pro-yearly',
      'enterprise-monthly',
      'enterprise-yearly'
    )
  ),
  stripe_price_id text NOT NULL CHECK (stripe_price_id LIKE 'price\_%'),
  external_id text NOT NULL UNIQUE,
  external_customer_id text NOT NULL,
  status text NOT NULL CHECK (
    status IN (
      'incomplete',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    )
  ),
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  trial_end timestamptz,
  cancel_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT subscriptions_period_order
    CHECK (current_period_end >= current_period_start),
  CONSTRAINT subscriptions_stripe_price_id_nonempty
    CHECK (char_length(btrim(stripe_price_id)) > 0),
  CONSTRAINT subscriptions_external_id_nonempty
    CHECK (char_length(btrim(external_id)) > 0),
  CONSTRAINT subscriptions_external_customer_id_nonempty
    CHECK (char_length(btrim(external_customer_id)) > 0),
  UNIQUE (tenant_id, plan_code)
);

CREATE INDEX subscriptions_tenant_status_idx
  ON subscriptions (tenant_id, status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_isolados_por_tenant ON subscriptions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'stripe',
  event_id text NOT NULL,
  event_type text NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  signature_status text NOT NULL DEFAULT 'verified'
    CHECK (signature_status IN ('verified', 'invalid_signature', 'invalid_config')),
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at timestamptz,
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (
      processing_status IN ('pending', 'processing', 'processed', 'failed', 'ignored')
    ),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  CONSTRAINT webhook_events_provider_nonempty
    CHECK (char_length(btrim(provider)) > 0),
  CONSTRAINT webhook_events_event_id_nonempty
    CHECK (char_length(btrim(event_id)) > 0),
  CONSTRAINT webhook_events_event_type_nonempty
    CHECK (char_length(btrim(event_type)) > 0),
  UNIQUE (provider, event_id)
);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events FORCE ROW LEVEL SECURITY;
-- tenant-scoped role sem app.tenant_id falha fechado (zero rows).
-- Linhas com tenant_id IS NULL só são visíveis a roles com BYPASSRLS
-- (ex.: a role de migrations que insere eventos cross-tenant).
CREATE POLICY webhook_events_isolados_por_tenant ON webhook_events
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES tenant_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT audit_logs_action_nonempty
    CHECK (char_length(btrim(action)) > 0),
  CONSTRAINT audit_logs_entity_type_nonempty
    CHECK (char_length(btrim(entity_type)) > 0)
);

CREATE INDEX audit_logs_tenant_occurred_at_idx
  ON audit_logs (tenant_id, occurred_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
-- Mesma política fail-closed do webhook_events: audit cross-tenant (tenant_id NULL)
-- só é visível a roles com BYPASSRLS (ex.: role de migrations).
CREATE POLICY audit_logs_isolados_por_tenant ON audit_logs
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
