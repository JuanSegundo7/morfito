# Design: `libro-diario` — Daily debit/credit ledger inside the Resumen tab

> **Size note**: this document deliberately exceeds the sdd-design 800-word budget. The launch prompt
> explicitly required the four remaining open design questions resolved with rationale, exact
> TypeScript signatures, a line-precise integration map for `use-orders-history.ts`, a citation
> verification table against the real code, and a per-PR file-change table at the rigor bar of
> `.atl/sdd/gastos-recurrentes/design.md`. Explicit instruction wins over the generic budget.

---

## Verification Basis

Every citation was re-checked against the working tree this session, not copied from the proposal.

| Proposal claim | Verified reality |
|---|---|
| Current-period expenses select at `:204-208` is `date, amount, category`; previous-period at `:209-213` is `date, amount` | **Exact.** `description` is genuinely missing from the current-period select. |
| `dailyMap` shape at `:330`, orders write at `:335`, external write at `:347` | **Exact.** `revenue` has exactly two writers, in two different loops. |
| Gap-fill loop at `:371-385`, analytics return at `:387-410` | **Exact.** `dailyData`'s element type is inline at `:371`. |
| `recurringAllocations` computed once at `:249`, three consumers at `:276`, `:309-311`, `:364-368` | **Exact.** The ledger becomes the fourth consumer; no fourth call to `expandRecurringExpensesDaily`. |
| `computeNetRevenue` call site at `:285-289`; `finance-summary.ts:48-55` | **Exact.** `netRevenue = totalRevenue − expensesTotal`, one subtraction, whole codebase. |
| `/rendimiento` reads `dailyData[].revenue` at `page.tsx:624, 636` | **Exact**, and it is the *second* AreaChart ("Ingresos por día", `:586-647`). The first chart (`:527-584`) reads `orders`/`canceled` only. Rule 8's blast radius is confirmed as two production screens. |
| `Expense.description: string \| null` at `lib/types/index.ts:373` | **Exact.** |
| `EXPENSE_CATEGORY_LABELS` at `expense-list.tsx:16`, `"—"` fallback at `:76` | **Exact.** |
| `components/ui/{table,badge,card-heading,dropdown-menu}.tsx` present | **Present — but `card-heading.tsx` has ZERO consumers in the whole repo.** It is ported-but-unused code. See D10: the ledger follows `resumen-tab.tsx`'s own `Card`/`CardHeader`/`CardTitle` shape instead of becoming its first call site. |
| jebbs keys ledger rows on `${date}-${idx}-${concept}`, which "collides if two same-day expenses share a description" | **FALSE.** `daily-ledger.tsx:152-154` maps `group.entries` with a per-group `idx`, and every group has a distinct `date`, so the key is already unique. The real problem is not collision — it is *order stability* (see D7). This is why D3 answers "no `id`" rather than "add one". |
| `jspdf` / `jspdf-autotable` / `exceljs` absent | **Confirmed.** D3 of the proposal (no export) holds with no further analysis. |

Additional findings the proposal did not have, all load-bearing below:

- **`expandRecurringExpensesDaily` emits TEMPLATE-major order, not date-major** (`recurring-expenses.ts:68-110`:
  outer loop over templates, inner loop over that template's days). The ledger must index allocations by
  date; it cannot walk the array in order.
- **The `recurring_expenses` and `expenses` queries carry no `.order(...)`** (`:204-208`, `:220-222`), so
  PostgREST row order is unspecified. Combined with the finding above, the *within-day* order of prorated
  rows — and therefore every intermediate `balance` value — is not deterministic unless the builder sorts.
  This is the single design problem the proposal did not see. See **D7**.
- **`createBrowserClient` is called with no `Database` generic** (`lib/supabase/client.ts:4`), so every
  `.select(...)` result is effectively `any`. Adding `description` to the select is therefore **not**
  type-checked, and `e.description` is `undefined` (not `null`) if anyone removes it. The builder's input
  type is the first place the shape is checked at all — hence `?? null` at the boundary and D4's typed seam.
- **`use-orders-history.ts:1` is `"use client"`, and so is `expense-list.tsx:1`.** A pure, node-environment
  vitest module in `lib/services/` must import neither. This decides D2 and D4 on mechanical grounds, not
  taste.
- **`use-orders-history.ts` already exports three result interfaces** (`TopBurger:464`, `ProductStats:565`,
  `RevenueBySourceEntry:693`). Naming `dailyData`'s element type there follows an established local
  convention rather than inventing one (D4).
- **`EXPENSE_CATEGORY_LABELS`' own doc comment (`expense-list.tsx:10-15`) says "extract if a third consumer
  shows up"** — it now has **five** importers (`expense-form-dialog`, `gastos-tab`,
  `recurring-expense-form-dialog`, `recurring-expense-list`, `resumen-tab`). The extraction trigger has
  already fired, independently of this change. Recorded as a follow-up in *Open Questions*, deliberately
  not done here (D2).

---

## Technical Approach

Three PRs, each independently revertible, matching the proposal's staging. The shape is: **one additive
hook split that is provably numerically identical the day it ships; then one new pure module with its own
tests and no UI; then one read-only component that performs no arithmetic.**

The load-bearing structural idea is that this change adds **exactly one new brain** —
`lib/services/daily-ledger.ts` — and **no new data**. Every row it emits is a re-shaping of values
`useOrdersAnalytics` already holds in memory: `dailyData` (sales/external income per day), the period's
`expenses` rows, and the single `recurringAllocations` array `gastos-recurrentes` D6 established. The
ledger is its **fourth** consumer, which is what makes "the ledger agrees with the Gastos tile" structural
rather than merely tested.

