"use client";

import { forwardRef } from "react";
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
import { GripVertical } from "lucide-react";
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
  onReorder: (sourceValues: string[]) => void;
  loading?: boolean;
}

function rowKey(sourceType: string, sourceValue: string) {
  return `${sourceType}::${sourceValue}`;
}

interface SortableRowProps {
  item: SourceItem;
  rowKey: string;
  sourceType: string;
  isMapped: boolean;
  isSelected: boolean;
  dotColor: string | null;
  onSelect: () => void;
  rowRefs: React.MutableRefObject<Map<string, HTMLElement | null>>;
}

function SortableRow({
  item,
  rowKey: key,
  sourceType: _sourceType,
  isMapped,
  isSelected,
  dotColor,
  onSelect,
  rowRefs,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: key });

  const setRef = (el: HTMLElement | null) => {
    setNodeRef(el);
    rowRefs.current.set(key, el);
  };

  return (
    <div
      ref={setRef}
      data-source-key={key}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className={cn(
        "group flex items-center gap-1.5 rounded-md border bg-card px-1.5 text-sm transition-colors h-9",
        isSelected
          ? "border-primary ring-1 ring-primary"
          : isMapped
            ? "border-border hover:bg-accent"
            : "border-border/60 text-muted-foreground hover:bg-accent",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground touch-none opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Drag handle"
      >
        <GripVertical className="size-3.5" />
      </button>
      {dotColor ? (
        <span
          className="size-3 rounded-full shrink-0 border border-border/40"
          style={{ backgroundColor: dotColor }}
        />
      ) : null}
      <span className="truncate flex-1 cursor-pointer" onClick={onSelect}>
        {item.label}
      </span>
    </div>
  );
}

export const SourceColumn = forwardRef<HTMLDivElement, Props>(function SourceColumn(
  { items, sourceType, display, selectedKey, rowRefs, onSelect, onReorder, loading },
  ref,
) {
  const mappedSet = new Set(
    display
      .filter((d) => d.state !== "removed")
      .map((d) => `${d.sourceType}::${d.sourceValue}`),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const itemKeys = items.map((i) => rowKey(sourceType, i.source_value));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = itemKeys.indexOf(String(active.id));
    const newIdx = itemKeys.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const newOrder = arrayMove(items, oldIdx, newIdx);
    onReorder(newOrder.map((i) => i.source_value));
  };

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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={itemKeys} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {items.map((item) => {
                const key = rowKey(sourceType, item.source_value);
                const isMapped = mappedSet.has(key);
                const isSelected = selectedKey === key;
                const dotColor = sourceType.endsWith("_color")
                  ? item.source_value
                  : typeof item.meta?.color === "string"
                    ? item.meta.color
                    : null;
                return (
                  <SortableRow
                    key={key}
                    rowKey={key}
                    item={item}
                    sourceType={sourceType}
                    isMapped={isMapped}
                    isSelected={isSelected}
                    dotColor={dotColor}
                    onSelect={() => onSelect(item.source_value)}
                    rowRefs={rowRefs}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
});
