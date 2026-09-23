"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  BLOCK_META,
  DEFAULT_TICKET_LAYOUT,
  type TicketBlock,
  type TicketLayout,
  type TicketOptionValue,
} from "@/lib/settings/ticket-layout";

interface TicketEditorProps {
  value: TicketLayout; // saved layout (already normalized)
  onSave: (layout: TicketLayout) => void;
  isSaving: boolean;
  // Notifies the parent of the working draft so the preview can follow it.
  onDraftChange?: (draft: TicketLayout) => void;
}

interface BlockRowProps {
  block: TicketBlock;
  onToggle: (enabled: boolean) => void;
  onOption: (key: string, value: TicketOptionValue) => void;
}

function BlockRow({ block, onToggle, onOption }: BlockRowProps) {
  const meta = BLOCK_META[block.id];
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const hasOptions = meta.options.length > 0;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-lg border bg-card",
        isDragging && "relative z-10 shadow-lg",
        !block.enabled && "opacity-70",
      )}
    >
      <Collapsible open={open && hasOptions} onOpenChange={setOpen}>
        <div className="flex items-center gap-2 p-2">
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-secondary active:cursor-grabbing"
            aria-label={`Mover el bloque ${meta.label}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="font-medium leading-tight">{meta.label}</p>
            <p className="text-caption text-muted-foreground">{meta.description}</p>
          </div>

          {hasOptions && (
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={`Opciones de ${meta.label}`}
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
          )}

          <Switch
            checked={block.enabled}
            onCheckedChange={onToggle}
            aria-label={`Imprimir ${meta.label}`}
          />
        </div>

        {hasOptions && (
          <CollapsibleContent>
            <div className="space-y-3 border-t px-4 py-3">
              {meta.options.map((def) => {
                const id = `ticket-${block.id}-${def.key}`;
                const current = block.options?.[def.key] ?? def.default;
                if (def.type === "text") {
                  return (
                    <div key={def.key} className="space-y-1.5">
                      <Label htmlFor={id}>{def.label}</Label>
                      <Input
                        id={id}
                        value={typeof current === "string" ? current : ""}
                        maxLength={80}
                        onChange={(e) => onOption(def.key, e.target.value)}
                      />
                    </div>
                  );
                }
                return (
                  <div key={def.key} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={current === true}
                      onCheckedChange={(checked) => onOption(def.key, checked === true)}
                    />
                    <Label htmlFor={id} className="font-normal">
                      {def.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </li>
  );
}

export function TicketEditor({ value, onSave, isSaving, onDraftChange }: TicketEditorProps) {
  const [draft, setDraft] = useState<TicketLayout>(value);
  const [isDirty, setIsDirty] = useState(false);

  // Do not re-seed while there are unsaved edits, otherwise a background
  // refetch would silently overwrite a layout that is halfway through being
  // edited (same rule as template-editor.tsx).
  useEffect(() => {
    if (!isDirty) setDraft(value);
  }, [value, isDirty]);

  useEffect(() => {
    onDraftChange?.(draft);
  }, [draft, onDraftChange]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => draft.blocks.map((b) => b.id), [draft.blocks]);

  const update = (blocks: TicketBlock[]) => {
    setDraft({ ...draft, blocks });
    setIsDirty(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id as TicketBlock["id"]);
    const to = ids.indexOf(over.id as TicketBlock["id"]);
    if (from < 0 || to < 0) return;
    update(arrayMove(draft.blocks, from, to));
  };

  const patchBlock = (id: TicketBlock["id"], patch: (b: TicketBlock) => TicketBlock) =>
    update(draft.blocks.map((b) => (b.id === id ? patch(b) : b)));

  const handleRestore = () => {
    setDraft(DEFAULT_TICKET_LAYOUT);
    setIsDirty(true);
  };

  const handleSave = () => {
    onSave(draft);
    setIsDirty(false);
  };

  const handleCancel = () => {
    setDraft(value);
    setIsDirty(false);
  };

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {draft.blocks.map((block) => (
              <BlockRow
                key={block.id}
                block={block}
                onToggle={(enabled) => patchBlock(block.id, (b) => ({ ...b, enabled }))}
                onOption={(key, v) =>
                  patchBlock(block.id, (b) => ({ ...b, options: { ...b.options, [key]: v } }))
                }
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRestore}
          className="text-muted-foreground"
        >
          Restaurar predeterminado
        </Button>

        <div className="flex items-center gap-2">
          {isDirty && (
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
              Cancelar
            </Button>
          )}
          <Button type="button" size="sm" onClick={handleSave} disabled={!isDirty || isSaving}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
