# Design: `gastos-recurrentes` — Recurring expense templates with on-read proration

> **Size note**: this document deliberately exceeds the sdd-design 800-word budget. The launch prompt
> explicitly required the four open design questions resolved with rationale, full DDL with the
> house comment banner, exact TypeScript signatures, a line-precise integration map for
> `use-orders-history.ts`, and a per-PR file-change table at the rigor bar of
> `.atl/sdd/finanzas-gastos-recetas/design.md`. Explicit instruction wins over the generic budget.

---

## Verification Basis

Every citation below was re-checked against the working tree, not copied from the proposal. Deltas found:

| Proposal claim | Verified reality |
|---|---|
| `finance-summary.ts:28-46` (types) and `:48-55` (`computeNetRevenue`) | **Exact.** File is 55 lines; `netRevenue: input.totalRevenue - input.expensesTotal` at `:53`. |
| `use-orders-history.ts:11-13` `toArDateStr`, `:17-23` `arDateToUTC` | **Exact.** `arDateToUTC` bakes `h + 3` into `Date.UTC` at `:22` — the AR offset the proration must never see. |
| Period strings at `:147-150` | **Exact** (`startDateStr`/`endDateStr`/`prevStartDateStr`/`prevEndDateStr`). |
| "eight parallel queries (`:196-208`)" | **Imprecise.** The destructuring starts at `:152`, `await Promise.all([` is at `:161`, the two `expenses` queries are `:198-207`, and the array closes at `:208`. `:196-197` is the comment above the expenses queries. The new 9th query and its `{ data, error: e9 }` slot go at **`:160`/`:207`**, not at `:196`. |
| `expensesTotal` assembly / `computeNetRevenue` call at `:239-250` | **Exact.** |
| Daily expenses fold at `:292-296`, gap-fill at `:298-313` | **Exact.** |
| Analytics return object at `:315-337` | **Exact.** |
| `resumen-tab.tsx:99-121` date IIFE, `:123-134` `useExpenses` + `totalsByCategory`, `:156` Gastos tile | **Exact.** `:156` is literally `value: analytics?.expensesTotal ?? 0`. |
| `gastos-tab.tsx:92-101` `totalsByCategory` | **Exact.** |
| `expense-form-dialog.tsx:88-96` on-open reset | **Exact.** Deps are `[open]` only — see D8. |
| `expense-form-dialog.tsx:80` `todayArStr()` | **Partially off.** `:80` is `useState(todayArStr())`; the helper itself is at **`:32-34`**. Rule 12's "same AR-calendar source" therefore means `:32-34`, which D9 promotes into `calendar-date.ts`. |
| `use-expenses.ts:99-106` create input, `:120-150` stock bump | **Exact.** |
| `lib/types/index.ts:361-382` | **Off by two.** `ExpenseCategory` is `:361-366`; `Expense` is `:368-**384**` (`created_at` at `:383`, close brace `:384`). |
| `scripts/045-expenses.sql:95-98` pairing CHECK, `:104` index, `:106-111` RLS | **Exact.** |
| `046` is the last migration; `recurring_expenses` collides with nothing | **Confirmed.** `scripts/` ends at `046-expense-stock-movements.sql`; `047` is free. |
| No pure calendar-date helper anywhere in `lib/` | **Confirmed.** `lib/utils/` holds `format.ts`, `commission.ts`, `variant-pricing.ts`, `order-status.ts`, `order-status-style.ts`, `formatOrderDelivery.ts`, `formatOrderWhatsapp.ts`. No date module. |
| vitest: `package.json:10` = `"test": "vitest run"`, `vitest.config.ts:8-12` alias | **Exact.** `environment: "node"`, `@` → repo root. Default include glob picks up any `*.test.ts`, no config change needed. |
| **"House migration style from `041`–`046`: `information_schema`/`pg_tables` pre-flight comments, a single `BEGIN`/`COMMIT`"** | **FALSE — do not follow it.** `rg 'BEGIN;\|COMMIT;\|information_schema\|pg_tables' scripts/` matches **only `scripts/010-generic-products.sql`**. None of `041`–`046` open a transaction or contain a pre-flight probe. The actual house style is: a long `-- ===` prose banner (WHAT THIS FILE IS / WHY-X / NOT RUN AGAINST ANY LIVE DATABASE / REVERSIBILITY), then bare DDL, no transaction wrapper. `047` follows `045`/`046`, not `010`. |

Additional findings the proposal did not mention, all load-bearing below:

- **`lib/types/index.ts` contains zero runtime exports** — it is a pure type barrel. Any "list of the five
  categories" value must therefore live elsewhere or the file changes character. See D4.
- **`useExpenses` selects `*`** (`use-expenses.ts:83`), so the payment counter gets
  `recurring_expense_id` for free the moment `047` lands. **No query change is needed in PR5.**
- **The gap-fill loop's keys provably align with the proration output.** `:300-313` walks
  `cursor = new Date(start)` (an AR-offset instant at `03:00Z`) with `setUTCDate(+1)` and keys by
  `toArDateStr(cursor)`, so it emits exactly `startDateStr … endDateStr` inclusive. `formatCalendarDate`
  over `[parseCalendarDate(startDateStr), parseCalendarDate(endDateStr)]` emits the same string set. The
  join in D6 is exact, not approximate.
- **`daysInPeriod` (`:253-254`) is `Math.round((end - start)/msPerDay)`** and already tolerates the
  `23:59:59` end bound. Untouched by this change; noted so nobody "fixes" it while editing nearby lines.

---

## Technical Approach

Five PRs, each independently revertible. The shape is: **one additive migration; two new pure modules
with their own tests; one read-path fold-in that is numerically a no-op the day it ships; then the UI
that can finally create the data.**

The load-bearing structural idea is that this change adds **exactly one new brain** —
`lib/services/recurring-expenses.ts` — fed by **one new primitive layer**,
`lib/utils/calendar-date.ts`, whose entire reason to exist is to keep the AR `+3h` offset out of
day-boundary arithmetic. Everything else is plumbing: one query, one fold, one hook family, one sub-tab.
No component performs money arithmetic, and `lib/services/finance-summary.ts` is not touched.

```
recurring_expenses (047)                       expenses (045 + 047 FK column)
        │                                              │
        │  unfiltered select (rule 5)                  │  date-ranged select
        ▼                                              ▼
   useOrdersAnalytics queryFn ─── parseCalendarDate(startDateStr…) ──┐
        │                                                            │
        ▼                                                            ▼
  expandRecurringExpensesDaily(templates, periodStartCal, periodEndCal)
        │  ONE allocations array, reused three times (D6)
        ├──▶ recurringTotal ─┐
        ├──▶ dailyMap[date].expenses           ├─▶ expensesTotal ─▶ computeNetRevenue (UNCHANGED)
        └──▶ expensesByCategory ───────────────┘
                    │
                    ▼
        resumen-tab.tsx / gastos-tab.tsx  (read it; both local reduces deleted — D7)

recurring-expenses.ts § payday ──▶ recurring-expense-list.tsx  "N de M pagos cargados"
        ▲                                       │
        └── expenses[].recurring_expense_id ◀── ExpenseFormDialog prefill (D8)
```

---

## Architecture Decisions

### D1 — One migration (`047`), not two — **resolves open question 1**

**Choice**: `scripts/047-recurring-expenses.sql` contains `CREATE TABLE recurring_expenses`, its index,
its RLS enable + policy, **and** `ALTER TABLE expenses ADD COLUMN recurring_expense_id`, in that order,
in one file, with no transaction wrapper (house style — see Verification Basis).

**Rejected**: `047` (table) + `048` (FK column).

**Rationale**:

1. **The two statements are not independent — one references the other.** `ADD COLUMN … REFERENCES
   recurring_expenses(id)` fails unless the table already exists. Splitting them creates an ordering
   dependency between files with nothing enforcing it, which is strictly worse than one file whose
   statements are ordered by construction.
2. **A partially-applied `047` is recoverable; a partially-applied `047`+`048` pair is ambiguous.**
   Without a transaction wrapper (and this repo has never used one since `010`), a failure between the
   two statements leaves the table created and the column missing. In one file, the REVERSIBILITY block
   documents exactly that state and its undo. Across two files, "which migrations did we actually run?"
   becomes a question nobody can answer from the filesystem.
3. **`045`'s own precedent.** `045-expenses.sql` landed a table, its CHECK constraint, its index and its
   RLS policy in one migration because there was nothing to migrate. Same situation here: the FK column
   starts `NULL` on every existing row, so there is no backfill, no lock-duration concern (a nullable
   `ADD COLUMN` with no default is a catalog-only operation in PG 11+), and no reason to stage.
4. **`043` already set the "one migration, several tables" precedent** — it alters `orders` *and*
   `external_income` in one file (`043:68-83`).

