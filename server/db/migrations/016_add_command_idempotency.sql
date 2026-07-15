ALTER TABLE commands ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX commands_organization_idempotency_idx ON commands (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
