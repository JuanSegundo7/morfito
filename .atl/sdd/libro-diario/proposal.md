# Proposal: `libro-diario` — Daily debit/credit ledger inside the Resumen tab

## Intent

`/finanzas` today answers **"how much did I make this period?"** with three aggregates (Ingresos /
Gastos / Neto, `components/finanzas/resumen-tab.tsx:107-130`), a category breakdown (`:276-306`)
and a daily bar chart (`:310-379`). What it cannot answer is **"where did that number come
from?"**.

The gap is concrete:

- **The bar chart shows two bars per day and nothing else.** An operator looking at a red bar on
  the 14th can see *that* $48.000 left, not *what* it was. The tooltip (`resumen-tab.tsx:327-362`)
  renders two totals — `Ingresos` and `Gastos` — and no line items.
- **Prorated fixed costs are now invisible money.** Since `gastos-recurrentes` PR3, `expensesTotal`
  contains daily allocations from `recurring_expenses` that correspond to **no row anywhere in the
  UI**. The Gastos tab lists one-off `expenses` (`gastos-tab.tsx`) and, in its "Fijos mensuales"
  sub-tab, the templates themselves — but nothing shows "on Aug 14 the rent charged $10.000 of its
  month". The operator's total moved and there is no artifact explaining it.
- **There is no chronological narrative.** Reconciling against a bank statement, a cash box, or a
  supplier invoice requires a date-ordered list of movements with a running balance. morfito has
  no such surface: `useOrdersAnalytics` returns aggregates and a per-day two-number roll-up, never
  individual movements.
- **`netRevenue` is a single number with no audit trail.** `computeNetRevenue`
  (`lib/services/finance-summary.ts:48-55`) is the codebase's one subtraction, and it is correct —
  but "trust me, it's $312.400" is a weaker product than "$312.400, and here are the 41 movements
  that produced it".

The sibling repo `jebbs-dashboard` already ships this surface
(`components/finanzas/daily-ledger.tsx`, fed by `lib/hooks/orders/use-orders-history.ts:634-716`).
This change ports it — with three deliberate divergences (D1–D3 below) — as a **read-only,
fully derived** table.

**This is mostly a READ change.** No new SQL migration. No new table. No new query. The only data
access that changes is one existing `select` gaining one column. Everything else is derived inside
the `queryFn` from rows `useOrdersAnalytics` already fetches.

## Confirmed product decisions (closed — not open questions)

Decided with the user before this proposal. `sdd-spec` should encode each as a testable
requirement, not as an option.

| # | Decision | Consequence |
|---|---|---|
| **D1** | **No commission row. At all.** jebbs' "Comisión PedidosYa" ledger row (`jebbs .../use-orders-history.ts:659-670`, fed by `commissionByDate` at `:621-632`) is **not ported** — not as a debit, not as an informational annotation, not as a badge. | morfito's `orders.total_amount` is already net of commission (`lib/services/finance-summary.ts:10-25`, written by `use-create-order.ts`). A ledger debit row would deduct the same money a second time and make `sum(ledger) ≠ netRevenue`. The commission stays where it is today: one informational tile (`resumen-tab.tsx:238-251`), never an operand. |
| **D2** | **Recurring templates appear PRORATED DAY BY DAY**, on each day they charge — not as a lump at period close. Built from the **already-computed** `recurringAllocations` array (`use-orders-history.ts:249`), reusing the single `expandRecurringExpensesDaily` call `gastos-recurrentes` design D6 established. **No fourth call to that function.** | Deliberately better than jebbs, which emits one row per template dated `endDateStr` (`:685-710`) and documents the tradeoff in its own comment (`:694-698`): the running balance stays "artificially high" all period, then steps down at the end. morfito's balance declines smoothly and every day's row set matches that day's chart bar. Cost: more rows — see *Edge cases* and *Open design questions*. |
| **D3** | **PDF/Excel export is OUT of scope.** `jspdf`, `jspdf-autotable` and `exceljs` are **not** installed. jebbs' `lib/utils/export-ledger.ts` and the export dropdown (`daily-ledger.tsx:24-73, 115-130`) are not ported. | Verified: none of those packages appear anywhere in morfito. Export is a separate, small SDD change built on top of a working table — not a reason to add three dependencies to a read-only view's first slice. |