**Consequence for rollback ordering** (recorded in the file's REVERSIBILITY block): the column must be
dropped **before** the table, because the FK depends on it.

### D2 — D4 (delete window) stays app-layer; **no `FOR DELETE` RLS policy** — **resolves open question 2**

**Choice**: keep `045`'s single allow-all `FOR ALL` policy shape for `recurring_expenses`. Enforce
"delete only while `start_date >= today (AR)`" in **two** app-layer places: the mutation refuses before
issuing the `DELETE`, and the UI omits the button entirely (D4 of the proposal: absent, not disabled).

**Rejected**: splitting the policy into `FOR SELECT/INSERT/UPDATE` + a narrowed
`FOR DELETE USING (start_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)`.

**Rationale**:

1. **It would put a *second, differently-derived* definition of "today in AR" in the system.** The app
   derives it from `toLocaleDateString("en-CA", { timeZone: TZ })`; the policy would derive it from
   `AT TIME ZONE` against the database server clock. These agree *almost* always — and disagree exactly
   at the boundary the rule is about. A template created at 23:58 AR and deleted at 00:01 AR would be
   rejected by both; a template created at 00:01 AR while the DB server's clock drifts ten minutes
   behind is rejected by one and allowed by the other. A silent, unreproducible, time-of-day-dependent
   permission failure is a far worse outcome than the risk it removes.
2. **The invariant it would protect is already unreachable from the UI**, and this repo has exactly one
   client (a single-tenant internal dashboard where every table carries `USING (true)`). An RLS policy
   here does not defend against a hostile actor — the anon key can already `DELETE` any `expenses` row —
   it only defends against our own future code, which is what code review and the mutation guard are for.
3. **It contradicts the repo's own RLS posture**, stated verbatim in `045:108-110`: "Same 'allow all'
   internal-dashboard posture as every other table in this repo — single-tenant admin dashboard, not a
   multi-tenant app with row-level ownership." Introducing the repo's first non-trivial policy for a
   *business rule about recency* — not about ownership — sets a precedent nobody asked for.
4. **The blast radius of the app-layer version being wrong is bounded and reversible.** The only rows a
   bug could reach are templates with `start_date >= today`, which by construction have contributed
   at most today's in-progress daily slice and (per D4's own reasoning) have no logged payments. Deleting
   one loses nothing a re-create cannot restore.

**Recorded as a follow-up, not a gap**: if a second client (mobile app, script, integration) ever writes
to this table, the policy becomes worth its cost. The `047` header names it as the trigger condition, so
the decision is discoverable at the place someone would go looking.

### D3 — Payday helpers live in `lib/services/recurring-expenses.ts`, in a banner-delimited second section — **resolves open question 3**

**Choice**: one module, two sections:
`// ─── Proration (monthly templates) ───` and `// ─── Payday tracking (weekly/biweekly templates) ───`.
The test file mirrors it with two top-level `describe` blocks.

**Rejected**: a sibling `lib/services/payday-progress.ts`.

**Rationale**:

1. **The decisive argument is that the two halves are the two halves of ONE business rule.** Rule 1 says
   a non-monthly template contributes exactly zero money *and is instead tracked by cadence*. Its first
   half is `expandRecurringExpensesDaily`'s unconditional `if (template.frequency !== "monthly") continue;`;
   its second half is `isInformationalPaydayTemplate`'s frequency test. Put them in two files and a
   future edit can add an `amount != null` condition to one without ever seeing the other — which is
   precisely the double-counting bug rule 1 exists to prevent. In one file, with the two sections
   adjacent and cross-referenced, that edit is visible.
2. **Both halves are total functions over the same input type** (`RecurringExpense[]`) and share the same
   primitives (`parseCalendarDate` / `formatCalendarDate`). A split module would import from its sibling
   or duplicate; both are worse than adjacency.
