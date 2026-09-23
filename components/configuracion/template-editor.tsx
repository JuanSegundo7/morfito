"use client";

import { useRef, useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { VariableChips } from "./variable-chips";
import { ORDER_MESSAGE_VARS } from "@/lib/settings/variables";
import { findUnknownPlaceholders, findUsedPlaceholders } from "@/lib/utils/renderTemplate";

interface TemplateEditorProps {
  label: string;
  value: string; // valor GUARDADO (viene de settings)
  defaultTemplate: string; // el de DEFAULT_APP_SETTINGS, para "Restaurar"
  rows: number;
  requiredVars?: string[]; // ej. ["items", "total"] solo para el de whatsapp
  renderPreview: (draftTemplate: string) => string; // inyectada por el padre, ya cerrada sobre settings+SAMPLE_ORDER
  onSave: (newTemplate: string) => void;
  isSaving: boolean;
}

// Settings port from jebbs-dashboard's template-editor.tsx — copied
// verbatim. Its imports already resolve against Phase 1's morfito paths
// (lib/settings/variables.ts, lib/utils/renderTemplate.ts), so no rewiring
// was needed. Keeps its own local `draft` state independent of the
// `forceMount` decision in configuracion/page.tsx — see this component's
// own draft-vs-refetch comment below, which is the real (tour-independent)
// reason page.tsx still forceMounts the Mensajes tab.
export function TemplateEditor({
  label,
  value,
  defaultTemplate,
  rows,
  requiredVars = [],
  renderPreview,
  onSave,
  isSaving,
}: TemplateEditorProps) {
  const [draft, setDraft] = useState(value);
  const [isDirty, setIsDirty] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const knownNames = ORDER_MESSAGE_VARS.map((v) => v.name);

  // No re-sembrar mientras hay cambios sin guardar — si no, un refetch en
  // background (staleTime 5min, refetch on focus) pisaría silenciosamente
  // una plantilla a medio escribir.
  useEffect(() => {
    if (!isDirty) setDraft(value);
  }, [value, isDirty]);

  const handleChange = (next: string) => {
    setDraft(next);
    setIsDirty(true);
  };

  const insertAtCaret = (name: string) => {
    const el = textareaRef.current;
    const insertText = `{{${name}}}`;
    if (!el) {
      handleChange(draft + insertText);
      return;
    }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + insertText + draft.slice(end);
    handleChange(next);
    requestAnimationFrame(() => {
      const caret = start + insertText.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const handleSave = () => {
    const unknown = findUnknownPlaceholders(draft, knownNames);
    if (unknown.length > 0) {
      toast.error(`Variable desconocida: {{${unknown[0]}}}`);
      return;
    }
    const used = new Set(findUsedPlaceholders(draft));
    const missingRequired = requiredVars.filter((v) => !used.has(v));
    if (missingRequired.length > 0) {
      toast.warning(`Guardado, pero la plantilla no incluye {{${missingRequired[0]}}}`);
    }
    onSave(draft);
    setIsDirty(false);
  };

  const handleCancel = () => {
    setDraft(value);
    setIsDirty(false);
  };

  const handleRestore = () => {
    handleChange(defaultTemplate);
  };

  return (
    <div className="space-y-3" data-editor={label}>
      <VariableChips
        id={`configuracion-${label}-chips`}
        template={draft}
        onInsert={insertAtCaret}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Textarea
          id={`configuracion-${label}-textarea`}
          ref={textareaRef}
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          rows={rows}
          spellCheck={false}
          className="font-mono text-callout resize-y"
        />

        <div id={`configuracion-${label}-preview`} className="rounded-lg border bg-secondary/30 p-3">
          <p className="text-caption text-muted-foreground mb-2">Vista previa</p>
          <pre className="whitespace-pre-wrap text-callout font-sans">{renderPreview(draft)}</pre>
        </div>
      </div>

      <div id={`configuracion-${label}-actions`} className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={handleRestore} className="text-muted-foreground">
          Restaurar plantilla original
        </Button>

        {isDirty && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              Guardar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