```
orders ──┐                                external_income ──┐
         ▼                                                  ▼
   dailyMap[date].ordersRevenue                dailyMap[date].externalRevenue     (PR1: split)
         └──────────────┬───────────────────────────────────┘
                        ▼
      dailyData[] = { date, day, orders, revenue, ordersRevenue, externalRevenue, canceled, expenses }
                        │        ▲
                        │        └── revenue := ordersRevenue + externalRevenue  (rule 8, PR1)
                        │            read by resumen-tab chart AND /rendimiento AreaChart
                        ▼
expenses[] ──────▶ buildDailyLedger({ dailyData, expenses, recurringAllocations })   (PR2, pure)
recurringAllocations[] ─┘        │   the SAME array already feeding expensesTotal,
   (:249, computed once)         │   expensesByCategory and dailyMap[].expenses
                                 ▼
                         ledger: LedgerEntry[]  ──▶ analytics.ledger
                                                          │
computeNetRevenue(:285-289) ──▶ analytics.netRevenue ──────┼──▶ "Ingreso neto del período" card (:254-274)
   (UNCHANGED, byte-identical)                             │
                                                           ▼
                                          <DailyLedger key={periodLabel}                    (PR3)
                                              entries={analytics.ledger}
                                              closingBalance={analytics.netRevenue}   ← D6
                                              isLoading={isLoading} />
```

**The one number the operator sees as a total is `netRevenue`, read from the same field the card above it
reads.** The ledger's own `balance` column is a narrative aid, never a total.

---

## Divergences from the proposal (deliberate — `sdd-spec` must encode the design, not the proposal)

| Proposal said | Design says | Where |
|---|---|---|
| `LedgerEntry` carries `kind: "income" \| "expense"` and `isProrated: boolean` | `LedgerEntry` carries a single `source: LedgerSource` discriminator; direction and the `prorrateo` badge are **derived** from it | D2 |
| `concept: string` holds `"Ventas"` / `"Ingresos externos"` / descriptions | `concept: string \| null` holds **only data-carried text**; all Spanish labels are resolved in the component | D2 |
| The hook returns `ledgerClosingBalance: number` | **No such field.** The component takes a `closingBalance` prop fed from the existing `analytics.netRevenue` | D6 |
| Pagination "jebbs uses 10 days/page" | **7 day-groups per page**, counting only days that produced rows | D5 |

Everything else in the proposal — D1 (no commission row, ever), D2 (per-day proration), D3 (no export),
rules 1–12, the out-of-scope table, the 3-PR staging — is carried through unchanged.

---

## Architecture Decisions

### D1 — One prorated row per template per day (CLOSED by the user, recorded here) — **resolves open question 1**

**Choice**: when several recurring templates charge on the same day, **each one emits its own row**. They
are never collapsed into a single "Gastos fijos (prorrateo)" line.

**Confirmed by the user after the proposal was written.** Not reopened here. Recorded because two design
decisions below exist only because of it:

1. It keeps a **1:1 correspondence with `recurringAllocations`** — the ledger structurally cannot disagree
   with `expensesByCategory` or the Gastos tile, because it emits exactly the elements they sum.
2. It preserves each template's own description, which a collapsed row would destroy (and a collapsed row
   would have to *sum* inside the builder, adding an arithmetic step to a module whose whole value is that
   it re-shapes rather than computes).
3. **Its cost is row-count and, less obviously, ORDER**: N templates × up to 31 days means the within-day
   order of prorated rows is now visible on screen on every single day, not once per period. That is what
   makes D7 mandatory rather than pedantic, and what sizes D5's page.

### D2 — The service emits DATA; the component emits SPANISH — **resolves open question 2**

**Choice**: `LedgerEntry` carries a `source` discriminator plus `category`, and **no display string the
data did not supply**. `"Ventas"`, `"Ingresos externos"` and the `Gasto (Insumos)` null-description
fallback are all resolved in `components/finanzas/daily-ledger.tsx`, which already imports
`EXPENSE_CATEGORY_LABELS` the way `resumen-tab.tsx:29` does.

**Rejected**:
- **(b) Extract `EXPENSE_CATEGORY_LABELS` to `lib/`** so the service can build the fallback itself — six
  files' imports rewritten inside a read-only-view PR, to make a *pure data module* own Spanish UI copy.
  The extraction is worth doing on its own merits (its own doc comment says so — see *Verification Basis*),
  which is precisely why it should not ride along here.
- **(c) Redeclare the label map inside the service**, as jebbs does (`use-orders-history.ts:108-114`) —
  duplication, and the copy would silently drift the first time a label is edited.
- **(a′) Keep the proposal's `concept: string` with `"Ventas"` baked in by the builder** — the halfway
  version, and the one that looks harmless. It still puts UI copy in `lib/services/`, and it makes the
  unit tests assert on Spanish literals, so renaming a column header breaks a pure-logic test.

**Rationale**:

1. **The decisive argument is mechanical, not stylistic.** `expense-list.tsx:1` is `"use client"` and
   imports `@/components/ui/badge` and `lucide-react`. A `lib/services/daily-ledger.ts` that imported
   `EXPENSE_CATEGORY_LABELS` from it would drag React component code into a vitest **node**-environment
   test of a module whose entire selling point (proposal, *Approach*) is that it is testable without any
   of that. `finance-summary.ts`, `recipe-cost.ts` and `recurring-expenses.ts` all import from
   `@/lib/types` and `@/lib/utils` only; this module keeps that posture exactly.
2. **It makes the 4-way distinction the user asked for a typed field instead of a string comparison.**
   "Is this row a sale or external income?" becomes `entry.source === "orders"`, not
   `entry.concept === "Ventas"`. Tests, and any future filter, stop depending on display text.
