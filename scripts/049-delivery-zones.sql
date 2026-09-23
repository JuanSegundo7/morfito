-- ============================================================
-- Morfito — settings port from jebbs-dashboard: delivery_zones (049)
-- ============================================================
--
-- WHAT THIS FILE IS
-- ------------------
-- Per-zone delivery pricing, dashboard side: a `delivery_zones` table the
-- owner manages from Configuración > Envíos, plus three snapshot/flag
-- columns on `orders`. Ported from jebbs-dashboard's
-- scripts/019-delivery-zones.sql, minus the parts that are tenant-specific
-- (see below).
--
-- `delivery_zones` columns
-- -------------------------------------------------------------------------
--   - `fee` is CHECKed >= 0 — the one exception to this schema's usual
--     "validate in the UI/TS layer, not with constraints" convention: it is
--     money charged to a customer, not internal bookkeeping.
--   - `is_active` — zones are soft-deleted only (UPDATE is_active = false).
--     There is no DELETE path: `orders.delivery_zone_id` below references a
--     zone with no ON DELETE clause (defaults to NO ACTION), so deleting a
--     zone that has ever been used on an order fails loudly instead of
--     orphaning/cascading through order history.
--   - No `city`/`postal_code`/coordinates: customers (or staff) pick a zone
--     from a list; nothing here should tempt a future change into distance
--     math.
--
-- WHAT IS DELIBERATELY NOT PORTED
-- -------------------------------------------------------------------------
--   - `map_zone_key` (jebbs: UNIQUE, matched a `data-zone="z1"` path in a
--     baked-in SVG of jebbs' own delivery area). That is a tenant-specific
--     concept tied to an illustration that only exists for jebbs. Morfito is
--     white-label: each shop draws its own areas, so the map arrives in the
--     next migration (050) as a `map_polygon` column instead.
--   - The seed rows (City Bell / Gonnet / Ringuelet / La Plata / Villa
--     Elisa with jebbs' real prices). Zones are per-tenant data; the table
--     starts EMPTY and each shop creates its own from the UI.
--
-- `orders` gains three columns
-- -------------------------------------------------------------------------
--   - `delivery_zone_id` — FK, no cascade (see above). Nullable: pickup
--     orders, orders predating this column and "zone not found" orders all
--     have no zone.
--   - `delivery_zone_name` — denormalized snapshot of the zone's name at
--     order time, same convention as order_items.burger_name /
--     orders.customer_name: renaming a zone next month must not rewrite
--     history or change what an old receipt says.
--   - `delivery_fee_pending` — true when the order was created without a
--     resolved delivery fee (the customer could not find their zone); the
--     order still exists (delivery_fee = 0) and staff resolve the real fee
--     from the dashboard afterwards. Deliberately a boolean flag, NOT a new
--     `orders.status` value: the status CHECK and the whole kanban derive
--     from a fixed set of statuses, and an unresolved delivery fee is a
--     billing fact orthogonal to kitchen/fulfillment status. Also
--     deliberately NOT modeled as `delivery_fee IS NULL`:
--     lib/hooks/orders/use-update-order.ts recomputes
--     `total_amount = items + price_adjustment - discount - commission +
--     delivery_fee`, and a NULL there propagates NaN into a customer's
--     total. Typed, non-null columns on purpose.
--
-- NOTHING IN MORFITO CAN SET delivery_fee_pending = true TODAY
-- -------------------------------------------------------------------------
-- In jebbs the flag is written by a separate customer-facing site
-- (jebbs-landing) when a customer picks "no encuentro mi zona". Morfito has
-- no public checkout: every order is created by staff in the dashboard's
-- order wizard, which always knows the fee. So the flag, the "Envío a
-- confirmar" badge and the quick-edit fee input in the order card are
-- correct but DORMANT — every order stays `false` until a customer-facing
-- ordering surface exists. The dashboard side ships now so that surface,
-- when it arrives, does not need a second dashboard migration.
--
-- BEFORE RUNNING ON PRODUCTION
-- -------------------------------------------------------------------------
--   1. Must return ZERO rows — if it returns a row, the table already
--      exists, STOP and inspect it instead of running this:
--
--        SELECT tablename FROM pg_tables
--        WHERE schemaname = 'public' AND tablename = 'delivery_zones';
--
--   2. Must return ZERO rows — same reasoning as every prior migration
--      that adds columns to `orders`:
--
--        SELECT column_name, data_type FROM information_schema.columns
--        WHERE table_schema = 'public'
--          AND table_name = 'orders'
--          AND column_name IN ('delivery_zone_id', 'delivery_zone_name', 'delivery_fee_pending');
--
--   (jebbs' 019 also demanded a live nullability check on
--   `orders.delivery_fee`, because that column was added by hand in
--   Supabase and never scripted there. NOT needed here: morfito's
--   scripts/000-baseline-schema.sql:235 defines it as
--   `delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0`, which is exactly what
--   the application code assumes.)
--
-- ADD COLUMN IF NOT EXISTS is deliberately NOT used: it would silently
-- succeed against a pre-existing column of the wrong type, which is exactly
-- the failure this script needs to be loud about.
--
-- The script is wrapped in a transaction: if any statement fails, nothing
-- partially applies.
--
-- THIS HAS NOT BEEN RUN AGAINST ANY LIVE DATABASE
-- -------------------------------------------------
-- Same caveat as every prior migration in this repo. Apply to a
-- throwaway/dev clone first.
--
-- REVERSIBILITY
-- --------------
-- Purely additive (one new table, three new nullable/defaulted columns):
--   ALTER TABLE orders DROP COLUMN delivery_zone_id;
--   ALTER TABLE orders DROP COLUMN delivery_zone_name;
--   ALTER TABLE orders DROP COLUMN delivery_fee_pending;
--   DROP TABLE delivery_zones;
--
-- ============================================================

BEGIN;

CREATE TABLE delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  fee numeric(10, 2) NOT NULL CHECK (fee >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Prevents two ACTIVE zones from sharing a display name (a picker with two
-- rows that both say the same thing at different prices is a support
-- nightmare). Partial index instead of a plain UNIQUE: a deactivated zone
-- keeps its name for order history, and its name becoming free again for a
-- future zone is desired, not a bug.
CREATE UNIQUE INDEX delivery_zones_name_active_uniq ON delivery_zones (lower(name)) WHERE is_active;

-- Same wide-open RLS posture as every other table in this repo (see
-- scripts/048-app-settings.sql) — no user_id/auth.uid scoping anywhere in
-- this schema.
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on delivery_zones" ON delivery_zones FOR ALL USING (true) WITH CHECK (true);

-- No ON DELETE clause — defaults to NO ACTION, so deleting a zone that's
-- referenced by any order fails loudly instead of orphaning/cascading
-- through order history.
ALTER TABLE orders ADD COLUMN delivery_zone_id uuid REFERENCES delivery_zones(id);

-- Denormalized snapshot, same convention as order_items.burger_name /
-- orders.customer_name — renaming a zone later must not rewrite history.
ALTER TABLE orders ADD COLUMN delivery_zone_name text;

-- NOT NULL DEFAULT false: every pre-existing row (and every order created by
-- staff going forward) is correctly "not pending" without a backfill.
ALTER TABLE orders ADD COLUMN delivery_fee_pending boolean NOT NULL DEFAULT false;

COMMIT;
