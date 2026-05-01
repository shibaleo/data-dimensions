"use client";

import { Link } from "@/lib/router";
import { useServices } from "@/hooks/queries/use-service-data";
import { usePageTitle } from "@/lib/page-context";

export default function ServicesPage() {
  usePageTitle("Services");
  const { data: services = [], isLoading } = useServices();

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Services</h2>
        {/* TODO: 新規サービス作成ボタン (Phase 2) */}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : services.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No services yet. (Phase 2 で作成 UI を実装予定)
        </p>
      ) : (
        <ul className="space-y-2">
          {services.map((s) => (
            <li key={s.id}>
              <Link
                to="/services/$serviceCode"
                params={{ serviceCode: s.code }}
                className="block rounded-md border border-border bg-card p-3 hover:bg-accent transition-colors"
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.code} · source: {s.sourceKind}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
