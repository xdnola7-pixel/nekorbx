CREATE TABLE gift_code_services (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_cop integer NOT NULL DEFAULT 0 CHECK (price_cop >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_code_services_slug_chk CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$')
);
--> statement-breakpoint
CREATE TABLE gift_codes (
  id serial PRIMARY KEY,
  service_id integer NOT NULL REFERENCES gift_code_services(id),
  code text NOT NULL UNIQUE,
  claimed_by text REFERENCES profiles(id),
  claimed_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_codes_claim_pair_chk CHECK ((claimed_by IS NULL) = (claimed_at IS NULL))
);
--> statement-breakpoint
CREATE INDEX gift_codes_stock_idx ON gift_codes (service_id, id) WHERE claimed_by IS NULL;
--> statement-breakpoint
CREATE INDEX gift_codes_claimed_by_idx ON gift_codes (claimed_by, service_id) WHERE claimed_by IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX gift_codes_one_per_user_service_idx ON gift_codes (service_id, claimed_by) WHERE claimed_by IS NOT NULL;