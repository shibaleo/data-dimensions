"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { DisplayMapping } from "./use-mapping-draft";

interface Props {
  /** key = `${sourceType}::${sourceValue}` */
  sourceRefs: React.MutableRefObject<Map<string, HTMLElement | null>>;
  /** key = targetId */
  targetRefs: React.MutableRefObject<Map<string, HTMLElement | null>>;
  display: DisplayMapping[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  onRemove: (mappingId: string) => void;
}

interface Line {
  key: string;
  d: string;
  midX: number;
  midY: number;
  state: DisplayMapping["state"];
  mappingId: string | null;
}

/**
 * Liam ERD 風の SVG ベジェ曲線で source → target の現在マッピングを描画する。
 * source / target の DOM 座標から線の始点・終点・制御点を計算。
 */
export function MappingCanvas({
  sourceRefs,
  targetRefs,
  display,
  containerRef,
  onRemove,
}: Props) {
  const [lines, setLines] = useState<Line[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    function compute() {
      const container = containerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      setSize({ w: cRect.width, h: cRect.height });

      const next: Line[] = [];
      for (const m of display) {
        const sKey = `${m.sourceType}::${m.sourceValue}`;
        const sEl = sourceRefs.current.get(sKey);
        const tEl = targetRefs.current.get(m.targetId);
        if (!sEl || !tEl) continue;

        const sRect = sEl.getBoundingClientRect();
        const tRect = tEl.getBoundingClientRect();

        const x1 = sRect.right - cRect.left;
        const y1 = sRect.top + sRect.height / 2 - cRect.top;
        const x2 = tRect.left - cRect.left;
        const y2 = tRect.top + tRect.height / 2 - cRect.top;

        // bezier control points: 横方向に offset
        const dx = Math.max(40, (x2 - x1) * 0.4);
        const c1x = x1 + dx;
        const c1y = y1;
        const c2x = x2 - dx;
        const c2y = y2;

        next.push({
          key: m.mappingId ?? `add-${sKey}-${m.targetId}`,
          d: `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`,
          midX: (x1 + x2) / 2,
          midY: (y1 + y2) / 2,
          state: m.state,
          mappingId: m.mappingId,
        });
      }
      setLines(next);
    }

    const schedule = () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(compute);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);

    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, [display, sourceRefs, targetRefs, containerRef]);

  const stateClass = (s: Line["state"]) => {
    switch (s) {
      case "added":
        return "stroke-emerald-500";
      case "repointed":
        return "stroke-amber-500";
      case "removed":
        return "stroke-rose-500/70 [stroke-dasharray:4_3]";
      default:
        return "stroke-muted-foreground/60";
    }
  };

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={size.w}
      height={size.h}
      style={{ width: size.w, height: size.h }}
    >
      {lines.map((l) => (
        <g key={l.key}>
          <path
            d={l.d}
            fill="none"
            strokeWidth={1.5}
            className={cn(stateClass(l.state))}
          />
          {l.mappingId && l.state !== "removed" ? (
            <g
              className="cursor-pointer pointer-events-auto"
              onClick={() => onRemove(l.mappingId!)}
            >
              <circle
                cx={l.midX}
                cy={l.midY}
                r={9}
                className="fill-card stroke-border"
                strokeWidth={1}
              />
              <line
                x1={l.midX - 3}
                y1={l.midY - 3}
                x2={l.midX + 3}
                y2={l.midY + 3}
                className="stroke-muted-foreground"
                strokeWidth={1.5}
              />
              <line
                x1={l.midX + 3}
                y1={l.midY - 3}
                x2={l.midX - 3}
                y2={l.midY + 3}
                className="stroke-muted-foreground"
                strokeWidth={1.5}
              />
            </g>
          ) : null}
        </g>
      ))}
    </svg>
  );
}
