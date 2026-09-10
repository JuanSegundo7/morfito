"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ExpenseCategory, Order, RecurringExpense } from "@/lib/types";
import { computeNetRevenue } from "@/lib/services/finance-summary";
import { parseCalendarDate } from "@/lib/utils/calendar-date";
import { expandRecurringExpensesDaily, sumAllocations } from "@/lib/services/recurring-expenses";

const TZ = "America/Argentina/Buenos_Aires";

// Get YYYY-MM-DD in Argentina timezone
function toArDateStr(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: TZ }); // en-CA = YYYY-MM-DD
}

// Build UTC Date from an Argentina local date string (YYYY-MM-DD)
// Argentina is always UTC-3 (no DST)
function arDateToUTC(dateStr: string, endOfDay = false): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const h = endOfDay ? 23 : 0;
  const m = endOfDay ? 59 : 0;
  const s = endOfDay ? 59 : 0;
  return new Date(Date.UTC(year, month - 1, day, h + 3, m, s));
}

function getMonthRange(date: Date): { start: Date; end: Date } {
  const ar = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
  const year = ar.getFullYear();
  const month = ar.getMonth();
  const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDate = new Date(year, month + 1, 0).getDate();
  const lastDay = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`;
  return { start: arDateToUTC(firstDay, false), end: arDateToUTC(lastDay, true) };
}

function getWeekRange(date: Date): { start: Date; end: Date } {
  const ar = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
  const day = ar.getDay(); // 0=Sun
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(ar);
  monday.setDate(ar.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: arDateToUTC(fmt(monday), false), end: arDateToUTC(fmt(sunday), true) };
}

export type ViewMode = "month" | "week" | "custom";

// ─── useOrdersHistory ───────────────────────────────────────────────────────

export function useOrdersHistory(dateRange: { from: Date; to: Date }) {
  const supabase = createClient();

  return useQuery({
    queryKey: [
      "orders-history",
      dateRange.from.toISOString(),
      dateRange.to.toISOString(),
    ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          customer:customers (
            id,
            name,
            phone,
            customer_addresses (
              id,
              label,
              address,
              notes,
              is_default
            )
          ),
          order_items (
            id,
            burger_name,
            quantity,
            unit_price,
            subtotal,
            customizations,
            order_item_modifiers (
              id,
              name_snapshot,
              quantity,
              unit_price,
              subtotal
            )
          )
        `
        )
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Order[];
    },
  });
}

// ─── useOrdersAnalytics ─────────────────────────────────────────────────────

// libro-diario PR1 (D4) — named because THREE consumers now read this array:
// Resumen's bar chart, /rendimiento's AreaChart, and
// lib/services/daily-ledger.ts's builder (PR2).
/**
 * One day of analytics.
 *
 * INVARIANT (libro-diario rule 8): `revenue === ordersRevenue +
 * externalRevenue`, ALWAYS. `revenue` predates the split and is what both
 * charts bind to; it keeps the same name and the same value forever. The two
 * new fields exist so the ledger can emit "Ventas" and "Ingresos externos"
 * as separate rows — they are additive, and nothing that read this array
 * before needs to change.
 */
export interface DailyAnalyticsPoint {
  date: string;
  day: number;
  orders: number;
  /** Completed orders' total_amount for this day. */
  ordersRevenue: number;
  /** external_income.amount for this day. */
  externalRevenue: number;
  /** ordersRevenue + externalRevenue. Do not write it from anywhere else. */
  revenue: number;
  canceled: number;
  expenses: number;
}

