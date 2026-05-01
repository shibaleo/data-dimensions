import { useReducer, useCallback, useMemo } from "react";
import type { Mapping } from "@/hooks/queries/use-mappings";
import type { MappingChange } from "@/lib/schemas/mapping";

/**
 * Draft state for mapping editing — tracks changes from baseline (= current mappings on server).
 *
 * 「確定」操作で changes をまとめて POST /mappings/commit に送る。
 * 同一 mappingId への重複操作は最後の 1 つに正規化する (add → remove は no-op、add → repoint は add の targetId 書き換え)。
 */

export type DraftChange = MappingChange;

export type DraftState = {
  changes: DraftChange[];
};

type Action =
  | {
      type: "add";
      sourceType: string;
      sourceValue: string;
      targetId: string;
    }
  | { type: "remove"; mappingId: string }
  | { type: "repoint"; mappingId: string; newTargetId: string }
  | { type: "reset" };

function reducer(state: DraftState, action: Action): DraftState {
  switch (action.type) {
    case "reset":
      return { changes: [] };
    case "add": {
      // 既存の add で同じ source があれば targetId を書き換え (no duplicate add)
      const idx = state.changes.findIndex(
        (c) =>
          c.type === "add" &&
          c.source_type === action.sourceType &&
          c.source_value === action.sourceValue,
      );
      if (idx >= 0) {
        const next = [...state.changes];
        next[idx] = {
          type: "add",
          source_type: action.sourceType,
          source_value: action.sourceValue,
          target_id: action.targetId,
        };
        return { changes: next };
      }
      return {
        changes: [
          ...state.changes,
          {
            type: "add",
            source_type: action.sourceType,
            source_value: action.sourceValue,
            target_id: action.targetId,
          },
        ],
      };
    }
    case "remove": {
      // 既存 add を remove するなら add ごと削除 (no-op)
      const addIdx = state.changes.findIndex(
        (c) => c.type === "add" && false, // add は mappingId を持たないので別ロジック
      );
      // 既存 repoint があれば破棄して remove に置換
      const filtered = state.changes.filter(
        (c) =>
          !(
            (c.type === "remove" && c.mapping_id === action.mappingId) ||
            (c.type === "repoint" && c.mapping_id === action.mappingId)
          ),
      );
      return {
        changes: [
          ...filtered,
          { type: "remove", mapping_id: action.mappingId },
        ],
      };
    }
    case "repoint": {
      // 既存 repoint があれば targetId 書き換え
      const filtered = state.changes.filter(
        (c) => !(c.type === "repoint" && c.mapping_id === action.mappingId),
      );
      return {
        changes: [
          ...filtered,
          {
            type: "repoint",
            mapping_id: action.mappingId,
            target_id: action.newTargetId,
          },
        ],
      };
    }
  }
}

/**
 * 表示用の "適用後 mapping"。
 * baseline + draft を合成して、各 source に対する "今" のターゲットを示す。
 */
export type DisplayMapping = {
  sourceType: string;
  sourceValue: string;
  targetId: string;
  mappingId: string | null; // null = draft add
  state: "baseline" | "added" | "repointed" | "removed";
};

export function applyDraft(
  baseline: Mapping[],
  changes: DraftChange[],
): DisplayMapping[] {
  const result: DisplayMapping[] = [];
  const removedIds = new Set<string>();
  const repointedMap = new Map<string, string>();
  const adds: Array<{ sourceType: string; sourceValue: string; targetId: string }> = [];

  for (const c of changes) {
    if (c.type === "remove") removedIds.add(c.mapping_id);
    else if (c.type === "repoint") repointedMap.set(c.mapping_id, c.target_id);
    else if (c.type === "add")
      adds.push({
        sourceType: c.source_type,
        sourceValue: c.source_value,
        targetId: c.target_id,
      });
  }

  for (const m of baseline) {
    if (removedIds.has(m.id)) {
      result.push({
        sourceType: m.sourceType,
        sourceValue: m.sourceValue,
        targetId: m.targetId,
        mappingId: m.id,
        state: "removed",
      });
    } else if (repointedMap.has(m.id)) {
      result.push({
        sourceType: m.sourceType,
        sourceValue: m.sourceValue,
        targetId: repointedMap.get(m.id)!,
        mappingId: m.id,
        state: "repointed",
      });
    } else {
      result.push({
        sourceType: m.sourceType,
        sourceValue: m.sourceValue,
        targetId: m.targetId,
        mappingId: m.id,
        state: "baseline",
      });
    }
  }

  for (const a of adds) {
    result.push({
      sourceType: a.sourceType,
      sourceValue: a.sourceValue,
      targetId: a.targetId,
      mappingId: null,
      state: "added",
    });
  }

  return result;
}

export function useMappingDraft(baseline: Mapping[]) {
  const [state, dispatch] = useReducer(reducer, { changes: [] });

  const display = useMemo(
    () => applyDraft(baseline, state.changes),
    [baseline, state.changes],
  );

  const summary = useMemo(() => {
    let added = 0,
      removed = 0,
      repointed = 0;
    for (const c of state.changes) {
      if (c.type === "add") added++;
      else if (c.type === "remove") removed++;
      else if (c.type === "repoint") repointed++;
    }
    return { added, removed, repointed, total: state.changes.length };
  }, [state.changes]);

  return {
    changes: state.changes,
    display,
    summary,
    addOrRepoint: useCallback(
      (sourceType: string, sourceValue: string, targetId: string) => {
        // baseline に同 source が既にあるか?
        const existing = baseline.find(
          (m) => m.sourceType === sourceType && m.sourceValue === sourceValue,
        );
        if (existing) {
          if (existing.targetId === targetId) {
            // 既に同じ target にマップされている → no-op (X アイコンで明示削除を促す)
            return;
          }
          dispatch({
            type: "repoint",
            mappingId: existing.id,
            newTargetId: targetId,
          });
        } else {
          dispatch({
            type: "add",
            sourceType,
            sourceValue,
            targetId,
          });
        }
      },
      [baseline],
    ),
    remove: useCallback((mappingId: string) => {
      dispatch({ type: "remove", mappingId });
    }, []),
    reset: useCallback(() => {
      dispatch({ type: "reset" });
    }, []),
  };
}
