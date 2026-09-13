# Proposal: `gastos-recurrentes` — Recurring expense templates with on-read proration

## Intent

`finanzas-gastos-recetas` shipped `/finanzas` with one-off expenses only, and its own proposal
recorded recurring expenses as an explicit, temporary non-goal
(`.atl/sdd/finanzas-gastos-recetas/proposal.md:35`, restated in the migration header at
`scripts/045-expenses.sql:21-27`). That deferral is now being closed.

The gap it leaves is concrete:

- **Fixed costs are invisible until someone remembers to type them.** Rent, internet, a monthly
  cleaning contract — the operator either logs them by hand every month as a one-off `expenses`
  row, or they silently vanish from `netRevenue`. `computeNetRevenue`
  (`lib/services/finance-summary.ts:48-55`) is arithmetically correct but structurally blind: it
  only ever sees what was manually typed.
- **Sub-month periods over-report profit.** Resumen supports week and custom ranges
  (`components/finanzas/resumen-tab.tsx:81-121`). A week view today shows a full week of revenue
  against zero rent. The number is not just incomplete, it is *systematically optimistic* — the
  worst direction for a "did I make money?" screen.
- **Cadence-based payments have no anchor.** An hourly employee paid every fortnight has no place
  in morfito that says "this person gets paid every 15 days". The operator has no way to know
  whether they already logged this fortnight's payment.
- **A latent consistency bug is already sitting in the code.** `resumen-tab.tsx:123-134` and
  `gastos-tab.tsx:92-101` each build their own expenses-by-category breakdown from their own
  `useExpenses` call, while the "Gastos" stat tile reads `analytics.expensesTotal` from
  `useOrdersAnalytics` (`resumen-tab.tsx:156`). Today both paths sum the same single table, so
  they agree by accident. The moment `expensesTotal` also contains prorated recurring money, the
  category cards will show *less* than the total card, in the same viewport, with no explanation.
  This change cannot ship without fixing that.

This change adds `recurring_expenses` templates, prorates them **on read** into the existing
`expensesTotal`, and makes the analytics hook the single source of truth for the category split.

## Confirmed product decisions (closed — not open questions)

These were decided with the user before this proposal and are treated as requirements, not
options. `sdd-spec` should encode each one as a testable requirement.

| # | Decision | Consequence |
|---|---|---|
| **D1** | **Full parity with jebbs.** `monthly` templates carry an amount and prorate daily; `weekly`/`biweekly` templates are informational (cadence + description, no amount), with a "Cargar pago" action and an "N de M pagos cargados" counter. | Two behaviors in one table, gated by `frequency`. |
| **D2** | **Recurring expenses NEVER touch stock**, not even `category = 'supplies'`. Unlike one-off `expenses`, which do since PR5 (`lib/hooks/expenses/use-expenses.ts:120-150`). | `recurring_expenses` gets **no** `supply_id` / `quantity` columns at all. The rule is made unrepresentable by the schema instead of guarded in code. |
| **D3** | **Never `UPDATE` the amount of an active template.** Changing an amount = close the current row with `end_date` + insert a new row starting the next day. | Historical proration stays intact; "never rewrite past periods". Ported from jebbs (`scripts/003-costs-schema.sql:36-38`, `lib/hooks/use-expenses.ts:402-442`). |
| **D4** | **`DELETE` only while `start_date >= today` (AR calendar date).** Stricter than jebbs, which allows deleting any template behind a text warning. Once `start_date` has passed, the only exit is `end_date`. | Covers "I mistyped it ten seconds ago" without letting anyone erase money that already moved a reported number. See *Edge cases* for the today-boundary. |
| **D5** | **Improvement over jebbs #1 — a real foreign key.** Add `recurring_expense_id UUID NULL REFERENCES recurring_expenses(id)` to `expenses`. "Cargar pago" writes it; the counter reads it. | Replaces jebbs' description-string equality match (`jebbs-dashboard/lib/utils/expenses.ts:322-323`), which jebbs itself documents as a known tradeoff (`:306-307`): renaming a description silently breaks the join. |
| **D6** | **Improvement over jebbs #2 — frequency is generic.** Any category can be `weekly`/`biweekly`/`monthly` (a weekly cleaning service is `services`). No coupling to `salaries`. | Drops jebbs' three category gates: the frequency `Select` shown only for salaries (`jebbs-dashboard/app/(dashboard)/finanzas/page.tsx:1205`), the forced reset to monthly on category change (`:1169`), and the hardcoded `setExpenseCategory("salaries")` in the quick-log prefill (`:517`). |
| **D7** | **`expensesByCategory` moves into `useOrdersAnalytics`** and both consuming components read it instead of recomputing. | Requirement, not a nice-to-have — see *Intent*, fourth bullet. jebbs already does this (`jebbs-dashboard/lib/hooks/orders/use-orders-history.ts:586-598`, returned at `:730`). |