export function useOrdersAnalytics(
  selectedDate: Date,
  viewMode: ViewMode = "month",
  customRange?: { from: Date; to: Date }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["orders-analytics", selectedDate.toISOString(), viewMode, customRange?.from?.toISOString(), customRange?.to?.toISOString()],
    queryFn: async () => {
      let start: Date, end: Date;
      if (viewMode === "custom" && customRange) {
        const fromStr = customRange.from.toLocaleDateString("en-CA", { timeZone: TZ });
        const toStr = customRange.to.toLocaleDateString("en-CA", { timeZone: TZ });
        start = arDateToUTC(fromStr, false);
        end = arDateToUTC(toStr, true);
      } else if (viewMode === "week") {
        ({ start, end } = getWeekRange(selectedDate));
      } else {
        ({ start, end } = getMonthRange(selectedDate));
      }

      // Previous period
      let prevStart: Date, prevEnd: Date;
      if (viewMode === "custom" && customRange) {
        const duration = end.getTime() - start.getTime();
        prevEnd = new Date(start.getTime() - 1);
        prevStart = new Date(prevEnd.getTime() - duration);
      } else if (viewMode === "week") {
        const ms7 = 7 * 24 * 60 * 60 * 1000;
        prevStart = new Date(start.getTime() - ms7);
        prevEnd = new Date(end.getTime() - ms7);
      } else {
        const ar = new Date(selectedDate.toLocaleString("en-US", { timeZone: TZ }));
        const prevMonthDate = new Date(ar.getFullYear(), ar.getMonth() - 1, 1);
        ({ start: prevStart, end: prevEnd } = getMonthRange(prevMonthDate));
      }

      // Compute date strings for external_income (DATE column, no TZ conversion needed)
      const startDateStr = toArDateStr(start);
      const endDateStr = toArDateStr(end);
      const prevStartDateStr = toArDateStr(prevStart);
      const prevEndDateStr = toArDateStr(prevEnd);

      const [
        { data: current, error: e1 },
        { data: prev, error: e2 },
        { data: canceled, error: e3 },
        { data: prevCanceled, error: e4 },
        { data: externalIncome, error: e5 },
        { data: prevExternalIncome, error: e6 },
        { data: expenses, error: e7 },
        { data: prevExpenses, error: e8 },
        { data: recurringTemplates, error: e9 },
      ] = await Promise.all([
        supabase
          .from("orders")
          .select("total_amount, commission_amount, updated_at")
          .eq("status", "completed")
          .gte("updated_at", start.toISOString())
          .lte("updated_at", end.toISOString()),
        supabase
          .from("orders")
          .select("total_amount, updated_at")
          .eq("status", "completed")
          .gte("updated_at", prevStart.toISOString())
          .lte("updated_at", prevEnd.toISOString()),
        supabase
          .from("orders")
          .select("id, updated_at")
          .eq("status", "canceled")
          .gte("updated_at", start.toISOString())
          .lte("updated_at", end.toISOString()),
        supabase
          .from("orders")
          .select("id, updated_at")
          .eq("status", "canceled")
          .gte("updated_at", prevStart.toISOString())
          .lte("updated_at", prevEnd.toISOString()),
        supabase
          .from("external_income")
          .select("date, amount")
          .gte("date", startDateStr)
          .lte("date", endDateStr),
        supabase
          .from("external_income")
          .select("date, amount")
          .gte("date", prevStartDateStr)
          .lte("date", prevEndDateStr),
        // finanzas-gastos-recetas PR6 — same DATE-column treatment as
        // external_income above (expenses.date is a DATE, not a timestamp).
        // gastos-recurrentes PR3 — `category` added so expensesByCategory
        // can sum the one-off side; the previous-period query below stays
        // total-only, it never needs a category breakdown.
        // libro-diario PR1 — `description` added so the ledger can show each
        // one-off expense's own concept text instead of only its category.
        supabase
          .from("expenses")
          .select("date, amount, category, description")
          .gte("date", startDateStr)
          .lte("date", endDateStr),
        supabase
          .from("expenses")
          .select("date, amount")
          .gte("date", prevStartDateStr)
          .lte("date", prevEndDateStr),
        // gastos-recurrentes PR3 — NO DATE FILTER, on purpose (rule 5). A
        // template with start_date in 2024 and end_date IS NULL still
        // contributes to this month; any gte("start_date", …) would silently
        // drop exactly the long-running templates this feature exists for.
        // Overlap is decided inside expandRecurringExpensesDaily, never in
        // SQL. The table holds single-digit rows.
        supabase
          .from("recurring_expenses")
          .select("id, amount, category, description, frequency, start_date, end_date"),
      ]);

      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      if (e4) throw e4;
      if (e5) throw e5;
      if (e6) throw e6;
      if (e7) throw e7;
      if (e8) throw e8;
      if (e9) throw e9;

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

      const currentCompleted = current?.length || 0;
      const prevCompleted = prev?.length || 0;
      const currentCanceled = canceled?.length || 0;
      const prevCanceled2 = prevCanceled?.length || 0;
      const currentOrdersRevenue =
        current?.reduce((acc, o) => acc + Number(o.total_amount), 0) || 0;
      const currentExternalRevenue =
        externalIncome?.reduce((acc, e) => acc + Number(e.amount), 0) || 0;
      const currentRevenue = currentOrdersRevenue + currentExternalRevenue;

      const prevOrdersRevenue =
        prev?.reduce((acc, o) => acc + Number(o.total_amount), 0) || 0;
      const prevExternalRevenue =
        prevExternalIncome?.reduce((acc, e) => acc + Number(e.amount), 0) || 0;
      const prevRevenue = prevOrdersRevenue + prevExternalRevenue;

      // finanzas-gastos-recetas PR6 — see lib/services/finance-summary.ts's
      // header for why commissionTotal is informational-only and never an
      // operand of netRevenue (orders.total_amount is already net of
      // commission, per use-create-order.ts).
      const oneOffExpensesTotal =
        expenses?.reduce((acc, e) => acc + Number(e.amount), 0) || 0;
      const expensesTotal = oneOffExpensesTotal + sumAllocations(recurringAllocations);
      const prevOneOffExpensesTotal =
        prevExpenses?.reduce((acc, e) => acc + Number(e.amount), 0) || 0;
      // Rule 7: prorate the PREVIOUS period too, or the first period with a
      // template manufactures a phantom expensesChange/netRevenueChange spike.
      const prevExpensesTotal = prevOneOffExpensesTotal + prevRecurringTotal;
      const commissionTotal =
        current?.reduce((acc, o) => acc + Number(o.commission_amount), 0) || 0;

      const netRevenueResult = computeNetRevenue({
        totalRevenue: currentRevenue,
        expensesTotal,
        commissionTotalInformational: commissionTotal,
      });

      // gastos-recurrentes PR3 (rule 9 / D7) — computed ONCE here, from BOTH
      // sources, and returned. resumen-tab.tsx and gastos-tab.tsx read this
      // instead of each running their own useExpenses + reduce; that
      // duplication is why the category cards were one arithmetic change away
      // from disagreeing with the Gastos tile above them.
      // Object literal, not Object.fromEntries: TS checks all five keys
      // against ExpenseCategory here, so a sixth category is a compile error
      // at this line.
      const expensesByCategory: Record<ExpenseCategory, number> = {
        supplies: 0,
        services: 0,
        salaries: 0,
        rent: 0,
        other: 0,
      };
      for (const e of expenses ?? []) {
        expensesByCategory[e.category as ExpenseCategory] += Number(e.amount);
      }
      for (const allocation of recurringAllocations) {
        expensesByCategory[allocation.category] += allocation.amount;
      }

      const msPerDay = 1000 * 60 * 60 * 24;
      const daysInPeriod =
        Math.round((end.getTime() - start.getTime()) / msPerDay);
      const daysInPrev =
        Math.round((prevEnd.getTime() - prevStart.getTime()) / msPerDay);

      const avgOrdersPerDay = currentCompleted / daysInPeriod;
      const prevAvgOrdersPerDay = prevCompleted / daysInPrev;
      const avgTicket =
        currentCompleted > 0 ? currentRevenue / currentCompleted : 0;
      const prevAvgTicket =
        prevCompleted > 0 ? prevRevenue / prevCompleted : 0;

      const pct = (curr: number, p: number) =>
        p > 0 ? ((curr - p) / p) * 100 : 0;

      // Group completed by AR local date
      // libro-diario PR1 (D9) — `revenue` is REMOVED from this accumulator.
      // It used to be written by both the orders loop and the external-income
      // loop below; now each writes its own field, and `revenue` is
      // reconstructed exactly once at the dailyData.push() site below, so it
      // can never drift from its two parts.
      const dailyMap: Record<string, { orders: number; ordersRevenue: number; externalRevenue: number; canceled: number; expenses: number }> = {};
      for (const o of current || []) {
        const key = toArDateStr(new Date(o.updated_at));
        if (!dailyMap[key]) dailyMap[key] = { orders: 0, ordersRevenue: 0, externalRevenue: 0, canceled: 0, expenses: 0 };
        dailyMap[key].orders++;
        dailyMap[key].ordersRevenue += Number(o.total_amount);
      }
      // Group canceled by AR local date
      for (const o of canceled || []) {
        const key = toArDateStr(new Date(o.updated_at));
        if (!dailyMap[key]) dailyMap[key] = { orders: 0, ordersRevenue: 0, externalRevenue: 0, canceled: 0, expenses: 0 };
        dailyMap[key].canceled++;
      }
      // Add external income to daily revenue (date is already YYYY-MM-DD in AR time)
      for (const e of externalIncome || []) {
        const key = e.date;
        if (!dailyMap[key]) dailyMap[key] = { orders: 0, ordersRevenue: 0, externalRevenue: 0, canceled: 0, expenses: 0 };
        dailyMap[key].externalRevenue += Number(e.amount);
      }
      // Group expenses by their own DATE column (date is already YYYY-MM-DD
      // in AR time, same shape as external_income above) — feeds Resumen's
      // daily income-vs-expenses chart. Never netted against revenue here;
      // that's computeNetRevenue's job on the aggregate totals only.
      for (const e of expenses || []) {
        const key = e.date;
        if (!dailyMap[key]) dailyMap[key] = { orders: 0, ordersRevenue: 0, externalRevenue: 0, canceled: 0, expenses: 0 };
        dailyMap[key].expenses += Number(e.amount);
      }
      // Rule 8: the per-day allocations must land in dailyData too, not just
      // in the aggregate, or Resumen's "Ingresos vs. gastos por día" chart
      // silently disagrees with the Gastos tile directly above it. Keys align
      // exactly: allocation.date is formatCalendarDate over [startDateStr,
      // endDateStr], and the gap-fill loop below walks the same string range
      // via toArDateStr.
      for (const allocation of recurringAllocations) {
        const key = allocation.date;
        if (!dailyMap[key]) dailyMap[key] = { orders: 0, ordersRevenue: 0, externalRevenue: 0, canceled: 0, expenses: 0 };
        dailyMap[key].expenses += allocation.amount;
      }

      // Fill all days in range
      const dailyData: DailyAnalyticsPoint[] = [];
      const cursor = new Date(start);
      while (cursor <= end) {
        const key = toArDateStr(cursor);
        const dayNum = parseInt(key.split("-")[2], 10);
        // libro-diario PR1 (D9) — NOT a third accumulator. `revenue` is read
        // by resumen-tab.tsx's bar chart AND /rendimiento's "Ingresos por
        // día" AreaChart (page.tsx:624, 636). Same name, same value as before
        // this PR, reconstructed in ONE expression so it cannot drift from
        // its two parts.
        const ordersRevenue = dailyMap[key]?.ordersRevenue || 0;
        const externalRevenue = dailyMap[key]?.externalRevenue || 0;
        dailyData.push({
          date: key,
          day: dayNum,
          orders: dailyMap[key]?.orders || 0,
          ordersRevenue,
          externalRevenue,
          revenue: ordersRevenue + externalRevenue,
          canceled: dailyMap[key]?.canceled || 0,
          expenses: dailyMap[key]?.expenses || 0,
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      return {
        completedOrders: currentCompleted,
        completedOrdersChange: pct(currentCompleted, prevCompleted),
        revenueChange: pct(currentRevenue, prevRevenue),
        avgOrdersPerDay,
        avgOrdersPerDayChange: pct(avgOrdersPerDay, prevAvgOrdersPerDay),
        avgTicket,
        avgTicketChange: pct(avgTicket, prevAvgTicket),
        canceledOrders: currentCanceled,
        canceledOrdersChange: pct(currentCanceled, prevCanceled2),
        dailyData,
        // finanzas-gastos-recetas PR6 — spread of computeNetRevenue's result
        // (totalRevenue/expensesTotal/commissionTotal/netRevenue) plus the
        // period-over-period deltas via the same `pct` helper every other
        // metric above already uses. No signature change to this hook:
        // these are additive fields /rendimiento simply doesn't consume.
        ...netRevenueResult,
        expensesByCategory,
        expensesChange: pct(expensesTotal, prevExpensesTotal),
        netRevenueChange: pct(
          netRevenueResult.netRevenue,
          prevRevenue - prevExpensesTotal,
        ),
      };
    },
  });
}

// ─── useMonthlyComparison ───────────────────────────────────────────────────

export function useMonthlyComparison() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["monthly-comparison"],
    queryFn: async () => {
      const arNow = new Date(
        new Date().toLocaleString("en-US", { timeZone: TZ })
      );
      const months: { month: string; orders: number; revenue: number }[] = [];

      for (let i = 2; i >= 0; i--) {
        const monthDate = new Date(
          arNow.getFullYear(),
          arNow.getMonth() - i,
          1
        );
        const { start, end } = getMonthRange(monthDate);

        const { data, error } = await supabase
          .from("orders")
          .select("total_amount")
          .eq("status", "completed")
          .gte("updated_at", start.toISOString())
          .lte("updated_at", end.toISOString());

        if (error) throw error;

        const raw = monthDate.toLocaleDateString("es-AR", {
          month: "short",
          timeZone: TZ,
        });
        months.push({
          month: raw.charAt(0).toUpperCase() + raw.slice(1),
          orders: data?.length || 0,
          revenue:
            data?.reduce((acc, o) => acc + Number(o.total_amount), 0) || 0,
        });
      }

      return months;
    },
  });
}

