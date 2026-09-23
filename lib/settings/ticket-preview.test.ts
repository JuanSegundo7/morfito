import { describe, expect, it } from "vitest";
import { buildTicketPreview } from "./ticket-preview";
import { SAMPLE_ORDER } from "./sample-order";
import {
  DEFAULT_TICKET_LAYOUT,
  normalizeTicketLayout,
  type TicketBlockId,
  type TicketLayout,
} from "./ticket-layout";

const NAME = "MI NEGOCIO";

function withBlock(
  id: TicketBlockId,
  patch: { enabled?: boolean; options?: Record<string, boolean | string> },
): TicketLayout {
  return {
    ...DEFAULT_TICKET_LAYOUT,
    blocks: DEFAULT_TICKET_LAYOUT.blocks.map((b) =>
      b.id === id ? { ...b, ...patch, options: { ...b.options, ...patch.options } } : b,
    ),
  };
}

const preview = (layout: TicketLayout) => buildTicketPreview(SAMPLE_ORDER, layout, NAME);

describe("buildTicketPreview", () => {
  it("renders every default block, at most 42 columns wide", () => {
    const out = preview(DEFAULT_TICKET_LAYOUT);
    expect(out).toContain(NAME);
    expect(out).toContain("PEDIDO");
    expect(out).toContain("CLIENTE");
    expect(out).toContain("DETALLE");
    expect(out).toContain("TOTAL");
    expect(out).toContain("NOTAS");
    expect(out).toContain("Gracias por elegirnos!");
    for (const line of out.split("\n")) expect(line.length).toBeLessThanOrEqual(42);
  });

  it("omits a disabled block", () => {
    const out = preview(withBlock("notes", { enabled: false }));
    expect(out).not.toContain("NOTAS");
    expect(out).not.toContain("Timbre roto");
  });

  it("respects block order", () => {
    const layout = normalizeTicketLayout({
      version: 1,
      blocks: [
        { id: "footer", enabled: true },
        { id: "header", enabled: true },
      ],
    });
    const out = preview(layout);
    expect(out.indexOf("Gracias por elegirnos!")).toBeLessThan(out.indexOf(NAME));
  });

  it("hides item prices when showPrices is false", () => {
    const on = preview(DEFAULT_TICKET_LAYOUT);
    const off = preview(withBlock("items", { options: { showPrices: false } }));
    expect(on).toContain("Base: $");
    expect(off).not.toContain("Base: $");
    expect(off).toContain("Plato Principal");
  });

  it("leaves only TOTAL when totals showBreakdown is false", () => {
    const out = preview(withBlock("totals", { options: { showBreakdown: false } }));
    expect(out).toContain("TOTAL");
    // Breakdown subtotal is 17.700 in SAMPLE_ORDER; per-item "Subtotal:" lines
    // belong to the items block and are unaffected.
    expect(out).not.toContain("$17.700");
    expect(out).not.toContain("Descuento");
    expect(out).not.toContain("Desc (");
    expect(out).not.toContain("Comisión");
    expect(out).not.toContain("Envio");
  });

  it("uses the custom footer text", () => {
    const out = preview(withBlock("footer", { options: { text: "Hasta pronto" } }));
    expect(out).toContain("Hasta pronto");
    expect(out).not.toContain("Gracias por elegirnos!");
  });

  it("hides the phone and address when the customer options are off", () => {
    const out = preview(
      withBlock("customer", { options: { showPhone: false, showAddress: false } }),
    );
    expect(out).toContain("Juan Pérez");
    expect(out).not.toContain("1234-5678");
    expect(out).not.toContain("Siempreviva");
  });
});
