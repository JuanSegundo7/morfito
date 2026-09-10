"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { EXPENSE_CATEGORY_LABELS } from "@/components/finanzas/expense-list";
import { LEDGER_DIRECTION, type LedgerEntry } from "@/lib/services/daily-ledger";

/**
 * libro-diario PR3. `Card`/`CardHeader`/`CardTitle`/`CardContent` — the same
 * shape every sibling card in resumen-tab.tsx already uses (design D10),
 * NOT jebbs' `CardHeading` (zero consumers anywhere in morfito).
 *
 * Props are exactly `{ entries, closingBalance, isLoading }` — no
 * `periodLabel`/`startDate`/`endDate` (those were export-only in jebbs;
 * export is out of scope here, per D3/D10). Pagination reset lives in the
 * PARENT via `key={periodLabel}` (design D5), not inside this component.
 */
interface DailyLedgerProps {
  entries: LedgerEntry[] | undefined;
  /** THE displayed total. Fed from `analytics.netRevenue` at the mount site
   *  in resumen-tab.tsx — this component never reduces `entries` to
   *  produce it (rule 1, design D6). There is no `entries.reduce(...)`
   *  anywhere in this file. */
  closingBalance: number;
  isLoading: boolean;
}

/** 7 day-groups per page (design D5) — deliberately NOT jebbs' 10. Here
 *  per-day proration (D1) multiplies rows across up to 31 days per
 *  template, so a comparable page holds far more rows at 10 days than
 *  jebbs' 10 days ever did; jebbs pays that row-count cost once per
 *  period, morfito pays it every day. 7 = one week, matching how an
 *  operator reconciling against a bank statement actually thinks, and
 *  caps a realistic page near 50 rows with 4 active templates. */
const DAY_GROUPS_PER_PAGE = 7;

/**
 * D2 gate — the ONLY place this feature resolves Spanish copy or Badge/
 * color logic. `lib/services/daily-ledger.ts` stays a pure, testable-in-
 * node module: it emits `source`/`category`/`concept` as DATA, never a
 * display string. Everything below is derived locally from that data.
 */
function resolveConcept(entry: LedgerEntry): string {
  if (entry.source === "orders") return "Ventas";
  if (entry.source === "external_income") return "Ingresos externos";
  if (entry.concept !== null) return entry.concept;
  // Null-description fallback — only reachable for "expense"/"recurring"
  // rows, both of which always carry a `category` (see LedgerEntry's own
  // doc comment in daily-ledger.ts).
  const category = entry.category;
  return category ? `Gasto (${EXPENSE_CATEGORY_LABELS[category]})` : "Gasto";
}

function formatEntryDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
}

export function DailyLedger({ entries, closingBalance, isLoading }: DailyLedgerProps) {
  const [page, setPage] = useState(1);

  // Group entries by day, preserving the array's own chronological order —
  // never re-sorted here. The builder already walked dailyData in order and
  // sorted within each day (design D7); this is presentation-only grouping.
  const dayGroups = useMemo(() => {
    const groups: { date: string; entries: LedgerEntry[] }[] = [];
    for (const entry of entries ?? []) {
      const last = groups[groups.length - 1];
      if (last && last.date === entry.date) {
        last.entries.push(entry);
      } else {
        groups.push({ date: entry.date, entries: [entry] });
      }
    }
    return groups;
  }, [entries]);

  const totalPages = Math.max(1, Math.ceil(dayGroups.length / DAY_GROUPS_PER_PAGE));
  // Math.min clamping (jebbs' own pattern, kept) — a shrinking result set
  // can never render an empty page mid-session.
  const currentPage = Math.min(page, totalPages);
  const paginatedGroups = dayGroups.slice(
    (currentPage - 1) * DAY_GROUPS_PER_PAGE,
    currentPage * DAY_GROUPS_PER_PAGE,
  );

  if (isLoading) {
    return (
      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Libro diario</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isPositive = closingBalance >= 0;

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Libro diario</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {dayGroups.length === 0 ? (
          <p className="text-subheadline text-muted-foreground text-center py-4">
            Sin movimientos en este período
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedGroups.map((group) =>
                  group.entries.map((entry, idx) => {
                    const direction = LEDGER_DIRECTION[entry.source];
                    return (
                      <TableRow key={`${entry.date}-${idx}`}>
                        <TableCell className="text-muted-foreground">
                          {idx === 0 ? formatEntryDate(group.date) : ""}
                        </TableCell>
                        <TableCell className="max-w-48 truncate">
                          <span className="flex items-center gap-1.5">
                            {resolveConcept(entry)}
                            {entry.source === "recurring" && (
                              <Badge variant="outline" className="text-caption2 px-1.5 py-0 h-4">
                                prorrateo
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell
                          className="text-right tabular-nums"
                          style={{ color: direction === "expense" ? "var(--status-canceled)" : undefined }}
                        >
                          {direction === "expense" ? formatCurrency(entry.amount) : "—"}
                        </TableCell>
                        <TableCell
                          className="text-right tabular-nums"
                          style={{ color: direction === "income" ? "var(--status-paid)" : undefined }}
                        >
                          {direction === "income" ? formatCurrency(entry.amount) : "—"}
                        </TableCell>
                        <TableCell
                          className="text-right tabular-nums font-medium"
                          style={{
                            color: entry.balance >= 0 ? "var(--status-paid)" : "var(--status-canceled)",
                          }}
                        >
                          {formatCurrency(entry.balance)}
                        </TableCell>
                      </TableRow>
                    );
                  }),
                )}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1 px-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-caption text-muted-foreground">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}

        {/* Closing balance strip — rendered ALWAYS, including when there are
            zero rows (jebbs nests it inside the non-empty branch; this
            component does not, because the empty-period edge case requires
            the $0 to show). Sourced from the `closingBalance` prop
            (netRevenue), never re-summed from `entries` (rule 1 / D6). */}
        <div className="flex items-center justify-between rounded-xl material-well px-4 py-3 border-t">
          <span className="text-callout font-medium">Saldo del período</span>
          <span
            className="text-amount numeric"
            style={{ color: isPositive ? "var(--status-paid)" : "var(--status-canceled)" }}
          >
            {formatCurrency(closingBalance)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