// ─── useTopBurgers ──────────────────────────────────────────────────────────

export interface TopBurger {
  id: string;
  name: string;
  image_url: string | null;
  totalSold: number;
  totalRevenue: number;
  rank: number;
}

export function useTopBurgers(
  selectedDate: Date,
  viewMode: ViewMode = "month",
  customRange?: { from: Date; to: Date }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["top-burgers", selectedDate.toISOString(), viewMode, customRange?.from?.toISOString(), customRange?.to?.toISOString()],
    queryFn: async (): Promise<TopBurger[]> => {
      let start: Date, end: Date;
      if (viewMode === "custom" && customRange) {
        const fromStr = customRange.from.toLocaleDateString("en-CA", { timeZone: TZ });
        const toStr = customRange.to.toLocaleDateString("en-CA", { timeZone: TZ });
        start = arDateToUTC(fromStr, false);
        end = arDateToUTC(toStr, true);
      } else if (viewMode === "week") {
        ({ start, end } = getWeekRange(selectedDate));
      } else {
        ({ start, end } = getMonthRange(selectedDate));
      }

      // Completed order IDs in range
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id")
        .eq("status", "completed")
        .gte("updated_at", start.toISOString())
        .lte("updated_at", end.toISOString());

      if (ordersError) throw ordersError;
      if (!orders || orders.length === 0) return [];

      const orderIds = orders.map((o) => o.id);

      // order_items uses burger_name (text) — consistent with existing useOrdersHistory select
      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select("burger_name, quantity, unit_price, subtotal")
        .in("order_id", orderIds);

      if (itemsError) throw itemsError;
      if (!items || items.length === 0) return [];

      // Aggregate by burger_name
      const burgerMap: Record<
        string,
        { totalSold: number; totalRevenue: number }
      > = {};
      for (const item of items) {
        const key = item.burger_name;
        if (!key) continue;
        if (!burgerMap[key]) burgerMap[key] = { totalSold: 0, totalRevenue: 0 };
        burgerMap[key].totalSold += item.quantity;
        burgerMap[key].totalRevenue += Number(
          item.subtotal ?? item.unit_price * item.quantity
        );
      }

      // Fetch image_url from products table by name (non-addon products only,
      // matching the old `burgers` compat view's WHERE is_addon = FALSE).
      const burgerNames = Object.keys(burgerMap);
      const { data: burgerRows } = await supabase
        .from("products")
        .select("id, name, image_url")
        .eq("is_addon", false)
        .in("name", burgerNames);

      const imageMap: Record<string, { id: string; image_url: string | null }> =
        {};
      for (const b of burgerRows || []) {
        imageMap[b.name] = { id: b.id, image_url: b.image_url };
      }

      return burgerNames
        .map((name) => ({
          id: imageMap[name]?.id ?? name,
          name,
          image_url: imageMap[name]?.image_url ?? null,
          totalSold: burgerMap[name].totalSold,
          totalRevenue: burgerMap[name].totalRevenue,
          rank: 0,
        }))
        .sort((a, b) => b.totalSold - a.totalSold)
        .slice(0, 5)
        .map((b, i) => ({ ...b, rank: i + 1 }));
    },
  });
}

