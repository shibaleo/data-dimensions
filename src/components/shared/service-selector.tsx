"use client";

import { useService } from "@/hooks/use-service";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ServiceSelector() {
  const { services, currentService, setCurrentService } = useService();

  if (services.length === 0) return null;

  return (
    <Select
      value={currentService?.id ?? ""}
      onValueChange={(id) => {
        const s = services.find((s) => s.id === id);
        if (s) setCurrentService(s);
      }}
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select service" />
      </SelectTrigger>
      <SelectContent>
        {services.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
