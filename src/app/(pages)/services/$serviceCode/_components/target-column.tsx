"use client";

import { forwardRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, X, Pencil, Check, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCreateTargetMaster,
  useUpdateTargetMaster,
  useArchiveTargetMaster,
  type TargetMaster,
} from "@/hooks/queries/use-target-masters";
import { ApiError } from "@/lib/api-client";

interface Props {
  serviceId: string;
  targets: TargetMaster[];
  selectedTargetId: string | null;
  rowRefs: React.MutableRefObject<Map<string, HTMLElement | null>>;
  onSelect: (targetId: string) => void;
  onReorder: (ids: string[]) => void;
  loading?: boolean;
}

interface SortableRowProps {
  target: TargetMaster;
  isSelected: boolean;
  isEditing: boolean;
  editingName: string;
  setEditingName: (v: string) => void;
  onSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onArchive: () => void;
  rowRefs: React.MutableRefObject<Map<string, HTMLElement | null>>;
}

function SortableRow({
  target: t,
  isSelected,
  isEditing,
  editingName,
  setEditingName,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onArchive,
  rowRefs,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: t.id });

  const setRef = (el: HTMLElement | null) => {
    setNodeRef(el);
    rowRefs.current.set(t.id, el);
  };

  return (
    <div
      ref={setRef}
      data-target-id={t.id}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className={cn(
        "group relative flex items-center gap-1.5 rounded-md border bg-card px-1.5 text-sm transition-colors h-9",
        isSelected
          ? "border-primary ring-1 ring-primary"
          : "border-border hover:bg-accent",
      )}
    >
      {/* port dot at left edge center (line endpoint) */}
      <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 size-2 rounded-full bg-muted-foreground/70 ring-2 ring-background pointer-events-none" />
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Drag handle"
      >
        <GripVertical className="size-3.5" />
      </button>

      {isEditing ? (
        <>
          <Input
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            className="h-7 text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={onSaveEdit}
            className="size-6 inline-flex items-center justify-center rounded hover:bg-accent"
          >
            <Check className="size-3.5" />
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 truncate cursor-pointer" onClick={onSelect}>
            {t.name}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
            className="size-6 inline-flex items-center justify-center rounded hover:bg-accent opacity-0 group-hover:opacity-100"
            title="Rename"
          >
            <Pencil className="size-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onArchive();
            }}
            className="size-6 inline-flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100"
            title="Archive"
          >
            <X className="size-3" />
          </button>
        </>
      )}
    </div>
  );
}

export const TargetColumn = forwardRef<HTMLDivElement, Props>(function TargetColumn(
  { serviceId, targets, selectedTargetId, rowRefs, onSelect, onReorder, loading },
  ref,
) {
  const create = useCreateTargetMaster();
  const update = useUpdateTargetMaster(serviceId);
  const archive = useArchiveTargetMaster(serviceId);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const ids = targets.map((t) => t.id);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const newOrder = arrayMove(targets, oldIdx, newIdx);
    onReorder(newOrder.map((t) => t.id));
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    create.mutate(
      { service_id: serviceId, name },
      {
        onSuccess: () => setNewName(""),
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.body.error : "Create failed"),
      },
    );
  };

  const handleSaveRename = () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;
    update.mutate(
      { id: editingId, payload: { name } },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditingName("");
        },
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.body.error : "Rename failed"),
      },
    );
  };

  return (
    <div ref={ref} className="space-y-1">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
        Target ({targets.length})
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground px-2">Loading...</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {targets.map((t) => (
                <SortableRow
                  key={t.id}
                  target={t}
                  isSelected={selectedTargetId === t.id}
                  isEditing={editingId === t.id}
                  editingName={editingName}
                  setEditingName={setEditingName}
                  onSelect={() => onSelect(t.id)}
                  onStartEdit={() => {
                    setEditingId(t.id);
                    setEditingName(t.name);
                  }}
                  onSaveEdit={handleSaveRename}
                  onCancelEdit={() => {
                    setEditingId(null);
                    setEditingName("");
                  }}
                  onArchive={() => {
                    if (confirm(`Archive "${t.name}"?`)) archive.mutate(t.id);
                  }}
                  rowRefs={rowRefs}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex items-center gap-1 px-1 pt-2">
        <Input
          placeholder="新規ターゲット名..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          className="h-8 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleCreate}
          disabled={!newName.trim() || create.isPending}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  );
});