## Scope (staged work units)

**Unit 1 — Hook plumbing (numerically a no-op).**
Two gaps in `use-orders-history.ts` block the ledger; both are additive.

- **`description` on the current-period expenses select.** Verified at `:204-208`: the select is
  `date, amount, category` — `gastos-recurrentes` PR3 added `category`, `description` is still
  missing. Without it a one-off expense row has no concept text. The **previous-period** select
  (`:209-213`, `date, amount`) is deliberately left alone: it feeds only `prevExpensesTotal`
  (`:277-281`) and never a rendered row.
- **`ordersRevenue` / `externalRevenue` split in `dailyMap`.** Verified at `:330`: the shape is
  `{ orders, revenue, canceled, expenses }`, and `revenue` is written from **two** sources — orders
  at `:335` and `external_income` at `:347`. "Ventas" and "Ingresos externos" cannot be separate
  ledger rows while both live in one field. jebbs already carries the split
  (`jebbs .../use-orders-history.ts:488-509, 526-534`).

**Unit 2 — Pure ledger builder + hook wiring.** New `lib/services/daily-ledger.ts` (+ `.test.ts`)
exporting `LedgerEntry` and `buildDailyLedger(...)`. `useOrdersAnalytics` calls it and returns
`ledger` and `ledgerClosingBalance`. Nothing renders it yet.

**Unit 3 — `DailyLedger` component + mount.** New `components/finanzas/daily-ledger.tsx`, mounted
inside `resumen-tab.tsx` below the daily chart. Read-only table, day-grouped, paginated.

## Out of scope (non-goals, with reasons)

| Non-goal | Why |
|---|---|
| **PDF / Excel export** | D3. No `jspdf`, `jspdf-autotable` or `exceljs` — verified absent from morfito. A follow-up SDD change, built on a table that already works. |
| **Any commission row, in any form** | D1. Including a "$0, informational" variant: rendering a commission line in a debit/credit table invites exactly the mental arithmetic `finance-summary.ts`'s header exists to forbid. |
| **A new top-level tab** | The ledger lives inside the existing **Resumen** tab, below "Ingresos vs. gastos por día". `finanzas-tabs.tsx`'s `?tab=` union does not gain a value. jebbs also mounts it inside an existing tab. |
| **Any SQL migration, table, view or new query** | Nothing is created, altered or fetched. The only data-access delta in the entire change is `description` added to an existing `select` (Unit 1). `scripts/` is untouched. |
| **Manual editing, annotation, reordering or hiding of ledger rows** | The ledger is a **projection**, not a record. Every row is derived from `orders` / `external_income` / `expenses` / `recurring_expenses`. An editable ledger would mean a writable table and a reconciliation story — a different product. Corrections happen where the data lives (Gastos tab, orders). |
| **Changing `computeNetRevenue` or `finance-summary.ts`** | Byte-identical. `netRevenue` remains `totalRevenue − expensesTotal` computed in exactly one place, and the ledger *consumes* it (rule 3) rather than competing with it. |
| **Changing `expensesTotal`, `expensesByCategory` or any KPI's value** | Units 1–3 add fields; they change no existing number. Any diff in an existing tile is a bug, not a feature. |
| **Rows for canceled orders** | `dailyMap[].canceled` is a count with no money attached (`:338-342`); a canceled order contributes $0 to revenue. A ledger row would be a movement that never happened. |
| **Balance carried over from previous periods** | `ledgerClosingBalance` is the **period's** net result, opening at 0 — not a cash-on-hand running total since the business opened. Same semantics as every other figure on the Resumen tab, all of which are period-scoped. A true cumulative balance is a different feature with a different data question ("since when?"). |
| **A ledger for the previous comparison period** | The previous period is fetched as totals only (`:171-176`, `:209-213`); it feeds `%` deltas, never rows. |
| **Per-order line items ("Ventas" broken down by order)** | The daily "Ventas" row aggregates all completed orders that day, matching jebbs. Order-level detail already exists in `/pedidos`. |

