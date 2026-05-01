"use client";

import { useState } from "react";
import { ListFilter } from "lucide-react";
import { useService } from "@/hooks/use-service";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function FilterPopover() {
  const { services, currentService, setCurrentService } = useService();
  const isActive = !!currentService;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-accent ${
          isActive ? "text-primary" : "text-muted-foreground/60"
        }`}
      >
        <ListFilter className="size-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Service</DialogTitle>
            <DialogDescription className="sr-only">Select service</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Service</Label>
              <Select
                value={currentService?.id ?? ""}
                onValueChange={(id) => {
                  const s = services.find((s) => s.id === id);
                  if (s) setCurrentService(s);
                }}
              >
                <SelectTrigger>
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
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
