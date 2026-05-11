"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-client";
import type { Service } from "@/hooks/queries/use-service-data";
import { useTargetMasters } from "@/hooks/queries/use-target-masters";
import { useMappings, useCommitMappings } from "@/hooks/queries/use-mappings";
import {
  useSources,
  sourceTypeFor,
  type SourceType,
} from "@/hooks/queries/use-sources";
import { MappingTable } from "./mapping-table";
import { TargetManager } from "./target-manager";
import { useMappingDraft } from "./use-mapping-draft";

interface Props {
  service: Service;
}

const SOURCE_TYPES: SourceType[] = ["projects", "colors", "clients"];

export function MappingEditor({ service }: Props) {
  const [sourceTab, setSourceTab] = useState<SourceType>("projects");

  const sourceType = sourceTypeFor(service.sourceKind, sourceTab);

  const { data: sources = [], isLoading: sourcesLoading, error: sourcesError } =
    useSources(service.code, sourceTab);
  const { data: targets = [], isLoading: targetsLoading } = useTargetMasters(service.id);
  const { data: mappings = [] } = useMappings(service.id);

  const draft = useMappingDraft(mappings);
  const commit = useCommitMappings(service.id);

  // Source 行で target select を変えたとき
  const handleChange = (sourceValue: string, targetId: string | null) => {
    if (targetId === null) {
      draft.removeBySource(sourceType, sourceValue);
      return;
    }
    draft.addOrRepoint(sourceType, sourceValue, targetId);
  };

  const handleCommit = () => {
    if (draft.summary.total === 0) return;
    commit.mutate(
      { service_id: service.id, changes: draft.changes },
      {
        onSuccess: () => {
          toast.success(`${draft.summary.total} 件 確定しました`);
          draft.reset();
        },
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.body.error : "Commit failed"),
      },
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-card">
        <div className="flex gap-1 rounded-md border p-0.5">
          {SOURCE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSourceTab(t)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium transition-colors capitalize",
                sourceTab === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {sourcesError ? (
          <p className="text-sm text-destructive">
            Source 取得失敗: {(sourcesError as Error).message}
          </p>
        ) : null}

        <MappingTable
          sources={sources}
          sourceType={sourceType}
          targets={targets}
          display={draft.display}
          onChange={handleChange}
          loading={sourcesLoading}
        />

        <TargetManager
          serviceId={service.id}
          targets={targets}
          loading={targetsLoading}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-4 py-2 border-t bg-card">
        <span className="text-xs text-muted-foreground">
          draft: +{draft.summary.added} / -{draft.summary.removed} / ~{draft.summary.repointed}
        </span>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={draft.reset}
          disabled={draft.summary.total === 0}
        >
          破棄
        </Button>
        <Button
          size="sm"
          onClick={handleCommit}
          disabled={draft.summary.total === 0 || commit.isPending}
        >
          確定 ({draft.summary.total})
        </Button>
      </div>
    </div>
  );
}
