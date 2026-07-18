ALTER TABLE public.refresh_sessions
  ADD COLUMN family_id uuid,
  ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN user_agent text,
  ADD COLUMN ip_hash text CHECK (ip_hash IS NULL OR ip_hash ~ '^[a-f0-9]{64}$');

UPDATE public.refresh_sessions SET family_id = id WHERE family_id IS NULL;

ALTER TABLE public.refresh_sessions
  ALTER COLUMN family_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN family_id SET NOT NULL;

CREATE INDEX refresh_sessions_family_idx ON public.refresh_sessions (family_id);
CREATE INDEX refresh_sessions_user_active_created_idx
  ON public.refresh_sessions (user_id, created_at DESC) WHERE revoked_at IS NULL;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.refresh_sessions FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;
