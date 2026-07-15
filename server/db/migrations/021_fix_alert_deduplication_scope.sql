DROP INDEX IF EXISTS alert_events_open_agent_kind_idx;

CREATE UNIQUE INDEX alert_events_open_agent_kind_idx
  ON alert_events (agent_id, kind)
  WHERE status = 'open'
    AND agent_id IS NOT NULL
    AND service_id IS NULL
    AND command_id IS NULL;

