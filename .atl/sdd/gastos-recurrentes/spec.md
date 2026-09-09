# Spec: gastos-recurrentes — Recurring expense templates with on-read proration

Delta spec — what MUST be true after this change is applied. Grounded in the approved proposal
(`.atl/sdd/gastos-recurrentes/proposal.md`), which records seven closed product decisions (D1–D7)
and fourteen numbered business rules. Every rule and every edge case named in the proposal has at
least one scenario below; nothing in scope beyond that proposal was added.

Domains map 1:1 to the proposal's capability contract: three new capabilities
(`recurring-expense-templates`, `recurring-expense-proration`, `payday-tracking`) and three
modified capabilities (`revenue-analytics`, `expense-tracking`, `finance-overview`). Modified-
capability requirements below extend the existing behavior already specified in
`.atl/sdd/finanzas-gastos-recetas/spec.md` (Domain 4 `expense-tracking`, Domain 6
`finance-summary`, Domain 1 `finance-navigation`) — they do not replace it.

---

## Domain 1: recurring-expense-templates (new capability)

Requirements for the `recurring_expenses` table and its lifecycle: create, close-and-replace,
conditional delete. Covers D2, D3, D4, D6, rule 4, rule 11, rule 12, rule 14, and the
`start_date === today` edge case.

### Requirement: `recurring_expenses` has no `supply_id` / `quantity` column, for any category (D2)

The schema MUST make "a recurring template moves stock" unrepresentable: no `supply_id` or
`quantity` column exists on `recurring_expenses`, even for `category = 'supplies'`. This differs
from one-off `expenses`, which do carry those columns since PR5 of `finanzas-gastos-recetas`.

- Scenario: a `supplies`-category template cannot reference a supply or move stock
  - **Given** an operator creates a recurring template with `category: "supplies"`, `frequency:
    "monthly"`, and `amount: 50000`
  - **When** the template is created and later prorated into a period
  - **Then** no stock movement is created and no supply's `stock_quantity` changes, because the
    table has no column through which a supply link could even be expressed

### Requirement: `category` is constrained to the same 5-value CHECK as `expenses`

`recurring_expenses.category` MUST be constrained (DB-level CHECK) to exactly the 5 values already
enforced on `expenses`: `supplies`, `services`, `salaries`, `rent`, `other`.

- Scenario: an invalid category is rejected at the database
  - **Given** an operator attempts to create a template with `category: "marketing"`
  - **When** the insert reaches the database
  - **Then** it is rejected by the CHECK constraint, not merely blocked client-side

### Requirement: `frequency` is generic across every category (D6)

Any category MAY be `weekly`, `biweekly`, or `monthly`. There MUST be no coupling between
`frequency` and `category` — specifically, `weekly`/`biweekly` MUST be selectable for categories
other than `salaries` (e.g. `services`), and creating a `monthly` template MUST NOT force
`category` to any particular value.

- Scenario: a weekly template can be created for a non-salary category
  - **Given** an operator opens the create-template form
  - **When** they select `category: "services"` and `frequency: "weekly"`
  - **Then** the template is created successfully — no gate restricts `weekly`/`biweekly` to
    `salaries`

### Requirement: `amount` is required for `monthly`, absent from the form for `weekly`/`biweekly` (rule 11)

`amount` is DB-nullable on `recurring_expenses`. The form MUST require it when
`frequency === "monthly"` and MUST NOT render an amount field at all when `frequency` is `weekly`
or `biweekly` (D1: those are informational, cadence + description only).

- Scenario: creating a monthly template without an amount is rejected at the form
  - **Given** an operator selects `frequency: "monthly"` and leaves the amount field empty
  - **When** they attempt to submit
  - **Then** the form rejects the submission before it reaches the database

- Scenario: the amount field does not exist for weekly/biweekly templates
  - **Given** an operator selects `frequency: "biweekly"` on the create form
  - **When** the form re-renders for that frequency
  - **Then** no amount input is present anywhere in the form

### Requirement: an active template's amount is never `UPDATE`d — close-and-replace only (D3, rule 4)

