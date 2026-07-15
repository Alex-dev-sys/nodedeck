ALTER TABLE alert_events ADD COLUMN service_id text REFERENCES services(id) ON DELETE CASCADE;

ALTER TABLE alert_events DROP CONSTRAINT alert_events_kind_check;
ALTER TABLE alert_events ADD CONSTRAINT alert_events_kind_check
  CHECK (kind IN ('agent_offline', 'command_failed', 'service_offline', 'host_resource_high'));

CREATE UNIQUE INDEX alert_events_open_service_kind_idx ON alert_events (service_id, kind)
  WHERE status = 'open' AND service_id IS NOT NULL;
