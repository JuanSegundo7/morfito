# Spec: libro-diario — Read-only daily debit/credit ledger inside Resumen

Delta spec — what MUST be true after this change is applied. Grounded in the approved proposal
(`.atl/sdd/libro-diario/proposal.md`), which records three closed product decisions (D1–D3), twelve
numbered business rules, and one additional product decision confirmed by the user after the
proposal was written (see Domain 1, "one row per template per day"). Every rule, edge case, and
success criterion named in the proposal has at least one scenario below; nothing beyond that
proposal's scope was added.

Domains map 1:1 to the proposal's capability contract: one new capability (`daily-ledger`) and two
modified capabilities (`revenue-analytics`, `finance-overview`). Modified-capability requirements
below extend behavior already specified in `.atl/sdd/gastos-recurrentes/spec.md` (Domain 2
`recurring-expense-proration`, Domain 4 `revenue-analytics`) and `.atl/sdd/finanzas-gastos-recetas/spec.md`
(Domain 1 `finance-navigation`, Domain 6 `finance-summary`) — they do not replace it.

---

## Domain 1: daily-ledger (new capability)

A pure, period-scoped projection of every money movement (sales, external income, one-off
expenses, prorated recurring allocations), emitted chronologically with a running balance, plus a
read-only day-grouped table rendering it. Covers D1, D2, D3, rules 1–7, 9–11, and the row-count /
float-drift edge cases.

### Requirement: amounts are always positive; direction is derived from `source` alone (rule 3)

Every `LedgerEntry.amount` MUST be positive. `LedgerEntry` carries a single discriminator,
`source: "orders" | "external_income" | "expense" | "recurring"`; a row's direction is looked up
via `LEDGER_DIRECTION[source]` (`"income"` renders in the *Haber* column, `"expense"` in the *Debe*
column). No component or service in this feature may negate an amount or flip a sign based on
anything other than `LEDGER_DIRECTION[source]`. `kind` and `isProrated` are NOT stored fields —
both are derivable from `source` alone.

- Scenario: an expense row never carries a negative number
  - **Given** a one-off expense of `5000` on `2026-09-03`
  - **When** its `LedgerEntry` is built
  - **Then** `amount = 5000` (positive) and `source = "expense"`
  - **And** `LEDGER_DIRECTION["expense"] === "expense"`, so the component renders it in the *Debe*
    column without negating it

### Requirement: no commission row exists, in any form, anywhere in the ledger (D1)

The ledger MUST NOT contain a commission debit row, and MUST NOT render commission as an
informational, non-subtracted annotation, badge, footnote, or tooltip anywhere inside
`daily-ledger.tsx`. `orders.total_amount` is already net of commission; a ledger row would deduct
that money a second time.

- Scenario: a period with non-zero commission shows no commission trace anywhere in the ledger
  - **Given** a period has orders whose combined `commissionTotal` is `48000` (non-zero, already
    excluded from `orders.total_amount`)
  - **When** the "Libro diario" table renders for that period
  - **Then** no row's `concept` contains the word "comisión"/"commission" in any casing or language
  - **And** no badge, footnote, tooltip, header note, or non-restated informational line item about
    commission exists anywhere in `daily-ledger.tsx` — not even as a "$0, informational" variant
  - **And** `sum(income) − sum(expense) ≈ netRevenue` within float tolerance, proving commission was
    not silently subtracted a second time

### Requirement: recurring templates are prorated day by day, with one row PER TEMPLATE — never collapsed (D2, confirmed post-proposal decision)