3. **Local precedent**: `lib/services/recipe-cost.ts` already holds cost + margin + makeable-count —
   three distinct computations over one input in one module, with `resolveRecipeQuantities` shared
   between them specifically so they cannot drift. Splitting here would invent a new convention for a
   smaller module (~230 lines, against `recipe-cost.ts`'s ~200) with no benefit.

**Acknowledged cost**: the payday half depends on `Expense[]` while the proration half does not, so the
module's import surface is wider than either half needs. Accepted, and mitigated by the section banner.
**Split trigger, written into the file header**: if the module passes ~400 lines, or if a third
consumer needs payday tracking without proration, extract `payday-progress.ts` then — the section
boundary is already the seam.

### D4 — `expensesByCategory` returns **merged totals**: `Record<ExpenseCategory, number>` — **resolves open question 4**

**Choice**:

```ts
expensesByCategory: Record<ExpenseCategory, number>
// all five keys always present, initialized to 0, one-off + prorated summed together
```

**Rejected**: `Record<ExpenseCategory, { total: number; oneOff: number; recurring: number }>`.

**Rationale**:

1. **The split shape multiplies the invariant this change exists to protect.** The *Intent*'s fourth
   bullet is that the category cards must sum to the Gastos tile. With a flat record that is one
   assertion — `sum(Object.values(expensesByCategory)) === expensesTotal`. With the split shape it is
   three (`total`, and `oneOff + recurring === total` per key), and it hands a future component a
   `oneOff` field it can render beside `expensesTotal` and be silently, plausibly wrong. We are removing
   a duplicated-aggregation bug; shipping three fields where one is consumed re-opens the same class.
2. **Both consumers render exactly one number per category today** (`resumen-tab.tsx:329-341`,
   `gastos-tab.tsx:163-174`). The merged shape makes their migration a pure deletion of a local reduce
   with an identical render tree. The split shape ships a field with zero call sites on day one.
3. **The split's motivating question is better answered elsewhere.** "How much of Alquiler is fixed?"
   aggregated per category is the wrong unit — two rent templates would merge into one number, which is
   exactly the grouping D5/rule 13 rejects. The "Fijos mensuales" sub-tab answers it correctly and at
   higher resolution: `expandRecurringExpenses` returns **per template** period shares, keyed by
   `templateId`.
4. **It is additive later, and subtractive never.** Adding `expensesRecurringByCategory` to the hook's
   return when a screen actually needs it breaks nothing. Removing a field two components already read
   is a migration.

**Initialization is an object literal, not a derived array:**

```ts
const expensesByCategory: Record<ExpenseCategory, number> = {
  supplies: 0, services: 0, salaries: 0, rent: 0, other: 0,
};
```

Deliberately not `Object.fromEntries(SOME_ARRAY.map(...))`: the literal is checked by TS against the
`ExpenseCategory` union, so adding a sixth category becomes a **compile error at this exact line**,
whereas the `fromEntries` form type-launders through `as Record<…>` (which is exactly what
`gastos-tab.tsx:93-96` and `resumen-tab.tsx:126-129` do today, and part of why those two could drift).
This also avoids putting a runtime constant into `lib/types/index.ts`, which is currently a pure type
barrel with **zero** runtime exports.

### D5 — `lib/utils/calendar-date.ts` is its own module, and owns the one clock→date boundary

**Choice**: a new pure module under `lib/utils/` (not inside the service), exporting five pure
functions **plus** `arTodayStr(now: Date = new Date())`.

**Rejected**:
- **Putting the parsers inside `lib/services/recurring-expenses.ts`** — `use-orders-history.ts` needs
  `parseCalendarDate` directly (rule 6's conversion happens at the *hook's* boundary, before the service
  is called). A hook importing a service purely for a date parser inverts the dependency direction the
  rest of `lib/` keeps.
- **Reusing `arDateToUTC` (`use-orders-history.ts:17-23`)** — it is the exact thing rule 6 forbids: it
  adds `+3h` (`:22`), so `parse("2026-01-31")` lands at `2026-01-31T03:00Z` and a naive
  `+24h` walk across a DST-free but offset-shifted boundary silently mis-attributes month edges.
- **A clock-reading `todayArStr()` with no parameter** (the current `expense-form-dialog.tsx:32-34`
  shape) — untestable. The default-argument form is identical at every call site and lets a test pin
  `arTodayStr(new Date("2026-09-10T02:00:00Z")) === "2026-09-09"`, which is precisely the AR-offset
  boundary rule 12 cares about.

**Rationale**: the module's whole value is being the one place where "a calendar date" means a
UTC-midnight `Date` with no time-of-day, and `arTodayStr` is the *only* legitimate crossing from
"an instant on a clock" into that world. Keeping it here — with the crossing parameterized — means the
module stays 100% deterministic under test while rule 12 gets a single named source. PR5 deletes
`expense-form-dialog.tsx:32-34` and imports this instead, so rule 12's "same AR-calendar source the
expense dialog already uses" becomes literally true rather than merely parallel.

### D6 — The hook computes the daily allocations **once** and reuses that array three times

**Choice**: inside `useOrdersAnalytics`' `queryFn`:

```ts
const recurringAllocations = expandRecurringExpensesDaily(templates, periodStartCal, periodEndCal);
// used for: (a) the recurring share of expensesTotal
//           (b) the per-day fold into dailyMap[key].expenses
//           (c) expensesByCategory
```

**Rejected**: the proposal's literal `expensesTotal = oneOffTotal + sum(expandRecurringExpenses(...))`
followed by a separate `expandRecurringExpensesDaily(...)` call for the daily fold.

**Rationale**: rule 8 requires `sum(dailyData[].expenses) === expensesTotal`. Two independent calls make
that a *tested* property — one that a future refactor (a different period argument, a filter added to
one call and not the other) can break without failing the pure-module tests, because the bug would live
in the hook, which has no test harness. One array makes it a **structural** property: the total is
`allocations.reduce(...)` and the daily fold iterates the same elements, so they cannot disagree unless
addition itself is non-associative (which float error makes it, at the 1e-10 level — hence the
tolerance assertion, never `toBe`).

`expandRecurringExpenses` (the grouped-by-template derivation) is therefore **not called by the hook at
all**. Its consumer is the "Fijos mensuales" list, which needs each template's own period share. Its
tie to the primitive stays enforced by its implementation (it sums the daily output) and by a test
asserting the two agree.

### D7 — Both category reduces are deleted in the same PR that changes the arithmetic

**Choice**: PR3 changes `expensesTotal` **and** migrates `resumen-tab.tsx` and `gastos-tab.tsx` off
their local reduces, in one diff. Not a follow-up, not a separate PR.

**Rationale**: this is the proposal's fourth *Intent* bullet promoted to a merge gate. The moment
`expensesTotal` contains prorated money, `resumen-tab.tsx:338`'s category cards and `:156`'s Gastos tile
show different totals **in the same viewport**. Splitting the migration into a later PR means shipping
that inconsistency deliberately. PR3 is chosen as the landing point precisely because with zero
templates in the database the whole diff is numerically inert — the inconsistency it prevents cannot
even occur yet, which makes it the safest possible place to make the change.

Concretely, PR3 deletes from `resumen-tab.tsx`: the date-string IIFE (`:99-121`), the `useExpenses` call
(`:123`), the `totalsByCategory` IIFE (`:125-134`), and the `useExpenses` import (`:29`) — and with them
the `expensesLoading` skeleton branch (`:321-327`) collapses into `isLoading`. From `gastos-tab.tsx` it
deletes the `totalsByCategory` `useMemo` (`:92-101`) and the `useMemo` import if unused.

### D8 — The prefill **extends** the on-open reset; the prefill object must be referentially stable

**Choice**: `ExpenseFormDialog` gains `prefill?: ExpenseFormPrefill | null`, and the existing effect at
`:88-96` seeds from it instead of a second, competing effect:

```ts
useEffect(() => {
  if (!open) return;
  setDate(arTodayStr());
  setAmount("");                                        // never prefilled — rule 1's real amount
  setCategory(prefill?.category ?? "supplies");         // D6: the template's own category, not "salaries"
  setDescription(prefill?.description ?? "");
  setSupplyId(null);
  setQuantity("");
  setRecurringExpenseId(prefill?.recurringExpenseId ?? null);
}, [open, prefill]);
```

**Rejected**:
- **A second `useEffect` that applies the prefill after the reset** — ordering between two effects with
  overlapping deps is exactly the "silently wiped" failure the proposal's *Edge cases* flags.
- **Reading `prefill` through a ref to keep the dep array `[open]`** — silences
  `react-hooks/exhaustive-deps` by hiding a second source of truth, and this repo runs `eslint .`
  (`package.json:8`) in CI-adjacent posture.

**Load-bearing consequence, stated here so `sdd-tasks` carries it into the task text**: with `prefill`
in the dep array, an **inline object literal** (`prefill={{ category, description, recurringExpenseId }}`)
would produce a new reference on every parent render and re-run the reset **while the operator is
typing the amount**. The caller therefore holds it in state:

```ts
const [prefill, setPrefill] = useState<ExpenseFormPrefill | null>(null);
// "Cargar pago" handler: setPrefill({...}); setFormOpen(true);
// dialog onOpenChange(false): setPrefill(null);
```

The prop's JSDoc must say this. It is the single most likely PR5 regression.

### D9 — Close-and-replace: **INSERT the replacement first, UPDATE the old row's `end_date` second**

**Choice**: `useCloseAndReplaceRecurringExpense` runs `INSERT` (new row, `start_date = effectiveFrom`)
→ `UPDATE` (old row, `end_date = dayBefore(effectiveFrom)`), in that order.

**Rejected**: `UPDATE` then `INSERT` (jebbs' order), and "wrap both in a transaction" (Supabase JS has
no client-side transaction; `use-order-stock-sync.ts:55-62` already documents that this repo declines to
add an RPC for exactly this).

**Rationale** — the generalizing rule, stated the same way D2 of `finanzas-gastos-recetas/design.md`
states its own: **the visible failure always beats the invisible one.**

| Order | Crash between the two writes | Reported effect | Operator experience |
|---|---|---|---|
| `UPDATE` → `INSERT` | old row closed, no replacement | fixed cost **disappears** from every period after `effectiveFrom` | invisible; profit reads **optimistically high** — the exact failure mode this whole change exists to fix (*Intent*, bullet 2) |
| **`INSERT` → `UPDATE`** | **both rows active over the overlap** | **the template's cost is counted twice** | **visible: two rows with the same description, both badged "Activo", in the list the operator is already looking at**; profit reads conservatively low |

A doubled rent line is wrong and obvious. A missing rent line is wrong and invisible. The `047` header
and the hook's doc comment both carry this table.

**The `end_date >= start_date` CHECK interacts with this** — see D10.

### D10 — Constraints on `047`: what is enforced in the schema, and what deliberately is not

| Rule | Schema? | Why |
|---|---|---|
| No stock effect ever (D2 of the proposal) | **Yes — by omission.** No `supply_id`, no `quantity` columns | Makes the rule unrepresentable rather than guarded. Same posture as `045`'s pairing CHECK, applied inversely. |
| `monthly` must carry an amount (rule 11) | **Yes** — `CHECK (frequency <> 'monthly' OR amount IS NOT NULL)` | A monthly template with `amount IS NULL` prorates to `Number(null)/daysInMonth === 0` — a **silent** zero, not an error. One-directional only. |
| `weekly`/`biweekly` must NOT carry an amount | **No — deliberately.** | Rule 1 skips non-monthly templates **unconditionally**, regardless of `amount`. Forbidding the column would make the code's unconditional skip look redundant to a future reader and invite someone to "simplify" it into an `amount != null` check — reintroducing the double-count. The stale-amount case is a required test, not a constraint. |
| `end_date` is on/after `start_date` (rule 4) | **Yes** — `CHECK (end_date IS NULL OR end_date >= start_date)` | Blocks a zero/negative-length window, which would otherwise be a template that exists and charges nothing. |
| Delete window (D4/rule 12) | **No** — see D2 above. | |

**Interaction the CHECK creates, and its resolution.** Close-and-replace with
`effectiveFrom === template.start_date` computes `end_date = start_date − 1 day` and is **rejected by the
CHECK**. That is correct behavior, and the UI must not be able to request it: the update dialog's date
picker is bounded to `effectiveFrom > template.start_date`. A same-day amount correction on a template
that has not started yet is the **delete** path (D4 permits it precisely while `start_date >= today`),
which is the honest operation — nothing has been reported yet, so there is no history to preserve.
This is the one place D3 (never rewrite the amount) and D4 (delete only while unstarted) are load-bearing
for each other, and the update dialog's copy should say so: *"Para cambiar un gasto fijo que todavía no
empezó, eliminalo y creálo de nuevo."*

### D11 — Indexes: **one partial index on the FK, none on `start_date`**

**Choice**: `CREATE INDEX idx_expenses_recurring_expense_id ON expenses(recurring_expense_id) WHERE recurring_expense_id IS NOT NULL;`
and **no** index on `recurring_expenses(start_date)`.

**Rejected**: the proposal's lean toward `idx_recurring_expenses_start_date`, mirroring jebbs
(`003-costs-schema.sql:79`) and `idx_expenses_date` (`045:104`).

**Rationale**: `045:101-103` justifies its index with "every read of this table is date-ranged". For
`recurring_expenses` the opposite is true by design — **rule 5 mandates the query carry no date filter
at all**, because a `gte("start_date", periodStart)` would silently drop the long-running templates the
feature exists for. An index on a column no query ever filters by is pure write-amplification and a
false signal to the next reader about how the table is queried. The table will hold single-digit rows
for years; the unfiltered read is a seq scan either way.

The FK index earns its keep for a different reason than the proposal gave. The payment counter does
**not** query by `recurring_expense_id` — it matches in JS over the period's already-loaded `expenses`
(`useExpenses` selects `*`). The real predicate is Postgres's own: `ON DELETE SET NULL` scans `expenses`
for referencing rows on every template delete, and PG does **not** auto-index FK columns. Partial
(`WHERE … IS NOT NULL`) because the overwhelming majority of expense rows will never carry the FK, so
the index stays tiny and the inserts of ordinary one-off expenses do not pay for it.

---

## Migrations

### `scripts/047-recurring-expenses.sql` (PR1)

```sql
-- ============================================================
-- Morfito — gastos-recurrentes, PR1: recurring expense templates (047)
-- ============================================================
--
-- WHAT THIS FILE IS
-- ------------------
-- Closes the deferral scripts/045-expenses.sql:21-27 explicitly recorded
-- ("WHY RECURRING EXPENSES ARE NOT MODELLED HERE"). Introduces
-- `recurring_expenses` — TEMPLATES for fixed costs (rent, internet, a
-- monthly cleaning contract, a fortnightly wage) — plus the single nullable
-- FK column on `expenses` that links a logged payment back to the template
-- it satisfies.
--
-- The strategy 045 said it refused to guess is now decided: PRORATION IS
-- COMPUTED ON READ. There is no scheduler, no materialised `expenses` rows,
-- no `next_due_date` column. lib/services/recurring-expenses.ts expands
-- these template rows into per-day allocations inside
-- useOrdersAnalytics' queryFn, every time a period is read. That is why this
-- table has no bookkeeping columns at all: nothing here is ever "consumed"
-- or "advanced", so there is no state to reconcile when a template is
-- closed or a past period is re-read.
--
-- WHY THIS TABLE HAS NO supply_id / quantity
-- -------------------------------------------------------------------------
-- Confirmed product decision: a recurring expense NEVER touches stock, not
-- even with category = 'supplies'. One-off `expenses` rows do (045's
-- expenses_supply_bump_pairing CHECK + scripts/046's ledger), and that
-- asymmetry is intentional: a monthly template is an ALLOCATION of money
-- across days, not a delivery of goods on a day, so there is no moment at
-- which stock would arrive. Rather than guarding the rule in
-- lib/hooks/expenses/use-recurring-expenses.ts, the columns simply do not
-- exist — the rule is unrepresentable instead of merely unenforced. This is
-- 045's "make the pairing a CHECK" posture, applied by omission.
--
-- WHY amount IS NULLABLE, AND THE ONE-DIRECTIONAL CHECK ON IT
-- -------------------------------------------------------------------------
-- Two behaviours share this table, gated by `frequency`:
--   * monthly     — carries an amount, prorated daily into expensesTotal.
--   * weekly/biweekly — INFORMATIONAL ONLY. They declare a payment cadence
--     (an hourly employee paid every fortnight) whose amount is not knowable
--     in advance. They contribute EXACTLY ZERO money; the real payment is a
--     one-off `expenses` row, linked back here by recurring_expense_id.
--
-- Hence: monthly REQUIRES an amount (a NULL there would prorate to a silent
-- 0, not an error), while weekly/biweekly are NOT forbidden from carrying
-- one. That asymmetry is deliberate. lib/services/recurring-expenses.ts
-- skips every non-monthly template UNCONDITIONALLY — it does not test
-- `amount != null` — because the one-off row is the source of truth for
-- that payment and a template that both prorated AND had a matching logged
-- payment would double-count the same money. A CHECK forbidding the column
-- would make that unconditional skip look redundant and invite a future
-- "simplification" into an amount-based test, reintroducing the bug.
--
-- WHY end_date IS INCLUSIVE, AND WHAT THAT COSTS
-- -------------------------------------------------------------------------
-- end_date is the LAST day the template applies, not the first day it stops.
-- Consequence for the close-and-replace flow (the ONLY way to change an
-- active template's amount — a template's amount is never UPDATEd, so
-- historical proration stays intact): the closed row's end_date must be the
-- day BEFORE the replacement's start_date, or that day is charged twice.
-- lib/utils/calendar-date.ts::dayBefore exists for exactly this, and the
-- CHECK below (end_date >= start_date) makes the zero-length window
-- unrepresentable.
--
-- WRITE ORDERING FOR CLOSE-AND-REPLACE: INSERT FIRST, UPDATE SECOND
-- -------------------------------------------------------------------------
-- The two writes are not in a transaction (Supabase JS has no client-side
-- transaction; see use-order-stock-sync.ts:55-62 for this repo's standing
-- position on that). Crash between them, ordered UPDATE-then-INSERT: the old
-- row is closed with no replacement and the fixed cost silently DISAPPEARS
-- from every later period — invisible, and it makes profit read
-- optimistically high, which is the exact failure this whole feature exists
-- to fix. Ordered INSERT-then-UPDATE: both rows are briefly active and the
-- cost is counted TWICE — wrong, but conservative, and immediately visible
-- as two same-description rows both badged "Activo" in the list the operator
-- is already looking at. THE VISIBLE FAILURE ALWAYS BEATS THE INVISIBLE ONE.
--
-- WHY THERE IS NO INDEX ON start_date
-- -------------------------------------------------------------------------
-- Deliberate inversion of 045:101-103's reasoning, and the inversion is the
-- point. `expenses` is indexed on `date` because every read of it is
-- date-ranged. Every read of THIS table is the opposite: the templates query
-- in use-orders-history.ts carries NO date filter, on purpose. A template
-- with start_date in 2024 and end_date IS NULL still contributes to this
-- month, so any gte("start_date", periodStart) would silently drop exactly
-- the long-running templates the feature exists for. Overlap is decided in
-- the pure function, never in SQL. An index on a column no query filters by
-- is write amplification plus a false signal about how the table is read.
--
-- WHY expenses.recurring_expense_id IS ON DELETE SET NULL (never CASCADE)
-- -------------------------------------------------------------------------
-- A logged payment is real money that left the business. Deleting a template
-- must NEVER delete it. CASCADE here would let one click erase expense
-- history that already moved a reported number. SET NULL degrades the row to
-- exactly what it was before this migration existed: a valid one-off expense
-- that no longer knows which template it satisfied.
-- The partial index below exists for THIS referential action — PG does not
-- auto-index FK columns, and SET NULL scans `expenses` on every template
-- delete. It is NOT for the "N de M pagos cargados" counter, which matches
-- in JS over the period's already-loaded expenses.
--
-- WHY THE DELETE WINDOW IS NOT AN RLS POLICY
-- -------------------------------------------------------------------------
-- Product rule: a template may be deleted only while start_date >= today in
-- AR time; once it has started, the only exit is end_date. That is enforced
-- in the app (the mutation refuses, and the UI omits the button entirely),
-- NOT by a FOR DELETE policy, because a policy would need its own
-- AT TIME ZONE 'America/Argentina/Buenos_Aires' derivation of "today" —
-- a SECOND definition, against the DB server clock, disagreeing with the
-- app's exactly at the boundary the rule is about. This table keeps the same
-- allow-all posture as every other table in this repo (045:108-110).
-- REVISIT IF a second client (mobile app, script, integration) ever writes
-- here — at that point the policy is worth its cost.
--
-- THIS HAS NOT BEEN RUN AGAINST ANY LIVE DATABASE
-- -------------------------------------------------
-- Same caveat as every prior migration in this repo. Apply to a
-- throwaway/dev clone first.
--
-- REVERSIBILITY
-- --------------
-- Purely additive: one new table plus one nullable column that starts NULL
-- on every existing row (catalog-only ALTER, no table rewrite, no backfill).
-- To roll back — ORDER MATTERS, the column's FK depends on the table:
--   DROP INDEX idx_expenses_recurring_expense_id;
--   ALTER TABLE expenses DROP COLUMN recurring_expense_id;
--   DROP TABLE recurring_expenses;
-- Dropping the column loses only the payment<->template link; the `expenses`
-- rows themselves are untouched.
--
-- ============================================================

-- ============================================================
-- 1. recurring_expenses — the templates
-- ============================================================

CREATE TABLE recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL for weekly/biweekly (informational cadence, no knowable amount).
  -- (10, 2) matching expenses.amount / external_income.amount — a transacted
  -- money amount, not a per-unit rate.
  amount DECIMAL(10, 2),
  -- Same five values as expenses.category, same CHECK-enum posture and the
  -- same reasoning (045:29-37). A template's category is what
  -- expensesByCategory buckets its prorated share into, so the two column
  -- domains MUST stay identical — a value here that `expenses` cannot hold
  -- would produce a category the UI has no card for.
  category TEXT NOT NULL CHECK (
    category IN ('supplies', 'services', 'salaries', 'rent', 'other')
  ),
  -- NOT NULL, unlike expenses.description (which is nullable). This string
  -- IDENTIFIES the template in the list, in the update dialog and in the
  -- "Cargar pago" prefill — an unnamed fixed cost is not usable. Note it is
  -- deliberately NOT a join key: the payment counter matches on
  -- expenses.recurring_expense_id, so renaming this never breaks anything.
  description TEXT NOT NULL,
  -- Generic across ALL categories: a weekly cleaning service is
  -- frequency='weekly', category='services'. No coupling to 'salaries'.
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (
    frequency IN ('weekly', 'biweekly', 'monthly')
  ),
  start_date DATE NOT NULL,
  -- INCLUSIVE last day the template applies. NULL = still active.
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- See "WHY amount IS NULLABLE, AND THE ONE-DIRECTIONAL CHECK ON IT".
  -- Monthly requires an amount; weekly/biweekly are NOT forbidden one.
  CONSTRAINT recurring_expenses_monthly_amount CHECK (
    frequency <> 'monthly' OR amount IS NOT NULL
  ),
  -- See "WHY end_date IS INCLUSIVE". A zero/negative-length window is a
  -- template that exists and charges nothing — a data-entry error, not a
  -- state worth representing. Also the reason the update dialog bounds its
  -- date picker to effectiveFrom > start_date.
  CONSTRAINT recurring_expenses_period_order CHECK (
    end_date IS NULL OR end_date >= start_date
  )
);

-- NO index on start_date — see "WHY THERE IS NO INDEX ON start_date" above.

ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

-- Same "allow all" internal-dashboard posture as every other table in this
-- repo (045:108-111). Deliberately NOT split into a narrowed FOR DELETE
-- policy — see "WHY THE DELETE WINDOW IS NOT AN RLS POLICY" above.
CREATE POLICY "Allow all operations on recurring_expenses" ON recurring_expenses FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 2. expenses — the link from a logged payment back to its template
-- ============================================================

-- Plain ADD COLUMN (never IF NOT EXISTS), matching 043:68-83's style.
-- Nullable with no default: catalog-only in PG 11+, no rewrite, and every
-- pre-existing row correctly reads "this payment is not linked to any
-- template" rather than needing a backfill.
ALTER TABLE expenses
  ADD COLUMN recurring_expense_id UUID REFERENCES recurring_expenses(id) ON DELETE SET NULL;

-- Partial: the vast majority of expense rows never carry this FK, so the
-- index stays small and ordinary one-off inserts don't pay for it. Exists
-- for the ON DELETE SET NULL scan, not for the payment counter — see the
-- header.
CREATE INDEX idx_expenses_recurring_expense_id
  ON expenses(recurring_expense_id)
  WHERE recurring_expense_id IS NOT NULL;
```

---

## Interfaces / Contracts

### `lib/utils/calendar-date.ts` — new (PR2)

```ts
/**
 * gastos-recurrentes, PR2. Pure calendar-date arithmetic: a "calendar date"
 * here is a Date pinned to UTC MIDNIGHT with no time-of-day component, and a
 * "date string" is "YYYY-MM-DD".
 *
 * WHY THIS MODULE EXISTS
 * -------------------------------------------------------------------------
 * lib/hooks/orders/use-orders-history.ts computes its period bounds as
 * AR-LOCAL INSTANTS: arDateToUTC (:17-23) bakes a +3h offset into the UTC
 * value, so "2026-01-31" becomes 2026-01-31T03:00:00Z. Feeding that into
 * day-boundary proration math off-by-ones the edges of a month — the single
 * highest technical risk in this change. Proration inputs must be pure
 * calendar dates; this module is the only place they are produced.
 *
 * Every function below is deterministic. The one crossing from "an instant
 * on a clock" into calendar-date space, arTodayStr, takes the clock as a
 * DEFAULTED PARAMETER precisely so it stays testable at the AR-offset
 * boundary (23:00 AR is already tomorrow in UTC).
 *
 * Deliberately NOT reusing arDateToUTC: that function's +3h is exactly what
 * this module exists to keep out of the math.
 */

/** "YYYY-MM-DD" -> UTC-midnight Date. Never `new Date(str)`: that constructor's
 *  timezone behaviour varies by engine and string form, which poisons day counts. */
export function parseCalendarDate(dateStr: string): Date;

/** UTC-midnight Date -> "YYYY-MM-DD". Inverse of parseCalendarDate. */
export function formatCalendarDate(date: Date): string;

/** Days in `month` of `year`. NOTE: `month` is 1-INDEXED (1 = January),
 *  unlike Date's own 0-indexed months — the implementation relies on that
 *  (`Date.UTC(year, month, 0)` = last day of the 1-indexed month). */
export function daysInMonth(year: number, month: number): number;

/** Calendar date `days` away from `date` (negative moves back). Safe as plain
 *  millisecond arithmetic because every value here is UTC-midnight and UTC has
 *  no DST — the same shift applied to a local-time Date would not be. */
export function addDays(date: Date, days: number): Date;

/** The calendar day before `dateStr`, as a string. THE close-and-replace
 *  helper: end_date is INCLUSIVE (scripts/047), so closing a row on the
 *  replacement's own start_date would charge that day twice. */
export function dayBefore(dateStr: string): string;

/** Today's calendar date in Argentina, as "YYYY-MM-DD". The single source of
 *  "today" for the delete window (a template is deletable only while
 *  start_date >= today) and for the expense dialog's default date. `now` is a
 *  parameter so tests can pin the AR-offset boundary; production never passes it. */
export function arTodayStr(now?: Date): string;
```

### `lib/services/recurring-expenses.ts` — new (PR2)

Pure, no React and no supabase imports — same posture as `lib/services/finance-summary.ts:1-8` and
`lib/services/recipe-cost.ts`. This becomes the repo's third tested pure module.

```ts
import type { Expense, ExpenseCategory, RecurringExpense } from "@/lib/types";
import { addDays, daysInMonth, formatCalendarDate, parseCalendarDate } from "@/lib/utils/calendar-date";

// ─── Proration (monthly templates) ─────────────────────────────────────────

/** One template's contribution on ONE calendar day. */
export interface DailyRecurringAllocation {
  date: string;               // YYYY-MM-DD — joins directly to dailyData[].date
  amount: number;             // template.amount / daysInMonth(THIS day's own month)
  category: ExpenseCategory;
  description: string;
  templateId: string;
}

/** One template's total contribution across the whole period. */
export interface RecurringExpenseAllocation {
  templateId: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
}

/**
 * THE PRIMITIVE. Walks every calendar day in the overlap between each
 * template's [start_date, end_date] lifetime (end_date INCLUSIVE, NULL =
 * open-ended) and [periodStart, periodEnd], emitting one row per day at
 * `amount / daysInMonth(that day's own month)`.
 *
 * NOT amount / days-in-period, and NOT a 30-day average: a template active
 * across January and February contributes 31 days at amount/31 plus the
 * February days at amount/28.
 *
 * ONLY `monthly` templates produce rows. weekly/biweekly are skipped
 * UNCONDITIONALLY — never by testing `amount != null`. See scripts/047's
 * header: the one-off `expenses` row is the source of truth for those
 * payments, so a template that both prorated AND had a logged payment would
 * double-count the same money. A stale amount on a weekly row must still
 * contribute zero.
 *
 * periodStart/periodEnd MUST be UTC-midnight calendar dates from
 * parseCalendarDate — never arDateToUTC's AR-offset instants.
 */
export function expandRecurringExpensesDaily(
  templates: RecurringExpense[],
  periodStart: Date,
  periodEnd: Date,
): DailyRecurringAllocation[];

/**
 * Per-template period totals, DERIVED by summing expandRecurringExpensesDaily's
 * output so the two can never disagree.
 *
 * Grouped by `templateId`, in first-seen order. NEVER by description or
 * category: two distinct templates can legitimately share both (two rent
 * lines for two locations), and merging them would erase the distinction the
 * "Fijos mensuales" list is built on.
 *
 * useOrdersAnalytics does NOT call this — it sums the daily primitive
 * directly (design D6). The consumer is the template list's per-template
 * "prorrateado este período" figure.
 */
export function expandRecurringExpenses(
  templates: RecurringExpense[],
  periodStart: Date,
  periodEnd: Date,
): RecurringExpenseAllocation[];

/** Sum of an allocation array's amounts. Exists so the hook and the tests
 *  agree on one reduction, and so `sum(daily) === sum(grouped)` is a
 *  one-line assertion. */
export function sumAllocations(allocations: { amount: number }[]): number;

// ─── Payday tracking (weekly/biweekly templates) ───────────────────────────
//
// Section boundary, not a file boundary — see design D3. The two halves are
// the two halves of ONE rule: a non-monthly template contributes exactly zero
// money AND is instead tracked by cadence. The unconditional skip above and
// isInformationalPaydayTemplate below must never drift apart.

export interface PaydayProgress {
  loaded: number;    // payments actually logged in the window
  expected: number;  // paydays the cadence grid lands on in the window
}

/**
 * An ACTIVE weekly/biweekly template: declares a cadence, generates no money.
 *
 * Deliberately does NOT check `amount == null` — expandRecurringExpensesDaily
 * already skips every non-monthly template regardless of amount, so a row
 * carrying a leftover amount cannot double-count either way. Gating here on
 * `amount == null` would only make such a row invisible, with no upside.
 */
export function isInformationalPaydayTemplate(template: RecurringExpense): boolean;

/**
 * Cadence grid dates inside [windowStart, windowEnd], both inclusive: every
 * `intervalDays` days from `startDate` as the anchor.
 *
 * MUST tolerate windowStart BEFORE the anchor (a template starting Aug 5
 * viewed through an Aug 1-31 window): clamp the first candidate to the anchor
 * itself, never assume daysSinceAnchor >= 0. Required test.
 */
export function previewPaydayDates(
  startDate: string,          // YYYY-MM-DD
  intervalDays: 7 | 15,
  windowStart: Date,
  windowEnd: Date,
): string[];

/**
 * "N de M pagos cargados" for ONE template inside a window.
 *
 * `loaded` counts expenses whose `recurring_expense_id === template.id`.
 * NEVER by description, NEVER filtered by category === "salaries": the FK
 * (scripts/047) replaces jebbs' description-string equality outright, so
 * renaming a template does not change its counter, and a weekly template in
 * ANY category is tracked.
 */
export function paydayProgressFor(
  template: RecurringExpense,
  expenses: Expense[] | undefined,
  windowStart: Date,
  windowEnd: Date,
): PaydayProgress;

/**
 * Sum of paydayProgressFor over every informational template. Returns null
 * when there are none, so the caller can tell "no cadence templates
 * configured" (hide the counter) apart from "configured, zero paydays this
 * window" (show "0 de 0").
 */
export function aggregatePaydayProgress(
  templates: RecurringExpense[] | undefined,
  expenses: Expense[] | undefined,
  windowStart: Date,
  windowEnd: Date,
): PaydayProgress | null;
```

**Two deliberate departures from jebbs' `lib/utils/expenses.ts`:**

| jebbs | here | why |
|---|---|---|
| `DailyRecurringAllocation.isProrated: boolean` (`:65`, always `true`) | dropped | A field that is always `true` is not information. Rule 3's "prorrateado" labelling is a property of *having come from a template*, which `templateId` already carries. |
| `RecurringExpenseAllocation` has no `templateId` (`:53-57`) | `templateId` added | The list needs "this template contributed X". Without the id the UI would re-join by description — the exact matching rule 13 forbids. |
| `monthWindowFor(dateStr)` (`:154-159`) | **not ported** | The payday window is the Gastos tab's already-derived month (`gastos-tab.tsx:45-58`'s `monthRange`), lifted to the parent and shared by both sub-tabs so "N de M" refers to the same month the list shows. Porting it would add a *third* month-boundary derivation to this repo. |

### `lib/types/index.ts` — additions (PR1)

Placed immediately after `Expense` (which ends at `:384`), inside the existing `// === EXPENSES ===`
section. No runtime exports are added — the file stays a pure type barrel.

```ts
export type RecurringExpenseFrequency = "weekly" | "biweekly" | "monthly";

/**
 * A fixed-cost TEMPLATE (scripts/047-recurring-expenses.sql). Never a money
 * movement by itself: `monthly` rows are prorated on read into
 * useOrdersAnalytics' expensesTotal; `weekly`/`biweekly` rows contribute
 * EXACTLY ZERO and only declare a payment cadence, whose real payments are
 * one-off `Expense` rows carrying `recurring_expense_id`.
 *
 * Has no supply_id/quantity ON PURPOSE — a recurring expense never touches
 * stock, not even with category "supplies". See 047's header.
 */
export interface RecurringExpense {
  id: string;
  /** NULL for weekly/biweekly. Required for monthly, enforced by 047's
   *  recurring_expenses_monthly_amount CHECK. Supabase may hand DECIMAL back
   *  as a string, so every read site coerces with Number() — same convention
   *  as orders.total_amount throughout use-orders-history.ts. */
  amount: number | null;
  category: ExpenseCategory;
  /** NOT NULL in the DB — identifies the template. Not a join key: the
   *  payment counter matches on recurring_expense_id, so renaming is safe. */
  description: string;
  frequency: RecurringExpenseFrequency;
  start_date: string;      // YYYY-MM-DD
  /** INCLUSIVE last day the template applies; null = still active. */
  end_date: string | null;
  created_at: string;
}
```

And, inside `Expense`, beside `supply_id`/`quantity` (`:381-382`):

```ts
  /**
   * Set by the "Cargar pago" flow when this expense satisfies a
   * weekly/biweekly template (scripts/047). ON DELETE SET NULL — deleting a
   * template NEVER deletes the payment. Read only by the
   * "N de M pagos cargados" counter, which matches on this id and never on
   * description or category.
   */
  recurring_expense_id: string | null;
```

### `lib/hooks/expenses/use-recurring-expenses.ts` — new (PR4)

```ts
/** Single, period-independent key. There is no date-ranged variant on
 *  purpose: rule 5 — the templates query carries NO date filter, ever. */
export function recurringExpensesQueryKey(): string[]; // ["recurring-expenses"]

/**
 * Invalidation companion. ["orders-analytics"] is NOT optional here: creating,
 * closing or deleting a template changes expensesTotal / netRevenue /
 * dailyData for every mounted period. ["expenses"] is deliberately NOT
 * invalidated — templates never create or modify expense rows.
 */
export function invalidateRecurringExpenseQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): void;

export function useRecurringExpenses(): UseQueryResult<RecurringExpense[]>;

export function useCreateRecurringExpense(): UseMutationResult<
  RecurringExpense,
  Error,
  {
    amount: number | null;          // null iff frequency !== "monthly"
    category: ExpenseCategory;
    description: string;
    frequency: RecurringExpenseFrequency;
    start_date: string;
  }
>;

/**
 * D3 of the proposal: an active template's amount is NEVER UPDATEd. Closes
 * the current row and inserts its replacement.
 *
 * ORDER IS LOAD-BEARING (design D9): INSERT the replacement FIRST, then
 * UPDATE the old row's end_date = dayBefore(effectiveFrom). A crash between
 * the two leaves two active rows (cost double-counted, conservative, and
 * VISIBLE as two "Activo" rows in the list) rather than a closed row with no
 * replacement (cost silently gone, profit optimistically overstated).
 *
 * `effectiveFrom` MUST be strictly after template.start_date — 047's
 * recurring_expenses_period_order CHECK rejects end_date < start_date. The
 * dialog bounds its date picker accordingly; a same-day correction on an
 * unstarted template is the delete path instead.
 */
export function useCloseAndReplaceRecurringExpense(): UseMutationResult<
  RecurringExpense,
  Error,
  { template: RecurringExpense; amount: number; effectiveFrom: string }
>;

/**
 * D4: allowed only while template.start_date >= arTodayStr(). The mutation
 * throws before issuing the DELETE if that does not hold — the UI omits the
 * button entirely (never a disabled button with a tooltip), so this guard is
 * the second layer, not the primary UX.
 *
 * The boundary is >= : a template starting TODAY is still deletable, even
 * though it already contributes today's slice. The day is in progress and no
 * closed period depends on it, and excluding today would defeat the
 * "I mistyped it ten seconds ago" case the rule exists for.
 */
export function useDeleteRecurringExpense(): UseMutationResult<void, Error, RecurringExpense>;
```

### `lib/hooks/expenses/use-expenses.ts` — modification (PR5)

`useCreateExpense`'s input (`:99-106`) gains one field. Nothing else in the file changes — the FK column
arrives in `useExpenses`' result automatically because it selects `*` (`:83`).

```ts
mutationFn: async (input: {
  date: string;
  amount: number;
  category: ExpenseCategory;
  description: string | null;
  supply_id: string | null;
  quantity: number | null;
  /** Set by "Cargar pago"; null for an ordinary one-off expense. Feeds the
   *  "N de M pagos cargados" counter. Never inferred from description. */
  recurring_expense_id: string | null;
}): Promise<CreateExpenseResult> => { … }
```

`invalidateExpenseQueries` already invalidates `["orders-analytics"]` (`:66`), which is what the counter
and the totals need. **No change to it.**

### `components/finanzas/expense-form-dialog.tsx` — prefill contract (PR5)

```ts
export interface ExpenseFormPrefill {
  /** The TEMPLATE's own category — never a hardcoded "salaries". */
  category: ExpenseCategory;
  /** The template's description, pre-filled and editable. */
  description: string;
  /** Written straight to expenses.recurring_expense_id. */
  recurringExpenseId: string;
}

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate: string;
  endDate: string;
  onCreated?: (result: CreateExpenseResult) => void;
  /**
   * Seeds the on-open reset (the effect at :88-96 — it is EXTENDED, never
   * fought with a second effect). `amount` is deliberately never prefilled.
   *
   * MUST be referentially stable — hold it in the caller's useState and set
   * it in the click handler. An inline object literal produces a new
   * reference every parent render and re-runs the reset WHILE THE OPERATOR IS
   * TYPING THE AMOUNT.
   */
  prefill?: ExpenseFormPrefill | null;
}
```

---

## Analytics integration — `lib/hooks/orders/use-orders-history.ts` (PR3)

All line numbers are the file's **current** state, verified this session.

**1. New import** beside `:6`'s `computeNetRevenue`:

```ts
import { parseCalendarDate } from "@/lib/utils/calendar-date";
import { expandRecurringExpensesDaily, sumAllocations } from "@/lib/services/recurring-expenses";
```

**2. Ninth query.** Add `{ data: recurringTemplates, error: e9 },` to the destructuring after `:160`
(`{ data: prevExpenses, error: e8 },`), and after the prev-expenses query at `:203-207`, inside the
`Promise.all([…])` that closes at `:208`:

```ts
        // gastos-recurrentes PR3 — NO DATE FILTER, on purpose (rule 5). A
        // template with start_date in 2024 and end_date IS NULL still
        // contributes to this month; any gte("start_date", …) would silently
        // drop exactly the long-running templates this feature exists for.
        // Overlap is decided inside expandRecurringExpensesDaily, never in
        // SQL. The table holds single-digit rows.
        supabase
          .from("recurring_expenses")
          .select("id, amount, category, description, frequency, start_date, end_date"),
```

Add `if (e9) throw e9;` after `:217`.

**3. One column added to an existing query.** `:199-202`'s current-period expenses select becomes
`.select("date, amount, category")` — `expensesByCategory` needs it. The **previous-period** query
(`:204-207`) stays `"date, amount"`: only its total is used.

**4. Calendar conversion (rule 6).** Insert immediately after the `if (e9) throw e9;` block, before
`:219`:

```ts
      // gastos-recurrentes PR3 — rule 6. start/end above are AR-LOCAL
      // INSTANTS (arDateToUTC :17-23 bakes +3h in). Proration walks day
      // boundaries, so it must receive pure UTC-midnight calendar dates or
      // every month edge is off by one day's rate.
      const periodStartCal = parseCalendarDate(startDateStr);
      const periodEndCal = parseCalendarDate(endDateStr);
      const prevPeriodStartCal = parseCalendarDate(prevStartDateStr);
      const prevPeriodEndCal = parseCalendarDate(prevEndDateStr);

      const templates = (recurringTemplates ?? []) as RecurringExpense[];
      // Computed ONCE and reused three times below (total, daily fold,
      // category split) — design D6. That is what makes
      // sum(dailyData[].expenses) === expensesTotal structural rather than
      // merely tested.
      const recurringAllocations = expandRecurringExpensesDaily(templates, periodStartCal, periodEndCal);
      const prevRecurringTotal = sumAllocations(
        expandRecurringExpensesDaily(templates, prevPeriodStartCal, prevPeriodEndCal),
      );
```

**5. Totals (`:239-242` replaced).** `computeNetRevenue`'s call at `:246-250` is **byte-identical** —
only the value of `expensesTotal` changes. That is the entire point of `finance-summary.ts` existing.

```ts
      const oneOffExpensesTotal =
        expenses?.reduce((acc, e) => acc + Number(e.amount), 0) || 0;
      const expensesTotal = oneOffExpensesTotal + sumAllocations(recurringAllocations);
      const prevOneOffExpensesTotal =
        prevExpenses?.reduce((acc, e) => acc + Number(e.amount), 0) || 0;
      // Rule 7: prorate the PREVIOUS period too, or the first period with
      // templates shows a phantom expensesChange/netRevenueChange spike.
      const prevExpensesTotal = prevOneOffExpensesTotal + prevRecurringTotal;
```

`:243-244`'s `commissionTotal` and `:332-336`'s `pct(...)` deltas are unchanged and now correct by
construction, because both sides of every comparison are prorated.

**6. Category split.** New block after the totals, before `:252`'s `msPerDay`:

```ts
      // gastos-recurrentes PR3 (rule 9 / D7) — computed ONCE here, from BOTH
      // sources, and returned. resumen-tab.tsx and gastos-tab.tsx read this
      // instead of each running their own useExpenses + reduce; that
      // duplication is why the category cards were one arithmetic change away
      // from disagreeing with the Gastos tile above them.
      // Object literal, not Object.fromEntries: TS checks all five keys
      // against ExpenseCategory here, so a sixth category is a compile error
      // at this line.
      const expensesByCategory: Record<ExpenseCategory, number> = {
        supplies: 0, services: 0, salaries: 0, rent: 0, other: 0,
      };
      for (const e of expenses ?? []) {
        expensesByCategory[e.category as ExpenseCategory] += Number(e.amount);
      }
      for (const allocation of recurringAllocations) {
        expensesByCategory[allocation.category] += allocation.amount;
      }
```

**7. Daily fold.** Immediately after the one-off loop at `:292-296`, before the gap-fill at `:298`:

```ts
      // Rule 8: the per-day allocations must land in dailyData too, not just
      // in the aggregate, or Resumen's "Ingresos vs. gastos por día" chart
      // (resumen-tab.tsx:347-418) silently disagrees with the Gastos tile
      // directly above it. Keys align exactly: allocation.date is
      // formatCalendarDate over [startDateStr, endDateStr], and the gap-fill
      // loop below walks the same string range via toArDateStr.
      for (const allocation of recurringAllocations) {
        const key = allocation.date;
        if (!dailyMap[key]) dailyMap[key] = { orders: 0, revenue: 0, canceled: 0, expenses: 0 };
        dailyMap[key].expenses += allocation.amount;
      }
```

**8. Return shape.** One field added to the object at `:315-337`, beside `...netRevenueResult`:

```ts
        expensesByCategory,
```

No signature change — `/rendimiento`'s existing `useOrdersAnalytics` call site keeps working and simply
gains a field it does not read.

---

## Data Flow — "Cargar pago" (PR5)

```
RecurringExpenseList  (template: weekly/biweekly, "2 de 4 pagos cargados")
        │  click "Cargar pago"
        ▼
GastosTab: setPrefill({ category, description, recurringExpenseId })   ← stable ref (D8)
           setFormOpen(true)
        ▼
ExpenseFormDialog  ── on-open reset seeds from prefill (:88-96 extended)
        │              date = arTodayStr(), amount = "" (operator types it)
        ▼
useCreateExpense.mutationFn ── INSERT expenses { …, recurring_expense_id }
        │                       (supply_id/quantity null ⇒ no stock path at all)
        ▼
invalidateExpenseQueries(qc, { touchedStock: false })
        ├─▶ ["expenses"]          ⇒ the counter's source refetches
        └─▶ ["orders-analytics"]  ⇒ Resumen totals refetch
        ▼
GastosTab onCreated: setSubTab("periodo")  ⇒ the saved payment is visible where it landed
```

`["recurring-expenses"]` is deliberately **not** invalidated: logging a payment does not change any
template row. The counter recomputes because its `expenses` input changed.

---

## File Changes

### PR1 — schema + types (~200 lines, nothing reads it)

| File | Action | Detail |
|---|---|---|
| `scripts/047-recurring-expenses.sql` | Create | Full DDL above. Table + 2 CHECKs + RLS + policy, then `ALTER TABLE expenses ADD COLUMN` + partial index. One file (D1). |
| `lib/types/index.ts` | Modify | Add `RecurringExpenseFrequency` + `RecurringExpense` after `Expense` (`:384`); add `recurring_expense_id: string | null` inside `Expense` beside `supply_id`/`quantity` (`:381-382`). |

Nothing else. `useExpenses`' `select("*")` starts returning the new column immediately, typed, unread.

### PR2 — pure logic, strict TDD (~420 lines, logic only, no hooks/UI)

| File | Action | Detail |
|---|---|---|
| `lib/utils/calendar-date.ts` | Create | 6 exports (D5). ~90 lines with the header. |
| `lib/utils/calendar-date.test.ts` | Create | See Testing Strategy. Picked up by vitest's default glob — no config change. |
| `lib/services/recurring-expenses.ts` | Create | Two banner-delimited sections (D3): proration + payday. ~230 lines. |
| `lib/services/recurring-expenses.test.ts` | Create | See Testing Strategy. Two top-level `describe`s mirroring the sections. |

Zero callers. Fully revertible with no schema or UI consequence.

### PR3 — analytics fold-in + `expensesByCategory` (~280 lines, numerically inert)

| File | Action | Detail |
|---|---|---|
| `lib/hooks/orders/use-orders-history.ts` | Modify | The 8 edits above: 2 imports; `e9` slot at `:160` + unfiltered templates query before `:208` + `if (e9) throw e9` after `:217`; `category` added to `:199-202`; calendar conversion + single `recurringAllocations` array before `:219`; totals at `:239-242`; `expensesByCategory` block; daily fold after `:296`; one return field at `:315-337`. |
| `components/finanzas/resumen-tab.tsx` | Modify | **Delete** the `useExpenses` import (`:29`), the date-string IIFE (`:99-121`), the `useExpenses` call (`:123`), the `totalsByCategory` IIFE (`:125-134`), and the `expensesLoading` skeleton branch (`:321-327` → `isLoading`). Category cards (`:329-341`) read `analytics?.expensesByCategory?.[category] ?? 0`. `ALL_CATEGORIES` (`:46`) stays — it is render *order*, not aggregation. Update the doc comment at `:74-79`, which currently documents the local reduce as deliberate. |
| `components/finanzas/gastos-tab.tsx` | Modify | **Delete** `totalsByCategory` (`:92-101`) and the now-unused `useMemo` import (`:3`). Mount `useOrdersAnalytics(anchorDate, "month")` — the same month the tab already navigates — and read `expensesByCategory` from it (`:163-174`). |

**Ships before any template can exist**, so with zero rows every figure is provably byte-identical to
today — the safest possible landing point for the arithmetic change (and the reason D7's component
migration rides along instead of being deferred).

### PR4 — "Fijos mensuales" sub-tab (~400 lines; first PR where a template can exist)

| File | Action | Detail |
|---|---|---|
| `lib/hooks/expenses/use-recurring-expenses.ts` | Create | The 5 exports above. Delete guard uses `arTodayStr()`. Close-and-replace uses `dayBefore()` and D9's INSERT-then-UPDATE order, with the failure table in the doc comment. |
| `components/finanzas/recurring-expense-list.tsx` | Create | Row: description, category badge, frequency badge, Activo / "Cerrado el {end_date}" badge, "Desde {start_date}", and either "{amount}/mes · {prorated} en este período" (monthly, per `expandRecurringExpenses`) or the `previewPaydayDates` preview text (cadence). Delete button rendered **only** when `start_date >= arTodayStr()` — absent, not disabled (D4). |
| `components/finanzas/recurring-expense-form-dialog.tsx` | Create | Category, description, frequency `Select` **always visible** (D6 — no salaries gate, no forced reset to monthly on category change), amount **only when `frequency === "monthly"`** and then required (rule 11, mirroring 047's CHECK client-side), start date. |
| `components/finanzas/recurring-expense-update-dialog.tsx` | Create | New amount + effective-from date, picker bounded to `> template.start_date` (D10). Copy states the day-before semantics and points same-day corrections at delete. |
| `components/finanzas/gastos-tab.tsx` | Modify | Nested `Tabs`: "Del período" (existing body) / "Fijos mensuales". `anchorDate`/`start`/`end` lift above the sub-tabs so both share one period. Top-level `?tab=` stays a 4-value union — `finanzas-tabs.tsx:10` is **not** touched. |

### PR5 — "Cargar pago" + payday counter (~240 lines; depends on 1, 2 and 4)

| File | Action | Detail |
|---|---|---|
| `components/finanzas/expense-form-dialog.tsx` | Modify | Add `prefill` prop + `recurringExpenseId` state; extend the reset at `:88-96` (D8); pass the FK in `handleSave` (`:126-133`). **Delete the local `todayArStr` (`:32-34`)** and import `arTodayStr` from `@/lib/utils/calendar-date` — rule 12's "same AR-calendar source" becomes literal. |
| `lib/hooks/expenses/use-expenses.ts` | Modify | One field on `useCreateExpense`'s input (`:99-106`). Nothing else. |
| `components/finanzas/recurring-expense-list.tsx` | Modify | "Cargar pago" button on informational templates + the "N de M pagos cargados" line from `paydayProgressFor`, fed by the sub-tab's shared `useExpenses(start, end)`. |
| `components/finanzas/gastos-tab.tsx` | Modify | `prefill` state (stable ref), `onCreated` → `setSubTab("periodo")`, clear prefill on close. |

**Totals**: 7 created, 6 modified (2 of them twice, in different PRs), 0 deleted.
`lib/services/finance-summary.ts`, `scripts/045`, `scripts/046`, `components/finanzas/finanzas-tabs.tsx`
and `components/finanzas/expense-list.tsx` are **explicitly untouched**.

---

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (PR2) | `parseCalendarDate` / `formatCalendarDate` | vitest. Round-trip for `"2026-01-31"`, `"2026-02-28"`, `"2024-02-29"`; asserts `getUTCHours() === 0` (the whole point — no `+3h`); `formatCalendarDate(parseCalendarDate(s)) === s` for a month-edge table. |
| Unit (PR2) | `daysInMonth` | Jan 31, Feb 28, **Feb 2024 = 29**, Apr 30, Dec 31. Explicit 1-indexed-month assertion so the `Date.UTC(y, m, 0)` trick can't be "fixed" into an off-by-one. |
| Unit (PR2) | `addDays` / `dayBefore` | `dayBefore("2026-03-01") === "2026-02-28"`; `dayBefore("2024-03-01") === "2024-02-29"`; `dayBefore("2026-01-01") === "2025-12-31"`. Month/year/leap boundaries — the close-and-replace double-charge guard. |
| Unit (PR2) | `arTodayStr` | `arTodayStr(new Date("2026-09-10T02:00:00Z")) === "2026-09-09"` (23:00 AR is already tomorrow in UTC) and `…T03:00:00Z" ) === "2026-09-10"`. The rule-12 boundary. |
| Unit (PR2) | Cross-month proration (rule 2) | A `monthly` 3100 template over `2026-01-25 … 2026-02-05`: 7 days at 100 + 5 days at 3100/28. **Not** `amount/days-in-period`. |
| Unit (PR2) | Non-monthly contributes zero (rule 1) | A `weekly` template **with a non-null amount** inside the period ⇒ `[]`. Same for `biweekly`. The regression guard against "simplifying" the unconditional skip into `amount != null`. |
| Unit (PR2) | daily ≡ grouped | `sumAllocations(expandRecurringExpensesDaily(...)) === sumAllocations(expandRecurringExpenses(...))` within `1e-9`. **Never `toBe`** — `amount/31` summed 31 times is not exactly `amount`. |
| Unit (PR2) | `end_date` inclusive (rule 4) | A template closed on the 15th contributes the 15th and not the 16th; and `close(end = dayBefore(newStart))` + `newTemplate(start = newStart)` charges the boundary day **exactly once**. |
| Unit (PR2) | Period/lifetime disjoint | Template entirely before/after the period ⇒ `[]`. No zero-amount rows, no category entry. |
| Unit (PR2) | Grouping key | Two templates sharing description **and** category ⇒ **two** rows from `expandRecurringExpenses`, distinguished by `templateId` (rule 13's posture at the service level). |
| Unit (PR2) | Payday window before anchor | Template `start_date = 2026-08-05`, window `2026-08-01 … 2026-08-31`, interval 7 ⇒ `["2026-08-05","08-12","08-19","08-26"]`. Clamped, never negative-`k`. |
| Unit (PR2) | `paydayProgressFor` matches by FK | Expenses with the right `recurring_expense_id` but category `"services"` **count**; an expense with the same *description* but a null/other FK **does not**. Both directions asserted — this is D5+D6's whole payoff. |
| Unit (PR2) | `aggregatePaydayProgress` null case | No informational templates ⇒ `null` (hide), not `{0,0}` (show "0 de 0"). |
| Unit (PR2) | `computeNetRevenue` regression (rule 10) | `computeNetRevenue({ totalRevenue: 1000, expensesTotal: 300 + 100 /* prorated */, commissionTotalInformational: 150 })` ⇒ `netRevenue === 600`, **not 450**. Commission never an operand even with recurring money present. |
| Types | Whole chain | `npx tsc --noEmit` in **every** PR — `next.config.mjs`'s `ignoreBuildErrors: true` means a green `next build` proves nothing. |
| Lint | Whole chain | `pnpm lint` (`package.json:8`). Watch `react-hooks/exhaustive-deps` on the D8 effect. |
| Manual — zero templates (PR3) | The safety proof | Before creating any template: every Resumen and Gastos figure identical to pre-PR3, category cards sum to the Gastos tile, daily bars unchanged. |
| Manual — the headline check (PR4) | Proration is visible and correct | 300.000 monthly rent starting the 1st, viewed in a 30-day month: Gastos includes 300.000. Switch to **week** view: it includes 70.000. Category cards still sum to the tile. |
| Manual — chart vs. tile (PR4) | Rule 8 | With a template active, the daily bars' expense values visually sum to the Gastos tile; spot-check three days at `amount/daysInMonth`. |
| Manual — no phantom spike (PR4) | Rule 7 | Create a template with a `start_date` two months back; `expensesChange` reflects a real change, not a first-render jump from 0. |
| Manual — close-and-replace (PR4) | D3 + rule 4 | Change an amount effective the 16th ⇒ old row `end_date = 15`, new row `start_date = 16`, the 16th charged **once**, and the **previous month's reported total does not move**. |
| Manual — delete window (PR4) | D4 boundary | Template with `start_date = today` ⇒ delete button present and works. Template with `start_date = yesterday` ⇒ **no button at all** (not a disabled one). |
| Manual — prefill survival (PR5) | D8's trap | "Cargar pago", type an amount, then trigger a parent re-render (switch sub-tabs behind the dialog / resize). **The typed amount must survive.** If it clears, `prefill` is being passed as an inline literal. |
| Manual — FK counter (PR5) | Rules 13 + 14 | Log a payment ⇒ counter goes "1 de 4". **Rename the template's description ⇒ counter unchanged.** Delete a deletable template ⇒ its logged expense still exists, with `recurring_expense_id` NULL. |
| Manual — stock isolation (PR5) | D2 of the proposal | Create a `supplies`-category monthly template and log a payment through "Cargar pago": `supplies.stock_quantity` **does not move**, and `expense_stock_movements` gets no row. |

No E2E layer — this repo has no browser-test infrastructure, and adding Playwright is far outside this
change's scope.

---

## Migration / Rollout

Five sequential PRs. `047` must be applied to the target environment **before PR3's code deploys** —
PR3's `queryFn` selects from `recurring_expenses` unconditionally, so a missing table breaks
`useOrdersAnalytics` on `/finanzas` *and* `/rendimiento`. `047` has not been run against any live
database; apply it to a throwaway/dev clone first, per this repo's standing caveat.

Ordering constraints: **PR2 requires PR1** (types). **PR3 requires PR1 + PR2**. **PR4 requires PR2 + PR3**
(a template must not be creatable before the read path handles it). **PR5 requires PR1, PR2 and PR4**.
The chain is strictly linear — `feature-branch-chain` keeps each child diff clean, since PR3 and PR4
both touch `gastos-tab.tsx`.

**Revert asymmetry, called out because it is the one non-obvious rollback**: reverting **PR4 alone**
leaves already-created template rows in the database, still prorating into `expensesTotal`, with no UI
that explains where the money is coming from. If PR3 and PR4 are both live, revert them **together**, or
neither. PR1, PR2, PR3 and PR5 are each independently revertible; `recurring_expense_id` values already
written are inert read-only metadata after a PR5 revert.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **AR-offset instants reach the proration math** (rule 6) — every month edge off by one day's rate | High | `calendar-date.ts` exists solely for this; the conversion is four named `…Cal` locals at one point in the `queryFn`; month-edge and cross-month tests; `arDateToUTC` is explicitly documented as the thing not to reuse. |
| **Commission double-subtraction reintroduced** while editing the surrounding lines | High | `computeNetRevenue`'s call site (`:246-250`) is byte-identical in the diff; the rule-10 regression test runs with a non-zero prorated total; `finance-summary.ts` is in the untouched list. |
| **Category cards disagree with the Gastos tile** | High if D7 slipped | D7: both components migrate in PR3, the same PR that changes the arithmetic. Merge gate, not follow-up. |
| **Daily bars don't sum to the tile** (rule 8) | Medium | D6 makes it structural (one allocations array), not merely tested. Plus the tolerance-based identity test and a manual spot-check. |
| **Prefill silently wiped by the on-open reset** | Medium | D8: the reset is extended, not fought; the stable-reference requirement is in the prop's JSDoc, in the PR5 file table, and has its own manual QA row. |
| **Close-and-replace crash leaves a gap or an overlap** | Medium | D9's INSERT-first ordering makes the surviving failure the visible, conservative one; the `047` header and the hook doc carry the table. No transaction is available and none is faked. |
| **`047` applied after PR3 deploys** ⇒ analytics 500s on two routes | Medium | Called out in Rollout as an explicit gate; PR3's description must state it. |
| **A future "simplification" of the unconditional non-monthly skip into `amount != null`** ⇒ weekly templates double-count | Medium | Deliberate absence of a schema CHECK forbidding the amount (D10), the stale-amount test, and the reason written in both the DDL header and the function's doc comment. |
| **Operator reads a prorated week as a partial payment** ("why is rent only $70.000?") | Medium | Rule 3: the template list shows both "{amount}/mes" and "{prorated} en este período"; Resumen labels prorated money explicitly. |
| **PR4 exceeds the 400-line budget** | Medium | Estimated ~400 with four new files. If it overruns, `recurring-expense-update-dialog.tsx` (close-and-replace) splits cleanly into a PR4b — it depends only on the hook, not on the list's layout. |
| **Extra query on every analytics read** | Low | One unfiltered select on a table that will hold single-digit rows for years, inside the existing `Promise.all`. No added round trip. |

## Open Questions

None blocking. All four of the proposal's open design questions are resolved above (D1, D2, D3, D4).

Two items recorded as **follow-ups**, deliberately out of this change and written into the code where
someone would look for them:

- [ ] **A `FOR DELETE` RLS policy for the delete window** — revisit if a second client ever writes to
      `recurring_expenses`. Trigger condition is named in `047`'s header (D2).
- [ ] **Splitting the payday section into `lib/services/payday-progress.ts`** — trigger conditions
      (module past ~400 lines, or a third consumer needing payday tracking without proration) are
      written into the module header (D3).
