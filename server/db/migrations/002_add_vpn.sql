INSERT INTO services (id, name, kind, status, hostname, version)
VALUES ('vpn', 'VPN Gateway', 'vpn', 'healthy', 'edge-01', 'WireGuard 1.0')
ON CONFLICT (id) DO NOTHING;
