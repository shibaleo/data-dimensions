"use client";

import { useParams } from "@tanstack/react-router";
import { useServices } from "@/hooks/queries/use-service-data";
import { usePageTitle } from "@/lib/page-context";
import { MappingEditor } from "./_components/mapping-editor";

export default function ServiceDetailPage() {
  const { serviceCode } = useParams({ strict: false }) as { serviceCode: string };
  const { data: services = [], isLoading } = useServices();
  const service = services.find((s) => s.code === serviceCode);

  usePageTitle(service?.name ?? serviceCode);

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading...</p>;
  }
  if (!service) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Service「{serviceCode}」が見つかりません。
      </p>
    );
  }

  return <MappingEditor service={service} />;
}
