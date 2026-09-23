-- ============================================================
-- Morfito — settings port from jebbs-dashboard: app_settings (048)
-- ============================================================
--
-- WHAT THIS FILE IS
-- ------------------
-- Singleton table for business-wide configuration: brand (logo, accent
-- color), the two editable message templates (WhatsApp / delivery), the
-- pickup address, and the default delivery fee used to seed a new order in
-- the wizard. Ported from jebbs-dashboard's scripts/018-app-settings.sql +
-- scripts/020-brand-settings.sql, merged into one migration here since
-- morfito is adding this as a single feature rather than growing it across
-- two historical work units the way jebbs did.
--
-- `id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1)` — same singleton
-- pattern as every other config-shaped table in this repo: there is exactly
-- one row, and the CHECK makes that a database guarantee instead of an
-- application convention, same as scripts/018 (jebbs) established. Typed
-- columns instead of a jsonb blob for the same reason: a typo in a jsonb key
-- silently resolves to `undefined` at read time instead of erroring at
-- write time.
--
-- WHY business_name IS NULLABLE, WITH NO DEFAULT VALUE
-- -------------------------------------------------------------------------
-- jebbs-dashboard is single-tenant and defaulted this column to
-- 'JEBBS BURGERS' — there was exactly one correct value. Morfito is
-- white-label: it already resolves a real per-tenant name server-side via
-- lib/entitlements.ts's `project.name` (the control-panel's name for this
-- deployment, provisioned by whoever sets the client up — see
-- app/(dashboard)/layout.tsx and components/providers/project-name-
-- provider.tsx). A NOT NULL default here would be a SECOND, editable source
-- of truth for the same fact, and there is no sensible literal to default it
-- to (unlike jebbs, there is no single business this could name).
--
-- This column is therefore a genuine OPTIONAL override, resolved as:
--   settings.business_name ?? project.name ?? "Morfito"
-- (see lib/hooks/use-app-settings.ts's useBusinessName()). NULL — not an
-- empty string — means "no override, trust the control-panel's name for
-- this deployment". Day one, every existing deployment has NULL here and
-- sees zero behavior change: the sidebar/login already show whatever
-- project.name resolves to (or the literal "Morfito" if entitlements are
-- unreachable), same as before this table existed.
--
-- pickup_address is nullable for the same white-label reason (no tenant-
-- specific default to guess). NULL falls back to the placeholder string
-- already hardcoded in lib/utils/formatOrderDelivery.ts today
-- ("Dirección de retiro pendiente de configurar") — day one, an unconfigured
-- shop sees exactly the same delivery message it already produces, verbatim.
--
-- WHY primary_color_light/_dark DEFAULT TO #007aff / #0a84ff
-- -------------------------------------------------------------------------
-- Byte-for-byte the current --primary (and --sidebar-primary) values in
-- app/globals.css:45 (light) and :117 (dark) on this branch
-- (port/jebbs-style-refactor). Same "zero visual change until someone
-- actually edits /configuracion" principle jebbs used for its own brand
-- colors — nobody who never opens the settings screen sees anything move.
--
-- WHY THIS TABLE HAS NO pedidosya_commission_pct / default_delivery_minutes
-- -------------------------------------------------------------------------
-- jebbs-dashboard's 018 also carried a `pedidosya_commission_pct` default
-- and a `default_delivery_minutes` column. Neither is ported:
--   - Morfito already has its own richer, per-channel commission model
--     (lib/utils/commission.ts's operator-configurable order sources, each
--     with its own rate) — a single flat PedidosYa percentage would be a
--     regression, not a port.
--   - default_delivery_minutes has no caller on this branch —
--     components/order-wizard/hooks/use-order-settings.ts's
--     getDefaultDeliveryTime() keeps its existing hardcoded 30-minute
--     offset unchanged. Adding an unused column now is exactly the kind of
--     premature plumbing 018's own header argues against (see its "labels
--     that aren't configuration" note) — add it in the same migration that
--     actually wires it up, if that ever happens.
--
-- WHAT IS DELIBERATELY NOT A COLUMN
-- -------------------------------------------------------------------------
-- Same posture as jebbs' 018: literal message text that isn't reused across
-- more than one template stays inside whatsapp_template / delivery_template
-- as plain `{{placeholder}}` text (see lib/settings/variables.ts for the
-- full catalog), not as its own column. business_name and pickup_address
-- are the only two exceptions, because both templates repeat them.
--
-- THIS HAS NOT BEEN RUN AGAINST ANY LIVE DATABASE
-- -------------------------------------------------
-- Same caveat as every prior migration in this repo. Apply to a
-- throwaway/dev clone first.
--
-- REVERSIBILITY
-- --------------
-- Purely additive: one new table, nothing else touched.
--   DROP TABLE app_settings;
--
-- ============================================================

BEGIN;

CREATE TABLE app_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Nullable override — see "WHY business_name IS NULLABLE" above. NULL
  -- means "use lib/entitlements.ts's project.name" — never coerced to a
  -- hardcoded literal at the DB layer.
  business_name text,
  -- Nullable — see "WHY business_name IS NULLABLE" above (same reasoning
  -- applies: no tenant-specific default exists for a white-label product).
  pickup_address text,
  logo_url text,
  -- Byte-for-byte app/globals.css's current --primary / --sidebar-primary
  -- values on this branch — see header above.
  primary_color_light text NOT NULL DEFAULT '#007aff',
  primary_color_dark text NOT NULL DEFAULT '#0a84ff',
  -- Dollar-quoted so the emojis/newlines/quotes in these templates don't
  -- need escaping. Keep byte-for-byte identical to lib/settings/defaults.ts's
  -- DEFAULT_APP_SETTINGS.whatsapp_template / .delivery_template.
  whatsapp_template text NOT NULL DEFAULT $tpl$*{{negocio}}*
🧾 *PEDIDO #{{numero}}* · {{fecha}}

👤 *{{cliente}}* · {{metodo_pago}}
{{icono_entrega}} *{{tipo_entrega}}*
📍 {{direccion}}
   {{notas_direccion}}
🕐 {{etiqueta_hora}} a las: *{{hora_entrega}}*

📦 *Detalle*
{{items}}

💰 {{totales}}
*TOTAL: {{total}}*
━━━━━━━━━━━━━━━
📝 {{notas}}
Gracias por tu compra 🙌

*⚠️ POR FAVOR VERIFICAR QUE ESTÉ TODO CORRECTO EN LA ORDEN ⚠️*$tpl$,
  delivery_template text NOT NULL DEFAULT $tpl$*{{negocio}}*
Nombre Del Cliente: {{cliente}}
📍 Retiro: {{direccion_retiro}}
📍 Entrega: {{entrega}}
💵 Pagar al local: $
💸 Cobrar al cliente: $
🛵 Envío: {{envio}}
🧭 Estado Del Pedido
📱 Tel cliente: {{telefono}}$tpl$,
  -- Matches the value components/order-wizard/hooks/use-order-settings.ts
  -- and app/(dashboard)/precios/page.tsx already hardcode/persist under the
  -- "restaurant_default_delivery_fee" localStorage key today — day one,
  -- migrating that read to this column changes nothing for an existing shop.
  default_delivery_fee numeric(10,2) NOT NULL DEFAULT 2000,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (id) VALUES (1);

-- Same wide-open RLS posture as every other table in this repo (see e.g.
-- scripts/047-recurring-expenses.sql's "WHY THE DELETE WINDOW IS NOT AN RLS
-- POLICY" note) — no user_id/auth.uid scoping anywhere in this schema.
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on app_settings" ON app_settings FOR ALL USING (true) WITH CHECK (true);

COMMIT;
