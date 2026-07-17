-- NodeDeck uses a trusted direct Postgres connection. The Supabase Data API roles
-- must not have privileges on backend-only product data, even if a future RLS
-- policy is accidentally added or disabled.
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE private.security_rate_limits (
  scope text NOT NULL,
  key_hash text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (scope, key_hash, window_start)
);

CREATE INDEX security_rate_limits_expiry_idx
  ON private.security_rate_limits (expires_at);

-- Cover foreign-key and retention paths so an attacker cannot turn normal
-- cleanup or tenant deletion into avoidable sequential scans.
CREATE INDEX IF NOT EXISTS agent_enrollments_created_by_idx ON public.agent_enrollments (created_by);
CREATE INDEX IF NOT EXISTS agent_enrollments_expiry_idx ON public.agent_enrollments (expires_at);
CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS commands_requested_by_idx ON public.commands (requested_by);
CREATE INDEX IF NOT EXISTS commands_service_id_idx ON public.commands (service_id);
CREATE INDEX IF NOT EXISTS host_metric_samples_agent_id_idx ON public.host_metric_samples (agent_id);
CREATE INDEX IF NOT EXISTS incidents_resolved_by_idx ON public.incidents (resolved_by);
CREATE INDEX IF NOT EXISTS notification_channels_created_by_idx ON public.notification_channels (created_by);
CREATE INDEX IF NOT EXISTS notification_deliveries_channel_id_idx ON public.notification_deliveries (channel_id);
CREATE INDEX IF NOT EXISTS organization_members_user_id_idx ON public.organization_members (user_id);
CREATE INDEX IF NOT EXISTS refresh_sessions_organization_id_idx ON public.refresh_sessions (organization_id);
CREATE INDEX IF NOT EXISTS refresh_sessions_expiry_idx ON public.refresh_sessions (expires_at);
CREATE INDEX IF NOT EXISTS service_logs_service_id_idx ON public.service_logs (service_id);
CREATE INDEX IF NOT EXISTS service_logs_retention_idx ON public.service_logs (occurred_at);