## Scope (staged work units)

**Unit 1 — Schema + types.** `scripts/047-recurring-expenses.sql`: new `recurring_expenses` table
plus `ALTER TABLE expenses ADD COLUMN recurring_expense_id`. `RecurringExpense` /
`RecurringExpenseFrequency` types; `Expense` gains `recurring_expense_id`. Nothing reads it yet.

**Unit 2 — Pure calendar + proration layer.** `lib/utils/calendar-date.ts` (new, pure) and
`lib/services/recurring-expenses.ts` (new, pure), each with its own `.test.ts`. No hooks, no UI,
no React, no supabase. Strict TDD.

**Unit 3 — Analytics fold-in + `expensesByCategory`.** `useOrdersAnalytics` prorates templates
into `expensesTotal`, into `dailyData[].expenses`, and into the previous-period comparison; it
exposes `expensesByCategory` already merged. `resumen-tab.tsx` and `gastos-tab.tsx` migrate to
read it. **Numerically a no-op until Unit 4 exists** — there are no templates yet — which is
exactly why it ships first.

**Unit 4 — "Fijos mensuales" sub-tab.** `lib/hooks/expenses/use-recurring-expenses.ts` (list /
create / close-and-replace / conditional delete) and a sub-tab inside the existing **Gastos** tab,
beside "Del período". Not a fifth top-level tab.

**Unit 5 — "Cargar pago" + payday counter.** Prefills the existing `ExpenseFormDialog` from a
template, writes `recurring_expense_id`, and renders "N de M pagos cargados" counted by FK.

## Out of scope (non-goals, with reasons)

| Non-goal | Why |
|---|---|
| **Any scheduling / cron / materialization job** | Proration is computed **on read**, in a pure function, from the template rows. No background process, no generated `expenses` rows, no "next_due_date" column. A materialized row would need reconciliation the moment a template is closed or a period is re-read. |
| **Stock movements from recurring expenses** | D2. No `supply_id`/`quantity` on the new table; `expense_stock_movements` (`scripts/046`) is not touched. |
| **Changing `computeNetRevenue`'s signature** | `lib/services/finance-summary.ts:28-46` stays byte-identical. Recurring money is folded into `expensesTotal` *before* the call, exactly like one-off expenses are today (`use-orders-history.ts:239-250`). |
| **Porting jebbs' commission subtraction** | `jebbs-dashboard/lib/hooks/orders/use-orders-history.ts:564` reads `netRevenue = currentRevenue - expensesTotal - commissionTotal`. jebbs stores gross totals; morfito's `orders.total_amount` is already net of commission. Copying it reintroduces the exact double-deduction that `finance-summary.ts:10-25` and D5 of `finanzas-gastos-recetas/design.md` exist to prevent. |
| **Any other change to `expenses` / `expense_stock_movements`** | The only schema touch is the single nullable FK column of D5. The `expenses_supply_bump_pairing` CHECK (`scripts/045-expenses.sql:95-98`) is untouched. |
| **Editing a template's description, category or frequency in place** | Out for the first slice. D3 governs the *amount*; description/category/frequency edits raise the same "does it rewrite history?" question and deserve their own decision. jebbs' own update dialog carries description and category over unchanged (`finanzas/page.tsx:496-498`). |
| **Templates as a budget/forecast tool** | This is cost allocation for periods that have *happened*. No "projected next month" view, no variance-vs-budget. |
| **Backfill of historical fixed costs** | The operator can create a template with a past `start_date` and it will prorate retroactively. No import tooling. |
| **A DB-level trigger enforcing D4** | See *Open design questions*. First slice enforces in the hook + UI. |

## Capabilities (contract with `sdd-spec`)

### New capabilities
- `recurring-expense-templates`: create / list / close-and-replace / conditionally-delete monthly,
  biweekly and weekly expense templates, with an inclusive `[start_date, end_date]` lifetime.
- `recurring-expense-proration`: pure, on-read expansion of monthly templates into per-day and
  per-period allocations, prorated against each day's own calendar month length.
- `payday-tracking`: cadence grid for informational templates plus FK-based "payments logged"
  progress within a window.

