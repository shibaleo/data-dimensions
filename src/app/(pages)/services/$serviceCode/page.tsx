"use client";

import { useParams } from "@tanstack/react-router";
import { useServices } from "@/hooks/queries/use-service-data";
import { usePageTitle } from "@/lib/page-context";

export default function ServiceDetailPage() {
  const { serviceCode } = useParams({ strict: false }) as { serviceCode: string };
  const { data: services = [] } = useServices();
  const service = services.find((s) => s.code === serviceCode);

  usePageTitle(service?.name ?? serviceCode);

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-base font-semibold">
        {service ? service.name : serviceCode}
      </h2>
      <p className="text-sm text-muted-foreground">
        マッピングエディタは Phase 2 で実装予定。
      </p>
      {service && (
        <div className="rounded-md border border-border bg-card p-3 text-sm space-y-1">
          <div>code: {service.code}</div>
          <div>source_kind: {service.sourceKind}</div>
        </div>
      )}
    </div>
  );
}
