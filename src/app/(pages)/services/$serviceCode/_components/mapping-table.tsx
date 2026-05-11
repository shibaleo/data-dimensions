"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SourceItem } from "@/hooks/queries/use-sources";
import type { TargetMaster } from "@/hooks/queries/use-target-masters";
import type { DisplayMapping } from "./use-mapping-draft";

const NONE_VALUE = "__none__";

interface Props {
  sources: SourceItem[];
  sourceType: string;
  targets: TargetMaster[];
  display: DisplayMapping[];
  onChange: (sourceValue: string, targetId: string | null) => void;
  loading?: boolean;
}

/**
 * Source × Target のマッピングテーブル。
 * 各 source 行に target の Select。値変更で draft change を dispatch。
 */
export function MappingTable({
  sources,
  sourceType,
  targets,
  display,
  onChange,
  loading,
}: Props) {
  // sourceValue → 現在の display 状態 (baseline + draft 反映後)
  const displayBySource = useMemo(() => {
    const map = new Map<string, DisplayMapping>();
    for (const d of display) {
      if (d.sourceType !== sourceType) continue;
      // removed は除外 (target = null として扱う)
      if (d.state === "removed") continue;
      map.set(d.sourceValue, d);
    }
    return map;
  }, [display, sourceType]);

  const stateBadge = (s: DisplayMapping["state"] | undefined) => {
    switch (s) {
      case "added":
        return <span className="text-[10px] text-emerald-500">+ added</span>;
      case "repointed":
        return <span className="text-[10px] text-amber-500">~ repointed</span>;
      default:
        return null;
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground p-2">Loading...</p>;
  }

  if (sources.length === 0) {
    return <p className="text-sm text-muted-foreground p-2">なし</p>;
  }

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs text-muted-foreground">
          <tr>
            <th className="text-left font-semibold px-3 py-2 w-1/2">Source</th>
            <th className="text-left font-semibold px-3 py-2">Target</th>
            <th className="text-left font-semibold px-3 py-2 w-24">Status</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const d = displayBySource.get(s.source_value);
            const currentTargetId = d?.targetId ?? "";
            const dotColor = sourceType.endsWith("_color")
              ? s.source_value
              : typeof s.meta?.color === "string"
                ? s.meta.color
                : null;
            return (
              <tr
                key={s.source_value}
                className={cn(
                  "border-t border-border",
                  d?.state === "added" && "bg-emerald-500/5",
                  d?.state === "repointed" && "bg-amber-500/5",
                )}
              >
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    {dotColor ? (
                      <span
                        className="size-3 rounded-full shrink-0 border border-border/40"
                        style={{ backgroundColor: dotColor }}
                      />
                    ) : null}
                    <span className="truncate">{s.label}</span>
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <Select
                    value={currentTargetId || NONE_VALUE}
                    onValueChange={(v) =>
                      onChange(s.source_value, v === NONE_VALUE ? null : v)
                    }
                  >
                    <SelectTrigger className="h-8 w-full max-w-xs">
                      <SelectValue placeholder="— なし —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>
                        <span className="text-muted-foreground">— なし —</span>
                      </SelectItem>
                      {targets.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-1.5 text-xs">{stateBadge(d?.state)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
