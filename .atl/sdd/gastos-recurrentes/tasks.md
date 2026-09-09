# Tasks: gastos-recurrentes — Recurring expense templates with on-read proration

Derived from the approved spec (`.atl/sdd/gastos-recurrentes/spec.md`) and design
(`.atl/sdd/gastos-recurrentes/design.md`). PR boundaries are taken from design's own staging (D1's
one-migration PR1, PR2's strict-TDD logic pair, PR3's numerically-inert fold-in, PR4's sub-tab, PR5's
"Cargar pago"), broken into ordered, checkable tasks at the rigor bar of
`.atl/sdd/finanzas-gastos-recetas/tasks.md`.

> **Size note**: this document deliberately exceeds the generic sdd-tasks word budget, mirroring
> design.md's own override note. The requester explicitly asked for the same rigor as
> `finanzas-gastos-recetas/tasks.md` (85-task, per-PR-QA doc) — explicit instruction wins over the
> generic budget.

## Review Workload Forecast

| PR | Scope | Est. changed lines (design's own estimate) | 400-line risk |
|----|-------|--------------------:|---------------|
| PR1 | Schema (`047`) + types | ~200 | Low |
| PR2 | `calendar-date.ts` + `recurring-expenses.ts` + both `.test.ts`, strict TDD | ~420 | **High — design's own file table already puts this over budget** |
| PR3 | Analytics fold-in + `expensesByCategory` + `resumen-tab`/`gastos-tab` migration | ~280 | Low |
| PR4 | `use-recurring-expenses.ts` + "Fijos mensuales" sub-tab (list, create, update/close-and-replace, delete) | ~400 | **Medium-High — sits exactly at the edge; design's own Risks table already flags this and names a mitigation** |
| PR5 | "Cargar pago" prefill + FK write + payday counter | ~240 | Low |
| **Total** | | **~1540** | |

Decision needed before apply: Resolved — split chosen (see below)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main (commit sequentially onto `port/jebbs-style-refactor`, verify each before the next, no separate branches/pushes — same pattern used for `finanzas-gastos-recetas`)
400-line budget risk: High, mitigated by the PR2a/2b and PR4a/4b split below

**PR2 (~420 lines) — flagged, per the launch instructions.** The proposal estimated ~400; design's
detailed file table (`calendar-date.ts` ~90 + its test file + `recurring-expenses.ts` ~230 + its test
file) lands at ~420 once the header comments and the full test matrix (16 RED cases across both
modules) are counted. This is exactly the case the launch prompt called out: design added detail the
proposal didn't have. Two paths, both compatible with the tasks below:
- **Accept the overrun as `size:exception`** — the proposal's own staging rationale is that this PR is
  "logic only, deliberately isolated... it deserves review attention a UI diff would drown," which
  argues for one focused review pass rather than a split.
- **Split into PR2a (`calendar-date.ts` + test, ~150 lines) → PR2b (`recurring-expenses.ts` + test,
  depends on PR2a, ~270 lines)** — clean seam, since `recurring-expenses.ts` imports from
  `calendar-date.ts` and nothing imports the reverse. Phase 2 below is already ordered so this split is
  free if chosen (2.1–2.6 vs. 2.7–2.20).

**PR4 (~400 lines) — flagged, per design's own Risks table** ("PR4 exceeds the 400-line budget" —
Medium severity, mitigation already named: `recurring-expense-update-dialog.tsx` "splits cleanly into a
PR4b — it depends only on the hook, not on the list's layout"). Phase 4 below is ordered so that split
is free too: **PR4a (4.1, 4.2, 4.4, 4.5, 4.7, 4.8 — hook list/create/delete, list UI, create dialog, tab
wiring) → PR4b (4.3, 4.6 — close-and-replace hook + update dialog, depends on PR4a)**.

Decision needed before apply (`sdd-apply`): whether to accept `size:exception` on PR2/PR4 as staged, or
apply the PR2a/2b and PR4a/4b splits above. Not decided here — the launch instructions gave no
`delivery_strategy`/`chain_strategy` to this run.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `scripts/047-recurring-expenses.sql` + `lib/types` additions | PR1 | Base: main. Additive only, nothing reads it yet. |
| 2 | `lib/utils/calendar-date.ts` + `lib/services/recurring-expenses.ts`, both with `.test.ts`, strict TDD | PR2 (optionally 2a/2b) | Base: PR1 (needs `RecurringExpense`/`Expense` types). Logic only — no hooks, no UI, no supabase. |
| 3 | `useOrdersAnalytics` fold-in + `expensesByCategory` + `resumen-tab`/`gastos-tab` migration | PR3 | Base: PR2. Numerically a no-op — zero templates exist yet. |
| 4 | `use-recurring-expenses.ts` + "Fijos mensuales" sub-tab | PR4 (optionally 4a/4b) | Base: PR3 (D9/D10 need the read path already handling templates before one can be created). |
| 5 | "Cargar pago" prefill + FK write + payday counter | PR5 | Base: PR4 (or PR4b). Depends on PR1 (FK column), PR2 (payday grid), PR4 (sub-tab, list component). |

---

## Phase 1 (PR1): Schema + types (~200 lines, nothing reads it)

- [x] 1.1 `[migration,medium]` Create `scripts/047-recurring-expenses.sql` — `CREATE TABLE
      recurring_expenses` (no `supply_id`/`quantity` columns — D2, unrepresentable by omission),
      `category` CHECK (same 5 values as `expenses`), `recurring_expenses_monthly_amount` CHECK
      (`frequency <> 'monthly' OR amount IS NOT NULL`), `recurring_expenses_period_order` CHECK
      (`end_date IS NULL OR end_date >= start_date`), RLS enabled with the same allow-all `FOR ALL`
      policy (D2 — no narrowed `FOR DELETE`), no index on `start_date` (D11); then `ALTER TABLE
      expenses ADD COLUMN recurring_expense_id UUID REFERENCES recurring_expenses(id) ON DELETE SET
      NULL` + the partial index `idx_expenses_recurring_expense_id ... WHERE recurring_expense_id IS
      NOT NULL` (D11), all in this one file per D1's ordering. Copy the full WHY-banner header
      **verbatim** from design.md (WHAT THIS FILE IS / WHY NO supply_id-quantity / WHY amount IS
      NULLABLE / WHY end_date IS INCLUSIVE / WRITE ORDERING FOR CLOSE-AND-REPLACE / WHY NO INDEX ON
      start_date / WHY ON DELETE SET NULL / WHY NOT AN RLS POLICY / REVERSIBILITY). *(spec:
      recurring-expense-templates — no supply_id/quantity, 5-value category CHECK, monthly-requires-
      amount CHECK, end_date>=start_date CHECK, ON DELETE SET NULL never CASCADE)*
- [x] 1.2 `[types,small]` Modify `lib/types/index.ts` — add `RecurringExpenseFrequency` type +
      `RecurringExpense` interface immediately after `Expense` (`:384`), inside the `// === EXPENSES
      ===` section (JSDoc per design: no `supply_id`/`quantity` on purpose; `amount` coerced with
      `Number()` at every read site, same convention as `orders.total_amount`); add `recurring_expense_id:
      string | null` inside `Expense`, beside `supply_id`/`quantity` (`:381-382`). No runtime exports —
      file stays a pure type barrel.
- [x] 1.3 `[gate,small]` Run `npx tsc --noEmit` — MANDATORY (`next.config.mjs`'s
      `ignoreBuildErrors: true` means a green `next build` proves nothing about types).

### Manual QA — Phase 1 (DB-constraint behavior; not vitest-testable)

- [ ] QA1.1 Apply `047` to a throwaway/dev clone (never a live DB — house caveat). Confirm: invalid
      `category` rejected; `monthly` template with `amount = NULL` rejected; `end_date < start_date`
      rejected; a `weekly` template WITH a non-null `amount` is accepted (D10 — deliberately not
      forbidden at the schema).
- [ ] QA1.2 Confirm no `supply_id`/`quantity` column exists on `recurring_expenses` for any category,
      including `supplies` (D2).
- [ ] QA1.3 Confirm `expenses.recurring_expense_id` is nullable, FK-constrained, `ON DELETE SET NULL`
      (verify via `information_schema`, not by deleting a template yet — no template can exist until
      PR4).
- [ ] QA1.4 Rehearse the rollback order on the dev clone: drop the partial index, drop the column, drop
      the table — confirm it succeeds in that order and fails if attempted out of order.

---

## Phase 2 (PR2, strict TDD): `calendar-date.ts` + `recurring-expenses.ts` (~420 lines — see Review
Workload Forecast for the over-budget flag and optional 2a/2b split)