### Modified capabilities
- `revenue-analytics` (`useOrdersAnalytics`): `expensesTotal`, `expensesChange`,
  `netRevenueChange` and `dailyData[].expenses` now include prorated recurring allocations;
  the hook gains `expensesByCategory`. **`netRevenue`'s formula does not change.**
- `expense-tracking`: `expenses` gains an optional `recurring_expense_id`; `useCreateExpense`'s
  input (`lib/hooks/expenses/use-expenses.ts:99-106`) gains the same field;
  `ExpenseFormDialog` gains a prefill contract.
- `finance-overview`: the Gastos tab becomes a two-sub-tab surface.

## Key business rules

1. **Only `monthly` templates produce money.** `weekly`/`biweekly` contribute **exactly zero** to
   `expensesTotal`, regardless of what their `amount` column holds. The real payment is the
   one-off `expenses` row. *Why*: an hourly wage is not knowable in advance, and a template that
   both prorated *and* had a matching one-off row would double-count the same payment. jebbs
   enforces this with an unconditional skip (`lib/utils/expenses.ts:211`) rather than an
   `amount != null` check, deliberately (`:288-294`) — port that posture.
2. **Proration rate = `amount / days-in-the-month-that-day-belongs-to`, walked day by day.** Not
   `amount / days-in-period`, not a 30-day average. A template active across January and February
   contributes 31 days at `amount/31` plus the February days at `amount/28`.
   (`jebbs-dashboard/lib/utils/expenses.ts:97-102, 213-226`.)
3. **A week view shows a week's share of rent.** This is the intended product behavior, not a bug
   report waiting to happen: with a $300.000 monthly template, a 7-day view in a 30-day month
   shows $70.000 of rent. The Resumen UI should make "prorrateado" legible so the operator does
   not read it as a partial payment.
4. **`end_date` is inclusive** — the last day the template applies. Consequently
   **close-and-replace must set `end_date = new start_date − 1 day`**, never the same day, or that
   day is charged twice. jebbs gets this right via `dayBeforeStr` (`finanzas/page.tsx:493`);
   morfito has no such helper today and must add one.
5. **Templates are queried with NO date filter.** Overlap is decided inside the pure function, not
   in SQL. *Why*: a template with `start_date` in 2024 and `end_date IS NULL` still contributes to
   this month; any `gte("start_date", periodStart)` filter would silently drop exactly the
   long-running templates the feature exists for. (jebbs: `use-orders-history.ts:355-357`.)
6. **Proration inputs must be pure calendar dates (UTC midnight), never AR-offset instants.** This
   is the single highest technical risk in the change — see *Approach*.
7. **The previous-period comparison must also be prorated.** `expensesChange` and
   `netRevenueChange` (`use-orders-history.ts:332-336`) compare current against previous. Folding
   recurring money into only the current side manufactures a fake spike on the very first render.
   (jebbs: `use-orders-history.ts:572-584`.)
8. **`dailyData[].expenses` must include the per-day allocations**, not only the aggregate.
   Invariant, and a required test: `sum(dailyData[].expenses) === expensesTotal` within a float
   tolerance. Otherwise Resumen's "Ingresos vs. gastos por día" chart
   (`resumen-tab.tsx:347-418`) silently disagrees with the "Gastos" tile directly above it.
9. **`expensesByCategory` is computed once, in the hook, from both sources.** No component may
   recompute a category split from `useExpenses`. (D7.)
10. **`netRevenue = totalRevenue − expensesTotal`. Commission is never an operand.** Unchanged, and
    a regression test must assert it still holds once `expensesTotal` includes recurring money.
