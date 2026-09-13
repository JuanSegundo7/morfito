"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Receipt,
  Wallet,
  Percent,
  CalendarIcon,
  PiggyBank,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { useOrdersAnalytics } from "@/lib/hooks/orders/use-orders-history";
import { EXPENSE_CATEGORY_LABELS } from "@/components/finanzas/expense-list";
import { DailyLedger } from "@/components/finanzas/daily-ledger";
import { formatCurrency } from "@/lib/utils/format";
import {
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { ExpenseCategory } from "@/lib/types";

const TZ = "America/Argentina/Buenos_Aires";

type ViewMode = "month" | "week" | "custom";

// The 5 categories in a fixed order, mirroring gastos-tab.tsx's own
// ALL_CATEGORIES — always rendered, $0 when a period has none, never derived
// from which categories happen to have data.
const ALL_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];

/**
 * finanzas-gastos-recetas PR6.
 *
 * DATE-RANGE SELECTOR CHOICE (documented per the task's ask): reuses the
 * FULL /rendimiento pattern (month/week/custom + calendar popover) rather
 * than gastos-tab.tsx's simpler month-only navigator. Reasoning: Resumen
 * calls the exact same `useOrdersAnalytics(selectedDate, viewMode,
 * customRange)` hook /rendimiento calls, which already supports all three
 * view modes — reusing gastos-tab's month-only selector would silently
 * throw away week/custom capability the hook (and therefore this tab) is
 * fully able to use. The local helpers below are a direct, deliberately
 * un-exported duplication of app/(dashboard)/rendimiento/page.tsx's
 * getPeriodLabel/navigate — that file doesn't export them, and this is the
 * same kind of local, page-scoped helper duplication already established
 * between /rendimiento and use-orders-history.ts's own internal date-range
 * math (see that file's getWeekRange/getMonthRange).
 *
 * ZERO MONEY ARITHMETIC ON THE NETREVENUE PATH: every currency figure the
 * stat cards / net revenue card render (`totalRevenue`, `expensesTotal`,
 * `netRevenue`, `commissionTotal`, and the daily chart's `revenue`/
 * `expenses` series) comes straight from `useOrdersAnalytics` — i.e. from
 * `computeNetRevenue`'s single call site. This component never subtracts or
 * adds money into those numbers (see design.md D5).
 *
 * libro-diario PR3: the `<DailyLedger>` card below the daily chart shows the
 * SAME `analytics.netRevenue` field as its "Saldo del período" strip —
 * there is no `ledgerClosingBalance`, no second number (design D6). It is
 * the identical field the "Ingreso neto del período" card above already
 * renders.
 *
 * gastos-recurrentes PR3: the expenses-by-category breakdown is no longer a
 * local aggregation. It used to run its own `useExpenses` + `reduce` here
 * (the same pattern gastos-tab.tsx's own `totalsByCategory` used to), which
 * meant the category cards and the Gastos tile above them were one
 * arithmetic change away from disagreeing — exactly the bug this PR's design
 * (D7) closes. `analytics.expensesByCategory` is now computed once, inside
 * `useOrdersAnalytics`, from the same one-off + prorated-recurring sources
 * that feed `expensesTotal`, so the two can never drift apart.
 * `EXPENSE_CATEGORY_LABELS` is imported from expense-list.tsx, not
 * redeclared, per the task's explicit instruction.
 */
