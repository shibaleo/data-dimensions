import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type Service = RpcData<typeof rpc.api.v1.services.$get>["data"][number];

export const serviceKeys = {
  all: ["service-data"] as const,
  services: () => [...serviceKeys.all, "services"] as const,
};

export function useServices() {
  return useQuery({
    queryKey: serviceKeys.services(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1.services.$get());
      return json.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useInvalidateServiceData() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: serviceKeys.all });
  }, [qc]);
}

/* ── Service mutations ── */

export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { code?: string; name: string; source_kind: string }) =>
      unwrap(rpc.api.v1.services.$post({ json: payload })),
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceKeys.services() }),
  });
}

export function useUpdateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      payload: { code?: string; name?: string; source_kind?: string; sort_order?: number };
    }) =>
      unwrap(
        rpc.api.v1.services[":id"].$put({
          param: { id: vars.id },
          json: vars.payload,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceKeys.services() }),
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.services[":id"].$delete({ param: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceKeys.services() }),
  });
}

export function useReorderServices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(rpc.api.v1.services.reorder.$patch({ json: { ids } })),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: serviceKeys.services() });
      const previous = qc.getQueryData<Service[]>(serviceKeys.services());
      if (previous) {
        const indexMap = new Map(ids.map((id, i) => [id, i]));
        qc.setQueryData(
          serviceKeys.services(),
          [...previous].sort(
            (a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0),
          ),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(serviceKeys.services(), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: serviceKeys.services() }),
  });
}
