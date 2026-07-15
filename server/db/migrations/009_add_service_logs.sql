CREATE TABLE service_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_id text NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL CHECK (level IN ('info', 'warn', 'error', 'debug')),
  text text NOT NULL CHECK (char_length(text) <= 4000)
);
CREATE INDEX service_logs_service_time_idx ON service_logs (organization_id, service_id, occurred_at DESC);