## Capabilities (contract with `sdd-spec`)

### New capabilities
- `daily-ledger`: a pure, period-scoped projection of every money movement — daily sales, daily
  external income, individual one-off expenses, and per-day prorated recurring allocations —
  emitted chronologically with a running balance, plus a read-only day-grouped, paginated table
  rendering it.

### Modified capabilities
- `revenue-analytics` (`useOrdersAnalytics`): `dailyData[]` gains `ordersRevenue` and
  `externalRevenue` (with `revenue` preserved and unchanged); the current-period `expenses` select
  gains `description`; the hook returns `ledger: LedgerEntry[]` and `ledgerClosingBalance: number`.
  **No existing returned value changes.**
- `finance-overview` (Resumen tab): gains the ledger card below the daily chart. No other section
  of the tab is modified.

## The `LedgerEntry` shape (morfito)

```ts
export interface LedgerEntry {
  date: string;                    // YYYY-MM-DD, AR calendar date
  concept: string;                 // "Ventas" | "Ingresos externos" | expense/template description
  kind: "income" | "expense";      // sign is implied by kind, never by the number
  isProrated: boolean;             // true ONLY for recurring allocations -> "prorrateo" badge
  amount: number;                  // ALWAYS POSITIVE
  balance: number;                 // running balance WITHIN the visible period, opening at 0
}
```

Identical to jebbs' (`jebbs .../use-orders-history.ts:99-106`) — the divergences (D1, D2) live in
**which rows are emitted and when**, not in the row shape. There is no commission field, no
commission `kind`, and no commission `concept`.

## Key business rules

1. **`ledgerClosingBalance = netRevenue`, taken directly from `computeNetRevenue`'s result. It is
   NEVER re-summed from the `ledger` array.** This is the same "zero money arithmetic on the
   netRevenue path" invariant `resumen-tab.tsx:64-69` already declares for the rest of the screen,
   extended to the ledger. *Why it matters concretely*: `expandRecurringExpensesDaily` emits
   `amount / daysInMonth`, so 31 allocations summed do not exactly reproduce the template's amount.
   Re-summing the array would put that sub-cent drift on screen, directly under a `netRevenue`
   figure computed the other way. jebbs pins this explicitly (`:712-716`).
2. **Row order within a day: `Ventas` → `Ingresos externos` → one-off expenses → prorated
   recurring allocations.** Deterministic and stable, so the running balance is reproducible
   across renders.
3. **Amounts are always positive; direction is carried by `kind` alone.** `income` renders in the
   *Haber* column, `expense` in the *Debe* column. No negative numbers, no sign flipping in the
   component.
4. **Zero-amount movements emit no row.** A day with no sales has no "Ventas $0" row; a $0
   allocation is skipped (jebbs: `:637, 648, 672, 700`). The ledger shows movements, not a
   calendar.
5. **Chronological order comes from `dailyData`, not from a sort.** `dailyData` is already built by
   walking `start → end` one day at a time (`:371-385`). The builder walks that array; there is no
   comparator to get wrong and no re-derivation of the period's day range.
6. **Prorated rows land on the day they charge** (D2), keyed by `allocation.date`, which
   `expandRecurringExpensesDaily` already produces as a `YYYY-MM-DD` string joining directly to
   `dailyData[].date` (`lib/services/recurring-expenses.ts:24-30`).
7. **`recurringAllocations` is consumed, never recomputed.** The array computed once at `:249`
   already feeds `expensesTotal` (`:276`), `expensesByCategory` (`:309-311`) and the daily fold
   (`:364-368`). The ledger becomes its fourth consumer — which is precisely what makes "the ledger
   agrees with the Gastos tile" structural rather than merely tested.
8. **`revenue = ordersRevenue + externalRevenue` must be preserved exactly** in every
   `dailyData` row. See *Risks* — this is the single highest-risk line in the change.
9. **The commission is never an operand and never a row.** (D1.) A regression test must assert
   `sum(income) − sum(expense) ≈ netRevenue` **within float tolerance** with a non-zero
   `commissionTotal` present, which fails loudly if a commission row is ever added.