Changing a template's amount MUST NOT modify the existing row's `amount`. Instead the system MUST
close the current row by setting `end_date = effectiveFrom − 1 day` and insert a new row starting
at `effectiveFrom` with the new amount. `end_date` is inclusive (rule 4), so using the same day as
both the old row's `end_date` and the new row's `start_date` would charge that day twice — this
MUST NOT happen.

- Scenario: updating an amount closes the old row and inserts a new one, with no double-charged day
  - **Given** a monthly template T1 exists with `amount = 300000`, `start_date = 2026-01-01`,
    `end_date = NULL`
  - **When** an operator runs "Actualizar" with `amount = 350000` and `effectiveFrom = 2026-03-01`
  - **Then** T1's `amount` remains `300000` (never rewritten) and its `end_date` becomes
    `2026-02-28` (`effectiveFrom − 1 day`)
  - **And** a new template T2 is inserted with `amount = 350000`, `start_date = 2026-03-01`
  - **And** re-computing the prorated total for February 2026 is unaffected by this change (T1
    still covers every day of February at the original rate)

> **Open question (not decided by this spec — see Risks):** the proposal does not state a minimum
> bound on `effectiveFrom` for close-and-replace (unlike D4, which explicitly bounds `DELETE` to
> `start_date >= today`). Scenarios in this spec assume `effectiveFrom` is today or in the future;
> whether a past `effectiveFrom` is allowed (and would therefore retroactively change an
> already-reported period) is unresolved and flagged for `sdd-design`.

### Requirement: `DELETE` is allowed only while `start_date >= today` in AR calendar time (D4, rule 12)

A template MUST be deletable if and only if its `start_date` is today or later, using the same
AR-calendar "today" source the expense dialog already uses (`todayArStr()`), never
`new Date()` in browser-local time nor `CURRENT_DATE` in UTC. Once `start_date` has passed, the
only way to stop a template is `end_date` (close-and-replace or a close without a replacement).
The delete action MUST be absent from the UI in that case, not present-but-disabled.

- Scenario: a template starting today or later is deletable
  - **Given** AR-calendar "today" is `2026-09-09` and a template has `start_date = 2026-09-09`
    (the boundary case — created moments ago, same day)
  - **When** the template list renders
  - **Then** a delete action is shown for this template, and invoking it removes the row

- Scenario: a template that already started shows no delete action
  - **Given** AR-calendar "today" is `2026-09-09` and a template has `start_date = 2026-09-08`
  - **When** the template list renders
  - **Then** no delete action/button is present for this template (absent, not disabled-with-a-tooltip)

- Scenario: "today" is computed in AR calendar time, not UTC or browser-local time
  - **Given** the server/browser clock is in a timezone where UTC midnight has already crossed
    into `2026-09-10` while AR local time is still `2026-09-09` (e.g. it is 22:00 UTC)
  - **When** the delete-eligibility check runs for a template with `start_date = 2026-09-09`
  - **Then** it is evaluated as deletable (start_date >= today-in-AR), not as already-past using a
    UTC "today"

### Requirement: deleting a template never deletes a logged payment (rule 14)

The FK from `expenses.recurring_expense_id` to `recurring_expenses.id` MUST be `ON DELETE SET
NULL`. `ON DELETE CASCADE` is forbidden.

- Scenario: deleting a template preserves its linked expense rows
  - **Given** a deletable template (`start_date >= today`) exists with zero linked payments (which
    D4 guarantees — a deletable template cannot yet have logged payments under normal use)
  - **When** the template row itself is deleted
  - **Then** no `expenses` row is deleted as a side effect
  - **And**, as a schema-level guarantee independent of D4's timing, if any `expenses` row did
    reference this template's `id`, its `recurring_expense_id` becomes `NULL` — the row itself is
    never removed

---

## Domain 2: recurring-expense-proration (new capability)

Requirements for the pure, on-read expansion of templates into daily and period allocations.
Covers rules 1, 2, 5, 6, 8, and the entirely-outside-period / closed-mid-period / float-drift edge
cases.

### Requirement: only `monthly` templates produce money — `weekly`/`biweekly` always contribute exactly $0 (rule 1)

