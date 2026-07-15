ALTER TABLE commands ADD COLUMN agent_id uuid REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE commands ADD COLUMN lease_expires_at timestamptz;
CREATE INDEX commands_agent_queue_idx ON commands (agent_id, created_at) WHERE status = 'queued';
