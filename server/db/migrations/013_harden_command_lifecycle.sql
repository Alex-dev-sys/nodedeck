ALTER TABLE commands
  ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  ADD COLUMN claimed_at timestamptz;

ALTER TABLE commands DROP CONSTRAINT commands_status_check;
ALTER TABLE commands ADD CONSTRAINT commands_status_check
  CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired'));

CREATE INDEX commands_organization_status_created_idx ON commands (organization_id, status, created_at DESC);
