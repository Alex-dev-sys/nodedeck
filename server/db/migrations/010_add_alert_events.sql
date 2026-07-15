CREATE TABLE alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  command_id uuid REFERENCES commands(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('agent_offline', 'command_failed')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  title text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX alert_events_org_opened_idx ON alert_events (organization_id, opened_at DESC);
CREATE UNIQUE INDEX alert_events_failed_command_idx ON alert_events (command_id) WHERE command_id IS NOT NULL;
