CREATE INDEX IF NOT EXISTS service_schedules_created_by_idx
  ON service_schedules (created_by);
CREATE INDEX IF NOT EXISTS service_schedules_updated_by_idx
  ON service_schedules (updated_by);