10. **The ledger is read-only.** No mutation, no `useMutation`, no delete affordance, no
    row-level menu. Corrections are made at the source.
11. **A prorated row's `concept` is the template's own description**, with the `isProrated` badge
    (not the word "prorrateado" duplicated into the text) doing the explaining — jebbs' reasoning
    at `:690-693`, ported.
12. **The period-over-period comparison is untouched.** No ledger is built for the previous
    period; `expensesChange` / `netRevenueChange` (`:405-409`) keep their current values.

## Edge cases (called out deliberately)

- **Empty period.** Zero rows → "Sin movimientos en este período" (jebbs `daily-ledger.tsx:135-138`),
  **and the closing-balance strip still renders `$0`** — from `netRevenue`, per rule 1.
- **A one-off expense with `description === null`.** `Expense.description` is nullable
  (`lib/types/index.ts:373`) and `expense-list.tsx:76` already falls back to `"—"`. A ledger row
  reading "—" is useless; jebbs falls back to `Gasto (${EXPENSE_CATEGORY_LABELS[category]})`
  (`:676`). morfito's label map lives in a **component** file
  (`components/finanzas/expense-list.tsx:16`) — see *Open design questions* #2.
- **Row-count explosion from D2.** N monthly templates × a 31-day month = up to 31 × N prorated
  rows, on top of sales/external/one-off rows. With 4 templates a month reaches ~180 rows. Day-based
  pagination (jebbs: 10 days/page, `daily-ledger.tsx:38, 90-95`) bounds what is on screen, but the
  visual density inside a single day is a real product question — *Open design questions* #1.
- **Float drift.** `sum(ledger amounts)` will not exactly equal `netRevenue`. Assert with a
  tolerance, never `toBe`. Rule 1 keeps the drift off the screen regardless.
- **A day whose `dailyMap` key falls outside the gap-filled range.** The builder walks `dailyData`
  (rule 5), so any such row would be silently absent from the ledger while still counted in
  `totalRevenue` — visible only as a broken sum invariant. Today the keys align (both derive from
  `toArDateStr` over the same `start`/`end`), and the rule 9 tolerance test is what keeps it that
  way.
- **A monthly template with a `null` amount.** Already prorates to a silent zero
  (`recurring-expenses.ts:75-77`); rule 4 then drops the row.
- **Weekly / biweekly templates.** Contribute exactly $0 (`gastos-recurrentes` rule 1,
  `recurring-expenses.ts:71-73`) and therefore emit **no** ledger row. Their real payments appear as
  the ordinary one-off `expenses` rows they are.
- **Custom range crossing a month boundary.** Prorated rows change their daily rate mid-array
  (`amount/31` then `amount/28`). Correct and intended; worth a test so nobody "fixes" it.
- **A day with external income but no sales** (or vice versa). Only the non-zero row is emitted
  (rule 4) — this is the case that motivates the Unit 1 split at all.
- **Loading state.** The ledger card must not render a `$0` closing balance while `isLoading`;
  skeleton first (jebbs `:97-105`).

## Approach

### A pure builder, not inline `queryFn` code (improvement over jebbs)

jebbs builds its ledger inline inside the `queryFn` (`:634-716`), which makes it **untestable**
without mocking supabase. morfito already has the better posture: `lib/services/finance-summary.ts`,
`recipe-cost.ts` and `recurring-expenses.ts` are pure, React-free, supabase-free modules with
companion `.test.ts` files.

**Proposal:** `lib/services/daily-ledger.ts` exporting `LedgerEntry` and

```
buildDailyLedger({
  dailyData,            // needs date + ordersRevenue + externalRevenue
  expenses,             // date, amount, category, description  (current period)
  recurringAllocations, // DailyRecurringAllocation[] — the array from :249, reused (rule 7)
}): LedgerEntry[]
```

with `daily-ledger.test.ts`. The hook's job shrinks to one call plus
`ledgerClosingBalance = netRevenueResult.netRevenue` (rule 1). This is the fourth pure service in
`lib/services/`, and it is where every subtle bug in this change lives — so it gets its own tests
and its own PR. vitest picks the file up with no config change.

