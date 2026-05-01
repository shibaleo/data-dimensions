import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type { MappingChange } from "@/lib/schemas/mapping";

export type Mapping = RpcData<typeof rpc.api.v1.mappings.$get>["data"][number];

export const mappingKeys = {
  all: ["mappings"] as const,
  byService: (serviceId: string) =>
    [...mappingKeys.all, "by-service", serviceId] as const,
};

export function useMappings(serviceId: string | undefined) {
  return useQuery({
    queryKey: serviceId ? mappingKeys.byService(serviceId) : mappingKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.mappings.$get({ query: { service_id: serviceId! } }),
      );
      return json.data;
    },
    enabled: !!serviceId,
    staleTime: 30_000,
  });
}

export function useCommitMappings(serviceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      service_id: string;
      valid_from?: string;
      changes: MappingChange[];
    }) => unwrap(rpc.api.v1.mappings.commit.$post({ json: payload })),
    onSuccess: () => {
      if (!serviceId) return;
      qc.invalidateQueries({ queryKey: mappingKeys.byService(serviceId) });
    },
  });
}
