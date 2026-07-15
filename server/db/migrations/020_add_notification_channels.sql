CREATE TABLE notification_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('telegram', 'webhook')),
  name text NOT NULL,
  target text NOT NULL,
  config_encrypted text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE notification_deliveries (
  alert_id uuid NOT NULL REFERENCES alert_events(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('sending', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  PRIMARY KEY (alert_id, channel_id)
);

CREATE INDEX notification_channels_org_enabled_idx
  ON notification_channels (organization_id, enabled) WHERE enabled = true;

