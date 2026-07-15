INSERT INTO services (id, name, kind, status, hostname, version)
VALUES
  ('storage', 'Object Storage', 'storage', 'healthy', 'stor-01', 'MinIO RELEASE.2025'),
  ('queue', 'Message Queue', 'queue', 'healthy', 'app-01', 'NATS 2.10'),
  ('ci', 'CI/CD Runner', 'ci', 'healthy', 'core-01', 'Runner 17.8')
ON CONFLICT (id) DO NOTHING;
