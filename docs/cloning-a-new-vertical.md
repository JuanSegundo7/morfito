# Cloning Morfito for a new business (vertical)

Phase 6 of the products/variant_groups genericization refactor added a
second real vertical (`sushiVertical`, see `lib/verticals/sushi.ts`) to
prove the generic model built in Phases 0-4 actually supports more than
burgers. This doc is the concrete runbook for cloning Morfito into a new
deployment for a real business, using that work as the worked example.

Note: this file did not exist before Phase 6. Earlier phases' research
referenced a `docs/entitlements-api.md` that was expected to already exist
in this repo — as of this session, neither that file nor a `docs/` folder
were actually present. Only this file was created here; documenting the
entitlements API itself is not part of this phase's scope.

## 1. Provision the database

1. Clone the Morfito repo for the new deployment.
2. Provision a new, empty Supabase project for it.
3. Run the full migration chain in order against that project:
   `scripts/000-baseline-schema.sql` through `scripts/031-drop-legacy-compat.sql`.
   These are the schema migrations — run them in numeric order, no skipping
   (later scripts assume earlier ones already ran; see each file's own
   header for what it depends on).
4. Run a vertical-specific seed script on top. For sushi, that's
   `scripts/040-seed-from-vertical.sql` — it inserts a handful of real
   sample rolls (with "Piezas" 4/8-piece variant groups) and addon products
   (salsas/bebidas/acompañamientos/extras), driven by the shape
   `sushiVertical.seedTemplate` declares in `lib/verticals/sushi.ts`. A
   different vertical would get its own `04X-seed-*.sql` file following the
   same structure (products + variant_groups + variant_options), not a
   copy-paste of sushi's concrete data.
5. Point the new deployment's environment variables (Supabase URL/anon
   key/service role key, etc.) at this new project.

## 2. Register the business in control-panel

The control-panel repo (`solvifylabs/control-panel`) is the agency's admin
panel tracking every client project, independent of Morfito's own
database. Onboarding a new business is a single step there: on the
Proyectos page, "Nuevo proyecto" opens a 4-step wizard
(`components/projects/onboard-project-dialog.tsx`, `POST
/api/projects/onboard`) that in one submit creates the `projects` row
(name/slug/description **and a required `category`** — the wizard doesn't
let you skip it or fall back to `'otro'`), its first `subscriptions` row,
its `services` rows, and a `project_api_keys` entry, with automatic
rollback if any step fails. The success screen shows the plaintext API key
once and a ready-to-paste `.env.local` block
(`components/projects/env-handoff-card.tsx`) — copy that into the new
Morfito deployment's environment.

(The old manual sequence — hand-written SQL for the subscription, one
"Agregar servicio" dialog click per service, a separate "Generar API key"
click — still works for editing an existing project, but new businesses
should go through the wizard.)

## 3. `category` reaches Morfito — resolveVertical() is what consumes it

`control-panel/app/api/v1/entitlements/route.ts` sends `category` on every
response (sourced from `projects.category`), and Morfito's
`lib/verticals/index.ts` exports a pure, synchronous `resolveVertical()`
that turns it into a `VerticalDefinition`. `app/(dashboard)/layout.tsx`
calls this once per request — reusing the entitlements fetch it already
makes for the billing gate, not a second fetch — and hands the result down
via `VerticalProvider` (`components/providers/vertical-provider.tsx`), so
any client page reads it with `useVertical()`.

Fails open to `burgerVertical` whenever the vertical can't be determined
(entitlements unreachable/misconfigured, `category` missing, or an
unrecognized slug) — see `resolveVertical()`'s own doc comment for the
full list. This is deliberate, not a bug: an unrelated control-panel outage
should never turn into a broken/blank UI for a paying customer.

Not everything reads from the resolved vertical yet — see §4 below for
what's still hardcoded.

## 4. Known follow-up work from Phase 6 (not silently forgotten)

One thing remains deliberately undone this phase, on top of the gap above:

1. **The sushi order-wizard adapter is fully wired in, including edit mode.**
   `order-wizard-drawer.tsx` reads `useVertical().orderFlow` and renders
   `SushiStep` (wrapping
   `components/order-wizard/adapters/sushi-piece-selector.tsx`) for
   `"piece-selector"`, or `BurgersStep` otherwise (including the
   not-yet-built `"size-crust-selector"`, which falls back to the burger
   builder for now). The controller-level contract both flows implement is
   `OrderFlowAdapter` (`components/order-wizard/adapters/order-flow-adapter.ts`);
   see `components/order-wizard/hooks/use-sushi-selection.ts` and
   `OrderPriceCalculator.calculateSushiTotal`/`OrderDataTransformer.
   transformSushiToOrderItems` for the sushi-side math/payload. Edit-mode
   order loading (`services/order-data-loader.ts`'s `loadSushiItems`) is
   wired too — `use-order-wizard.ts` passes `orderFlow` through and calls
   `sushi.loadItems(wizardData.sushi)`, so editing an existing sushi order
   correctly repopulates its line items.
2. **Combos are gated but not generalized.** `hasCombos` hides the Combos
   nav entry (`components/layout/sidebar.tsx`), skips the Combos step in
   the order wizard (`components/order-wizard/order-wizard-drawer.tsx`),
   and now also blocks the route itself
   (`app/(dashboard)/combos/page.tsx`) when false, so a non-burger vertical
   can no longer reach a broken combos screen by direct URL. Combo slots
   are still hardcoded to the burger shape (`slot_type: "burger"`,
   `burgers_default_meat_quantity`, etc.) underneath —
   generalizing combos to work meaningfully for a non-burger vertical
   (e.g. "2 rolls + bebida") is still explicitly deferred; it needs a
   product decision on what a combo slot means for each vertical before
   any code changes.

## Summary checklist for a new clone

- [ ] Provision Supabase project, run `scripts/000` → `scripts/031`
- [ ] Run the vertical's seed script (e.g. `scripts/040-seed-from-vertical.sql` for sushi)
- [ ] Point Morfito env vars at the new Supabase project
- [ ] Run the onboarding wizard in control-panel (Proyectos → "Nuevo proyecto") — sets `category`, plan, and services in one step
- [ ] Copy the wizard's success-screen env block into the new deployment's `.env.local` (`CONTROL_PANEL_API_URL`, `CONTROL_PANEL_API_KEY`, and generate a fresh per-deployment `COOKIE_SIGNING_SECRET`)
- [ ] If the vertical needs a NEW order-wizard flow beyond `"builder-wizard"`/`"piece-selector"` (e.g. `"size-crust-selector"` for pizza), implement an `OrderFlowAdapter` for it (see §4.1) — the switching mechanism itself already exists, only `"piece-selector"` (sushi) has a real flow behind it today
