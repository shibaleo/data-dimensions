"use client";

import { useState } from "react";
import { Plus, X, Pencil, Check } from "lucide-react";
import { toast } from "sonner";
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
  loading?: boolean;
}

/**
 * Target master の CRUD (rename / archive / add)。
 * Reorder は MVP では出さない (Resolved Decisions: 階層後回し相当)。
 */
export function TargetManager({ serviceId, targets, loading }: Props) {
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
    <div className="rounded-md border bg-card p-3 space-y-2">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Targets ({targets.length})
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {targets.map((t) => (
            <div
              key={t.id}
              className="group inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              {editingId === t.id ? (
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
                    className="h-6 text-sm w-32"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveRename}
                    className="size-5 inline-flex items-center justify-center rounded hover:bg-accent"
                  >
                    <Check className="size-3" />
                  </button>
                </>
              ) : (
                <>
                  <span>{t.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(t.id);
                      setEditingName(t.name);
                    }}
                    className="size-5 inline-flex items-center justify-center rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Rename"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Archive "${t.name}"?`)) archive.mutate(t.id);
                    }}
                    className="size-5 inline-flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Archive"
                  >
                    <X className="size-3" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 pt-1">
        <Input
          placeholder="新規ターゲット名..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          className="h-8 text-sm max-w-xs"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleCreate}
          disabled={!newName.trim() || create.isPending}
        >
          <Plus className="size-3.5 mr-1" />
          追加
        </Button>
      </div>
    </div>
  );
}