Strict TDD applies to this entire phase — it is the highest-risk unit in the change (rule 6: AR-offset
instants must never reach day-boundary proration math). RED tasks are failing-test additions; one GREEN
task per module makes its RED set pass; REFACTOR cleans up without changing outcomes.

### 2a — `lib/utils/calendar-date.ts` (independently shippable as PR2a if the split is chosen)

- [x] 2.1 RED `[test,small]` Add to `lib/utils/calendar-date.test.ts`: `parseCalendarDate` /
      `formatCalendarDate` round-trip for `"2026-01-31"`, `"2026-02-28"`, `"2024-02-29"` (leap year);
      assert `parseCalendarDate(...).getUTCHours() === 0` (the whole point — no `+3h` baked in).
- [x] 2.2 RED `[test,small]` Add test case: `daysInMonth` for Jan(31)/Feb(28)/**Feb 2024(29, leap)**/
      Apr(30)/Dec(31), explicit 1-indexed-month assertion (`daysInMonth(2026, 1) === 31`, not
      0-indexed).
- [x] 2.3 RED `[test,small]` Add test case: `dayBefore("2026-03-01") === "2026-02-28"`;
      `dayBefore("2024-03-01") === "2024-02-29"` (leap); `dayBefore("2026-01-01") === "2025-12-31"`
      (year boundary) — the close-and-replace double-charge guard.