`weekly` and `biweekly` templates MUST contribute exactly `0` to any prorated total, unconditionally
— via an unconditional skip on `frequency !== "monthly"`, not an `amount != null` check. This MUST
hold even if the row's `amount` column is non-null (e.g. stale data from a bug, a prior format, or
direct DB manipulation).

- Scenario: a monthly and a biweekly template in the same period — only the monthly one counts
  - **Given** a 30-day period contains: Template A (`monthly`, `amount = 300000`, active the full
    period, 30-day month → $10,000/day) and Template B (`biweekly`, `amount = 50000`, non-null,
    active the full period)
  - **When** `expandRecurringExpenses` runs for this period
  - **Then** Template A contributes `300000` to the prorated total
  - **And** Template B contributes exactly `0`, even though its `amount` column holds `50000`
  - **And** the combined prorated total for the period is `300000`, not `350000`

- Scenario: a weekly template with a stale non-null amount still contributes zero
  - **Given** a `weekly` template has `amount = 25000` written to it by a bug or a legacy import
  - **When** it is prorated for any period it overlaps
  - **Then** its contribution is `0` for every day, unconditionally

### Requirement: proration rate is `amount / days-in-that-calendar-month`, walked day by day (rule 2)

Each day within a template's active range contributes `amount / daysInMonth(thatDay's month)` —
never `amount / days-in-period` and never a flat 30-day average. A template spanning two calendar
months MUST prorate each month's days against that month's own day count.

- Scenario: a template spanning January and February prorates each month independently
  - **Given** a monthly template with `amount = 31000`, active continuously across
    `2026-01-15`..`2026-02-15` (31 days total: 17 days in January, a 31-day month; 15 days in
    February, a 28-day month in 2026)
  - **When** `expandRecurringExpensesDaily` runs for a period covering `2026-01-15`..`2026-02-15`
  - **Then** each January day contributes `31000 / 31 = 1000`, so the 17 January days sum to
    `17000`
  - **And** each February day contributes `31000 / 28 ≈ 1107.14`, so the 15 February days sum to
    `≈ 16607.14`
  - **And** the total for the range is `≈ 33607.14`, NOT `31000` (a flat monthly amount) and NOT
    `31000 / 31 × 31` applied uniformly across both months

### Requirement: templates are queried with no date filter — overlap is decided in the pure function (rule 5)

The data-fetching layer MUST select `recurring_expenses` with no `start_date`/`end_date` filter.
Whether a template overlaps the requested period MUST be decided entirely inside the pure
proration function, never by a SQL `WHERE` clause that could drop long-running templates.

- Scenario: a long-running template with no filter applied still contributes to the current period
  - **Given** a template has `start_date = 2024-01-01` and `end_date = NULL` (open-ended)
  - **When** the current period (e.g. September 2026) is queried
  - **Then** the template row is present in the unfiltered query result, and the pure proration
    function — not the query — determines it overlaps and contributes to the period

### Requirement: proration inputs are pure calendar dates at UTC midnight, never AR-offset instants (rule 6)

Before any day-by-day walk, period boundary strings (`startDateStr`, `endDateStr`, and their
previous-period equivalents) MUST be converted through a pure calendar-date parser (UTC midnight),
never fed in as AR-local instants (which carry a baked-in `+3h` offset). Feeding an AR-offset
instant into the day-boundary math MUST NOT occur.

- Scenario: a period boundary string is parsed as a pure calendar date before proration
  - **Given** the period's `startDateStr` is `"2026-09-01"`
  - **When** it is passed into the proration layer
  - **Then** it is first converted via the pure calendar-date parser (`parseCalendarDate`) into a
    UTC-midnight `Date` representing `2026-09-01T00:00:00.000Z`
  - **And** this value — not `arDateToUTC`'s `+3h`-offset instant — is what the day-by-day walk
    uses as its start boundary

### Requirement: a template entirely outside the requested period contributes nothing (edge case)

A template whose `[start_date, end_date]` range does not overlap the requested period MUST
produce zero allocations, zero zero-amount rows, and no category-total entry beyond the existing
fixed-five-category shape (each category still reports `$0` when it has no activity, per the
existing `expense-tracking` aggregation rule — never omitted entirely).

- Scenario: a template outside the period contributes nothing and does not appear in the breakdown
  - **Given** a monthly template is active only `2025-01-01`..`2025-06-30` (closed)
  - **When** the September 2026 period is prorated
  - **Then** this template contributes `0` allocations for that period
  - **And** `expensesByCategory` for September 2026 still reports all 5 fixed categories, each
    `$0` unless some other expense (one-off or a different template) falls in that category

### Requirement: a template closed mid-period is charged through `end_date` inclusive, then stops (rule 4, edge case)

A template's last contributing day is `end_date` itself (inclusive). No allocation is produced for
any day after `end_date`.

- Scenario: a template closed mid-month stops contributing the day after `end_date`
  - **Given** a monthly template has `amount = 300000` (30-day month, `$10,000`/day) and
    `end_date = 2026-09-15`
  - **When** the period `2026-09-01`..`2026-09-30` is prorated
  - **Then** days `2026-09-01`..`2026-09-15` (15 days) each contribute `10000`, totaling `150000`
  - **And** days `2026-09-16`..`2026-09-30` contribute `0` for this template

### Requirement: summed daily allocations equal the aggregate total within a float tolerance, never `toBe` (edge case)

Because `amount / daysInMonth` repeated day by day does not sum to exactly `amount` under floating
point, any assertion comparing a summed daily total to the aggregate MUST use a tolerance
comparison, never strict equality.

- Scenario: 31 daily allocations of `amount/31` do not sum to exactly `amount` under `toBe`
  - **Given** a monthly template with `amount = 100000` active across all 31 days of a 31-day
    month
  - **When** the 31 per-day allocations (`100000/31` each) are summed
  - **Then** the sum is within a small tolerance (e.g. `1e-6`) of `100000`, but MUST NOT be
    asserted with strict `toBe(100000)` — display rounds this through `formatCurrency` separately

### Requirement: `dailyData[].expenses` includes per-day recurring allocations, and their sum equals `expensesTotal` (rule 8)

`dailyData[].expenses` MUST include the per-day recurring allocation added to that day's one-off
total, not just an aggregate elsewhere. `sum(dailyData[].expenses)` MUST equal `expensesTotal`
within float tolerance, for every period — with or without templates.

- Scenario: daily chart sums to the same total as the Gastos tile, with both one-off and recurring money
  - **Given** a 7-day period (`2026-09-01`..`2026-09-07`, all within a 30-day month) has: one
    monthly template `amount = 300000` (`$10,000`/day) active the whole period, and one one-off
    expense of `5000` on `2026-09-03`
  - **When** `useOrdersAnalytics` computes `dailyData` and `expensesTotal` for this period
  - **Then** `dailyData` for `2026-09-01`, `02`, `04`–`07` each show `expenses = 10000`
  - **And** `dailyData` for `2026-09-03` shows `expenses = 15000` (`10000` recurring + `5000` one-off)
  - **And** `sum(dailyData[].expenses)` across the 7 days is `75000`
  - **And** `expensesTotal` for the period is also `75000` (`70000` prorated + `5000` one-off) —
    the two values match within float tolerance

---

## Domain 3: payday-tracking (new capability)

Requirements for the cadence grid and FK-based "payments logged" progress for informational
(`weekly`/`biweekly`) templates. Covers D1, D5, rule 13, and the payday-window-before-anchor and
prefill-reset edge cases.

### Requirement: weekly/biweekly templates render a cadence preview instead of a prorated amount (D1)

An informational template (`weekly`/`biweekly`) MUST render its cadence (e.g. upcoming payday
dates within the visible window) and an "N de M pagos cargados" counter, instead of a
per-month amount figure (which monthly templates show).

- Scenario: a biweekly template shows a payday preview, not an amount
  - **Given** a `biweekly` template with `start_date = 2026-08-01`
  - **When** its row renders in "Fijos mensuales"
  - **Then** it shows a cadence/payday preview and an "N de M pagos cargados" counter
  - **And** it does NOT show an amount-per-month figure (it has none, per rule 11)

### Requirement: the payment counter matches by `recurring_expense_id`, never by description or category (rule 13, D5)

"Cargar pago" writes `expenses.recurring_expense_id`. The counter MUST count `expenses` rows by
that FK exclusively. It MUST NOT match by comparing `expenses.description` to the template's
description, and MUST NOT filter by `category === "salaries"`.

- Scenario: renaming a template's description does not change the counter
  - **Given** a biweekly template T (`id = uuid-1`, `description = "Sueldo Juan"`) has 3 expense
    rows with `recurring_expense_id = 'uuid-1'`, all logged before its description was ever
    changed
  - **When** the template's `description` is later changed to `"Sueldo Juan Pérez"`
  - **Then** the counter still reads "3 de M pagos cargados" — unaffected by the rename, because
    matching is by `recurring_expense_id`, never by text
  - **And**, for a non-`salaries` biweekly template (e.g. `category: "services"`), an expense with
    matching `recurring_expense_id` is still counted, proving no `category === "salaries"` gate
    exists

### Requirement: the payday window clamps to the template's anchor, never assumes a negative offset (edge case)

When the payday grid's visible window starts before the template's `start_date` (its anchor), the
computation MUST clamp to the anchor instead of assuming `daysSinceAnchor >= 0`.

- Scenario: a payday window starting before the template's anchor is clamped, not negative
  - **Given** a biweekly template has `start_date = 2026-09-10` (the anchor)
  - **When** the payday grid is computed for a window starting `2026-09-01` (before the anchor)
  - **Then** the computation clamps to the anchor — no payday date before `2026-09-10` is produced,
    and no negative-offset value is used internally

### Requirement: "Cargar pago" prefill survives `ExpenseFormDialog`'s on-open reset (edge case)

`ExpenseFormDialog` resets its internal state whenever it opens. The prefill contract used by
"Cargar pago" MUST be applied in a way that survives that reset, not be overwritten by it.

- Scenario: opening "Cargar pago" shows the template's data, not the dialog's blank defaults
  - **Given** an operator clicks "Cargar pago" on a template with `category: "services"`,
    `description: "Limpieza semanal"`
  - **When** `ExpenseFormDialog` opens (triggering its on-open reset effect)
  - **Then** the form still shows `category: "services"`, `description: "Limpieza semanal"`,
    today's date, an empty amount field, and has `recurring_expense_id` set to the template's id
    — none of these are wiped back to the dialog's blank defaults by the reset effect

- Scenario: saving a "Cargar pago" expense switches to the period sub-tab
  - **Given** the operator fills in an amount and saves from the prefilled dialog
  - **When** the save succeeds
  - **Then** the UI switches to the "Del período" sub-tab so the newly logged payment is visible

---

## Domain 4: revenue-analytics (modified capability)

Extends `useOrdersAnalytics` (previously specified in `finanzas-gastos-recetas/spec.md` Domain 6,
`finance-summary`). Covers rules 3, 7, 9, 10, D7, and the zero-templates success criterion.

### Requirement: `expensesTotal`, `expensesChange`, and `netRevenueChange` include prorated recurring allocations

`expensesTotal` for a period MUST equal one-off `expenses.amount` (already required by
`expense-tracking`) plus the sum of prorated recurring allocations for that period
(`recurring-expense-proration`, Domain 2). The same fold-in MUST apply to the previous-period
comparison used by `expensesChange` and `netRevenueChange` (rule 7) — folding recurring money into
only the current period would manufacture a fake spike the first time a template exists.

- Scenario: expensesChange does not show a phantom spike on the first period with a template
  - **Given** a monthly template `amount = 300000` (30-day month, `$10,000`/day) has existed for
    both the current period and the previous period (e.g. it started well before either), and
    one-off expenses are identical (`$0`) in both periods
  - **When** `useOrdersAnalytics` computes `expensesChange` (current vs. previous)
  - **Then** `expensesChange` is `0%` — both periods include the same prorated recurring amount,
    so there is no artificial jump introduced by the recurring feature itself

### Requirement: `netRevenue = totalRevenue − expensesTotal`; commission is never an operand, even with recurring money folded in (rule 10)

`computeNetRevenue`'s formula and call signature are unchanged from `finanzas-gastos-recetas`
(`lib/services/finance-summary.ts` stays byte-identical). Only the *value* passed as
`expensesTotal` changes — it now includes prorated recurring allocations. `commissionTotal` MUST
remain purely informational, never subtracted.

- Scenario: the exact 90/20/10→70 case still holds when part of `expensesTotal` is a prorated recurring allocation (MANDATORY — highest-stakes scenario in this change)
  - **Given** a period contains one order with `total_amount = 90` (already net of
    `commission_amount = 10`, per `use-create-order.ts`'s formula, as established by
    `finanzas-gastos-recetas`), and this period's `expensesTotal` of `20` is now composed of a
    `5` one-off expense **plus** a `15` prorated allocation from an active monthly recurring
    template (instead of being entirely one-off, as it was before this change)
  - **When** the Resumen tab computes `totalRevenue = 90`, `expensesTotal = 5 + 15 = 20`,
    `commissionTotal = 10`, and `netRevenue`
  - **Then** `netRevenue = totalRevenue − expensesTotal = 90 − 20 = 70` — the exact same result as
    the pre-existing `finanzas-gastos-recetas` scenario, now proven to hold when `expensesTotal`
    is partly composed of prorated recurring money
  - **And** `netRevenue` is explicitly NOT computed as `90 − 20 − 10 = 60`
  - **And** `commissionTotal` (`10`) is still shown purely as informational, already-deducted
    context — never subtracted, never folded into `expensesTotal`

### Requirement: `expensesByCategory` is computed once, in the hook, from both one-off and recurring sources (rule 9, D7)

`useOrdersAnalytics` MUST expose `expensesByCategory`, built from one-off `expenses` rows AND
prorated recurring allocations together. No consuming component (`resumen-tab.tsx`,
`gastos-tab.tsx`) may recompute its own category breakdown from a local `useExpenses` call.

- Scenario: category cards in Resumen and Gastos agree, and sum to the Gastos tile, to the cent
  - **Given** a period has a `rent` recurring template prorating to `70000` and a `supplies`
    one-off expense of `30000`
  - **When** both `resumen-tab.tsx` and `gastos-tab.tsx` render their category breakdowns for this
    period
  - **Then** both read `analytics.expensesByCategory` (neither contains a local expenses-reduce)
  - **And** both show `rent: 70000`, `supplies: 30000`, and the other 3 fixed categories at `0`
  - **And** the sum of all 5 category values (`100000`) equals `analytics.expensesTotal` exactly,
    to the cent

> **Open question (not decided by this spec — see Risks):** whether `expensesByCategory` returns a
> single merged number per category (`{ rent: 100000 }`) or a split shape
> (`{ rent: { total, oneOff, recurring } }`) is explicitly left open by the proposal itself
> ("Open design questions" #4, leaning merged but not closed). This spec's scenarios are written
> against the merged shape and are compatible with a split shape as long as the merged total is
> also exposed; `sdd-design` must confirm the exact return shape.

### Requirement: with zero recurring templates, every Resumen and Gastos figure is byte-identical to today

This is a standalone requirement, not an implementation detail: because Unit 3 (analytics fold-in)
ships before any template can exist, every numeric and visual output of Resumen and Gastos MUST be
provably unchanged in the zero-templates state.

- Scenario: zero templates produce identical output to the pre-change behavior
  - **Given** no rows exist in `recurring_expenses`
  - **When** `useOrdersAnalytics` computes `expensesTotal`, `dailyData`, `expensesChange`,
    `netRevenueChange`, `netRevenue`, and `expensesByCategory` for any period
  - **Then** every one of these values is identical to what `finanzas-gastos-recetas`'s
    pre-existing computation would have produced for the same one-off expenses and orders — the
    recurring fold-in contributes `0` everywhere and changes no rendered figure

### Requirement: a sub-month view shows that view's own prorated share, labeled as such (rule 3)

A week (or other custom sub-month) view MUST show only that range's share of a monthly template's
proration — this is intended behavior, not a bug — and the UI MUST make the prorated nature of the
figure legible so it is not misread as a partial or missed payment.

- Scenario: a 7-day view shows a week's share of a monthly template, labeled as prorated
  - **Given** a monthly template has `amount = 300000` in a 30-day month
  - **When** the operator selects a 7-day custom range fully inside that month
  - **Then** the Gastos figure for that range includes `70000` from this template
    (`300000 / 30 × 7`)
  - **And** the UI presents this figure with a "prorrateado" (or equivalent) indicator, not as a
    bare number indistinguishable from a fully-logged one-off expense

---

## Domain 5: expense-tracking (modified capability)

Extends one-off expense create/list (previously specified in `finanzas-gastos-recetas/spec.md`
Domain 4). Covers D5's FK addition and its consuming prefill contract.

### Requirement: `expenses` gains an optional `recurring_expense_id`, written by `useCreateExpense`

`expenses.recurring_expense_id` (nullable FK → `recurring_expenses.id`) MUST be a new optional
field on `useCreateExpense`'s input, alongside the existing fields. It MUST be `NULL` for any
expense not created via "Cargar pago".

- Scenario: an ordinary one-off expense has `recurring_expense_id = NULL`
  - **Given** an operator logs an expense through the normal (non-"Cargar pago") flow
  - **When** the expense is created
  - **Then** `recurring_expense_id` is `NULL` on the resulting row

- Scenario: a "Cargar pago" expense carries the template's id
  - **Given** an operator saves an expense from the "Cargar pago" prefilled dialog for template
    `uuid-1`
  - **When** the expense is created
  - **Then** the resulting row has `recurring_expense_id = 'uuid-1'`

---

## Domain 6: finance-overview (modified capability)

Extends the `/finanzas` shell (previously specified in `finanzas-gastos-recetas/spec.md` Domain 1,
`finance-navigation`). Covers the Gastos-tab restructuring named in the proposal's capability
contract.

### Requirement: the Gastos tab becomes a two-sub-tab surface — "Del período" and "Fijos mensuales" — not a fifth top-level tab

The existing 4-tab shell (Resumen, Gastos, Insumos, Recetas) is unchanged at the top level; `?tab=`
stays a four-value union. Inside the Gastos tab, a nested `Tabs` MUST split "Del período" (existing
one-off list) from "Fijos mensuales" (new: recurring templates list + create/close-and-replace/
delete actions).

- Scenario: /finanzas still renders exactly 4 top-level tabs after this change
  - **Given** a user with `stock_management` access opens `/finanzas`
  - **When** the page renders
  - **Then** the top-level tabs are still exactly Resumen, Gastos, Insumos, Recetas (no fifth tab)
  - **And** opening the Gastos tab shows two nested sub-tabs: "Del período" and "Fijos mensuales"

---

## Risks / assumptions requiring follow-up (spec-level gaps only — not proposal re-litigation)

1. **Close-and-replace `effectiveFrom` lower bound is unspecified.** The proposal bounds `DELETE`
   to `start_date >= today` (D4) but states no equivalent bound for the "Actualizar"
   (close-and-replace) `effectiveFrom` date. A past `effectiveFrom` would retroactively change an
   already-reported period's total, which appears to conflict with D3's stated intent ("historical
   proration stays intact"). This spec's Domain 1 close-and-replace scenario assumes a
   present-or-future `effectiveFrom`; whether a past date should be rejected is flagged for
   `sdd-design`, not decided here.
2. **`expensesByCategory`'s exact return shape (merged vs. split by source) is an open design
   question in the proposal itself** ("Open design questions" #4), not a closed decision. Domain
   4's requirement is written to be compatible with either shape as long as a merged total is
   exposed; the final shape is `sdd-design`'s call.
3. **Carried forward from `finanzas-gastos-recetas/spec.md`** (still applicable, unchanged by this
   proposal): the exact ledger schema for expense↔stock sync remains schema-shape-agnostic per that
   spec's Domain 5, and is untouched by this change (D2/out-of-scope confirm recurring expenses
   never enter that path).