// ─── useProductStats ─────────────────────────────────────────────────────────

export interface ProductStats {
  totalBurgers: number;
  totalMedallones: number;
  totalFries: number;
  totalSides: number;
  totalCombos: number;
  totalDrinks: number;
}

export function useProductStats(
  selectedDate: Date,
  viewMode: ViewMode = "month",
  customRange?: { from: Date; to: Date }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["product-stats", selectedDate.toISOString(), viewMode, customRange?.from?.toISOString(), customRange?.to?.toISOString()],
    queryFn: async (): Promise<ProductStats> => {
      let start: Date, end: Date;
      if (viewMode === "custom" && customRange) {
        const fromStr = customRange.from.toLocaleDateString("en-CA", { timeZone: TZ });
        const toStr = customRange.to.toLocaleDateString("en-CA", { timeZone: TZ });
        start = arDateToUTC(fromStr, false);
        end = arDateToUTC(toStr, true);
      } else if (viewMode === "week") {
        ({ start, end } = getWeekRange(selectedDate));
      } else {
        ({ start, end } = getMonthRange(selectedDate));
      }

      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id")
        .eq("status", "completed")
        .gte("updated_at", start.toISOString())
        .lte("updated_at", end.toISOString());

      if (ordersError) throw ordersError;
      if (!orders || orders.length === 0)
        return { totalBurgers: 0, totalMedallones: 0, totalFries: 0, totalSides: 0, totalCombos: 0, totalDrinks: 0 };

      const orderIds = orders.map((o) => o.id);

      // Embed order_item_modifiers inside the order_items query to avoid a
      // second request with thousands of UUIDs in the URL (which hits
      // PostgREST URL limits).
      //
      // Phase 4 (scripts/030-order-items-cutover.sql): order_items.burger_id/
      // extra_id are gone, replaced by a single product_id + the `kind`
      // discriminator. Since burger-derived and addon-derived rows now share
      // ONE product_id -> products(id) FK (instead of two separate FKs to
      // two separate compat views), there is only one possible embed target
      // here — `products(...)` — instead of the old `burgers(...)`/
      // `extras(...)` pair. Same for order_item_modifiers' embedded
      // `products(...)` (was `extras(...)` off order_item_extras.extra_id).
      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select("quantity, product_id, kind, combo_id, customizations, products(default_meat_quantity, default_fries_quantity, legacy_extra_category), order_item_modifiers(quantity, products(legacy_extra_category))")
        .in("order_id", orderIds);

      if (itemsError) throw itemsError;

      let totalBurgers = 0, totalMedallones = 0, totalFries = 0, totalSides = 0, totalCombos = 0, totalDrinks = 0;

      for (const item of items ?? []) {
        if (item.kind === "addon") {
          // Standalone product item (fries, sides, drink, etc. ordered as main item)
          const product = item.products as unknown as { legacy_extra_category: string | null } | null;
          const category = product?.legacy_extra_category;
          if (category === "extra") totalMedallones += item.quantity;
          else if (category === "fries") totalFries += item.quantity;
          else if (category === "sides") totalSides += item.quantity;
          else if (category === "drink") totalDrinks += item.quantity;
        } else if (item.kind === "combo") {
          // Combo item — parse customizations JSON to get per-burger meatCount and friesQuantity
          totalCombos += item.quantity;
          try {
            const slots = JSON.parse(item.customizations ?? "[]") as Array<{
              slotType: string;
              burgers: Array<{ meatCount: number; friesQuantity: number; quantity: number }>;
            }>;
            for (const slot of slots) {
              if (slot.slotType === "burger") {
                for (const burger of slot.burgers) {
                  totalBurgers += burger.quantity * item.quantity;
                  totalMedallones += burger.meatCount * burger.quantity * item.quantity;
                  totalFries += burger.friesQuantity * burger.quantity * item.quantity;
                }
              }
            }
          } catch {
            // customizations malformed — skip
          }
        } else {
          // Regular product item (kind === "product"; product_id can be
          // null if the product was deleted from the menu)
          const product = item.products as unknown as { default_meat_quantity: number; default_fries_quantity: number } | null;
          totalBurgers += item.quantity;
          totalMedallones += item.quantity * (product?.default_meat_quantity ?? 2);
          totalFries += item.quantity * Number(product?.default_fries_quantity ?? 1);
        }

        // Add modifiers added on top of this item (embedded — no second request needed)
        const embeddedModifiers = item.order_item_modifiers as unknown as Array<{ quantity: number; products: { legacy_extra_category: string | null } | { legacy_extra_category: string | null }[] | null }> ?? [];
        for (const modifierItem of embeddedModifiers) {
          const products = modifierItem.products;
          const category = Array.isArray(products) ? products[0]?.legacy_extra_category : products?.legacy_extra_category;
          if (category === "extra") totalMedallones += modifierItem.quantity;
          else if (category === "fries") totalFries += modifierItem.quantity;
          else if (category === "sides") totalSides += modifierItem.quantity;
          else if (category === "drink") totalDrinks += modifierItem.quantity;
        }
      }

      return { totalBurgers, totalMedallones, totalFries, totalSides, totalCombos, totalDrinks };
    },
  });
}