11. **Amount is required for `monthly`, forbidden-in-practice for `weekly`/`biweekly`.** DB-nullable
    (jebbs' `scripts/006`), enforced at the form (jebbs: `finanzas/page.tsx:455-461`).
12. **Delete is allowed only while `start_date >= today` in AR time.** Today must come from the same
    AR-calendar source the expense dialog already uses (`expense-form-dialog.tsx:80`,
    `todayArStr()`), not from `new Date()` in the browser's local zone or `CURRENT_DATE` in UTC.
13. **The payment counter matches by `recurring_expense_id`, never by description or category.**
    (D5 + D6: jebbs' `category === "salaries"` filter at `lib/utils/expenses.ts:322-323` is dropped
    entirely, not merely supplemented.)
14. **Deleting a template must never delete a logged payment.** The FK is `ON DELETE SET NULL`.
    `CASCADE` is forbidden — a payment is real money that left the business, and D4 already means a
    deletable template has no payments anyway.

## Edge cases (called out deliberately)

- **`start_date === today`.** Under D4 this row is still deletable, even though a monthly template
  starting today already contributes today's daily slice to the current period. Accepted: the day
  is still in progress, no closed period depends on it, and excluding today would defeat the
  "I just mistyped it" case D4 exists for. `sdd-spec` should pin the boundary as `>=`, with a test.
- **Zero templates.** Every code path must behave identically to today. Unit 3 ships before any
  template can exist precisely so this is provable in production.
- **Template entirely outside the period.** No allocations, no zero-amount rows, no category entry
  created — `expensesByCategory` keys stay the fixed five, initialized to 0.
- **Template closed mid-period.** Charged through `end_date` inclusive, then stops.
- **Custom range crossing a month boundary.** The cross-month proration case (rule 2) — mandatory
  test.
- **Float drift.** `amount/31` summed 31 times is not exactly `amount`. Assert with a tolerance,
  never with `toBe`. Display already rounds through `formatCurrency`.
- **A weekly template with a stale `amount`.** Must still contribute zero (rule 1).
- **`ExpenseFormDialog` resets all state on open** (`expense-form-dialog.tsx:88-96`). A naive
  prefill prop will be wiped by that effect. Unit 5 must extend the reset, not fight it.
- **Payday grid window starting before the template's anchor.** jebbs handles it explicitly
  (`lib/utils/expenses.ts:110-117`): clamp to the anchor, never assume `daysSinceAnchor >= 0`.
  Port the handling *and* the test.

## Approach

### The highest-risk detail: calendar dates vs. AR instants

`use-orders-history.ts` computes its period bounds as **AR-local instants** — `arDateToUTC`
(`:17-23`) bakes a `+3h` offset into the UTC value, and `startDateStr`/`endDateStr` (`:147-150`)
are derived from those instants via `toArDateStr` (`:11-13`). Feeding either form into
day-boundary proration math off-by-ones the edges of a month.

morfito has **no** pure calendar-date helper today. Verified: `Date.UTC` appears exactly once in
`lib/`, inside `arDateToUTC` itself. `lib/utils/` contains `format.ts`, `commission.ts`,
`variant-pricing.ts`, `order-status*.ts`, `formatOrder*.ts` — no date module.

jebbs solved this with a dedicated parser (`dateStrToCalendarUTC`,
`jebbs-dashboard/lib/hooks/orders/use-orders-history.ts:31-34`, with the reasoning spelled out at
`:25-30`, mirrored by `parseDateUTC` in `lib/utils/expenses.ts:75-78`) and converts at the call
boundary (`:546-553`).

**Proposal:** add `lib/utils/calendar-date.ts` exporting `parseCalendarDate` (string →
UTC-midnight `Date`), `formatCalendarDate` (inverse), `daysInMonth`, `addDays` and `dayBefore`
(rule 4). Placed in `lib/utils/` rather than inside the service because `use-orders-history.ts`
needs it directly and a hook should not import from a service purely for a date parser. It gets
its own `calendar-date.test.ts` — vitest's default include glob picks it up with no config change
(`vitest.config.ts` sets only `environment` and the `@` alias; `package.json:10` is
`vitest run`).

### Pure proration service

`lib/services/recurring-expenses.ts` — new, pure, no React and no supabase imports, following the
posture `lib/services/finance-summary.ts:1-8` and `lib/services/recipe-cost.ts` already establish,
with a companion `recurring-expenses.test.ts` (both existing services are the only tested pure
modules in the repo; this becomes the third).

Surface, ported from `jebbs-dashboard/lib/utils/expenses.ts`:

- `expandRecurringExpensesDaily(templates, periodStart, periodEnd): DailyRecurringAllocation[]`
  — the primitive (`:183-230`).
- `expandRecurringExpenses(...)`: derived by summing the daily output, grouped **by template id**,
  never by description/category (`:247-277` — two templates can legitimately share both).
- `previewPaydayDates` / `monthWindowFor` / `isInformationalPaydayTemplate` (`:143-159, 295-300`).
- `paydayProgressFor` / `aggregatePaydayProgress` (`:308-352`), **rewritten** for D5/D6: matches
  `recurring_expense_id === template.id`, drops the `category === "salaries"` filter.

Required tests, at minimum: the cross-month case (rule 2); the sum-of-daily equals aggregate
identity; weekly/biweekly contributing zero even with an amount (rule 1); `end_date` inclusivity
and the close-and-replace day-before boundary (rule 4); a template fully outside the period; the
payday window-before-anchor clamp; and an integration-style assertion that
`computeNetRevenue({ totalRevenue, expensesTotal: oneOff + prorated, commissionTotalInformational })`
still yields `totalRevenue − expensesTotal` with commission untouched (rule 10).

### Data model

Next free migration number is **047** — verified, `scripts/046-expense-stock-movements.sql` is the
last. `recurring_expenses` does not collide with anything: the repo's `CREATE TABLE` inventory is
`customers, customer_addresses, categories, burgers, extras, combos, combo_slots,
combo_slots_rules, orders, order_items, order_item_extras, external_income, products,
variant_groups, variant_options, supplies, product_supplies, order_stock_movements, expenses,
expense_stock_movements`. The string `recurring` appears in `scripts/` only inside
`045-expenses.sql`'s "why not modelled here" header comment.

`scripts/047-recurring-expenses.sql` (full DDL is `sdd-design`'s job):

```
recurring_expenses
  id           UUID PK DEFAULT gen_random_uuid()
  amount       DECIMAL(10,2) NULL          -- NULL for weekly/biweekly (D1)
  category     TEXT NOT NULL CHECK (same 5 values as expenses.category)
  description  TEXT NOT NULL               -- identifies the template, unlike expenses.description
  frequency    TEXT NOT NULL DEFAULT 'monthly'
               CHECK (frequency IN ('weekly','biweekly','monthly'))
  start_date   DATE NOT NULL
  end_date     DATE NULL                   -- inclusive last day (rule 4)
  created_at   TIMESTAMPTZ DEFAULT NOW()
  -- NO supply_id, NO quantity (D2)

expenses
  + recurring_expense_id UUID NULL REFERENCES recurring_expenses(id) ON DELETE SET NULL
```

Where jebbs needed three migrations to reach this shape (`003-costs-schema.sql:39-46`,
`005-recurring-expense-frequency.sql:42-44`, `006-recurring-expense-amount-nullable.sql:37`),
morfito lands it in one — there is no data to migrate and the FK column starts NULL everywhere,
so no backfill exists.

House migration style from `041`–`046`: `information_schema` / `pg_tables` pre-flight comments, a
single `BEGIN`/`COMMIT`, plain `ADD COLUMN` (never `IF NOT EXISTS`), a documented undo block, RLS
enabled with the same allow-all policy (`scripts/045-expenses.sql:106-111`), and an index on the
column every read filters by — here `start_date`, mirroring jebbs
(`003-costs-schema.sql:79`) and `idx_expenses_date` (`045:104`). A partial index on
`expenses(recurring_expense_id) WHERE recurring_expense_id IS NOT NULL` is likely worth it for the
payment counter; `sdd-design` decides.

### Analytics integration

Inside `useOrdersAnalytics`' `queryFn`, alongside the existing eight parallel queries
(`use-orders-history.ts:196-208`): one unfiltered `recurring_expenses` select (rule 5). Then, at
the point where `expensesTotal` is currently assembled (`:239-250`):

1. Convert `startDateStr` / `endDateStr` / `prevStartDateStr` / `prevEndDateStr` through
   `parseCalendarDate` (rule 6).
2. `expensesTotal = oneOffTotal + sum(expandRecurringExpenses(...))`, same for the previous period
   (rule 7).
3. Fold the daily allocations into `dailyMap[key].expenses` next to the existing one-off fold
   (`:292-296`) — the keys already align, since the gap-fill loop (`:298-313`) walks
   `start`→`end` keying by the same `toArDateStr` that produced `startDateStr`.
4. Build `expensesByCategory` from one-off rows **and** allocations, and return it alongside the
   existing spread of `computeNetRevenue`'s result (`:326-337`).

`computeNetRevenue` is called with the same three inputs as today; only `expensesTotal`'s value
changes. This is the whole point of `finance-summary.ts` existing as a separate module.

The current-period `expenses` query selects `date, amount` (`:198-202`); `expensesByCategory` needs
`category` too. That column addition is the only change to the existing queries.

### UI

A `Tabs` nested inside the existing Gastos tab, mirroring jebbs' "Del período" / "Fijos mensuales"
split (`jebbs-dashboard/app/(dashboard)/finanzas/page.tsx:676-684, 793-916`). Not a fifth
top-level tab in `finanzas-tabs.tsx:55-60` — `?tab=` stays a four-value union.

- **Create dialog:** category, description, frequency (`Select`, always visible per D6), amount
  (only when `frequency === "monthly"`, per rule 11), start date.
- **Template row:** description, category badge, frequency badge, Activo / Cerrado-el badge, "Desde
  {start_date}", amount-per-month or the payday preview text, and — for informational templates —
  the "N de M pagos cargados" line.
- **"Actualizar" (close-and-replace):** amount + effective-from date; writes
  `end_date = effectiveFrom − 1 day` on the old row and inserts the new one (rule 4, D3).
- **"Cargar pago":** opens `ExpenseFormDialog` prefilled with the template's category (not
  hardcoded `salaries`, per D6), its description, today's date, an empty amount, and
  `recurring_expense_id` set; switches to the "Del período" sub-tab so the saved payment is
  visible where it lands. Requires a new prefill prop that survives the dialog's on-open reset
  (`expense-form-dialog.tsx:88-96`).
- **Delete:** the button is **absent**, not disabled-with-a-tooltip, once `start_date < today`
  (D4). A closed template is managed with `end_date`, so there is nothing to explain away.

## UI / file touch points

| Path | Impact | What changes |
|---|---|---|
| `scripts/047-recurring-expenses.sql` | New | Table + FK column |
| `lib/utils/calendar-date.ts` (+ `.test.ts`) | New | Pure calendar-date helpers |
| `lib/services/recurring-expenses.ts` (+ `.test.ts`) | New | Proration + payday grid + progress |
| `lib/types/index.ts` | Modified | `RecurringExpense`, `RecurringExpenseFrequency`; `Expense.recurring_expense_id` (next to `:368-382`) |
| `lib/hooks/expenses/use-recurring-expenses.ts` | New | list / create / close-and-replace / delete |
| `lib/hooks/expenses/use-expenses.ts` | Modified | `recurring_expense_id` in `useCreateExpense`'s input (`:99-106`); invalidate `["recurring-expenses"]` where relevant |
| `lib/hooks/orders/use-orders-history.ts` | Modified | Templates query, calendar conversion, proration fold-in, `expensesByCategory` |
| `components/finanzas/gastos-tab.tsx` | Modified | Sub-tabs; `totalsByCategory` (`:92-101`) deleted in favor of the hook |
| `components/finanzas/recurring-expense-*.tsx` | New | List, create dialog, update dialog |
| `components/finanzas/resumen-tab.tsx` | Modified | Local `useExpenses` + `totalsByCategory` (`:123-134`) and the date-string IIFE (`:99-121`) deleted; reads `analytics.expensesByCategory` |
| `components/finanzas/expense-form-dialog.tsx` | Modified | Prefill prop + FK passthrough |
| `lib/services/finance-summary.ts` | **Unchanged** | Explicitly — see out of scope |
| `scripts/045`, `scripts/046` | **Unchanged** | Explicitly — the FK column is added by `047` |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Off-by-one at month edges** from feeding AR-offset instants into proration | High if the conversion step is skipped | High — every rent figure wrong by a day's rate | Rule 6; `parseCalendarDate` at the call boundary; explicit month-edge and cross-month tests |
| **Commission double-subtraction reintroduced** by copying jebbs' `netRevenue` line (`use-orders-history.ts:564`) | Medium — the surrounding code *is* being ported | High | Out of scope table + rule 10 + a regression test that runs with a non-zero prorated total |
| **Category cards disagree with the Gastos total** | High if D7 is skipped | Medium — visible, unexplainable, erodes trust in the screen | D7 is in-scope, in the same slice as the fold-in (Unit 3), and both components migrate in that PR |
| **Daily chart bars do not sum to the Gastos tile** | Medium | Medium | Rule 8 invariant test |
| **Fake period-over-period spike** on first render | Medium | Medium | Rule 7 |
| **Double-charged day** on close-and-replace | Medium | Low-Medium | Rule 4 + `dayBefore` helper + test |
| **Operator confusion: "why is rent only $70.000?"** | High | Medium | Rule 3 — label prorated amounts explicitly in Resumen and in the template list |
| **Weekly template double-counted** (template amount + logged payment) | Low | High | Rule 1's unconditional skip, ported from jebbs' deliberate design (`lib/utils/expenses.ts:288-294`) |
| **`ExpenseFormDialog` prefill silently wiped** by the on-open reset | Medium | Low | Called out in *Edge cases*; Unit 5 |
| **D4 enforced only client-side** | Medium | Low | App-layer first; see *Open design questions* |
| **Extra query on every analytics read** | Low | Low | One unfiltered select on a table that will hold single-digit rows for years; templates are period-independent and fetched once per query key |

## Rollback plan

- **Unit 1:** revert code, then `DROP TABLE recurring_expenses;` after
  `ALTER TABLE expenses DROP COLUMN recurring_expense_id;` (order matters — the FK). Additive
  throughout; `expenses` rows are otherwise untouched.
- **Unit 2:** revert. Pure functions with no callers.
- **Unit 3:** revert. Read-only aggregation; with zero templates the numbers are identical before
  and after, which makes this the safest possible landing point for the arithmetic change.
- **Unit 4:** revert code. Existing template rows become invisible but keep prorating — so a
  revert of Unit 4 *alone* leaves money in `expensesTotal` with no UI to explain it. If Units 3+4
  are both live, revert 4 and 3 together, or leave both.
- **Unit 5:** revert. `recurring_expense_id` values already written stay; they are read-only
  metadata for the counter.

## Dependencies

- `finanzas-gastos-recetas` merged (expenses, `/finanzas` tabs, `computeNetRevenue`, vitest
  harness). **Satisfied** — verified in the working tree.
- Migration numbers `047`+ free. **Verified.**
- vitest present (`package.json:10, 81`) with `@` alias resolution (`vitest.config.ts:8-12`).
  **Satisfied** — no new test tooling.
- `047` applied to the target environment before the Unit 3 PR merges (the analytics query selects
  from `recurring_expenses` unconditionally).
- No new npm dependencies.

## Suggested staging

| PR | Unit | Content | Est. lines | Notes |
|---|---|---|---|---|
| **1** | 1 | `scripts/047-recurring-expenses.sql` + `lib/types` additions | ~150 | Schema only, nothing reads it. Trivially revertible. |
| **2** | 2 | `calendar-date.ts` + `recurring-expenses.ts` + both `.test.ts` | ~400 | **Logic only, no UI, no hooks.** Strict TDD. Deliberately isolated: this is where every subtle bug in the change lives, and it deserves review attention a UI diff would drown. |
| **3** | 3 | Analytics fold-in + `expensesByCategory` + migrate `resumen-tab` / `gastos-tab` off their local reduces | ~300 | Numerically a no-op (zero templates exist), which makes the riskiest arithmetic change provably safe in production before any data can reach it. |
| **4** | 4 | `use-recurring-expenses.ts` + "Fijos mensuales" sub-tab (create / close-and-replace / conditional delete) | ~400 | First PR where a template can exist — and by then the analytics path already handles it. |
| **5** | 5 | "Cargar pago" prefill + FK write + payday counter | ~250 | Depends on 1 (FK), 2 (payday grid) and 4 (sub-tab). |

Each PR is independently shippable, independently revertible (with the Unit 3/4 caveat above) and
under the 400-line review budget. `sdd-tasks` should confirm the forecast.

## Open design questions (for `sdd-design`, not blocking this proposal)

1. **One migration or two?** `047` doing `CREATE TABLE` + `ALTER TABLE expenses ADD COLUMN` in a
   single transaction, versus `047` + `048`. Leaning one: both statements are additive, the FK
   makes them mutually dependent, and 045 set the "land the whole shape in one migration when
   there is nothing to migrate" precedent (`045-expenses.sql` header).
2. **Is D4 enforced in the database?** A `FOR DELETE` RLS policy could express it
   (`USING (start_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)`),
   splitting today's single allow-all `FOR ALL` policy. Trade-off: a real invariant vs. a second
   place where AR-vs-UTC date logic lives. Leaning app-layer only for the first slice, with the
   policy noted as a follow-up.
3. **Where do the payday helpers live** — in `recurring-expenses.ts` or a sibling module? They
   share the calendar primitives but not the proration math.
4. **Does `expensesByCategory` return prorated and one-off money separately** (`{ total, oneOff,
   recurring }` per category) or only the merged total? jebbs merges (`use-orders-history.ts:
   586-598`). Merged is simpler; split would let the UI answer "how much of Alquiler is fixed?".
   Leaning merged for the first slice.

## Success criteria

- [ ] A monthly template with an amount can be created, appears in "Fijos mensuales", and its
      prorated share is included in Resumen's Gastos tile and net revenue for the period
- [ ] A weekly or biweekly template can be created with **any** category, has no amount field, and
      contributes exactly $0 to `expensesTotal` — asserted by test even when its `amount` is non-null
- [ ] A template spanning two calendar months prorates each month against that month's own day
      count — covered by test
- [ ] `sum(dailyData[].expenses) === expensesTotal` within tolerance, with and without templates
- [ ] `netRevenue === totalRevenue − expensesTotal` still holds with a non-zero prorated total;
      `commissionTotal` remains informational — asserted by test
- [ ] `expensesChange` and `netRevenueChange` prorate the previous period too — no phantom spike
      on the first period that has templates
- [ ] Resumen's category cards and the Gastos tab's category cards both read
      `analytics.expensesByCategory`; neither file contains a local expenses reduce
- [ ] The category cards sum to the Gastos tile, to the cent, in a period containing both one-off
      and recurring money
- [ ] Changing a template's amount closes the old row with `end_date = newStart − 1 day` and
      inserts a new one; the previous month's reported total does not move
- [ ] A template with `start_date >= today` shows a delete action; one with `start_date < today`
      shows none
- [ ] "Cargar pago" opens the expense dialog prefilled with the template's own category and
      description, and the saved expense carries `recurring_expense_id`
- [ ] The counter reads "N de M pagos cargados" from the FK — renaming the template's description
      does not change it
- [ ] Deleting a template never deletes an associated expense row
- [ ] With zero templates configured, every Resumen and Gastos figure is byte-identical to today
- [ ] `recurring_expenses` has no `supply_id` / `quantity` column; `supplies.stock_quantity` is
      never written by any code path in this change
- [ ] `lib/services/finance-summary.ts` is unchanged
- [ ] `npm test` green; `tsc --noEmit` clean under TS5 strict; no new lint errors

## Proposal question round

No new question round was run: seven product decisions (D1–D7) were confirmed by the user before
this proposal and are recorded above as closed requirements. The remaining unknowns are technical
and belong to `sdd-design` (see *Open design questions*).

Two items surfaced during verification that the confirmed decisions could not have anticipated,
and that `sdd-spec` should treat as requirements rather than discoveries:

- **Rule 8** — folding recurring money into `expensesTotal` without also folding the per-day
  allocations into `dailyData` breaks the daily chart against the tile above it.
- **Rule 4 / D3 interaction** — `end_date` is inclusive, so close-and-replace must use the day
  *before* the replacement's start or that day is charged twice.

## Verification status of exploration claims

Re-verified directly against the code in this session:

- morfito: `computeNetRevenue`'s exact body and its "commission is informational" contract
  (`lib/services/finance-summary.ts:10-55`); `toArDateStr`/`arDateToUTC`
  (`use-orders-history.ts:11-23`); the period-string derivation (`:147-150`); the existing expenses
  queries (`:196-208`); the `expensesTotal` / `computeNetRevenue` call site (`:239-250`); the daily
  expenses fold and gap-fill (`:292-313`); the analytics return shape (`:315-337`); the duplicated
  category reduces in `resumen-tab.tsx:123-134` and `gastos-tab.tsx:92-101`; the four-tab shell
  (`finanzas-tabs.tsx:55-77`); `ExpenseFormDialog`'s props and on-open reset (`:42-53, 88-96`);
  `useCreateExpense`'s input shape (`use-expenses.ts:99-106`); `Expense`/`ExpenseCategory`
  (`lib/types/index.ts:361-382`); the `expenses` DDL and its pairing CHECK
  (`scripts/045-expenses.sql:75-104`); that `046` is the last migration; that no `recurring_*`
  table exists; that no pure calendar-date helper exists anywhere in `lib/`; vitest setup
  (`package.json:10, 81`, `vitest.config.ts`).
- jebbs: `parseDateUTC`/`formatDateUTC`/`daysInMonth`/`monthlyDailyRate`
  (`lib/utils/expenses.ts:75-102`); `walkOccurrenceGrid`'s before-anchor clamp (`:110-139`);
  `expandRecurringExpensesDaily` including the unconditional non-monthly skip (`:183-230`);
  `expandRecurringExpenses`' group-by-id (`:247-277`); `isInformationalPaydayTemplate` and the
  description-equality `paydayProgressFor` (`:295-326`); `dateStrToCalendarUTC` and its rationale
  (`use-orders-history.ts:25-34`); the unfiltered templates query (`:355-357`); the calendar
  conversion and `expensesTotal` fold (`:546-563`); the commission-subtracting `netRevenue` line
  (`:564`); the previous-period proration (`:572-584`); `expensesByCategory` (`:586-598`);
  `useCloseAndReplaceRecurringExpense` (`lib/hooks/use-expenses.ts:402-442`); `dayBeforeStr` in
  close-and-replace and the salaries-coupled UI gates
  (`app/(dashboard)/finanzas/page.tsx:455-523, 793-916, 1169, 1205`); the three-migration schema
  trail (`scripts/003:39-46`, `005:42-44`, `006:37`).

**Not verified in this session:** whether `047` conflicts with anything applied to the live
Supabase instance — the same standing caveat every migration in this repo carries
(`scripts/045-expenses.sql:63-66`). Run the `pg_tables` / `information_schema` pre-flight before
applying.