Each active monthly template contributes its own `LedgerEntry` on every day it charges, keyed by
`allocation.date`. When two or more templates prorate on the same calendar day, EACH template MUST
produce its own separate row on that day — they MUST NOT be merged, summed, or collapsed into a
single generic row (e.g. "Gastos fijos"). This was an open question in the proposal ("one row per
template vs. one collapsed row per day"); the user has since closed it in favor of one row per
template, and this requirement encodes that decision as binding, not as a leaning.

- Scenario: two monthly templates charging on the same day each get their own row
  - **Given** two active monthly templates in a 30-day month: "Alquiler" (`amount = 300000` →
    `10000`/day) and "Sueldos" (`amount = 450000` → `15000`/day), both active on `2026-09-14`
  - **When** the ledger is built for September 2026
  - **Then** the ledger contains exactly two rows dated `2026-09-14` attributable to these
    templates: one with `concept = "Alquiler"`, `amount = 10000`, `source = "recurring"`, and one
    with `concept = "Sueldos"`, `amount = 15000`, `source = "recurring"`
  - **And** neither row is merged, relabeled, summed, or collapsed into a single "Gastos fijos" (or
    any other generic) row
  - **And** each row is a separate line in the day's rendered group, each carrying its own
    `prorrateo` badge, derived from `source === "recurring"` (never a stored boolean)

### Requirement: the displayed closing balance IS `netRevenue` — there is no second field to keep in sync (rule 1)

There is no `ledgerClosingBalance` field anywhere in this feature. `useOrdersAnalytics` returns a
single new field, `ledger: LedgerEntry[]`; the total the operator sees comes from
`analytics.netRevenue` — the same field `computeNetRevenue` already produces and the same field the
"Ingreso neto del período" card above the ledger already reads. The `daily-ledger.tsx` component
receives this value through a neutral `closingBalance` prop, fed at the single mount site
(`closingBalance={analytics?.netRevenue ?? 0}`); the component MUST NOT reduce its own `entries`
prop to produce a total. No code path in `lib/services/daily-ledger.ts` or
`components/finanzas/daily-ledger.tsx` may sum `ledger`/`entries` to produce a displayed balance.
(Previously: this requirement described a `ledgerClosingBalance` field assigned from `netRevenue`;
the design eliminated the field itself, since a ledger-named number sitting next to a ledger array
invites exactly the re-sum this rule forbids.)

- Scenario: the ledger's own entries would re-sum to a floating-point value one hundred-thousandth short of the true total, and the screen shows `netRevenue` instead
  - **Given** a period where `computeNetRevenue` returns `netRevenue = 100000` (from
    `totalRevenue = 200000`, `expensesTotal = 100000`), and the ledger contains: one income row
    (`source = "orders"`) with `amount = 200000`, and 31 expense rows (`source = "recurring"`) — one
    per day of a 31-day month — each holding the prorated allocation `100000 / 31 =
    3225.806451612903...` produced by `expandRecurringExpensesDaily`
  - **When** the 31 daily allocations are summed in floating point (as the "obvious" but forbidden
    re-sum implementation would do) and subtracted from `200000`
  - **Then** that re-summed value is `99999.99999999999` — one hundred-thousandth of a peso short
    of `100000`, an artifact of adding 31 IEEE-754 doubles of `100000/31`
  - **And** the closing-balance strip nonetheless displays `$100.000` (formatted from `100000`),
    because `closingBalance` is fed from `analytics.netRevenue` directly at the mount site — never
    from a value derived from `entries`
  - **And** no function in `lib/services/daily-ledger.ts` or `components/finanzas/daily-ledger.tsx`
    performs `entries.reduce(...)` (or any equivalent) to produce a displayed balance

### Requirement: row order within a day is deterministic — Ventas → Ingresos externos → one-off expenses → prorated allocations (rule 2), with a fixed tie-break WITHIN each bucket (resolved by design D7)

Within a single day, rows MUST appear in exactly this bucket order, so the running balance is
reproducible across renders: `orders` → `external_income` → `expense` → `recurring`. This order is
not user-configurable and not affected by insertion order in the underlying tables. WITHIN the
`expense` bucket, rows MUST be sorted by `description` (nulls last), then `amount`, then
`category`. WITHIN the `recurring` bucket, rows MUST be sorted by `description`, then `templateId`.
Both sorts use plain code-unit comparison (`<`/`>`), never locale-aware collation, so the resulting
order does not depend on the machine running it.

- Scenario: a day with all four kinds of movement orders them correctly
  - **Given** `2026-09-10` has: a `Ventas` total of `50000`, an `Ingresos externos` total of
    `8000`, a one-off expense of `3000`, and one prorated recurring allocation of `10000`
  - **When** the ledger is built for this day
  - **Then** the four rows appear in this exact order: `Ventas`, `Ingresos externos`, the one-off
    expense, the prorated allocation
  - **And** the running `balance` after each row reflects cumulative income minus expense in that
    exact sequence

- Scenario: two templates prorating on the same day have a stable, deterministic tie-break order regardless of the input array's order
  - **Given** two active monthly templates "Alquiler" and "Sueldos" both prorate on `2026-09-14`,
    and the underlying `recurring_expenses` query returns rows in no guaranteed order
  - **When** the ledger is built for September 2026, once with the allocations array in one order
    and once with it reversed
  - **Then** both runs produce the same two rows in the same order — sorted by `description` first
    (`"Alquiler"` before `"Sueldos"`) — so the day's row order and every intermediate `balance` are
    byte-identical across refetches

### Requirement: zero-amount movements emit no row (rule 4)

A day with no sales produces no "Ventas $0" row. A recurring allocation that prorates to `0` (e.g.
a `null`-amount template) produces no row. The ledger shows movements, not a calendar of every
day.

- Scenario: a day with sales but no external income shows only the sales row
  - **Given** `2026-09-05` has `Ventas = 20000` and `Ingresos externos = 0` (no external income
    that day)
  - **When** the ledger is built for this day
  - **Then** only one row exists for `2026-09-05` (`Ventas`, `20000`)
  - **And** no "Ingresos externos $0" row is rendered

- Scenario: a template with a null amount produces no row on any day
  - **Given** a monthly template has `amount = NULL` (prorates to `0` per
    `recurring-expense-proration`'s existing rule)
  - **When** the ledger is built for any period this template overlaps
  - **Then** this template contributes zero rows across the entire period

### Requirement: chronological order is derived from `dailyData`, never from an independent sort (rule 5)

The builder MUST walk the already-gap-filled `dailyData` array (built `start → end`, one day at a
time) to determine day order. It MUST NOT re-derive or re-sort the period's day range from any
other source.

- Scenario: the ledger's day order matches `dailyData`'s existing order with no separate comparator
  - **Given** `dailyData` for the period is already ordered `2026-09-01, 02, 03, ..., 30`
  - **When** `buildDailyLedger` runs
  - **Then** the resulting `ledger`'s days appear in that same order, produced by walking
    `dailyData`, not by any `Array.prototype.sort` call inside `daily-ledger.ts`

### Requirement: `recurringAllocations` is consumed by the ledger, never recomputed (rule 7)

The ledger builder MUST reuse the single `recurringAllocations` array already computed once per
`useOrdersAnalytics` call (the same array feeding `expensesTotal`, `expensesByCategory`, and the
daily fold). `expandRecurringExpensesDaily` MUST still be called exactly twice per
`useOrdersAnalytics` invocation (current period + previous period) — the ledger adds no third
current-period call.

- Scenario: adding the ledger does not add a call to the proration function
  - **Given** `useOrdersAnalytics` is invoked for a period
  - **When** it computes `expensesTotal`, `expensesByCategory`, `dailyData`, and now `ledger`
  - **Then** `expandRecurringExpensesDaily` is called exactly twice total (current + previous
    period), and the ledger's prorated rows are built entirely from the current period's
    already-computed `recurringAllocations` array

### Requirement: a prorated row's concept is the template's own description; the `prorrateo` badge is derived from `source`, never stored as a separate flag (rule 11)

A prorated row's `concept` MUST be the template's `description` field, unmodified — it MUST NOT
have "(prorrateado)" or similar text appended or prepended. The component derives the `prorrateo`
badge from `entry.source === "recurring"`; `LedgerEntry` has no separate `isProrated` field that
could drift out of sync with `source`.

- Scenario: a prorated row's concept text is the template's plain description
  - **Given** a monthly template has `description = "Alquiler local"`
  - **When** its allocation for a given day becomes a `LedgerEntry`
  - **Then** `concept = "Alquiler local"` exactly (no "(prorrateado)" suffix in the text) and
    `source = "recurring"`
  - **And** the component renders a separate `prorrateo` badge next to it, derived from
    `entry.source === "recurring"`

### Requirement: the ledger is read-only — no create, edit, annotate, or reorder action exists (rule 10)

The "Libro diario" table MUST expose zero mutation affordances. There is no edit action, no delete
action, no "add movement" button, no inline annotation field, and no context/row menu offering any
of those. Corrections happen at the source (Gastos tab, orders) — never in the ledger.

- Scenario: no interactive element in the ledger can change a row or add a new one
  - **Given** the "Libro diario" table is rendered with rows
  - **When** an operator inspects every interactive element in `daily-ledger.tsx`
  - **Then** none of them edit, delete, annotate, reorder, or create a ledger row
  - **And** no `useMutation` call exists anywhere in `lib/services/daily-ledger.ts` or
    `components/finanzas/daily-ledger.tsx`

### Requirement: the ledger provides no PDF or Excel export in this scope (D3)

No export affordance (button, dropdown, or menu item) for the ledger's visible rows MUST exist in
this change. `jspdf`, `jspdf-autotable`, and `exceljs` MUST NOT be added as dependencies.

- Scenario: there is no way to export the ledger from the UI
  - **Given** the "Libro diario" card is rendered with one or more pages of rows
  - **When** an operator looks for an export option anywhere on the card
  - **Then** no export button, dropdown, or menu item exists in `daily-ledger.tsx`
  - **And** `package.json` contains none of `jspdf`, `jspdf-autotable`, `exceljs`

---

## Domain 2: revenue-analytics (modified capability)

Extends `useOrdersAnalytics` (previously specified in `gastos-recurrentes/spec.md` Domain 4).
Covers rules 8 and 12, and Unit 1's `description` addition.

### Requirement: `dailyData[].revenue` stays exactly `ordersRevenue + externalRevenue`, unchanged in value, on BOTH screens that consume it (rule 8)

Splitting `dailyMap`'s single `revenue` field into `ordersRevenue` and `externalRevenue` MUST NOT
change `revenue`'s value for any day. This is a compatibility requirement, not an implementation
detail: `dailyData[].revenue` is read by TWO production screens — `/finanzas` Resumen's "Ingresos
vs. gastos por día" chart, and `/rendimiento`'s "Ingresos por día" AreaChart — and both MUST render
byte-identical values before and after this change.

- Scenario: the split is a provable no-op on both consuming charts
  - **Given** a day has `ordersRevenue = 45000` (from completed orders) and
    `externalRevenue = 5000` (from `external_income`)
  - **When** `dailyMap` is split into the two fields
  - **Then** `dailyData[].revenue` for that day is `45000 + 5000 = 50000` — the same value it held
    before the split
  - **And** `/finanzas` Resumen's daily chart renders the same bar height for that day as before
    the change
  - **And** `/rendimiento`'s "Ingresos por día" AreaChart renders the same value for that day as
    before the change
  - **And** `sum(dailyData[].revenue)` across the period equals `totalRevenue` within tolerance,
    unchanged from pre-change behavior

### Requirement: the current-period expenses select includes `description`; the previous-period select is unchanged

The current-period `expenses` query MUST select `description` in addition to `date, amount,
category`. The previous-period `expenses` query (which feeds only `prevExpensesTotal`, never a
rendered row) MUST remain `date, amount` — unchanged.

- Scenario: a one-off expense row has a concept text drawn from its own description
  - **Given** a one-off expense in the current period has `description = "Compra de insumos"`
  - **When** the current-period select runs
  - **Then** the returned row includes `description = "Compra de insumos"`, available to become the
    ledger row's `concept`

- Scenario: the previous-period select is not widened
  - **Given** the previous-period expenses query
  - **When** it executes
  - **Then** it still selects only `date, amount` — no `description`, no `category`

### Requirement: no ledger is built for the previous comparison period (rule 12)

The previous period continues to be fetched as totals only, feeding `%` deltas
(`expensesChange`, `netRevenueChange`). No `ledger` is computed for the previous period (there is
no `ledgerClosingBalance` field for either period — see Domain 1's closing-balance requirement).

- Scenario: the previous period's totals are unaffected and no previous-period ledger exists
  - **Given** `useOrdersAnalytics` computes both current and previous period data
  - **When** it returns its result
  - **Then** `expensesChange` and `netRevenueChange` keep their pre-existing values and computation
    path
  - **And** no `ledger` field exists for the previous period anywhere in the returned shape

---

## Domain 3: finance-overview (modified capability)

Extends the `/finanzas` Resumen tab (previously specified in `finanzas-gastos-recetas/spec.md`
Domain 1). Covers the ledger card's mount point and its loading/empty states.

### Requirement: the ledger card is mounted inside the existing Resumen tab, below the daily chart — no new top-level tab is created

The "Libro diario" card MUST render inside the existing Resumen tab, immediately below "Ingresos vs.
gastos por día". The 4-tab shell (Resumen, Gastos, Insumos, Recetas) and the `?tab=` union stay
unchanged.

- Scenario: /finanzas still renders exactly 4 top-level tabs after this change
  - **Given** a user opens `/finanzas`
  - **When** the page renders
  - **Then** the top-level tabs are still exactly Resumen, Gastos, Insumos, Recetas
  - **And** the "Libro diario" card appears inside Resumen, below "Ingresos vs. gastos por día",
    and nowhere else

### Requirement: an empty period shows a no-movements message and a `$0` closing balance sourced from `netRevenue`

When the ledger has zero rows, the table MUST show an explicit empty-state message instead of a
blank table, and the closing-balance strip MUST still render `$0` — read from `netRevenue`, not
from an empty-array sum.

- Scenario: a period with zero movements shows the empty state and a correct zero balance
  - **Given** a period has no orders, no external income, no expenses, and no active recurring
    templates
  - **When** the "Libro diario" card renders
  - **Then** it shows "Sin movimientos en este período" instead of an empty table
  - **And** the closing-balance strip shows `$0`, sourced from `netRevenue` (which is `0` for this
    period), not from summing zero ledger rows

### Requirement: the ledger never flashes a `$0` closing balance while data is loading

While `isLoading` is true, the card MUST render a loading/skeleton state, not a `$0` (or any other)
closing balance that could be mistaken for a real period result.

- Scenario: the loading state precedes any balance render
  - **Given** `useOrdersAnalytics` is still fetching (`isLoading = true`)
  - **When** the "Libro diario" card renders
  - **Then** it shows a skeleton, not a `$0` (or any numeric) closing-balance strip

---

## Open questions (carried from the proposal, not decided by this spec)

1. ~~Tie-break order among multiple templates prorating on the same day.~~ **RESOLVED by design
   D7.** Within the `expense` bucket, rows sort by `description` (nulls last), then `amount`, then
   `category`; within the `recurring` bucket, rows sort by `description`, then `templateId` —
   plain code-unit comparison, never locale-aware. Encoded as a binding requirement and scenario in
   Domain 1's row-order requirement above.
2. **The `description === null` fallback label's source.** `EXPENSE_CATEGORY_LABELS` lives in
   `components/finanzas/expense-list.tsx`, a component file; a `lib/services/` module importing from
   `components/` would invert the layering. Proposal's leaning: `LedgerEntry` carries `category` and
   the component resolves the fallback label. Not closed — `sdd-design`'s call.
3. ~~Whether `LedgerEntry` needs a stable `id`.~~ **RESOLVED by design D3: no `id` field.** The
   feared key collision does not exist — the row key already includes a per-group index, so two
   same-day expenses sharing a description never collide. Rows are keyed by `${date}-${idx}` in the
   component; the ledger requirements above assume no persistent/stable `id` field on `LedgerEntry`.
   Revisit only if the table later gains sorting, filtering, or a drill-down to the underlying
   order/expense — at that point the honest shape is `{ source, date, refId }`, added together with
   the feature that needs it.
4. **Day-group pagination size.** jebbs uses 10 days/page. Left open by the proposal as a
   presentational decision for `sdd-design`.

---

## Risks / assumptions requiring follow-up (spec-level gaps only — not proposal re-litigation)

1. **The `dailyMap` split is the single highest-risk line in this change**, because `revenue` feeds
   two production screens outside this feature's blast radius (`/finanzas` Resumen and
   `/rendimiento`). Domain 2's non-regression requirement above is written specifically to make this
   testable and provable, per the proposal's own risk table.
2. **Row-count growth from one-row-per-template.** With N active monthly templates, a month can
   contribute up to `31 × N` prorated rows on top of sales/external/one-off rows. The proposal notes
   pagination bounds what's on screen; the tie-break order resolved in Domain 1 (design D7) compounds
   this only in display order, not in row count — row count itself is not ambiguous, it is the
   confirmed consequence of "one row per template."
3. **Carried forward from `gastos-recurrentes/spec.md`**: `recurring-expense-proration`'s existing
   float-tolerance and non-monthly-zero-contribution rules are inherited unchanged; this spec does
   not re-specify them, only their consumption by the ledger (Domain 1).