### Hook changes (Unit 1, verified line-by-line against the current file)

| Location | Today | After |
|---|---|---|
| `:204-208` | `select("date, amount, category")` | `select("date, amount, category, description")` |
| `:209-213` | `select("date, amount")` (previous period) | **unchanged** — totals only |
| `:330` | `dailyMap: Record<string, { orders; revenue; canceled; expenses }>` | `{ orders; ordersRevenue; externalRevenue; canceled; expenses }` |
| `:335` | `dailyMap[key].revenue += Number(o.total_amount)` | `…ordersRevenue += …` |
| `:347` | `dailyMap[key].revenue += Number(e.amount)` | `…externalRevenue += …` |
| `:371-385` | pushes `revenue: dailyMap[key]?.revenue \|\| 0` | pushes `ordersRevenue`, `externalRevenue`, **and** `revenue: ordersRevenue + externalRevenue` (rule 8) |
| `:353-357`, `:364-368` | expenses / allocations fold into `.expenses` | **unchanged** |
| `:387-410` | return | `+ ledger`, `+ ledgerClosingBalance` |

jebbs carries the identical `revenue: ordersRevenue + externalRevenue` reconstruction
(`jebbs .../use-orders-history.ts:534`) for exactly this reason.

### UI (Unit 3)

`components/finanzas/daily-ledger.tsx`, ported from jebbs minus the export dropdown (D3):
`Fecha | Concepto | Debe | Haber | Saldo`, rows grouped by day for presentation only
(the array already arrives chronological — jebbs `:77-88`), the date cell printed once per day
group, a `prorrateo` badge on `isProrated` rows, day-based pagination, and a closing-balance strip
fed **from the `closingBalance` prop** (rule 1).

Every UI primitive it needs already exists in morfito — verified: `components/ui/table.tsx`,
`badge.tsx`, `card-heading.tsx`, `dropdown-menu.tsx`. **No new npm dependency in this change.**

Mounted in `resumen-tab.tsx` after the "Ingresos vs. gastos por día" card (`:310-379`), passed
`analytics.ledger`, `analytics.ledgerClosingBalance`, `isLoading` and the existing `periodLabel`
(`:97`). The component performs **no money arithmetic**, preserving the invariant that file's
doc comment already declares (`:64-69`).

## Affected areas

