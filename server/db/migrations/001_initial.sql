CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'operator', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE services (
  id text PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL CHECK (status IN ('healthy', 'degraded', 'restarting', 'updating', 'offline')),
  hostname text NOT NULL,
  version text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id text NOT NULL REFERENCES services(id),
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  title text NOT NULL,
  root_cause text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  CHECK ((resolved_at IS NULL) = (resolved_by IS NULL))
);

CREATE TABLE commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id text NOT NULL REFERENCES services(id),
  action text NOT NULL CHECK (action IN ('start', 'restart', 'stop', 'rollback')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  requested_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  target text NOT NULL,
  result text NOT NULL CHECK (result IN ('ok', 'denied', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX incidents_open_idx ON incidents (service_id, started_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX commands_queue_idx ON commands (status, created_at) WHERE status = 'queued';
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);

INSERT INTO services (id, name, kind, status, hostname, version)
VALUES
  ('minecraft', 'Minecraft', 'minecraft', 'healthy', 'mc-01', '1.21.4'),
  ('website', 'Website', 'website', 'healthy', 'web-01', '4.1.2'),
  ('api', 'API', 'api', 'healthy', 'api-01', '2.8.0'),
  ('postgres', 'PostgreSQL', 'postgres', 'healthy', 'db-01', '17.2'),
  ('redis', 'Redis', 'redis', 'healthy', 'cache-01', '7.4.1')
ON CONFLICT (id) DO NOTHING;