// ─── useRevenueBySource ─────────────────────────────────────────────────────

// Cost/stock/finance porting, PR3: distinct bucket key for orders/external
// income with no configured source — NEVER folded into a named channel
// (a NULL source is meaningfully different from an order that came in
// through a real, named channel with 0 revenue).
export const UNKNOWN_SOURCE_KEY = "unknown";

export interface RevenueBySourceEntry {
  /** Raw `orders.source`/`external_income.source` value, or
   *  `UNKNOWN_SOURCE_KEY` for NULL. Resolve to a human label via
   *  `getOrderSources()` at render time (see order-details-modal.tsx's
   *  identical resolution pattern) — this hook doesn't read
   *  localStorage-backed source config itself, same separation the rest
   *  of this file already keeps (queries are server data only). */
  source: string;
  revenue: number;
  orders: number;
}

/**
 * Groups completed orders' `total_amount` PLUS manually-logged
 * `external_income` entries' `amount` (same "orders + external income"
 * revenue composition useOrdersAnalytics already uses for `totalRevenue`
 * above) by `source`, mirroring useTopBurgers/useProductStats' own
 * "aggregate into a Record, then map to an array" shape. Orders/entries
 * with a NULL source are bucketed under `UNKNOWN_SOURCE_KEY`, never
 * silently merged into a named channel.
 */