3. **It removes two derivable fields at once.** With `source`, `kind` is a lookup and `isProrated` is
   `source === "recurring"`. Storing them alongside `source` would re-create a multi-field invariant a
   builder edit can break — in a table whose entire purpose is that debits and credits are never confused.
   This is the same reasoning `gastos-recurrentes`' interface table used to drop jebbs'
   always-`true` `DailyRecurringAllocation.isProrated`.

**Direction lives in one exported object literal**, keyed by the union so a fifth source is a compile error
at that exact line — the same posture as `expensesByCategory`'s literal (`use-orders-history.ts:299-305`).

### D3 — `LedgerEntry` gets NO `id`; the React key is `${date}-${idx}` — **resolves open question 3**

**Choice**: no identity field. The component keys rows by their index within the day group.

**Rejected**:
- **A synthetic `id`** (uuid or counter) — non-deterministic across builds of the same input, which would
  make the pure module's snapshot-style tests assert on noise.
- **A composite `${source}-${date}-${refId}`** — three of the four sources have no honest `refId`. A
  "Ventas" row is an aggregate of N orders; a prorated row is 1/31 of a template-month; a one-off expense
  row *could* carry `expenses.id`, but that column is not even selected today (`:204-208`). Giving one of
  four sources real identity and the rest a fabricated one is worse than giving none.

**Rationale**: the proposal's motivating fear — key collision between two same-day expenses with the same
description — **does not exist**: jebbs' key already includes the per-group index (see *Verification
Basis*). The real requirement is that index-based keys be *stable*, which is a property of the **order**,
not of an id — and D7 provides exactly that. The `concept` segment is dropped from the key on purpose:
including display text means renaming a template remounts its rows for no benefit.

**Revisit trigger, to be written into the interface's doc comment**: the moment the table gains sorting,
filtering, or a row-level drill-down to the underlying orders/expense, rows need identity — and at that
point the honest shape is `{ source, date, refId }`, added together with the feature that needs it.

### D4 — `dailyData`'s element type is exported from the hook; the service declares its own structural input — **resolves open question 4**

**Choice**: two named types, deliberately not one.

```ts
// lib/hooks/orders/use-orders-history.ts  (PR1) — the hook's public row type
export interface DailyAnalyticsPoint { … }          // carries rule 8 in its doc comment

// lib/services/daily-ledger.ts (PR2) — the minimum the builder actually reads
export interface LedgerDailyRevenue { date: string; ordersRevenue: number; externalRevenue: number }
```

`DailyAnalyticsPoint` is structurally assignable to `LedgerDailyRevenue`, so the hook passes `dailyData`
straight in with no adapter and no cast.

