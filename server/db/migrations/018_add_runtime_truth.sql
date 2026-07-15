ALTER TABLE services
  ADD COLUMN runtime_state text,
  ADD COLUMN health_status text,
  ADD COLUMN restart_count integer NOT NULL DEFAULT 0,
  ADD COLUMN started_at timestamptz,
  ADD COLUMN compose_project text,
  ADD COLUMN compose_service text,
  ADD COLUMN ports jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN is_protected boolean NOT NULL DEFAULT false;

CREATE TABLE host_metric_samples (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  cpu numeric NOT NULL,
  ram numeric NOT NULL,
  disk numeric NOT NULL,
  uptime_sec bigint NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX host_metric_samples_org_recorded_idx
  ON host_metric_samples (organization_id, recorded_at DESC);

ALTER TABLE alert_events DROP CONSTRAINT alert_events_kind_check;
ALTER TABLE alert_events ADD CONSTRAINT alert_events_kind_check
  CHECK (kind IN ('agent_offline', 'command_failed', 'service_offline', 'service_unhealthy', 'host_resource_high'));
