"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import type { SourceItem } from "@/hooks/queries/use-sources";
import type { DisplayMapping } from "./use-mapping-draft";

interface Props {
  items: SourceItem[];
  sourceType: string;
  display: DisplayMapping[];
  selectedKey: string | null;
  rowRefs: React.MutableRefObject<Map<string, HTMLElement | null>>;
  onSelect: (sourceValue: string) => void;
  loading?: boolean;
}

function rowKey(sourceType: string, sourceValue: string) {
  return `${sourceType}::${sourceValue}`;
}

export const SourceColumn = forwardRef<HTMLDivElement, Props>(function SourceColumn(
  { items, sourceType, display, selectedKey, rowRefs, onSelect, loading },
  ref,
) {
  const mappedSet = new Set(
    display
      .filter((d) => d.state !== "removed")
      .map((d) => `${d.sourceType}::${d.sourceValue}`),
  );

  return (
    <div ref={ref} className="space-y-1">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
        Source ({items.length})
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground px-2">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground px-2">なし</p>
      ) : (
        items.map((item) => {
          const key = rowKey(sourceType, item.source_value);
          const isMapped = mappedSet.has(key);
          const isSelected = selectedKey === key;
          return (
            <div
              key={key}
              ref={(el) => {
                rowRefs.current.set(key, el);
              }}
              data-source-key={key}
              onClick={() => onSelect(item.source_value)}
              className={cn(
                "flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm cursor-pointer transition-colors",
                isSelected
                  ? "border-primary ring-1 ring-primary"
                  : isMapped
                    ? "border-border hover:bg-accent"
                    : "border-border/60 text-muted-foreground hover:bg-accent",
              )}
            >
              {item.meta?.color && typeof item.meta.color === "string" ? (
                <span
                  className="size-3 rounded-full shrink-0"
                  style={{ backgroundColor: item.meta.color }}
                />
              ) : null}
              <span className="truncate">{item.label}</span>
            </div>
          );
        })
      )}
    </div>
  );
});
