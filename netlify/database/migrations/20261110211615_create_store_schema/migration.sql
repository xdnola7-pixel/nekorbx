CREATE TABLE "admin_audit_logs" (
	"id" serial PRIMARY KEY,
	"admin_id" text NOT NULL,
	"admin_email" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY,
	"slug" text NOT NULL UNIQUE,
	"name_es" text NOT NULL,
	"name_en" text NOT NULL,
	"description_es" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'sparkle' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" serial PRIMARY KEY,
	"code" text NOT NULL UNIQUE,
	"description" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'percent' NOT NULL,
	"value" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"max_uses_per_user" integer,
	"min_subtotal_cop" integer,
	"product_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"category_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_kind_chk" CHECK ("kind" in ('percent','fixed')),
	CONSTRAINT "discount_value_chk" CHECK ("value" > 0 and ("kind" <> 'percent' or "value" <= 100)),
	CONSTRAINT "discount_code_chk" CHECK ("code" ~ '^[A-Z0-9_-]{3,32}$'),
	CONSTRAINT "discount_max_chk" CHECK ("max_uses" is null or "max_uses" > 0)
);
--> statement-breakpoint
CREATE TABLE "discount_redemptions" (
	"id" serial PRIMARY KEY,
	"discount_code_id" integer NOT NULL,
	"order_id" text NOT NULL UNIQUE,
	"user_id" text NOT NULL,
	"amount_cop" integer NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redemptions_status_chk" CHECK ("status" in ('applied','voided'))
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" serial PRIMARY KEY,
	"product_id" integer,
	"title_es" text NOT NULL,
	"title_en" text NOT NULL,
	"description_es" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"promo_price_cop" integer,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_promo_chk" CHECK ("promo_price_cop" is null or "promo_price_cop" > 0),
	CONSTRAINT "offers_dates_chk" CHECK ("starts_at" is null or "ends_at" is null or "ends_at" > "starts_at")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY,
	"order_id" text NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"category_slug" text NOT NULL,
	"duration_days" integer,
	"unit_price_cop" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_cop" integer NOT NULL,
	CONSTRAINT "order_items_qty_chk" CHECK ("quantity" between 1 and 100),
	CONSTRAINT "order_items_total_chk" CHECK ("line_total_cop" = "unit_price_cop" * "quantity")
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" serial PRIMARY KEY,
	"order_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"changed_by" text,
	"changed_by_email" text,
	"actor_type" text DEFAULT 'customer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"subtotal_cop" integer NOT NULL,
	"discount_cop" integer DEFAULT 0 NOT NULL,
	"total_cop" integer NOT NULL,
	"discount_code_id" integer,
	"discount_code" text,
	"usd_rate" numeric(12,2),
	"customer_note" text DEFAULT '' NOT NULL,
	"admin_notes" text DEFAULT '' NOT NULL,
	"payment_reference" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "orders_id_chk" CHECK ("id" ~ '^NEKO-[0-9A-F]{6}$'),
	CONSTRAINT "orders_status_chk" CHECK ("status" in ('pending_payment','in_review','payment_verified','preparing','delivered','cancelled','refunded')),
	CONSTRAINT "orders_amounts_chk" CHECK ("subtotal_cop" >= 0 and "discount_cop" >= 0 and "discount_cop" <= "subtotal_cop" and "total_cop" = "subtotal_cop" - "discount_cop")
);
--> statement-breakpoint
CREATE TABLE "payment_records" (
	"id" serial PRIMARY KEY,
	"order_id" text NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"method" text DEFAULT '' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"amount_cop" integer,
	"status" text DEFAULT 'reported' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"recorded_by" text,
	"recorded_by_email" text,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_records_status_chk" CHECK ("status" in ('reported','verified','rejected'))
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" serial PRIMARY KEY,
	"product_id" integer NOT NULL,
	"old_price_cop" integer,
	"new_price_cop" integer NOT NULL,
	"old_price_usd" numeric(10,2),
	"new_price_usd" numeric(10,2),
	"reason" text DEFAULT '' NOT NULL,
	"changed_by" text,
	"changed_by_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY,
	"category_id" integer NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"name_es" text NOT NULL,
	"name_en" text NOT NULL,
	"description_es" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"price_cop" integer NOT NULL,
	"price_usd" numeric(10,2),
	"duration_days" integer,
	"robux_amount" integer,
	"icon" text DEFAULT 'sparkle' NOT NULL,
	"image_url" text,
	"tag_es" text,
	"tag_en" text,
	"status" text DEFAULT 'available' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"max_per_order" integer DEFAULT 10 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_price_chk" CHECK ("price_cop" > 0),
	CONSTRAINT "products_status_chk" CHECK ("status" in ('available','sold_out')),
	CONSTRAINT "products_max_chk" CHECK ("max_per_order" between 1 and 100),
	CONSTRAINT "products_duration_chk" CHECK ("duration_days" is null or "duration_days" > 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY,
	"email" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"locale" text DEFAULT 'es' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text,
	"role" text,
	"granted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_pkey" PRIMARY KEY("user_id","role"),
	CONSTRAINT "user_roles_role_chk" CHECK ("role" in ('admin'))
);
--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "admin_audit_logs" ("created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "admin_audit_logs" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "redemptions_code_idx" ON "discount_redemptions" ("discount_code_id","status");--> statement-breakpoint
CREATE INDEX "redemptions_user_idx" ON "discount_redemptions" ("user_id","discount_code_id");--> statement-breakpoint
CREATE INDEX "offers_product_idx" ON "offers" ("product_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" ("product_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idem_idx" ON "orders" ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" ("created_at");--> statement-breakpoint
CREATE INDEX "payment_records_order_idx" ON "payment_records" ("order_id");--> statement-breakpoint
CREATE INDEX "price_history_product_idx" ON "price_history" ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" ("category_id","sort_order");--> statement-breakpoint
CREATE INDEX "profiles_email_idx" ON "profiles" ("email");--> statement-breakpoint
CREATE INDEX "profiles_created_idx" ON "profiles" ("created_at");--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_discount_code_id_discount_codes_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "discount_codes"("id");--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id");--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id");--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_code_id_discount_codes_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "discount_codes"("id");--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id");--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;