"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-client";
import type { Service } from "@/hooks/queries/use-service-data";
import {
  useTargetMasters,
  useReorderTargetMasters,
} from "@/hooks/queries/use-target-masters";
import { useMappings, useCommitMappings } from "@/hooks/queries/use-mappings";
import {
  useSources,
  useReorderSources,
  sourceTypeFor,
  type SourceType,
} from "@/hooks/queries/use-sources";
import { SourceColumn } from "./source-column";
import { TargetColumn } from "./target-column";
import { MappingCanvas } from "./mapping-canvas";
import { useMappingDraft } from "./use-mapping-draft";

interface Props {
  service: Service;
}

const SOURCE_TYPES: SourceType[] = ["projects", "colors", "clients"];

export function MappingEditor({ service }: Props) {
  const [sourceTab, setSourceTab] = useState<SourceType>("projects");
  const [selectedSourceValue, setSelectedSourceValue] = useState<string | null>(null);

  const sourceType = sourceTypeFor(service.sourceKind, sourceTab);

  const { data: sources = [], isLoading: sourcesLoading, error: sourcesError } =
    useSources(service.code, sourceTab);
  const { data: targets = [], isLoading: targetsLoading } = useTargetMasters(service.id);
  const { data: mappings = [] } = useMappings(service.id);

  const draft = useMappingDraft(mappings);
  const commit = useCommitMappings(service.id);
  const reorderTargets = useReorderTargetMasters(service.id);
  const reorderSourcesMut = useReorderSources(service.code, sourceTab);

  // current source_type に絞った display
  const displayForType = useMemo(
    () => draft.display.filter((d) => d.sourceType === sourceType),
    [draft.display, sourceType],
  );

  const sourceRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const targetRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedSourceKey = selectedSourceValue
    ? `${sourceType}::${selectedSourceValue}`
    : null;

  const handleSelectSource = (sourceValue: string) => {
    setSelectedSourceValue((prev) => (prev === sourceValue ? null : sourceValue));
  };

  const handleSelectTarget = (targetId: string) => {
    if (!selectedSourceValue) {
      toast.info("先に source を選択してください");
      return;
    }
    draft.addOrRepoint(sourceType, selectedSourceValue, targetId);
    setSelectedSourceValue(null);
  };

  const handleCommit = () => {
    if (draft.summary.total === 0) return;
    commit.mutate(
      {
        service_id: service.id,
        changes: draft.changes,
      },
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
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-card">
        <div className="flex gap-1 rounded-md border p-0.5">
          {SOURCE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setSourceTab(t);
                setSelectedSourceValue(null);
              }}
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

        <div className="flex-1" />

        {selectedSourceValue ? (
          <span className="text-xs text-muted-foreground">
            選択中: <code>{selectedSourceValue}</code> — target をクリック
          </span>
        ) : null}
      </div>

      {/* Body — 2 columns + svg overlay */}
      <div ref={canvasContainerRef} className="relative flex-1 overflow-auto">
        <div className="grid grid-cols-[1fr_minmax(80px,1fr)_1fr] gap-0 p-4">
          <div className="pr-2">
            <SourceColumn
              items={sources}
              sourceType={sourceType}
              display={draft.display}
              selectedKey={selectedSourceKey}
              rowRefs={sourceRefs}
              onSelect={handleSelectSource}
              onReorder={(values) => reorderSourcesMut.mutate(values)}
              loading={sourcesLoading}
            />
            {sourcesError ? (
              <p className="text-xs text-destructive mt-2 px-2">
                Source 取得失敗: {(sourcesError as Error).message}
              </p>
            ) : null}
          </div>
          <div className="pointer-events-none" aria-hidden />
          <div className="pl-2">
            <TargetColumn
              serviceId={service.id}
              targets={targets}
              selectedTargetId={null}
              rowRefs={targetRefs}
              onSelect={handleSelectTarget}
              onReorder={(ids) => reorderTargets.mutate(ids)}
              loading={targetsLoading}
            />
          </div>
        </div>

        <MappingCanvas
          sourceRefs={sourceRefs}
          targetRefs={targetRefs}
          display={displayForType}
          containerRef={canvasContainerRef}
          onRemove={draft.remove}
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
