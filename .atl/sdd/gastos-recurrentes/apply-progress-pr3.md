# Apply Progress — `gastos-recurrentes` PR3 (analytics fold-in + `expensesByCategory`)

**Change**: gastos-recurrentes
**Unit**: PR3 of 7 — fold-in of recurring expenses into `useOrdersAnalytics` + `expensesByCategory` +
migrate `resumen-tab.tsx`/`gastos-tab.tsx` to read from it
**Mode**: Standard (no automated test harness exists for `use-orders-history.ts` itself — it calls the
Supabase client directly, same as every other hook in `lib/hooks/orders/`; the change's only automated
coverage lives in the pure modules, per the Ordering/Dependency Summary's own note that "only Phase 2 has
new automated (vitest) coverage")
**Base**: PR1 (`c9b33ef`), PR2a (`8f9d0fb`), PR2b (`1325922`), already merged on
`port/jebbs-style-refactor`

## Completed Tasks (tasks.md 3.1–3.11)

- [x] 3.1 — imports added to `use-orders-history.ts`: `parseCalendarDate` from
      `@/lib/utils/calendar-date`; `expandRecurringExpensesDaily`, `sumAllocations` from
      `@/lib/services/recurring-expenses`; also imported `ExpenseCategory`/`RecurringExpense` types
      (needed for the new query's cast and the category-record literal)
- [x] 3.2 — 9th query added to the `Promise.all`: unfiltered
      `.from("recurring_expenses").select("id, amount, category, description, frequency, start_date, end_date")`
      with the rule-5 comment carried verbatim; `category` added to the current-period expenses select
      (`.select("date, amount, category")`); previous-period expenses select stays `"date, amount"`;
      `if (e9) throw e9;` added after the existing error checks
- [x] 3.3 — calendar-conversion block inserted right after `if (e9) throw e9;`: `periodStartCal` /
      `periodEndCal` / `prevPeriodStartCal` / `prevPeriodEndCal` via `parseCalendarDate`;
      `recurringAllocations` computed exactly ONCE via `expandRecurringExpensesDaily` (D6) and reused for
      the total, the daily fold, and the category split; `prevRecurringTotal` computed via a second,
      independent call for the previous period
- [x] 3.4 — totals assembly rewritten: `expensesTotal = oneOffExpensesTotal + sumAllocations(recurringAllocations)`,
      `prevExpensesTotal = prevOneOffExpensesTotal + prevRecurringTotal` (rule 7); the `computeNetRevenue`
      call site is byte-identical — only the value of `expensesTotal` it receives changed
- [x] 3.5 — `expensesByCategory` built as an object literal (`Record<ExpenseCategory, number>`, all 5 keys
      initialized to 0), summing one-off `expenses` rows and `recurringAllocations` (same variable from
      3.3, no new call)
- [x] 3.6 — `recurringAllocations` folded into `dailyMap[key].expenses`, immediately after the existing
      one-off fold, before the gap-fill loop
- [x] 3.7 — `expensesByCategory` added to the hook's return object, beside the `...netRevenueResult`
      spread; no signature change
- [x] 3.8 — `resumen-tab.tsx`: removed the `useExpenses` import, the date-string IIFE, the `useExpenses`
      call, and the local `totalsByCategory` IIFE; collapsed the `expensesLoading` skeleton branch into
      `isLoading`; category cards now read `analytics?.expensesByCategory?.[category] ?? 0`; updated the
      doc comment that used to document the local reduce as deliberate
- [x] 3.9 — `gastos-tab.tsx`: removed the `totalsByCategory` `useMemo` and the now-unused `useMemo`
      import; mounted `useOrdersAnalytics(anchorDate)` (same month-mode period `monthRange(anchorDate)`
      already derives) and read `expensesByCategory` from it
- [x] 3.10 — zero-templates safety proof (see dedicated section below)
- [x] 3.11 — `npx tsc --noEmit`: 52 before, 52 after (identical, none in touched files)

## Zero-Templates Byte-Identical Safety Proof (task 3.10)

**Claim to verify**: with `recurring_expenses` empty (the real state of the DB today — nothing can
populate it until PR4 ships the create UI), every one of `expensesTotal`, `dailyData`, `expensesChange`,
`netRevenueChange`, `netRevenue`, and `expensesByCategory` is exactly what it was before this PR, for the
same `expenses`/`orders` data.

**Evidence 1 — new automated test.** Added to `lib/services/recurring-expenses.test.ts` (describe block
`expandRecurringExpensesDaily`):

```ts
it("3.10 (gastos-recurrentes PR3): zero templates produces zero allocations and a zero sum — the
structural basis for PR3 being numerically a no-op", () => {
  const daily = expandRecurringExpensesDaily([], parseCalendarDate("2026-01-01"), parseCalendarDate("2026-01-31"));
  expect(daily).toEqual([]);
  expect(sumAllocations(daily)).toBe(0);
});
```

`npx vitest run` — 34/34 tests green (33 pre-existing + this 1 new case), 4 files.

**Evidence 2 — line-by-line reasoning over `use-orders-history.ts`'s actual code**, given
`recurringTemplates` is `[]` (an empty-table Supabase select returns `data: []`, and the code also
defends with `(recurringTemplates ?? [])` in case of `null`):

1. `templates = []`.
2. `expandRecurringExpensesDaily([], periodStartCal, periodEndCal)` — the function's `for (const template
   of templates)` loop never executes over an empty array, so `allocations` stays `[]` and the function
   returns `[]`. Same for the previous-period call. So `recurringAllocations = []` and, via
   `prevRecurringTotal = sumAllocations(expandRecurringExpensesDaily([], ...))`, `prevRecurringTotal = 0`.
3. `sumAllocations([])` — `[].reduce((total, a) => total + a.amount, 0)` short-circuits to the initial
   accumulator, `0`. Never `NaN`, never `undefined`.
4. `expensesTotal = oneOffExpensesTotal + sumAllocations([]) = oneOffExpensesTotal + 0 =
   oneOffExpensesTotal` — **identical** to the pre-PR3 line (`expenses?.reduce(...) || 0`), because
   `oneOffExpensesTotal` is computed by the exact same reduce that used to be assigned straight to
   `expensesTotal`.
5. `prevExpensesTotal = prevOneOffExpensesTotal + 0 = prevOneOffExpensesTotal` — same reasoning, applied
   to the previous period (rule 7's whole point: without this fold, the FIRST period a template exists in
   would manufacture a phantom spike; with zero templates the fold is provably a no-op today).
6. `computeNetRevenue({ totalRevenue, expensesTotal, commissionTotalInformational })` — the call site
   itself is byte-identical text; it now receives the same numeric `expensesTotal` value it would have
   received pre-PR3, so `netRevenue`, and therefore `netRevenueChange` (`pct(netRevenueResult.netRevenue,
   prevRevenue - prevExpensesTotal)`), are unchanged.
7. `expensesChange = pct(expensesTotal, prevExpensesTotal)` — both operands unchanged from pre-PR3 ⇒
   output unchanged.
8. The daily fold's new loop (`for (const allocation of recurringAllocations) { ... }`) iterates zero
   times when `recurringAllocations = []`, so `dailyMap` — and therefore `dailyData` — is populated by
   exactly the same two loops (orders, canceled, external income, one-off expenses) that existed before
   this PR. No new keys, no new values.
9. `expensesByCategory` is a **new** aggregate (it did not exist inside the hook before this PR — it
   existed as `totalsByCategory` inside `resumen-tab.tsx` and `gastos-tab.tsx` separately). Its value with
   zero templates is `Σ one-off expenses by category`, computed by
   `expensesByCategory[e.category] += Number(e.amount)` over the exact same `expenses` array (same date
   range, confirmed below) the old local reduces summed. The `recurringAllocations` loop contributes zero
   entries. So the **numbers** it produces are identical to what the old local `totalsByCategory` reduces
   produced for the same period — this is the property task 3.10 actually cares about (the value read by
   the UI), even though the code that produces it moved.

**Evidence 3 — the two call sites read the identical period, so the date range feeding
`expensesByCategory` didn't shift when the aggregation moved into the hook:**

- `resumen-tab.tsx`: the deleted IIFE derived `startDateStr`/`endDateStr` from the same
  `selectedDate`/`viewMode`/`customRange` state that `useOrdersAnalytics(selectedDate, viewMode,
  resolvedCustomRange)` already receives — same month/week boundary math (`toLocaleDateString("en-CA",
  {timeZone: TZ})`, same Monday-Sunday week derivation), so the `expenses` rows summed are the same set.
- `gastos-tab.tsx`: `monthRange(anchorDate)` (used for the "Del período" list's own `useExpenses(start,
  end)`) and `useOrdersAnalytics(anchorDate)`'s default `viewMode="month"` path
  (`getMonthRange(selectedDate)` inside `use-orders-history.ts`) both derive
  `{year, month}` from `date.toLocaleString("en-US", { timeZone: TZ })` and build the same
  `YYYY-MM-01`/`YYYY-MM-{lastDay}` strings — identical algorithm, so identical period.

**Conclusion**: with the DB's actual current state (zero rows in `recurring_expenses`), every value this
PR touches is provably equal, by construction, to its pre-PR3 value — not merely "expected to be" but
structurally forced to be, because `expandRecurringExpensesDaily([], ...)` returning `[]` is unconditional
(no branch skips the empty-array case specially; the `for` loop itself never runs), and `sumAllocations`
folds over the empty array to its initial value. This is what makes PR3 safe to land *before* PR4's create
UI exists — the arithmetic is live, but has literally nothing to act on yet.

## TDD Cycle Evidence

Not applicable in Strict-TDD form for this unit: `use-orders-history.ts` has no existing test harness
(direct Supabase client calls, same posture as every other hook in `lib/hooks/orders/`), and the design's
own Ordering/Dependency Summary states only Phase 2 carries new automated coverage. The one new test case
added (3.10, on the already-tested pure primitive `expandRecurringExpensesDaily`/`sumAllocations`) follows
RED→GREEN in the sense that it exercises pre-existing, already-passing implementation code with a new
assertion; no new production code was written to make it pass (the empty-array behavior was already
correct from PR2b's implementation, by omission — no special case was added, none was needed).

| Task | Evidence |
|------|----------|
| 3.10 | RED: wrote the test asserting `expandRecurringExpensesDaily([], ...) === []` and `sumAllocations([]) === 0` against the PR2b implementation, unmodified. GREEN: `npx vitest run` — passed immediately (34/34), confirming the existing pure functions already satisfy the zero-templates invariant without any change. |

## Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `lib/hooks/orders/use-orders-history.ts` | Modified | Added the `recurring_expenses` import + unfiltered 9th query (rule 5); added `category` to the current-period `expenses` select; added the calendar-conversion block (rule 6) computing `recurringAllocations` once (D6) + `prevRecurringTotal`; folded `recurringAllocations` into `expensesTotal`/`prevExpensesTotal` (rule 7); built `expensesByCategory` as a 5-key object literal (D4, D7); folded `recurringAllocations` into the daily map (rule 8); added `expensesByCategory` to the returned object (no signature change) |
| `components/finanzas/resumen-tab.tsx` | Modified | Deleted `useExpenses` import + call, the date-string IIFE, and the local `totalsByCategory` IIFE; collapsed `expensesLoading` into `isLoading`; category cards read `analytics?.expensesByCategory?.[category] ?? 0`; updated the stale doc comment |
| `components/finanzas/gastos-tab.tsx` | Modified | Deleted the `totalsByCategory` `useMemo` and the now-unused `useMemo` import; mounted `useOrdersAnalytics(anchorDate)` for the tab's already-derived month; category cards read `analytics?.expensesByCategory?.[category] ?? 0` |
| `lib/services/recurring-expenses.test.ts` | Modified | Added one test case (task 3.10) proving `expandRecurringExpensesDaily([], ...) === []` and `sumAllocations([]) === 0` — the structural basis for PR3's numeric no-op claim |
| `.atl/sdd/gastos-recurrentes/tasks.md` | Modified | Marked 3.1–3.11 `[x]` |

## Gate Results

- `npx tsc --noEmit` — **52 errors before, 52 after** (identical set; `grep` confirms none reference
  `use-orders-history.ts`, `resumen-tab.tsx`, or `gastos-tab.tsx`).
- `npx vitest run` — **34/34 tests green** across 4 files (33 pre-existing + 1 new: task 3.10's
  zero-templates case in `recurring-expenses.test.ts`).
- `npx eslint .` — could not run; this repo currently has no `eslint.config.*` (ESLint 10 requires flat
  config; `.eslintrc.*` migration is not present). Pre-existing repo state, unrelated to this PR — not
  fixed here, out of scope.

## Deviations from Design

None — the hook changes match `design.md`'s "Analytics integration" section point-for-point (imports,
9th query placement, calendar conversion, D6's single-call reuse, totals assembly, D4/D7's merged
category-literal shape, the daily fold, and the return-shape addition). `resumen-tab.tsx`/`gastos-tab.tsx`
changes match D7 exactly (both local reduces deleted in this same PR, not deferred).

One addition beyond the letter of the tasks: task 3.10 said "with a quick test or reasoning" — both were
done (a new automated test on the pure module, plus full line-by-line reasoning over the hook's own code),
since the hook itself has no test harness to assert against directly.

## Issues Found

None.

## Not Touched (out of scope for this unit)

- PR4/PR5 (Phases 4–5) — `use-recurring-expenses.ts`, the "Fijos mensuales" sub-tab, "Cargar pago"
- `app/(dashboard)/combos/page.tsx` — unrelated pre-existing local modification (25 insertions, 1
  deletion), confirmed via `git diff --stat` before staging; left untouched, not staged, not committed

## Manual QA — Phase 3 (NOT verified in this session — requires a running app + a real/dev Supabase
instance, which this session does not have)

- [ ] QA3.1 — Visual match of every Resumen/Gastos figure against pre-PR3 behavior with zero templates.
      **Not run.** Task 3.10's automated test + code-level reasoning above cover the same claim at the
      logic layer; QA3.1 additionally covers rendering/UI wiring, which needs `next dev` against a
      database with `047` applied. Recommend running this before merging to `main`, per the design's own
      note that `047` must be applied to the target environment before PR3's code deploys.
- [x] QA3.2 — Confirmed statically: `rg "useExpenses|totalsByCategory" components/finanzas/resumen-tab.tsx
      components/finanzas/gastos-tab.tsx` returns no matches outside doc comments; both files read
      `analytics?.expensesByCategory?.[category] ?? 0`.
- [ ] QA3.3 — `/rendimiento`'s `useOrdersAnalytics` call site (`app/(dashboard)/rendimiento/page.tsx:185`)
      still destructures only `{ data: analytics, isLoading: analyticsLoading }`, unaffected by the
      additive `expensesByCategory` field; `tsc` confirms no new type errors there. Full visual
      confirmation ("renders correctly") not run — same environment limitation as QA3.1.

## Status

11/11 automated tasks (3.1–3.11) complete for Phase 3 (PR3). QA3.2 confirmed statically; QA3.1 and QA3.3
need a live `next dev` + dev-database session and are recommended before merge, consistent with this
change's Manual QA pattern for Phases 1, 3, 4, 5 (only Phase 2 has automated coverage per the
Ordering/Dependency Summary). Ready for `sdd-verify` on PR3, or `sdd-apply` continuation into Phase 4
(PR4) once PR3 is verified — Phase 4 depends on PR3's read path already handling templates before one can
be created (Ordering/Dependency Summary).
