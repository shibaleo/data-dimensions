import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";

export type TargetMaster = RpcData<typeof rpc.api.v1["target-masters"]["$get"]>["data"][number];

export const targetMasterKeys = {
  all: ["target-masters"] as const,
  byService: (serviceId: string) =>
    [...targetMasterKeys.all, "by-service", serviceId] as const,
};

export function useTargetMasters(serviceId: string | undefined) {
  return useQuery({
    queryKey: serviceId ? targetMasterKeys.byService(serviceId) : targetMasterKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1["target-masters"].$get({ query: { service_id: serviceId! } }),
      );
      return json.data;
    },
    enabled: !!serviceId,
    staleTime: 30_000,
  });
}

export function useCreateTargetMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      service_id: string;
      name: string;
      parent_id?: string | null;
      valid_from?: string;
    }) => unwrap(rpc.api.v1["target-masters"].$post({ json: payload })),
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: targetMasterKeys.byService(vars.service_id) }),
  });
}

export function useUpdateTargetMaster(serviceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      payload: { name?: string; parent_id?: string | null; valid_from?: string };
    }) =>
      unwrap(
        rpc.api.v1["target-masters"][":id"].$put({
          param: { id: vars.id },
          json: vars.payload,
        }),
      ),
    onSuccess: () =>
      serviceId &&
      qc.invalidateQueries({ queryKey: targetMasterKeys.byService(serviceId) }),
  });
}

export function useReorderTargetMasters(serviceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(rpc.api.v1["target-masters"].reorder.$patch({ json: { ids } })),
    onMutate: async (ids) => {
      if (!serviceId) return;
      const key = targetMasterKeys.byService(serviceId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TargetMaster[]>(key);
      if (previous) {
        const indexMap = new Map(ids.map((id, i) => [id, i]));
        qc.setQueryData(
          key,
          [...previous].sort(
            (a, b) =>
              (indexMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
              (indexMap.get(b.id) ?? Number.MAX_SAFE_INTEGER),
          ),
        );
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (serviceId && ctx?.previous) {
        qc.setQueryData(targetMasterKeys.byService(serviceId), ctx.previous);
      }
    },
    onSettled: () => {
      if (serviceId)
        qc.invalidateQueries({ queryKey: targetMasterKeys.byService(serviceId) });
    },
  });
}

export function useArchiveTargetMaster(serviceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1["target-masters"][":id"].$delete({ param: { id } })),
    onSuccess: () => {
      if (!serviceId) return;
      qc.invalidateQueries({ queryKey: targetMasterKeys.byService(serviceId) });
      // cascade soft delete may have hit mappings
      qc.invalidateQueries({ queryKey: ["mappings", "by-service", serviceId] });
    },
  });
}