- [x] 2.4 RED `[test,small]` Add test case: `arTodayStr(new Date("2026-09-10T02:00:00Z")) ===
      "2026-09-09"` and `arTodayStr(new Date("2026-09-10T03:00:00Z")) === "2026-09-10"` — the exact
      rule-12 AR-offset boundary (23:00 AR is already tomorrow in UTC).
- [x] 2.5 GREEN `[pure,medium]` Implement `lib/utils/calendar-date.ts` (D5) — `parseCalendarDate`,
      `formatCalendarDate`, `daysInMonth`, `addDays`, `dayBefore`, `arTodayStr(now?: Date)` (clock
      parameterized as a default arg for testability). Make 2.1–2.4 pass. Deliberately does NOT reuse
      `arDateToUTC` (`use-orders-history.ts:17-23`) — that function's `+3h` is exactly what this module
      exists to keep out of the math.
- [x] 2.6 REFACTOR `[pure,small]` Clean up naming/structure without changing test outcomes; re-run
      `npx vitest run` to confirm still fully green.

### 2b — `lib/services/recurring-expenses.ts` (depends on 2a; independently shippable as PR2b)

- [x] 2.7 RED `[test,small]` Add to `lib/services/recurring-expenses.test.ts`: **cross-month proration
      (rule 2)** — monthly template `amount = 31000` active `2026-01-15..2026-02-15`: 17 January days
      at `31000/31 = 1000` (sum `17000`) + 15 February days at `31000/28 ≈ 1107.14` (sum `≈16607.14`),
      total `≈33607.14`. NOT `amount/days-in-period`, NOT a flat monthly figure applied to both months.
- [x] 2.8 RED `[test,small]` Add test case: **non-monthly templates contribute exactly zero,
      unconditionally, even with a non-null `amount` (rule 1)** — a `weekly` template AND a `biweekly`
      template, both with `amount` set, each produce `[]` from `expandRecurringExpensesDaily`. This is
      the regression guard against "simplifying" the unconditional skip into an `amount != null` check.
- [x] 2.9 RED `[test,small]` Add test case: **`sum(expandRecurringExpensesDaily(...)) ≈
      sum(expandRecurringExpenses(...))` within `1e-9` tolerance, asserted with a tolerance comparison,
      NEVER `toBe`** — a 31-day-month template's `amount/31` summed 31 times does not equal `amount`
      exactly under float arithmetic.
- [x] 2.10 RED `[test,small]` Add test case: **`end_date` inclusive + close-and-replace boundary (rule
      4)** — a template closed on the 15th contributes the 15th and NOT the 16th; separately, closing a
      template with `end_date = dayBefore(newStart)` and inserting a replacement with
      `start_date = newStart` charges the boundary day exactly once (not zero, not twice).
- [x] 2.11 RED `[test,small]` Add test case: a template entirely outside the requested period produces
      `[]` — no zero-amount rows, no category entry.
