# gastos-recurrentes — PR1 apply progress

Branch: `port/jebbs-style-refactor` (no new branch created, per instructions)
Strict TDD: not applicable — this PR is pure schema + type additions, no runtime logic to test.
Manual QA (DB-constraint behavior) deferred to a real dev-clone environment — see below.

## Tasks completed (Phase 1)

- [x] 1.1 `scripts/047-recurring-expenses.sql` — `CREATE TABLE recurring_expenses` (no
      `supply_id`/`quantity` — D2, unrepresentable by omission), `category` CHECK (same 5 values as
      `expenses`), `recurring_expenses_monthly_amount` CHECK (`frequency <> 'monthly' OR amount IS NOT
      NULL`), `recurring_expenses_period_order` CHECK (`end_date IS NULL OR end_date >= start_date`),
      RLS enabled with the same allow-all `FOR ALL` policy (D2 — no narrowed `FOR DELETE`), no index on
      `start_date` (D11); then `ALTER TABLE expenses ADD COLUMN recurring_expense_id UUID REFERENCES
      recurring_expenses(id) ON DELETE SET NULL` + the partial index
      `idx_expenses_recurring_expense_id` (D11), all in one file per D1's ordering. Full WHY-banner
      header copied verbatim from `design.md` (WHAT THIS FILE IS / WHY NO supply_id-quantity / WHY
      amount IS NULLABLE / WHY end_date IS INCLUSIVE / WRITE ORDERING FOR CLOSE-AND-REPLACE / WHY NO
      INDEX ON start_date / WHY ON DELETE SET NULL / WHY NOT AN RLS POLICY / REVERSIBILITY), followed by
      the standard "not run against any live database" caveat.
- [x] 1.2 `lib/types/index.ts` — added `RecurringExpenseFrequency` (`"weekly" | "biweekly" |
      "monthly"`) and `RecurringExpense` interface immediately after `Expense` (which ends at `:384`
      pre-edit), inside the `// === EXPENSES ===` section, with a doc-comment explaining the deliberate
      absence of `supply_id`/`quantity`. Added `recurring_expense_id: string | null` inside `Expense`,
      beside `supply_id`/`quantity` (right after `quantity`, before `created_at`), with its own doc
      comment. No runtime exports added — file stays a pure type barrel.
- [x] 1.3 `npx tsc --noEmit` — ran before and after, both counted directly (not assumed from any prior
      document). **Before: 52 total output lines / 36 `error TS` lines. After: 52 total output lines /
      36 `error TS` lines. Identical — zero new errors, zero fixed errors.**

## Files changed

| File | Change |
|---|---|
| `scripts/047-recurring-expenses.sql` | new — `recurring_expenses` table + `expenses.recurring_expense_id` FK column + partial index, full WHY-banner header |
| `lib/types/index.ts` | modified — added `RecurringExpenseFrequency` + `RecurringExpense` after `Expense`; added `recurring_expense_id: string \| null` inside `Expense` |
| `.atl/sdd/gastos-recurrentes/tasks.md` | modified — marked 1.1, 1.2, 1.3 as `[x]` |

## Deviations from design/tasks

None. The migration DDL, RLS policy, constraints, and index match `design.md`'s Migrations section and
D1/D2/D11 verbatim. The types additions match the Interfaces/Contracts section verbatim, including
placement (immediately after `Expense`, inside `// === EXPENSES ===`).

One verification note carried over from the launch instructions rather than assumed: the proposal's
claim that `041`–`046` wrap DDL in `BEGIN`/`COMMIT` with an `information_schema`/`pg_tables` pre-flight
is **false** — confirmed directly by reading `scripts/045-expenses.sql` and
`scripts/046-expense-stock-movements.sql`, neither of which opens a transaction or contains a pre-flight
probe. `047` follows their actual style: a long `-- ===` prose banner, then bare DDL, no transaction
wrapper.

## Issues found

None.

## tsc gate result

- Before: `npx tsc --noEmit 2>&1 | wc -l` → **52** (total lines); `... | rg "error TS" | wc -l` → **36**
  (actual error count).
- After (post 047 + types edit): same command → **52** total lines / **36** `error TS` lines.
- Zero new errors introduced by this PR's files. The pre-existing 36 errors are unrelated to
  `scripts/047-recurring-expenses.sql` and `lib/types/index.ts` (not individually re-diffed line-by-line
  against PR1's predecessor apply-progress files, since the count is identical before/after this PR's
  own edits — sufficient to prove no regression from this change).

## Manual QA checklist (Phase 1 — DB-constraint behavior, not vitest-testable; NOT run — no dev DB
available in this environment; pending a real environment)

- [ ] QA1.1 Apply `047` to a throwaway/dev clone (never a live DB). Confirm: invalid `category`
      rejected; `monthly` template with `amount = NULL` rejected; `end_date < start_date` rejected; a
      `weekly` template WITH a non-null `amount` is accepted (D10 — deliberately not forbidden at the
      schema).
- [ ] QA1.2 Confirm no `supply_id`/`quantity` column exists on `recurring_expenses` for any category,
      including `supplies` (D2).
- [ ] QA1.3 Confirm `expenses.recurring_expense_id` is nullable, FK-constrained, `ON DELETE SET NULL`
      (verify via `information_schema`, not by deleting a template yet — no template can exist until
      PR4).
- [ ] QA1.4 Rehearse the rollback order on the dev clone: drop the partial index, drop the column, drop
      the table — confirm it succeeds in that order and fails if attempted out of order.

## Notes for orchestrator

- Working tree change is committed (single commit, conventional commits, in Spanish, no AI
  attribution) per explicit instructions — this differs from the `finanzas-gastos-recetas` PR1
  precedent (left uncommitted), because this launch's instructions explicitly required "terminá con UN
  commit."
- No push performed.
- `app/(dashboard)/combos/page.tsx` (pre-existing WIP, unrelated to this change) was left untouched.
- PR2 through PR5 (Phases 2-5 of `tasks.md`) are NOT started. Next recommended step: PR2
  (`lib/utils/calendar-date.ts` + `lib/services/recurring-expenses.ts`, strict TDD), base = this PR.