export function useRevenueBySource(
  selectedDate: Date,
  viewMode: ViewMode = "month",
  customRange?: { from: Date; to: Date }
) {
  const supabase = createClient();

  return useQuery({
    queryKey: [
      "revenue-by-source",
      selectedDate.toISOString(),
      viewMode,
      customRange?.from?.toISOString(),
      customRange?.to?.toISOString(),
    ],
    queryFn: async (): Promise<RevenueBySourceEntry[]> => {
      let start: Date, end: Date;
      if (viewMode === "custom" && customRange) {
        const fromStr = customRange.from.toLocaleDateString("en-CA", { timeZone: TZ });
        const toStr = customRange.to.toLocaleDateString("en-CA", { timeZone: TZ });
        start = arDateToUTC(fromStr, false);
        end = arDateToUTC(toStr, true);
      } else if (viewMode === "week") {
        ({ start, end } = getWeekRange(selectedDate));
      } else {
        ({ start, end } = getMonthRange(selectedDate));
      }

      const startDateStr = toArDateStr(start);
      const endDateStr = toArDateStr(end);

      const [
        { data: orders, error: ordersError },
        { data: externalIncome, error: externalError },
      ] = await Promise.all([
        supabase
          .from("orders")
          .select("source, total_amount")
          .eq("status", "completed")
          .gte("updated_at", start.toISOString())
          .lte("updated_at", end.toISOString()),
        supabase
          .from("external_income")
          .select("source, amount")
          .gte("date", startDateStr)
          .lte("date", endDateStr),
      ]);

      if (ordersError) throw ordersError;
      if (externalError) throw externalError;

      const bucketMap: Record<string, { revenue: number; orders: number }> = {};

      for (const o of orders ?? []) {
        const key = o.source ?? UNKNOWN_SOURCE_KEY;
        if (!bucketMap[key]) bucketMap[key] = { revenue: 0, orders: 0 };
        bucketMap[key].revenue += Number(o.total_amount);
        bucketMap[key].orders += 1;
      }

      for (const e of externalIncome ?? []) {
        const key = e.source ?? UNKNOWN_SOURCE_KEY;
        if (!bucketMap[key]) bucketMap[key] = { revenue: 0, orders: 0 };
        bucketMap[key].revenue += Number(e.amount);
        // External income entries aren't "orders" — deliberately not
        // incrementing the `orders` count for them, only `revenue`.
      }

      return Object.entries(bucketMap)
        .map(([source, v]) => ({ source, ...v }))
        .sort((a, b) => b.revenue - a.revenue);
    },
  });
}