- [x] 2.12 RED `[test,small]` Add test case: `expandRecurringExpenses` groups **by `templateId`, never
      by description or category** — two templates sharing both description AND category produce TWO
      distinct rows.
- [x] 2.13 RED `[test,small]` Add test case: **payday window starting before the template's anchor is
      clamped, never negative (edge case)** — template `start_date = 2026-08-05`, window
      `2026-08-01..2026-08-31`, `intervalDays = 7` → `["2026-08-05", "2026-08-12", "2026-08-19",
      "2026-08-26"]`, no date before the anchor, no negative `daysSinceAnchor`.
- [x] 2.14 RED `[test,small]` Add test case: **`paydayProgressFor` matches by `recurring_expense_id`
      ONLY (rule 13, D5/D6)** — an expense with the correct FK but `category: "services"` (not
      `"salaries"`) counts; a separate expense with the SAME description but a different/null FK does
      NOT count. Both directions asserted in one test.
- [x] 2.15 RED `[test,small]` Add test case: `aggregatePaydayProgress` returns `null` (not `{loaded: 0,
      expected: 0}`) when zero informational templates exist — lets the caller distinguish "hide the
      counter" from "show 0 de 0".
- [x] 2.16 RED `[test,small]` Add to `lib/services/finance-summary.test.ts` (existing file, not new):
      **`computeNetRevenue` regression with prorated money folded into `expensesTotal` (rule 10,
      MANDATORY highest-stakes scenario)** — `totalRevenue: 1000`, `expensesTotal: 300 + 100
      /* prorated */ = 400`, `commissionTotalInformational: 150` → `netRevenue === 600`, explicitly NOT
      `450`. Proves commission is never an operand even once part of `expensesTotal` is recurring money.
- [x] 2.17 GREEN `[pure,large]` Implement `lib/services/recurring-expenses.ts` (D3 — two
      banner-delimited sections: `// ─── Proration (monthly templates) ───` and
      `// ─── Payday tracking (weekly/biweekly templates) ───`) — `DailyRecurringAllocation`,
      `RecurringExpenseAllocation`, `expandRecurringExpensesDaily`, `expandRecurringExpenses`,
      `sumAllocations`, `PaydayProgress`, `isInformationalPaydayTemplate`, `previewPaydayDates`,
      `paydayProgressFor`, `aggregatePaydayProgress`. Imports `addDays`/`daysInMonth`/
      `formatCalendarDate`/`parseCalendarDate` from `lib/utils/calendar-date.ts`. Make 2.7–2.15 pass.
- [x] 2.18 GREEN `[test,small]` Confirm task 2.16's case passes against the EXISTING
      `computeNetRevenue` (`lib/services/finance-summary.ts` — unchanged by this PR, per the proposal's
      out-of-scope table). No new implementation; this is a regression proof, not a feature.
- [x] 2.19 REFACTOR `[pure,small]` Clean up naming and the section boundary without changing test
      outcomes; re-run `npx vitest run` — confirm the FULL suite (calendar-date, recurring-expenses,
      finance-summary, recipe-cost) is green.
- [x] 2.20 `[gate,small]` Run `npx tsc --noEmit` — MANDATORY.

### Automated tests — Phase 2

- [x] Test2.1 `npx vitest run` passes with all 4 `calendar-date.test.ts` cases (2.1–2.4), all 9
      `recurring-expenses.test.ts` cases (2.7–2.15) and the `finance-summary.test.ts` regression case
      (2.16) green, alongside the pre-existing suite (`recipe-cost.test.ts`).

---

## Phase 3 (PR3): Analytics fold-in + `expensesByCategory` (~280 lines, numerically a no-op — zero
templates exist until PR4)

- [x] 3.1 `[hook,small]` Modify `lib/hooks/orders/use-orders-history.ts` — add imports:
      `parseCalendarDate` from `@/lib/utils/calendar-date`; `expandRecurringExpensesDaily`,
      `sumAllocations` from `@/lib/services/recurring-expenses`, beside `:6`'s `computeNetRevenue`
      import.
