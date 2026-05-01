import { useQuery } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type SourceItem = RpcData<
  typeof rpc.api.v1.sources[":serviceCode"][":type"]["$get"]
>["data"][number];

export type SourceType = "projects" | "colors" | "clients";

/**
 * source_type が API のレスポンスに含まれないので mapping 用に対応付け。
 * Toggl 用:
 *   /sources/:code/projects → source_type = 'toggl_project'
 *   /sources/:code/colors   → source_type = 'toggl_color'
 *   /sources/:code/clients  → source_type = 'toggl_client'
 */
export function sourceTypeFor(kind: string, type: SourceType): string {
  return `${kind}_${type === "projects" ? "project" : type === "colors" ? "color" : "client"}`;
}

export const sourceKeys = {
  all: ["sources"] as const,
  byKind: (serviceCode: string, type: SourceType) =>
    [...sourceKeys.all, serviceCode, type] as const,
};

export function useSources(serviceCode: string | undefined, type: SourceType) {
  return useQuery({
    queryKey: serviceCode ? sourceKeys.byKind(serviceCode, type) : sourceKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.sources[":serviceCode"][":type"].$get({
          param: { serviceCode: serviceCode!, type },
        }),
      );
      return json.data;
    },
    enabled: !!serviceCode,
    // sources は外部 raw 由来で頻繁には変わらない
    staleTime: 5 * 60_000,
  });
}
