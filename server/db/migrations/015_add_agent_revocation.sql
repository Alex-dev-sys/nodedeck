ALTER TABLE agents ADD COLUMN revoked_at timestamptz;

ALTER TABLE agents DROP CONSTRAINT agents_organization_id_name_key;
CREATE UNIQUE INDEX agents_organization_name_active_idx ON agents (organization_id, name) WHERE revoked_at IS NULL;
CREATE INDEX agents_active_organization_last_seen_idx ON agents (organization_id, last_seen_at DESC) WHERE revoked_at IS NULL;