- [x] 3.2 `[hook,medium]` Modify `use-orders-history.ts` — add the 9th query: `{ data:
      recurringTemplates, error: e9 }` destructured after `:160`'s `prevExpenses` slot; the unfiltered
      `.from("recurring_expenses").select("id, amount, category, description, frequency, start_date,
      end_date")` call inside the `Promise.all` (**no `WHERE`/date filter — rule 5**, with the reasoning
      comment carried verbatim from design); `if (e9) throw e9;` after the existing `:217` error checks.
      Add `category` to the current-period expenses select (`:199-202` → `.select("date, amount,
      category")`); the previous-period query stays `"date, amount"` (total-only).
- [x] 3.3 `[hook,medium]` Modify `use-orders-history.ts` — insert the calendar-conversion block (rule 6)
      right after `if (e9) throw e9;`: `periodStartCal`/`periodEndCal`/`prevPeriodStartCal`/
      `prevPeriodEndCal` via `parseCalendarDate` on the existing date strings; **compute
      `recurringAllocations = expandRecurringExpensesDaily(templates, periodStartCal, periodEndCal)`
      exactly ONCE and reuse it for the total, the daily fold, and the category split (design D6)** —
      this is what makes `sum(dailyData[].expenses) === expensesTotal` a structural property, not merely
      a tested one; also compute `prevRecurringTotal` via a second call for the previous period.