export function ResumenTab() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarSelection, setCalendarSelection] = useState<DateRange | undefined>(undefined);

  const resolvedCustomRange = viewMode === "custom" ? customRange : undefined;

  const { data: analytics, isLoading } = useOrdersAnalytics(
    selectedDate,
    viewMode,
    resolvedCustomRange,
  );

  const periodLabel = getPeriodLabel(selectedDate, viewMode, customRange);

  const handlePrev = () => setSelectedDate((d) => navigate(d, viewMode, -1));
  const handleNext = () => setSelectedDate((d) => navigate(d, viewMode, 1));

  const dailyChartConfig = {
    revenue: { label: "Ingresos", color: "var(--color-chart-2)" },
    expenses: { label: "Gastos", color: "var(--status-canceled)" },
  };

  const statCards = [
    {
      title: "Ingresos",
      value: analytics?.totalRevenue ?? 0,
      change: analytics?.revenueChange ?? 0,
      icon: DollarSign,
      color: "var(--color-chart-2)",
    },
    {
      title: "Gastos",
      value: analytics?.expensesTotal ?? 0,
      change: analytics?.expensesChange ?? 0,
      icon: Receipt,
      color: "var(--status-canceled)",
      invertChange: true,
    },
    {
      title: "Neto",
      value: analytics?.netRevenue ?? 0,
      change: analytics?.netRevenueChange ?? 0,
      icon: Wallet,
      color: "var(--color-chart-1)",
    },
  ];

  return (
    <div className="flex-1 overflow-auto p-6 md:px-0 space-y-4">
      {/* Period selector — same shape as /rendimiento's (see doc comment) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-xl border bg-card p-1 w-fit">
          <Button
            variant={viewMode === "month" ? "default" : "ghost"}
            size="sm"
            className="rounded-lg h-8 px-4 text-sm"
            onClick={() => setViewMode("month")}
          >
            Mes
          </Button>
          <Button
            variant={viewMode === "week" ? "default" : "ghost"}
            size="sm"
            className="rounded-lg h-8 px-4 text-sm"
            onClick={() => setViewMode("week")}
          >
            Semana
          </Button>
          <Button
            variant={viewMode === "custom" ? "default" : "ghost"}
            size="sm"
            className="rounded-lg h-8 px-4 text-sm"
            onClick={() => setViewMode("custom")}
          >
            Custom
          </Button>
        </div>

        {viewMode === "custom" ? (
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="bg-card h-9 gap-2 text-sm font-medium">
                <CalendarIcon className="h-4 w-4" />
                {customRange ? periodLabel : "Elegir rango de fechas"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={calendarSelection}
                onSelect={(range) => {
                  setCalendarSelection(range);
                  if (range?.from && range?.to) {
                    setCustomRange({ from: range.from, to: range.to });
                    setCalendarOpen(false);
                  }
                }}
                numberOfMonths={2}
                disabled={{ after: new Date() }}
              />
            </PopoverContent>
          </Popover>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrev} className="bg-card h-9 w-9">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-52 text-center text-sm font-medium capitalize tabular-nums">
              {periodLabel}
            </span>
            <Button variant="outline" size="icon" onClick={handleNext} className="bg-card h-9 w-9">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* 1) Summary row — Ingresos / Gastos / Neto stat cards, plus the
          informational Comisiones tile kept visually distinct below. */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const isPositive = card.invertChange ? card.change <= 0 : card.change >= 0;
          return (
            <StatTile
              key={card.title}
              icon={card.icon}
              color={card.color}
              value={formatCurrency(card.value)}
              label={card.title}
              loading={isLoading}
              delta={
                <div
                  className={`flex items-center gap-0.5 text-caption ${
                    isPositive ? "text-[var(--status-paid)]" : "text-[var(--status-canceled)]"
                  }`}
                >
                  {isPositive ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  <span>{Math.abs(card.change).toFixed(1)}%</span>
                </div>
              }
            />
          );
        })}

        {/* Comisiones — deliberately NOT a StatTile with a period delta: it
            is informational context ("así se repartió"), already deducted
            from Ingresos above, never a second subtraction. Framed with a
            muted badge instead of the up/down indicator the other 3 tiles
            use, so it reads as context, not as a fourth money movement. */}
        <Card className="p-0">
          <CardContent className="p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Percent className="h-4 w-4" />
              <span className="text-caption">Comisiones</span>
            </div>
            <span className="text-amount tabular-nums font-semibold">
              {isLoading ? <Skeleton className="h-6 w-20" /> : formatCurrency(analytics?.commissionTotal ?? 0)}
            </span>
            <Badge variant="secondary" className="w-fit text-caption2">
              Informativo — ya descontado de Ingresos
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* 4) Net revenue card — dedicated, larger emphasis on Neto beyond its
          stat tile above (QA6.6 requires this as its own element). */}
      <Card className="ios-glass bg-card">
        <CardContent className="p-6 flex flex-col items-center gap-1 text-center">
          <span className="flex items-center gap-2 text-muted-foreground text-subheadline">
            <PiggyBank className="h-4 w-4" />
            Ingreso neto del período
          </span>
          {isLoading ? (
            <Skeleton className="h-10 w-40" />
          ) : (
            <span className="text-display tabular-nums font-bold">
              {formatCurrency(analytics?.netRevenue ?? 0)}
            </span>
          )}
          <span className="text-caption text-muted-foreground">
            Ingresos {formatCurrency(analytics?.totalRevenue ?? 0)} − Gastos{" "}
            {formatCurrency(analytics?.expensesTotal ?? 0)}
          </span>
        </CardContent>
      </Card>

      {/* 2) Expenses-by-category breakdown */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle>Gastos por categoría</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {ALL_CATEGORIES.map((c) => (
                <Skeleton key={c} className="h-16" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {ALL_CATEGORIES.map((category) => (
                <div
                  key={category}
                  className="flex flex-col gap-1 rounded-xl bg-muted/40 px-4 py-3"
                >
                  <span className="text-caption text-muted-foreground">
                    {EXPENSE_CATEGORY_LABELS[category]}
                  </span>
                  <span className="text-subheadline font-semibold tabular-nums">
                    {formatCurrency(analytics?.expensesByCategory?.[category] ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3) Daily income-vs-expenses chart — reads analytics.dailyData's
          revenue/expenses fields directly, no arithmetic performed here. */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Ingresos vs. gastos por día</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !analytics?.dailyData ? (
            <Skeleton className="h-75 w-full" />
          ) : (
            <ChartContainer config={dailyChartConfig} className="h-75 w-full">
              <BarChart data={analytics.dailyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip
                  content={({ payload }) => {
                    if (!payload?.length) return null;
                    const row = payload[0].payload;
                    const d = row.date as string;
                    const label = new Date(d + "T12:00:00").toLocaleDateString("es-AR", {
                      day: "2-digit",
                      month: "short",
                    });
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-subheadline min-w-[160px]">
                        <p className="font-medium mb-2">{label}</p>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: "var(--color-chart-2)" }}
                          />
                          <span className="text-muted-foreground">Ingresos</span>
                          <span className="ml-auto font-medium tabular-nums">
                            {formatCurrency(row.revenue as number)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: "var(--status-canceled)" }}
                          />
                          <span className="text-muted-foreground">Gastos</span>
                          <span className="ml-auto font-medium tabular-nums">
                            {formatCurrency(row.expenses as number)}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="revenue"
                  fill="var(--color-chart-2)"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="expenses"
                  fill="var(--status-canceled)"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* 5) Libro diario — read-only debit/credit ledger. `key={periodLabel}`
          resets its internal pagination when the period changes (design
          D5); `closingBalance` is fed the same netRevenue field the card
          above already renders. */}
      <DailyLedger
        key={periodLabel}
        entries={analytics?.ledger}
        closingBalance={analytics?.netRevenue ?? 0}
        isLoading={isLoading}
      />
    </div>
  );
}

// Local duplication of /rendimiento's getPeriodLabel/navigate — that file
// doesn't export them; see this file's top doc comment for why duplicating
// them here (rather than inventing a third selector) is the deliberate
// choice.
function getPeriodLabel(date: Date, mode: ViewMode, customRange?: { from: Date; to: Date }): string {
  if (mode === "custom" && customRange) {
    const fmt = (d: Date) =>
      d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
    return `${fmt(customRange.from)} – ${fmt(customRange.to)}`;
  }
  if (mode === "month") {
    return date.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: TZ });
  }
  const arDate = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
  const day = arDate.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(arDate);
  monday.setDate(arDate.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", timeZone: TZ });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function navigate(date: Date, mode: ViewMode, direction: -1 | 1): Date {
  const newDate = new Date(date);
  if (mode === "month") {
    newDate.setMonth(newDate.getMonth() + direction);
  } else {
    newDate.setDate(newDate.getDate() + direction * 7);
  }
  return newDate;
}
