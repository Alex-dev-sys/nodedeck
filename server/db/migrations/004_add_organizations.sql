CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO organizations (name) VALUES ('Default organization') ON CONFLICT (name) DO NOTHING;

CREATE TABLE organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'operator', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE services ADD COLUMN organization_id uuid;
ALTER TABLE incidents ADD COLUMN organization_id uuid;
ALTER TABLE commands ADD COLUMN organization_id uuid;
ALTER TABLE audit_logs ADD COLUMN organization_id uuid;

UPDATE services SET organization_id = (SELECT id FROM organizations WHERE name = 'Default organization');
UPDATE incidents SET organization_id = (SELECT id FROM organizations WHERE name = 'Default organization');
UPDATE commands SET organization_id = (SELECT id FROM organizations WHERE name = 'Default organization');
UPDATE audit_logs SET organization_id = (SELECT id FROM organizations WHERE name = 'Default organization');

INSERT INTO organization_members (organization_id, user_id, role)
SELECT (SELECT id FROM organizations WHERE name = 'Default organization'), id, role FROM users
ON CONFLICT (organization_id, user_id) DO NOTHING;

ALTER TABLE services ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE incidents ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE commands ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE services ADD CONSTRAINT services_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE incidents ADD CONSTRAINT incidents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE commands ADD CONSTRAINT commands_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);

CREATE INDEX services_organization_name_idx ON services (organization_id, name);
CREATE INDEX incidents_organization_started_idx ON incidents (organization_id, started_at DESC);
CREATE INDEX commands_organization_created_idx ON commands (organization_id, created_at DESC);
CREATE INDEX audit_logs_organization_created_idx ON audit_logs (organization_id, created_at DESC);
