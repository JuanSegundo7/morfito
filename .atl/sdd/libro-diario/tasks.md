# Tasks: libro-diario — Read-only daily debit/credit ledger inside Resumen

Derived from the approved spec (`.atl/sdd/libro-diario/spec.md`) and design (`.atl/sdd/libro-diario/design.md`).
PR boundaries are taken from design's own staging (PR1's provably-no-op hook split, PR2's strict-TDD pure
builder, PR3's zero-arithmetic component), broken into ordered, checkable tasks at the rigor bar of
`.atl/sdd/gastos-recurrentes/tasks.md`.

> **Size note**: this document exceeds the generic sdd-tasks word budget, mirroring `gastos-recurrentes/tasks.md`'s
> own override — the requester explicitly asked for the same format and rigor as that document (per-PR QA,
> `[type,size]` tags, explicit gate/regression tasks). Explicit instruction wins over the generic budget.

## Review Workload Forecast

| PR | Scope | Est. changed lines (design's own estimate) | 400-line risk |
|----|-------|--------------------:|---------------|
| PR1 | `use-orders-history.ts` — `description` select + `dailyMap` `ordersRevenue`/`externalRevenue` split, `revenue` reconstructed at push (D9) | ~80 | Low |
| PR2 | `lib/services/daily-ledger.ts` + `daily-ledger.test.ts` + hook wiring, strict TDD | ~320 | Low |
| PR3 | `components/finanzas/daily-ledger.tsx` + mount in `resumen-tab.tsx` | ~230 | Low |
| **Total** | | **~630** | |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Low

**Confirming the proposal's own staging, not adjusting it.** The proposal estimated PR1 ~80 / PR2 ~300 / PR3
~250 (~630 total). Design's more detailed file-level estimate lands at PR1 ~80 / PR2 ~320 / PR3 ~230 — the
same ~630 total, redistributed by ~20 lines between PR2 and PR3, with **no PR anywhere near the 400-line
budget**. This is the opposite outcome from `gastos-recurrentes`, where design's detail pushed PR2 to ~420
and PR4 to ~400 — here the smallest module in the codebase's "fourth pure service" family (`daily-ledger.ts`,
~140 lines with header, per design's *File Changes*) keeps PR2 comfortably under budget even with its full
test matrix. No split decision is required before `sdd-apply`; the only open scheduling choice is the chain
strategy (stacked-to-main vs. feature-branch-chain), not a budget-driven PR split. Design's own *Migration /
Rollout* section recommends `feature-branch-chain` because "the chain is strictly linear and all three touch
`use-orders-history.ts` or its consumers" — record that recommendation for whoever resolves `chain_strategy`
at apply time.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `use-orders-history.ts` — `description` column + `dailyMap` split, `revenue` preserved | PR1 | Base: main. Provably no-op — nothing reads the new fields yet. Ships alone: touches a live path 2 production screens read. |
| 2 | `lib/services/daily-ledger.ts` + `.test.ts` + hook wiring (`ledger` field) | PR2 | Base: PR1 (needs `DailyAnalyticsPoint`, `ordersRevenue`/`externalRevenue`, `description`). Logic only, no UI. |
| 3 | `components/finanzas/daily-ledger.tsx` + mount | PR3 | Base: PR2 (needs `analytics.ledger`). Pure presentation, zero arithmetic. |

---

## Phase 1 (PR1): Hook split — `description` + `ordersRevenue`/`externalRevenue` (~80 lines, provable no-op)

- [x] 1.1 `[hook,small]` Modify `lib/hooks/orders/use-orders-history.ts:204-208` — current-period expenses
      select gains `description`: `.select("date, amount, category, description")`. Extend the existing
      `gastos-recurrentes PR3` comment at `:201-203` with a `libro-diario PR1` line explaining the ledger
      needs each one-off expense's own concept text. **Leave `:209-213` (previous-period select) untouched**
      — it feeds only `prevExpensesTotal` and never a rendered row. *(spec: revenue-analytics — current-period
      select gains `description`; previous-period select unchanged)*
- [x] 1.2 `[types,small]` Modify `use-orders-history.ts:330` — `dailyMap`'s value type changes from
      `Record<string, { orders; revenue; canceled; expenses }>` to `Record<string, { orders; ordersRevenue;
      externalRevenue; canceled; expenses }>`. `revenue` is **removed** from the accumulator entirely (D9) —
      it is reconstructed once at the push site (task 1.4), never accumulated.
- [x] 1.3 `[hook,small]` Modify the five `dailyMap[key] = { ... }` initializer literals at `:333`, `:340`,
      `:346`, `:355`, `:366` — replace `revenue: 0` with `ordersRevenue: 0, externalRevenue: 0` in each. The
      `Record`'s type makes a missed initializer a **compile error** (D9) — do not extract an `ensureDay()`
      helper to collapse these; design explicitly rejects that for this PR (keeps control flow unchanged on
      a path that must stay a provable no-op).
- [x] 1.4 `[hook,small]` Modify `use-orders-history.ts:335` — `dailyMap[key].revenue += Number(o.total_amount)`
      becomes `dailyMap[key].ordersRevenue += Number(o.total_amount)`.
- [x] 1.5 `[hook,small]` Modify `use-orders-history.ts:347` — `dailyMap[key].revenue += Number(e.amount)`
      becomes `dailyMap[key].externalRevenue += Number(e.amount)`.
- [x] 1.6 `[types,small]` Export a new `DailyAnalyticsPoint` interface in `use-orders-history.ts` (D4 — named
      because 3 consumers now read this array: Resumen's bar chart, `/rendimiento`'s AreaChart, and PR2's
      ledger builder). Fields: `date`, `day`, `orders`, `ordersRevenue`, `externalRevenue`, `revenue`,
      `canceled`, `expenses`. Doc comment carries rule 8's invariant verbatim: `revenue === ordersRevenue +
      externalRevenue`, always. Change `:371`'s inline element type to `const dailyData: DailyAnalyticsPoint[]
      = []`.
- [x] 1.7 `[hook,small]` Modify the `dailyData.push(...)` block at `:376-383` (D9) — compute two locals,
      `ordersRevenue = dailyMap[key]?.ordersRevenue || 0` and `externalRevenue = dailyMap[key]?.externalRevenue
      || 0`; push both plus `revenue: ordersRevenue + externalRevenue` in **one expression**, never a third
      accumulator. Carry the rule-8 comment verbatim from design (names both consuming screens:
      `resumen-tab.tsx`'s bar chart and `/rendimiento`'s AreaChart at `page.tsx:624, 636`). `:353-357`
      (one-off expense fold) and `:364-368` (allocation fold) stay **untouched**. *(spec: revenue-analytics —
      `dailyData[].revenue` stays exactly `ordersRevenue + externalRevenue`, unchanged in value)*
- [x] 1.8 `[gate,small]` Run `npx tsc --noEmit` — MANDATORY (`next.config.mjs`'s `ignoreBuildErrors: true`
      means a green `next build` proves nothing about types).

### GATE — non-regression proof, PR1 (do NOT consider PR1 closed without this)

- [x] 1.9 GATE `[test,medium]` **`revenue = ordersRevenue + externalRevenue` reproduces today's `revenue`
      exactly, on BOTH consuming screens, before PR1 is considered done.** This is the single highest-risk
      line in the change (design's own Risks table, Severity: High) — `revenue` is a live production field
      read by `/finanzas` Resumen's "Ingresos vs. gastos por día" chart (`resumen-tab.tsx:319-374`) **and**
      `/rendimiento`'s "Ingresos por día" AreaChart (`page.tsx:624, 636`), a screen entirely outside this
      feature's blast radius. Verify, with a fixture or a captured real dataset: (a) `dailyData[i].revenue ===
      dailyData[i].ordersRevenue + dailyData[i].externalRevenue` for every row; (b) `sum(dailyData[].revenue)`
      across the period equals `totalRevenue` within float tolerance, unchanged from pre-PR1 behavior; (c) a
      day with both a sale and external income shows the SAME combined bar height / point value it showed
      before the split. Same spirit as `gastos-recurrentes/tasks.md`'s task 3.10 (byte-identical
      zero-templates gate) — this is the equivalent trust boundary for this change. *(spec: revenue-analytics
      — the split is a provable no-op on both consuming charts)*

      **Evidence (apply-time, algebraic + fuzzed, since this hook has no test harness — supabase +
      react-query, `"use client"`):** the exact `dailyMap` accumulation logic (pre- and post-split) was
      extracted verbatim into a standalone fuzz script and run against ~200k randomized day-rows.
      - **(a)** holds unconditionally — `revenue` is computed as `ordersRevenue + externalRevenue` in the
        same push expression, so equality is definitional, not tested.
      - **(c)**, the realistic case (0 or 1 `external_income` row per calendar day — the actual usage
        pattern; a manually-logged entry is not usually duplicated same-day): **146,839 day-rows checked,
        0 mismatches, bit-for-bit** (`Buffer.writeDoubleLE` byte comparison, not `===`/tolerance). Proof:
        `orders`' running sum is untouched (same loop, same order, same field renamed) and `externalRevenue`
        starts at 0, so `0 + e1` is an IEEE-754-exact single addition, identical to the old code's single
        `+= e1` on top of the already-complete order sum for that key.
      - **Honest caveat, found during this proof, not anticipated by design D9's "cannot drift" phrasing**:
        when a day has **2+** `external_income` rows, the split can differ from the old single-accumulator
        result by up to ~`5.8e-11` in absolute terms (fuzzed: 50,000 forced 2-4/day rows, ~30% show this).
        Root cause is floating-point **non-associativity**, not a logic bug: old code folds each external
        entry onto the running total that already includes the order sum (`(orderSum + e1) + e2 + ...`);
        the split necessarily sums externals independently first, then adds the two subtotals as the last
        step (`orderSum + (0 + e1 + e2 + ...)`) — same operands, different grouping. This is an inherent
        cost of ANY split-then-recombine of a single float accumulator, not fixable without reverting D9
        (rejected) or reintroducing a third `revenue` accumulator (also rejected by D9). Magnitude is
        ~15-16 significant digits below the values involved — invisible at `formatCurrency`'s 2-decimal
        display precision and multiple orders of magnitude below any currency-relevant threshold. Recorded
        here as a deviation from design's literal "cannot drift" claim, not as a blocking regression.
      - Sum-of-period sanity (item b): a 31-day/25-orders-per-day/sparse-external fixture reproduced
        `sum(dailyData[].revenue)` old vs. new with `diff: 0`.

### Manual QA — Phase 1 (visual before/after; not vitest-testable end-to-end)

- [ ] QA1.1 Screenshot `/finanzas` Resumen's "Ingresos vs. gastos por día" chart and `/rendimiento`'s
      "Ingresos por día" AreaChart, before and after PR1, for the same period. Every bar/point and both
      tooltips are pixel-identical.
- [ ] QA1.2 Spot-check a day that has both a completed order AND external income — the combined bar/point is
      unchanged from before the split.
- [ ] QA1.3 Confirm the fetched `description` column is unread anywhere yet (no consumer exists until PR2) —
      grep for `.description` usage on the current-period expenses result; none should exist outside the
      select itself.

---

## Phase 2 (PR2, strict TDD): `lib/services/daily-ledger.ts` — pure builder (~320 lines, no UI)

Strict TDD applies to this entire phase — this is the repo's **fourth pure module** (after
`finance-summary.ts`, `recipe-cost.ts`, `recurring-expenses.ts`) and, per design, "where every subtle bug in
this change lives." RED tasks are failing-test additions; one GREEN task makes the full RED set pass;
REFACTOR cleans up without changing outcomes.

- [x] 2.1 RED `[test,small]` Add to `lib/services/daily-ledger.test.ts`: **row order within a day (rule 2)** —
      one day carrying all four sources (Ventas, Ingresos externos, one-off expense, prorated recurring) ⇒
      `entries.map(e => e.source)` is exactly `["orders", "external_income", "expense", "recurring"]`.
- [x] 2.2 RED `[test,small]` Add test case: **input-order independence (design D7, the regression guard for
      the whole decision)** — shuffle the `expenses` array and reverse the `recurringAllocations` array
      (mimicking template-major output from an unordered select) ⇒ output is **byte-identical**, including
      every intermediate `balance`, across both input orderings.
- [x] 2.3 RED `[test,small]` Add test case: **Ventas and Ingresos externos never merge** — a day with both
      non-zero ⇒ two separate rows, `source: "orders"` and `source: "external_income"`, each keeping its own
      amount apart from the other.
- [x] 2.4 RED `[test,small]` Add test case: **zero-amount rows are excluded (rule 4)** — a day with no sales
      produces no `"orders"` row; a recurring allocation with `amount === 0` produces no row; a one-off
      expense with `amount === 0` produces no row; an empty period produces `[]`.
- [x] 2.5 RED `[test,small]` Add test case: **one row per template per day, never collapsed (D1)** — three
      active monthly templates over a 3-day period where all three charge every day ⇒ exactly **9**
      `"recurring"` rows total (3 per day), each carrying its own template's `concept`. Never a single
      lumped "Gastos fijos" row, never merged by day.
- [x] 2.6 RED `[test,small]` Add test case: **cross-month proration passes through unchanged** — allocations
      spanning January→February (`amount/31` then `amount/28`) reproduce both daily rates verbatim; the
      builder performs no division of its own.
- [x] 2.7 RED `[test,small]` Add test case: **weekly/biweekly templates contribute zero rows** — a stale-amount
      `weekly` template in the input `recurringAllocations`/templates produces no `"recurring"` row anywhere
      in the output (consistent with `expandRecurringExpensesDaily`'s existing unconditional skip).
- [x] 2.8 RED `[test,small]` Add test case: **no commission row exists, ever, even when `commissionTotal` is
      non-zero (D1 / rule 9, MANDATORY highest-stakes scenario)** — with a non-zero `commissionTotal` present
      in the fixture, assert `sum(income) − sum(expense) ≈ netRevenue` within `1e-9` tolerance, **never
      `toBe`**. Fails loudly if a commission row or field is ever added to `LedgerSource`.
- [x] 2.9 RED `[test,small]` Add test case: **the running balance's last value ≈ `netRevenue`, never re-summed
      for display (rule 1)** — with a 31-day-month template prorating `amount/31` for all 31 days, assert the
      last row's `balance` differs from `totalRevenue − expensesTotal` by at most `1e-9` (tolerance, because
      31 float additions of `amount/31` do not reproduce `amount` exactly — this is the exact drift D6 keeps
      off the screen).
- [x] 2.10 RED `[test,small]` Add test case: **`closingBalance` is never re-summed from the array** — assert
      no function under test in this file performs `entries.reduce(...)` (or an equivalent) to produce a
      displayed total; `buildDailyLedger`'s return type has no closing-balance field at all (there is no
      `ledgerClosingBalance` — design D6).
- [x] 2.11 RED `[test,small]` Add test case: **null description survives as null, no fallback text is baked
      in by the builder (D2)** — a one-off expense with `description: null` produces a row with `concept ===
      null` **and** `category` set (never a Spanish fallback string like `"Gasto (Insumos)"` — that text is
      the component's job, not the builder's). Assert no Spanish string literal appears anywhere in this
      module's output for any fixture in the suite.
- [x] 2.12 RED `[test,small]` Add test case: **direction is derived, never stored** — `LEDGER_DIRECTION[entry
      .source]` is `"expense"` for every `"expense"`/`"recurring"` row and `"income"` for `"orders"`/
      `"external_income"` rows; assert `LedgerEntry` objects carry no `kind` key and no `isProrated` key.
- [x] 2.13 RED `[test,small]` Add test case: **a day outside `dailyData`'s walked range is ignored, not
      thrown** — an expense dated outside the period's `[startDateStr, endDateStr]` range produces no row and
      no exception (pins the documented, provably-unreachable-today behavior).
- [x] 2.14 GREEN `[pure,large]` Implement `lib/services/daily-ledger.ts` (design's *Interfaces / Contracts*
      section, verbatim signatures) — `LedgerSource` (`"orders" | "external_income" | "expense" |
      "recurring"`, no commission member), `LEDGER_DIRECTION` (object literal, not `Object.fromEntries` —
      TS checks all 4 keys against the union at this exact line), `LedgerEntry` (`date`, `source`, `concept:
      string | null`, `category: ExpenseCategory | null`, `amount`, `balance` — **no `id`, no `kind`, no
      `isProrated`**, per D2/D3), `LedgerDailyRevenue` (declared locally, NOT imported from
      `use-orders-history.ts` — D4, keeps `lib/services/` independent of `lib/hooks/`), `LedgerOneOffExpense`
      (`Pick<Expense, "date" | "amount" | "category" | "description">`, coercing `description` with `?? null`
      at the boundary since the untyped supabase client returns `undefined` for a dropped column), and
      `buildDailyLedger(input)` implementing the walk-`dailyData`-in-order + fixed-bucket-order + D7's two
      sorts (one-off expenses: `description` nulls-last → `amount` → `category`; recurring: `description` →
      `templateId`; plain code-unit comparison, never `localeCompare`). Zero React/supabase/`components/`
      imports — same posture as `finance-summary.ts`, `recipe-cost.ts`, `recurring-expenses.ts`. Make
      2.1–2.13 pass.
- [x] 2.15 REFACTOR `[pure,small]` Clean up naming/structure without changing test outcomes; re-run `npx
      vitest run` — confirm the FULL suite (calendar-date, recurring-expenses, finance-summary, recipe-cost,
      **daily-ledger**) is green.
- [x] 2.16 `[hook,small]` Modify `use-orders-history.ts` — add the import `import { buildDailyLedger } from
      "@/lib/services/daily-ledger";` beside the existing `recurring-expenses` import (`:8`).
- [x] 2.17 `[hook,medium]` Modify `use-orders-history.ts` — insert the `buildDailyLedger` call after the
      gap-fill loop closes (`:385`) and before the return (`:387`): pass `dailyData`, the mapped current-period
      `expenses` (coercing `amount` with `Number()`, `category` as `ExpenseCategory`, `description ?? null`),
      and the **same** `recurringAllocations` array already computed once at `:249` — **no fourth call to
      `expandRecurringExpensesDaily`**. Carry the comment verbatim: this is a projection of data already in
      hand, not a fourth aggregation. *(spec: daily-ledger — `recurringAllocations` consumed, never
      recomputed; rule 7)*
- [x] 2.18 `[hook,small]` Modify `use-orders-history.ts`'s return object (`:387-410`) — add `ledger,` beside
      `expensesByCategory` (`:404`). **No `ledgerClosingBalance` field is added — design D6.** No other
      returned value changes; `computeNetRevenue`'s call site (`:285-289`) stays byte-identical.
- [x] 2.19 `[gate,small]` Run `npx tsc --noEmit` — MANDATORY.

### Automated tests — Phase 2

- [x] Test2.1 `npx vitest run` passes with all 13 `daily-ledger.test.ts` cases (2.1–2.13) green, alongside the
      pre-existing suite (`calendar-date.test.ts`, `recurring-expenses.test.ts`, `finance-summary.test.ts`,
      `recipe-cost.test.ts`) — none regressed by the new import/wiring.

### Manual QA — Phase 2

- [x] QA2.1 Confirm `expandRecurringExpensesDaily` is still called exactly **twice** per
      `useOrdersAnalytics` invocation (current period + previous period) after adding the ledger — grep the
      call sites, count them. *(spec: revenue-analytics — the ledger adds no third current-period call)*
- [x] QA2.2 Confirm `lib/services/daily-ledger.ts` imports nothing from `components/`, nothing from
      `lib/hooks/`, and no React/supabase symbol — matches `finance-summary.ts`/`recipe-cost.ts`/
      `recurring-expenses.ts`'s posture.

---

## Phase 3 (PR3, depends on PR2): `daily-ledger.tsx` component + mount (~230 lines, zero arithmetic)

- [x] 3.1 `[UI,medium]` Create `components/finanzas/daily-ledger.tsx` — `Card`/`CardHeader`/`CardTitle`
      ("Libro diario")/`CardContent` shape matching `resumen-tab.tsx`'s sibling cards (D10 — **not**
      jebbs' `CardHeading`, which has zero consumers anywhere in morfito); `components/ui/table.tsx` for the
      table body, columns `Fecha | Concepto | Debe | Haber | Saldo`; props are exactly `{ entries:
      LedgerEntry[] | undefined; closingBalance: number; isLoading: boolean }` (**no `periodLabel`, no
      `startDate`/`endDate`** — those were export-only in jebbs and D3 removes export). Day grouping preserves
      the array's own order (never re-sorted by the component), date cell printed once per group.
- [x] 3.2 `[UI,small]` In `daily-ledger.tsx` — render the "Debe"/"Haber" column choice from
      `LEDGER_DIRECTION[entry.source]` (imported as a **value**, not re-derived); render the `prorrateo`
      badge from `entry.source === "recurring"` (never a stored boolean).
- [x] 3.3 `[UI,medium]` **D2 gate — the component owns ALL Spanish/presentation mapping, never the service.**
      In `daily-ledger.tsx`, resolve: `"Ventas"` for `source === "orders"`, `"Ingresos externos"` for
      `source === "external_income"`, the expense's own `concept` when non-null, and `` `Gasto
      (${EXPENSE_CATEGORY_LABELS[entry.category]})` `` (imported from `components/finanzas/expense-list.tsx`,
      same import path `resumen-tab.tsx:29` already uses) when `concept === null`. **Verify `daily-ledger.tsx`
      contains ZERO imports from `@/lib/services/daily-ledger` beyond `LedgerEntry`, `LedgerSource`, and
      `LEDGER_DIRECTION` — no display string, no label map, no badge text may be imported from the service.**
      This is the load-bearing layering boundary design D2 establishes: the pure module stays testable in a
      node vitest environment with zero React/`components/` imports, and the component is the ONLY place
      Spanish copy or Badge/color logic exists. *(spec: daily-ledger — the service emits DATA, the component
      emits SPANISH; no display string the data did not supply)*
- [x] 3.4 `[UI,small]` **D5 gate — pagination is 7 day-groups per page, NOT 10.** Implement pagination over
      day-groups (a group = a day that produced at least one row; rule 4 means empty days emit nothing and
      consume no page budget), `Math.min(page, totalPages)` clamping so a shrinking result set never renders
      an empty page mid-session. **Explicitly not jebbs' 10 days/page**: jebbs pays D1's per-template-per-day
      row-count cost **once per period** (one row per template, dated at period close); morfito pays it
      **every day** (D2/D1 — proration multiplies rows across up to 31 days per template), so a comparable
      page here holds far more rows at 10 days than jebbs' 10 days ever did. 7 days = one week, matching how
      an operator reconciling against a bank statement actually thinks, and caps a realistic page near 50 rows
      with 4 active templates. *(design D5 — explicit task, not folded into "build the table")*
- [x] 3.5 `[UI,small]` In `daily-ledger.tsx` — reset pagination via the parent's `key={periodLabel}` (task
      3.7), **not** a `useEffect` keyed on `entries` (design D5 explicitly rejects the effect: it can fire on
      a background refetch when `key` cannot).
- [x] 3.6 `[UI,small]` In `daily-ledger.tsx` — render a skeleton while `isLoading` (never a `$0` or any numeric
      closing balance during loading); render "Sin movimientos en este período" inside the card when
      `entries` is empty (not loading); render the closing-balance strip **always**, fed directly from the
      `closingBalance` prop, including when there are zero rows — **jebbs nests the strip inside the
      non-empty branch; this component does not**, because the empty-period edge case requires the `$0` to
      show. No `entries.reduce(...)` or equivalent anywhere in this file (rule 1 / D6). No export button,
      dropdown, or menu item anywhere (D3 — no `jspdf`/`jspdf-autotable`/`exceljs`). No `useMutation` call and
      no edit/delete/annotate/reorder affordance anywhere (rule 10). *(spec: finance-overview — loading never
      flashes `$0`; empty period shows the message AND a `$0` from `netRevenue`)*
- [x] 3.7 `[UI,small]` Modify `components/finanzas/resumen-tab.tsx` — mount `<DailyLedger key={periodLabel}
      entries={analytics?.ledger} closingBalance={analytics?.netRevenue ?? 0} isLoading={isLoading} />`
      immediately after the "Ingresos vs. gastos por día" card closes (`:379`). Extend the file's existing
      zero-arithmetic doc comment (`:64-69`) to state the ledger's displayed total is the same `netRevenue`
      field the "Ingreso neto del período" card (`:254-274`) already renders. Nothing else in the file
      changes — the 4-tab shell and `?tab=` union are untouched. *(spec: finance-overview — the ledger card
      mounts inside the existing Resumen tab, below the daily chart; no new top-level tab)*
- [x] 3.8 `[gate,small]` Run `npx tsc --noEmit` — MANDATORY.

### Manual QA — Phase 3 (no automated coverage; UI-layer and visual concerns)

- [x] QA3.1 **Headline check**: "Saldo del período" (the ledger's closing-balance strip) is
      character-identical to "Ingreso neto del período" three cards above it, in month, week, and custom
      view — both read `analytics.netRevenue`. *(Verified statically: both render `formatCurrency(analytics?.netRevenue ?? 0)` — the strip's `closingBalance` prop is fed no other value at the single mount site. Holds by construction, independent of view mode.)*
- [ ] QA3.2 With 2+ active monthly templates prorating the same day, that day shows one badged `prorrateo`
      row **per template**, each with its own description — never merged (D1). *(NOT verified live — requires
      real recurring-expense templates in an actual environment; static review confirms the code never
      collapses "recurring" rows, but this needs an actual multi-template day to see rendered.)*
- [ ] QA3.3 A 31-day month with active templates paginates to the expected number of pages under the
      7-day-group rule; switching to week view shows page 1 of 1; switching back does not land on a stale
      page (confirms the `key={periodLabel}` reset). *(NOT verified live — requires an actual dataset with a
      31-day period; static review confirms the pagination math and the `key={periodLabel}` remount, but
      this needs a real render to see the page count and reset behavior in practice.)*
- [x] QA3.4 No `$0` closing balance flashes before data arrives — skeleton renders first. *(Verified
      statically: `isLoading` returns the skeleton branch unconditionally before any closing-balance markup
      exists in the tree.)*
- [x] QA3.5 An empty period shows "Sin movimientos en este período" **and** a `$0` closing-balance strip
      simultaneously. *(Verified statically: the closing-balance strip is rendered unconditionally, outside
      the `dayGroups.length === 0` branch.)*
- [x] QA3.6 Inspect every interactive element in the rendered card — confirm none edits, deletes, annotates,
      reorders, or creates a ledger row, and no export affordance (button/dropdown/menu item) exists anywhere.
      *(Verified via grep: the only `onClick`/`<Button>` occurrences in `daily-ledger.tsx` are the two
      pagination arrows; no `useMutation`, no dropdown, no export.)*
- [x] QA3.7 Confirm `/finanzas` still renders exactly 4 top-level tabs (Resumen, Gastos, Insumos, Recetas)
      after this change, with the ledger card appearing only inside Resumen. *(Verified via grep on
      `finanzas-tabs.tsx`: exactly 4 `TabsTrigger`s, unchanged by this PR — `resumen-tab.tsx` was the only
      file touched.)*
- [x] QA3.8 Grep `package.json` — confirm `jspdf`, `jspdf-autotable`, `exceljs` are absent. *(Verified —
      grep returns no matches.)*

---

## Ordering / Dependency Summary

```
Phase 1 (PR1: hook split, provable no-op)
   -> Phase 2 (PR2, strict TDD: daily-ledger.ts pure builder + wiring)
      -> Phase 3 (PR3: daily-ledger.tsx component + mount)
```

- Strictly linear, per design's own *Migration / Rollout*: **PR2 requires PR1** (`ordersRevenue`/
  `externalRevenue`, `description`, `DailyAnalyticsPoint`); **PR3 requires PR2** (`analytics.ledger`). All
  three touch `use-orders-history.ts` or its direct consumers, which is why design recommends
  `feature-branch-chain` to keep each child diff clean — not decided in this document, since no
  `delivery_strategy`/`chain_strategy` was supplied to this run.
- **No revert asymmetry** (unlike `gastos-recurrentes`' PR3/PR4 coupling) — this change moves no money at
  all. PR1 restores one accumulator field; PR2 removes an unread returned field and a file with no other
  importer; PR3 removes a card and leaves every other figure on the tab untouched. Each PR reverts
  independently and safely.
- `npx tsc --noEmit` is a MANDATORY gate task in every phase (1.8, 2.19, 3.8) — `next.config.mjs`'s
  `typescript.ignoreBuildErrors: true` means a green `next build` does not catch type errors on its own.
- **Task 1.9 is the load-bearing gate of the whole change** — PR1 must not be considered merged/closed until
  it passes, because `revenue` feeds two production screens (`/finanzas` and `/rendimiento`) that this
  feature's own scope does not otherwise touch or re-verify.
- Only Phase 2 has new automated (vitest) coverage — 13 RED cases in `daily-ledger.test.ts` (task Test2.1).
  Phases 1 and 3 rely on the Manual QA checklists above, same pattern as `gastos-recurrentes`'s Phases 1,
  3, 4 and 5.
</content>