- [x] 3.4 `[hook,small]` Modify `use-orders-history.ts`'s totals assembly (`:239-242`) — `expensesTotal =
      oneOffExpensesTotal + sumAllocations(recurringAllocations)`; `prevExpensesTotal =
      prevOneOffExpensesTotal + prevRecurringTotal` (rule 7 — folds the previous period too, or the
      first period with a template manufactures a phantom `expensesChange` spike). The
      `computeNetRevenue` call site (`:246-250`) stays **byte-identical** — only the value it receives
      changes.
- [x] 3.5 `[hook,medium]` Modify `use-orders-history.ts` — build `expensesByCategory` (rule 9, D7,
      **merged shape per D4**: `Record<ExpenseCategory, number>`) as an object literal with all 5 keys
      initialized to `0` (never `Object.fromEntries` — the literal is checked against the
      `ExpenseCategory` union at compile time), summing one-off `expenses` rows and
      `recurringAllocations` together.
- [x] 3.6 `[hook,small]` Modify `use-orders-history.ts` — fold `recurringAllocations` into
      `dailyMap[key].expenses` immediately after the existing one-off fold (`:292-296`), before the
      gap-fill loop (rule 8). Keys align exactly because `allocation.date` is `formatCalendarDate` over
      the same string range the gap-fill loop walks via `toArDateStr`.
- [x] 3.7 `[hook,small]` Modify `use-orders-history.ts` — add `expensesByCategory` to the returned object
      (`:315-337`), beside the `computeNetRevenue` spread. No signature change — `/rendimiento`'s
      existing call site keeps working, it just gains an unread field.
- [x] 3.8 `[UI,medium]` Modify `components/finanzas/resumen-tab.tsx` — **delete** the `useExpenses`
      import, the date-string IIFE (`:99-121`), the `useExpenses` call, the `totalsByCategory` IIFE
      (`:123-134`); collapse the `expensesLoading` skeleton branch into `isLoading`; category cards read
      `analytics?.expensesByCategory?.[category] ?? 0`; update the stale doc comment that currently
      documents the local reduce as deliberate. `ALL_CATEGORIES` stays (render order, not aggregation).
      *(spec: revenue-analytics — `expensesByCategory` computed once in the hook, D7)*
- [x] 3.9 `[UI,small]` Modify `components/finanzas/gastos-tab.tsx` — **delete** the `totalsByCategory`
      `useMemo` (`:92-101`) and the now-unused `useMemo` import; mount `useOrdersAnalytics` for the
      tab's already-derived month and read `expensesByCategory` from it. *(spec: revenue-analytics — no
      component recomputes its own category breakdown)*
- [x] 3.10 GATE `[test,medium]` **Zero-templates byte-identical safety proof** — with `recurring_expenses`
      empty, assert `expensesTotal`, `dailyData`, `expensesChange`, `netRevenueChange`, `netRevenue`,
      and `expensesByCategory` are all identical to the pre-PR3 `finanzas-gastos-recetas` computation
      for the same one-off expenses and orders fixture. This is the proposal's own success-criteria item
      ("with zero templates configured, every Resumen and Gastos figure is byte-identical to today") and
      MUST be verified explicitly before this PR is considered done, since Unit 3 shipping ahead of any
      template is the entire reason it is safe to land the arithmetic change now.
- [x] 3.11 `[gate,small]` Run `npx tsc --noEmit` — MANDATORY.

### Manual QA — Phase 3

- [ ] QA3.1 With zero templates, every Resumen and Gastos figure visually matches pre-PR3 behavior
      (confirms task 3.10 at the UI layer).
- [ ] QA3.2 Neither `resumen-tab.tsx` nor `gastos-tab.tsx` contains a local `useExpenses`-based category
      reduce; both read `analytics.expensesByCategory`.
- [ ] QA3.3 `/rendimiento`'s existing `useOrdersAnalytics` consumer still renders correctly — no
      signature-change regression.

---

## Phase 4 (PR4, depends on PR3): "Fijos mensuales" sub-tab (~400 lines — see Review Workload Forecast
for the optional 4a/4b split)

- [x] 4.1 `[hook,medium]` Create `lib/hooks/expenses/use-recurring-expenses.ts` —
      `recurringExpensesQueryKey()` (`["recurring-expenses"]`, no date-ranged variant — rule 5 means the
      query is always unfiltered); `invalidateRecurringExpenseQueries(queryClient)` invalidating
      `["recurring-expenses"]` AND `["orders-analytics"]` (a template mutation changes `expensesTotal`
      for every mounted period), deliberately NOT `["expenses"]`; `useRecurringExpenses()`;
      `useCreateRecurringExpense()`.
- [x] 4.2 `[hook,small]` Add `useDeleteRecurringExpense()` to `use-recurring-expenses.ts` — **D4: the
      mutation throws before issuing the DELETE unless `template.start_date >= arTodayStr()`. Boundary
      is `>=` — a template starting today is still deletable.** This is the second layer; the UI omits
      the button entirely as the primary guard (task 4.4).
- [x] 4.3 `[hook,medium]` Add `useCloseAndReplaceRecurringExpense()` to `use-recurring-expenses.ts` —
      **D9: INSERT the replacement row FIRST (`start_date = effectiveFrom`, new `amount`), then UPDATE
      the old row's `end_date = dayBefore(effectiveFrom)` SECOND.** Doc comment carries the
      visible-vs-invisible-failure table verbatim (UPDATE-then-INSERT crash ⇒ cost silently
      disappears, invisible, profit reads optimistically high — the exact bug this feature exists to
      fix; INSERT-then-UPDATE crash ⇒ cost double-counted, but visible as two "Activo" rows with the
      same description). No client-side transaction exists or is faked (Supabase JS has none — same
      standing position as `use-order-stock-sync.ts:55-62`). *(design D9 — explicit task, not folded
      into the update dialog)*
- [x] 4.4 `[UI,medium]` Create `components/finanzas/recurring-expense-list.tsx` — row: description,
      category badge, frequency badge, Activo/"Cerrado el {end_date}" badge, "Desde {start_date}", and
      either `"{amount}/mes · {prorated} en este período"` (monthly, via `expandRecurringExpenses`) or
      the `previewPaydayDates` cadence preview (weekly/biweekly, D1). **Delete button rendered ONLY when
      `start_date >= arTodayStr()` — absent, never disabled-with-a-tooltip (D4).** *(spec:
      recurring-expense-templates — delete action absent, not disabled, once `start_date < today`)*
- [x] 4.5 `[UI,medium]` Create `components/finanzas/recurring-expense-form-dialog.tsx` — category,
      description, frequency `Select` **always visible, no coupling to category (D6)** — no gate
      restricting weekly/biweekly to `salaries`, no forced reset to `monthly` on category change; amount
      field rendered **only when `frequency === "monthly"`**, required in that case (rule 11, mirroring
      the DB CHECK client-side); start date. *(spec: recurring-expense-templates — weekly template
      creatable for any category; amount field absent for weekly/biweekly)*
- [x] 4.6 `[UI,medium]` Create `components/finanzas/recurring-expense-update-dialog.tsx` — new amount +
      effective-from date. **Date picker bounded to `effectiveFrom > template.start_date` (D10)** — the
      `recurring_expenses_period_order` CHECK rejects `end_date < start_date`, and
      `effectiveFrom === start_date` computes exactly that, so the UI must not be able to request it.
      Copy states the resolution explicitly: *"Para cambiar un gasto fijo que todavía no empezó,
      eliminalo y creálo de nuevo."* — a same-day correction on an unstarted template is the delete path
      (D4), not close-and-replace. *(design D10 — explicit task, not folded into "crear el dialog de
      actualizar")*
- [x] 4.7 `[UI,medium]` Modify `components/finanzas/gastos-tab.tsx` — nest a `Tabs`: "Del período"
      (existing body) / "Fijos mensuales" (new). Lift `anchorDate`/`start`/`end` above the sub-tabs so
      both share one period. Top-level `?tab=` in `finanzas-tabs.tsx` stays untouched — a 4-value union,
      not a 5th top-level tab. *(spec: finance-overview — Gastos becomes a two-sub-tab surface, top level
      unchanged)*
- [x] 4.8 `[gate,small]` Run `npx tsc --noEmit` — MANDATORY.

### Manual QA — Phase 4 (no automated coverage; Supabase-write-ordering and UI-layer concerns)

- [ ] QA4.1 Creating a `weekly` template with `category: "services"` succeeds — no gate restricts
      weekly/biweekly to `salaries` (D6).
- [ ] QA4.2 Creating a `monthly` template without an amount is rejected at the form; the amount field is
      entirely absent for `weekly`/`biweekly`.
- [ ] QA4.3 A template with `start_date = today` shows a delete button and deleting it works; a template
      with `start_date = yesterday` shows **no delete button at all** (not a disabled one).
- [ ] QA4.4 Close-and-replace: change an amount effective the 16th ⇒ old row `end_date = 15`, new row
      `start_date = 16`, the 16th charged **exactly once**, and the **previous month's reported total
      does not move**. Empirically confirm the write order (new row appears, briefly overlapping, before
      the old row's `end_date` updates) rather than assuming it from the code.
- [ ] QA4.5 Attempting `effectiveFrom === template.start_date` in the update dialog is unreachable via
      the date picker (D10); confirm the underlying DB CHECK independently rejects it if bypassed.
- [ ] QA4.6 A newly created template with a `start_date` two months in the past does not spike
      `expensesChange` on first render (rule 7, now exercised with real data for the first time).

---

## Phase 5 (PR5, depends on PR1, PR2, PR4): "Cargar pago" + payday counter (~240 lines)

- [ ] 5.1 `[UI,medium]` Modify `components/finanzas/expense-form-dialog.tsx` — add `prefill?:
      ExpenseFormPrefill | null` prop (`{ category, description, recurringExpenseId }`); extend the
      on-open reset effect at `:88-96` to seed `date = arTodayStr()`, `amount = ""` (**never
      prefilled** — the real payment amount is not knowable in advance, rule 1), `category =
      prefill?.category ?? "supplies"`, `description = prefill?.description ?? ""`,
      `recurringExpenseId = prefill?.recurringExpenseId ?? null`, with `prefill` added to the effect's
      dependency array. *(design D8 — extends the reset, does not compete with it via a second effect)*
- [ ] 5.2 `[dep,small]` **`prefill` MUST be referentially stable at every call site.** Because `prefill`
      is in the effect's dep array, an inline object literal (`prefill={{ category, description,
      recurringExpenseId }}`) produces a new reference on every parent render and **re-runs the reset
      while the operator is typing the amount**, silently wiping it. The caller (task 5.5) holds it in
      `useState`, never constructs it inline in JSX. *(design D8 — the single most likely PR5
      regression; called out as its own task per the launch instructions, not left implicit)*
- [ ] 5.3 `[UI,small]` Modify `expense-form-dialog.tsx` — **delete the local `todayArStr` (`:32-34`)**;
      import `arTodayStr` from `@/lib/utils/calendar-date` instead. Makes rule 12's "same AR-calendar
      source the expense dialog already uses" literally true, not merely parallel.
- [ ] 5.4 `[hook,small]` Modify `lib/hooks/expenses/use-expenses.ts` — add `recurring_expense_id: string
      | null` to `useCreateExpense`'s mutation input (`:99-106`), passed straight to the INSERT. Nothing
      else changes — `invalidateExpenseQueries` already invalidates `["orders-analytics"]`, which is
      what the counter and totals need.
- [ ] 5.5 `[UI,medium]` Modify `components/finanzas/recurring-expense-list.tsx` — add a "Cargar pago"
      button on informational (`weekly`/`biweekly`) templates + an "N de M pagos cargados" line from
      `paydayProgressFor`, fed by the sub-tab's shared `useExpenses(start, end)`. *(spec: payday-tracking
      — counter reads from the FK, unaffected by description renames)*
- [ ] 5.6 `[UI,medium]` Modify `components/finanzas/gastos-tab.tsx` — hold `prefill` in `useState`
      (stable reference per task 5.2); the "Cargar pago" click handler calls `setPrefill({ category,
      description, recurringExpenseId })` then opens the dialog; `onCreated` switches to the "Del
      período" sub-tab so the saved payment is visible where it landed; clear `prefill` on dialog close.
- [ ] 5.7 `[gate,small]` Run `npx tsc --noEmit` — MANDATORY. Watch `react-hooks/exhaustive-deps` on the
      D8 effect specifically (task 5.1's dep array).

### Manual QA — Phase 5

- [ ] QA5.1 **Prefill survival (D8's trap):** click "Cargar pago", type an amount, then trigger a parent
      re-render (switch sub-tabs behind the dialog, or resize). The typed amount MUST survive. If it
      clears, `prefill` is being passed as an inline literal somewhere — regression on task 5.2.
- [ ] QA5.2 "Cargar pago" opens the dialog prefilled with the template's own `category` (never a
      hardcoded `"salaries"`) and `description`; the amount field starts empty.
- [ ] QA5.3 Saving from the prefilled dialog writes `recurring_expense_id` on the resulting `expenses`
      row and switches the UI to the "Del período" sub-tab.
- [ ] QA5.4 Renaming a template's `description` does NOT change its "N de M pagos cargados" counter
      (rule 13 — FK-based match, never text).
- [ ] QA5.5 A non-`salaries` `biweekly` template (e.g. `category: "services"`) still counts a
      matching-FK payment — proves no `category === "salaries"` gate exists anywhere in the counter path.
- [ ] QA5.6 Deleting a deletable template never deletes its linked `expenses` rows; any row that
      referenced it has `recurring_expense_id` become `NULL` (rule 14).
- [ ] QA5.7 Create a `supplies`-category `monthly` template and log a payment via "Cargar pago":
      `supplies.stock_quantity` does not move, and no `expense_stock_movements` row is created (D2
      isolation, still holding for recurring-sourced payments).

---

## Ordering / Dependency Summary

```
Phase 1 (PR1: schema + types)
   -> Phase 2 (PR2, strict TDD: calendar-date.ts -> recurring-expenses.ts)
      -> Phase 3 (PR3: analytics fold-in, numerically inert until PR4)
         -> Phase 4 (PR4: use-recurring-expenses.ts + "Fijos mensuales" sub-tab)
            -> Phase 5 (PR5: "Cargar pago" + payday counter)
