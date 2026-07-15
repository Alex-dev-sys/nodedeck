ALTER TABLE agents
  ADD COLUMN host_cpu numeric,
  ADD COLUMN host_ram numeric,
  ADD COLUMN host_disk numeric,
  ADD COLUMN host_uptime_sec bigint;
