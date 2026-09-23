import { describe, expect, it } from "vitest";
import {
  DEFAULT_TICKET_LAYOUT,
  normalizeTicketLayout,
  type TicketLayout,
} from "./ticket-layout";

const ids = (l: TicketLayout) => l.blocks.map((b) => b.id);

describe("DEFAULT_TICKET_LAYOUT", () => {
  it("reproduces the current print order with every block enabled", () => {
    expect(ids(DEFAULT_TICKET_LAYOUT)).toEqual([
      "schedule",
      "logo",
      "header",
      "customer",
      "items",
      "totals",
      "delivery_payment",
      "notes",
      "footer",
    ]);
    expect(DEFAULT_TICKET_LAYOUT.blocks.every((b) => b.enabled)).toBe(true);
    expect(DEFAULT_TICKET_LAYOUT.version).toBe(1);
  });
});

describe("normalizeTicketLayout", () => {
  it.each([null, undefined, 42, "x", [], {}, { version: 1 }])(
    "returns the default for garbage (%j)",
    (raw) => {
      expect(normalizeTicketLayout(raw)).toEqual(DEFAULT_TICKET_LAYOUT);
    },
  );

  it("drops unknown ids and dedupes, keeping the first occurrence", () => {
    const out = normalizeTicketLayout({
      version: 1,
      blocks: [
        { id: "notes", enabled: true },
        { id: "bogus", enabled: true },
        { id: "notes", enabled: false },
      ],
    });
    expect(ids(out).filter((i) => i === "notes")).toHaveLength(1);
    expect(ids(out)).not.toContain("bogus");
    expect(out.blocks[0]).toMatchObject({ id: "notes", enabled: true });
  });

  it("appends missing known blocks as disabled at the end", () => {
    const out = normalizeTicketLayout({
      version: 1,
      blocks: [{ id: "footer", enabled: true }],
    });
    expect(out.blocks).toHaveLength(DEFAULT_TICKET_LAYOUT.blocks.length);
    expect(out.blocks[0].id).toBe("footer");
    for (const b of out.blocks.slice(1)) expect(b.enabled).toBe(false);
  });

  it("coerces option types and falls back to defaults", () => {
    const out = normalizeTicketLayout({
      version: 1,
      blocks: [
        { id: "items", enabled: true, options: { showPrices: "no", largeText: false, junk: 1 } },
        { id: "footer", enabled: true, options: { text: 123 } },
      ],
    });
    const items = out.blocks.find((b) => b.id === "items")!;
    expect(items.options?.showPrices).toBe(true); // wrong type -> default
    expect(items.options?.largeText).toBe(false);
    expect(items.options).not.toHaveProperty("junk");
    const footer = out.blocks.find((b) => b.id === "footer")!;
    expect(footer.options?.text).toBe("Gracias por elegirnos!");
  });

  it("coerces a non-boolean enabled to true only when strictly true", () => {
    const out = normalizeTicketLayout({
      version: 1,
      blocks: [{ id: "logo", enabled: "yes" }],
    });
    expect(out.blocks[0].enabled).toBe(false);
  });

  it("is idempotent", () => {
    const once = normalizeTicketLayout({
      version: 1,
      blocks: [{ id: "totals", enabled: false }],
    });
    expect(normalizeTicketLayout(once)).toEqual(once);
  });
});
