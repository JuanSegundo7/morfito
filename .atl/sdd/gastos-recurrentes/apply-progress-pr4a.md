# Apply Progress — `gastos-recurrentes` PR4a (hook + list + create dialog + sub-tab)

**Change**: gastos-recurrentes
**Unit**: PR4a of 7 (split from Phase 4 per the Review Workload Forecast's 4a/4b mitigation) —
`use-recurring-expenses.ts` (create/read/delete only) + "Fijos mensuales" sub-tab (list + create dialog)
**Mode**: Standard (UI + hooks against Supabase, no pure logic — no automated test coverage per
design.md's Testing Strategy; QA is manual, per tasks.md)
**Base**: PR1 (`c9b33ef`), PR2a (`8f9d0fb`), PR2b (`1325922`), PR3 (`d9d72e2`), already merged on
`port/jebbs-style-refactor`
**Explicitly NOT included**: task 4.3 (`useCloseAndReplaceRecurringExpense`) and task 4.6
(`recurring-expense-update-dialog.tsx`) — both go in PR4b, since they depend only on the hook file
created here, not on this batch's list/dialog layout.

## Completed Tasks (tasks.md 4.1, 4.2, 4.4, 4.5, 4.7, 4.8)

- [x] 4.1 Created `lib/hooks/expenses/use-recurring-expenses.ts` — `recurringExpensesQueryKey()`
      (`["recurring-expenses"]`, no date-ranged variant per rule 5), `invalidateRecurringExpenseQueries`
      (invalidates `["recurring-expenses"]` + `["orders-analytics"]`, deliberately not `["expenses"]`),
      `useRecurringExpenses()`, `useCreateRecurringExpense()`.
- [x] 4.2 Added `useDeleteRecurringExpense()` to the same file — throws `Error` before issuing the
      DELETE when `template.start_date < arTodayStr()`. Boundary is `>=` (a template starting today is
      still deletable).
- [x] 4.4 Created `components/finanzas/recurring-expense-list.tsx` — one row per template: category
      badge, frequency badge, Activo/"Cerrado el {end_date}" badge, description, "Desde {start_date}",
      and either "{amount}/mes · {prorated} en este período" (monthly, via `expandRecurringExpenses`,
      computed once for the whole list) or a "Próximos pagos: …" cadence preview (weekly/biweekly, via
      `previewPaydayDates`). Delete button rendered ONLY when `start_date >= arTodayStr()` — absent, not
      disabled. Owns its own delete-confirmation `AlertDialog` (see Deviations).
- [x] 4.5 Created `components/finanzas/recurring-expense-form-dialog.tsx` — category Select (mirrors
      `expense-form-dialog.tsx`'s `CATEGORY_OPTIONS` derivation from `EXPENSE_CATEGORY_LABELS`),
      description Input, frequency Select **always visible**, no coupling to category, no reset to
      "monthly" on category change (D6). Amount Input rendered/required only when
      `frequency === "monthly"` (rule 11). Start date via the same Popover+Calendar pattern as
      `expense-form-dialog.tsx`.
- [x] 4.7 Modified `components/finanzas/gastos-tab.tsx` — nested a `Tabs` ("Del período" / "Fijos
      mensuales") inside the existing tab body. `anchorDate`/`start`/`end` were already declared at this
      component's top level (no lift needed — they already sat above where the sub-tabs now live); both
      sub-tabs read the same `start`/`end`. The create button in the shared header switches between
      "Nuevo gasto" and "Nuevo gasto fijo" depending on the active sub-tab. `finanzas-tabs.tsx`'s
      top-level `?tab=` union is untouched.
- [x] 4.8 Gate: `npx tsc --noEmit` — 52 lines / 53 pre-existing errors before, byte-identical after
      (`diff` confirmed no new errors). All pre-existing errors are unrelated to this change (combos,
      order-wizard, tailwind.config.ts, formatOrderWhatsapp.ts).

## Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `lib/hooks/expenses/use-recurring-expenses.ts` | Created | `recurringExpensesQueryKey`, `invalidateRecurringExpenseQueries`, `useRecurringExpenses`, `useCreateRecurringExpense`, `useDeleteRecurringExpense`. Structural mirror of `use-external-income.ts`. |
| `components/finanzas/recurring-expense-list.tsx` | Created | Row rendering, per-template proration/cadence preview, delete-button omission (D4), delete confirmation `AlertDialog`. Exports `RECURRING_FREQUENCY_LABELS` as the canonical frequency label map. |
| `components/finanzas/recurring-expense-form-dialog.tsx` | Created | Create-only dialog; frequency Select decoupled from category (D6); amount field gated on `frequency === "monthly"` (rule 11). |
| `components/finanzas/gastos-tab.tsx` | Modified | Nested `Tabs` ("periodo" / "fijos"); mounted `useRecurringExpenses`, `RecurringExpenseList`, `RecurringExpenseFormDialog`; conditional create button per active sub-tab. |
| `.atl/sdd/gastos-recurrentes/tasks.md` | Modified | Marked 4.1, 4.2, 4.4, 4.5, 4.7, 4.8 as `[x]`. 4.3 and 4.6 (PR4b) left unchecked. |

## Deviations from Design

- **Delete confirmation lives inside `RecurringExpenseList`, not the parent tab.** `expense-list.tsx` is
  purely presentational (delete confirmation owned by `gastos-tab.tsx`), but `RecurringExpenseList`
  already needs its own hook (`useDeleteRecurringExpense`) and its own period-derived proration state, so
  making it also own the confirm-`AlertDialog` avoids growing `gastos-tab.tsx`'s state surface for a
  second, near-identical confirmation dialog. Neither design.md nor tasks.md specifies which component
  owns the confirmation UI — this is a reasonable within-scope choice, not a deviation from an explicit
  decision. `gastos-tab.tsx` still owns the "Del período" list's own delete confirmation, unchanged.
- **Frequency labels centralized in `recurring-expense-list.tsx`, not duplicated in the form dialog.**
  `RECURRING_FREQUENCY_LABELS` is defined once in the list file (mirroring `expense-list.tsx`'s
  `EXPENSE_CATEGORY_LABELS` convention) and imported by `recurring-expense-form-dialog.tsx` for its
  `FREQUENCY_OPTIONS`, the same cross-file convention `expense-form-dialog.tsx` already uses for
  `EXPENSE_CATEGORY_LABELS`. This keeps the Select's options and the list's frequency badge from ever
  drifting apart.
- **Copy for the cadence preview** ("Próximos pagos: 05 sep, 12 sep, …") and for the delete-guard error
  thrown by `useDeleteRecurringExpense` were not specified verbatim in design.md/tasks.md; both were
  written to match this repo's existing Spanish, no-emoji, sentence-case tone (see `expense-form-dialog.tsx`,
  `gastos-tab.tsx`).
- No other deviations — hook signatures, invalidation set, delete-window boundary (`>=`), and the
  category/frequency decoupling all match design.md D4/D6 and the Interfaces/Contracts section verbatim.

## Issues Found

None.

## Remaining Tasks (NOT in this batch — PR4b)

- [ ] 4.3 `useCloseAndReplaceRecurringExpense()` in `use-recurring-expenses.ts` (D9 — INSERT-then-UPDATE
      ordering)
- [ ] 4.6 `components/finanzas/recurring-expense-update-dialog.tsx` (D10 — date picker bounded to
      `effectiveFrom > template.start_date`)

Phase 5 (PR5, "Cargar pago" + payday counter) remains fully pending and depends on PR4 (this batch) plus
PR4b.

## Workload / PR Boundary

- Mode: stacked-to-main (per tasks.md's Chain strategy, same pattern as PR1–PR3)
- Current work unit: PR4a of 7 — hook (create/read/delete) + list + create dialog + sub-tab wiring
- Boundary: starts from PR3's merged state (`d9d72e2`); ends with a working "Fijos mensuales" sub-tab
  that can list, create and delete (while unstarted) recurring expense templates. Does NOT include
  close-and-replace (PR4b) — an active template's amount cannot yet be changed without delete+recreate,
  which is intentionally not possible once `start_date < today` (by design, until PR4b ships).
- Estimated review budget impact: ~3 new files + 1 modified file, within the ~400-line PR4a estimate from
  the Review Workload Forecast (PR4 total was flagged Medium-High; this split keeps 4a inside budget,
  4b picks up the rest).

## Status

6/8 Phase 4 tasks complete (4.1, 4.2, 4.4, 4.5, 4.7, 4.8). Ready for PR4b (tasks 4.3, 4.6) in the next
apply batch.
