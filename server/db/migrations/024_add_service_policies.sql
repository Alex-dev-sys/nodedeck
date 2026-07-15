CREATE TABLE service_policies (
  service_id text PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  display_name text,
  control_enabled boolean NOT NULL DEFAULT true,
  auto_recovery boolean NOT NULL DEFAULT false,
  recovery_delay_sec integer NOT NULL DEFAULT 120,
  cpu_alert_threshold integer NOT NULL DEFAULT 90,
  ram_alert_threshold integer NOT NULL DEFAULT 90,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 80),
  CHECK (recovery_delay_sec BETWEEN 60 AND 900),
  CHECK (cpu_alert_threshold BETWEEN 50 AND 100),
  CHECK (ram_alert_threshold BETWEEN 50 AND 100),
  UNIQUE (organization_id, service_id)
);

ALTER TABLE services
  ADD COLUMN desired_state text NOT NULL DEFAULT 'running',
  ADD CONSTRAINT services_desired_state_check CHECK (desired_state IN ('running', 'stopped'));

CREATE INDEX service_policies_organization_idx ON service_policies (organization_id);
CREATE INDEX service_policies_created_by_idx ON service_policies (created_by);
CREATE INDEX service_policies_updated_by_idx ON service_policies (updated_by);
CREATE INDEX service_policies_auto_recovery_idx ON service_policies (organization_id, service_id)
  WHERE auto_recovery = true AND control_enabled = true;

ALTER TABLE service_policies ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON service_policies FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON service_policies FROM authenticated;
  END IF;
END
$$;

ALTER TABLE alert_events DROP CONSTRAINT IF EXISTS alert_events_kind_check;
ALTER TABLE alert_events ADD CONSTRAINT alert_events_kind_check
  CHECK (kind IN ('agent_offline', 'command_failed', 'service_offline', 'service_unhealthy', 'host_resource_high', 'service_resource_high'));
