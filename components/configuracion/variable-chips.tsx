"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ORDER_MESSAGE_VARS } from "@/lib/settings/variables";
import { findUsedPlaceholders } from "@/lib/utils/renderTemplate";

interface VariableChipsProps {
  template: string;
  onInsert: (name: string) => void;
  id?: string;
}

// Settings port from jebbs-dashboard's variable-chips.tsx — copied verbatim,
// no morfito-specific changes needed. It already reads the variable catalog
// from lib/settings/variables.ts (Phase 1's ORDER_MESSAGE_VARS, which
// includes linea_comision — see that file's header comment for why it has
// no jebbs equivalent), not a jebbs-shaped list.
export function VariableChips({ template, onInsert, id }: VariableChipsProps) {
  const used = useMemo(() => new Set(findUsedPlaceholders(template)), [template]);

  return (
    <div id={id} className="flex flex-wrap gap-1.5">
      {ORDER_MESSAGE_VARS.map((v) => (
        <button
          key={v.name}
          type="button"
          onClick={() => onInsert(v.name)}
          title={`${v.label} · ej: ${v.example}`}
          className="cursor-pointer"
        >
          <Badge
            variant={used.has(v.name) ? "outline" : "secondary"}
            className={cn(
              "font-mono text-caption cursor-pointer transition-opacity",
              used.has(v.name) && "opacity-60",
            )}
          >
            {`{{${v.name}}}`}
          </Badge>
        </button>
      ))}
    </div>
  );
}
