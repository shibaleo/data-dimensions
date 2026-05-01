"use client";

import { forwardRef, useState } from "react";
import { Plus, X, Pencil, Check } from "lucide-react";
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
  loading?: boolean;
}

export const TargetColumn = forwardRef<HTMLDivElement, Props>(function TargetColumn(
  { serviceId, targets, selectedTargetId, rowRefs, onSelect, loading },
  ref,
) {
  const create = useCreateTargetMaster();
  const update = useUpdateTargetMaster(serviceId);
  const archive = useArchiveTargetMaster(serviceId);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    create.mutate(
      { service_id: serviceId, name },
      {
        onSuccess: () => {
          setNewName("");
        },
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
        targets.map((t) => {
          const isSelected = selectedTargetId === t.id;
          const isEditing = editingId === t.id;
          return (
            <div
              key={t.id}
              ref={(el) => {
                rowRefs.current.set(t.id, el);
              }}
              data-target-id={t.id}
              className={cn(
                "group flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm transition-colors",
                isSelected
                  ? "border-primary ring-1 ring-primary"
                  : "border-border hover:bg-accent",
              )}
            >
              {isEditing ? (
                <>
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveRename();
                      if (e.key === "Escape") {
                        setEditingId(null);
                        setEditingName("");
                      }
                    }}
                    className="h-7 text-sm"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveRename}
                    className="size-6 inline-flex items-center justify-center rounded hover:bg-accent"
                  >
                    <Check className="size-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <span
                    className="flex-1 truncate cursor-pointer"
                    onClick={() => onSelect(t.id)}
                  >
                    {t.name}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(t.id);
                      setEditingName(t.name);
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
                      if (confirm(`Archive "${t.name}"?`)) {
                        archive.mutate(t.id);
                      }
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
        })
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