```

- The chain is strictly linear, unlike `finanzas-gastos-recetas`'s PR5/PR6 fork — `047`'s FK column
  (PR1) is needed by PR2's payday tests' types, PR2's proration is needed by PR3's fold-in, PR3 must be
  live before PR4 (a template must not be creatable before the read path handles it — design's own
  Migration/Rollout note), and PR5 needs PR1 (FK), PR2 (payday grid) and PR4 (sub-tab + list component).
- **Revert asymmetry** (carried from design, load-bearing for `sdd-apply`/rollback planning): reverting
  **PR4 alone** leaves already-created template rows in the database, still prorating into
  `expensesTotal`, with no UI explaining where the money is coming from. If PR3 and PR4 are both live,
  revert them together, or neither. PR1, PR2, PR3 and PR5 are each independently revertible.
- **`047` must be applied to the target environment before PR3's code deploys** — PR3's `queryFn`
  selects from `recurring_expenses` unconditionally, so a missing table breaks `useOrdersAnalytics` on
  BOTH `/finanzas` and `/rendimiento`. Call this out explicitly in the PR3 description.
- `npx tsc --noEmit` is a MANDATORY gate task in every phase (1.3, 2.20, 3.11, 4.8, 5.7) —
  `next.config.mjs`'s `typescript.ignoreBuildErrors: true` means a green `next build` does not catch
  type errors on its own.
- Only Phase 2 has new automated (vitest) coverage in this change, plus one added case to the existing
  `finance-summary.test.ts` (task 2.16/2.18). Phases 1, 3, 4 and 5 rely on the Manual QA checklists
  above — same pre-existing pattern as `finanzas-gastos-recetas`'s Phases 1, 4 and 5.
