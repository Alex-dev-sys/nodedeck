ALTER TABLE services ADD COLUMN agent_id uuid REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE services ADD COLUMN container_id text;
CREATE UNIQUE INDEX services_agent_container_idx ON services (agent_id, container_id) WHERE container_id IS NOT NULL;