**Rejected**:
- **Leaving the type inline at `:371`** — three consumers now read this array (Resumen's bar chart,
  `/rendimiento`'s AreaChart, the ledger builder), and rule 8 (`revenue === ordersRevenue +
  externalRevenue`) is the highest-risk invariant in the change. An invariant with no named home is an
  invariant with nowhere to write it down.
- **One shared type imported by the service from the hook** — `use-orders-history.ts:1` is `"use client"`.
  `lib/services/` importing from `lib/hooks/` inverts the dependency direction every other service in this
  repo keeps, and would pull `@tanstack/react-query` and the supabase browser client into a node test.
- **Moving the row type to `lib/types/index.ts`** — that file is a pure barrel of *database* shapes. A
  derived analytics view-model is not one, and the hook already exports three sibling result interfaces.

### D5 — Pagination: 7 **day-groups** per page, day-atomic — **resolves open question 5**

**Choice**: paginate by day group, 7 groups per page, where a group is a day **that produced at least one
row** (rule 4 means empty days emit nothing and therefore consume no page budget). Page state is reset by
remounting: the parent renders `<DailyLedger key={periodLabel} … />`.

**Rejected**:
- **jebbs' 10 days/page** — jebbs pays D2's cost once per period; morfito pays it every day. With four
  monthly templates a single day is ~4 prorated + up to 2 income + k one-off rows, so 10 days is a ~70-100
  row page. 7 is a week, which is the unit an operator reconciling against a bank statement actually
  thinks in, gives 5 pages for a 31-day month, and caps a realistic page near 50.
- **Row-count pagination** — it splits a day across a page boundary, which breaks the "date printed once
  per group" convention (`daily-ledger.tsx:156`) and leaves a page starting mid-day with no visible date,
  next to a running balance with no visible opening.
- **No pagination, one scroll container for the whole period** — the tab body is already
  `overflow-auto` (`resumen-tab.tsx:133`); nesting a ~200-row scroll region inside it is a scroll trap on
  touch, and it is the one interaction failure that cannot be fixed with CSS later.
- **A `useEffect(() => setPage(1), [periodLabel])`** — `key` is React's own answer to "reset this
  component's state when the identity of what it shows changes", needs no dependency array, and cannot
  fire on a background refetch the way an effect keyed on `entries` would.

`Math.min(page, totalPages)` clamping (jebbs `:91`) is kept as well, so a shrinking result set can never
render an empty page mid-session.

### D6 — There is no `ledgerClosingBalance`. The card reads `analytics.netRevenue`

**Choice**: `useOrdersAnalytics` gains exactly **one** new returned field, `ledger`. The component's
`closingBalance` prop is fed at the single mount site: `closingBalance={analytics?.netRevenue ?? 0}`.

**Rejected**: the proposal's (and jebbs') `ledgerClosingBalance = netRevenue` (jebbs `:712-716`).

**Rationale**: rule 1 says the displayed total must never be re-summed from the array. A field named
`ledgerClosingBalance` is *an invitation to do exactly that* — it is a ledger-named number sitting next to
a ledger array, defended only by a comment. Deleting the field makes the failure unrepresentable: there is
one number, `netRevenue`, produced by `computeNetRevenue`'s single call site, and the "Saldo del período"
strip and the "Ingreso neto del período" card (`:254-274`) three cards above it read **the same field of
the same object**. The success criterion "they are equal, exactly, always" stops being a test and becomes
a tautology. The component still takes a neutral `closingBalance` prop — it has no business knowing what
`netRevenue` means — so the one line that connects them lives in `resumen-tab.tsx`, the file whose doc
comment (`:64-69`) already declares zero money arithmetic.

### D7 — The builder SORTS within each bucket; no `ORDER BY` is added to the shared queries

**Choice**: inside a day, after the fixed bucket order (Ventas → Ingresos externos → one-off expenses →
prorated allocations, rule 2), the builder sorts:

| Bucket | Sort key | Tie behaviour |
|---|---|---|
| one-off expenses | `description` (nulls last), then `amount`, then `category` | a full tie means the two rows are **byte-identical**, so output is deterministic regardless |
| prorated allocations | `description`, then `templateId` | `templateId` is a UUID — unique by construction, so the order is total |

Comparison is plain code-unit (`<`/`>`), **not** `localeCompare`: locale-dependent collation would make a
unit test's expected order depend on the machine running it.

**Rejected**: adding `.order("description")` / `.order("created_at")` to the `expenses` and
`recurring_expenses` queries. It would fix the symptom in SQL, invisibly to every test, on two queries
shared by three other consumers — and `expandRecurringExpensesDaily`'s template-major output would still
need date-bucketing, so the builder would depend on query order it cannot see.

**Rationale**: this is the problem the proposal did not see. `expandRecurringExpensesDaily` iterates
templates in the array's order (`recurring-expenses.ts:68`), that array comes from a select with no
`ORDER BY` (`:220-222`), and D1 puts those rows on screen **every day of the period**. Without a sort, two
refetches of the same period can produce different intermediate `balance` values and different row order —
a ledger that visibly reshuffles itself, in the one surface whose selling point is that it is auditable.
The invariant belongs to the module that depends on it, where a test can pin it: *shuffle the input
allocations, assert byte-identical output.*

### D8 — The ledger is built inside the `queryFn`, not in a component `useMemo`

**Choice**: `buildDailyLedger(...)` is called once in `useOrdersAnalytics`' `queryFn`, after the gap-fill
loop closes at `:385` and before the return at `:387`. The result is part of the cached query data.

**Rejected**: returning the raw pieces and building in `DailyLedger` with `useMemo`.

**Rationale**: the builder's three inputs are **all** `queryFn` locals — `recurringAllocations` (`:249`)
and the raw `expenses` rows are not in the hook's return object (`:387-410`) and never have been. Building
in the component means exporting both through the hook's public surface, which hands every future
component the raw material to run its own expense aggregation — the exact duplication `gastos-recurrentes`
D7 spent a PR deleting. Cost: ~200 small objects held in the react-query cache per mounted period,
computed once per fetch instead of once per render. That is the cheaper side of the trade in both
directions.

### D9 — `revenue` is reconstructed at the push site; the five `dailyMap` initializers stay literal

**Choice**: `dailyMap`'s value type gains `ordersRevenue`/`externalRevenue` and **loses** `revenue`.
`revenue` is rebuilt exactly once, in the `dailyData.push(...)` at `:376-383`:

```ts
const ordersRevenue = dailyMap[key]?.ordersRevenue || 0;
const externalRevenue = dailyMap[key]?.externalRevenue || 0;
dailyData.push({
  …,
  ordersRevenue,
  externalRevenue,
  // Rule 8 — NOT a third accumulator. `revenue` is read by resumen-tab.tsx's
  // bar chart AND /rendimiento's "Ingresos por día" AreaChart (page.tsx:624,
  // 636). Same name, same value as before this PR, reconstructed in ONE
  // expression so it cannot drift from its two parts.
  revenue: ordersRevenue + externalRevenue,
});
```

**Rejected**:
- **Keeping `revenue` as a third accumulator in `dailyMap`**, written by both loops alongside the new
  fields — three writers where two suffice, and the sum becomes a tested property instead of a structural
  one (the `gastos-recurrentes` D6 argument, applied to revenue).
- **Extracting an `ensureDay(key)` helper** to collapse the five `if (!dailyMap[key]) dailyMap[key] = {…}`
  literals (`:333`, `:340`, `:346`, `:355`, `:366`). Tempting, and rejected on purpose: PR1's entire value
  is being a **provable no-op** on a code path two production charts depend on. `dailyMap` is a typed
  `Record`, so TypeScript already fails the build if any of the five literals misses a field — the helper
  would buy a guarantee the compiler already gives, at the price of changing control flow in the one diff
  that must not.

### D10 — The card follows `resumen-tab.tsx`'s own shape, not jebbs'

**Choice**: `Card className="bg-card"` + `CardHeader`/`CardTitle` ("Libro diario") + `CardContent`, mounted
after the "Ingresos vs. gastos por día" card (`:310-379`). `components/ui/table.tsx` supplies the table, as
in `recetas-tab.tsx:9-16`. The component's props are exactly `{ entries, closingBalance, isLoading }`.

**Rejected**:
- **jebbs' `CardHeading` inside `CardContent` with an icon chip** — `card-heading.tsx` has **zero
  consumers anywhere in morfito** (verified). The ledger would sit in a column with three sibling cards
  that all use `CardHeader`/`CardTitle`; matching its neighbours beats matching its source repo. Adopting
  a dead primitive as a side effect of a read-only feature is how a codebase ends up with two card idioms.
- **A `periodLabel` prop** — in jebbs it exists only to title the PDF/Excel export (`:59, :68`), which D3
  of the proposal removes. Here the period string is used by the **parent**, as the `key` (D5); the child
  never needs it.
- **`startDate` / `endDate` props** — same reason, export-only in jebbs.

The empty state (`"Sin movimientos en este período"`) renders **inside** the card, and the closing-balance
strip renders **always**, including when there are zero rows — jebbs nests the strip in the non-empty
branch (`:135-204`), which would hide the `$0` the proposal's empty-period edge case requires.

---

## Interfaces / Contracts

### `lib/services/daily-ledger.ts` — new (PR2)

Pure: no React, no supabase, no `components/` import — same posture as `finance-summary.ts:1-8`,
`recipe-cost.ts` and `recurring-expenses.ts:1-2`. This is the repo's **fourth** tested pure module.

```ts
import type { Expense, ExpenseCategory } from "@/lib/types";
import type { DailyRecurringAllocation } from "@/lib/services/recurring-expenses";

/**
 * WHERE A ROW CAME FROM — and, through LEDGER_DIRECTION below, which column it
 * lands in. The ONE discriminator: `kind`/`isProrated` are deliberately NOT
 * stored, because both are functions of this field and a second stored field is
 * a second thing a builder edit can get wrong (design D2).
 *
 * There is NO commission source, in any form. orders.total_amount is already
 * net of commission (lib/services/finance-summary.ts:10-25), so a commission
 * row would deduct the same money twice. See the proposal's D1.
 */
export type LedgerSource = "orders" | "external_income" | "expense" | "recurring";

/**
 * Object literal, not Object.fromEntries: TS checks all four keys against the
 * union HERE, so adding a fifth source is a compile error at this exact line —
 * same posture as use-orders-history.ts:299-305's expensesByCategory.
 */
export const LEDGER_DIRECTION: Record<LedgerSource, "income" | "expense"> = {
  orders: "income",
  external_income: "income",
  expense: "expense",
  recurring: "expense",
};

export interface LedgerEntry {
  /** YYYY-MM-DD, AR calendar date. Joins directly to dailyData[].date. */
  date: string;
  /** Provenance AND direction (via LEDGER_DIRECTION). The `prorrateo` badge is
   *  `source === "recurring"` — never a stored boolean. */
  source: LedgerSource;
  /** ONLY text the DATA carries: a one-off expense's description, or a
   *  template's (NOT NULL in scripts/047). null for "orders"/"external_income"
   *  aggregate rows AND for an expense whose description is null — the
   *  COMPONENT resolves every Spanish label, including the
   *  `Gasto (${EXPENSE_CATEGORY_LABELS[category]})` fallback (design D2). */
  concept: string | null;
  /** Set for both expense sources; null for income rows. Its only consumer is
   *  the null-description fallback label. */
  category: ExpenseCategory | null;
  /** ALWAYS the source's own magnitude — never negated. Direction is carried
   *  by `source` alone; the component never flips a sign. */
  amount: number;
  /** Running balance WITHIN the visible period, opening at 0. A narrative aid,
   *  NEVER the displayed total: the "Saldo del período" strip reads
   *  netRevenue (design D6, rule 1). Float drift between this column's last
   *  value and netRevenue is expected and must never be surfaced. */
  balance: number;
}

/** The minimum of dailyData the builder reads. DailyAnalyticsPoint is
 *  structurally assignable to it — declared here rather than imported so
 *  lib/services/ never depends on lib/hooks/ (design D4). */
export interface LedgerDailyRevenue {
  date: string;
  ordersRevenue: number;
  externalRevenue: number;
}

/** Exactly the columns the current-period expenses select must return.
 *  `description` is the one PR1 adds (:204-208). Note the supabase client
 *  carries no Database generic (lib/supabase/client.ts:4), so the select is
 *  NOT type-checked — this alias is the first place the shape is asserted,
 *  and the builder coerces `description` with `?? null` because a missing
 *  column arrives as `undefined`, not null. */
export type LedgerOneOffExpense = Pick<Expense, "date" | "amount" | "category" | "description">;

/**
 * Projects one period's money movements into a chronological debit/credit
 * ledger with a running balance. PURE: no fetching, no clock, no arithmetic
 * beyond accumulation — every amount is passed through from its source.
 *
 * ORDER (rule 2, deterministic and reproducible across renders):
 *   walk `dailyData` in its own order — it was built by advancing a cursor
 *   from start to end one day at a time (use-orders-history.ts:371-385), so
 *   chronology is inherited, never re-derived and never sorted; then per day
 *     1. "orders"          — one aggregate row, if ordersRevenue !== 0
 *     2. "external_income" — one aggregate row, if externalRevenue !== 0
 *     3. "expense"         — one row per one-off expense, sorted by
 *                            (description nulls-last, amount, category)
 *     4. "recurring"       — one row per template (design D1 — NEVER
 *                            collapsed), sorted by (description, templateId)
 *
 * The two sorts are load-bearing, not cosmetic: expandRecurringExpensesDaily
 * emits TEMPLATE-major order from a query with no ORDER BY, so without them
 * the intermediate balances reshuffle between refetches (design D7).
 *
 * Rows with amount === 0 are skipped entirely (rule 4) — the ledger shows
 * movements, not a calendar. A day outside dailyData's range cannot occur
 * (both key spaces derive from [startDateStr, endDateStr]); if one ever did,
 * its rows are ignored rather than appended, and the hook-level sum invariant
 * is what would surface it.
 *
 * The caller does NOT get a total from here. See design D6.
 */
export function buildDailyLedger(input: {
  dailyData: readonly LedgerDailyRevenue[];
  expenses: readonly LedgerOneOffExpense[];
  recurringAllocations: readonly DailyRecurringAllocation[];
}): LedgerEntry[];
```

### `lib/hooks/orders/use-orders-history.ts` — new exported type (PR1)

```ts
/**
 * One day of analytics. Named (design D4) because THREE consumers read it:
 * resumen-tab.tsx's bar chart, /rendimiento's two AreaCharts (page.tsx:539,
 * 598) and lib/services/daily-ledger.ts.
 *
 * INVARIANT (libro-diario rule 8): `revenue === ordersRevenue +
 * externalRevenue`, ALWAYS. `revenue` predates the split and is what both
 * charts bind to; it keeps the same name and the same value forever. The two
 * new fields exist so the ledger can emit "Ventas" and "Ingresos externos" as
 * separate rows — they are additive, and nothing that read this array before
 * needs to change.
 */
export interface DailyAnalyticsPoint {
  date: string;             // YYYY-MM-DD, AR
  day: number;              // day-of-month, the charts' X axis
  orders: number;
  /** Completed orders' total_amount for this day. */
  ordersRevenue: number;
  /** external_income.amount for this day. */
  externalRevenue: number;
  /** ordersRevenue + externalRevenue. Do not write it from anywhere else. */
  revenue: number;
  canceled: number;
  /** One-off expenses + prorated recurring allocations (gastos-recurrentes). */
  expenses: number;
}
```

### `components/finanzas/daily-ledger.tsx` — new (PR3)

```ts
interface DailyLedgerProps {
  entries: LedgerEntry[] | undefined;
  /** THE displayed total. Fed from analytics.netRevenue at the single mount
   *  site — this component never reduces `entries` to produce it (rule 1,
   *  design D6). */
  closingBalance: number;
  isLoading: boolean;
}
```

Mount, in `resumen-tab.tsx`, after the daily chart card closes at `:379`:

```tsx
{/* key resets pagination when the period changes — design D5. */}
<DailyLedger
  key={periodLabel}
  entries={analytics?.ledger}
  closingBalance={analytics?.netRevenue ?? 0}
  isLoading={isLoading}
/>
```

---

## Analytics integration — `lib/hooks/orders/use-orders-history.ts`

All line numbers are the file's **current** state, verified this session.

### PR1 — the split (numerically a no-op)

| # | Location | Today | After |
|---|---|---|---|
| 1 | `:204-208` | `.select("date, amount, category")` | `.select("date, amount, category, description")`. Extend the existing `gastos-recurrentes PR3` comment at `:201-203` with a `libro-diario PR1` line: the ledger needs each one-off expense's own concept text. |
| 2 | `:209-213` | `.select("date, amount")` (previous period) | **unchanged.** It feeds only `prevExpensesTotal` (`:277-281`) and never a rendered row. |
| 3 | `:330` | `Record<string, { orders; revenue; canceled; expenses }>` | `Record<string, { orders; ordersRevenue; externalRevenue; canceled; expenses }>` — `revenue` is **removed** from the accumulator (D9). |
| 4 | `:333`, `:340`, `:346`, `:355`, `:366` | five `{ orders: 0, revenue: 0, canceled: 0, expenses: 0 }` initializers | five `{ orders: 0, ordersRevenue: 0, externalRevenue: 0, canceled: 0, expenses: 0 }`. Missing one is a **compile error** — the Record is typed (D9). |
| 5 | `:335` | `dailyMap[key].revenue += Number(o.total_amount)` | `dailyMap[key].ordersRevenue += Number(o.total_amount)` |
| 6 | `:347` | `dailyMap[key].revenue += Number(e.amount)` | `dailyMap[key].externalRevenue += Number(e.amount)` |
| 7 | `:371` | inline element type | `const dailyData: DailyAnalyticsPoint[] = []` (D4) |
| 8 | `:376-383` | `revenue: dailyMap[key]?.revenue \|\| 0` | the D9 block: two locals, both pushed, plus `revenue: ordersRevenue + externalRevenue` with rule 8's comment naming both consuming charts. |

`:353-357` (one-off expense fold) and `:364-368` (allocation fold) are **untouched**. No return-shape change
in PR1: `dailyData` rows gain two fields nothing reads yet.

### PR2 — the builder (logic only, still no UI)

| # | Location | Change |
|---|---|---|
| 1 | `:8` | new import beside the `recurring-expenses` one: `import { buildDailyLedger } from "@/lib/services/daily-ledger";` |
| 2 | after `:385` (gap-fill loop closes), before `:387` (return) | ```ts
// libro-diario PR2 — a PROJECTION of data already in hand, not a fourth
// aggregation: `recurringAllocations` is the same array computed once at
// :249 that already feeds expensesTotal (:276), expensesByCategory
// (:309-311) and dailyMap[].expenses (:364-368). No fourth call to
// expandRecurringExpensesDaily; no new query.
const ledger = buildDailyLedger({
  dailyData,
  expenses: (expenses ?? []).map((e) => ({
    date: e.date,
    amount: Number(e.amount),
    category: e.category as ExpenseCategory,
    // The select is untyped (no Database generic) — a dropped column
    // arrives as undefined, not null.
    description: (e.description as string | null | undefined) ?? null,
  })),
  recurringAllocations,
});
``` |
| 3 | `:387-410` return | one field added beside `expensesByCategory` (`:404`): `ledger,`. **No `ledgerClosingBalance`** — design D6. |

`computeNetRevenue`'s call site (`:285-289`) is **byte-identical**. `expensesTotal`, `expensesByCategory`,
`dailyData[].expenses`, `expensesChange` and `netRevenueChange` are untouched. `/rendimiento`'s call site
keeps working and simply gains a field it does not read.

---

## File Changes

### PR1 — hook split + `description` (~80 lines, provably no-op)

| File | Action | Detail |
|---|---|---|
| `lib/hooks/orders/use-orders-history.ts` | Modify | The 8 edits above: one column on one select; `dailyMap` reshaped; five initializers; two accumulator writes renamed; `DailyAnalyticsPoint` exported and used at `:371`; `revenue` reconstructed once at the push (D9). |

Ships **alone**, precisely because it touches a live aggregation path two production screens consume.
Nothing reads `ordersRevenue`/`externalRevenue` yet, and the fetched `description` is unread. Trivially
revertible.

### PR2 — pure builder + wiring (~320 lines, strict TDD, no UI)

| File | Action | Detail |
|---|---|---|
| `lib/services/daily-ledger.ts` | **Create** | `LedgerSource`, `LEDGER_DIRECTION`, `LedgerEntry`, `LedgerDailyRevenue`, `LedgerOneOffExpense`, `buildDailyLedger`. ~140 lines with the header. Zero React/supabase/`components/` imports. |
| `lib/services/daily-ledger.test.ts` | **Create** | See *Testing Strategy*. Picked up by vitest's default glob — no config change. |
| `lib/hooks/orders/use-orders-history.ts` | Modify | One import, one `buildDailyLedger` call after `:385`, one returned field. |

Revertible on its own: a pure module plus one unread returned field. No UI, no schema, no query.

### PR3 — the component + mount (~230 lines, zero arithmetic)

| File | Action | Detail |
|---|---|---|
| `components/finanzas/daily-ledger.tsx` | **Create** | Read-only `Fecha \| Concepto \| Debe \| Haber \| Saldo` table. Day grouping preserving the array's order (jebbs `:77-88`), date cell printed once per group, `prorrateo` badge on `source === "recurring"`, Debe/Haber chosen by `LEDGER_DIRECTION[entry.source]`, `EXPENSE_CATEGORY_LABELS` fallback for a null `concept`, 7-day-group pagination with `Math.min` clamping (D5), skeleton while `isLoading`, empty state inside the card, closing-balance strip **always** rendered from the prop (D6/D10). No export dropdown, no `jspdf`/`exceljs` (proposal D3). |
| `components/finanzas/resumen-tab.tsx` | Modify | One import; one `<DailyLedger key={periodLabel} … />` after `:379`. Extend the file's doc comment (`:64-69`) to say the ledger's total is the same `netRevenue` field the card at `:254-274` renders. Nothing else changes. |

**Explicitly untouched, in every PR**: `lib/services/finance-summary.ts`,
`lib/services/recurring-expenses.ts`, `components/finanzas/expense-list.tsx`,
`components/finanzas/finanzas-tabs.tsx`, `app/(dashboard)/rendimiento/page.tsx`, `scripts/`,
`package.json`. **Totals**: 2 created, 2 modified (the hook twice, in different PRs), 0 deleted, 0 new
dependencies, 0 migrations.

---

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (PR2) | Row order within a day (rule 2) | One day carrying all four sources ⇒ `entries.map(e => e.source)` is exactly `["orders","external_income","expense","recurring"]`. |
| Unit (PR2) | **Input order independence** (D7) | Shuffle `expenses` and `recurringAllocations` (and reverse the allocations array, mimicking template-major output from an unordered select) ⇒ **byte-identical** output, including every `balance`. The regression guard for the whole D7 decision. |
| Unit (PR2) | Ventas and Ingresos externos never merge | A day with both ⇒ two rows, `source: "orders"` and `source: "external_income"`, with the two amounts kept apart. The case that motivates PR1's split at all. |
| Unit (PR2) | Zero-amount rows (rule 4) | Day with no sales ⇒ no `"orders"` row. Allocation with `amount === 0` ⇒ no row. Expense with `amount === 0` ⇒ no row. Empty period ⇒ `[]`. |
| Unit (PR2) | One row per template per day (D1) | Three monthly templates over a 3-day period ⇒ **9** `"recurring"` rows, three per day, each with its own `concept`. Never collapsed, never lumped at `endDateStr` (jebbs' shape, explicitly not ported). |
| Unit (PR2) | Cross-month proration is passed through | Allocations spanning Jan→Feb (`amount/31` then `amount/28`) ⇒ the builder reproduces both rates unchanged; it performs **no division**. |
| Unit (PR2) | Weekly/biweekly ⇒ zero rows | `expandRecurringExpensesDaily` emits nothing for them (`recurring-expenses.ts:71-73`), so the ledger has nothing to show. Asserted end-to-end through the builder with a stale-amount weekly template in the input templates. |
| Unit (PR2) | **No commission row, ever** (proposal D1 / rule 9) | `sum(income) − sum(expense) ≈ netRevenue` within `1e-9` with a **non-zero** `commissionTotal` in the fixture. Fails loudly the day someone ports jebbs' `commissionByDate` block (`:621-670`). Never `toBe`. |
| Unit (PR2) | Running balance ≈ netRevenue (rule 1) | Last row's `balance` differs from `totalRevenue − expensesTotal` by at most `1e-9` — asserted with a tolerance precisely because `amount/31` summed 31 times is not `amount`, which is *why* D6 keeps this number off the screen. |
| Unit (PR2) | Null description survives as null | An expense with `description: null` ⇒ `concept === null` **and** `category` set, so the component can build its fallback. No Spanish string appears anywhere in this module's output — asserted (D2). |
| Unit (PR2) | Direction is derived, not stored | `LEDGER_DIRECTION[entry.source]` is `"expense"` for every `"expense"`/`"recurring"` row and `"income"` for the others; `LedgerEntry` has no `kind` and no `isProrated` key. |
| Unit (PR2) | Day outside `dailyData` | An expense dated outside the walked range ⇒ ignored, not appended, not thrown. Pins the documented behaviour of a provably-unreachable case. |
| Types | Whole chain | `npx tsc --noEmit` in **every** PR — `next.config.mjs`'s `ignoreBuildErrors: true` means a green `next build` proves nothing. |
| Lint | Whole chain | `pnpm lint`. |
| Manual — PR1, the safety proof | Rule 8 | Screenshot Resumen's "Ingresos vs. gastos por día" **and** `/rendimiento`'s "Ingresos por día" before and after; every bar/point and both tooltips identical. Spot-check a day that has both a sale and external income. |
| Manual — PR3 | The headline check | "Saldo del período" is character-identical to "Ingreso neto del período" three cards above, in month, week and custom view. |
| Manual — PR3 | D1 visible | With 2+ monthly templates, a single day shows one badged `prorrateo` row **per template**, each with its own description. |
| Manual — PR3 | D5 | A 31-day month with templates paginates to 5 pages; switching to week view shows page 1 of 1, and switching back does not land on a stale page. |
| Manual — PR3 | Loading | No `$0` closing balance flashes before data arrives; skeleton first. |

No E2E layer — this repo has no browser-test infrastructure, and adding Playwright is far outside this
change's scope. **PR2 is strict TDD**: the test file lands red before `daily-ledger.ts` exists.

---

## Migration / Rollout

**No migration required.** No SQL, no table, no view, no new query, no dependency. The only data-access
delta in the entire change is one column on one existing select (PR1).

Ordering: **PR2 requires PR1** (`ordersRevenue`/`externalRevenue` and the `description` column).
**PR3 requires PR2** (`analytics.ledger`). The chain is strictly linear and all three touch
`use-orders-history.ts` or its consumers, so `feature-branch-chain` keeps each child diff clean.

Rollback: each PR reverts independently. PR1 restores one accumulator field; PR2 removes an unread
returned field and a file with no other importer; PR3 removes a card and leaves every other figure on the
tab untouched. **Unlike `gastos-recurrentes`' PR3/PR4 coupling, there is no revert asymmetry here, because
this change moves no money at all** — reverting any prefix or the whole thing leaves no unexplained number
in any total.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **The `dailyMap` split drifts `revenue`**, silently breaking Resumen's bar chart and `/rendimiento`'s AreaChart (`page.tsx:624, 636`) | **High** — wrong numbers on a screen outside this feature's blast radius | D9: `revenue` is reconstructed in ONE expression at the push site; the typed `Record` compile-errors on any missed initializer; PR1 ships alone as a provable no-op with a before/after visual check on **both** screens. |
| **Commission double-subtraction reintroduced** while porting the surrounding jebbs code line by line | **High** | Proposal D1 + the tolerance test run with a non-zero `commissionTotal`; `LedgerSource` has no commission member, so a commission row cannot even be constructed without editing the union. |
| **The displayed total gets re-summed from the array**, putting float drift under a differently-computed `netRevenue` | Medium — it is the "obvious" implementation | D6 deletes the field it would live in. There is one number and both cards read it. |
| **Prorated rows reshuffle between refetches**, making an "auditable" table visibly non-deterministic | Medium | D7's two sorts + the shuffle-invariance test. The failure is invisible in a single render, which is exactly why it needs a test rather than a review. |
| **The ledger disagrees with the Gastos tile or the category cards** | Low | Rule 7: the same `recurringAllocations` array (`:249`) and the same `expenses` rows, no second fetch, no fourth call to `expandRecurringExpensesDaily`. Structural, not tested. |
| **Row-count density from D1** makes a day unreadable | Medium | D5's 7-day pages bound the screen. If operators still complain, the follow-up is a per-day collapse toggle in the **component** — never in the builder, whose 1:1 correspondence with `recurringAllocations` is what keeps the totals honest. |
| **Operator reads a prorated row as a real payment** | Medium | The `prorrateo` badge on every such row, derived from `source === "recurring"` so it cannot be forgotten per-row. |
| **`description` silently missing from the select** (the client has no `Database` generic, so TS won't catch it) | Low | `?? null` at the builder boundary; the null-description test; the fallback label renders `Gasto (Insumos)` rather than an empty cell, so the failure is visible rather than blank. |
| **~200 objects built per analytics read** | Low | O(days + expenses + allocations) over data already in memory, inside an existing `queryFn`, once per fetch (D8). No extra round trip. |

---

## Open Questions

None blocking. All five of the proposal's open design questions are resolved: **#1 by the user's confirmed
product decision** (recorded as D1), **#2 by D2**, **#3 by D3**, **#4 by D4**, **#5 by D5**.

Two items recorded as **follow-ups**, deliberately out of this change:

- [ ] **Extract `EXPENSE_CATEGORY_LABELS` from `components/finanzas/expense-list.tsx` into `lib/`.** Its own
      doc comment (`:10-15`) sets the trigger at "a third consumer"; there are already five, independently
      of this change. It deserves its own small PR, not a ride-along in a read-only view (D2).
- [ ] **PDF / Excel export of the ledger** — proposal D3. `jspdf`, `jspdf-autotable` and `exceljs` are
      absent from morfito; adding three dependencies belongs to a separate change built on a table that
      already works.
- [ ] **Row identity (`{ source, date, refId }`)** — add it together with the first feature that needs it
      (sorting, filtering, or drill-down), per D3's revisit trigger, which is written into `LedgerEntry`'s
      doc comment.
