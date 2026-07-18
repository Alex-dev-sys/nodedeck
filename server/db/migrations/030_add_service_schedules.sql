CREATE TABLE service_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_id text NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('start', 'restart', 'stop')),
  local_time time NOT NULL,
  days_of_week smallint[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[],
  timezone text NOT NULL DEFAULT 'UTC',
  enabled boolean NOT NULL DEFAULT true,
  last_run_local_date date,
  last_run_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(days_of_week) BETWEEN 1 AND 7),
  CHECK (days_of_week <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  CHECK (char_length(timezone) BETWEEN 1 AND 80)
);

CREATE INDEX service_schedules_service_idx
  ON service_schedules (organization_id, service_id, created_at);
CREATE INDEX service_schedules_due_idx
  ON service_schedules (service_id, enabled, local_time)
  WHERE enabled = true;

ALTER TABLE service_schedules ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON service_schedules FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON service_schedules FROM authenticated;
  END IF;
END
$$;
