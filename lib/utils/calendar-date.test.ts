import { describe, expect, it } from "vitest";
import {
  arTodayStr,
  daysInMonth,
  dayBefore,
  formatCalendarDate,
  parseCalendarDate,
} from "@/lib/utils/calendar-date";

/**
 * gastos-recurrentes, PR2a. These four cases are the whole reason this module
 * exists: `parseCalendarDate`/`formatCalendarDate` must produce and consume
 * UTC-midnight dates with NO time-of-day component, unlike
 * `use-orders-history.ts`'s `arDateToUTC`, which deliberately bakes in a +3h
 * AR offset. If that offset ever leaked into this module, proration math
 * would silently off-by-one at month/year boundaries.
 */

describe("parseCalendarDate / formatCalendarDate", () => {
  it("2.1: round-trips '2026-01-31' at UTC midnight, no +3h offset", () => {
    const date = parseCalendarDate("2026-01-31");

    expect(date.getUTCHours()).toBe(0);
    expect(formatCalendarDate(date)).toBe("2026-01-31");
  });

  it("2.1: round-trips '2026-02-28' at UTC midnight", () => {
    const date = parseCalendarDate("2026-02-28");

    expect(date.getUTCHours()).toBe(0);
    expect(formatCalendarDate(date)).toBe("2026-02-28");
  });

  it("2.1: round-trips '2024-02-29' (leap year) at UTC midnight", () => {
    const date = parseCalendarDate("2024-02-29");

    expect(date.getUTCHours()).toBe(0);
    expect(formatCalendarDate(date)).toBe("2024-02-29");
  });
});

describe("daysInMonth", () => {
  it("2.2: returns the correct day count per month, 1-indexed (month 1 = January)", () => {
    expect(daysInMonth(2026, 1)).toBe(31); // January
    expect(daysInMonth(2026, 2)).toBe(28); // February, non-leap
    expect(daysInMonth(2024, 2)).toBe(29); // February, leap year
    expect(daysInMonth(2026, 4)).toBe(30); // April
    expect(daysInMonth(2026, 12)).toBe(31); // December
  });
});

describe("dayBefore", () => {
  it("2.3: returns the calendar day before a leap-year February 29th boundary", () => {
    expect(dayBefore("2026-03-01")).toBe("2026-02-28");
    expect(dayBefore("2024-03-01")).toBe("2024-02-29");
  });

  it("2.3: crosses a year boundary correctly", () => {
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
  });
});

describe("arTodayStr", () => {
  it("2.4: 02:00Z is still 'yesterday' in Argentina (UTC-3)", () => {
    expect(arTodayStr(new Date("2026-09-10T02:00:00Z"))).toBe("2026-09-09");
  });

  it("2.4: 03:00Z is already 'today' in Argentina (UTC-3)", () => {
    expect(arTodayStr(new Date("2026-09-10T03:00:00Z"))).toBe("2026-09-10");
  });
});
