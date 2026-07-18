ALTER TABLE agents
  ADD COLUMN agent_version text,
  ADD COLUMN track_host_metrics boolean NOT NULL DEFAULT true,
  ADD COLUMN track_docker boolean NOT NULL DEFAULT true,
  ADD COLUMN track_native boolean NOT NULL DEFAULT true,
  ADD COLUMN collect_logs boolean NOT NULL DEFAULT true,
  ADD COLUMN remote_control boolean NOT NULL DEFAULT true,
  ADD COLUMN settings_updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE agents
  ADD CONSTRAINT agents_agent_version_check
  CHECK (agent_version IS NULL OR char_length(agent_version) BETWEEN 1 AND 64);
