WITH duplicates AS (
  SELECT id, row_number() OVER (
    PARTITION BY agent_id, service_id, occurred_at, md5(text)
    ORDER BY id
  ) AS position
  FROM service_logs
)
DELETE FROM service_logs
WHERE id IN (SELECT id FROM duplicates WHERE position > 1);

CREATE UNIQUE INDEX service_logs_agent_event_idx
  ON service_logs (agent_id, service_id, occurred_at, md5(text));