| Path | Impact | What changes |
|---|---|---|
| `lib/services/daily-ledger.ts` (+ `.test.ts`) | **New** | Pure builder + `LedgerEntry` |
| `lib/hooks/orders/use-orders-history.ts` | Modified | `description` in one select; `dailyMap` split; `ledger` + `ledgerClosingBalance` returned |
| `components/finanzas/daily-ledger.tsx` | **New** | Read-only day-grouped table |
| `components/finanzas/resumen-tab.tsx` | Modified | Mounts the card; passes props. Nothing else |
| `lib/services/finance-summary.ts` | **Unchanged** | Explicitly — see out of scope |
| `lib/services/recurring-expenses.ts` | **Unchanged** | Consumed, not modified (rule 7) |
| `scripts/` | **Unchanged** | No migration in this change |
| `package.json` | **Unchanged** | No new dependency (D3) |
| `app/(dashboard)/rendimiento/page.tsx` | **Unchanged** — but at risk | Reads `dailyData[].revenue` (`:624`, `:636`). See *Risks* |
| `components/finanzas/finanzas-tabs.tsx` | **Unchanged** | No new tab |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **The `dailyMap` split silently drifts the existing daily charts.** `revenue` is a **live production field with two consumers**: Resumen's "Ingresos vs. gastos por día" (`resumen-tab.tsx:319-374`, shipped by `finanzas-gastos-recetas`) and `/rendimiento`'s "Ingresos por día" AreaChart (`page.tsx:624, 636`). Dropping or renaming it, or reconstructing it as anything other than the exact sum, breaks two charts nobody is looking at during this change | **High if rule 8 is skipped** | **High** — silent wrong numbers on a production screen outside this feature's blast radius | Rule 8 is a hard requirement: `revenue` stays, same name, same value, reconstructed as `ordersRevenue + externalRevenue`. Test: `dailyData[i].revenue === ordersRevenue + externalRevenue` for every row, plus `sum(dailyData[].revenue) === totalRevenue` within tolerance. Unit 1 ships **alone**, as a provable no-op, before anything reads the new fields |
| **Commission double-subtraction reintroduced** by porting jebbs' `commissionByDate` + row (`:621-670`) — the surrounding code *is* being ported line by line | Medium | **High** — under-reports net revenue, the exact bug `finance-summary.ts` exists to prevent | D1 in the out-of-scope table + rule 9's tolerance test run with a non-zero `commissionTotal` |
| **Closing balance re-summed from the array**, putting float drift on screen next to a differently-computed `netRevenue` | Medium — it is the "obvious" implementation | Medium | Rule 1; `ledgerClosingBalance` assigned from `netRevenueResult.netRevenue` at the same call site (`:285-289`); the component receives it as a prop and never reduces `entries` |
| **Ledger disagrees with the Gastos tile / category cards** | Low | High — two contradictory numbers in one viewport | Rule 7: same `recurringAllocations` array, same `expenses` rows, no second fetch and no second call to `expandRecurringExpensesDaily` |
| **Row-count explosion makes the table unreadable** (D2's cost) | Medium | Medium | Day-based pagination; *Open design questions* #1 decides per-template vs. one collapsed prorated row per day |
| **Operator misreads a prorated row as a real payment** ("I never paid $10.000 of rent on the 14th") | Medium | Medium | The `prorrateo` badge on every such row; consistent with the labelling `gastos-recurrentes` rule 3 already requires elsewhere on the tab |
| **A ledger row with an empty concept** from a null `description` | Medium | Low | Edge cases + *Open design questions* #2 |
| **Unit 3 lands without Unit 2** | Low | Low | Straight dependency; the component is a pure prop consumer |
| **Perf: building ~200 objects per analytics read** | Low | Low | O(days + expenses + allocations), inside an existing `queryFn`, on data already in memory. No extra round-trip |

## Rollback plan

- **Unit 1:** revert. Additive and provably no-op — `revenue` keeps its exact value (rule 8), the
  extra `description` column is fetched and unread. Nothing consumes `ordersRevenue` /
  `externalRevenue` yet.
- **Unit 2:** revert. A pure module plus two unread returned fields. No UI, no schema, no query.
- **Unit 3:** revert. The card disappears; every other figure on the tab is untouched. Reverting
  Unit 3 alone is safe — unlike `gastos-recurrentes`' Unit 3/4 coupling, nothing here leaves
  unexplained money in a total, because **this change moves no money at all**.
- **Whole change:** revert all three. No migration to undo, no data written, no dependency to
  uninstall.

## Dependencies

- `gastos-recurrentes` merged — `recurringAllocations` (`:249`), `expandRecurringExpensesDaily`,
  `DailyRecurringAllocation`, `expensesByCategory`. **Verified in the working tree.**
- `finanzas-gastos-recetas` merged — `computeNetRevenue`, the Resumen tab, the expenses table.
  **Verified.**
- vitest with the `@` alias. **Satisfied** — no new test tooling.
- `components/ui/{table,badge,card-heading,dropdown-menu}.tsx`. **Verified present.**
- **No new npm dependency. No migration. No Supabase change.**

## Suggested staging

| PR | Unit | Content | Est. lines | Notes |
|---|---|---|---|---|
| **1** | 1 | `description` in the current-period expenses select + `ordersRevenue`/`externalRevenue` split with `revenue` preserved | ~80 | **Provably numerically identical to today.** Ships alone precisely because it touches a live aggregation path two production charts depend on. Trivially revertible |
| **2** | 2 | `lib/services/daily-ledger.ts` + `daily-ledger.test.ts` + hook wiring (`ledger`, `ledgerClosingBalance`) | ~300 | **Logic only, no UI.** Strict TDD. Where every subtle bug lives — rule 1, rule 4, the cross-month proration case, the sum invariants |
| **3** | 3 | `components/finanzas/daily-ledger.tsx` + mount in `resumen-tab.tsx` | ~250 | Pure presentation; performs no arithmetic |

Each PR is independently shippable, independently revertible and under the 400-line review budget.
`sdd-tasks` should confirm the forecast.

## Open design questions (for `sdd-design`, not blocking this proposal)

1. **One prorated row per template per day, or one collapsed "Gastos fijos (prorrateo)" row per
   day?** D2 fixes the *timing* (daily, not lumped at close) but not the *granularity*. One row per
   template keeps a 1:1 correspondence with `recurringAllocations` — the ledger structurally cannot
   disagree with `expensesByCategory` — at the cost of N rows per day. Collapsing is far more
   readable but introduces a sum inside the builder and loses the template's description.
   **Leaning: one row per template** (structural agreement over density; pagination already bounds
   the screen), with the collapse noted as a follow-up if operators complain.
2. **Where does the `description === null` fallback label come from?** `EXPENSE_CATEGORY_LABELS`
   lives in `components/finanzas/expense-list.tsx:16`; a `lib/services/` module importing from
   `components/` inverts the layering. Options: (a) `LedgerEntry` carries `category` and
   `daily-ledger.tsx` resolves the label — zero churn, keeps `lib/` clean, but puts one string
   decision in the component; (b) extract the map to `lib/` — one source of truth, but rewrites 6
   files' imports; (c) redeclare it in the service, as jebbs does (`:108-114`) — rejected,
   duplication. **Leaning (a).**
3. **Does `LedgerEntry` need a stable `id`?** jebbs keys rows on
   `${date}-${idx}-${concept}` (`daily-ledger.tsx:154`), which is fine for a static table but
   collides if two same-day expenses share a description. Worth deciding now if sorting or
   filtering is ever likely.
4. **Should `dailyData`'s new fields be typed as a named exported interface?** The array's type is
   currently inline (`:371`). Three consumers now read it (Resumen, `/rendimiento`, the ledger
   builder); a named type would make rule 8's contract explicit at the type level.
5. **Day-group pagination size.** jebbs uses 10 days/page. A 31-day month is 4 pages. Alternatives:
   render the whole period with a scroll container, or paginate by row count instead of by day.

## Success criteria

- [ ] Resumen shows a "Libro diario" card below "Ingresos vs. gastos por día", inside the same tab
      — no new top-level tab exists
- [ ] Each day with sales shows one "Ventas" row and, if present, a separate "Ingresos externos"
      row — the two are never merged
- [ ] Each one-off expense in the period is its own row, with its own description
- [ ] Each monthly template contributes a row **on every day it charges**, marked `prorrateo`, with
      the template's own description — never a single lump dated at period close
- [ ] Weekly/biweekly templates produce **zero** ledger rows — asserted by test
- [ ] **No row anywhere in the ledger mentions commission**, and `sum(income) − sum(expense) ≈
      netRevenue` within tolerance with a non-zero `commissionTotal` — asserted by test
- [ ] "Saldo del período" equals the "Ingreso neto del período" card above it, exactly, always —
      because both read the same `netRevenue`; no code path re-sums `ledger` to produce a displayed
      total
- [ ] The running `balance` on the last row differs from `ledgerClosingBalance` by at most float
      tolerance — asserted by test, and never surfaced as the displayed total
- [ ] `dailyData[].revenue === ordersRevenue + externalRevenue` for every row, and both the Resumen
      bar chart and `/rendimiento`'s "Ingresos por día" AreaChart render byte-identical values
      before and after Unit 1
- [ ] A custom range crossing a month boundary shows prorated rows at each month's own daily rate —
      covered by test
- [ ] An empty period shows "Sin movimientos en este período" **and** a `$0` closing balance
- [ ] Rows are strictly chronological; within a day the order is Ventas → Ingresos externos →
      one-off expenses → prorated allocations
- [ ] No zero-amount row is ever rendered
- [ ] The table is read-only: no edit, delete, or reorder affordance anywhere
- [ ] `expandRecurringExpensesDaily` is still called exactly **twice** in `useOrdersAnalytics`
      (current period + previous period) — the ledger adds no third current-period call
- [ ] `lib/services/finance-summary.ts` and `lib/services/recurring-expenses.ts` are unchanged;
      `scripts/` is unchanged; `package.json` gains no dependency
- [ ] Every KPI on Resumen and Gastos renders the identical value it did before this change
- [ ] `npm test` green; `tsc --noEmit` clean under TS5 strict; no new lint errors

## Proposal question round

No new question round was run: the three product decisions that shape this change (D1 commission,
D2 proration granularity, D3 export) were confirmed by the user before this proposal and are
recorded above as closed requirements. The remaining unknowns are presentational/technical and
belong to `sdd-design` (see *Open design questions*).

Three items surfaced during verification that the confirmed decisions could not have anticipated,
and that `sdd-spec` should treat as requirements rather than discoveries:

- **Rule 8 / the second consumer.** The `dailyMap` split does not only affect Resumen's chart —
  `/rendimiento`'s "Ingresos por día" AreaChart reads the same `dailyData[].revenue`
  (`page.tsx:624, 636`). The split's blast radius is two production screens, not one.
- **The null-description fallback has a layering cost in morfito** that it does not have in jebbs,
  because morfito's category label map lives in a component file
  (`expense-list.tsx:16`). *Open design questions* #2.
- **D2's row-count cost is larger than jebbs ever pays.** jebbs emits N rows per period; morfito
  will emit up to N × 31. Correct per D2, but it makes pagination a requirement rather than a
  nicety.

## Verification status of exploration claims

Re-verified directly against the code in this session (the exploration predates
`gastos-recurrentes` PR3's edits to `use-orders-history.ts`; all line numbers below are current):

- **morfito** — the expenses selects and the missing `description` (`use-orders-history.ts:204-213`);
  the single `recurringAllocations` computation (`:249`) and its three existing consumers
  (`:276`, `:309-311`, `:364-368`); the `computeNetRevenue` call site (`:285-289`); `dailyMap`'s
  shape and its two writers into `revenue` (`:330`, `:335`, `:347`); the gap-fill loop
  (`:371-385`); the analytics return shape (`:387-410`); `computeNetRevenue`'s body and its
  commission-is-informational contract (`finance-summary.ts:10-55`);
  `DailyRecurringAllocation`'s `{date, amount, category, description, templateId}` shape and the
  non-monthly unconditional skip (`recurring-expenses.ts:24-30, 61-77`); Resumen's zero-arithmetic
  doc comment (`resumen-tab.tsx:64-69`), net-revenue card (`:254-274`) and daily chart
  (`:310-379`); `/rendimiento` reading `dailyData[].revenue` (`page.tsx:624, 636`);
  `Expense.description: string | null` (`lib/types/index.ts:373`); `EXPENSE_CATEGORY_LABELS`'
  location (`expense-list.tsx:16`) and the `"—"` fallback (`:76`); the presence of
  `components/ui/{table,badge,card-heading,dropdown-menu}.tsx`; the **absence** of
  `jspdf` / `jspdf-autotable` / `exceljs` anywhere in the repo.
- **jebbs** — `LedgerEntry` (`use-orders-history.ts:99-106`); the `ordersRevenue`/`externalRevenue`
  split **and** the preserved `revenue: ordersRevenue + externalRevenue` (`:488-509, 526-534`);
  `expensesByDate` with its nullable description (`:607-619`); the ledger loop (`:634-683`); the
  commission row and its `commissionByDate` feed (`:621-632, 659-670`) — **not ported**, D1; the
  lump-at-close recurring rows and their documented tradeoff (`:685-710`) — **not ported**, D2;
  `ledgerClosingBalance = netRevenue` and its rationale (`:712-716`); the component's day grouping
  (`daily-ledger.tsx:77-88`), pagination (`:38, 90-95`), empty state (`:135-138`), prorated badge
  (`:161-165`) and closing-balance strip (`:194-204`); the export dropdown and
  `lib/utils/export-ledger.ts` (`:24-73, 115-130`) — **not ported**, D3.

**Not verified in this session:** nothing schema-related needs verification — this change touches
no SQL. The one standing assumption is that `expenses.description` exists in the live database,
which `scripts/045-expenses.sql` created and `expense-list.tsx:76` already renders.
