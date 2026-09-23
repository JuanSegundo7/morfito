// Motor de plantillas puro — no sabe nada de pedidos. Sustituye {{var}} y
// suprime líneas cuyos placeholders resolvieron todos a vacío, imitando el
// comportamiento condicional que antes vivía hardcodeado en los template
// literals de formatOrderWhatsapp/formatOrderDelivery (ver lib/settings/defaults.ts).

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function renderTemplate(template: string, vars: Record<string, string>): string {
  const lines = template.split("\n");
  const keptLines = lines.filter((line) => {
    const matches = [...line.matchAll(PLACEHOLDER_RE)];
    if (matches.length === 0) return true; // sin placeholders: siempre se conserva
    return matches.some((m) => (vars[m[1]] ?? "") !== ""); // se conserva si ALGUNO no está vacío
  });
  const substituted = keptLines
    .map((line) => line.replace(PLACEHOLDER_RE, (_, name) => vars[name] ?? ""))
    .join("\n");
  return substituted.trim();
}

export function findUsedPlaceholders(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER_RE)) names.add(m[1]);
  return [...names];
}

// Un placeholder desconocido (typo, variable eliminada) resuelve a "" en
// render — la línea se suprime como cualquier vacío, no crashea. El guardado
// de plantillas ya bloquea typos vía findUnknownPlaceholders, así que un
// placeholder desconocido acá solo pasa si alguien tocó la DB a mano; vaciar
// es más seguro que mostrar "{{clinte}}" literal en un mensaje real al cliente.
export function findUnknownPlaceholders(template: string, known: string[]): string[] {
  const knownSet = new Set(known);
  return findUsedPlaceholders(template).filter((name) => !knownSet.has(name));
}
