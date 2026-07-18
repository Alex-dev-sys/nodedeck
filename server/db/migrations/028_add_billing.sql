ALTER TABLE public.organizations
  ADD COLUMN plan text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'team')),
  ADD COLUMN subscription_status text NOT NULL DEFAULT 'inactive'
    CHECK (subscription_status IN ('inactive', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'paused', 'incomplete', 'incomplete_expired')),
  ADD COLUMN stripe_customer_id text UNIQUE,
  ADD COLUMN stripe_subscription_id text UNIQUE,
  ADD COLUMN stripe_price_id text,
  ADD COLUMN subscription_current_period_end timestamptz,
  ADD COLUMN subscription_cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN billing_updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE public.billing_events (
  stripe_event_id text PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX billing_events_organization_processed_idx
  ON public.billing_events (organization_id, processed_at DESC);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

-- NodeDeck billing is backend-only. Explicit revokes prevent accidental Data API exposure
-- on Supabase while remaining portable to ordinary PostgreSQL installations.
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.billing_events FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON TABLE public.organizations FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;
