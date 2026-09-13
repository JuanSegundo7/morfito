// A sidebar item is hidden when its service key is present here AND that
// service is not active for this project. Items/hrefs not listed here are
// always shown (when the account has access at all). "/plan" must NEVER be
// gated — it's how a blocked/limited account manages their situation.
export const SERVICE_NAV_HREFS: Record<string, string[]> = {
  web_orders: ["/", "/historial", "/clientes", "/rendimiento"],
  // stock_management gates both /finanzas (finanzas-gastos-recetas PR1 —
  // the new shell, see app/(dashboard)/finanzas) and /insumos (cost/stock/
  // finance porting, PR1 — see scripts/041-supplies-and-stock.sql). /insumos
  // now just server-redirects to /finanzas?tab=insumos
  // (app/(dashboard)/insumos/page.tsx), but it must stay listed here too:
  // without it, an ungated user hitting the old /insumos bookmark would
  // sail straight through middleware (only /finanzas is gated), reach the
  // redirect() call, land on /finanzas?tab=insumos, and only THEN get
  // bounced to /plan on the next request — a confusing two-hop redirect
  // instead of being stopped at /insumos directly.
  // ticket_printing still gates no visible page — it's a background service.
  stock_management: ["/finanzas", "/insumos"],
};
